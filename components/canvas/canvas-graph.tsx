"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { FoldedNodeComponent } from "./folded-node";
import { PanelNodeComponent } from "./panel-node";
import { foldModules, type FoldedNode } from "@/lib/canvas/folding";
import { getDeterministicLayout } from "@/lib/canvas/layout";
import type { ParserResult, ParsedFile } from "@/lib/parser/types";
import type { HoverTarget } from "./detail-pane";

const nodeTypes = {
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
  selectedNodeId: propSelectedNodeId,
  selectedFilePath: propSelectedFilePath,
  filterCategory = null,
  hoveredTarget,
  onHoverTarget,
  onSelectionChange,
}: CanvasGraphProps) {
  const { fitView, getViewport } = useReactFlow();

  // 1. Fold initial modules from parser data
  const foldingResult = useMemo(() => {
    return foldModules(data.files, data.edges);
  }, [data.files, data.edges]);

  // Pre-indexed lookup maps for instant O(1) dependency resolution
  const edgeIndex = useMemo(() => {
    const nodeEdges = new Map<string, string[]>();
    const nodeNeighbors = new Map<string, Set<string>>();
    const fileEdges = new Map<string, string[]>();
    const fileNeighbors = new Map<string, Set<string>>();

    for (const edge of foldingResult.edges) {
      // Source node index
      if (!nodeEdges.has(edge.source)) nodeEdges.set(edge.source, []);
      nodeEdges.get(edge.source)!.push(edge.id);

      if (!nodeNeighbors.has(edge.source)) nodeNeighbors.set(edge.source, new Set());
      nodeNeighbors.get(edge.source)!.add(edge.target);

      // Target node index
      if (!nodeEdges.has(edge.target)) nodeEdges.set(edge.target, []);
      nodeEdges.get(edge.target)!.push(edge.id);

      if (!nodeNeighbors.has(edge.target)) nodeNeighbors.set(edge.target, new Set());
      nodeNeighbors.get(edge.target)!.add(edge.source);

      // File index
      if (!fileEdges.has(edge.sourceFile)) fileEdges.set(edge.sourceFile, []);
      fileEdges.get(edge.sourceFile)!.push(edge.id);

      if (!fileNeighbors.has(edge.sourceFile)) fileNeighbors.set(edge.sourceFile, new Set());
      fileNeighbors.get(edge.sourceFile)!.add(edge.targetFile);

      if (!fileEdges.has(edge.targetFile)) fileEdges.set(edge.targetFile, []);
      fileEdges.get(edge.targetFile)!.push(edge.id);

      if (!fileNeighbors.has(edge.targetFile)) fileNeighbors.set(edge.targetFile, new Set());
      fileNeighbors.get(edge.targetFile)!.add(edge.sourceFile);
    }

    return {
      nodeEdges,
      nodeNeighbors,
      fileEdges,
      fileNeighbors,
    };
  }, [foldingResult.edges]);

  // 2. Open panels state (Set of nodeIds)
  const [openNodeIds, setOpenNodeIds] = useState<Set<string>>(new Set());

  // 3. Selection state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(propSelectedNodeId ?? null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(propSelectedFilePath ?? null);

  // Sync external selection changes
  useEffect(() => {
    if (propSelectedFilePath !== undefined) {
      setSelectedFilePath(propSelectedFilePath);
      if (propSelectedFilePath) {
        // Automatically open the folder containing this file so its handle and row are visible
        const ownerNodeId = foldingResult.nodeToFileMapping.get(propSelectedFilePath);
        if (ownerNodeId) {
          setOpenNodeIds((prev) => {
            if (prev.has(ownerNodeId)) return prev;
            const next = new Set(prev);
            next.add(ownerNodeId);
            return next;
          });
        }
      }
    }
  }, [propSelectedFilePath, foldingResult.nodeToFileMapping]);

  useEffect(() => {
    if (propSelectedNodeId !== undefined) {
      setSelectedNodeId(propSelectedNodeId);
    }
  }, [propSelectedNodeId]);

  // Debounce ref to prevent duplicate toggle in same tick
  const lastToggleRef = useRef<{ id: string; time: number }>({ id: "", time: 0 });

  // Toggle open a folder node into a panel or close it back
  const handleToggleOpen = useCallback(
    (nodeId: string) => {
      const now = Date.now();
      if (lastToggleRef.current.id === nodeId && now - lastToggleRef.current.time < 200) {
        return;
      }
      lastToggleRef.current = { id: nodeId, time: now };

      setOpenNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        return next;
      });

      // Refit view safely: only zoom out, never in
      setTimeout(() => {
        try {
          const currentZoom = getViewport().zoom;
          fitView({
            duration: 250,
            maxZoom: Math.min(currentZoom, 1),
            padding: 0.15,
          });
        } catch {
          // fallback
        }
      }, 50);
    },
    [fitView, getViewport]
  );

  // Select node
  const handleSelectNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      setSelectedFilePath(null);

      const node = foldingResult.nodes.find((n) => n.id === nodeId) || null;
      onSelectionChange?.({
        type: "node",
        node,
        file: null,
      });
    },
    [foldingResult.nodes, onSelectionChange]
  );

  // Select file row inside a panel
  const handleSelectFile = useCallback(
    (filePath: string) => {
      setSelectedFilePath(filePath);
      setSelectedNodeId(null);

      const file = data.files.find((f) => f.path === filePath) || null;
      onSelectionChange?.({
        type: "file",
        node: null,
        file,
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
    setSelectedNodeId(null);
    setSelectedFilePath(null);
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
      } else if (hoveredTarget.type === "node") {
        highlightedNodeIds.add(hoveredTarget.id);
        const edges = edgeIndex.nodeEdges.get(hoveredTarget.id);
        if (edges) {
          for (let i = 0; i < edges.length; i++) {
            highlightedEdgeIds.add(edges[i]);
          }
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
      openNodeIds
    );
  }, [foldingResult.nodes, foldingResult.edges, openNodeIds]);

  // Apply interactivity, dimming, and custom handlers to layouted nodes
  const nodes: Node[] = useMemo(() => {
    return rawLayoutNodes.map((n) => {
      const isSelected = selectedNodeId === n.id;
      const isHighlighted = selectionInfo.highlightedNodeIds.has(n.id);
      const folderNode = n.data.node as FoldedNode;

      // Phase 6: Category matching count and dimming
      const categoryMatchCount = filterCategory
        ? folderNode.files.filter((f) => {
            const ext = f.path.includes(".") ? `.${f.path.split(".").pop()}` : "other";
            return ext === filterCategory;
          }).length
        : undefined;

      const isCategoryDimmed =
        filterCategory !== null && categoryMatchCount !== undefined && categoryMatchCount === 0;

      const isDimmed =
        (selectionInfo.isSomethingSelected && !isSelected && !isHighlighted) ||
        (!selectionInfo.isSomethingSelected && isCategoryDimmed);

      const isOpen = openNodeIds.has(n.id);
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
        },
      };
    });
  }, [
    rawLayoutNodes,
    selectedNodeId,
    selectedFilePath,
    selectionInfo,
    openNodeIds,
    hoveredTarget,
    filterCategory,
    handleToggleOpen,
    handleSelectNode,
    handleSelectFile,
    onHoverTarget,
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
