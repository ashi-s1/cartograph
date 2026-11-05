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
  "excalidraw",
  "test-fixtures",
]);

function normalizePosix(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * Adapter for Express applications.
 * Derives roles from directory conventions accepting both singular and plural names.
 * Express routes are assembled dynamically at runtime, so exact routes cannot be
 * statically guaranteed without inference — returns an empty route table.
 */
export class ExpressAdapter implements FrameworkAdapter {
  readonly name = "express";

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
    const posix = normalizePosix(relativePath).toLowerCase();
    const fileName = path.basename(posix);

    // 1. Routes / Routers (singular and plural)
    if (
      /(?:^|\/)(?:routes?|routers?)\//i.test(posix) ||
      /\.(?:routes?|routers?)\.(?:js|ts|cjs|mjs)$/i.test(fileName) ||
      /^(?:routes?|routers?)\.(?:js|ts|cjs|mjs)$/i.test(fileName)
    ) {
      return "Routes";
    }

    // 2. Controllers (singular and plural)
    if (
      /(?:^|\/)controllers?\//i.test(posix) ||
      /\.(?:controllers?)\.(?:js|ts|cjs|mjs)$/i.test(fileName)
    ) {
      return "Controllers";
    }

    // 3. Middleware (singular and plural)
    if (
      /(?:^|\/)middlewares?\//i.test(posix) ||
      /\.(?:middlewares?)\.(?:js|ts|cjs|mjs)$/i.test(fileName)
    ) {
      return "Middleware";
    }

    // 4. Services (singular and plural)
    if (
      /(?:^|\/)services?\//i.test(posix) ||
      /\.(?:services?)\.(?:js|ts|cjs|mjs)$/i.test(fileName)
    ) {
      return "Services";
    }

    // 5. Models / Schemas (singular and plural)
    if (
      /(?:^|\/)(?:models?|schemas?|entities?)\//i.test(posix) ||
      /\.(?:models?|schemas?|entities?)\.(?:js|ts|cjs|mjs)$/i.test(fileName)
    ) {
      return "Models";
    }

    // 6. Config (singular and plural)
    if (
      /(?:^|\/)configs?\//i.test(posix) ||
      /(?:^|\.)(?:config|conf)\.(?:js|ts|json)$/i.test(fileName)
    ) {
      return "Config";
    }

    // 7. Utilities (singular and plural)
    if (/(?:^|\/)(?:utils?|helpers?|lib)\//i.test(posix)) {
      return "Utilities";
    }

    return "Generic";
  }

  extractRoutes(): ExtractedRoute[] {
    // Constraint: Express routes are assembled dynamically at runtime and not statically extractable.
    // Spec: "An Express repository gets roles and an empty route table."
    return [];
  }
}
