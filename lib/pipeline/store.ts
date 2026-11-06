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
  claimId?: string;
}

export async function storeAnalysisResults(options: StoreAnalysisOptions): Promise<void> {
  const { supabase, orgId, analysisId, parserResult, commitSha, claimId } = options;

  // Fence result writes: verify analysis claim has not been superseded
  if (claimId) {
    const { data: analysisData, error: claimErr } = await supabase
      .from("analyses")
      .select("summary")
      .eq("id", analysisId)
      .maybeSingle();

    if (claimErr) {
      throw new Error(`Failed to verify analysis claim fence: ${claimErr.message}`);
    }
    const currentClaim = (analysisData?.summary as Record<string, unknown>)?.claim_id;
    if (currentClaim && currentClaim !== claimId) {
      throw new Error(`Analysis claim superseded by another worker for analysis ${analysisId}`);
    }
  }

  // Clean up any stale records if re-running an analysis
  const { error: routesError } = await supabase.from("routes").delete().eq("analysis_id", analysisId);
  if (routesError) {
    throw new Error(`Failed to clean up stale routes: ${routesError.message}`);
  }
  const { error: rolesError } = await supabase.from("file_roles").delete().eq("analysis_id", analysisId);
  if (rolesError) {
    throw new Error(`Failed to clean up stale file_roles: ${rolesError.message}`);
  }
  const { error: edgesError } = await supabase.from("edges").delete().eq("analysis_id", analysisId);
  if (edgesError) {
    throw new Error(`Failed to clean up stale edges: ${edgesError.message}`);
  }
  const { error: filesError } = await supabase.from("files").delete().eq("analysis_id", analysisId);
  if (filesError) {
    throw new Error(`Failed to clean up stale files: ${filesError.message}`);
  }

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
    const { error: batchFilesError } = await supabase.from("files").insert(batch);
    if (batchFilesError) {
      throw new Error(`Failed to store files: ${batchFilesError.message}`);
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
    const { error: batchEdgesError } = await supabase.from("edges").insert(batch);
    if (batchEdgesError) {
      throw new Error(`Failed to store edges: ${batchEdgesError.message}`);
    }
  }

  // 3. Prepare and insert routes
  if (parserResult.routes.length > 0) {
    const routeRows = parserResult.routes.map((route) => {
      const fileId = fileIdMap.get(route.file) || null;
      return {
        id: crypto.randomUUID(),
        org_id: orgId,
        analysis_id: analysisId,
        file_id: fileId,
        method: route.method,
        path: route.path,
      };
    });

    const ROUTE_BATCH_SIZE = 500;
    for (let i = 0; i < routeRows.length; i += ROUTE_BATCH_SIZE) {
      const batch = routeRows.slice(i, i + ROUTE_BATCH_SIZE);
      const { error: batchRoutesError } = await supabase.from("routes").insert(batch);
      if (batchRoutesError) {
        throw new Error(`Failed to store routes: ${batchRoutesError.message}`);
      }
    }
  }

  // 4. Prepare and insert file roles
  if (parserResult.roles.length > 0) {
    const roleRows = parserResult.roles
      .map((r) => {
        const fileId = fileIdMap.get(r.file);
        if (!fileId) return null;
        return {
          id: crypto.randomUUID(),
          org_id: orgId,
          analysis_id: analysisId,
          file_id: fileId,
          role: r.role,
          confidence: r.confidence ?? 1.0,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const ROLE_BATCH_SIZE = 500;
    for (let i = 0; i < roleRows.length; i += ROLE_BATCH_SIZE) {
      const batch = roleRows.slice(i, i + ROLE_BATCH_SIZE);
      const { error: batchRolesError } = await supabase.from("file_roles").insert(batch);
      if (batchRolesError) {
        throw new Error(`Failed to store file roles: ${batchRolesError.message}`);
      }
    }
  }

  // 5. Mark analysis as completed with summary metrics
  const summary = {
    framework: parserResult.framework,
    files_count: parserResult.files.length,
    imports_count: parserResult.edges.length,
    routes_count: parserResult.routes.length,
    coverage: parserResult.coverage,
    ...(claimId ? { claim_id: claimId } : {}),
    heartbeat_at: new Date().toISOString(),
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
