import path from "node:path";
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
  "dist",
  "build",
  "out",
  ".turbo",
  "coverage",
  ".gemini",
  ".agents",
  ".pnpm-store",
]);

function normalizePosix(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * Adapter for standalone React applications.
 */
export class ReactAdapter implements FrameworkAdapter {
  readonly name = "react";

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

  classifyFile(relativePath: string): string {
    const posix = normalizePosix(relativePath);
    const fileName = path.basename(posix);

    // 1. Hooks: use*
    if (
      (fileName.startsWith("use") && (posix.endsWith(".ts") || posix.endsWith(".tsx"))) ||
      /(?:^|\/)hooks\//.test(posix)
    ) {
      return "Hooks";
    }

    // 2. Contexts: *Context.*
    if (
      /(?:^|\/)contexts?\//.test(posix) ||
      /context\.(?:tsx|jsx|ts|js)$/i.test(fileName)
    ) {
      return "Contexts";
    }

    // 3. Components
    if (
      /(?:^|\/)components\//.test(posix) ||
      /\.(?:tsx|jsx)$/.test(posix)
    ) {
      return "Components";
    }

    // 4. Utilities
    if (/(?:^|\/)(?:lib|utils|helpers)\//.test(posix)) {
      return "Utilities";
    }

    return "Generic";
  }

  extractRoutes(): ExtractedRoute[] {
    return [];
  }
}
