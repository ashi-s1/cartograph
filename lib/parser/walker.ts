import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { FrameworkAdapter } from "./adapters/types.ts";
import type { FileWalkReport, ParsedFile } from "./types.ts";

export interface WalkResult {
  codeFiles: ParsedFile[];
  report: FileWalkReport;
}

function normalizePosix(p: string): string {
  return p.split(path.sep).join("/");
}

function getSkipCategory(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);

  if (filePath.endsWith(".d.ts")) {
    return "Ambient declaration file (.d.ts)";
  }
  if (!ext) {
    return "Extensionless file";
  }

  const categoryMap: Record<string, string> = {
    ".md": "Documentation (.md)",
    ".json": "Data/Config JSON (.json)",
    ".yaml": "Config YAML (.yaml)",
    ".yml": "Config YAML (.yml)",
    ".css": "Stylesheet (.css)",
    ".scss": "Stylesheet (.scss)",
    ".html": "HTML document (.html)",
    ".ico": "Image/Icon (.ico)",
    ".png": "Image/Asset (.png)",
    ".jpg": "Image/Asset (.jpg)",
    ".svg": "Vector graphic (.svg)",
    ".lock": "Package lockfile",
    ".sql": "Database SQL migration/script (.sql)",
    ".env": "Environment file",
    ".gitignore": "VCS configuration",
  };

  if (categoryMap[ext]) {
    return categoryMap[ext];
  }

  if (base.startsWith(".env")) {
    return "Environment configuration";
  }

  return `Non-code asset (${ext})`;
}

/**
 * Walks a repository directory, collecting modules and categorizing all files.
 * Tracks line counts, byte sizes, and content hashes.
 */
export function walkRepository(
  rootDir: string,
  adapter: FrameworkAdapter
): WalkResult {
  const absoluteRoot = path.resolve(rootDir);
  const codeFiles: ParsedFile[] = [];

  const skipReasons: Record<string, { count: number; examples: string[] }> = {};
  let totalFound = 0;
  let totalParsed = 0;
  let totalSkipped = 0;

  function recordSkip(relativePath: string, reason: string) {
    totalSkipped++;
    if (!skipReasons[reason]) {
      skipReasons[reason] = { count: 0, examples: [] };
    }
    skipReasons[reason].count++;
    if (skipReasons[reason].examples.length < 5) {
      skipReasons[reason].examples.push(relativePath);
    }
  }

  function traverse(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = normalizePosix(path.relative(absoluteRoot, fullPath));

      if (entry.isDirectory()) {
        const ignoreCheck = adapter.isIgnored(relativePath);
        if (ignoreCheck.ignored) {
          // Do not recurse into ignored directories, but note that the tree is skipped
          continue;
        }
        traverse(fullPath);
      } else if (entry.isFile()) {
        totalFound++;

        if (!adapter.isCodeModule(relativePath)) {
          const reason = getSkipCategory(relativePath);
          recordSkip(relativePath, reason);
          continue;
        }

        try {
          const content = fs.readFileSync(fullPath);
          const text = content.toString("utf8");
          const lines = text.length === 0 ? 0 : text.split(/\r?\n/).length;
          const bytes = content.byteLength;
          const hash = crypto.createHash("sha256").update(content).digest("hex");

          const folder = path.dirname(relativePath) === "." ? "." : path.dirname(relativePath);

          codeFiles.push({
            path: relativePath,
            folder: normalizePosix(folder),
            lines,
            bytes,
            hash,
            fanIn: 0,
            fanOut: 0,
          });

          totalParsed++;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          recordSkip(relativePath, `Read error: ${message}`);
        }
      }
    }
  }

  traverse(absoluteRoot);

  return {
    codeFiles,
    report: {
      found: totalFound,
      parsed: totalParsed,
      skipped: totalSkipped,
      skipReasons,
    },
  };
}
