import path from "node:path";
import { Project, SyntaxKind, type CallExpression, type StringLiteral } from "ts-morph";
import { detectFrameworkAdapter } from "./adapters/detector.ts";
import type { FrameworkAdapter } from "./adapters/types.ts";
import { walkRepository } from "./walker.ts";
import { ModuleResolver } from "./resolver.ts";
import { computeFanMetrics, deduplicateEdges } from "./graph.ts";
import { readModuleExports } from "./exports.ts";
import type {
  ParserResult,
  ParsedEdge,
  CoverageReport,
  UnresolvedExample,
  ExtractedRoute,
  FileRole,
} from "./types.ts";

function normalizePosix(p: string): string {
  return p.split(path.sep).join("/");
}

export interface ParseOptions {
  rootDir: string;
  adapter?: FrameworkAdapter;
}

/**
 * Parses a repository on disk using ts-morph AST.
 * Pure standalone function: takes directory path, returns typed data.
 * Does not import React, Next, or database clients.
 */
export function parseRepository(options: ParseOptions): ParserResult {
  const rootDir = path.resolve(options.rootDir);
  const adapter = options.adapter ?? detectFrameworkAdapter(rootDir);

  // 1. Walk repository and gather modules
  const { codeFiles, report: walkReport } = walkRepository(rootDir, adapter);
  const knownFilePaths = codeFiles.map((f) => f.path);
  const resolver = new ModuleResolver(rootDir, knownFilePaths);

  // 2. Initialize ts-morph project
  const project = new Project({
    useInMemoryFileSystem: false,
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      noEmit: true,
    },
    skipAddingFilesFromTsConfig: true,
  });

  // Add all discovered code files
  for (const file of codeFiles) {
    const absPath = path.join(rootDir, file.path);
    project.addSourceFileAtPath(absPath);
  }

  const rawEdges: ParsedEdge[] = [];
  const routes: ExtractedRoute[] = [];
  const roles: FileRole[] = [];
  const fileExportsMap = new Map<string, string[]>();

  let totalImports = 0;
  let resolvedCount = 0;
  let externalCount = 0;
  let excludedCount = 0;
  let unresolvedCount = 0;
  let reExportsFound = 0;
  let reExportsResolved = 0;
  const unresolvedExamples: UnresolvedExample[] = [];

  function handleImport(
    sourceFileRel: string,
    specifier: string,
    kind: ParsedEdge["kind"],
    line: number
  ) {
    totalImports++;
    if (kind === "re_export") {
      reExportsFound++;
    }

    const resolution = resolver.resolve(specifier, sourceFileRel);

    if (resolution.status === "resolved" && resolution.resolvedPath) {
      resolvedCount++;
      if (kind === "re_export") {
        reExportsResolved++;
      }
      rawEdges.push({
        source: sourceFileRel,
        target: resolution.resolvedPath,
        specifier,
        kind,
      });
    } else if (resolution.status === "external") {
      externalCount++;
    } else if (resolution.status === "excluded") {
      excludedCount++;
    } else {
      unresolvedCount++;
      const reason = resolution.reason || "Module could not be resolved";
      if (unresolvedExamples.length < 20) {
        unresolvedExamples.push({
          sourceFile: sourceFileRel,
          specifier,
          kind,
          reason,
          line,
        });
      }
    }
  }

  // 3. Inspect AST for each source file
  const sourceFiles = project.getSourceFiles();

  for (const sourceFile of sourceFiles) {
    const absPath = sourceFile.getFilePath();
    const sourceFileRel = normalizePosix(path.relative(rootDir, absPath));

    // A. Plain Imports: import ... from '...'
    const importDeclarations = sourceFile.getImportDeclarations();
    for (const importDecl of importDeclarations) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      const line = importDecl.getStartLineNumber();
      handleImport(sourceFileRel, moduleSpecifier, "import", line);
    }

    // B. Re-exports: export ... from '...'
    const exportDeclarations = sourceFile.getExportDeclarations();
    for (const exportDecl of exportDeclarations) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();
      if (moduleSpecifier) {
        const line = exportDecl.getStartLineNumber();
        handleImport(sourceFileRel, moduleSpecifier, "re_export", line);
      }
    }

    // C. Call Expressions: dynamic import('...') and CommonJS require('...')
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression) as CallExpression[];
    for (const callExpr of callExpressions) {
      const expr = callExpr.getExpression();
      if (expr.getKind() === SyntaxKind.ImportKeyword) {
        const args = callExpr.getArguments();
        if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
          const stringLiteral = args[0] as StringLiteral;
          const specifier = stringLiteral.getLiteralValue();
          const line = callExpr.getStartLineNumber();
          handleImport(sourceFileRel, specifier, "dynamic_import", line);
        }
      } else if (
        expr.getKind() === SyntaxKind.Identifier &&
        expr.getText() === "require"
      ) {
        const args = callExpr.getArguments();
        if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
          const stringLiteral = args[0] as StringLiteral;
          const specifier = stringLiteral.getLiteralValue();
          const line = callExpr.getStartLineNumber();
          handleImport(sourceFileRel, specifier, "import", line);
        }
      }
    }

    // D. Extract Export Names
    const exportedNames = readModuleExports(sourceFile);
    fileExportsMap.set(sourceFileRel, exportedNames);

    // E. Framework Role Classification
    const roleName = adapter.classifyFile ? adapter.classifyFile(sourceFileRel, sourceFile) || "Generic" : "Generic";
    roles.push({
      file: sourceFileRel,
      role: roleName,
      confidence: 1.0,
    });

    // F. Framework Route Extraction
    if (adapter.extractRoutes) {
      const extracted = adapter.extractRoutes(sourceFileRel, sourceFile);
      for (const r of extracted) {
        routes.push(r);
      }
    }
  }

  // 4. Deduplicate edges and compute graph metrics (pure functions)
  const edges = deduplicateEdges(rawEdges);
  const filesWithExports = codeFiles.map((f) => ({
    ...f,
    exports: fileExportsMap.get(f.path) || [],
  }));
  const files = computeFanMetrics(filesWithExports, edges);

  // 5. Gather distinct folders
  const folderSet = new Set(files.map((f) => f.folder));
  const folders = Array.from(folderSet).sort();

  const coverage: CoverageReport = {
    totalImports,
    resolved: resolvedCount,
    external: externalCount,
    excluded: excludedCount,
    unresolved: unresolvedCount,
    reExportsFound,
    reExportsResolved,
    unresolvedExamples,
  };

  return {
    repositoryRoot: rootDir,
    timestamp: new Date().toISOString(),
    framework: adapter.name,
    walk: walkReport,
    files,
    edges,
    coverage,
    distinctFoldersCount: folders.length,
    folders,
    routes,
    roles,
  };
}
