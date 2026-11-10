/**
 * Central AI Client & Tracing Wrapper for Cartograph
 *
 * Rules per CLAUDE.md & phase-10.md:
 * 1. "One place in the entire codebase that constructs the AI client, wrapped so every call through it is traced."
 * 2. "The cache read happens inside the traced call, not before it. A cache hit must appear in the traces as a recorded run containing no model call."
 * 3. "Model versions are pinned exactly, never to a moving alias, and the model name is part of the cache key."
 * 4. "If tracing is unconfigured, calls still succeed. Make that state visible somewhere."
 */

import OpenAI from "openai";
import { wrapOpenAI } from "langsmith/wrappers";
import { RunTree } from "langsmith";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildFileExplanationPrompt,
  buildFolderExplanationPrompt,
  buildRoleClassificationPrompt,
  PERMITTED_NON_STRUCTURAL_ROLES,
  type NonStructuralRole,
} from "./prompts";
import {
  buildCacheKey,
  computeContentHash,
  getCachedExplanation,
  setCachedExplanation,
  type CacheEntry,
} from "./cache";

// Exact pinned model version — never floating alias
export const PINNED_MODEL = "gemini-3.5-flash-lite";

/**
 * Returns true if LangSmith tracing is fully configured in the environment.
 */
export function isTracingConfigured(): boolean {
  return Boolean(process.env.LANGSMITH_API_KEY && process.env.LANGSMITH_API_KEY.trim() !== "");
}

/**
 * Single place that constructs the OpenAI client.
 */
function createRawClient(): OpenAI {
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (googleApiKey) {
    return new OpenAI({
      apiKey: googleApiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
  }

  if (openaiApiKey) {
    return new OpenAI({
      apiKey: openaiApiKey,
    });
  }

  throw new Error(
    "Missing AI API key. Please configure GOOGLE_API_KEY or OPENAI_API_KEY in .env.local."
  );
}

// Lazy wrapped client instance
let _wrappedClient: ReturnType<typeof wrapOpenAI> | null = null;

function getWrappedClient(): ReturnType<typeof wrapOpenAI> {
  if (!_wrappedClient) {
    _wrappedClient = wrapOpenAI(createRawClient());
  }
  return _wrappedClient;
}

export interface ExplainFileParams {
  supabase: SupabaseClient;
  orgId: string;
  analysisId: string;
  fileId?: string | null;
  filePath: string;
  role?: string;
  lines: number;
  inbound: string[];
  outbound: string[];
  fileContent?: string | null;
  fileHash?: string;
}

export interface ExplainResult {
  content: string;
  cached: boolean;
  contentHash: string;
  model: string;
  tracingActive: boolean;
}

/**
 * Explains a single file in the context of its actual neighbours.
 * Cache read occurs INSIDE the traced call so cache hits appear in LangSmith with 0 tokens.
 */
export async function explainFile(params: ExplainFileParams): Promise<ExplainResult> {
  const {
    supabase,
    orgId,
    analysisId,
    fileId,
    filePath,
    role,
    lines,
    inbound,
    outbound,
    fileContent,
    fileHash,
  } = params;

  const contentHash = fileHash || computeContentHash(fileContent || filePath);
  const cacheKey = buildCacheKey({
    targetType: "file",
    targetPath: filePath,
    contentHash,
    modelName: PINNED_MODEL,
  });

  const tracingActive = isTracingConfigured();
  let run: RunTree | null = null;

  if (tracingActive) {
    try {
      run = new RunTree({
        name: "cartograph.explain_file",
        run_type: "chain",
        inputs: {
          file: filePath,
          role,
          lines,
          inboundCount: inbound.length,
          outboundCount: outbound.length,
          contentHash,
          model: PINNED_MODEL,
        },
        project_name: process.env.LANGSMITH_PROJECT || "cartograph",
      });
      await run.postRun();
    } catch (e) {
      console.warn("[AI] LangSmith postRun failed:", e);
      run = null;
    }
  }

  // 1. Cache read happens INSIDE the traced call
  const cached = await getCachedExplanation({
    supabase,
    analysisId,
    cacheKey,
  });

  if (cached) {
    if (run) {
      try {
        await run.end({
          outputs: { explanation: cached.content, cached: true },
        });
        await run.patchRun();
      } catch (e) {
        console.warn("[AI] LangSmith patchRun failed:", e);
      }
    }

    return {
      content: cached.content,
      cached: true,
      contentHash,
      model: PINNED_MODEL,
      tracingActive,
    };
  }

  // 2. Cache miss: invoke pinned model
  const { system, user } = buildFileExplanationPrompt({
    filePath,
    role,
    lines,
    inbound,
    outbound,
    fileContent,
  });

  const completion = await getWrappedClient().chat.completions.create(
    {
      model: PINNED_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
    },
    run ? { parent: run } : undefined
  );

  const text = completion.choices[0]?.message?.content?.trim() || "No explanation returned.";

  // 3. Write newly generated explanation to cache
  await setCachedExplanation({
    supabase,
    orgId,
    analysisId,
    fileId,
    targetType: "file",
    targetPath: filePath,
    contentHash,
    modelName: PINNED_MODEL,
    content: text,
  });

  if (run) {
    try {
      await run.end({
        outputs: { explanation: text, cached: false },
      });
      await run.patchRun();
    } catch (e) {
      console.warn("[AI] LangSmith patchRun failed:", e);
    }
  }

  return {
    content: text,
    cached: false,
    contentHash,
    model: PINNED_MODEL,
    tracingActive,
  };
}

export interface ExplainFolderParams {
  supabase: SupabaseClient;
  orgId: string;
  analysisId: string;
  folderPath: string;
  containedFiles: Array<{ path: string; role?: string; lines: number; hash?: string }>;
  inbound: string[];
  outbound: string[];
}

/**
 * Explains a folded folder: what is in here, and why does so much point at it.
 * Cache read occurs INSIDE the traced call.
 */
export async function explainFolder(params: ExplainFolderParams): Promise<ExplainResult> {
  const { supabase, orgId, analysisId, folderPath, containedFiles, inbound, outbound } = params;

  const contentHash = computeContentHash(containedFiles);
  const cacheKey = buildCacheKey({
    targetType: "folder",
    targetPath: folderPath,
    contentHash,
    modelName: PINNED_MODEL,
  });

  const tracingActive = isTracingConfigured();
  let run: RunTree | null = null;

  if (tracingActive) {
    try {
      run = new RunTree({
        name: "cartograph.explain_folder",
        run_type: "chain",
        inputs: {
          folder: folderPath,
          filesCount: containedFiles.length,
          inboundCount: inbound.length,
          outboundCount: outbound.length,
          contentHash,
          model: PINNED_MODEL,
        },
        project_name: process.env.LANGSMITH_PROJECT || "cartograph",
      });
      await run.postRun();
    } catch (e) {
      console.warn("[AI] LangSmith postRun failed:", e);
      run = null;
    }
  }

  // 1. Cache read INSIDE traced call
  const cached = await getCachedExplanation({
    supabase,
    analysisId,
    cacheKey,
  });

  if (cached) {
    if (run) {
      try {
        await run.end({
          outputs: { explanation: cached.content, cached: true },
        });
        await run.patchRun();
      } catch (e) {
        console.warn("[AI] LangSmith patchRun failed:", e);
      }
    }

    return {
      content: cached.content,
      cached: true,
      contentHash,
      model: PINNED_MODEL,
      tracingActive,
    };
  }

  // 2. Cache miss: invoke pinned model
  const { system, user } = buildFolderExplanationPrompt({
    folderPath,
    containedFiles,
    inbound,
    outbound,
  });

  const completion = await getWrappedClient().chat.completions.create(
    {
      model: PINNED_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.1,
    },
    run ? { parent: run } : undefined
  );

  const text = completion.choices[0]?.message?.content?.trim() || "No explanation returned.";

  // 3. Write to cache
  await setCachedExplanation({
    supabase,
    orgId,
    analysisId,
    fileId: null,
    targetType: "folder",
    targetPath: folderPath,
    contentHash,
    modelName: PINNED_MODEL,
    content: text,
  });

  if (run) {
    try {
      await run.end({
        outputs: { explanation: text, cached: false },
      });
      await run.patchRun();
    } catch (e) {
      console.warn("[AI] LangSmith patchRun failed:", e);
    }
  }

  return {
    content: text,
    cached: false,
    contentHash,
    model: PINNED_MODEL,
    tracingActive,
  };
}

export interface ClassifyRoleParams {
  supabase: SupabaseClient;
  orgId: string;
  analysisId: string;
  fileId?: string;
  filePath: string;
  inbound: string[];
  outbound: string[];
  fileContent?: string | null;
}

export interface ClassifyRoleResult {
  role: NonStructuralRole;
  tracingActive: boolean;
}

/**
 * Assigns a non-structural role to an unclassified file.
 * Constraint: ONLY 'service', 'repository', 'model', 'util', 'config', 'component', 'hook'.
 * NEVER 'page', 'route', or 'controller'.
 */
export async function classifyFileRole(params: ClassifyRoleParams): Promise<ClassifyRoleResult> {
  const { supabase, orgId, analysisId, fileId, filePath, inbound, outbound, fileContent } = params;

  const tracingActive = isTracingConfigured();
  let run: RunTree | null = null;

  if (tracingActive) {
    try {
      run = new RunTree({
        name: "cartograph.classify_role",
        run_type: "chain",
        inputs: {
          file: filePath,
          inboundCount: inbound.length,
          outboundCount: outbound.length,
          model: PINNED_MODEL,
        },
        project_name: process.env.LANGSMITH_PROJECT || "cartograph",
      });
      await run.postRun();
    } catch (e) {
      console.warn("[AI] LangSmith postRun failed:", e);
      run = null;
    }
  }

  const { system, user } = buildRoleClassificationPrompt({
    filePath,
    inbound,
    outbound,
    fileContent,
  });

  const completion = await getWrappedClient().chat.completions.create(
    {
      model: PINNED_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.0,
    },
    run ? { parent: run } : undefined
  );

  const rawRole = (completion.choices[0]?.message?.content || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z]/g, "");

  // Strictly enforce non-structural roles
  const validRole: NonStructuralRole = PERMITTED_NON_STRUCTURAL_ROLES.includes(
    rawRole as NonStructuralRole
  )
    ? (rawRole as NonStructuralRole)
    : "util";

  // Persist to file_roles table if fileId is provided
  if (fileId) {
    await supabase.from("file_roles").delete().eq("analysis_id", analysisId).eq("file_id", fileId);
    await supabase.from("file_roles").insert({
      org_id: orgId,
      analysis_id: analysisId,
      file_id: fileId,
      role: validRole,
      confidence: 0.95,
    });
  }

  if (run) {
    try {
      await run.end({
        outputs: { role: validRole },
      });
      await run.patchRun();
    } catch (e) {
      console.warn("[AI] LangSmith patchRun failed:", e);
    }
  }

  return {
    role: validRole,
    tracingActive,
  };
}
