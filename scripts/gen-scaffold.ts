import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ParserResult, ParsedFile, ParsedEdge } from "../lib/parser/types.ts";

function generateScaffoldData(): ParserResult {
  // A realistic ~220-file repository with realistic nesting across ~35 directories
  const folderTree: Record<string, string[]> = {
    // App router
    "app": ["layout.tsx", "page.tsx", "loading.tsx", "error.tsx", "not-found.tsx"],
    "app/(auth)/login": ["page.tsx", "form.tsx"],
    "app/(auth)/register": ["page.tsx", "form.tsx"],
    "app/(auth)/reset-password": ["page.tsx", "form.tsx"],
    "app/api/auth/[...nextauth]": ["route.ts", "options.ts"],
    "app/api/analyses": ["route.ts", "queue.ts"],
    "app/api/analyses/[id]": ["route.ts", "status.ts"],
    "app/api/projects": ["route.ts"],
    "app/api/projects/[id]": ["route.ts", "members.ts"],
    "app/api/webhooks/github": ["route.ts", "verify.ts"],
    "app/dashboard": ["page.tsx", "layout.tsx", "loading.tsx", "breadcrumbs.tsx"],
    "app/dashboard/overview": ["page.tsx", "summary-cards.tsx", "activity-feed.tsx"],
    "app/dashboard/settings": ["page.tsx", "layout.tsx"],
    "app/dashboard/settings/profile": ["page.tsx", "profile-form.tsx", "avatar-upload.tsx"],
    "app/dashboard/settings/billing": ["page.tsx", "plans.tsx", "invoice-table.tsx"],
    "app/dashboard/analytics": ["page.tsx", "metrics-view.tsx", "trend-chart.tsx"],

    // UI Components (atoms/primitives)
    "components/ui/buttons": ["button.tsx", "icon-button.tsx", "split-button.tsx"],
    "components/ui/inputs": ["input.tsx", "textarea.tsx", "search-input.tsx", "number-input.tsx"],
    "components/ui/dialogs": ["dialog.tsx", "alert-dialog.tsx", "confirm-dialog.tsx"],
    "components/ui/dropdowns": ["dropdown-menu.tsx", "context-menu.tsx", "select.tsx"],
    "components/ui/feedback": ["badge.tsx", "tooltip.tsx", "skeleton.tsx", "spinner.tsx", "progress.tsx"],
    "components/ui/layout": ["card.tsx", "separator.tsx", "sheet.tsx", "tabs.tsx", "collapsible.tsx"],
    "components/ui/data-display": ["table.tsx", "avatar.tsx", "accordion.tsx", "tree-view.tsx"],

    // Application Components
    "components/shell": ["app-shell.tsx", "header.tsx", "sidebar.tsx", "user-nav.tsx", "theme-toggle.tsx"],
    "components/canvas/nodes": ["folder-node.tsx", "panel-node.tsx", "file-row.tsx", "handle-wrapper.tsx"],
    "components/canvas/controls": ["minimap.tsx", "zoom-controls.tsx", "filter-bar.tsx", "category-rail.tsx"],
    "components/canvas/edges": ["custom-edge.tsx", "edge-label.tsx", "bezier-edge.tsx"],
    "components/detail-pane": ["detail-shell.tsx", "file-info.tsx", "dependency-list.tsx", "metrics-badge.tsx"],

    // Libraries & Utilities
    "lib/auth": ["session.ts", "jwt.ts", "roles.ts", "permissions.ts", "clerk.ts", "middleware-guard.ts"],
    "lib/db/core": ["client.ts", "connection.ts", "pool.ts", "logger.ts"],
    "lib/db/models": ["user.ts", "organization.ts", "project.ts", "analysis.ts", "file.ts", "edge.ts"],
    "lib/db/queries": ["projects-query.ts", "analyses-query.ts", "files-query.ts", "edges-query.ts"],
    "lib/parser/core": ["index.ts", "walker.ts", "resolver.ts", "graph.ts", "types.ts"],
    "lib/parser/adapters": ["fallback.ts", "types.ts", "next-adapter.ts", "vite-adapter.ts"],
    "lib/canvas/layout": ["dagre-engine.ts", "dimensions.ts", "positioning.ts"],
    "lib/canvas/folding": ["folding-tree.ts", "threshold-pass.ts", "naming.ts"],
    "lib/services/github": ["client.ts", "clone.ts", "archive.ts", "rate-limit.ts"],
    "lib/services/cache": ["redis.ts", "memory-lru.ts", "tag-invalidator.ts"],
    "lib/utils": ["cn.ts", "format.ts", "date.ts", "crypto.ts", "math.ts", "validation.ts"],

    // Hooks
    "hooks/core": ["use-debounce.ts", "use-local-storage.ts", "use-media-query.ts", "use-mount.ts"],
    "hooks/canvas": ["use-canvas-layout.ts", "use-node-folding.ts", "use-graph-selection.ts", "use-zoom-refit.ts"],

    // Types
    "types/models": ["user.ts", "organization.ts", "project.ts", "analysis.ts"],
    "types/canvas": ["graph.ts", "node.ts", "edge.ts", "selection.ts"],
    "types/parser": ["ast.ts", "coverage.ts", "resolution.ts"]
  };

  const files: ParsedFile[] = [];
  const rawEdges: ParsedEdge[] = [];

  for (const [folder, filenames] of Object.entries(folderTree)) {
    for (const name of filenames) {
      const relPath = `${folder}/${name}`;
      const lineCount = 20 + Math.floor(Math.sin(relPath.length * 19) * 35 + 45);
      const byteSize = lineCount * 26 + (relPath.length % 13) * 7;
      const hash = crypto.createHash("sha256").update(relPath).digest("hex");

      files.push({
        path: relPath,
        folder,
        lines: lineCount,
        bytes: byteSize,
        hash,
        fanIn: 0,
        fanOut: 0,
      });
    }
  }

  // Generate realistic interconnects
  for (const file of files) {
    // 1. Almost all components and pages import cn.ts and button
    if (file.path.startsWith("components/") || file.path.startsWith("app/")) {
      rawEdges.push({
        source: file.path,
        target: "lib/utils/cn.ts",
        specifier: "@/lib/utils/cn",
        kind: "import",
      });
      if (!file.path.includes("components/ui/buttons/")) {
        rawEdges.push({
          source: file.path,
          target: "components/ui/buttons/button.tsx",
          specifier: "@/components/ui/buttons/button",
          kind: "import",
        });
      }
    }

    // 2. Shell components import header, sidebar, theme-toggle
    if (file.path === "components/shell/app-shell.tsx") {
      rawEdges.push({
        source: file.path,
        target: "components/shell/header.tsx",
        specifier: "./header",
        kind: "import",
      });
      rawEdges.push({
        source: file.path,
        target: "components/shell/sidebar.tsx",
        specifier: "./sidebar",
        kind: "import",
      });
    }

    // 3. Canvas components import canvas hooks and nodes
    if (file.path.startsWith("components/canvas/")) {
      rawEdges.push({
        source: file.path,
        target: "hooks/canvas/use-node-folding.ts",
        specifier: "@/hooks/canvas/use-node-folding",
        kind: "import",
      });
      rawEdges.push({
        source: file.path,
        target: "types/canvas/graph.ts",
        specifier: "@/types/canvas/graph",
        kind: "import",
      });
      rawEdges.push({
        source: file.path,
        target: "lib/canvas/folding/folding-tree.ts",
        specifier: "@/lib/canvas/folding/folding-tree",
        kind: "import",
      });
    }

    // 4. API routes import DB queries and Auth session
    if (file.path.startsWith("app/api/")) {
      rawEdges.push({
        source: file.path,
        target: "lib/db/queries/analyses-query.ts",
        specifier: "@/lib/db/queries/analyses-query",
        kind: "import",
      });
      rawEdges.push({
        source: file.path,
        target: "lib/auth/session.ts",
        specifier: "@/lib/auth/session",
        kind: "import",
      });
    }

    // 5. DB queries import DB client and models
    if (file.path.startsWith("lib/db/queries/")) {
      rawEdges.push({
        source: file.path,
        target: "lib/db/core/client.ts",
        specifier: "../core/client",
        kind: "import",
      });
      rawEdges.push({
        source: file.path,
        target: "lib/db/models/analysis.ts",
        specifier: "../models/analysis",
        kind: "import",
      });
    }

    // 6. Parser imports resolver, walker, graph
    if (file.path === "lib/parser/core/index.ts") {
      rawEdges.push({
        source: file.path,
        target: "lib/parser/core/walker.ts",
        specifier: "./walker",
        kind: "import",
      });
      rawEdges.push({
        source: file.path,
        target: "lib/parser/core/resolver.ts",
        specifier: "./resolver",
        kind: "import",
      });
      rawEdges.push({
        source: file.path,
        target: "lib/parser/core/graph.ts",
        specifier: "./graph",
        kind: "import",
      });
      rawEdges.push({
        source: file.path,
        target: "lib/parser/core/types.ts",
        specifier: "./types",
        kind: "import",
      });
    }

    // 7. Types re-exports
    if (file.path === "types/models/user.ts") {
      rawEdges.push({
        source: file.path,
        target: "types/models/organization.ts",
        specifier: "./organization",
        kind: "import",
      });
    }
  }

  // Deduplicate edges
  const edgeMap = new Map<string, ParsedEdge>();
  for (const edge of rawEdges) {
    const key = `${edge.source}->${edge.target}:${edge.kind}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, edge);
    }
  }
  const edges = Array.from(edgeMap.values());

  // Compute Fan-in / Fan-out
  const inMap = new Map<string, number>();
  const outMap = new Map<string, number>();
  for (const edge of edges) {
    outMap.set(edge.source, (outMap.get(edge.source) || 0) + 1);
    inMap.set(edge.target, (inMap.get(edge.target) || 0) + 1);
  }

  for (const f of files) {
    f.fanIn = inMap.get(f.path) || 0;
    f.fanOut = outMap.get(f.path) || 0;
  }

  const folders = Object.keys(folderTree).sort();

  return {
    repositoryRoot: "d:/scaffold/cartograph-full",
    timestamp: new Date().toISOString(),
    walk: {
      found: files.length + 42,
      parsed: files.length,
      skipped: 42,
      skipReasons: {
        "Config JSON": { count: 8, examples: ["package.json", "tsconfig.json"] },
        "Documentation": { count: 12, examples: ["README.md", "docs/specs/phase-01.md"] },
        "Stylesheets": { count: 4, examples: ["globals.css"] },
        "Assets": { count: 18, examples: ["public/logo.svg", "favicon.ico"] },
      },
    },
    files,
    edges,
    coverage: {
      totalImports: edges.length + 58,
      resolved: edges.length,
      external: 58,
      excluded: 0,
      unresolved: 0,
      reExportsFound: 4,
      reExportsResolved: 4,
      unresolvedExamples: [],
    },
    distinctFoldersCount: folders.length,
    folders,
  };
}

const scaffold = generateScaffoldData();
const outPath = path.resolve("./lib/canvas/scaffold-data.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(scaffold, null, 2), "utf8");
console.log(`Generated realistic scaffold dataset with ${scaffold.files.length} files across ${scaffold.distinctFoldersCount} folders and ${scaffold.edges.length} edges.`);
