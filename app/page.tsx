import { getOrEnsureCurrentOrg } from "@/lib/auth/org";
import { createClerkSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { OrgSync } from "@/components/org-sync";
import { DashboardView, type AnalysisRecord } from "@/components/dashboard/dashboard-view";
import React, { Suspense } from "react";

async function OrgWorkspaceContent() {
  const currentOrg = await getOrEnsureCurrentOrg();
  const supabase = await createClerkSupabaseServerClient();

  // Database Row-Level Security automatically isolates rows by organization
  const { data: rawAnalyses, error } = await supabase
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
    .order("created_at", { ascending: false });

  const rawRows = rawAnalyses as any[] | null;
  const analyses: AnalysisRecord[] =
    rawRows?.map((row) => ({
      ...row,
      project: Array.isArray(row.project) ? row.project[0] ?? null : row.project,
    })) ?? [];

  return (
    <>
      {currentOrg && (
        <OrgSync
          orgId={currentOrg.id}
          needsActivation={currentOrg.needsActivation}
        />
      )}

      {error ? (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          <div className="font-semibold">Unable to fetch analyses</div>
          <div className="mt-1 text-[11px] opacity-90">{error.message}</div>
        </div>
      ) : (
        <DashboardView
          initialAnalyses={analyses}
          orgId={currentOrg?.id || ""}
          orgName={currentOrg?.name ?? "Workspace"}
        />
      )}
    </>
  );
}

function WorkspaceSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="h-5 w-28 rounded bg-zinc-800" />
          <div className="h-5 w-16 rounded bg-zinc-800/60" />
          <div className="h-8 w-64 rounded bg-zinc-800/40" />
        </div>
        <div className="h-5 w-32 rounded bg-zinc-800/60" />
      </div>
      <div className="space-y-3 pt-2">
        <div className="h-10 w-full rounded bg-zinc-800/30" />
        <div className="h-10 w-full rounded bg-zinc-800/20" />
        <div className="h-10 w-full rounded bg-zinc-800/10" />
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <AppShell>
      <Suspense fallback={<WorkspaceSkeleton />}>
        <OrgWorkspaceContent />
      </Suspense>
    </AppShell>
  );
}
