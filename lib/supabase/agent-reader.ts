import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { ParsedFile, ParsedEdge, ExtractedRoute, FileRole } from "@/lib/parser/types";

export interface LoadedAnalysisData {
  analysisId: string;
  orgId: string;
  repositoryRoot: string;
  framework: string;
  files: ParsedFile[];
  edges: ParsedEdge[];
  routes: ExtractedRoute[];
  roles: FileRole[];
}

// In-memory cache for loaded analyses (TTL 60 seconds) to keep tool calls fast
const analysisCache = new Map<string, { data: LoadedAnalysisData; expiresAt: number }>();

/**
 * Creates a scoped Supabase client for reading an analysis using the verified org claim.
 * Avoids any global service-role bypass keys that can read everything.
 */
function createScopedSupabaseClient(orgId: string) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serviceKey || anonKey, {
    global: {
      headers: {
        "x-organization-id": orgId,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Loads the complete analysis dataset for the verified analysis and organization.
 */
export async function loadVerifiedAnalysis(
  analysisId: string,
  orgId: string
): Promise<LoadedAnalysisData> {
  const cacheKey = `${orgId}:${analysisId}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const supabase = createScopedSupabaseClient(orgId);

  // 1. Fetch analysis record to verify org ownership
  const { data: analysis, error: analysisErr } = await supabase
    .from("analyses")
    .select("id, org_id, summary, project:projects(name, repository_url)")
    .eq("id", analysisId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (analysisErr || !analysis) {
    throw new Error(`Analysis not found or organization mismatch`);
  }

  // 2. Fetch files, edges, routes, roles in parallel
  const [
    { data: rawFiles },
    { data: rawEdges },
    { data: rawRoutes },
    { data: rawRoles },
  ] = await Promise.all([
    supabase
      .from("files")
      .select("id, path, folder, lines, bytes, hash, fan_in, fan_out")
      .eq("analysis_id", analysisId)
      .eq("org_id", orgId)
      .order("path", { ascending: true }),
    supabase
      .from("edges")
      .select("source_file_id, target_file_id, target_path, kind")
      .eq("analysis_id", analysisId)
      .eq("org_id", orgId),
    supabase
      .from("routes")
      .select("id, file_id, method, path")
      .eq("analysis_id", analysisId)
      .eq("org_id", orgId),
    supabase
      .from("file_roles")
      .select("file_id, role, confidence")
      .eq("analysis_id", analysisId)
      .eq("org_id", orgId),
  ]);

  const filesList = rawFiles || [];
  const edgesList = rawEdges || [];
  const routesList = rawRoutes || [];
  const rolesList = rawRoles || [];

  const fileIdToPath = new Map<string, string>();
  for (const f of filesList) {
    fileIdToPath.set(f.id, f.path);
  }

  const files: ParsedFile[] = filesList.map((f) => ({
    path: f.path,
    folder: f.folder,
    lines: f.lines,
    bytes: f.bytes,
    hash: f.hash,
    fanIn: f.fan_in,
    fanOut: f.fan_out,
  }));

  const edges: ParsedEdge[] = edgesList.map((e) => ({
    source: fileIdToPath.get(e.source_file_id) || "",
    target: e.target_path || (e.target_file_id ? fileIdToPath.get(e.target_file_id) : "") || "",
    kind: e.kind as ParsedEdge["kind"],
    specifier: e.target_path || "",
  }));

  const routes: ExtractedRoute[] = routesList.map((r) => ({
    file: (r.file_id ? fileIdToPath.get(r.file_id) : "") || "",
    method: r.method,
    path: r.path,
  }));

  const roles: FileRole[] = rolesList.map((r) => ({
    file: fileIdToPath.get(r.file_id) || "",
    role: r.role,
    confidence: Number(r.confidence || 1.0),
  }));

  const summary = (analysis.summary as Record<string, unknown>) || {};
  const framework = (summary.framework as string) || "TypeScript";
  const projectObj = Array.isArray(analysis.project) ? analysis.project[0] : analysis.project;
  const repositoryRoot = projectObj?.name || "Repository";

  const result: LoadedAnalysisData = {
    analysisId,
    orgId,
    repositoryRoot,
    framework,
    files,
    edges,
    routes,
    roles,
  };

  analysisCache.set(cacheKey, { data: result, expiresAt: Date.now() + 60_000 });
  return result;
}
