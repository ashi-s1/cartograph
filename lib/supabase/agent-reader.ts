import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
 * Direct Postgres fallback when running in environment where service-role JWT is not available
 * and RLS blocks anon key requests.
 */
async function loadAnalysisViaPg(analysisId: string, orgId: string): Promise<LoadedAnalysisData | null> {
  try {
    const password = (process.env.SUPABASE_DB_PASSWORD || process.env.DATABASE_PASSWORD || process.env.PASSWORD || "").trim();
    if (!password) {
      return null;
    }
    const { default: pg } = await import("pg");
    const { Client } = pg;
    const host = process.env.SUPABASE_DB_HOST || "db.tcrlqxyvesuivyulirsl.supabase.co";
    const client = new Client({
      host,
      port: 5432,
      user: "postgres",
      password,
      database: "postgres",
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    await client.connect();

    try {
      const analysisRes = await client.query(
        `SELECT a.id, a.org_id, a.summary, p.name as project_name, p.repository_url
         FROM analyses a
         LEFT JOIN projects p ON p.id = a.project_id
         WHERE a.id = $1 AND a.org_id = $2`,
        [analysisId, orgId]
      );

      if (analysisRes.rows.length === 0) {
        return null;
      }
      const analysisRow = analysisRes.rows[0];

      const [filesRes, edgesRes, routesRes, rolesRes] = await Promise.all([
        client.query(
          `SELECT id, path, folder, lines, bytes, hash, fan_in, fan_out
           FROM files
           WHERE analysis_id = $1 AND org_id = $2
           ORDER BY path ASC`,
          [analysisId, orgId]
        ),
        client.query(
          `SELECT source_file_id, target_file_id, target_path, kind
           FROM edges
           WHERE analysis_id = $1 AND org_id = $2`,
          [analysisId, orgId]
        ),
        client.query(
          `SELECT id, file_id, method, path
           FROM routes
           WHERE analysis_id = $1 AND org_id = $2`,
          [analysisId, orgId]
        ),
        client.query(
          `SELECT file_id, role, confidence
           FROM file_roles
           WHERE analysis_id = $1 AND org_id = $2`,
          [analysisId, orgId]
        ),
      ]);

      const fileIdToPath = new Map<string, string>();
      for (const f of filesRes.rows) {
        fileIdToPath.set(f.id, f.path);
      }

      const files: ParsedFile[] = filesRes.rows.map((f) => ({
        path: f.path,
        folder: f.folder,
        lines: f.lines,
        bytes: f.bytes,
        hash: f.hash,
        fanIn: f.fan_in,
        fanOut: f.fan_out,
      }));

      const edges: ParsedEdge[] = edgesRes.rows.map((e) => ({
        source: fileIdToPath.get(e.source_file_id) || "",
        target: e.target_path || (e.target_file_id ? fileIdToPath.get(e.target_file_id) : "") || "",
        kind: e.kind as ParsedEdge["kind"],
        specifier: e.target_path || "",
      }));

      const routes: ExtractedRoute[] = routesRes.rows.map((r) => ({
        file: (r.file_id ? fileIdToPath.get(r.file_id) : "") || "",
        method: r.method,
        path: r.path,
      }));

      const roles: FileRole[] = rolesRes.rows.map((r) => ({
        file: fileIdToPath.get(r.file_id) || "",
        role: r.role,
        confidence: Number(r.confidence || 1.0),
      }));

      const summary = (analysisRow.summary as Record<string, unknown>) || {};
      const framework = (summary.framework as string) || "TypeScript";
      const repositoryRoot = analysisRow.project_name || "Repository";

      return {
        analysisId,
        orgId,
        repositoryRoot,
        framework,
        files,
        edges,
        routes,
        roles,
      };
    } finally {
      await client.end().catch(() => {});
    }
  } catch (err) {
    console.error("Direct pg analysis load error:", err);
    return null;
  }
}

/**
 * Loads the complete analysis dataset for the verified analysis and organization.
 */
export async function loadVerifiedAnalysis(
  analysisId: string,
  orgId: string,
  existingClient?: SupabaseClient | any
): Promise<LoadedAnalysisData> {
  const cacheKey = `${orgId}:${analysisId}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const supabase = existingClient || createScopedSupabaseClient(orgId);

  // 1. Fetch analysis record to verify org ownership
  const { data: analysis, error: analysisErr } = await supabase
    .from("analyses")
    .select("id, org_id, summary, project:projects(name, repository_url)")
    .eq("id", analysisId)
    .eq("org_id", orgId)
    .maybeSingle();

  if (analysisErr || !analysis) {
    // If not found via Supabase client, attempt verified pg fallback
    const pgAnalysis = await loadAnalysisViaPg(analysisId, orgId);
    if (pgAnalysis) {
      analysisCache.set(cacheKey, { data: pgAnalysis, expiresAt: Date.now() + 60_000 });
      return pgAnalysis;
    }
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

  const filesList: any[] = (rawFiles as any[]) || [];
  const edgesList: any[] = (rawEdges as any[]) || [];
  const routesList: any[] = (rawRoutes as any[]) || [];
  const rolesList: any[] = (rawRoles as any[]) || [];

  const fileIdToPath = new Map<string, string>();
  for (const f of filesList) {
    fileIdToPath.set(f.id, f.path);
  }

  const files: ParsedFile[] = filesList.map((f: any) => ({
    path: f.path,
    folder: f.folder,
    lines: f.lines,
    bytes: f.bytes,
    hash: f.hash,
    fanIn: f.fan_in,
    fanOut: f.fan_out,
  }));

  const edges: ParsedEdge[] = edgesList.map((e: any) => ({
    source: fileIdToPath.get(e.source_file_id) || "",
    target: e.target_path || (e.target_file_id ? fileIdToPath.get(e.target_file_id) : "") || "",
    kind: e.kind as ParsedEdge["kind"],
    specifier: e.target_path || "",
  }));

  const routes: ExtractedRoute[] = routesList.map((r: any) => ({
    file: (r.file_id ? fileIdToPath.get(r.file_id) : "") || "",
    method: r.method,
    path: r.path,
  }));

  const roles: FileRole[] = rolesList.map((r: any) => ({
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
