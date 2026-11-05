import React from "react";

export interface FileCategory {
  id: string;
  name: string;
  color: string;
  count: number;
}

interface CanvasShellProps {
  categories?: FileCategory[];
  totalFilesCount?: number;
  selectedCategory?: string | null;
  onSelectCategory?: (categoryId: string | null) => void;
  rightPane?: React.ReactNode;
  children?: React.ReactNode;
}

const DEFAULT_CATEGORIES: FileCategory[] = [
  { id: ".ts", name: ".ts", color: "#818cf8", count: 0 },
  { id: ".tsx", name: ".tsx", color: "#38bdf8", count: 0 },
  { id: ".js", name: ".js", color: "#facc15", count: 0 },
];

/**
 * Settled Three-Column Shell:
 * 1. Left Rail (categories with swatches and counts)
 * 2. Center Area (interactive dependency map)
 * 3. Right Pane (detail pane: structure & explanation)
 */
export function CanvasShell({
  categories = DEFAULT_CATEGORIES,
  totalFilesCount,
  selectedCategory = null,
  onSelectCategory,
  rightPane,
  children,
}: CanvasShellProps) {
  return (
    <div className="flex h-full w-full overflow-hidden bg-background">
      {/* 1. Left Rail: Narrow column listing categories */}
      <aside
        aria-label="File categories rail"
        className="flex w-44 shrink-0 flex-col border-r border-zinc-800 bg-[#0e1013]/90 backdrop-blur-xs select-none"
      >
        <div className="flex h-10 items-center justify-between border-b border-zinc-800/80 px-3.5 bg-[#0f1117]">
          <span className="font-mono text-[10px] font-medium tracking-wide uppercase text-zinc-400">
            Categories {totalFilesCount !== undefined ? `· ${totalFilesCount} files` : ""}
          </span>
          {totalFilesCount === undefined && (
            <span className="font-mono text-[10px] text-zinc-500">
              {categories.length}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-800">
          <div className="space-y-0.5">
            {categories.map((category) => {
              const isSelected = selectedCategory === category.id;
              return (
                <button
                  type="button"
                  key={category.id}
                  onClick={() =>
                    onSelectCategory?.(isSelected ? null : category.id)
                  }
                  className={`group flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs transition-colors cursor-pointer text-left ${
                    isSelected
                      ? "bg-sky-500/20 text-white ring-1 ring-sky-400/50"
                      : "text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                  title={
                    isSelected
                      ? `Click to clear ${category.name} filter`
                      : `Click to highlight ${category.name} files and dim others`
                  }
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="h-2 w-2 shrink-0 rounded-xs"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="truncate text-xs font-mono font-medium">
                      {category.name}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs ${
                      isSelected
                        ? "text-sky-300 font-semibold"
                        : "text-zinc-500 group-hover:text-zinc-300"
                    }`}
                  >
                    {category.count}
                  </span>
                </button>
              );
            })}
          </div>

          {selectedCategory && (
            <div className="mt-3 border-t border-zinc-800/80 pt-2 px-1">
              <button
                type="button"
                onClick={() => onSelectCategory?.(null)}
                className="w-full rounded px-2 py-1 text-center font-mono text-[10px] text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200 cursor-pointer"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* 2. Middle Column: Canvas area */}
      <section
        aria-label="Map Canvas"
        className="relative flex flex-1 flex-col overflow-hidden bg-[#0b0d0e]"
      >
        {children}
      </section>

      {/* 3. Right Column: Settled detail pane */}
      {rightPane}
    </div>
  );
}
