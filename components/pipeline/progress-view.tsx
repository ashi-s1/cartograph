"use client";

import React, { useEffect, useState } from "react";
import { useClerkSupabaseClient } from "@/lib/supabase/client";
import { CheckCircle2, Loader2, Circle, AlertCircle, ArrowLeft, GitBranch, GitCommit, ArrowRight, RotateCw } from "lucide-react";
import Link from "next/link";

export interface ProgressAnalysisProps {
  id: string;
  org_id: string;
  status: string;
  stage: string | null;
  stage_message: string | null;
  error_message: string | null;
  commit_sha: string | null;
  created_at: string;
  project: {
    id: string;
    name: string;
    repository_url: string | null;
  } | null;
}

interface StageConfig {
  key: string;
  label: string;
  description: string;
}

const STAGES: StageConfig[] = [
  { key: "fetching", label: "Fetch Archive", description: "Downloading repository archive from GitHub" },
  { key: "selecting", label: "Select Source Files", description: "Filtering TypeScript and JavaScript source files" },
  { key: "parsing", label: "Parse AST & Imports", description: "Resolving module dependencies and syntax trees" },
  { key: "storing", label: "Store Graph", description: "Writing nodes, edges, and metrics to database" },
];

export function ProgressView({ analysis }: { analysis: ProgressAnalysisProps }) {
  const supabase = useClerkSupabaseClient();

  const [status, setStatus] = useState<string>(analysis.status);
  const [currentStage, setCurrentStage] = useState<string>(analysis.stage || "fetching");
  const [stageMessage, setStageMessage] = useState<string>(
    analysis.stage_message || "Initializing pipeline..."
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(analysis.error_message);
  const [commitSha, setCommitSha] = useState<string | null>(analysis.commit_sha);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Track elapsed time while running and avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
    if (analysis.status === "running") {
      const ms = Date.now() - new Date(analysis.created_at).getTime();
      setElapsedSeconds(Math.max(0, Math.floor(ms / 1000)));
    }
  }, [analysis.status, analysis.created_at]);

  useEffect(() => {
    if (status !== "running" || !isMounted) return;
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [status, isMounted]);

  async function handleRetry() {
    if (isRetrying || !analysis.project?.repository_url) return;
    setIsRetrying(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repositoryUrl: analysis.project.repository_url,
          forceRerun: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to restart analysis");
      }

      setStatus("running");
      setCurrentStage("fetching");
      setStageMessage("Downloading repository archive from GitHub");
      setElapsedSeconds(0);
    } catch (err: any) /* eslint-disable-line @typescript-eslint/no-explicit-any */ {
      setErrorMessage(err.message || "Failed to retry analysis");
    } finally {
      setIsRetrying(false);
    }
  }

  useEffect(() => {
    // If the server props indicate completed, hard reload to render the map
    if (analysis.status === "completed") {
      window.location.reload();
      return;
    }

    // 1. Subscribe to Realtime broadcast channel
    const channelName = `analysis:${analysis.id}`;
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
          if (!payload) return;

          if (payload.status) setStatus(payload.status);
          if (payload.stage) setCurrentStage(payload.stage);
          if (payload.message) setStageMessage(payload.message);
          if (payload.error_message) setErrorMessage(payload.error_message);
          if (payload.commit_sha) setCommitSha(payload.commit_sha);

          // If analysis completes, redirect to map
          if (payload.status === "completed" || payload.stage === "completed") {
            setStatus("completed");
            setCurrentStage("completed");
            setStageMessage("Analysis complete! Loading interactive map...");
            setTimeout(() => {
              window.location.reload();
            }, 600);
          }
        }
      )
      .subscribe();

    // 2. Fallback periodic check in case websocket packet was dropped
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from("analyses")
          .select("status, stage, stage_message, error_message, commit_sha")
          .eq("id", analysis.id)
          .maybeSingle();

        if (data) {
          if (data.status === "completed") {
            setStatus("completed");
            setCurrentStage("completed");
            setStageMessage("Analysis complete! Loading interactive map...");
            clearInterval(interval);
            setTimeout(() => {
              window.location.reload();
            }, 400);
          } else if (data.status === "failed") {
            setStatus("failed");
            setCurrentStage(data.stage || "failed");
            setErrorMessage(data.error_message);
            clearInterval(interval);
          } else {
            if (data.stage) setCurrentStage(data.stage);
            if (data.stage_message) setStageMessage(data.stage_message);
            if (data.commit_sha) setCommitSha(data.commit_sha);
          }
        }
      } catch {
        // Ignore fallback query errors
      }
    }, 2500);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [analysis.id, analysis.status, supabase]);

  const stageKeys = STAGES.map((s) => s.key);
  const currentStageIndex = stageKeys.indexOf(currentStage);
  const isStalled = status === "running" && elapsedSeconds > 25;

  return (
    <div className="mx-auto max-w-2xl py-12 px-4 sm:px-6">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Workspace
        </Link>
      </div>

      <div className="rounded-lg border border-border/70 bg-card p-6 shadow-xs">
        {/* Header with repository info */}
        <div className="border-b border-border/60 pb-5 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <h1 className="text-base font-semibold tracking-tight text-foreground">
                  {analysis.project?.name ?? "Repository Analysis"}
                </h1>
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {analysis.project?.repository_url}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {status === "running" && isMounted && (
                <span suppressHydrationWarning className="font-mono text-[11px] text-muted-foreground">
                  {elapsedSeconds}s
                </span>
              )}
              {commitSha && (
                <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground border border-border/60">
                  <GitCommit className="h-3 w-3" />
                  {commitSha.slice(0, 7)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Failed state banner */}
        {status === "failed" ? (
          <div className="space-y-4">
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-800 dark:text-rose-200">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                Analysis Failed
              </div>
              <p className="mt-1 text-[11px] leading-relaxed">
                {errorMessage || stageMessage || "The analysis encountered an unrecoverable error."}
              </p>
              {currentStage && (
                <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                  Failed during stage: <span className="text-foreground">{currentStage}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Link
                href="/"
                className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                Return to Dashboard
              </Link>
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isRetrying ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCw className="h-3.5 w-3.5" />
                )}
                <span>Retry Analysis</span>
              </button>
            </div>
          </div>
        ) : status === "completed" ? (
          /* Completed transition state */
          <div className="space-y-4 py-4 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Analysis Complete!</h2>
              <p className="text-xs text-muted-foreground">
                Graph nodes, edges, and dependencies have been stored. Loading interactive map...
              </p>
            </div>
            <div className="pt-2">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <span>View Map</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Live progress timeline */
          <div className="space-y-6">
            <div className="space-y-4">
              {STAGES.map((s, index) => {
                const isPassed =
                  currentStageIndex > index && currentStageIndex !== -1;
                const isCurrent =
                  currentStage === s.key || (currentStageIndex === -1 && index === 0);

                return (
                  <div key={s.key} className="flex items-start gap-3.5">
                    <div className="pt-0.5">
                      {isPassed ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : isCurrent ? (
                        <Loader2 className="h-4 w-4 animate-spin text-sky-600 dark:text-sky-400" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/30" />
                      )}
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-medium ${
                            isCurrent
                              ? "text-sky-600 dark:text-sky-400 font-semibold"
                              : isPassed
                              ? "text-foreground"
                              : "text-muted-foreground/50"
                          }`}
                        >
                          {s.label}
                        </span>
                        {isCurrent && (
                          <span className="font-mono text-[10px] text-sky-600 dark:text-sky-400 animate-pulse">
                            in progress
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-[11px] ${
                          isCurrent
                            ? "text-foreground/90 font-mono"
                            : "text-muted-foreground/60"
                        }`}
                      >
                        {isCurrent ? stageMessage || s.description : s.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stalled or taking longer notification */}
            {isStalled && (
              <div className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Taking longer than expected? The background job may have been interrupted.</span>
                </div>
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-600 dark:bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 ml-3"
                >
                  {isRetrying ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCw className="h-3 w-3" />
                  )}
                  <span>Restart Analysis</span>
                </button>
              </div>
            )}

            <div className="rounded-md bg-muted/30 border border-border/40 p-3 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Status updates arrive live via database events.</span>
              <span className="font-mono text-[10px]">No polling</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
