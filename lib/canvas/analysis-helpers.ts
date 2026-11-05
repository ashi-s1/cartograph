import type { ParsedFile, ParsedEdge } from "@/lib/parser/types";

export interface FileClassification {
  kind: string;
  badgeColor: string;
}

/**
 * Classifies a file into a developer-meaningful role based on naming conventions and path patterns.
 */
export function classifyFile(filePath: string): FileClassification {
  const lower = filePath.toLowerCase();
  const segments = filePath.split("/");
  const fileName = segments[segments.length - 1] || "";

  if (
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.includes("__tests__") ||
    lower.includes("/tests/")
  ) {
    return { kind: "Test", badgeColor: "#f43f5e" };
  }

  if (
    lower.endsWith("page.tsx") ||
    lower.endsWith("page.jsx") ||
    lower.endsWith("route.ts") ||
    lower.endsWith("route.js") ||
    lower.endsWith("layout.tsx") ||
    lower.endsWith("layout.jsx") ||
    lower.includes("/routes/")
  ) {
    return { kind: "Route", badgeColor: "#a855f7" };
  }

  if (
    (fileName.startsWith("use") && (lower.endsWith(".ts") || lower.endsWith(".tsx"))) ||
    lower.includes("/hooks/")
  ) {
    return { kind: "Hook", badgeColor: "#eab308" };
  }

  if (
    lower.includes("/components/") ||
    (filePath.endsWith(".tsx") && /^[A-Z]/.test(fileName))
  ) {
    return { kind: "Component", badgeColor: "#06b6d4" };
  }

  if (
    lower.endsWith("types.ts") ||
    lower.endsWith(".d.ts") ||
    lower.includes("/types/") ||
    lower.endsWith("type.ts")
  ) {
    return { kind: "Type Definition", badgeColor: "#3b82f6" };
  }

  if (lower.includes("/actions/") || lower.includes("action.ts")) {
    return { kind: "Action", badgeColor: "#ec4899" };
  }

  if (
    lower.includes("/lib/") ||
    lower.includes("/utils/") ||
    lower.includes("/helpers/") ||
    lower.includes("util.ts") ||
    lower.includes("utils.ts")
  ) {
    return { kind: "Utility", badgeColor: "#10b981" };
  }

  if (
    lower.endsWith(".json") ||
    lower.includes("config.") ||
    lower.includes("rc.") ||
    lower.startsWith("tsconfig")
  ) {
    return { kind: "Config", badgeColor: "#64748b" };
  }

  return { kind: "Unclassified Module", badgeColor: "#71717a" };
}

/**
 * Detects the predominant framework or build system in the repository.
 */
export function detectFramework(files: readonly ParsedFile[]): string {
  const lowerPaths = new Set(files.map((f) => f.path.toLowerCase()));

  if (
    lowerPaths.has("next.config.js") ||
    lowerPaths.has("next.config.ts") ||
    lowerPaths.has("next.config.mjs") ||
    files.some((f) => f.path.startsWith("app/") || f.path.startsWith("pages/"))
  ) {
    return "Next.js";
  }

  if (
    files.some((f) => f.path.endsWith(".controller.ts") || f.path.endsWith(".service.ts"))
  ) {
    return "NestJS";
  }

  if (
    lowerPaths.has("vite.config.ts") ||
    lowerPaths.has("vite.config.js") ||
    lowerPaths.has("vite.config.mts") ||
    files.some((f) => f.path.includes("vite.config"))
  ) {
    return files.some((f) => f.path.endsWith(".tsx") || f.path.endsWith(".jsx"))
      ? "React (Vite)"
      : "Vite";
  }

  if (
    lowerPaths.has("remix.config.js") ||
    files.some((f) => f.path.includes("app/root.tsx"))
  ) {
    return "Remix";
  }

  if (lowerPaths.has("astro.config.mjs")) {
    return "Astro";
  }

  if (files.some((f) => f.path.endsWith(".tsx") || f.path.endsWith(".jsx"))) {
    return "React";
  }

  if (files.some((f) => f.path.endsWith(".ts"))) {
    return "TypeScript";
  }

  return "JavaScript / Node";
}

/**
 * Derives the repository name from the path or root name.
 */
export function deriveRepoName(repositoryRoot: string): string {
  if (!repositoryRoot || repositoryRoot === ".") return "Repository";
  const normalized = repositoryRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "Repository";
}

export interface RepoSummaryMetrics {
  name: string;
  framework: string;
  totalFiles: number;
  totalEdges: number;
  routeCount: number;
  unclassifiedCount: number;
  mostDependedFiles: { file: ParsedFile; count: number }[];
  entrypointFiles: ParsedFile[];
}

/**
 * Computes repository resting state summary metrics.
 */
export function computeRepoSummary(
  files: readonly ParsedFile[],
  edges: readonly ParsedEdge[],
  repositoryRoot: string,
  frameworkName?: string,
  routesCount?: number,
  unclassifiedFilesCount?: number
): RepoSummaryMetrics {
  const name = deriveRepoName(repositoryRoot);
  const framework = frameworkName || detectFramework(files);

  let routeCount = routesCount ?? 0;
  let unclassifiedCount = unclassifiedFilesCount ?? 0;

  if (routesCount === undefined || unclassifiedFilesCount === undefined) {
    let calcRoutes = 0;
    let calcUnclassified = 0;
    for (const f of files) {
      const { kind } = classifyFile(f.path);
      if (kind === "Route") {
        calcRoutes++;
      } else if (kind === "Unclassified Module") {
        calcUnclassified++;
      }
    }
    if (routesCount === undefined) routeCount = calcRoutes;
    if (unclassifiedFilesCount === undefined) unclassifiedCount = calcUnclassified;
  }

  // 1. Most depended-on files (highest Fan-In)
  const mostDependedFiles = [...files]
    .filter((f) => f.fanIn > 0)
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 10)
    .map((file) => ({ file, count: file.fanIn }));

  // 2. Files nothing imports at all (Fan-In === 0, where reading starts)
  const entrypointFiles = files
    .filter((f) => f.fanIn === 0)
    .sort((a, b) => b.fanOut - a.fanOut)
    .slice(0, 12);

  return {
    name,
    framework,
    totalFiles: files.length,
    totalEdges: edges.length,
    routeCount,
    unclassifiedCount,
    mostDependedFiles,
    entrypointFiles,
  };
}

/**
 * Computes the exact distinct inbound and outbound file lists for a selected file.
 */
export function computeFileDependencies(
  targetFilePath: string,
  edges: readonly ParsedEdge[]
): { inbound: string[]; outbound: string[] } {
  const inboundSet = new Set<string>();
  const outboundSet = new Set<string>();

  for (const e of edges) {
    if (e.target === targetFilePath && e.source !== targetFilePath) {
      inboundSet.add(e.source);
    }
    if (e.source === targetFilePath && e.target !== targetFilePath) {
      outboundSet.add(e.target);
    }
  }

  return {
    inbound: Array.from(inboundSet).sort(),
    outbound: Array.from(outboundSet).sort(),
  };
}

/**
 * Computes the file kind breakdown inside a folder.
 */
export function computeFolderKindsBreakdown(
  folderFiles: readonly ParsedFile[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const f of folderFiles) {
    const { kind } = classifyFile(f.path);
    counts[kind] = (counts[kind] || 0) + 1;
  }
  return counts;
}
