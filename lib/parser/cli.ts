import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseRepository } from "./index.ts";
import type { ParserResult } from "./types.ts";

function resolveUserPath(p: string): string {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1).replace(/^[/\\]/, ""));
  }
  return path.resolve(p);
}

function parseArgs(args: string[]): { targetDir: string; outFile: string | null } {
  let targetDir = process.cwd();
  let outFile: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--out" && i + 1 < args.length) {
      outFile = resolveUserPath(args[++i]);
    } else if (arg === "--target" && i + 1 < args.length) {
      targetDir = resolveUserPath(args[++i]);
    } else if (!arg.startsWith("--") && i === 0) {
      targetDir = resolveUserPath(arg);
    }
  }

  return { targetDir, outFile };
}

export function runCli() {
  const { targetDir, outFile } = parseArgs(process.argv.slice(2));

  console.log(`\n========================================`);
  console.log(` CARTOGRAPH CODEBASE PARSER (Phase 3)`);
  console.log(`========================================`);
  console.log(`Target Directory: ${targetDir}\n`);

  const startTime = Date.now();
  const result: ParserResult = parseRepository({ rootDir: targetDir });
  const duration = Date.now() - startTime;

  // 1. File Discovery & Walk Summary
  const { found, parsed, skipped, skipReasons } = result.walk;
  console.log(`--- [1] FILE WALK SUMMARY ---`);
  console.log(`Files Found:   ${found}`);
  console.log(`Files Parsed:  ${parsed}`);
  console.log(`Files Skipped: ${skipped}`);
  console.log(`Verification:  ${parsed} + ${skipped} = ${parsed + skipped} (${parsed + skipped === found ? "MATCHES FOUND" : "MISMATCH!"})\n`);

  if (Object.keys(skipReasons).length > 0) {
    console.log(`Skip Reasons Breakdown:`);
    for (const [reason, info] of Object.entries(skipReasons)) {
      console.log(`  • [${info.count}] ${reason}`);
      if (info.examples.length > 0) {
        console.log(`      examples: ${info.examples.join(", ")}`);
      }
    }
    console.log();
  }

  // 2. Folder Granularity Check
  console.log(`--- [2] FOLDERS & GRANULARITY ---`);
  console.log(`Distinct Folders Count: ${result.distinctFoldersCount}`);
  console.log(`Folders list:`);
  for (const folder of result.folders.slice(0, 15)) {
    console.log(`  - ${folder}`);
  }
  if (result.folders.length > 15) {
    console.log(`  ... and ${result.folders.length - 15} more`);
  }
  console.log();

  // 3. Edges & Dependency Graph
  console.log(`--- [3] DEPENDENCY GRAPH EDGES ---`);
  console.log(`Total Unique Edges: ${result.edges.length}`);
  const byKind = result.edges.reduce(
    (acc, e) => {
      acc[e.kind] = (acc[e.kind] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  for (const [kind, count] of Object.entries(byKind)) {
    console.log(`  • ${kind}: ${count}`);
  }
  console.log();

  // Top Fan-in / Fan-out files
  const sortedFanIn = [...result.files].sort((a, b) => b.fanIn - a.fanIn).slice(0, 5);
  const sortedFanOut = [...result.files].sort((a, b) => b.fanOut - a.fanOut).slice(0, 5);

  console.log(`Top Fan-In Files (most depended on):`);
  for (const f of sortedFanIn) {
    if (f.fanIn > 0) {
      console.log(`  ${f.fanIn} imports <- ${f.path}`);
    }
  }
  console.log();

  console.log(`Top Fan-Out Files (most outbound imports):`);
  for (const f of sortedFanOut) {
    if (f.fanOut > 0) {
      console.log(`  ${f.fanOut} imports -> ${f.path}`);
    }
  }
  console.log();

  // 4. Import Coverage Report
  const {
    totalImports,
    resolved,
    external,
    excluded,
    unresolved,
    reExportsFound,
    reExportsResolved,
    unresolvedExamples,
  } = result.coverage;

  console.log(`--- [4] IMPORT COVERAGE ---`);
  console.log(`Total Import Statements: ${totalImports}`);
  console.log(`  • Resolved to Project: ${resolved}`);
  console.log(`  • External Dependencies: ${external}`);
  console.log(`  • Deliberately Excluded: ${excluded}`);
  console.log(`  • Unresolved / Failures: ${unresolved}`);
  console.log(
    `Re-exports: Found ${reExportsFound}, Resolved ${reExportsResolved} (${
      reExportsFound === reExportsResolved ? "ALL RESOLVED" : `${reExportsFound - reExportsResolved} unresolved`
    })`
  );

  if (unresolvedExamples.length > 0) {
    console.log(`\nUnresolved Import Examples:`);
    for (const ex of unresolvedExamples) {
      console.log(`  ❌ ${ex.sourceFile}:${ex.line} -> '${ex.specifier}'`);
      console.log(`     Reason: ${ex.reason}`);
    }
  }
  console.log();

  // 5. Output File writing & verification
  if (outFile) {
    const outPath = path.resolve(outFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");
    console.log(`Output written to: ${outPath}`);

    // Read back and verify contract
    const rawRead = fs.readFileSync(outPath, "utf8");
    const parsedRead: ParserResult = JSON.parse(rawRead);
    if (
      Array.isArray(parsedRead.files) &&
      Array.isArray(parsedRead.edges) &&
      typeof parsedRead.coverage.resolved === "number" &&
      parsedRead.files.length === result.files.length
    ) {
      console.log(`Contract Verification: PASSED (Types and structure hold on deserialization)`);
    } else {
      console.error(`Contract Verification: FAILED`);
      process.exit(1);
    }
    console.log();
  }

  console.log(`Completed in ${duration}ms.\n`);
  return result;
}

runCli();
