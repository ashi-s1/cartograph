import path from "node:path";
import { SyntaxKind, type SourceFile } from "ts-morph";
import type { ExtractedRoute } from "../types.ts";
import type { FrameworkAdapter } from "./types.ts";

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
  "coverage",
  ".gemini",
  ".agents",
  ".pnpm-store",
  "excalidraw",
  "test-fixtures",
]);

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]);

function normalizePosix(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * Normalizes an App Router path by removing route groups like (marketing) or (auth).
 */
function normalizeAppRoutePattern(subPath: string): string {
  const rawSegments = subPath.split("/").filter(Boolean);
  const cleanSegments = rawSegments.filter(
    (segment) => !(segment.startsWith("(") && segment.endsWith(")"))
  );
  return cleanSegments.length === 0 ? "/" : `/${cleanSegments.join("/")}`;
}

/**
 * Adapter for Next.js.
 * Derives roles from path conventions and AST directives, and extracts exact routes.
 */
export class NextAdapter implements FrameworkAdapter {
  readonly name = "nextjs";

  isCodeModule(relativePath: string): boolean {
    const ext = path.extname(relativePath).toLowerCase();
    if (relativePath.endsWith(".d.ts")) {
      return false;
    }
    return CODE_EXTENSIONS.has(ext);
  }

  isIgnored(relativePath: string): { ignored: boolean; reason?: string } {
    const segments = relativePath.split(/[/\\]/);
    for (const segment of segments) {
      if (IGNORED_DIRECTORIES.has(segment)) {
        return { ignored: true, reason: `Ignored directory: ${segment}` };
      }
    }
    return { ignored: false };
  }

  classifyFile(relativePath: string, sourceFile?: SourceFile): string {
    const posix = normalizePosix(relativePath);

    // 1. App Router or Pages Router page routes
    const isAppPage = /(?:^|\/)app\/(?:(.+)\/)?page\.(?:tsx|jsx|js|ts)$/.test(posix);
    const isPagesPage =
      /(?:^|\/)pages\/(.+)\.(?:tsx|jsx|js|ts)$/.test(posix) &&
      !/(?:^|\/)pages\/(?:api\/|_app|_document|_error)/.test(posix);

    if (isAppPage || isPagesPage) {
      return "Page routes";
    }

    // 2. App Router or Pages Router API endpoints
    const isAppRoute = /(?:^|\/)app\/(?:(.+)\/)?route\.(?:ts|js|tsx|jsx)$/.test(posix);
    const isPagesApi = /(?:^|\/)pages\/api\/(.+)\.(?:ts|js|tsx|jsx)$/.test(posix);

    if (isAppRoute || isPagesApi) {
      return "API endpoints";
    }

    // 3. Server actions: "use server" directive or action path convention
    let hasUseServerDirective = false;
    if (sourceFile) {
      // Check top-level statements for "use server" directive prologue
      const statements = sourceFile.getStatements();
      for (const statement of statements.slice(0, 5)) {
        if (
          statement.getKind() === SyntaxKind.ExpressionStatement &&
          statement.getText().replace(/['";\s]/g, "") === "useserver"
        ) {
          hasUseServerDirective = true;
          break;
        }
      }
    }

    const isActionFile =
      hasUseServerDirective ||
      /(?:^|\/)actions(?:\/|\.|$)/i.test(posix) ||
      /\.actions?\.(?:ts|js)$/i.test(posix);

    if (isActionFile) {
      return "Server actions";
    }

    // 4. Components
    if (/(?:^|\/)components\//.test(posix) || /\.(?:tsx|jsx)$/.test(posix)) {
      return "Components";
    }

    // 5. Config files
    if (
      /(?:^|\/)(?:next|tailwind|postcss|tsconfig|eslint)\.config\./.test(posix) ||
      posix.endsWith(".json")
    ) {
      return "Config";
    }

    // 6. Utilities
    if (/(?:^|\/)(?:lib|utils|helpers)\//.test(posix)) {
      return "Utilities";
    }

    return "Generic";
  }

  extractRoutes(relativePath: string, sourceFile: SourceFile): ExtractedRoute[] {
    const posix = normalizePosix(relativePath);
    const routes: ExtractedRoute[] = [];

    // Case 1: App Router page: app/**/page.tsx
    const appPageMatch = posix.match(/(?:^|\/)app\/(?:(.+)\/)?page\.(?:tsx|jsx|js|ts)$/);
    if (appPageMatch) {
      const subPath = appPageMatch[1] || "";
      const pattern = normalizeAppRoutePattern(subPath);
      routes.push({
        file: relativePath,
        method: "GET",
        path: pattern,
      });
      return routes;
    }

    // Case 2: Pages Router page: pages/**.tsx (excluding api and special _ pages)
    const pagesPageMatch = posix.match(/(?:^|\/)pages\/(.+)\.(?:tsx|jsx|js|ts)$/);
    if (pagesPageMatch && !posix.includes("/pages/api/") && !posix.includes("/pages/_")) {
      let pagePath = pagesPageMatch[1];
      if (pagePath === "index") {
        pagePath = "/";
      } else if (pagePath.endsWith("/index")) {
        pagePath = `/${pagePath.slice(0, -6)}`;
      } else {
        pagePath = `/${pagePath}`;
      }
      routes.push({
        file: relativePath,
        method: "GET",
        path: pagePath,
      });
      return routes;
    }

    // Case 3: App Router route handler: app/**/route.ts
    const appRouteMatch = posix.match(/(?:^|\/)app\/(?:(.+)\/)?route\.(?:ts|js|tsx|jsx)$/);
    if (appRouteMatch) {
      const subPath = appRouteMatch[1] || "";
      const pattern = normalizeAppRoutePattern(subPath);

      // Extract exported HTTP methods strictly from AST
      const exportedMethods: string[] = [];

      for (const fn of sourceFile.getFunctions()) {
        if (fn.isExported()) {
          const name = fn.getName()?.toUpperCase();
          if (name && HTTP_METHODS.has(name) && !exportedMethods.includes(name)) {
            exportedMethods.push(name);
          }
        }
      }

      for (const varDecl of sourceFile.getVariableDeclarations()) {
        const stmt = varDecl.getVariableStatement();
        if (stmt?.isExported()) {
          const name = varDecl.getName().toUpperCase();
          if (name && HTTP_METHODS.has(name) && !exportedMethods.includes(name)) {
            exportedMethods.push(name);
          }
        }
      }

      for (const method of exportedMethods) {
        routes.push({
          file: relativePath,
          method,
          path: pattern,
        });
      }
    }

    return routes;
  }
}
