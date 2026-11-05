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

/**
 * Fallback framework adapter: assumes no framework at all.
 * Roles are generic and route table is empty.
 */
export class FallbackAdapter implements FrameworkAdapter {
  readonly name = "fallback";

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

  classifyFile(): string {
    return "Generic";
  }

  extractRoutes(): ExtractedRoute[] {
    return [];
  }
}
