"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ParserResult, ParsedFile } from "@/lib/parser/types";
import {
  foldModules,
  type FoldedNode,
  type FoldingResult,
} from "@/lib/canvas/folding";
import { getDeterministicLayout } from "@/lib/canvas/layout";
import { FoldedNodeComponent } from "@/components/canvas/folded-node";
import { PanelNodeComponent } from "@/components/canvas/panel-node";
import type { HoverTarget } from "@/components/canvas/detail-pane";

const nodeTypes: NodeTypes = {
  foldedNode: FoldedNodeComponent,
  panelNode: PanelNodeComponent,
};

interface CanvasGraphProps {
  data: ParserResult;
  selectedNodeId?: string | null;
  selectedFilePath?: string | null;
  filterCategory?: string | null;
  hoveredTarget?: HoverTarget | null;
  onHoverTarget?: (target: HoverTarget | null) => void;
  onSelectionChange?: (selection: {
    type: "node" | "file" | null;
    node?: FoldedNode | null;
    file?: ParsedFile | null;
  }) => void;
}

function CanvasGraphInner({
  data,
  selectedNodeId = null,
  selectedFilePath = null,
  filterCategory = null,
  hoveredTarget,
  onHoverTarget,
  onSelectionChange,
}: CanvasGraphProps) {
  // Local state for expanded folder panels
  const [openNodeIds, setOpenNodeIds] = useState<Set<string>>(new Set());

  // Framework role lookup for category filtering
  const roleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data.roles || []) {
      map.set(r.file, r.role);
    }
    return map;
  }, [data.roles]);

  const fileRolesRecord = useMemo(() => {
    return Object.fromEntries(roleMap.entries());
  }, [roleMap]);

  // 1. Compute folder-based graph partitioning
  const foldingResult: FoldingResult = useMemo(() => {
    return foldModules(data.files, data.edges);
  }, [data.files, data.edges]);

  // Active open node IDs includes any explicitly opened folder or the folder containing selectedFilePath
  const activeOpenNodeIds = useMemo(() => {
    const set = new Set(openNodeIds);
    if (selectedFilePath) {
      const targetFolderId = foldingResult.nodeToFileMapping.get(selectedFilePath);
      if (targetFolderId) {
        set.add(targetFolderId);
      }
    }
    return set;
  }, [openNodeIds, selectedFilePath, foldingResult.nodeToFileMapping]);

  // 2. Pre-index edges and connections for fast lookup
  const edgeIndex = useMemo(() => {
    const nodeNeighbors = new Map<string, Set<string>>();
    const nodeEdges = new Map<string, string[]>();
    const fileNeighbors = new Map<string, Set<string>>();
    const fileEdges = new Map<string, string[]>();

    for (const edge of data.edges) {
      const edgeId = `e-${edge.source}-${edge.target}-${edge.kind}`;

      // File-level index
      if (!fileNeighbors.has(edge.source)) fileNeighbors.set(edge.source, new Set());
      if (!fileNeighbors.has(edge.target)) fileNeighbors.set(edge.target, new Set());
      fileNeighbors.get(edge.source)!.add(edge.target);
      fileNeighbors.get(edge.target)!.add(edge.source);

      if (!fileEdges.has(edge.source)) fileEdges.set(edge.source, []);
      if (!fileEdges.has(edge.target)) fileEdges.set(edge.target, []);
      fileEdges.get(edge.source)!.push(edgeId);
      fileEdges.get(edge.target)!.push(edgeId);

      // Node-level index
      const srcNode = foldingResult.nodeToFileMapping.get(edge.source);
      const tgtNode = foldingResult.nodeToFileMapping.get(edge.target);

      if (srcNode && tgtNode && srcNode !== tgtNode) {
        if (!nodeNeighbors.has(srcNode)) nodeNeighbors.set(srcNode, new Set());
        if (!nodeNeighbors.has(tgtNode)) nodeNeighbors.set(tgtNode, new Set());
        nodeNeighbors.get(srcNode)!.add(tgtNode);
        nodeNeighbors.get(tgtNode)!.add(srcNode);

        const foldedEdgeId = `fe-${srcNode}-${tgtNode}`;
        if (!nodeEdges.has(srcNode)) nodeEdges.set(srcNode, []);
        if (!nodeEdges.has(tgtNode)) nodeEdges.set(tgtNode, []);
        nodeEdges.get(srcNode)!.push(foldedEdgeId);
        nodeEdges.get(tgtNode)!.push(foldedEdgeId);
      }
    }

    return { nodeNeighbors, nodeEdges, fileNeighbors, fileEdges };
  }, [data.edges, foldingResult.nodeToFileMapping]);

  // Toggle open/collapse state of a folder node
  const handleToggleOpen = useCallback((nodeId: string) => {
    setOpenNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  // Handle folder node selection
  const handleSelectNode = useCallback(
    (nodeId: string) => {
      const node = foldingResult.nodes.find((n) => n.id === nodeId) || null;
      onSelectionChange?.({
        type: "node",
        node,
        file: null,
      });
    },
    [foldingResult.nodes, onSelectionChange]
  );

  // Handle individual file selection
  const handleSelectFile = useCallback(
    (filePath: string) => {
      const file = data.files.find((f) => f.path === filePath) || null;
      onSelectionChange?.({
        type: "file",
        file,
        node: null,
      });
    },
    [data.files, onSelectionChange]
  );

  // Handle node click from React Flow canvas level
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "foldedNode") {
        handleToggleOpen(node.id);
        handleSelectNode(node.id);
      }
    },
    [handleToggleOpen, handleSelectNode]
  );

  // Clear selection on background click
  const handlePaneClick = useCallback(() => {
    onSelectionChange?.({ type: null });
  }, [onSelectionChange]);

  // Compute connected elements for dimming and hover highlighting (O(1) lookups)
  const selectionInfo = useMemo(() => {
    const isSomethingSelected = Boolean(selectedNodeId || selectedFilePath || hoveredTarget);
    const highlightedNodeIds = new Set<string>();
    const highlightedFilePaths = new Set<string>();
    const highlightedEdgeIds = new Set<string>();

    // 1. Process selected node
    if (selectedNodeId) {
      highlightedNodeIds.add(selectedNodeId);

      const edges = edgeIndex.nodeEdges.get(selectedNodeId);
      if (edges) {
        for (let i = 0; i < edges.length; i++) {
          highlightedEdgeIds.add(edges[i]);
        }
      }

      const neighbors = edgeIndex.nodeNeighbors.get(selectedNodeId);
      if (neighbors) {
        neighbors.forEach((nid) => highlightedNodeIds.add(nid));
      }
    } else if (selectedFilePath) {
      // 2. Process selected file
      highlightedFilePaths.add(selectedFilePath);
      const ownerNodeId = foldingResult.nodeToFileMapping.get(selectedFilePath);
      if (ownerNodeId) highlightedNodeIds.add(ownerNodeId);

      const edges = edgeIndex.fileEdges.get(selectedFilePath);
      if (edges) {
        for (let i = 0; i < edges.length; i++) {
          highlightedEdgeIds.add(edges[i]);
        }
      }

      const neighbors = edgeIndex.fileNeighbors.get(selectedFilePath);
      if (neighbors) {
        neighbors.forEach((fpath) => {
          highlightedFilePaths.add(fpath);
          const owner = foldingResult.nodeToFileMapping.get(fpath);
          if (owner) highlightedNodeIds.add(owner);
        });
      }
    }

    // 3. Process bidirectional hover target
    if (hoveredTarget) {
      if (hoveredTarget.type === "file") {
        highlightedFilePaths.add(hoveredTarget.id);
        const owner = foldingResult.nodeToFileMapping.get(hoveredTarget.id);
        if (owner) highlightedNodeIds.add(owner);

        const edges = edgeIndex.fileEdges.get(hoveredTarget.id);
        if (edges) {
          for (let i = 0; i < edges.length; i++) {
            highlightedEdgeIds.add(edges[i]);
          }
        }
        const neighbors = edgeIndex.fileNeighbors.get(hoveredTarget.id);
        if (neighbors) {
          neighbors.forEach((fpath) => highlightedFilePaths.add(fpath));
        }
      } else if (hoveredTarget.type === "node") {
        highlightedNodeIds.add(hoveredTarget.id);
        const edges = edgeIndex.nodeEdges.get(hoveredTarget.id);
        if (edges) {
          for (let i = 0; i < edges.length; i++) {
            highlightedEdgeIds.add(edges[i]);
          }
        }
        const neighbors = edgeIndex.nodeNeighbors.get(hoveredTarget.id);
        if (neighbors) {
          neighbors.forEach((nid) => highlightedNodeIds.add(nid));
        }
      }
    }

    return {
      isSomethingSelected,
      highlightedNodeIds,
      highlightedFilePaths,
      highlightedEdgeIds,
    };
  }, [selectedNodeId, selectedFilePath, hoveredTarget, edgeIndex, foldingResult.nodeToFileMapping]);

  // 4. Compute deterministic layout with Dagre
  const { nodes: rawLayoutNodes, edges: rawLayoutEdges } = useMemo(() => {
    return getDeterministicLayout(
      foldingResult.nodes,
      foldingResult.edges,
      activeOpenNodeIds
    );
  }, [foldingResult.nodes, foldingResult.edges, activeOpenNodeIds]);

  // Apply interactivity, dimming, and custom handlers to layouted nodes
  const nodes: Node[] = useMemo(() => {
    return rawLayoutNodes.map((n) => {
      const isSelected = selectedNodeId === n.id;
      const isHighlighted = selectionInfo.highlightedNodeIds.has(n.id);
      const folderNode = n.data.node as FoldedNode;

      // Category matching count and dimming
      const categoryMatchCount = filterCategory
        ? folderNode.files.filter((f) => {
            const role = roleMap.get(f.path);
            if (role && role.toLowerCase() === filterCategory.toLowerCase()) return true;
            const ext = f.path.includes(".") ? `.${f.path.split(".").pop()}` : "other";
            return ext === filterCategory;
          }).length
        : undefined;

      const isCategoryDimmed =
        filterCategory !== null && categoryMatchCount !== undefined && categoryMatchCount === 0;

      const isDimmed =
        (selectionInfo.isSomethingSelected && !isSelected && !isHighlighted) ||
        (!selectionInfo.isSomethingSelected && isCategoryDimmed);

      const isOpen = activeOpenNodeIds.has(n.id);
      const isHovered = hoveredTarget?.type === "node" && hoveredTarget.id === n.id;

      // Node z-index: Expanded panels always sit above edges and folded nodes
      const zIndex = isOpen
        ? (isSelected ? 100 : isHighlighted ? 80 : 50)
        : (isSelected ? 30 : isHighlighted ? 20 : 10);

      return {
        ...n,
        zIndex,
        data: {
          ...n.data,
          onToggleOpen: handleToggleOpen,
          onSelectNode: handleSelectNode,
          onSelectFile: handleSelectFile,
          onHoverNode: (nodeId: string | null) =>
            onHoverTarget?.(nodeId ? { type: "node", id: nodeId } : null),
          onHoverFile: (filePath: string | null) =>
            onHoverTarget?.(filePath ? { type: "file", id: filePath } : null),
          selectedFilePath,
          hoveredFilePath: hoveredTarget?.type === "file" ? hoveredTarget.id : null,
          isDimmed,
          isSelected,
          isHighlighted,
          isHovered,
          connectedFilePaths: selectionInfo.highlightedFilePaths,
          filterCategory,
          categoryMatchCount,
          fileRoles: fileRolesRecord,
        },
      };
    });
  }, [
    rawLayoutNodes,
    selectedNodeId,
    selectedFilePath,
    selectionInfo,
    activeOpenNodeIds,
    hoveredTarget,
    filterCategory,
    handleToggleOpen,
    handleSelectNode,
    handleSelectFile,
    onHoverTarget,
    roleMap,
    fileRolesRecord,
  ]);

  // Apply highlighting and dimming to edges (instant style, no expensive array sort or transitions)
  const edges: Edge[] = useMemo(() => {
    const isSomethingSelected = selectionInfo.isSomethingSelected;
    const highlightedEdgeIds = selectionInfo.highlightedEdgeIds;

    return rawLayoutEdges.map((e) => {
      const isEdgeHighlighted = highlightedEdgeIds.has(e.id);
      const isDimmed =
        (isSomethingSelected && !isEdgeHighlighted) ||
        (!isSomethingSelected && filterCategory !== null);

      return {
        ...e,
        zIndex: isEdgeHighlighted ? 5 : 1,
        style: {
          strokeWidth: isEdgeHighlighted ? 1.5 : 0.75,
          stroke: isEdgeHighlighted
            ? "#38bdf8"
            : "rgba(255, 255, 255, 0.18)",
          opacity: isDimmed ? 0.08 : isEdgeHighlighted ? 1 : 0.55,
        },
      };
    });
  }, [rawLayoutEdges, selectionInfo, filterCategory]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={1.5}
        onlyRenderVisibleElements={true}
        nodesDraggable={true}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        className="bg-[#0b0d0e]"
      >
        <Background
          gap={18}
          size={1}
          color="#27272a"
          className="opacity-20"
        />
        <Controls
          showInteractive={false}
          className="!bottom-4 !left-4 !border-border !bg-card/80 !shadow-sm !rounded-lg overflow-hidden [&>button]:!border-border [&>button]:!bg-card [&>button]:!text-foreground hover:[&>button]:!bg-muted"
        />
      </ReactFlow>
    </div>
  );
}

export function CanvasGraph(props: CanvasGraphProps) {
  return (
    <ReactFlowProvider>
      <CanvasGraphInner {...props} />
    </ReactFlowProvider>
  );
}
