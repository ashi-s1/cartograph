"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Loader2, ArrowRight } from "lucide-react";

export function RepoSubmitForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || loading) return;

    setLoading(true);
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

      // Navigate to the analysis progress/view page
      router.push(`/analyses/${data.analysisId}`);
    } catch (err: any) /* eslint-disable-line @typescript-eslint/no-explicit-any */ {
      setError(err.message || "An unexpected error occurred");
      setLoading(false);
    }
  }

  return (
    <div className="w-full rounded-lg border border-border/70 bg-card p-5 shadow-xs">
      <div className="flex flex-col gap-1 mb-4">
        <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-primary" />
          Map a public repository
        </h2>
        <p className="text-xs text-muted-foreground">
          Enter a GitHub URL. We fetch the archive, resolve module imports, and generate an interactive architecture graph.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repository"
            disabled={loading}
            className="w-full rounded-md border border-input bg-background px-3.5 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-hidden focus:ring-1 focus:ring-ring disabled:opacity-50"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Starting...</span>
            </>
          ) : (
            <>
              <span>Analyse</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mt-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}
