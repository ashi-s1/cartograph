import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { FoldedNode, FoldedEdge } from "./folding.ts";

export interface LayoutOptions {
  direction?: "LR" | "TB";
  nodeSpacingX?: number;
  nodeSpacingY?: number;
}

export const MAX_VISIBLE_PANEL_FILES = 9;
export const FILE_ROW_HEIGHT = 28;
export const PANEL_HEADER_HEIGHT = 38;

export function computePanelDimensions(node: FoldedNode): { width: number; height: number } {
  // Panel width derived from longest file path/name
  const maxNameLength = Math.max(
    node.label.length,
    ...node.files.map((f) => f.path.split("/").pop()?.length || 10)
  );
  const width = Math.max(220, Math.min(320, maxNameLength * 8 + 60));

  const visibleCount = Math.min(node.files.length, MAX_VISIBLE_PANEL_FILES);

  const height =
    PANEL_HEADER_HEIGHT +
    visibleCount * FILE_ROW_HEIGHT +
    12;

  return { width, height };
}

/**
 * Computes deterministic dagre layout for nodes and edges.
 * Handles both folded nodes and expanded panels.
 */
export function getDeterministicLayout(
  foldedNodes: FoldedNode[],
  foldedEdges: FoldedEdge[],
  openNodeIds: Set<string>,
  options: LayoutOptions = {}
): { nodes: Node[]; edges: Edge[] } {
  const direction = options.direction || "LR";
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: options.nodeSpacingY || 40,
    ranksep: options.nodeSpacingX || 90,
    marginx: 40,
    marginy: 40,
  });

  // 1. Add nodes to dagre graph
  for (const node of foldedNodes) {
    const isOpen = openNodeIds.has(node.id);
    const dims = isOpen
      ? computePanelDimensions(node)
      : { width: node.width, height: node.height };

    g.setNode(node.id, {
      width: dims.width,
      height: dims.height,
    });
  }

  // 2. Add edges to dagre graph
  // For layout positioning, we add distinct edges between nodes
  const addedEdgeKeys = new Set<string>();
  for (const edge of foldedEdges) {
    const key = `${edge.source}->${edge.target}`;
    if (!addedEdgeKeys.has(key)) {
      addedEdgeKeys.add(key);
      g.setEdge(edge.source, edge.target);
    }
  }

  // 3. Compute layout
  dagre.layout(g);

  // 4. Map dagre positions to React Flow Node objects
  const layoutedNodes: Node[] = foldedNodes.map((node) => {
    const isOpen = openNodeIds.has(node.id);
    const dims = isOpen
      ? computePanelDimensions(node)
      : { width: node.width, height: node.height };

    const dagreNode = g.node(node.id);

    return {
      id: node.id,
      type: isOpen ? "panelNode" : "foldedNode",
      position: {
        x: dagreNode.x - dims.width / 2,
        y: dagreNode.y - dims.height / 2,
      },
      data: {
        node,
        isOpen,
      },
      style: {
        width: dims.width,
        height: dims.height,
      },
    };
  });

  // 5. Build React Flow Edges
  // When target or source is an open panel, connect to row handle if available!
  const reactFlowEdges: Edge[] = foldedEdges.map((edge) => {
    const sourceIsOpen = openNodeIds.has(edge.source);
    const targetIsOpen = openNodeIds.has(edge.target);

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: sourceIsOpen ? `src-${edge.sourceFile}` : "src-node",
      targetHandle: targetIsOpen ? `tgt-${edge.targetFile}` : "tgt-node",
      type: "default",
      data: {
        sourceFile: edge.sourceFile,
        targetFile: edge.targetFile,
        kind: edge.kind,
      },
      style: {
        strokeWidth: 0.75,
      },
    };
  });

  return { nodes: layoutedNodes, edges: reactFlowEdges };
}
