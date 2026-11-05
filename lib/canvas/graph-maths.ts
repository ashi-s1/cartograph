import type { ParsedFile, ParsedEdge } from "@/lib/parser/types";

export type WalkDirection = "inbound" | "outbound";

export interface TransitiveNode {
  filePath: string;
  file?: ParsedFile;
  depth: number;
}

export interface TransitiveWalkResult {
  rootFilePath: string;
  direction: WalkDirection;
  maxDepth: number;
  results: TransitiveNode[];
}

/**
 * Single transitive walk function for both Blast Radius and Dependency Chain.
 * - Inbound (Blast Radius): Walks reverse edges (who imports this, and who imports those).
 * - Outbound (Dependency Chain): Walks forward edges (what this imports, and what those import).
 * Guaranteed iterative, cycle-safe, depth-limited.
 */
export function transitiveWalk(
  startFilePath: string,
  edges: readonly ParsedEdge[],
  filesMap: Map<string, ParsedFile>,
  direction: WalkDirection,
  maxDepth: number = 2
): TransitiveWalkResult {
  if (maxDepth < 1) {
    return {
      rootFilePath: startFilePath,
      direction,
      maxDepth,
      results: [],
    };
  }

  // Pre-index edges by source or target for O(1) step lookups
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    const from = direction === "outbound" ? edge.source : edge.target;
    const to = direction === "outbound" ? edge.target : edge.source;
    if (from === to) continue; // ignore self-references

    let list = adjacency.get(from);
    if (!list) {
      list = [];
      adjacency.set(from, list);
    }
    list.push(to);
  }

  const results: TransitiveNode[] = [];
  const visitedDepth = new Map<string, number>();
  visitedDepth.set(startFilePath, 0);

  // Queue of [currentFilePath, currentDepth]
  const queue: [string, number][] = [[startFilePath, 0]];

  while (queue.length > 0) {
    const [current, depth] = queue.shift()!;
    if (depth >= maxDepth) continue;

    const neighbors = adjacency.get(current) || [];
    for (const next of neighbors) {
      const nextDepth = depth + 1;
      const prevDepth = visitedDepth.get(next);

      // If unvisited or found at a shorter depth
      if (prevDepth === undefined) {
        visitedDepth.set(next, nextDepth);
        results.push({
          filePath: next,
          file: filesMap.get(next),
          depth: nextDepth,
        });
        queue.push([next, nextDepth]);
      }
    }
  }

  // Sort by depth first, then by path
  results.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.filePath.localeCompare(b.filePath);
  });

  return {
    rootFilePath: startFilePath,
    direction,
    maxDepth,
    results,
  };
}

/**
 * Checks if a file path is a known framework entry point / config file
 * that is reached by framework conventions rather than direct imports.
 */
export function isFrameworkOrConfigEntry(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  const lower = normalized.toLowerCase();
  const segments = lower.split("/");
  const fileName = segments[segments.length - 1] || "";

  // 1. Next.js / Remix / Vite route & layout conventions
  if (
    fileName.startsWith("page.") ||
    fileName.startsWith("layout.") ||
    fileName.startsWith("route.") ||
    fileName.startsWith("middleware.") ||
    fileName.startsWith("proxy.") ||
    fileName.startsWith("error.") ||
    fileName.startsWith("loading.") ||
    fileName.startsWith("not-found.") ||
    fileName.startsWith("template.") ||
    fileName.startsWith("default.") ||
    fileName.startsWith("global-error.") ||
    lower.includes("/routes/") ||
    lower.includes("/api/") ||
    lower.includes("app/root.")
  ) {
    return true;
  }

  // 2. Config & tooling entrypoints
  if (
    fileName.includes("config.") ||
    fileName.includes(".config.") ||
    fileName.startsWith("tsconfig") ||
    fileName.startsWith("eslint") ||
    fileName.includes("rc.") ||
    fileName.endsWith(".json") ||
    fileName.endsWith(".d.ts")
  ) {
    return true;
  }

  // 3. Top-level package / module index entrypoints
  if (
    fileName.startsWith("index.") ||
    fileName.startsWith("main.") ||
    fileName.startsWith("app.")
  ) {
    return true;
  }

  return false;
}

export interface InsightItem {
  id: string;
  kind: "orphan" | "hotspot" | "cycle" | "oversized";
  title: string;
  sentence: string;
  files: string[];
  meta?: {
    cycleLength?: number;
    dependentsCount?: number;
    linesCount?: number;
  };
}

export interface InsightsReport {
  orphans: InsightItem[];
  hotspots: InsightItem[];
  cycles: InsightItem[];
  oversized: InsightItem[];
  totalCount: number;
}

// Four fixed sentences per Phase 6 constraints
export const INSIGHT_SENTENCES = {
  orphan: "Files nothing imports directly in the repository.",
  hotspot: "Files an unusual number of things import.",
  cycle: "Circular dependencies between files in the repository.",
  oversized: "Files that are simply too long.",
} as const;

/**
 * Detects import cycles using an iterative DFS with explicit call stack.
 * Constraint: Cycle detection is iterative, not recursive.
 */
export function findCyclesIterative(
  edges: readonly ParsedEdge[],
  filesMap: Map<string, ParsedFile>
): { cycle: string[] }[] {
  // Build adjacency
  const adj = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    let list = adj.get(edge.source);
    if (!list) {
      list = [];
      adj.set(edge.source, list);
    }
    list.push(edge.target);
  }

  const visitedGlobal = new Set<string>();
  const detectedCycles: { cycle: string[] }[] = [];
  const cycleSignatures = new Set<string>();

  // Run iterative DFS starting from each unvisited node
  const allNodes = Array.from(filesMap.keys());

  for (const startNode of allNodes) {
    if (visitedGlobal.has(startNode)) continue;

    // Stack holds: [node, neighborIndex]
    const stack: { node: string; neighborIndex: number }[] = [
      { node: startNode, neighborIndex: 0 },
    ];
    const pathNodes = new Set<string>([startNode]);
    const pathList: string[] = [startNode];

    while (stack.length > 0) {
      const currentFrame = stack[stack.length - 1];
      const neighbors = adj.get(currentFrame.node) || [];

      if (currentFrame.neighborIndex < neighbors.length) {
        const nextNode = neighbors[currentFrame.neighborIndex];
        currentFrame.neighborIndex++;

        if (pathNodes.has(nextNode)) {
          // Detected cycle!
          const cycleStartIndex = pathList.indexOf(nextNode);
          if (cycleStartIndex !== -1) {
            const cyclePath = pathList.slice(cycleStartIndex);
            // Canonical signature to avoid duplicate cycles from different rotations
            const minNode = [...cyclePath].sort()[0];
            const minIndex = cyclePath.indexOf(minNode);
            const canonical = [
              ...cyclePath.slice(minIndex),
              ...cyclePath.slice(0, minIndex),
            ];
            const signature = canonical.join(" -> ");

            if (!cycleSignatures.has(signature)) {
              cycleSignatures.add(signature);
              detectedCycles.push({ cycle: cyclePath });
            }
          }
        } else if (!visitedGlobal.has(nextNode)) {
          // Advance into unvisited neighbor
          pathNodes.add(nextNode);
          pathList.push(nextNode);
          stack.push({ node: nextNode, neighborIndex: 0 });
        }
      } else {
        // Backtrack
        const popped = stack.pop()!;
        pathNodes.delete(popped.node);
        pathList.pop();
        visitedGlobal.add(popped.node);
      }
    }
  }

  return detectedCycles;
}

/**
 * Computes all four kinds of facts about the edge list.
 */
export function computeInsights(
  files: readonly ParsedFile[],
  edges: readonly ParsedEdge[]
): InsightsReport {
  const filesMap = new Map<string, ParsedFile>();
  for (const f of files) {
    filesMap.set(f.path, f);
  }

  // 1. Files nothing imports (Orphans)
  // Constraint: A file nothing imports is not automatically an orphan if framework reaches it.
  const orphans: InsightItem[] = files
    .filter((f) => f.fanIn === 0 && !isFrameworkOrConfigEntry(f.path))
    .sort((a, b) => b.lines - a.lines)
    .map((f) => ({
      id: `orphan-${f.path}`,
      kind: "orphan",
      title: f.path,
      sentence: INSIGHT_SENTENCES.orphan,
      files: [f.path],
    }));

  // 2. Files an unusual number of things import (Hotspots)
  // Compute threshold: files with fanIn >= 5 and in top 10% of dependents
  const sortedByFanIn = [...files].filter((f) => f.fanIn >= 4).sort((a, b) => b.fanIn - a.fanIn);
  const hotspots: InsightItem[] = sortedByFanIn.slice(0, 15).map((f) => ({
    id: `hotspot-${f.path}`,
    kind: "hotspot",
    title: f.path,
    sentence: INSIGHT_SENTENCES.hotspot,
    files: [f.path],
    meta: {
      dependentsCount: f.fanIn,
    },
  }));

  // 3. Import cycles
  const rawCycles = findCyclesIterative(edges, filesMap);
  const cycles: InsightItem[] = rawCycles.slice(0, 20).map((c, idx) => ({
    id: `cycle-${idx}`,
    kind: "cycle",
    title: `${c.cycle.length} file cycle: ${c.cycle[0]}`,
    sentence: INSIGHT_SENTENCES.cycle,
    files: c.cycle,
    meta: {
      cycleLength: c.cycle.length,
    },
  }));

  // 4. Files that are simply too long (Oversized files)
  const oversized: InsightItem[] = files
    .filter((f) => f.lines >= 350)
    .sort((a, b) => b.lines - a.lines)
    .map((f) => ({
      id: `oversized-${f.path}`,
      kind: "oversized",
      title: `${f.path} (${f.lines} lines)`,
      sentence: INSIGHT_SENTENCES.oversized,
      files: [f.path],
      meta: {
        linesCount: f.lines,
      },
    }));

  const totalCount = orphans.length + hotspots.length + cycles.length + oversized.length;

  return {
    orphans,
    hotspots,
    cycles,
    oversized,
    totalCount,
  };
}
