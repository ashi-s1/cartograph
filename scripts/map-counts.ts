import fs from "node:fs";
import path from "node:path";
import { foldModules } from "../lib/canvas/folding.ts";
import type { ParserResult } from "../lib/parser/types.ts";

function runMapCounts() {
  const argPath = process.argv[2] || "app/preview/analysis.json";
  const filePath = path.resolve(argPath);

  if (!fs.existsSync(filePath)) {
    console.error(`\n❌ Error: File not found at ${filePath}`);
    console.error(`Please run: pnpm parse <repo-path> --out ${argPath}\n`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const data: ParserResult = JSON.parse(raw);

  console.log(`\n========================================`);
  console.log(` CARTOGRAPH MAP COUNTS (Phase 4 Checks) `);
  console.log(`========================================`);
  console.log(`Source File: ${filePath}`);
  console.log(`Repository:  ${data.repositoryRoot}`);
  console.log(`Total Files: ${data.files.length}`);
  console.log(`Total Edges: ${data.edges.length}\n`);

  const folding = foldModules(data.files, data.edges);

  // Check 1: Node count, under roughly two dozen, ~1 node per 10 files
  console.log(`[Check 1] Node Count: ${folding.nodes.length} nodes (Threshold used: ${folding.thresholdUsed})`);
  console.log(`          Ratio: 1 node per ${(data.files.length / folding.nodes.length).toFixed(1)} files (target: under roughly two dozen)`);
  if (folding.nodes.length <= 24) {
    console.log(`          Status: PASSED (<= 24 nodes)\n`);
  } else {
    console.log(`          Status: FAILED (> 24 nodes)\n`);
  }

  // Check 2: Every node holds more than one file
  const singleFileNodes = folding.nodes.filter((n) => n.fileCount <= 1);
  console.log(`[Check 2] Multi-file Nodes:`);
  console.log(`          Single-file nodes count: ${singleFileNodes.length}`);
  console.log(`          Min files in a node:     ${Math.min(...folding.nodes.map((n) => n.fileCount))}`);
  console.log(`          Max files in a node:     ${Math.max(...folding.nodes.map((n) => n.fileCount))}`);
  if (singleFileNodes.length === 0) {
    console.log(`          Status: PASSED (Every node holds > 1 files)\n`);
  } else {
    console.log(`          Status: FAILED (Found single-file nodes)\n`);
  }

  // Check 3: Every edge terminates on an existing node
  const nodeSet = new Set(folding.nodes.map((n) => n.id));
  const invalidEdges = folding.edges.filter(
    (e) => !nodeSet.has(e.source) || !nodeSet.has(e.target)
  );
  console.log(`[Check 3] Edge Validity:`);
  console.log(`          Total Folded Edges: ${folding.edges.length}`);
  console.log(`          Invalid Edges:      ${invalidEdges.length}`);
  if (invalidEdges.length === 0) {
    console.log(`          Status: PASSED (All edges terminate on existing nodes)\n`);
  } else {
    console.log(`          Status: FAILED (Edges point to missing nodes)\n`);
  }

  console.log(`--- Folded Nodes Breakdown ---`);
  console.table(
    folding.nodes.map((n) => ({
      Label: n.label,
      Folder: n.id,
      Files: n.fileCount,
      FanIn: n.fanIn,
      Height: `${n.height}px`,
      Width: `${n.width}px`,
    }))
  );
  console.log();
}

runMapCounts();
