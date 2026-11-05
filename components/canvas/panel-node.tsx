"use client";

import React, { memo } from "react";
import { Handle, Position, useUpdateNodeInternals } from "@xyflow/react";
import { FolderOpen, X, FileCode } from "lucide-react";
import type { FoldedNode } from "@/lib/canvas/folding";
import type { ParsedFile } from "@/lib/parser/types";

const FILE_ROW_HEIGHT = 28;
const MAX_VISIBLE_PANEL_FILES = 8;

interface PanelNodeProps {
  id: string;
  data: {
    node: FoldedNode;
    onToggleOpen: (id: string) => void;
    onSelectNode?: (id: string) => void;
    onSelectFile: (path: string) => void;
    onHoverFile?: (path: string | null) => void;
    selectedFilePath: string | null;
    hoveredFilePath: string | null;
    isDimmed: boolean;
    isSelected: boolean;
    isHighlighted: boolean;
    connectedFilePaths: Set<string>;
    filterCategory?: string | null;
    categoryMatchCount?: number;
    fileRoles?: Record<string, string>;
  };
}

export const PanelNodeComponent = memo(function PanelNodeComponent({
  data,
}: PanelNodeProps) {
  const {
    node,
    onToggleOpen,
    onSelectFile,
    onHoverFile,
    selectedFilePath,
    hoveredFilePath,
    isDimmed,
    isSelected,
    isHighlighted,
    connectedFilePaths,
    filterCategory,
    categoryMatchCount,
    fileRoles,
  } = data;

  const updateNodeInternals = useUpdateNodeInternals();
  const scrollRafRef = React.useRef<number | null>(null);

  const handleScroll = () => {
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      updateNodeInternals(node.id);
      scrollRafRef.current = null;
    });
  };

  return (
    <div
      className={`group/panel relative flex flex-col rounded-lg border bg-zinc-950/95 font-sans shadow-xl backdrop-blur-xs transition-opacity duration-150 ${
        isSelected
          ? "border-sky-400 ring-2 ring-sky-400/30"
          : isHighlighted
          ? "border-sky-400/80 ring-1 ring-sky-400/20"
          : "border-zinc-800 hover:border-zinc-700"
      } ${isDimmed ? "opacity-25 grayscale-[70%]" : "opacity-100"}`}
      style={{
        width: 270,
        minHeight: 80,
      }}
    >
      {/* Node-level target handle for collapsed incoming edges */}
      <Handle
        type="target"
        position={Position.Left}
        id="panel-target"
        className="!h-2 !w-2 !border-1 !border-background !bg-zinc-500 group-hover/panel:!bg-sky-400"
      />

      {/* Node-level source handle for collapsed outgoing edges */}
      <Handle
        type="source"
        position={Position.Right}
        id="panel-source"
        className="!h-2 !w-2 !border-1 !border-background !bg-zinc-500 group-hover/panel:!bg-sky-400"
      />

      {/* Folder Header */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          data.onSelectNode?.(node.id);
        }}
        className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/60 px-3 py-2 cursor-pointer select-none"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderOpen className="h-3.5 w-3.5 text-sky-500 shrink-0" />
          <span className="truncate font-mono text-xs font-semibold text-foreground">
            {node.label}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
            {node.fileCount}
          </span>
          {/* Category match count badge */}
          {filterCategory && categoryMatchCount !== undefined && (
            <span className="rounded bg-sky-500/20 border border-sky-400/40 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-sky-300">
              {categoryMatchCount} {categoryMatchCount === 1 ? "match" : "matches"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Fan-in / Fan-out metrics badge */}
          <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            <span>in:{node.fanIn}</span>
            <span>out:{node.fanOut}</span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleOpen(node.id);
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            title="Collapse panel"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Files List as scrollable selectable rows with edge connection handles */}
      <div
        onScroll={handleScroll}
        className="nowheel nodrag flex flex-col divide-y divide-zinc-800/60 p-1 overflow-y-auto overflow-x-hidden overscroll-contain select-none [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-700/60 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-zinc-500/80"
        style={{
          maxHeight: MAX_VISIBLE_PANEL_FILES * FILE_ROW_HEIGHT + 4,
        }}
      >
        {node.files.map((file: ParsedFile) => {
          const fileName = file.path.split("/").pop() || file.path;
          const isFileSelected = selectedFilePath === file.path;
          const isFileConnected = connectedFilePaths.has(file.path);
          const isRowHovered = hoveredFilePath === file.path;

          // Framework role or extension matching check
          const fileRole = fileRoles?.[file.path];
          const fileMatchesCategory =
            !filterCategory ||
            (fileRole && fileRole.toLowerCase() === filterCategory.toLowerCase()) ||
            (file.path.includes(".") && `.${file.path.split(".").pop()}` === filterCategory) ||
            (!file.path.includes(".") && filterCategory === "other");

          const isRowDimmed =
            (selectedFilePath !== null && !isFileSelected && !isFileConnected && !isRowHovered) ||
            (filterCategory !== null && !fileMatchesCategory);

          return (
            <div
              key={file.path}
              onClick={(e) => {
                e.stopPropagation();
                onSelectFile(file.path);
              }}
              onMouseEnter={() => onHoverFile?.(file.path)}
              onMouseLeave={() => onHoverFile?.(null)}
              className={`group relative flex h-7 items-center justify-between px-2 font-mono text-xs cursor-pointer rounded transition-all duration-150 ${
                isFileSelected
                  ? "bg-sky-500 text-sky-950 font-bold shadow-xs z-10"
                  : isRowHovered
                  ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/50"
                  : isFileConnected
                  ? "bg-sky-950/40 text-sky-200"
                  : "text-zinc-300 hover:bg-zinc-800 hover:text-white"
              } ${isRowDimmed && !isRowHovered ? "opacity-25 grayscale-[70%]" : "opacity-100"}`}
              title={`File: ${file.path} (${file.lines} lines, in:${file.fanIn}, out:${file.fanOut})\nClick to select`}
            >
              {/* Row-level target handle for incoming import edges */}
              <Handle
                type="target"
                position={Position.Left}
                id={`tgt-${file.path}`}
                className="!h-1.5 !w-1.5 !border-1 !border-background !bg-zinc-500 group-hover:!bg-sky-400"
              />

              <div className="flex items-center gap-1.5 min-w-0 pr-2">
                <FileCode
                  className={`h-3 w-3 shrink-0 ${
                    isFileSelected
                      ? "text-sky-950"
                      : isFileConnected || isRowHovered
                      ? "text-sky-400"
                      : "text-zinc-500 group-hover:text-zinc-400"
                  }`}
                />
                <span className="truncate text-xs">{fileName}</span>
              </div>

              {/* Fan-in badge */}
              {file.fanIn > 0 && (
                <span
                  className={`font-mono text-[10px] shrink-0 rounded px-1 ${
                    isFileSelected
                      ? "bg-sky-950/40 text-sky-200"
                      : "bg-zinc-800 text-zinc-400 group-hover:text-zinc-200"
                  }`}
                >
                  {file.fanIn} in
                </span>
              )}

              {/* Row-level source handle for outgoing import edges */}
              <Handle
                type="source"
                position={Position.Right}
                id={`src-${file.path}`}
                className="!h-1.5 !w-1.5 !border-1 !border-background !bg-zinc-500 group-hover:!bg-sky-400"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
