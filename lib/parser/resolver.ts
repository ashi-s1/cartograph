import fs from "node:fs";
import path from "node:path";
import module from "node:module";
import { ts } from "ts-morph";

export interface ResolutionResult {
  status: "resolved" | "external" | "excluded" | "unresolved";
  resolvedPath: string | null;
  reason: string | null;
}

export interface TsConfigPaths {
  baseUrl: string;
  paths: Record<string, string[]>;
}

function normalizePosix(p: string): string {
  return p.split(path.sep).join("/");
}

const CANDIDATE_EXTENSIONS = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
  "/index.mjs",
  "/index.cjs",
];

export class ModuleResolver {
  private readonly rootDir: string;
  private readonly knownFileSet: Set<string>;
  private readonly tsConfigPaths: TsConfigPaths | null;
  private readonly builtinModules: Set<string>;

  constructor(rootDir: string, knownFiles: string[]) {
    this.rootDir = path.resolve(rootDir);
    this.knownFileSet = new Set(knownFiles.map(normalizePosix));
    this.tsConfigPaths = this.loadTsConfigPaths();

    // Node built-in module list
    const builtins = module.builtinModules || [];
    this.builtinModules = new Set([
      ...builtins,
      ...builtins.map((m) => `node:${m}`),
    ]);
  }

  private loadTsConfigPaths(): TsConfigPaths | null {
    const configCandidates = ["tsconfig.json", "jsconfig.json"];

    for (const configName of configCandidates) {
      const configPath = path.join(this.rootDir, configName);
      if (fs.existsSync(configPath)) {
        try {
          const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
          if (!error && config?.compilerOptions?.paths) {
            return {
              baseUrl: config.compilerOptions.baseUrl || ".",
              paths: config.compilerOptions.paths,
            };
          }
        } catch {
          // Fall through to next config candidate
        }
      }
    }
    return null;
  }

  resolve(specifier: string, fromFile: string): ResolutionResult {
    // 1. Built-in modules
    if (this.builtinModules.has(specifier)) {
      return {
        status: "external",
        resolvedPath: null,
        reason: "Node.js standard library built-in module",
      };
    }

    // 2. Relative imports (e.g. ./utils, ../components/button)
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const fromDir = path.dirname(path.join(this.rootDir, fromFile));
      return this.resolveRelativeTarget(path.resolve(fromDir, specifier), specifier);
    }

    // 3. Path alias matching (e.g. @/* -> ./*)
    if (this.tsConfigPaths) {
      const aliasedPaths = this.matchPathAlias(specifier);
      if (aliasedPaths && aliasedPaths.length > 0) {
        for (const candidateAbsolute of aliasedPaths) {
          const result = this.resolveRelativeTarget(candidateAbsolute, specifier);
          if (result.status === "resolved") {
            return result;
          }
        }
        return {
          status: "unresolved",
          resolvedPath: null,
          reason: `Path alias matched '${specifier}', but target file does not exist on disk`,
        };
      }
    }

    // 4. If it does not start with relative/absolute and didn't match an alias, it is a package dependency
    if (!specifier.startsWith("/") && !specifier.startsWith(".")) {
      return {
        status: "external",
        resolvedPath: null,
        reason: "Third-party npm dependency",
      };
    }

    // 5. Absolute path from repo root
    if (specifier.startsWith("/")) {
      const absoluteTarget = path.join(this.rootDir, specifier);
      return this.resolveRelativeTarget(absoluteTarget, specifier);
    }

    return {
      status: "unresolved",
      resolvedPath: null,
      reason: `Cannot resolve module specifier '${specifier}'`,
    };
  }

  private matchPathAlias(specifier: string): string[] | null {
    if (!this.tsConfigPaths) return null;
    const { baseUrl, paths } = this.tsConfigPaths;
    const baseDir = path.resolve(this.rootDir, baseUrl);

    for (const [pattern, mappings] of Object.entries(paths)) {
      if (pattern.endsWith("/*")) {
        const prefix = pattern.slice(0, -2);
        if (specifier.startsWith(prefix + "/")) {
          const suffix = specifier.slice(prefix.length + 1);
          return mappings.map((mapping) => {
            const mapPrefix = mapping.endsWith("/*") ? mapping.slice(0, -2) : mapping;
            return path.resolve(baseDir, mapPrefix, suffix);
          });
        }
      } else if (pattern === specifier) {
        return mappings.map((mapping) => path.resolve(baseDir, mapping));
      }
    }

    return null;
  }

  private resolveRelativeTarget(absoluteTarget: string, originalSpecifier: string): ResolutionResult {
    const attempted: string[] = [];

    for (const ext of CANDIDATE_EXTENSIONS) {
      const candidateAbs = absoluteTarget + ext;
      const candidateRel = normalizePosix(path.relative(this.rootDir, candidateAbs));
      attempted.push(candidateRel);

      if (this.knownFileSet.has(candidateRel)) {
        return {
          status: "resolved",
          resolvedPath: candidateRel,
          reason: null,
        };
      }

      // Also check filesystem directly in case file exists outside code modules (e.g. .json)
      if (fs.existsSync(candidateAbs) && fs.statSync(candidateAbs).isFile()) {
        return {
          status: "resolved",
          resolvedPath: candidateRel,
          reason: null,
        };
      }
    }

    return {
      status: "unresolved",
      resolvedPath: null,
      reason: `Module '${originalSpecifier}' not found on disk (attempted: ${attempted.slice(0, 4).join(", ")})`,
    };
  }
}
