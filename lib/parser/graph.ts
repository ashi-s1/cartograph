import type { ParsedEdge, ParsedFile } from "./types.ts";

/**
 * Deduplicates edges by (source, target, kind).
 * Pure function: returns a new array.
 */
export function deduplicateEdges(edges: readonly ParsedEdge[]): ParsedEdge[] {
  const seen = new Set<string>();
  const unique: ParsedEdge[] = [];

  for (const edge of edges) {
    const key = `${edge.source}->${edge.target}:${edge.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push({ ...edge });
    }
  }

  return unique;
}

/**
 * Computes fan-in and fan-out metrics for files from a deduplicated edge list.
 * Fan-in: Number of distinct other files that import this file.
 * Fan-out: Number of distinct other files this file imports.
 * Pure function: does not mutate inputs.
 */
export function computeFanMetrics(
  files: readonly ParsedFile[],
  edges: readonly ParsedEdge[]
): ParsedFile[] {
  const inDegreeMap = new Map<string, Set<string>>();
  const outDegreeMap = new Map<string, Set<string>>();

  for (const edge of edges) {
    // Only count edges where source and target are distinct files
    if (edge.source === edge.target) {
      continue;
    }

    if (!outDegreeMap.has(edge.source)) {
      outDegreeMap.set(edge.source, new Set());
    }
    outDegreeMap.get(edge.source)!.add(edge.target);

    if (!inDegreeMap.has(edge.target)) {
      inDegreeMap.set(edge.target, new Set());
    }
    inDegreeMap.get(edge.target)!.add(edge.source);
  }

  return files.map((file) => ({
    ...file,
    fanIn: inDegreeMap.get(file.path)?.size ?? 0,
    fanOut: outDegreeMap.get(file.path)?.size ?? 0,
  }));
}
