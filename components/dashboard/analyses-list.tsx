"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useClerkSupabaseClient } from "@/lib/supabase/client";
import { Inbox, AlertCircle, ArrowUpRight } from "lucide-react";

export interface ProjectInfo {
  id: string;
  name: string;
  repository_url: string | null;
}

export interface AnalysisSummary {
  commit?: string;
  files_count?: number;
  imports_count?: number;
  routes_count?: number;
  coverage?: any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
  error?: string;
}

export interface AnalysisRecord {
  id: string;
  org_id: string;
  status: string;
  stage?: string | null;
  stage_message?: string | null;
  error_message?: string | null;
  commit_sha?: string | null;
  summary: AnalysisSummary | null;
  created_at: string;
  completed_at: string | null;
  project: ProjectInfo | null;
}

interface AnalysesListProps {
  initialAnalyses: AnalysisRecord[];
  orgId: string;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

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

function isAnalysisStale(analysis: AnalysisRecord): boolean {
  if (analysis.status === "completed" || analysis.status === "failed") {
    return false;
  }
  const createdAtMs = new Date(analysis.created_at).getTime();
  return Date.now() - createdAtMs > STALE_THRESHOLD_MS;
}

export function AnalysesList({ initialAnalyses, orgId }: AnalysesListProps) {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>(initialAnalyses);
  const supabase = useClerkSupabaseClient();
  const [, startTransition] = useTransition();

  // Keep synced with initialAnalyses when server revalidates
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

  if (analyses.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 p-8 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
          <Inbox className="h-4 w-4" />
        </div>
        <div className="mt-3 text-xs font-semibold text-foreground">No codebase analyses yet</div>
        <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">
          Enter a public GitHub repository above to run an analysis and view its dependency map.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border/80 text-[11px] font-normal text-muted-foreground">
            <th className="pb-2.5 pt-2 font-normal text-muted-foreground">Repository</th>
            <th className="pb-2.5 pt-2 font-normal text-muted-foreground">State</th>
            <th className="pb-2.5 pt-2 font-normal text-muted-foreground">Commit</th>
            <th className="pb-2.5 pt-2 font-normal text-muted-foreground">Started</th>
            <th className="pb-2.5 pt-2 font-normal text-muted-foreground">Finished</th>
            <th className="pb-2.5 pt-2 font-normal text-muted-foreground text-right">View</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {analyses.map((analysis) => {
            const stale = isAnalysisStale(analysis);
            const status = analysis.status.toLowerCase();
            const commitHash =
              analysis.commit_sha
                ? analysis.commit_sha.slice(0, 7)
                : analysis.summary?.commit
                ? analysis.summary.commit.slice(0, 7)
                : "—";

            return (
              <tr
                key={analysis.id}
                className="group transition-colors hover:bg-muted/30"
              >
                {/* Repository Column */}
                <td className="py-3 pr-4 font-mono text-xs font-medium text-foreground/90 group-hover:text-foreground">
                  <Link
                    href={`/analyses/${analysis.id}`}
                    className="hover:underline flex items-center gap-1.5"
                  >
                    {analysis.project?.name ?? "Unnamed Repository"}
                  </Link>
                </td>

                {/* State Column */}
                <td className="py-3 pr-4">
                  <div className="flex flex-col">
                    {stale ? (
                      <span className="inline-flex items-center gap-1 font-mono text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <AlertCircle className="h-3 w-3" />
                        stale (abandoned)
                      </span>
                    ) : status === "failed" ? (
                      <span className="font-mono text-xs text-rose-500 dark:text-rose-400 font-medium">
                        failed
                      </span>
                    ) : status === "running" ? (
                      <span className="inline-flex items-center gap-1.5 font-mono text-xs text-sky-600 dark:text-sky-400 font-medium">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                        </span>
                        {analysis.stage || "parsing"}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-foreground/90 font-medium">
                        complete
                      </span>
                    )}

                    {/* Stage message or error message */}
                    {status === "failed" && (analysis.error_message || analysis.stage_message) && (
                      <span className="mt-0.5 text-[11px] text-muted-foreground/80 line-clamp-1">
                        {analysis.error_message || analysis.stage_message}
                      </span>
                    )}
                    {status === "running" && analysis.stage_message && (
                      <span className="mt-0.5 text-[11px] text-muted-foreground/80 line-clamp-1">
                        {analysis.stage_message}
                      </span>
                    )}
                  </div>
                </td>

                {/* Commit Column */}
                <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                  {commitHash}
                </td>

                {/* Started Column */}
                <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                  {formatTimeAgo(analysis.created_at)}
                </td>

                {/* Finished Column */}
                <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                  {formatTimeAgo(analysis.completed_at)}
                </td>

                {/* Action Column */}
                <td className="py-3 pl-4 text-right">
                  <Link
                    href={`/analyses/${analysis.id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    Open
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
