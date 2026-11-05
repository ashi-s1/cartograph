"use client";

import React, { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Folder } from "lucide-react";
import type { FoldedNode } from "@/lib/canvas/folding";

interface FoldedNodeProps {
  data: {
    node: FoldedNode;
    isOpen: boolean;
    onToggleOpen: (nodeId: string) => void;
    onSelectNode: (nodeId: string) => void;
    onHoverNode?: (nodeId: string | null) => void;
    isDimmed: boolean;
    isSelected: boolean;
    isHighlighted: boolean;
    isHovered?: boolean;
    filterCategory?: string | null;
    categoryMatchCount?: number;
  };
}

export const FoldedNodeComponent = memo(function FoldedNodeComponent({
  data,
}: FoldedNodeProps) {
  const {
    node,
    onToggleOpen,
    onSelectNode,
    onHoverNode,
    isDimmed,
    isSelected,
    isHighlighted,
    isHovered,
    filterCategory,
    categoryMatchCount,
  } = data;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectNode(node.id);
    onToggleOpen(node.id);
  };

  const hasCategoryFilter = Boolean(filterCategory);
  const matchCount = categoryMatchCount ?? 0;
  const isNodeDimmed = isDimmed || (hasCategoryFilter && matchCount === 0);

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => onHoverNode?.(node.id)}
      onMouseLeave={() => onHoverNode?.(null)}
      className={`nodrag group relative flex flex-col justify-between rounded-lg border bg-[#12141a] px-3 py-2 text-foreground transition-all duration-150 cursor-pointer select-none ${
        isSelected
          ? "border-sky-400 ring-2 ring-sky-400/40 shadow-lg shadow-sky-500/25 bg-[#171a24]"
          : isHovered
          ? "border-sky-300 ring-2 ring-sky-400/60 shadow-md bg-[#171a24]"
          : isHighlighted
          ? "border-sky-400/80 shadow-md shadow-sky-950/40 bg-[#14161f]"
          : "border-zinc-700/80 hover:border-zinc-500 hover:shadow-xs"
      } ${isNodeDimmed && !isHovered ? "opacity-20 grayscale-[70%]" : "opacity-100"}`}
      style={{
        width: node.width,
        height: node.height,
      }}
      title={`Folder: ${node.id} (${node.fileCount} files, ${node.fanIn} dependents)${
        hasCategoryFilter ? `\nMatches: ${matchCount} of ${node.fileCount} files` : ""
      }\nClick to open panel`}
    >
      {/* Target handle on left */}
      <Handle
        type="target"
        position={Position.Left}
        id="tgt-node"
        className="!h-2 !w-2 !border-2 !border-background !bg-zinc-400 group-hover:!bg-sky-400"
      />

      {/* Main content */}
      <div className="flex items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-foreground" />
          <span className="truncate font-mono text-xs font-semibold text-foreground">
            {node.label}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasCategoryFilter && (
            <span
              className={`rounded px-1.5 py-0.2 font-mono text-[10px] font-semibold border ${
                matchCount > 0
                  ? "bg-sky-500/20 text-sky-300 border-sky-400/40"
                  : "bg-zinc-800/60 text-zinc-500 border-zinc-700/40"
              }`}
            >
              {matchCount}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleOpen(node.id);
            }}
            className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            title="Click to open panel"
          >
            {node.fileCount}
          </button>
        </div>
      </div>

      {/* Fan-in indicator footer if node has inbound dependencies */}
      {node.fanIn > 0 && node.height > 50 && (
        <div className="flex items-center justify-between border-t border-border/40 pt-1 text-[10px] text-muted-foreground font-mono">
          <span>in: {node.fanIn}</span>
          {node.fanOut > 0 && <span>out: {node.fanOut}</span>}
        </div>
      )}

      {/* Source handle on right */}
      <Handle
        type="source"
        position={Position.Right}
        id="src-node"
        className="!h-2 !w-2 !border-2 !border-background !bg-zinc-400 group-hover:!bg-sky-400"
      />
    </div>
  );
});
