import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchRepoArchive, parseGitHubUrl } from "./fetcher.ts";
import { parseRepository } from "../parser/index.ts";
import { storeAnalysisResults } from "./store.ts";
import crypto from "node:crypto";
import fs from "node:fs";

export type PipelineStage = "fetching" | "selecting" | "parsing" | "storing" | "completed" | "failed";

export interface PipelineRunOptions {
  supabase: SupabaseClient;
  orgId: string;
  repositoryUrl: string;
  projectId?: string;
  analysisId?: string;
  forceRerun?: boolean;
}

export interface PipelineRunResult {
  analysisId: string;
  projectId: string;
  isExisting: boolean;
  status: "completed" | "failed" | "running";
}

/**
 * Runs the fetch -> select -> parse -> store pipeline for a public repository.
 * Enforces one analysis per repository per organization unless forceRerun is set.
 * Guarantees a top-level catch that marks failed state if anything breaks.
 */
export async function runAnalysisPipeline(options: PipelineRunOptions): Promise<PipelineRunResult> {
  const { supabase, orgId, repositoryUrl, forceRerun = false } = options;
  const { owner, repo, url: normalizedUrl } = parseGitHubUrl(repositoryUrl);

  // 1. Check for existing project and completed analysis
  let projectId: string = options.projectId || "";
  if (!projectId) {
    const { data: existingProject } = await supabase
      .from("projects")
      .select("id, name, repository_url")
      .eq("org_id", orgId)
      .eq("repository_url", normalizedUrl)
      .maybeSingle();

    if (existingProject) {
      projectId = existingProject.id;
    } else {
      projectId = crypto.randomUUID();
      const { error: projectError } = await supabase.from("projects").insert({
        id: projectId,
        org_id: orgId,
        name: `${owner}/${repo}`,
        repository_url: normalizedUrl,
      });

      if (projectError) {
        throw new Error(`Failed to create project record: ${projectError.message}`);
      }
    }
  }

  // If not force rerun, check if a completed analysis already exists
  if (!forceRerun && !options.analysisId) {
    const { data: existingAnalysis } = await supabase
      .from("analyses")
      .select("id, status")
      .eq("org_id", orgId)
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingAnalysis) {
      return {
        analysisId: existingAnalysis.id,
        projectId,
        isExisting: true,
        status: "completed",
      };
    }
  }

  // 2. Initialize or reuse analysis record
  const analysisId = options.analysisId || crypto.randomUUID();
  let currentStage: PipelineStage = "fetching";

  if (!options.analysisId) {
    const { error: initAnalysisError } = await supabase.from("analyses").insert({
      id: analysisId,
      org_id: orgId,
      project_id: projectId,
      status: "running",
      stage: "fetching",
      stage_message: "Fetching repository archive",
    });

    if (initAnalysisError) {
      throw new Error(`Failed to initialize analysis record: ${initAnalysisError.message}`);
    }
  } else {
    // If reusing or re-running an existing analysis record, reset its status
    await supabase
      .from("analyses")
      .update({
        status: "running",
        stage: "fetching",
        stage_message: "Fetching repository archive",
        error_message: null,
        completed_at: null,
      })
      .eq("id", analysisId);
  }

  // Helper to update progress stage
  async function updateStage(stage: PipelineStage, stageMessage: string, extra?: Record<string, any>) {
    currentStage = stage;
    await supabase
      .from("analyses")
      .update({
        stage,
        stage_message: stageMessage,
        ...extra,
      })
      .eq("id", analysisId);
  }

  let tempDirToClean: string | null = null;

  try {
    // STAGE 1: Fetch archive and resolve commit SHA
    await updateStage("fetching", "Downloading repository archive from GitHub");
    const fetched = await fetchRepoArchive(normalizedUrl);
    tempDirToClean = fetched.tempDir;

    await updateStage("selecting", "Selecting code files from archive", {
      commit_sha: fetched.commitSha,
    });

    // STAGE 2 & 3: Parse repository AST and compute graph
    await updateStage("parsing", "Parsing AST and resolving module imports");
    const parserResult = parseRepository({
      rootDir: fetched.sourceDir,
    });

    // STAGE 4: Store results in database
    await updateStage("storing", "Writing graph nodes and edges to storage");
    await storeAnalysisResults({
      supabase,
      orgId,
      projectId,
      analysisId,
      parserResult,
      commitSha: fetched.commitSha,
    });

    return {
      analysisId,
      projectId,
      isExisting: false,
      status: "completed",
    };
  } catch (err: any) {
    // Catch-all: Ensure failed state is recorded rather than stuck mid-parse
    const errorMessage = err instanceof Error ? err.message : String(err);
    await supabase
      .from("analyses")
      .update({
        status: "failed",
        stage: "failed",
        stage_message: `Failed during ${currentStage}`,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq("id", analysisId);

    throw err;
  } finally {
    // Always clean up temp files from disk
    if (tempDirToClean && fs.existsSync(tempDirToClean)) {
      try {
        fs.rmSync(tempDirToClean, { recursive: true, force: true });
      } catch {}
    }
  }
}
