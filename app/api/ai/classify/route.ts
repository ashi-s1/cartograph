import { NextResponse } from "next/server";
import { createClerkSupabaseServerClient } from "@/lib/supabase/server";
import { classifyFileRole, isTracingConfigured } from "@/lib/ai/client";
import { parseGitHubUrl } from "@/lib/pipeline/fetcher";

interface ClassifyRequestBody {
  analysisId: string;
  filePath: string;
}

export async function POST(req: Request) {
  try {
    const body: ClassifyRequestBody = await req.json();
    const { analysisId, filePath } = body;

    if (!analysisId || !filePath) {
      return NextResponse.json(
        { error: "analysisId and filePath are required" },
        { status: 400 }
      );
    }

    const supabase = await createClerkSupabaseServerClient();

    // 1. Fetch analysis and project details
    const { data: analysis, error: analysisErr } = await supabase
      .from("analyses")
      .select(`
        id,
        org_id,
        commit_sha,
        project:projects (
          id,
          repository_url
        )
      `)
      .eq("id", analysisId)
      .maybeSingle();

    if (analysisErr || !analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    const orgId = analysis.org_id;
    const project = Array.isArray(analysis.project) ? analysis.project[0] : analysis.project;
    const repositoryUrl = project?.repository_url || "";
    const commitSha = analysis.commit_sha || null;

    // 2. Load file and edges
    const [{ data: rawFiles }, { data: rawEdges }] = await Promise.all([
      supabase
        .from("files")
        .select("id, path, folder, lines")
        .eq("analysis_id", analysisId),
      supabase
        .from("edges")
        .select("source_file_id, target_file_id, target_path")
        .eq("analysis_id", analysisId),
    ]);

    const filesList = rawFiles || [];
    const edgesList = rawEdges || [];

    const fileIdToPath = new Map<string, string>();
    let targetFile: (typeof filesList)[0] | null = null;

    for (const f of filesList) {
      fileIdToPath.set(f.id, f.path);
      if (f.path === filePath) {
        targetFile = f;
      }
    }

    if (!targetFile) {
      return NextResponse.json({ error: `File "${filePath}" not found` }, { status: 404 });
    }

    const inbound: string[] = [];
    const outbound: string[] = [];

    for (const edge of edgesList) {
      const sourcePath = fileIdToPath.get(edge.source_file_id);
      const targetResolved =
        edge.target_path || (edge.target_file_id ? fileIdToPath.get(edge.target_file_id) : "");

      if (sourcePath === filePath && targetResolved) {
        outbound.push(targetResolved);
      }
      if (targetResolved === filePath && sourcePath) {
        inbound.push(sourcePath);
      }
    }

    // Optional: fetch brief content excerpt
    let fileContent: string | null = null;
    if (repositoryUrl && commitSha) {
      try {
        const { owner, repo } = parseGitHubUrl(repositoryUrl);
        const res = await fetch(
          `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${filePath.replace(/^\/+/, "")}`,
          { next: { revalidate: 300 } }
        );
        if (res.ok) {
          fileContent = await res.text();
        }
      } catch {
        // Fallback to path and graph context
      }
    }

    const result = await classifyFileRole({
      supabase,
      orgId,
      analysisId,
      fileId: targetFile.id,
      filePath,
      inbound: Array.from(new Set(inbound)).sort(),
      outbound: Array.from(new Set(outbound)).sort(),
      fileContent,
    });

    return NextResponse.json({
      role: result.role,
      tracingActive: result.tracingActive,
    });
  } catch (err: unknown) {
    console.error("[Classify API Error]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to classify file role" },
      { status: 500 }
    );
  }
}
