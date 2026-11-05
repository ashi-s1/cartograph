import fs from "node:fs";
import path from "node:path";
import { foldModules } from "../lib/canvas/folding.ts";
import type { ParserResult } from "../lib/parser/types.ts";

const scaffoldPath = path.resolve("./lib/canvas/scaffold-data.json");
const data: ParserResult = JSON.parse(fs.readFileSync(scaffoldPath, "utf8"));

console.log("==========================================");
console.log("   FOLDING ALGORITHM VERIFICATION         ");
console.log("==========================================");
console.log(`Input Files: ${data.files.length}`);
console.log(`Input Folders: ${data.distinctFoldersCount}`);
console.log(`Input Edges: ${data.edges.length}\n`);

const result = foldModules(data.files, data.edges);

console.log(`--- [1] NODE COUNT CHECK ---`);
console.log(`Folded Node Count: ${result.nodes.length}`);
console.log(`Threshold Used: ${result.thresholdUsed}`);
console.log(`Ratio: ~1 node per ${(data.files.length / result.nodes.length).toFixed(1)} files (target: roughly one node per ten files)`);
if (result.nodes.length > 24) {
  console.error("FAIL: Node count exceeds 24!");
  process.exit(1);
} else {
  console.log("PASS: Node count is under roughly two dozen (< 25).\n");
}

console.log(`--- [2] MULTI-FILE NODE CHECK ---`);
let allHoldMultiple = true;
for (const n of result.nodes) {
  if (n.fileCount <= 1) {
    console.error(`FAIL: Node '${n.id}' has only ${n.fileCount} file(s)!`);
    allHoldMultiple = false;
  }
}
if (allHoldMultiple) {
  console.log(`PASS: Every single node holds > 1 files! (Min: ${Math.min(...result.nodes.map(n => n.fileCount))}, Max: ${Math.max(...result.nodes.map(n => n.fileCount))})\n`);
} else {
  process.exit(1);
}

console.log(`--- [3] EDGE TERMINATION CHECK ---`);
const nodeSet = new Set(result.nodes.map(n => n.id));
let allEdgesValid = true;
for (const e of result.edges) {
  if (!nodeSet.has(e.source) || !nodeSet.has(e.target)) {
    console.error(`FAIL: Edge ${e.source} -> ${e.target} terminates on nonexistent node!`);
    allEdgesValid = false;
  }
}
if (allEdgesValid) {
  console.log(`PASS: All ${result.edges.length} edges terminate on existing nodes!\n`);
} else {
  process.exit(1);
}

console.log("--- FOLDED NODES PREVIEW ---");
console.table(
  result.nodes.map(n => ({
    Label: n.label,
    Folder: n.id,
    Files: n.fileCount,
    FanIn: n.fanIn,
    FanOut: n.fanOut,
    Height: `${n.height}px`,
    Width: `${n.width}px`
  }))
);

console.log("==========================================");
console.log("   ALL 3 CHECKS PASSED 100%               ");
console.log("==========================================");
