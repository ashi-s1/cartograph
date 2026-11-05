"use client";

import React, { useMemo, useState } from "react";
import {
  FileCode,
  Folder,
  Layers,
  ArrowDownLeft,
  ArrowUpRight,
  GitBranch,
  Sparkles,
  Compass,
  FileQuestion,
  BookOpen,
  Zap,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import type { ParserResult, ParsedFile } from "@/lib/parser/types";
import type { FoldedNode } from "@/lib/canvas/folding";
import {
  classifyFile,
  computeRepoSummary,
  computeFileDependencies,
  computeFolderKindsBreakdown,
} from "@/lib/canvas/analysis-helpers";
import {
  transitiveWalk,
  computeInsights,
  type TransitiveWalkResult,
} from "@/lib/canvas/graph-maths";

export interface DetailPaneSelection {
  type: "node" | "file" | null;
  node?: FoldedNode | null;
  file?: ParsedFile | null;
}

export interface HoverTarget {
  type: "file" | "node";
  id: string;
}

interface DetailPaneProps {
  data: ParserResult;
  selection?: DetailPaneSelection;
  activeTab: "structure" | "explanation";
  onTabChange: (tab: "structure" | "explanation") => void;
  onSelectFile: (filePath: string) => void;
  onSelectNode: (nodeId: string) => void;
  hoveredTarget: HoverTarget | null;
  onHoverTarget: (target: HoverTarget | null) => void;
}

export function DetailPane({
  data,
  selection,
  activeTab,
  onTabChange,
  onSelectFile,
  onSelectNode,
  hoveredTarget,
  onHoverTarget,
}: DetailPaneProps) {
  const selectedFile = selection?.file;
  const selectedNode = selection?.node;

  // Phase 6: Walk Mode for selected file (blast radius vs dependency chain)
  const [walkMode, setWalkMode] = useState<"blast" | "chain" | null>(null);

  // Phase 6: Insights panel collapsed by default
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);

  // Pre-indexed files map for O(1) lookups
  const filesMap = useMemo(() => {
    const map = new Map<string, ParsedFile>();
    for (const f of data.files) {
      map.set(f.path, f);
    }
    return map;
  }, [data.files]);

  // 1. Compute repository resting state summary
  const repoSummary = useMemo(() => {
    return computeRepoSummary(data.files, data.edges, data.repositoryRoot);
  }, [data.files, data.edges, data.repositoryRoot]);

  // 2. Compute file-level dependency lists if a file is selected
  const fileDeps = useMemo(() => {
    if (!selectedFile) return { inbound: [], outbound: [] };
    return computeFileDependencies(selectedFile.path, data.edges);
  }, [selectedFile, data.edges]);

  // 3. Compute Phase 6 Blast Radius (inbound walk, depth 2)
  const blastRadiusResult = useMemo<TransitiveWalkResult | null>(() => {
    if (!selectedFile) return null;
    return transitiveWalk(selectedFile.path, data.edges, filesMap, "inbound", 2);
  }, [selectedFile, data.edges, filesMap]);

  // 4. Compute Phase 6 Dependency Chain (outbound walk, depth 2)
  const dependencyChainResult = useMemo<TransitiveWalkResult | null>(() => {
    if (!selectedFile) return null;
    return transitiveWalk(selectedFile.path, data.edges, filesMap, "outbound", 2);
  }, [selectedFile, data.edges, filesMap]);

  // 5. Compute folder breakdown if a folded folder is selected
  const folderKinds = useMemo(() => {
    if (!selectedNode) return [];
    return computeFolderKindsBreakdown(selectedNode.files);
  }, [selectedNode]);

  // External connections for folder node
  const folderDeps = useMemo(() => {
    if (!selectedNode) return { inbound: [], outbound: [] };
    const folderFilePaths = new Set(selectedNode.files.map((f) => f.path));
    const inbound = new Set<string>();
    const outbound = new Set<string>();

    for (const edge of data.edges) {
      const sourceInFolder = folderFilePaths.has(edge.source);
      const targetInFolder = folderFilePaths.has(edge.target);

      if (!sourceInFolder && targetInFolder) {
        inbound.add(edge.source);
      } else if (sourceInFolder && !targetInFolder) {
        outbound.add(edge.target);
      }
    }

    return {
      inbound: Array.from(inbound).sort(),
      outbound: Array.from(outbound).sort(),
    };
  }, [selectedNode, data.edges]);

  // 6. Compute Phase 6 Insights (Orphans, Hotspots, Cycles, Oversized)
  const insights = useMemo(() => {
    return computeInsights(data.files, data.edges);
  }, [data.files, data.edges]);

  return (
    <aside
      aria-label="Selection details pane"
      className="flex w-96 shrink-0 flex-col border-l border-zinc-800 bg-[#0e1013]/95 backdrop-blur-xs select-none"
    >
      {/* Settled Two Tabs Header: Structure & Explanation */}
      <div className="flex h-11 border-b border-zinc-800/80 bg-[#0f1117] px-2">
        <button
          type="button"
          onClick={() => onTabChange("structure")}
          className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 font-mono text-xs font-medium transition-colors cursor-pointer ${
            activeTab === "structure"
              ? "border-sky-400 text-sky-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Structure</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("explanation")}
          className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 font-mono text-xs font-medium transition-colors cursor-pointer ${
            activeTab === "explanation"
              ? "border-sky-400 text-sky-400"
              : "border-transparent text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Explanation</span>
        </button>
      </div>

      {/* Pane Content Body */}
      <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
        {activeTab === "explanation" ? (
          /* ======================================================== */
          /* EXPLANATION TAB: Settled Empty State                     */
          /* ======================================================== */
          <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/20 p-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800/60 text-zinc-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <h4 className="mt-3 font-mono text-xs font-semibold text-zinc-200">
              Explanation
            </h4>
            <p className="mt-1.5 max-w-[240px] text-xs text-zinc-400 leading-relaxed">
              Nothing fills this until there is an explanation model call to fill it with.
            </p>
          </div>
        ) : selectedFile ? (
          /* ======================================================== */
          /* STRUCTURE TAB: Selected File View                       */
          /* ======================================================== */
          <div className="space-y-4">
            {/* File Path & Kind Header */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
                  style={{
                    backgroundColor: `${classifyFile(selectedFile.path).badgeColor}20`,
                    color: classifyFile(selectedFile.path).badgeColor,
                  }}
                >
                  {classifyFile(selectedFile.path).kind}
                </span>
              </div>
              <div
                className="font-mono text-xs font-semibold text-zinc-100 break-all select-text"
                title={selectedFile.path}
              >
                {selectedFile.path}
              </div>
            </div>

            {/* Metrics 4-grid */}
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 font-mono text-[11px]">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Lines</span>
                <div className="font-semibold text-zinc-200">{selectedFile.lines}</div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Size</span>
                <div className="font-semibold text-zinc-200">
                  {(selectedFile.bytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 uppercase">
                  <ArrowDownLeft className="h-3 w-3 text-sky-400" />
                  <span>Dependents</span>
                </div>
                <div className="font-semibold text-sky-300">{fileDeps.inbound.length}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 uppercase">
                  <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                  <span>Imports</span>
                </div>
                <div className="font-semibold text-emerald-300">{fileDeps.outbound.length}</div>
              </div>
            </div>

            {/* Phase 6: Graph Maths Action Buttons (Blast Radius & Dependency Chain) */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setWalkMode(walkMode === "blast" ? null : "blast")}
                className={`flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                  walkMode === "blast"
                    ? "bg-rose-500/25 border-rose-400 text-rose-200 ring-1 ring-rose-400/50"
                    : "border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                }`}
                title="Everything that breaks if this file changes (2 levels deep)"
              >
                <Zap className="h-3.5 w-3.5 text-rose-400" />
                <span>Blast radius</span>
              </button>

              <button
                type="button"
                onClick={() => setWalkMode(walkMode === "chain" ? null : "chain")}
                className={`flex items-center justify-center gap-1.5 rounded border px-2 py-1.5 font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                  walkMode === "chain"
                    ? "bg-sky-500/25 border-sky-400 text-sky-200 ring-1 ring-sky-400/50"
                    : "border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20"
                }`}
                title="Everything this file needs (2 levels deep)"
              >
                <LinkIcon className="h-3.5 w-3.5 text-sky-400" />
                <span>Dependency chain</span>
              </button>
            </div>

            {/* PHASE 6 VIEW: Blast Radius Results */}
            {walkMode === "blast" && blastRadiusResult && (
              <div className="space-y-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                <div className="flex items-center justify-between border-b border-rose-500/20 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-rose-400" />
                    <span className="font-mono text-xs font-semibold text-rose-200">
                      Blast Radius ({blastRadiusResult.results.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWalkMode(null)}
                    className="flex items-center gap-1 font-mono text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset</span>
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400">
                  Files that break if this file changes (2 levels deep):
                </p>

                {blastRadiusResult.results.length === 0 ? (
                  <div className="font-mono text-xs text-zinc-500 italic py-1">
                    No downstream dependents break.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                    {/* Group by Depth 1 and Depth 2 */}
                    {[1, 2].map((depth) => {
                      const filesAtDepth = blastRadiusResult.results.filter(
                        (r) => r.depth === depth
                      );
                      if (filesAtDepth.length === 0) return null;
                      return (
                        <div key={depth} className="space-y-1">
                          <div className="font-mono text-[10px] uppercase font-bold text-rose-300/80">
                            Depth {depth}: {depth === 1 ? "Direct Dependents" : "Transitive Dependents"} (
                            {filesAtDepth.length})
                          </div>
                          {filesAtDepth.map(({ filePath }) => {
                            const isHovered =
                              hoveredTarget?.type === "file" && hoveredTarget.id === filePath;
                            return (
                              <div
                                key={filePath}
                                onClick={() => onSelectFile(filePath)}
                                onMouseEnter={() => onHoverTarget({ type: "file", id: filePath })}
                                onMouseLeave={() => onHoverTarget(null)}
                                className={`group flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                                  isHovered
                                    ? "bg-rose-500/25 text-rose-200 ring-1 ring-rose-400/60"
                                    : "text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 hover:text-white"
                                }`}
                                title={filePath}
                              >
                                <span className="truncate pr-2">{filePath}</span>
                                <span className="shrink-0 rounded bg-rose-500/20 px-1 py-0.2 text-[9px] text-rose-300">
                                  d:{depth}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* PHASE 6 VIEW: Dependency Chain Results */}
            {walkMode === "chain" && dependencyChainResult && (
              <div className="space-y-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
                <div className="flex items-center justify-between border-b border-sky-500/20 pb-2">
                  <div className="flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5 text-sky-400" />
                    <span className="font-mono text-xs font-semibold text-sky-200">
                      Dependency Chain ({dependencyChainResult.results.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWalkMode(null)}
                    className="flex items-center gap-1 font-mono text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset</span>
                  </button>
                </div>

                <p className="text-[11px] text-zinc-400">
                  Files this file needs (2 levels deep):
                </p>

                {dependencyChainResult.results.length === 0 ? (
                  <div className="font-mono text-xs text-zinc-500 italic py-1">
                    No internal dependencies.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                    {[1, 2].map((depth) => {
                      const filesAtDepth = dependencyChainResult.results.filter(
                        (r) => r.depth === depth
                      );
                      if (filesAtDepth.length === 0) return null;
                      return (
                        <div key={depth} className="space-y-1">
                          <div className="font-mono text-[10px] uppercase font-bold text-sky-300/80">
                            Depth {depth}: {depth === 1 ? "Direct Dependencies" : "Transitive Dependencies"} (
                            {filesAtDepth.length})
                          </div>
                          {filesAtDepth.map(({ filePath }) => {
                            const isHovered =
                              hoveredTarget?.type === "file" && hoveredTarget.id === filePath;
                            return (
                              <div
                                key={filePath}
                                onClick={() => onSelectFile(filePath)}
                                onMouseEnter={() => onHoverTarget({ type: "file", id: filePath })}
                                onMouseLeave={() => onHoverTarget(null)}
                                className={`group flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                                  isHovered
                                    ? "bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/60"
                                    : "text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800 hover:text-white"
                                }`}
                                title={filePath}
                              >
                                <span className="truncate pr-2">{filePath}</span>
                                <span className="shrink-0 rounded bg-sky-500/20 px-1 py-0.2 text-[9px] text-sky-300">
                                  d:{depth}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Standard Inbound Dependents List */}
            {walkMode === null && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                      Imported By ({fileDeps.inbound.length})
                    </span>
                  </div>
                  {fileDeps.inbound.length === 0 ? (
                    <div className="font-mono text-[11px] text-zinc-500 italic py-1">
                      Nothing in the repository imports this file.
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-44 overflow-y-auto overscroll-contain pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                      {fileDeps.inbound.map((path) => {
                        const isHovered =
                          hoveredTarget?.type === "file" && hoveredTarget.id === path;
                        return (
                          <div
                            key={path}
                            onClick={() => onSelectFile(path)}
                            onMouseEnter={() => onHoverTarget({ type: "file", id: path })}
                            onMouseLeave={() => onHoverTarget(null)}
                            className={`group flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                              isHovered
                                ? "bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/60"
                                : "text-zinc-300 bg-zinc-900/40 hover:bg-zinc-800/80 hover:text-white"
                            }`}
                            title={`Click to focus: ${path}`}
                          >
                            <span className="truncate">{path}</span>
                            <ArrowDownLeft className="h-3 w-3 text-sky-400/70 shrink-0 opacity-0 group-hover:opacity-100" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Standard Outbound Imports List */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                      Imports ({fileDeps.outbound.length})
                    </span>
                  </div>
                  {fileDeps.outbound.length === 0 ? (
                    <div className="font-mono text-[11px] text-zinc-500 italic py-1">
                      This file has no internal imports.
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-44 overflow-y-auto overscroll-contain pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                      {fileDeps.outbound.map((path) => {
                        const isHovered =
                          hoveredTarget?.type === "file" && hoveredTarget.id === path;
                        return (
                          <div
                            key={path}
                            onClick={() => onSelectFile(path)}
                            onMouseEnter={() => onHoverTarget({ type: "file", id: path })}
                            onMouseLeave={() => onHoverTarget(null)}
                            className={`group flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                              isHovered
                                ? "bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/60"
                                : "text-zinc-300 bg-zinc-900/40 hover:bg-zinc-800/80 hover:text-white"
                            }`}
                            title={`Click to focus: ${path}`}
                          >
                            <span className="truncate">{path}</span>
                            <ArrowUpRight className="h-3 w-3 text-emerald-400/70 shrink-0 opacity-0 group-hover:opacity-100" />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : selectedNode ? (
          /* ======================================================== */
          /* STRUCTURE TAB: Selected Folded Folder View              */
          /* ======================================================== */
          <div className="space-y-4">
            {/* Folder Header */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Folder className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                  Folder Module
                </span>
              </div>
              <div className="font-mono text-sm font-semibold text-zinc-100">
                {selectedNode.label}
              </div>
              <div className="font-mono text-[10px] text-zinc-500 break-all">
                {selectedNode.folder}
              </div>
            </div>

            {/* Metrics 3-grid */}
            <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2 font-mono text-[11px]">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Files</span>
                <div className="font-semibold text-zinc-200">{selectedNode.fileCount}</div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Inbound</span>
                <div className="font-semibold text-sky-300">{selectedNode.fanIn}</div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Outbound</span>
                <div className="font-semibold text-emerald-300">{selectedNode.fanOut}</div>
              </div>
            </div>

            {/* Folder Kinds Breakdown */}
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                File Types ({folderKinds.length})
              </span>
              <div className="space-y-1">
                {folderKinds.map((k) => (
                  <div
                    key={k.kind}
                    className="flex items-center justify-between rounded bg-zinc-900/40 px-2 py-1 font-mono text-[11px]"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-xs shrink-0"
                        style={{ backgroundColor: k.color }}
                      />
                      <span className="text-zinc-300">{k.kind}</span>
                    </div>
                    <span className="text-zinc-400 font-semibold">{k.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Files List in this folder */}
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                Files in Folder ({selectedNode.files.length})
              </span>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                {selectedNode.files.map((f) => {
                  const isHovered = hoveredTarget?.type === "file" && hoveredTarget.id === f.path;
                  return (
                    <div
                      key={f.path}
                      onClick={() => onSelectFile(f.path)}
                      onMouseEnter={() => onHoverTarget({ type: "file", id: f.path })}
                      onMouseLeave={() => onHoverTarget(null)}
                      className={`group flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                        isHovered
                          ? "bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/60"
                          : "text-zinc-300 bg-zinc-900/40 hover:bg-zinc-800/80 hover:text-white"
                      }`}
                      title={f.path}
                    >
                      <span className="truncate">{f.path.split("/").pop()}</span>
                      <span className="text-[10px] text-zinc-500">{f.lines}L</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* External Inbound Dependencies */}
            {folderDeps.inbound.length > 0 && (
              <div className="space-y-1.5">
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  External Inbound ({folderDeps.inbound.length})
                </span>
                <div className="space-y-1 max-h-36 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                  {folderDeps.inbound.map((path) => (
                    <div
                      key={path}
                      onClick={() => onSelectFile(path)}
                      onMouseEnter={() => onHoverTarget({ type: "file", id: path })}
                      onMouseLeave={() => onHoverTarget(null)}
                      className="truncate rounded bg-zinc-900/40 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                      title={path}
                    >
                      {path}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ======================================================== */
          /* RESTING STATE: Repository Summary (Click Nothing View)   */
          /* ======================================================== */
          <div className="space-y-4">
            {/* Repository Title & Detected Framework */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <GitBranch className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span className="font-mono text-xs font-bold text-zinc-100 truncate">
                    {repoSummary.name}
                  </span>
                </div>
                <span className="shrink-0 rounded bg-sky-500/15 border border-sky-400/30 px-2 py-0.5 font-mono text-[10px] font-medium text-sky-300">
                  {repoSummary.framework}
                </span>
              </div>
            </div>

            {/* Overall Counts Grid */}
            <div className="grid grid-cols-3 gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 font-mono text-[11px]">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Files</span>
                <div className="font-semibold text-zinc-100">{repoSummary.totalFiles}</div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Imports</span>
                <div className="font-semibold text-sky-400">{repoSummary.totalEdges}</div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Routes</span>
                <div className="font-semibold text-purple-400">{repoSummary.routeCount}</div>
              </div>
            </div>

            {/* Convention identification status */}
            <div className="flex items-center justify-between rounded border border-zinc-800/80 bg-zinc-900/30 px-2.5 py-1.5 font-mono text-[10px] text-zinc-400">
              <div className="flex items-center gap-1.5">
                <FileQuestion className="h-3 w-3 text-zinc-500" />
                <span>Unclassified modules</span>
              </div>
              <span className="text-zinc-200 font-semibold">{repoSummary.unclassifiedCount}</span>
            </div>

            {/* PHASE 6: Insights Panel (Starts collapsed, never first thing you see) */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
              <button
                type="button"
                onClick={() => setIsInsightsOpen(!isInsightsOpen)}
                className="flex w-full items-center justify-between px-3 py-2 text-left cursor-pointer hover:bg-zinc-800/60 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  <span className="font-mono text-xs font-semibold text-zinc-200">
                    Insights
                  </span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
                    {insights.totalCount} facts
                  </span>
                </div>
                {isInsightsOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                )}
              </button>

              {isInsightsOpen && (
                <div className="border-t border-zinc-800/80 p-3 space-y-4">
                  {/* 1. Files nothing imports (LEADS THE LIST per Phase 6 spec) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                        Files nothing imports ({insights.orphans.length})
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug">
                      {insights.orphans[0]?.sentence || "Files nothing imports directly in the repository."}
                    </p>
                    {insights.orphans.length === 0 ? (
                      <div className="font-mono text-[10px] text-zinc-500 italic">None detected.</div>
                    ) : (
                      <div className="space-y-1 max-h-36 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                        {insights.orphans.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => onSelectFile(item.files[0])}
                            className="truncate rounded bg-zinc-900/60 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                            title={item.files[0]}
                          >
                            {item.files[0]}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 2. Files an unusual number of things import (Hotspots) */}
                  <div className="space-y-1.5 border-t border-zinc-800/60 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                        Unusual dependents ({insights.hotspots.length})
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug">
                      {insights.hotspots[0]?.sentence || "Files an unusual number of things import."}
                    </p>
                    {insights.hotspots.length === 0 ? (
                      <div className="font-mono text-[10px] text-zinc-500 italic">None detected.</div>
                    ) : (
                      <div className="space-y-1 max-h-36 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                        {insights.hotspots.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => onSelectFile(item.files[0])}
                            className="flex items-center justify-between rounded bg-zinc-900/60 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                            title={item.files[0]}
                          >
                            <span className="truncate pr-2">{item.files[0]}</span>
                            <span className="shrink-0 rounded bg-sky-500/20 px-1 py-0.2 text-[10px] font-semibold text-sky-300">
                              {item.meta?.dependentsCount} in
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3. Import cycles */}
                  <div className="space-y-1.5 border-t border-zinc-800/60 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                        Import cycles ({insights.cycles.length})
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug">
                      {insights.cycles[0]?.sentence || "Circular dependencies between files in the repository."}
                    </p>
                    {insights.cycles.length === 0 ? (
                      <div className="font-mono text-[10px] text-zinc-500 italic">No cycles detected.</div>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                        {insights.cycles.map((item) => {
                          const isExpanded = expandedCycleId === item.id;
                          return (
                            <div key={item.id} className="rounded bg-zinc-900/60 p-1.5 font-mono text-[11px]">
                              <div
                                onClick={() =>
                                  setExpandedCycleId(isExpanded ? null : item.id)
                                }
                                className="flex items-center justify-between cursor-pointer text-amber-300 hover:text-amber-200"
                              >
                                <span className="font-semibold truncate">
                                  {item.meta?.cycleLength}-file cycle
                                </span>
                                <span className="text-[10px] text-zinc-500">
                                  {isExpanded ? "hide" : "view loop"}
                                </span>
                              </div>
                              {isExpanded && (
                                <div className="mt-2 space-y-1 border-t border-zinc-800 pt-1.5 pl-2">
                                  {item.files.map((file, fIdx) => (
                                    <div
                                      key={`${file}-${fIdx}`}
                                      onClick={() => onSelectFile(file)}
                                      className="truncate text-[10px] text-zinc-300 hover:text-sky-300 cursor-pointer"
                                      title={file}
                                    >
                                      &bull; {file}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 4. Files that are simply too long (Oversized) */}
                  <div className="space-y-1.5 border-t border-zinc-800/60 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                        Oversized files ({insights.oversized.length})
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 leading-snug">
                      {insights.oversized[0]?.sentence || "Files that are simply too long."}
                    </p>
                    {insights.oversized.length === 0 ? (
                      <div className="font-mono text-[10px] text-zinc-500 italic">None detected.</div>
                    ) : (
                      <div className="space-y-1 max-h-36 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                        {insights.oversized.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => onSelectFile(item.files[0])}
                            className="flex items-center justify-between rounded bg-zinc-900/60 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                            title={item.files[0]}
                          >
                            <span className="truncate pr-2">{item.files[0]}</span>
                            <span className="shrink-0 rounded bg-zinc-800 px-1 py-0.2 text-[10px] text-zinc-400">
                              {item.meta?.linesCount}L
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Ranked List 1: What the repository leans on most (Highest Fan-In) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Compass className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  Most Depended-On Files
                </span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto overscroll-contain pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                {repoSummary.mostDependedFiles.map(({ file, count }) => {
                  const isHovered = hoveredTarget?.type === "file" && hoveredTarget.id === file.path;
                  return (
                    <div
                      key={file.path}
                      onClick={() => onSelectFile(file.path)}
                      onMouseEnter={() => onHoverTarget({ type: "file", id: file.path })}
                      onMouseLeave={() => onHoverTarget(null)}
                      className={`group flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                        isHovered
                          ? "bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/60"
                          : "text-zinc-300 bg-zinc-900/40 hover:bg-zinc-800/80 hover:text-white"
                      }`}
                      title={file.path}
                    >
                      <span className="truncate pr-2">{file.path}</span>
                      <span className="shrink-0 rounded bg-sky-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-sky-300">
                        {count} in
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ranked List 2: Where reading starts (Fan-In = 0, nothing imports it) */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  Where Reading Starts (0 Inbound)
                </span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto overscroll-contain pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                {repoSummary.entrypointFiles.map((file) => {
                  const isHovered = hoveredTarget?.type === "file" && hoveredTarget.id === file.path;
                  return (
                    <div
                      key={file.path}
                      onClick={() => onSelectFile(file.path)}
                      onMouseEnter={() => onHoverTarget({ type: "file", id: file.path })}
                      onMouseLeave={() => onHoverTarget(null)}
                      className={`group flex items-center justify-between rounded px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                        isHovered
                          ? "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/60"
                          : "text-zinc-300 bg-zinc-900/40 hover:bg-zinc-800/80 hover:text-white"
                      }`}
                      title={file.path}
                    >
                      <span className="truncate pr-2">{file.path}</span>
                      {file.fanOut > 0 && (
                        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-400">
                          {file.fanOut} out
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
