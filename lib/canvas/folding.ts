import type { ParsedEdge, ParsedFile } from "../parser/types.ts";

export interface FoldedNode {
  id: string;
  folder: string;
  label: string;
  files: ParsedFile[];
  fileCount: number;
  fanIn: number;
  fanOut: number;
  width: number;
  height: number;
}

export interface FoldedEdge {
  id: string;
  source: string; // source node id
  target: string; // target node id
  sourceFile: string;
  targetFile: string;
  kind: ParsedEdge["kind"];
}

export interface FoldingResult {
  nodes: FoldedNode[];
  edges: FoldedEdge[];
  thresholdUsed: number;
  nodeToFileMapping: Map<string, string>; // filePath -> nodeId
}

/**
 * Returns parent directory path. For top-level or "." returns ".".
 */
function getParentFolder(folder: string): string {
  if (!folder || folder === "." || !folder.includes("/")) {
    return ".";
  }
  const lastSlash = folder.lastIndexOf("/");
  return folder.slice(0, lastSlash);
}

/**
 * Derives the shortest label that remains unique across all node folders.
 */
function computeShortestUniqueLabels(folders: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const folderParts = folders.map((f) => ({
    full: f,
    segments: f === "." ? ["root"] : f.split("/"),
  }));

  // Try depth = 1 (just basename), then 2, etc.
  for (const item of folderParts) {
    let depth = 1;
    let label = item.segments.slice(-depth).join("/");

    const hasCollision = (testLabel: string) =>
      folderParts.some(
        (other) =>
          other.full !== item.full &&
          other.segments.slice(-depth).join("/") === testLabel
      );

    while (hasCollision(label) && depth < item.segments.length) {
      depth++;
      label = item.segments.slice(-depth).join("/");
    }

    result.set(item.full, label);
  }

  return result;
}

/**
 * Executes a single fresh deepest-first folding pass for a given file count threshold.
 */
function runFoldingPass(
  files: readonly ParsedFile[],
  minFilesThreshold: number
): Map<string, ParsedFile[]> {
  // Step 1: Start with files grouped into their initial folders
  const currentBuckets = new Map<string, ParsedFile[]>();
  for (const file of files) {
    const folder = file.folder || ".";
    if (!currentBuckets.has(folder)) {
      currentBuckets.set(folder, []);
    }
    currentBuckets.get(folder)!.push(file);
  }

  // Step 2: Sort all active directory paths by depth descending (deepest first)
  const getDepth = (dir: string) => (dir === "." ? 0 : dir.split("/").length);

  // We loop deepest-first until no directories with < minFilesThreshold can be merged to a parent
  let changed = true;
  while (changed) {
    changed = false;
    const sortedDirs = Array.from(currentBuckets.keys()).sort(
      (a, b) => getDepth(b) - getDepth(a)
    );

    for (const dir of sortedDirs) {
      if (dir === ".") continue; // Do not merge root upwards
      const bucket = currentBuckets.get(dir);
      if (!bucket) continue;

      if (bucket.length < minFilesThreshold) {
        const parent = getParentFolder(dir);
        if (!currentBuckets.has(parent)) {
          currentBuckets.set(parent, []);
        }
        currentBuckets.get(parent)!.push(...bucket);
        currentBuckets.delete(dir);
        changed = true;
        break; // restart sorting after modification for strict deepest-first order
      }
    }
  }

  // Ensure every node holds more than one file!
  // If root or any residual directory has <= 1 file, merge into the closest non-empty or largest node
  const remaining = Array.from(currentBuckets.entries());
  for (const [dir, bucket] of remaining) {
    if (bucket.length <= 1) {
      const parent = getParentFolder(dir);
      if (currentBuckets.has(parent) && parent !== dir) {
        currentBuckets.get(parent)!.push(...bucket);
        currentBuckets.delete(dir);
      } else {
        // If it's root or has no parent, find the largest existing node
        const otherNodes = Array.from(currentBuckets.entries()).filter(
          ([d]) => d !== dir
        );
        if (otherNodes.length > 0) {
          otherNodes.sort((a, b) => b[1].length - a[1].length);
          otherNodes[0][1].push(...bucket);
          currentBuckets.delete(dir);
        }
      }
    }
  }

  return currentBuckets;
}

/**
 * Computes node height based on fan-in (how many external files depend on this node).
 * Node width comes from label length so long names don't read as important.
 */
function computeNodeDimensions(label: string, fanIn: number): { width: number; height: number } {
  // Base width from label length
  const width = Math.max(130, Math.min(260, label.length * 8.5 + 44));

  // Height carries fan-in (how many things depend on it)
  // Baseline height is 44px, scaling smoothly up to ~110px based on inbound dependencies
  const height = Math.round(44 + Math.min(fanIn * 3.5, 66));

  return { width, height };
}

/**
 * Primary folding algorithm per Phase 4 spec:
 * Starts at minFiles=2. Raises threshold until node count is roughly two dozen (< 25).
 */
export function foldModules(
  files: readonly ParsedFile[],
  edges: readonly ParsedEdge[],
  targetMaxNodes: number = 24
): FoldingResult {
  let threshold = 2;
  let buckets = runFoldingPass(files, threshold);

  // If node count is above target (roughly two dozen), raise threshold and go again
  while (buckets.size > targetMaxNodes && threshold < 20) {
    threshold++;
    buckets = runFoldingPass(files, threshold);
  }

  // Construct mapping: filePath -> nodeId
  const nodeToFileMapping = new Map<string, string>();
  for (const [nodeId, fileList] of buckets.entries()) {
    for (const f of fileList) {
      nodeToFileMapping.set(f.path, nodeId);
    }
  }

  // Compute shortest unique labels
  const folderList = Array.from(buckets.keys());
  const labelMap = computeShortestUniqueLabels(folderList);

  // Compute node metrics and dimensions
  const nodes: FoldedNode[] = [];
  for (const [nodeId, fileList] of buckets.entries()) {
    const label = labelMap.get(nodeId) || nodeId;

    // Node fan-in: count of distinct files outside this node that import any file inside this node
    const filesInNode = new Set(fileList.map((f) => f.path));
    const externalInbound = new Set<string>();
    const externalOutbound = new Set<string>();

    for (const edge of edges) {
      const sourceInNode = filesInNode.has(edge.source);
      const targetInNode = filesInNode.has(edge.target);

      if (!sourceInNode && targetInNode) {
        externalInbound.add(edge.source);
      }
      if (sourceInNode && !targetInNode) {
        externalOutbound.add(edge.target);
      }
    }

    const fanIn = externalInbound.size;
    const fanOut = externalOutbound.size;
    const { width, height } = computeNodeDimensions(label, fanIn);

    nodes.push({
      id: nodeId,
      folder: nodeId,
      label,
      files: fileList,
      fileCount: fileList.length,
      fanIn,
      fanOut,
      width,
      height,
    });
  }

  // Build folded edges
  const edgeMap = new Map<string, FoldedEdge>();
  for (const edge of edges) {
    const sourceNodeId = nodeToFileMapping.get(edge.source);
    const targetNodeId = nodeToFileMapping.get(edge.target);

    // Only create inter-node edges when source and target nodes exist and are different
    if (sourceNodeId && targetNodeId && sourceNodeId !== targetNodeId) {
      const key = `${sourceNodeId}->${targetNodeId}:${edge.source}->${edge.target}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, {
          id: `e-${sourceNodeId}-${targetNodeId}-${edge.source}-${edge.target}`,
          source: sourceNodeId,
          target: targetNodeId,
          sourceFile: edge.source,
          targetFile: edge.target,
          kind: edge.kind,
        });
      }
    }
  }

  // Sort nodes deterministically by ID
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  return {
    nodes,
    edges: Array.from(edgeMap.values()),
    thresholdUsed: threshold,
    nodeToFileMapping,
  };
}
