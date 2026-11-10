import { NextResponse } from "next/server";
import { createClerkSupabaseServerClient } from "@/lib/supabase/server";
import { explainFile, explainFolder, isTracingConfigured } from "@/lib/ai/client";
import { parseGitHubUrl } from "@/lib/pipeline/fetcher";

interface ExplainRequestBody {
  analysisId: string;
  targetType: "file" | "folder";
  targetPath: string;
}

/**
 * Checks GitHub repository for the latest commit SHA on default branch.
 * Non-blocking: returns null on failure or rate-limit.
 */
async function fetchLatestCommitSha(repositoryUrl: string): Promise<string | null> {
  try {
    const { owner, repo } = parseGitHubUrl(repositoryUrl);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=1`, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "cartograph-app",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const commits = await res.json();
    return commits?.[0]?.sha || null;
  } catch {
    return null;
  }
}

/**
 * Fetches raw file content from GitHub for a specific commit SHA.
 */
async function fetchRawFileContent(
  repositoryUrl: string,
  commitSha: string | null,
  filePath: string
): Promise<string | null> {
  if (!commitSha) return null;
  try {
    const { owner, repo } = parseGitHubUrl(repositoryUrl);
    const cleanPath = filePath.replace(/^\/+/, "");
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${commitSha}/${cleanPath}`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const body: ExplainRequestBody = await req.json();
    const { analysisId, targetType, targetPath } = body;

    if (!analysisId || !targetType || !targetPath) {
      return NextResponse.json(
        { error: "analysisId, targetType, and targetPath are required" },
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

    // 2. Check for repository staleness
    let isStale = false;
    let latestCommitSha: string | null = null;
    if (repositoryUrl && commitSha) {
      latestCommitSha = await fetchLatestCommitSha(repositoryUrl);
      if (latestCommitSha && latestCommitSha !== commitSha) {
        isStale = true;
      }
    }

    // 3. Load files and edges for context
    const [{ data: rawFiles }, { data: rawEdges }] = await Promise.all([
      supabase
        .from("files")
        .select("id, path, folder, lines, hash")
        .eq("analysis_id", analysisId),
      supabase
        .from("edges")
        .select("source_file_id, target_file_id, target_path")
        .eq("analysis_id", analysisId),
    ]);

    const filesList = rawFiles || [];
    const edgesList = rawEdges || [];

    const fileIdToPath = new Map<string, string>();
    const filePathToFile = new Map<string, (typeof filesList)[0]>();
    for (const f of filesList) {
      fileIdToPath.set(f.id, f.path);
      filePathToFile.set(f.path, f);
    }

    // If target is a file
    if (targetType === "file") {
      const targetFile = filePathToFile.get(targetPath);
      if (!targetFile) {
        return NextResponse.json({ error: `File "${targetPath}" not found` }, { status: 404 });
      }

      // Compute inbound (who imports this file) and outbound (what this file imports)
      const inbound: string[] = [];
      const outbound: string[] = [];

      for (const edge of edgesList) {
        const sourcePath = fileIdToPath.get(edge.source_file_id);
        const targetResolved =
          edge.target_path || (edge.target_file_id ? fileIdToPath.get(edge.target_file_id) : "");

        if (sourcePath === targetPath && targetResolved) {
          outbound.push(targetResolved);
        }
        if (targetResolved === targetPath && sourcePath) {
          inbound.push(sourcePath);
        }
      }

      // Fetch file content from GitHub raw content
      let fileContent: string | null = null;
      if (repositoryUrl && commitSha) {
        fileContent = await fetchRawFileContent(repositoryUrl, commitSha, targetPath);
      }

      // Call traced AI explainer with cache read inside
      const result = await explainFile({
        supabase,
        orgId,
        analysisId,
        fileId: targetFile.id,
        filePath: targetPath,
        lines: targetFile.lines,
        inbound: Array.from(new Set(inbound)).sort(),
        outbound: Array.from(new Set(outbound)).sort(),
        fileContent,
        fileHash: targetFile.hash || undefined,
      });

      return NextResponse.json({
        content: result.content,
        cached: result.cached,
        isStale,
        commitSha,
        latestCommitSha,
        tracingActive: result.tracingActive,
      });
    }

    // If target is a folder
    if (targetType === "folder") {
      const contained = filesList.filter((f) => {
        if (targetPath === "." || targetPath === "Root") return true;
        return f.folder === targetPath || f.path.startsWith(`${targetPath}/`);
      });

      const containedPaths = new Set(contained.map((f) => f.path));
      const inboundSet = new Set<string>();
      const outboundSet = new Set<string>();

      for (const edge of edgesList) {
        const sourcePath = fileIdToPath.get(edge.source_file_id) || "";
        const targetResolved =
          edge.target_path || (edge.target_file_id ? fileIdToPath.get(edge.target_file_id) : "") || "";

        const sourceIn = containedPaths.has(sourcePath);
        const targetIn = containedPaths.has(targetResolved);

        if (targetIn && !sourceIn && sourcePath) {
          inboundSet.add(sourcePath);
        } else if (sourceIn && !targetIn && targetResolved) {
          outboundSet.add(targetResolved);
        }
      }

      const result = await explainFolder({
        supabase,
        orgId,
        analysisId,
        folderPath: targetPath,
        containedFiles: contained.map((f) => ({
          path: f.path,
          lines: f.lines,
          hash: f.hash || undefined,
        })),
        inbound: Array.from(inboundSet).sort(),
        outbound: Array.from(outboundSet).sort(),
      });

      return NextResponse.json({
        content: result.content,
        cached: result.cached,
        isStale,
        commitSha,
        latestCommitSha,
        tracingActive: result.tracingActive,
      });
    }

    return NextResponse.json({ error: "Invalid targetType" }, { status: 400 });
  } catch (err: unknown) {
    console.error("[Explain API Error]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate explanation" },
      { status: 500 }
    );
  }
}
