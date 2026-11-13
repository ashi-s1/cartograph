import type { SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export interface CacheEntry {
  id: string;
  targetType: "file" | "folder";
  targetPath: string;
  contentHash: string;
  modelName: string;
  cacheKey: string;
  content: string;
  createdAt: string;
  isStale?: boolean;
}

/**
 * Computes deterministic content hash for caching.
 * For a file: SHA-256 of its content (or parser hash if content not loaded).
 * For a folder: SHA-256 of sorted paths and hashes of all contained files.
 */
export function computeContentHash(data: string | Array<{ path: string; hash?: string }>): string {
  if (typeof data === "string") {
    return crypto.createHash("sha256").update(data).digest("hex");
  }
  const serialized = data
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((item) => `${item.path}:${item.hash || ""}`)
    .join("\n");
  return crypto.createHash("sha256").update(serialized).digest("hex");
}

/**
 * Builds the exact cache key including target type, path, content hash, and pinned model name.
 * Changing or re-pinning the model invalidates only its own cache.
 */
export function buildCacheKey(params: {
  targetType: "file" | "folder";
  targetPath: string;
  contentHash: string;
  modelName: string;
}): string {
  return `${params.targetType}:${params.targetPath}:${params.contentHash}:${params.modelName}`;
}

/**
 * Reads an explanation from the database cache.
 * Executed INSIDE the traced call so hits appear as recorded runs without an LLM child call.
 */
export async function getCachedExplanation(params: {
  supabase: SupabaseClient;
  analysisId: string;
  cacheKey: string;
}): Promise<CacheEntry | null> {
  const { supabase, analysisId, cacheKey } = params;

  const { data, error } = await supabase
    .from("explanations")
    .select("id, target_type, target_path, content_hash, model_name, cache_key, content, created_at")
    .eq("analysis_id", analysisId)
    .eq("cache_key", cacheKey)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    targetType: data.target_type as "file" | "folder",
    targetPath: data.target_path,
    contentHash: data.content_hash,
    modelName: data.model_name,
    cacheKey: data.cache_key,
    content: data.content,
    createdAt: data.created_at,
  };
}

/**
 * Writes an explanation to the database cache.
 */
export async function setCachedExplanation(params: {
  supabase: SupabaseClient;
  orgId: string;
  analysisId: string;
  fileId?: string | null;
  targetType: "file" | "folder";
  targetPath: string;
  contentHash: string;
  modelName: string;
  content: string;
}): Promise<void> {
  const {
    supabase,
    orgId,
    analysisId,
    fileId = null,
    targetType,
    targetPath,
    contentHash,
    modelName,
    content,
  } = params;

  const cacheKey = buildCacheKey({ targetType, targetPath, contentHash, modelName });

  // Delete existing entry with this cache key if any
  await supabase
    .from("explanations")
    .delete()
    .eq("analysis_id", analysisId)
    .eq("cache_key", cacheKey);

  const { error } = await supabase.from("explanations").insert({
    org_id: orgId,
    analysis_id: analysisId,
    file_id: fileId,
    target_type: targetType,
    target_path: targetPath,
    content_hash: contentHash,
    model_name: modelName,
    cache_key: cacheKey,
    content,
  });

  if (error) {
    console.error("Failed to store explanation in cache:", error);
  }
}
