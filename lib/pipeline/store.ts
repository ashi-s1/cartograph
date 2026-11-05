import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParserResult } from "@/lib/parser/types";
import crypto from "node:crypto";

export interface StoreAnalysisOptions {
  supabase: SupabaseClient;
  orgId: string;
  projectId: string;
  analysisId: string;
  parserResult: ParserResult;
  commitSha: string;
}

export async function storeAnalysisResults(options: StoreAnalysisOptions): Promise<void> {
  const { supabase, orgId, projectId, analysisId, parserResult, commitSha } = options;

  // Clean up any stale files or edges if re-running an analysis
  await supabase.from("edges").delete().eq("analysis_id", analysisId);
  await supabase.from("files").delete().eq("analysis_id", analysisId);

  // 1. Prepare files and assign UUIDs
  const fileIdMap = new Map<string, string>();
  const fileRows = parserResult.files.map((file) => {
    const id = crypto.randomUUID();
    fileIdMap.set(file.path, id);

    return {
      id,
      org_id: orgId,
      analysis_id: analysisId,
      path: file.path,
      folder: file.folder,
      lines: file.lines,
      bytes: file.bytes,
      hash: file.hash,
      fan_in: file.fanIn,
      fan_out: file.fanOut,
    };
  });

  // Batch insert files in chunks to avoid payload limits
  const FILE_BATCH_SIZE = 500;
  for (let i = 0; i < fileRows.length; i += FILE_BATCH_SIZE) {
    const batch = fileRows.slice(i, i + FILE_BATCH_SIZE);
    const { error: filesError } = await supabase.from("files").insert(batch);
    if (filesError) {
      throw new Error(`Failed to store files: ${filesError.message}`);
    }
  }

  // 2. Prepare edges referencing stored file UUIDs
  const edgeRows = parserResult.edges.map((edge) => {
    const sourceFileId = fileIdMap.get(edge.source);
    if (!sourceFileId) {
      throw new Error(`Integrity error: Edge source "${edge.source}" has no corresponding file row`);
    }

    const targetFileId = fileIdMap.get(edge.target) || null;

    return {
      id: crypto.randomUUID(),
      org_id: orgId,
      analysis_id: analysisId,
      source_file_id: sourceFileId,
      target_file_id: targetFileId,
      target_path: edge.target,
      kind: edge.kind,
    };
  });

  // Batch insert edges in chunks
  const EDGE_BATCH_SIZE = 500;
  for (let i = 0; i < edgeRows.length; i += EDGE_BATCH_SIZE) {
    const batch = edgeRows.slice(i, i + EDGE_BATCH_SIZE);
    const { error: edgesError } = await supabase.from("edges").insert(batch);
    if (edgesError) {
      throw new Error(`Failed to store edges: ${edgesError.message}`);
    }
  }

  // 3. Mark analysis as completed with summary metrics
  const summary = {
    files_count: parserResult.files.length,
    imports_count: parserResult.edges.length,
    routes_count: 0,
    coverage: parserResult.coverage,
  };

  const { error: updateError } = await supabase
    .from("analyses")
    .update({
      status: "completed",
      stage: "completed",
      stage_message: "Analysis complete",
      commit_sha: commitSha,
      summary,
      completed_at: new Date().toISOString(),
    })
    .eq("id", analysisId);

  if (updateError) {
    throw new Error(`Failed to finalize analysis status: ${updateError.message}`);
  }
}

