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
  Globe,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RotateCw,
  CheckCircle2,
  Tag,
} from "lucide-react";
import type { ParserResult, ParsedFile } from "@/lib/parser/types";
import type { FoldedNode } from "@/lib/canvas/folding";
import { FormattedProse } from "@/components/canvas/formatted-prose";
import {
  classifyFile,
  computeRepoSummary,
  computeFileDependencies,
  computeFolderKindsBreakdown,
} from "@/lib/canvas/analysis-helpers";
import {
  transitiveWalk,
  computeInsights,
} from "@/lib/canvas/graph-maths";
import {
  getCategoryDefinition,
  FRAMEWORK_TAXONOMIES,
  type FrameworkType,
} from "@/lib/taxonomy";

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
  analysisId?: string;
  commitSha?: string | null;
  repositoryUrl?: string | null;
  onRerun?: () => void;
}

function getMethodBadgeClass(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
    case "POST":
      return "bg-sky-500/15 text-sky-400 border border-sky-500/30";
    case "PUT":
      return "bg-amber-500/15 text-amber-400 border border-amber-500/30";
    case "DELETE":
      return "bg-rose-500/15 text-rose-400 border border-rose-500/30";
    case "PATCH":
      return "bg-purple-500/15 text-purple-400 border border-purple-500/30";
    default:
      return "bg-zinc-800 text-zinc-300 border border-zinc-700";
  }
}

export function DetailPane({
  data,
  selection,
  activeTab,
  onTabChange,
  onSelectFile,
  hoveredTarget,
  onHoverTarget,
  analysisId,
  commitSha,
  onRerun,
}: DetailPaneProps) {
  const selectedFile = selection?.file;
  const selectedNode = selection?.node;

  // Walk Mode for selected file (blast radius vs dependency chain)
  const [walkMode, setWalkMode] = useState<"blast" | "chain" | null>(null);

  // Insights panel collapsed by default
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [expandedCycleId, setExpandedCycleId] = useState<string | null>(null);

  // Route search filter
  const [routeSearchQuery, setRouteSearchQuery] = useState("");

  // AI-classified roles override
  const [dynamicRoles, setDynamicRoles] = useState<Record<string, string>>({});
  const [isClassifyingRole, setIsClassifyingRole] = useState(false);

  // Client-side explanation cache: persists across selection changes!
  interface CachedExplanationUI {
    content: string;
    cached: boolean;
    isStale: boolean;
    commitSha: string | null;
    latestCommitSha: string | null;
    tracingActive: boolean;
  }
  const [explanationsCache, setExplanationsCache] = useState<Record<string, CachedExplanationUI>>({});
  const [isExplaining, setIsExplaining] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Set of all repository paths and folders for linkifying prose
  const allRepoPaths = useMemo(() => {
    const paths = new Set<string>();
    for (const f of data.files) {
      paths.add(f.path);
    }
    for (const folder of data.folders || []) {
      paths.add(folder);
    }
    return paths;
  }, [data.files, data.folders]);

  // Handle Explain request
  const handleExplain = async (targetType: "file" | "folder", targetPath: string) => {
    if (!analysisId) return;
    const cacheKey = targetType === "file" ? targetPath : `folder:${targetPath}`;
    setIsExplaining(true);
    setExplainError(null);

    try {
      const res = await fetch("/api/ai/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          targetType,
          targetPath,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setExplanationsCache((prev) => ({
        ...prev,
        [cacheKey]: {
          content: result.content,
          cached: result.cached,
          isStale: result.isStale,
          commitSha: result.commitSha,
          latestCommitSha: result.latestCommitSha,
          tracingActive: result.tracingActive,
        },
      }));
    } catch (err) {
      setExplainError(err instanceof Error ? err.message : "Failed to generate explanation");
    } finally {
      setIsExplaining(false);
    }
  };

  // Handle AI Role classification
  const handleClassifyRole = async (filePath: string) => {
    if (!analysisId) return;
    setIsClassifyingRole(true);
    try {
      const res = await fetch("/api/ai/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          filePath,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const result = await res.json();
      if (result.role) {
        setDynamicRoles((prev) => ({
          ...prev,
          [filePath]: result.role,
        }));
      }
    } catch (err) {
      console.error("Failed to classify role:", err);
    } finally {
      setIsClassifyingRole(false);
    }
  };

  // Map file path -> formal role from parser results
  const roleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data.roles || []) {
      map.set(r.file, r.role);
    }
    return map;
  }, [data.roles]);

  // Pre-indexed files map for O(1) lookups
  const filesMap = useMemo(() => {
    const map = new Map<string, ParsedFile>();
    for (const f of data.files) {
      map.set(f.path, f);
    }
    return map;
  }, [data.files]);

  // Detected framework
  const frameworkType = (data.framework as FrameworkType) || "fallback";
  const frameworkTaxonomy = FRAMEWORK_TAXONOMIES[frameworkType] || FRAMEWORK_TAXONOMIES.fallback;

  // Unclassified modules count (Generic role)
  const unclassifiedCount = useMemo(() => {
    let count = 0;
    for (const f of data.files) {
      const role = roleMap.get(f.path);
      if (!role || role === "Generic" || role === "Unclassified Module") {
        count++;
      }
    }
    return count;
  }, [data.files, roleMap]);

  // 1. Compute repository resting state summary
  const repoSummary = useMemo(() => {
    return computeRepoSummary(
      data.files,
      data.edges,
      data.repositoryRoot,
      frameworkTaxonomy.label,
      data.routes?.length || 0,
      unclassifiedCount
    );
  }, [data.files, data.edges, data.repositoryRoot, frameworkTaxonomy.label, data.routes?.length, unclassifiedCount]);

  // 2. Compute file-level dependency lists if a file is selected
  const fileDeps = useMemo(() => {
    if (!selectedFile) return { inbound: [], outbound: [] };
    return computeFileDependencies(selectedFile.path, data.edges);
  }, [selectedFile, data.edges]);

  // 3. Compute Blast Radius (inbound walk, depth 2)
  const blastRadiusLevels = useMemo(() => {
    if (!selectedFile) return { level1: [] as string[], level2: [] as string[], total: 0 };
    const res = transitiveWalk(selectedFile.path, data.edges, filesMap, "inbound", 2);
    const level1 = res.results.filter((r) => r.depth === 1).map((r) => r.filePath);
    const level2 = res.results.filter((r) => r.depth === 2).map((r) => r.filePath);
    return { level1, level2, total: res.results.length };
  }, [selectedFile, data.edges, filesMap]);

  // 4. Compute Dependency Chain (outbound walk, depth 2)
  const dependencyChainLevels = useMemo(() => {
    if (!selectedFile) return { level1: [] as string[], level2: [] as string[], total: 0 };
    const res = transitiveWalk(selectedFile.path, data.edges, filesMap, "outbound", 2);
    const level1 = res.results.filter((r) => r.depth === 1).map((r) => r.filePath);
    const level2 = res.results.filter((r) => r.depth === 2).map((r) => r.filePath);
    return { level1, level2, total: res.results.length };
  }, [selectedFile, data.edges, filesMap]);

  // 5. Compute folder breakdown if a folded folder is selected
  const folderKinds = useMemo(() => {
    if (!selectedNode) return {};
    return computeFolderKindsBreakdown(selectedNode.files);
  }, [selectedNode]);

  // 6. Compute folder-level external dependencies
  const folderDeps = useMemo(() => {
    if (!selectedNode) return { inbound: [], outbound: [] };
    const folderFilePaths = new Set(selectedNode.files.map((f) => f.path));
    const inbound = new Set<string>();
    const outbound = new Set<string>();

    for (const edge of data.edges) {
      const sourceIn = folderFilePaths.has(edge.source);
      const targetIn = folderFilePaths.has(edge.target);

      if (targetIn && !sourceIn) {
        inbound.add(edge.source);
      } else if (sourceIn && !targetIn) {
        outbound.add(edge.target);
      }
    }

    return {
      inbound: Array.from(inbound).sort(),
      outbound: Array.from(outbound).sort(),
    };
  }, [selectedNode, data.edges]);

  // 7. Compute deterministic structural insights
  const insights = useMemo(() => {
    return computeInsights(data.files, data.edges);
  }, [data.files, data.edges]);

  // 8. Declared routes for currently selected file
  const selectedFileRoutes = useMemo(() => {
    if (!selectedFile || !data.routes) return [];
    return data.routes.filter((r) => r.file === selectedFile.path);
  }, [selectedFile, data.routes]);

  // Filtered routes for resting state route table
  const filteredRoutes = useMemo(() => {
    if (!data.routes) return [];
    if (!routeSearchQuery.trim()) return data.routes;
    const query = routeSearchQuery.toLowerCase().trim();
    return data.routes.filter(
      (r) =>
        r.path.toLowerCase().includes(query) ||
        r.method.toLowerCase().includes(query) ||
        r.file.toLowerCase().includes(query)
    );
  }, [data.routes, routeSearchQuery]);

  // Concrete role of selected file
  const selectedFileRole = selectedFile
    ? dynamicRoles[selectedFile.path] || roleMap.get(selectedFile.path) || classifyFile(selectedFile.path).kind
    : null;
  const categoryDef = selectedFileRole
    ? getCategoryDefinition(frameworkType, selectedFileRole)
    : null;

  return (
    <aside
      aria-label="Detail inspection pane"
      className="flex w-96 shrink-0 flex-col border-l border-zinc-800 bg-[#0e1013]/90 backdrop-blur-xs select-none"
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
          /* EXPLANATION TAB: Phase 10 Cached & Traced Explanation     */
          /* ======================================================== */
          selectedFile ? (
            /* 1. Selected File Explanation */
            <div className="space-y-3.5">
              {/* Header */}
              <div className="space-y-1.5 pb-2 border-b border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <FileCode className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                    <span
                      className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
                      style={{
                        backgroundColor: `${categoryDef?.color || "#64748b"}20`,
                        color: categoryDef?.color || "#94a3b8",
                      }}
                    >
                      {selectedFileRole}
                    </span>
                  </div>
                  {(!selectedFileRole || selectedFileRole.toLowerCase() === "generic") && (
                    <button
                      type="button"
                      onClick={() => handleClassifyRole(selectedFile.path)}
                      disabled={isClassifyingRole}
                      className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 hover:text-white border border-zinc-700 cursor-pointer"
                      title="Assign non-structural role with AI"
                    >
                      {isClassifyingRole ? (
                        <RotateCw className="h-2.5 w-2.5 animate-spin text-sky-400" />
                      ) : (
                        <Tag className="h-2.5 w-2.5 text-sky-400" />
                      )}
                      <span>Classify role</span>
                    </button>
                  )}
                </div>
                <div className="font-mono text-xs font-semibold text-zinc-100 break-all select-text">
                  {selectedFile.path}
                </div>
              </div>

              {/* Explanation Content or Prompt */}
              {explanationsCache[selectedFile.path] ? (
                (() => {
                  const exp = explanationsCache[selectedFile.path];
                  return (
                    <div className="space-y-3">
                      {/* Meta Status Badges Bar */}
                      <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {exp.cached ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                              <span>Cached (0 tokens)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-sky-950/60 border border-sky-800/60 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                              <Sparkles className="h-2.5 w-2.5 text-sky-400" />
                              <span>Fresh call</span>
                            </span>
                          )}

                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] border ${
                              exp.tracingActive
                                ? "bg-zinc-900 border-zinc-800 text-zinc-300"
                                : "bg-amber-950/40 border-amber-800/50 text-amber-300"
                            }`}
                          >
                            <span>{exp.tracingActive ? "Traced: cartograph" : "Tracing unconfigured"}</span>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleExplain("file", selectedFile.path)}
                          disabled={isExplaining}
                          className="inline-flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:text-zinc-200 border border-zinc-800 cursor-pointer"
                          title="Re-run explanation"
                        >
                          <RotateCw className={`h-2.5 w-2.5 ${isExplaining ? "animate-spin text-sky-400" : ""}`} />
                          <span>Re-explain</span>
                        </button>
                      </div>

                      {/* Staleness Banner */}
                      {exp.isStale && (
                        <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-950/20 p-2.5">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-amber-300">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span>Explanation is stale</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-tight">
                            The repository has moved past analysed commit{" "}
                            <span className="font-mono text-zinc-200">{commitSha?.slice(0, 7)}</span>
                            {exp.latestCommitSha && (
                              <> (latest: <span className="font-mono text-zinc-200">{exp.latestCommitSha.slice(0, 7)}</span>)</>
                            )}
                            .
                          </p>
                          {onRerun && (
                            <button
                              type="button"
                              onClick={onRerun}
                              className="mt-1 inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                            >
                              <RotateCw className="h-2.5 w-2.5" />
                              <span>Re-analyse repository</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Formatted Prose Content with Linked Neighbour Paths */}
                      <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-3">
                        <FormattedProse
                          content={exp.content}
                          knownPaths={allRepoPaths}
                          onSelectPath={onSelectFile}
                        />
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-center">
                  <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-sky-950/50 text-sky-400 border border-sky-800/50">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-mono text-xs font-semibold text-zinc-200">
                      Explain this file
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-snug">
                      Generates a concise architectural summary written from this file and its real neighbours ({fileDeps.inbound.length} inbound, {fileDeps.outbound.length} imports).
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExplain("file", selectedFile.path)}
                    disabled={isExplaining}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-500/20 border border-sky-400/40 px-3 py-1.5 font-mono text-xs font-semibold text-sky-200 hover:bg-sky-500/30 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isExplaining ? (
                      <>
                        <RotateCw className="h-3.5 w-3.5 animate-spin text-sky-400" />
                        <span>Explaining file...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                        <span>Explain</span>
                      </>
                    )}
                  </button>

                  {explainError && (
                    <div className="rounded border border-rose-800/60 bg-rose-950/30 p-2 font-mono text-[10px] text-rose-300">
                      {explainError}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : selectedNode ? (
            /* 2. Selected Folded Folder Explanation */
            <div className="space-y-3.5">
              {/* Header */}
              <div className="space-y-1.5 pb-2 border-b border-zinc-800/80">
                <div className="flex items-center gap-1.5">
                  <Folder className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 uppercase">
                    Folded Folder &middot; {selectedNode.fileCount} files
                  </span>
                </div>
                <div className="font-mono text-xs font-semibold text-zinc-100 break-all select-text">
                  {selectedNode.folder === "." ? "Root" : selectedNode.folder}
                </div>
              </div>

              {/* Folder Explanation Content or Prompt */}
              {explanationsCache[`folder:${selectedNode.folder}`] ? (
                (() => {
                  const exp = explanationsCache[`folder:${selectedNode.folder}`];
                  return (
                    <div className="space-y-3">
                      {/* Meta Status Badges Bar */}
                      <div className="flex items-center justify-between gap-1.5 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {exp.cached ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                              <span>Cached (0 tokens)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-sky-950/60 border border-sky-800/60 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                              <Sparkles className="h-2.5 w-2.5 text-sky-400" />
                              <span>Fresh call</span>
                            </span>
                          )}

                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] border ${
                              exp.tracingActive
                                ? "bg-zinc-900 border-zinc-800 text-zinc-300"
                                : "bg-amber-950/40 border-amber-800/50 text-amber-300"
                            }`}
                          >
                            <span>{exp.tracingActive ? "Traced: cartograph" : "Tracing unconfigured"}</span>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleExplain("folder", selectedNode.folder)}
                          disabled={isExplaining}
                          className="inline-flex items-center gap-1 rounded bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:text-zinc-200 border border-zinc-800 cursor-pointer"
                          title="Re-run folder explanation"
                        >
                          <RotateCw className={`h-2.5 w-2.5 ${isExplaining ? "animate-spin text-sky-400" : ""}`} />
                          <span>Re-explain</span>
                        </button>
                      </div>

                      {/* Staleness Banner */}
                      {exp.isStale && (
                        <div className="space-y-1.5 rounded-md border border-amber-500/40 bg-amber-950/20 p-2.5">
                          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-amber-300">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span>Explanation is stale</span>
                          </div>
                          <p className="text-[11px] text-zinc-400 leading-tight">
                            The repository commit has moved past {commitSha?.slice(0, 7)}.
                          </p>
                          {onRerun && (
                            <button
                              type="button"
                              onClick={onRerun}
                              className="mt-1 inline-flex items-center gap-1 rounded bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                            >
                              <RotateCw className="h-2.5 w-2.5" />
                              <span>Re-analyse repository</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Formatted Prose Content */}
                      <div className="rounded-lg border border-zinc-800/90 bg-zinc-950/50 p-3">
                        <FormattedProse
                          content={exp.content}
                          knownPaths={allRepoPaths}
                          onSelectPath={onSelectFile}
                        />
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-center">
                  <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-sky-950/50 text-sky-400 border border-sky-800/50">
                    <Folder className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-mono text-xs font-semibold text-zinc-200">
                      Explain this folded folder
                    </h4>
                    <p className="text-[11px] text-zinc-400 leading-snug">
                      Explains what is in this subsystem ({selectedNode.fileCount} files) and why {folderDeps.inbound.length} external modules point at it.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExplain("folder", selectedNode.folder)}
                    disabled={isExplaining}
                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-sky-500/20 border border-sky-400/40 px-3 py-1.5 font-mono text-xs font-semibold text-sky-200 hover:bg-sky-500/30 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isExplaining ? (
                      <>
                        <RotateCw className="h-3.5 w-3.5 animate-spin text-sky-400" />
                        <span>Explaining folder...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                        <span>Explain Folder</span>
                      </>
                    )}
                  </button>

                  {explainError && (
                    <div className="rounded border border-rose-800/60 bg-rose-950/30 p-2 font-mono text-[10px] text-rose-300">
                      {explainError}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* 3. Resting State (Nothing selected) */
            <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/80 bg-zinc-900/20 p-6 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800/60 text-zinc-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <h4 className="mt-3 font-mono text-xs font-semibold text-zinc-200">
                Architectural Explanation
              </h4>
              <p className="mt-1.5 max-w-[240px] text-xs text-zinc-400 leading-relaxed">
                Select a file or folded folder on the map and click Explain to see its role in the context of its actual neighbours.
              </p>
            </div>
          )
        ) : selectedFile ? (
          /* ======================================================== */
          /* STRUCTURE TAB: Selected File View                       */
          /* ======================================================== */
          <div className="space-y-4">
            {/* File Path & Framework Concrete Role Header */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FileCode className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[10px] font-medium"
                    style={{
                      backgroundColor: `${categoryDef?.color || "#64748b"}20`,
                      color: categoryDef?.color || "#94a3b8",
                    }}
                  >
                    {selectedFileRole}
                  </span>
                </div>
                {(!selectedFileRole || selectedFileRole.toLowerCase() === "generic") && (
                  <button
                    type="button"
                    onClick={() => handleClassifyRole(selectedFile.path)}
                    disabled={isClassifyingRole}
                    className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 hover:text-white border border-zinc-700 cursor-pointer"
                    title="Assign non-structural role with AI"
                  >
                    {isClassifyingRole ? (
                      <RotateCw className="h-2.5 w-2.5 animate-spin text-sky-400" />
                    ) : (
                      <Tag className="h-2.5 w-2.5 text-sky-400" />
                    )}
                    <span>Classify role</span>
                  </button>
                )}
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

            {/* Declared Routes for this specific file */}
            {selectedFileRoutes.length > 0 && (
              <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                    Declared Routes ({selectedFileRoutes.length})
                  </span>
                </div>
                <div className="space-y-1 pt-1">
                  {selectedFileRoutes.map((route, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded bg-zinc-950/60 px-2 py-1 font-mono text-[11px] border border-zinc-800/80"
                    >
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${getMethodBadgeClass(
                          route.method
                        )}`}
                      >
                        {route.method}
                      </span>
                      <span className="text-zinc-200 font-semibold truncate select-text">
                        {route.path}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Walk Modes Toggle Bar */}
            <div className="flex items-center gap-2 border-t border-zinc-800/80 pt-3">
              <button
                type="button"
                onClick={() => setWalkMode(walkMode === "blast" ? null : "blast")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded px-2 py-1.5 font-mono text-[11px] font-medium transition-colors cursor-pointer border ${
                  walkMode === "blast"
                    ? "bg-amber-500/20 text-amber-300 border-amber-400/50 shadow-xs"
                    : "bg-zinc-900/60 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white"
                }`}
                title="Walk 2 levels inbound: what breaks if this file changes?"
              >
                <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span>Blast Radius</span>
              </button>

              <button
                type="button"
                onClick={() => setWalkMode(walkMode === "chain" ? null : "chain")}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded px-2 py-1.5 font-mono text-[11px] font-medium transition-colors cursor-pointer border ${
                  walkMode === "chain"
                    ? "bg-indigo-500/20 text-indigo-300 border-indigo-400/50 shadow-xs"
                    : "bg-zinc-900/60 text-zinc-300 border-zinc-800 hover:bg-zinc-800 hover:text-white"
                }`}
                title="Walk 2 levels outbound: what does this file depend on downstream?"
              >
                <LinkIcon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                <span>Chain</span>
              </button>
            </div>

            {/* BLAST RADIUS WALK VIEW */}
            {walkMode === "blast" && (
              <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-950/10 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-mono text-xs font-semibold text-amber-300">
                      Blast Radius ({blastRadiusLevels.total} files)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWalkMode(null)}
                    className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    close
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Files directly or transitively affected within 2 dependency hops if this file changes.
                </p>

                {/* Level 1: Direct Dependents */}
                <div className="space-y-1">
                  <span className="font-mono text-[10px] font-semibold text-amber-400 uppercase">
                    Level 1 &middot; Direct Dependents ({blastRadiusLevels.level1.length})
                  </span>
                  {blastRadiusLevels.level1.length === 0 ? (
                    <div className="font-mono text-[10px] text-zinc-500 italic">None (safe to modify in isolation)</div>
                  ) : (
                    <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                      {blastRadiusLevels.level1.map((p: string) => (
                        <div
                          key={p}
                          onClick={() => onSelectFile(p)}
                          onMouseEnter={() => onHoverTarget({ type: "file", id: p })}
                          onMouseLeave={() => onHoverTarget(null)}
                          className="truncate rounded bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-amber-200 cursor-pointer"
                          title={p}
                        >
                          {p}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Level 2: Transitive Dependents */}
                <div className="space-y-1 border-t border-amber-900/40 pt-2">
                  <span className="font-mono text-[10px] font-semibold text-amber-400/80 uppercase">
                    Level 2 &middot; Transitive Impact ({blastRadiusLevels.level2.length})
                  </span>
                  {blastRadiusLevels.level2.length === 0 ? (
                    <div className="font-mono text-[10px] text-zinc-500 italic">No secondary files affected</div>
                  ) : (
                    <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                      {blastRadiusLevels.level2.map((p: string) => (
                        <div
                          key={p}
                          onClick={() => onSelectFile(p)}
                          onMouseEnter={() => onHoverTarget({ type: "file", id: p })}
                          onMouseLeave={() => onHoverTarget(null)}
                          className="truncate rounded bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-amber-200 cursor-pointer"
                          title={p}
                        >
                          {p}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* DEPENDENCY CHAIN WALK VIEW */}
            {walkMode === "chain" && (
              <div className="space-y-3 rounded-lg border border-indigo-500/30 bg-indigo-950/10 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="font-mono text-xs font-semibold text-indigo-300">
                      Dependency Chain ({dependencyChainLevels.total} files)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWalkMode(null)}
                    className="font-mono text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    close
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Files imported directly and secondary modules imported downstream.
                </p>

                {/* Level 1: Direct Imports */}
                <div className="space-y-1">
                  <span className="font-mono text-[10px] font-semibold text-indigo-400 uppercase">
                    Level 1 &middot; Direct Imports ({dependencyChainLevels.level1.length})
                  </span>
                  {dependencyChainLevels.level1.length === 0 ? (
                    <div className="font-mono text-[10px] text-zinc-500 italic">Leaves file (no repository imports)</div>
                  ) : (
                    <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                      {dependencyChainLevels.level1.map((p: string) => (
                        <div
                          key={p}
                          onClick={() => onSelectFile(p)}
                          onMouseEnter={() => onHoverTarget({ type: "file", id: p })}
                          onMouseLeave={() => onHoverTarget(null)}
                          className="truncate rounded bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 hover:text-indigo-200 cursor-pointer"
                          title={p}
                        >
                          {p}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Level 2: Secondary Imports */}
                <div className="space-y-1 border-t border-indigo-900/40 pt-2">
                  <span className="font-mono text-[10px] font-semibold text-indigo-400/80 uppercase">
                    Level 2 &middot; Secondary Downstream ({dependencyChainLevels.level2.length})
                  </span>
                  {dependencyChainLevels.level2.length === 0 ? (
                    <div className="font-mono text-[10px] text-zinc-500 italic">No secondary dependencies</div>
                  ) : (
                    <div className="space-y-0.5 max-h-32 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                      {dependencyChainLevels.level2.map((p: string) => (
                        <div
                          key={p}
                          onClick={() => onSelectFile(p)}
                          onMouseEnter={() => onHoverTarget({ type: "file", id: p })}
                          onMouseLeave={() => onHoverTarget(null)}
                          className="truncate rounded bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px] text-zinc-400 hover:bg-zinc-800 hover:text-indigo-200 cursor-pointer"
                          title={p}
                        >
                          {p}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Inbound Dependencies (What imports this file) */}
            <div className="space-y-1.5 border-t border-zinc-800/80 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  Imported By ({fileDeps.inbound.length})
                </span>
              </div>
              {fileDeps.inbound.length === 0 ? (
                <div className="rounded bg-zinc-900/30 p-2 font-mono text-[10px] text-zinc-500 italic">
                  Nothing imports this file directly.
                </div>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto overscroll-contain pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                  {fileDeps.inbound.map((path) => {
                    const isHovered = hoveredTarget?.type === "file" && hoveredTarget.id === path;
                    return (
                      <div
                        key={path}
                        onClick={() => onSelectFile(path)}
                        onMouseEnter={() => onHoverTarget({ type: "file", id: path })}
                        onMouseLeave={() => onHoverTarget(null)}
                        className={`truncate rounded px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                          isHovered
                            ? "bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/60"
                            : "text-zinc-300 bg-zinc-900/40 hover:bg-zinc-800/80 hover:text-white"
                        }`}
                        title={path}
                      >
                        {path}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Outbound Dependencies (What this file imports) */}
            <div className="space-y-1.5 border-t border-zinc-800/80 pt-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  Imports ({fileDeps.outbound.length})
                </span>
              </div>
              {fileDeps.outbound.length === 0 ? (
                <div className="rounded bg-zinc-900/30 p-2 font-mono text-[10px] text-zinc-500 italic">
                  Leaf module (imports no local files).
                </div>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto overscroll-contain pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                  {fileDeps.outbound.map((path) => {
                    const isHovered = hoveredTarget?.type === "file" && hoveredTarget.id === path;
                    return (
                      <div
                        key={path}
                        onClick={() => onSelectFile(path)}
                        onMouseEnter={() => onHoverTarget({ type: "file", id: path })}
                        onMouseLeave={() => onHoverTarget(null)}
                        className={`truncate rounded px-2 py-1 font-mono text-[11px] cursor-pointer transition-colors ${
                          isHovered
                            ? "bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/60"
                            : "text-zinc-300 bg-zinc-900/40 hover:bg-zinc-800/80 hover:text-white"
                        }`}
                        title={path}
                      >
                        {path}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : selectedNode ? (
          /* ======================================================== */
          /* STRUCTURE TAB: Selected Folded Node View                 */
          /* ======================================================== */
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Folder className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 uppercase">
                  Folder
                </span>
              </div>
              <div className="font-mono text-xs font-semibold text-zinc-100 break-all select-text">
                {selectedNode.folder === "." ? "Root" : selectedNode.folder}
              </div>
            </div>

            {/* Folder metrics 4-grid */}
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5 font-mono text-[11px]">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Files</span>
                <div className="font-semibold text-zinc-200">{selectedNode.fileCount}</div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase">Total Lines</span>
                <div className="font-semibold text-zinc-200">
                  {selectedNode.files.reduce((acc, f) => acc + f.lines, 0)}
                </div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 uppercase">
                  <ArrowDownLeft className="h-3 w-3 text-sky-400" />
                  <span>External Inbound</span>
                </div>
                <div className="font-semibold text-sky-300">{folderDeps.inbound.length}</div>
              </div>
              <div>
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 uppercase">
                  <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                  <span>External Outbound</span>
                </div>
                <div className="font-semibold text-emerald-300">{folderDeps.outbound.length}</div>
              </div>
            </div>

            {/* Breakdown of file kinds inside folder */}
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                Kinds Breakdown
              </span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(folderKinds).map(([kind, count]) => (
                  <span
                    key={kind}
                    className="inline-flex items-center gap-1 rounded bg-zinc-900/60 px-2 py-0.5 font-mono text-[10px] text-zinc-300 border border-zinc-800"
                  >
                    <span>{kind}:</span>
                    <span className="font-semibold text-zinc-100">{count}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Contained Files list */}
            <div className="space-y-1.5">
              <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                Contained Files ({selectedNode.files.length})
              </span>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                {selectedNode.files.map((file) => {
                  const role = roleMap.get(file.path) || classifyFile(file.path).kind;
                  return (
                    <div
                      key={file.path}
                      onClick={() => onSelectFile(file.path)}
                      onMouseEnter={() => onHoverTarget({ type: "file", id: file.path })}
                      onMouseLeave={() => onHoverTarget(null)}
                      className="group flex items-center justify-between rounded bg-zinc-900/40 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white cursor-pointer"
                      title={file.path}
                    >
                      <span className="truncate pr-2">{file.path.split("/").pop()}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">{role}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Folder External Inbound */}
            {folderDeps.inbound.length > 0 && (
              <div className="space-y-1.5 border-t border-zinc-800/80 pt-3">
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
                  {frameworkTaxonomy.label}
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
                <div className="font-semibold text-purple-400">{data.routes?.length || 0}</div>
              </div>
            </div>

            {/* Phase 8: Extracted Route Table */}
            <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                  <span className="font-mono text-xs font-semibold text-zinc-200">
                    Route Table
                  </span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
                    {data.routes?.length || 0}
                  </span>
                </div>
              </div>

              {/* Filter search if more than 4 routes */}
              {data.routes && data.routes.length > 4 && (
                <input
                  type="text"
                  placeholder="Filter routes by path or method..."
                  value={routeSearchQuery}
                  onChange={(e) => setRouteSearchQuery(e.target.value)}
                  className="w-full rounded bg-zinc-950 border border-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-sky-500/50"
                />
              )}

              {!data.routes || data.routes.length === 0 ? (
                <div className="rounded border border-dashed border-zinc-800/80 p-3 text-center font-mono text-[11px] text-zinc-500">
                  No HTTP routes detected in this codebase.
                </div>
              ) : (
                <div className="max-h-56 overflow-y-auto overflow-x-hidden divide-y divide-zinc-800/60 border border-zinc-800/80 rounded bg-zinc-950/60 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
                  {filteredRoutes.map((route, idx) => {
                    const fileName = route.file.split("/").pop() || route.file;
                    return (
                      <div
                        key={`${route.method}-${route.path}-${idx}`}
                        onClick={() => onSelectFile(route.file)}
                        className="group flex items-center justify-between px-2.5 py-1.5 hover:bg-zinc-800/60 transition-colors cursor-pointer select-none"
                        title={`File: ${route.file}\nClick to view and inspect file`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.2 font-mono text-[10px] font-bold uppercase ${getMethodBadgeClass(
                              route.method
                            )}`}
                          >
                            {route.method}
                          </span>
                          <span className="font-mono text-xs text-zinc-200 truncate group-hover:text-sky-300 transition-colors select-text">
                            {route.path}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-[10px] text-zinc-500 group-hover:text-zinc-400 truncate max-w-[120px]">
                          {fileName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Convention identification status */}
            <div className="flex items-center justify-between rounded border border-zinc-800/80 bg-zinc-900/30 px-2.5 py-1.5 font-mono text-[10px] text-zinc-400">
              <div className="flex items-center gap-1.5">
                <FileQuestion className="h-3 w-3 text-zinc-500" />
                <span>Unclassified modules</span>
              </div>
              <span className="text-zinc-200 font-semibold">{unclassifiedCount}</span>
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
