"use client";

import React, { useState, useMemo, useCallback, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CanvasShell } from "@/components/canvas/canvas-shell";
import { CanvasGraph } from "@/components/canvas/canvas-graph";
import { DetailPane, type HoverTarget, type DetailPaneSelection } from "@/components/canvas/detail-pane";
import { CoverageBanner } from "@/components/canvas/coverage-banner";
import type { ParserResult } from "@/lib/parser/types";
import { getTaxonomyCategories, type FrameworkType } from "@/lib/taxonomy";
import { RotateCw, GitCommit, ArrowLeft } from "lucide-react";

interface AnalysisExplorerProps {
  initialData: ParserResult;
  repoName?: string;
  commitSha?: string | null;
  repositoryUrl?: string | null;
  analysisId?: string;
}

export function AnalysisExplorer({
  initialData,
  repoName = initialData.repositoryRoot,
  commitSha = null,
  repositoryUrl = null,
}: AnalysisExplorerProps) {
  const router = useRouter();
  const [isRerunning, startRerunTransition] = useTransition();

  // 1. Selection state
  const [selection, setSelection] = useState<DetailPaneSelection>({ type: null });

  // 2. Category filter state from left rail
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // 3. Active tab state (structure / explanation)
  const [activeTab, setActiveTab] = useState<"structure" | "explanation">("structure");

  // 4. Bidirectional hover state between pane and canvas with rAF throttle
  const [hoveredTarget, setHoveredTarget] = useState<HoverTarget | null>(null);
  const hoverRafRef = useRef<number | null>(null);

  const handleHoverTarget = useCallback((target: HoverTarget | null) => {
    if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
    hoverRafRef.current = requestAnimationFrame(() => {
      setHoveredTarget(target);
    });
  }, []);

  // Derive framework-specific categories for left rail in fixed reading order
  const categories = useMemo(() => {
    const framework = (initialData.framework as FrameworkType) || "fallback";
    const taxonomyCategories = getTaxonomyCategories(framework);

    const roleCounts = new Map<string, number>();
    for (const r of initialData.roles || []) {
      roleCounts.set(r.role, (roleCounts.get(r.role) || 0) + 1);
    }

    // Keep categories in their exact fixed reading order
    const result = taxonomyCategories
      .map((cat) => ({
        id: cat.name,
        name: cat.name,
        color: cat.color,
        count: roleCounts.get(cat.name) || 0,
      }))
      .filter((cat) => cat.count > 0);

    // If no framework roles were populated, fall back to generic
    if (result.length === 0) {
      return [
        {
          id: "Generic",
          name: "Generic",
          color: "#94a3b8",
          count: initialData.files.length,
        },
      ];
    }

    return result;
  }, [initialData.framework, initialData.roles, initialData.files.length]);

  // Navigate selection when clicking a file in DetailPane
  const handleSelectFile = useCallback(
    (filePath: string) => {
      const file = initialData.files.find((f) => f.path === filePath) || null;
      setSelection({
        type: "file",
        file,
        node: null,
      });
    },
    [initialData.files]
  );

  // Navigate selection when clicking a folder in DetailPane
  const handleSelectNode = useCallback(
    (nodeId: string) => {
      setSelection((prev) => {
        return {
          type: "node",
          node: prev.node?.id === nodeId ? prev.node : null,
          file: null,
        };
      });
    },
    []
  );

  // Re-run repository analysis
  const handleRerun = useCallback(() => {
    if (!repositoryUrl || isRerunning) return;
    startRerunTransition(async () => {
      try {
        const res = await fetch("/api/analyses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            repositoryUrl,
            forceRerun: true,
          }),
        });
        const data = await res.json();
        if (data.analysisId) {
          router.push(`/analyses/${data.analysisId}`);
        }
      } catch (err) {
        console.error("Failed to rerun analysis:", err);
      }
    });
  }, [repositoryUrl, isRerunning, router]);

  const selectedNodeId = selection.type === "node" ? selection.node?.id ?? null : null;
  const selectedFilePath = selection.type === "file" ? selection.file?.path ?? null : null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] w-full overflow-hidden bg-background">
      {/* Sub-header Bar: Repository Name, Commit SHA, and Re-run button */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/80 bg-background/95 px-4 backdrop-blur-xs select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <Link
            href="/"
            className="flex items-center text-muted-foreground hover:text-foreground transition-colors mr-1"
            title="Back to dashboard"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <span className="font-mono text-xs font-semibold tracking-tight text-foreground truncate">
            {repoName}
          </span>
          {commitSha && (
            <span className="inline-flex items-center gap-1 rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border/60">
              <GitCommit className="h-2.5 w-2.5" />
              {commitSha.slice(0, 7)}
            </span>
          )}
        </div>

        {repositoryUrl && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRerun}
              disabled={isRerunning}
              className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 cursor-pointer"
            >
              <RotateCw className={`h-3 w-3 ${isRerunning ? "animate-spin" : ""}`} />
              <span>{isRerunning ? "Starting..." : "Re-run"}</span>
            </button>
          </div>
        )}
      </div>

      <CoverageBanner coverage={initialData.coverage} />

      {/* 3-Column Workspace Shell */}
      <div className="flex-1 overflow-hidden">
        <CanvasShell
          categories={categories}
          totalFilesCount={initialData.files.length}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          rightPane={
            <DetailPane
              data={initialData}
              selection={selection}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onSelectFile={handleSelectFile}
              onSelectNode={handleSelectNode}
              hoveredTarget={hoveredTarget}
              onHoverTarget={handleHoverTarget}
            />
          }
        >
          <div className="relative flex-1 overflow-hidden h-full">
            <CanvasGraph
              data={initialData}
              selectedNodeId={selectedNodeId}
              selectedFilePath={selectedFilePath}
              filterCategory={selectedCategory}
              hoveredTarget={hoveredTarget}
              onHoverTarget={handleHoverTarget}
              onSelectionChange={setSelection}
            />
          </div>
        </CanvasShell>
      </div>
    </div>
  );
}
