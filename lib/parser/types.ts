/**
 * Phase 3 & 8 — Parser Data Contracts
 * Defines the strict types for parsed files, edges, coverage reports, graph metrics, routes, and roles.
 */

export type EdgeKind = "import" | "re_export" | "dynamic_import";

export interface ParsedEdge {
  source: string;
  target: string;
  specifier: string;
  kind: EdgeKind;
}

export interface ParsedFile {
  /** Relative normalized POSIX path from repository root, e.g. "lib/auth/org.ts" */
  path: string;
  /** Directory path, e.g. "lib/auth" or "." for root */
  folder: string;
  /** Total line count */
  lines: number;
  /** File size in bytes */
  bytes: number;
  /** SHA-256 content hash */
  hash: string;
  /** Number of distinct repository files importing this file */
  fanIn: number;
  /** Number of distinct repository files imported by this file */
  fanOut: number;
  /** Names exported by this module (ESM or CommonJS) */
  exports?: string[];
}

export type CoverageStatus = "resolved" | "external" | "excluded" | "unresolved";

export interface ImportRecord {
  sourceFile: string;
  specifier: string;
  kind: EdgeKind;
  status: CoverageStatus;
  resolvedPath: string | null;
  reason: string | null;
  line: number;
}

export interface UnresolvedExample {
  sourceFile: string;
  specifier: string;
  kind: EdgeKind;
  reason: string;
  line: number;
}

export interface CoverageReport {
  totalImports: number;
  resolved: number;
  external: number;
  excluded: number;
  unresolved: number;
  reExportsFound: number;
  reExportsResolved: number;
  unresolvedExamples: UnresolvedExample[];
}

export interface SkipRecord {
  count: number;
  examples: string[];
}

export interface FileWalkReport {
  found: number;
  parsed: number;
  skipped: number;
  skipReasons: Record<string, SkipRecord>;
}

export interface ExtractedRoute {
  file: string;
  method: string;
  path: string;
}

export interface FileRole {
  file: string;
  role: string;
  confidence: number;
}

export interface ParserResult {
  repositoryRoot: string;
  timestamp: string;
  framework: string;
  walk: FileWalkReport;
  files: ParsedFile[];
  edges: ParsedEdge[];
  coverage: CoverageReport;
  distinctFoldersCount: number;
  folders: string[];
  routes: ExtractedRoute[];
  roles: FileRole[];
}
