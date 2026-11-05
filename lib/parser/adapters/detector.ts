import fs from "node:fs";
import path from "node:path";
import type { FrameworkAdapter } from "./types.ts";
import { NextAdapter } from "./next.ts";
import { NestAdapter } from "./nest.ts";
import { ReactAdapter } from "./react.ts";
import { FallbackAdapter } from "./fallback.ts";

/**
 * Detects the framework adapter for a repository.
 * Constraint: Detection runs in a fixed order and the first match wins.
 * Order: Next.js -> NestJS -> React -> Fallback
 */
export function detectFrameworkAdapter(rootDir: string): FrameworkAdapter {
  let pkgDeps: Record<string, string> = {};

  try {
    const pkgPath = path.join(rootDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkgContent = fs.readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgContent);
      pkgDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
      };
    }
  } catch {
    // If package.json is missing or invalid, detection continues via file signatures
  }

  // 1. Next.js detection
  const hasNextDep = Boolean(pkgDeps["next"]);
  const hasNextConfig =
    fs.existsSync(path.join(rootDir, "next.config.js")) ||
    fs.existsSync(path.join(rootDir, "next.config.mjs")) ||
    fs.existsSync(path.join(rootDir, "next.config.ts"));

  if (hasNextDep || hasNextConfig) {
    return new NextAdapter();
  }

  // 2. NestJS detection
  const hasNestDep = Boolean(pkgDeps["@nestjs/core"] || pkgDeps["@nestjs/common"]);
  const hasNestConfig = fs.existsSync(path.join(rootDir, "nest-cli.json"));

  if (hasNestDep || hasNestConfig) {
    return new NestAdapter();
  }

  // 3. Standalone React detection
  const hasReactDep = Boolean(pkgDeps["react"]);
  if (hasReactDep) {
    return new ReactAdapter();
  }

  // 4. Fallback (generic roles, empty route table)
  return new FallbackAdapter();
}
