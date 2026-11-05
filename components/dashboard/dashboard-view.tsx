"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useClerkSupabaseClient } from "@/lib/supabase/client";
import { XCircle, Loader2 } from "lucide-react";

export interface ProjectInfo {
  id: string;
  name: string;
  repository_url: string | null;
}

export interface AnalysisRecord {
  id: string;
  org_id: string;
  status: string;
  stage?: string | null;
  stage_message?: string | null;
  error_message?: string | null;
  commit_sha?: string | null;
  summary: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ | null;
  created_at: string;
  completed_at: string | null;
  project: ProjectInfo | null;
}

interface DashboardViewProps {
  initialAnalyses: AnalysisRecord[];
  orgId: string;
  orgName: string;
}

function formatTimeAgo(isoString: string | null): string {
  if (!isoString) return "—";
  try {
    const now = new Date();
    const past = new Date(isoString);
    const diffMs = now.getTime() - past.getTime();
    if (isNaN(diffMs) || diffMs < 0) return "just now";

    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return `${diffDay}d ago`;
  } catch {
    return isoString;
  }
}

export function DashboardView({
  initialAnalyses,
  orgId,
  orgName,
}: DashboardViewProps) {
  const router = useRouter();
  const supabase = useClerkSupabaseClient();
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>(initialAnalyses);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnalyses(initialAnalyses);
  }, [initialAnalyses]);

  // Realtime subscription to the organization channel
  useEffect(() => {
    if (!orgId) return;

    const channelName = `org:${orgId}`;
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: true },
        private: true,
      },
    });

    channel
      .on(
        "broadcast",
        { event: "stage_change" },
        (eventPayload: { payload: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ }) => {
          const payload = eventPayload.payload;
          if (!payload?.analysis_id) return;

          startTransition(() => {
            setAnalyses((prev) => {
              const index = prev.findIndex((a) => a.id === payload.analysis_id);
              if (index >= 0) {
                const updated = [...prev];
                updated[index] = {
                  ...updated[index],
                  status: payload.status || updated[index].status,
                  stage: payload.stage || updated[index].stage,
                  stage_message: payload.message || updated[index].stage_message,
                  error_message: payload.error_message || updated[index].error_message,
                  completed_at:
                    payload.status === "completed" || payload.status === "failed"
                      ? new Date().toISOString()
                      : updated[index].completed_at,
                };
                return updated;
              }
              return prev;
            });
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, supabase]);

  // Form submit handler
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryUrl: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start repository analysis");
      }

      router.push(`/analyses/${data.analysisId}`);
    } catch (err: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) {
      setError(err.message || "An unexpected error occurred");
      setSubmitting(false);
    }
  }

  const completedCount = analyses.filter((a) => a.status === "completed").length;
  const failedCount = analyses.filter((a) => a.status === "failed").length;

  return (
    <div className="space-y-6">
      {/* Top Header Row matching video tutorial: Org Name, Analyses Pill, Inline Input, Submit, and Status Counters */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-foreground">
            {orgName}
          </h1>
          <span className="inline-flex items-center rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400 border border-zinc-700/50">
            {analyses.length} {analyses.length === 1 ? "analysis" : "analyses"}
          </span>

          {/* Inline Form */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 ml-1">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="github.com/owner/repo"
              disabled={submitting}
              className="h-8 w-60 sm:w-80 rounded-md border border-zinc-800 bg-[#0d0f12] px-3 font-mono text-xs text-foreground placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-hidden disabled:opacity-50"
              required
            />
            <button
              type="submit"
              disabled={submitting || !url.trim()}
              className="h-8 rounded-md bg-[#2563eb] hover:bg-[#1d4ed8] px-3.5 text-xs font-medium text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Starting...</span>
                </>
              ) : (
                <span>Analyse</span>
              )}
            </button>
          </form>
        </div>

        {/* Status count pills on the far right */}
        <div className="flex items-center gap-4 font-mono text-xs">
          <span className="inline-flex items-center gap-1.5 text-zinc-300">
            <span className="h-2 w-2 rounded-full bg-zinc-300 inline-block" />
            {completedCount} complete
          </span>
          {failedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-zinc-400">
              <XCircle className="h-3.5 w-3.5 text-zinc-400" />
              {failedCount} failed
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs text-rose-400 font-mono">
          {error}
        </div>
      )}

      {/* Analyses Table matching video tutorial */}
      {analyses.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-zinc-800/80 bg-zinc-950/20 p-8 text-center">
          <p className="text-xs text-zinc-400">
            No codebase analyses yet. Enter a GitHub repository above to begin.
          </p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800/80 text-[11px] font-normal text-zinc-500">
                <th className="pb-3 pt-2 font-normal text-zinc-500">Repository</th>
                <th className="pb-3 pt-2 font-normal text-zinc-500">State</th>
                <th className="pb-3 pt-2 font-normal text-zinc-500">Commit</th>
                <th className="pb-3 pt-2 font-normal text-zinc-500">Started</th>
                <th className="pb-3 pt-2 font-normal text-zinc-500">Finished</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {analyses.map((analysis) => {
                const isFailed = analysis.status.toLowerCase() === "failed";
                const isRunning = analysis.status.toLowerCase() === "running";
                const isComplete = analysis.status.toLowerCase() === "completed";
                const commitHash = analysis.commit_sha
                  ? analysis.commit_sha.slice(0, 7)
                  : "—";

                return (
                  <tr
                    key={analysis.id}
                    onClick={() => router.push(`/analyses/${analysis.id}`)}
                    className="group cursor-pointer transition-colors hover:bg-zinc-900/40"
                  >
                    {/* Repository Column */}
                    <td className="py-3.5 pr-4">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-zinc-200 group-hover:underline">
                          {analysis.project?.name ?? "Unnamed Repository"}
                        </span>
                        {isFailed && (analysis.error_message || analysis.stage_message) && (
                          <span className="mt-1 font-mono text-[11px] text-zinc-500 leading-tight">
                            {analysis.error_message || analysis.stage_message}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* State Column */}
                    <td className="py-3.5 pr-4 font-mono text-xs">
                      {isComplete ? (
                        <span className="inline-flex items-center gap-1.5 text-zinc-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-zinc-300 inline-block" />
                          complete
                        </span>
                      ) : isFailed ? (
                        <span className="inline-flex items-center gap-1.5 text-zinc-400">
                          <XCircle className="h-3 w-3 text-zinc-400" />
                          failed
                        </span>
                      ) : isRunning ? (
                        <span className="inline-flex items-center gap-1.5 text-sky-400 font-medium">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-ping inline-block" />
                          {analysis.stage || "parsing"}
                        </span>
                      ) : (
                        <span className="text-zinc-500">
                          {analysis.status}
                        </span>
                      )}
                    </td>

                    {/* Commit Column */}
                    <td className="py-3.5 pr-4 font-mono text-xs text-zinc-400">
                      {commitHash}
                    </td>

                    {/* Started Column */}
                    <td className="py-3.5 pr-4 font-mono text-xs text-zinc-400">
                      {formatTimeAgo(analysis.created_at)}
                    </td>

                    {/* Finished Column */}
                    <td className="py-3.5 pr-4 font-mono text-xs text-zinc-400">
                      {formatTimeAgo(analysis.completed_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

