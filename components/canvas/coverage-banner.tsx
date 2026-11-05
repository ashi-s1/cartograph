"use client";

import React, { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FileCode } from "lucide-react";
import type { CoverageReport } from "@/lib/parser/types";

interface CoverageBannerProps {
  coverage?: CoverageReport | null;
}

export function CoverageBanner({ coverage }: CoverageBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (!coverage) return null;

  const total = coverage.resolved + coverage.unresolved;
  if (total === 0) return null;

  const percent = Math.round((coverage.resolved / total) * 100);

  // Per spec: Only show warning if coverage is under 95% or has unresolved imports
  if (percent >= 95 && coverage.unresolved === 0) {
    return null;
  }

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-900 dark:text-amber-200 transition-all text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-semibold">Partial graph:</span>
          <span>{percent}% coverage</span>
          <span className="text-muted-foreground font-sans">
            ({coverage.unresolved} unresolved {coverage.unresolved === 1 ? "import" : "imports"})
          </span>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 font-sans text-[11px] font-medium hover:underline cursor-pointer"
        >
          {expanded ? (
            <>
              Hide details <ChevronUp className="h-3 w-3" />
            </>
          ) : (
            <>
              View details <ChevronDown className="h-3 w-3" />
            </>
          )}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-amber-500/20 font-sans space-y-2.5">
          <p className="text-[11px] text-amber-950/80 dark:text-amber-200/80 leading-relaxed">
            Some module specifiers could not be mapped to source files. The architecture graph
            represents all successfully resolved dependencies, but is incomplete.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="rounded bg-background/50 p-2 border border-amber-500/20">
              <div className="text-muted-foreground text-[10px]">Resolved</div>
              <div className="font-semibold text-foreground">{coverage.resolved}</div>
            </div>
            <div className="rounded bg-background/50 p-2 border border-amber-500/20">
              <div className="text-muted-foreground text-[10px]">Unresolved</div>
              <div className="font-semibold text-amber-600 dark:text-amber-400">{coverage.unresolved}</div>
            </div>
            <div className="rounded bg-background/50 p-2 border border-amber-500/20">
              <div className="text-muted-foreground text-[10px]">External Packages</div>
              <div className="font-semibold text-foreground">{coverage.external}</div>
            </div>
            <div className="rounded bg-background/50 p-2 border border-amber-500/20">
              <div className="text-muted-foreground text-[10px]">Re-exports</div>
              <div className="font-semibold text-foreground">{coverage.reExportsResolved}/{coverage.reExportsFound}</div>
            </div>
          </div>

          {coverage.unresolvedExamples && coverage.unresolvedExamples.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="text-[11px] font-semibold text-muted-foreground">
                Sample Unresolved Specifiers:
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1 rounded bg-background/60 p-2 font-mono text-[11px] border border-amber-500/20">
                {coverage.unresolvedExamples.slice(0, 8).map((ex, i) => (
                  <div key={i} className="flex items-center gap-2 text-foreground/90">
                    <FileCode className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{ex.sourceFile}:{ex.line}</span>
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">{ex.specifier}</span>
                    <span className="text-muted-foreground/70 text-[10px]">— {ex.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
