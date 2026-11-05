import path from "node:path";
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
]);

/**
 * Fallback framework adapter: assumes no framework at all.
 * Treats standard TypeScript and JavaScript files as modules.
 */
export class FallbackAdapter implements FrameworkAdapter {
  readonly name = "fallback";

  isCodeModule(relativePath: string): boolean {
    const ext = path.extname(relativePath).toLowerCase();
    // Exclude ambient declaration files (.d.ts) from module graph as they contain no executable code/runtime imports
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
}
