import { NextResponse } from "next/server";
import { verifyAgentCredential } from "@/lib/ai/agent-credential";
import { loadVerifiedAnalysis } from "@/lib/supabase/agent-reader";
import {
  computeRepoSummary,
  computeFileDependencies,
  classifyFile,
} from "@/lib/canvas/analysis-helpers";
import {
  transitiveWalk,
  type WalkDirection,
} from "@/lib/canvas/graph-maths";
import type { ParsedFile } from "@/lib/parser/types";

function extractCredential(req: Request): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const customHeader = req.headers.get("x-agent-credential");
  if (customHeader) {
    return customHeader.trim();
  }
  return null;
}

interface RouteParams {
  params: Promise<{ tool: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    const { tool } = await params;
    const token = extractCredential(req);

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized: Missing agent credential header" },
        { status: 401 }
      );
    }

    let payload;
    try {
      payload = verifyAgentCredential(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json(
        { error: `Unauthorized: ${message}` },
        { status: 401 }
      );
    }

    // Load analysis strictly using the verified credential
    const analysis = await loadVerifiedAnalysis(payload.analysisId, payload.orgId);
    const url = new URL(req.url);

    switch (tool) {
      case "summary": {
        const summary = computeRepoSummary(
          analysis.files,
          analysis.edges,
          analysis.repositoryRoot,
          analysis.framework,
          analysis.routes.length
        );
        return NextResponse.json({
          repositoryName: summary.name,
          framework: summary.framework,
          totalFiles: summary.totalFiles,
          totalEdges: summary.totalEdges,
          routeCount: summary.routeCount,
          unclassifiedCount: summary.unclassifiedCount,
          mostDependedFiles: summary.mostDependedFiles.map((m) => ({
            path: m.file.path,
            fanIn: m.count,
          })),
          entrypointFiles: summary.entrypointFiles.map((f) => ({
            path: f.path,
            fanOut: f.fanOut,
          })),
        });
      }

      case "search": {
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        if (!q) {
          return NextResponse.json(
            { error: "Query parameter 'q' is required" },
            { status: 400 }
          );
        }
        const matches = analysis.files
          .filter((f) => f.path.toLowerCase().includes(q))
          .slice(0, 30)
          .map((f) => ({
            path: f.path,
            folder: f.folder,
            lines: f.lines,
            fanIn: f.fanIn,
            fanOut: f.fanOut,
          }));

        return NextResponse.json({
          query: q,
          matchedCount: matches.length,
          files: matches,
        });
      }

      case "roles": {
        const targetRole = (url.searchParams.get("role") || "").trim().toLowerCase();
        if (!targetRole) {
          return NextResponse.json(
            { error: "Query parameter 'role' is required" },
            { status: 400 }
          );
        }

        const matchingFiles: Array<{ path: string; role: string }> = [];
        for (const file of analysis.files) {
          const storedRole = analysis.roles?.find((r) => r.file === file.path);
          const roleName = storedRole?.role || classifyFile(file.path).kind;

          if (
            roleName.toLowerCase() === targetRole ||
            roleName.toLowerCase().includes(targetRole)
          ) {
            matchingFiles.push({ path: file.path, role: roleName });
          }
        }

        return NextResponse.json({
          requestedRole: targetRole,
          totalFound: matchingFiles.length,
          files: matchingFiles.slice(0, 50),
        });
      }

      case "neighbors": {
        const filePath = (url.searchParams.get("path") || "").trim();
        if (!filePath) {
          return NextResponse.json(
            { error: "Query parameter 'path' is required" },
            { status: 400 }
          );
        }

        const exists = analysis.files.some((f) => f.path === filePath);
        if (!exists) {
          const closeMatches = analysis.files
            .filter((f) => f.path.toLowerCase().includes(filePath.toLowerCase()))
            .map((f) => f.path)
            .slice(0, 5);

          return NextResponse.json(
            {
              error: `File not found in repository analysis: "${filePath}"`,
              suggestions: closeMatches,
            },
            { status: 404 }
          );
        }

        const { inbound, outbound } = computeFileDependencies(filePath, analysis.edges);
        return NextResponse.json({
          filePath,
          inboundCount: inbound.length,
          inboundFiles: inbound,
          outboundCount: outbound.length,
          outboundFiles: outbound,
        });
      }

      case "walk": {
        const startPath = (url.searchParams.get("start") || "").trim();
        const direction = (url.searchParams.get("direction") || "inbound") as WalkDirection;
        const depthParam = Number(url.searchParams.get("depth") || 2);
        const maxDepth = Math.min(Math.max(depthParam, 1), 5);

        if (!startPath) {
          return NextResponse.json(
            { error: "Query parameter 'start' is required" },
            { status: 400 }
          );
        }

        if (direction !== "inbound" && direction !== "outbound") {
          return NextResponse.json(
            { error: "direction must be 'inbound' or 'outbound'" },
            { status: 400 }
          );
        }

        const filesMap = new Map<string, ParsedFile>();
        for (const f of analysis.files) {
          filesMap.set(f.path, f);
        }

        if (!filesMap.has(startPath)) {
          return NextResponse.json(
            { error: `Start file not found: "${startPath}"` },
            { status: 404 }
          );
        }

        const walkResult = transitiveWalk(
          startPath,
          analysis.edges,
          filesMap,
          direction,
          maxDepth
        );

        return NextResponse.json({
          rootFilePath: walkResult.rootFilePath,
          direction: walkResult.direction,
          maxDepth: walkResult.maxDepth,
          totalReached: walkResult.results.length,
          nodes: walkResult.results.map((r) => ({
            filePath: r.filePath,
            depth: r.depth,
          })),
        });
      }

      case "routes": {
        const prefix = (url.searchParams.get("prefix") || "").trim().toLowerCase();
        const method = (url.searchParams.get("method") || "").trim().toUpperCase();

        let routes = analysis.routes || [];
        if (prefix) {
          routes = routes.filter((r) => r.path.toLowerCase().startsWith(prefix));
        }
        if (method) {
          routes = routes.filter((r) => r.method.toUpperCase() === method);
        }

        return NextResponse.json({
          totalRoutes: routes.length,
          routes: routes.map((r) => ({
            file: r.file,
            method: r.method,
            path: r.path,
          })),
        });
      }

      case "data": {
        return NextResponse.json({
          analysisId: analysis.analysisId,
          repositoryRoot: analysis.repositoryRoot,
          framework: analysis.framework,
          files: analysis.files,
          edges: analysis.edges,
          routes: analysis.routes,
          roles: analysis.roles,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown tool endpoint: ${tool}` },
          { status: 404 }
        );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
