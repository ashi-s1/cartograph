export const dynamic = "force-dynamic";

import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClerkSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ProgressView } from "@/components/pipeline/progress-view";
import { AnalysisExplorer } from "@/components/canvas/analysis-explorer";
import type { ParserResult, ParsedFile, ParsedEdge, ExtractedRoute, FileRole } from "@/lib/parser/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function AnalysisContent({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClerkSupabaseServerClient();

  // 1. Fetch analysis record
  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .select(`
      id,
      org_id,
      status,
      stage,
      stage_message,
      error_message,
      commit_sha,
      summary,
      created_at,
      completed_at,
      project:projects (
        id,
        name,
        repository_url
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (analysisError || !analysis) {
    notFound();
  }

  const project = Array.isArray(analysis.project)
    ? analysis.project[0] ?? null
    : analysis.project;

  const progressProps = {
    ...analysis,
    project,
  };

  // 2. If running or failed, render the live progress view
  if (analysis.status !== "completed") {
    return <ProgressView analysis={progressProps} />;
  }

  // 3. If completed, load the stored files, edges, routes, and file roles
  const [
    { data: rawFiles },
    { data: rawEdges },
    { data: rawRoutes },
    { data: rawRoles },
  ] = await Promise.all([
    supabase
      .from("files")
      .select("id, path, folder, lines, bytes, hash, fan_in, fan_out")
      .eq("analysis_id", id)
      .order("path", { ascending: true }),
    supabase
      .from("edges")
      .select("source_file_id, target_file_id, target_path, kind")
      .eq("analysis_id", id),
    supabase
      .from("routes")
      .select("id, file_id, method, path")
      .eq("analysis_id", id),
    supabase
      .from("file_roles")
      .select("file_id, role, confidence")
      .eq("analysis_id", id),
  ]);

  const filesList = rawFiles || [];
  const edgesList = rawEdges || [];
  const routesList = rawRoutes || [];
  const rolesList = rawRoles || [];

  // Map file IDs to relative paths
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

  const folderSet = new Set(files.map((f) => f.folder));
  const folders = Array.from(folderSet).sort();

  const summary = (analysis.summary as Record<string, unknown>) || {};
  const coverage = (summary.coverage as ParserResult["coverage"]) || {
    totalImports: edges.length,
    resolved: edges.length,
    external: 0,
    excluded: 0,
    unresolved: 0,
    reExportsFound: 0,
    reExportsResolved: 0,
    unresolvedExamples: [],
  };

  const parserResult: ParserResult = {
    repositoryRoot: project?.name || "",
    timestamp: analysis.completed_at || analysis.created_at,
    framework: (summary.framework as string) || "fallback",
    walk: {
      found: files.length,
      parsed: files.length,
      skipped: 0,
      skipReasons: {},
    },
    files,
    edges,
    coverage,
    distinctFoldersCount: folders.length,
    folders,
    routes,
    roles,
  };

  return (
    <AnalysisExplorer
      initialData={parserResult}
      repoName={project?.name || parserResult.repositoryRoot}
      commitSha={analysis.commit_sha}
      repositoryUrl={project?.repository_url}
      analysisId={id}
    />
  );
}

function AnalysisSkeleton() {
  return (
    <div className="mx-auto max-w-2xl py-12 px-4 sm:px-6 animate-pulse space-y-6">
      <div className="h-4 w-32 rounded bg-muted/60" />
      <div className="rounded-lg border border-border/70 bg-card p-6 space-y-6">
        <div className="space-y-2 border-b border-border/60 pb-5">
          <div className="h-5 w-48 rounded bg-muted" />
          <div className="h-4 w-64 rounded bg-muted/60" />
        </div>
        <div className="space-y-4 pt-2">
          <div className="h-10 rounded bg-muted/40" />
          <div className="h-10 rounded bg-muted/30" />
          <div className="h-10 rounded bg-muted/20" />
        </div>
      </div>
    </div>
  );
}

export default function AnalysisPage({ params }: PageProps) {
  return (
    <AppShell fluid>
      <Suspense fallback={<AnalysisSkeleton />}>
        <AnalysisContent params={params} />
      </Suspense>
    </AppShell>
  );
}
