import fs from "node:fs";
import path from "node:path";
import { parseRepository } from "../lib/parser/index.ts";

async function verify() {
  console.log("==========================================");
  console.log("   PHASE 3 ACCEPTANCE CHECK VERIFICATION   ");
  console.log("==========================================\n");

  // ----------------------------------------------------
  // Acceptance Check 1: Parse this project
  // ----------------------------------------------------
  console.log(">>> CHECK 1: Running against current project...");
  const thisProject = parseRepository({ rootDir: process.cwd() });
  const { found, parsed, skipped } = thisProject.walk;
  console.log(`Files Found:   ${found}`);
  console.log(`Files Parsed:  ${parsed}`);
  console.log(`Files Skipped: ${skipped}`);
  console.log(`Math: ${parsed} + ${skipped} = ${parsed + skipped}`);
  if (parsed + skipped !== found) {
    throw new Error("Check 1 failed: found != parsed + skipped");
  }
  console.log("Skip reasons breakdown:");
  for (const [reason, info] of Object.entries(thisProject.walk.skipReasons)) {
    console.log(`  • ${reason}: ${info.count}`);
  }
  console.log("CHECK 1 PASSED.\n");

  // ----------------------------------------------------
  // Acceptance Check 2: Folder granularity
  // ----------------------------------------------------
  console.log(">>> CHECK 2: Distinct folders check...");
  console.log(`Distinct Folders Count: ${thisProject.distinctFoldersCount}`);
  for (const folder of thisProject.folders) {
    console.log(`  - ${folder}`);
  }
  if (thisProject.distinctFoldersCount < 2) {
    throw new Error("Check 2 failed: folders count too coarse");
  }
  console.log("CHECK 2 PASSED.\n");

  // ----------------------------------------------------
  // Acceptance Check 3: Barrel files
  // ----------------------------------------------------
  console.log(">>> CHECK 3: Barrel file re-exports...");
  const fixtureDir = path.resolve("./test-fixtures/barrel-test");
  fs.mkdirSync(path.join(fixtureDir, "components"), { recursive: true });

  fs.writeFileSync(
    path.join(fixtureDir, "components/button.ts"),
    'export const Button = () => "button";\n'
  );
  fs.writeFileSync(
    path.join(fixtureDir, "components/card.ts"),
    'export const Card = () => "card";\n'
  );
  fs.writeFileSync(
    path.join(fixtureDir, "components/index.ts"),
    'export * from "./button.ts";\nexport { Card } from "./card.ts";\n'
  );
  fs.writeFileSync(
    path.join(fixtureDir, "app.ts"),
    'import { Button, Card } from "./components/index.ts";\n'
  );

  const barrelResult = parseRepository({ rootDir: fixtureDir });
  console.log(`Re-exports found:    ${barrelResult.coverage.reExportsFound}`);
  console.log(`Re-exports resolved: ${barrelResult.coverage.reExportsResolved}`);
  if (
    barrelResult.coverage.reExportsFound !== 2 ||
    barrelResult.coverage.reExportsResolved !== 2
  ) {
    throw new Error("Check 3 failed: re-exports not fully resolved");
  }
  console.log("CHECK 3 PASSED.\n");

  // ----------------------------------------------------
  // Acceptance Check 4: Rename target file & verify unresolved reason
  // ----------------------------------------------------
  console.log(">>> CHECK 4: Rename target file to create unresolved import...");
  fs.renameSync(
    path.join(fixtureDir, "components/card.ts"),
    path.join(fixtureDir, "components/card-renamed.ts")
  );

  const renameResult = parseRepository({ rootDir: fixtureDir });
  console.log(`Unresolved imports count: ${renameResult.coverage.unresolved}`);
  if (renameResult.coverage.unresolved !== 1) {
    throw new Error(
      `Check 4 failed: expected exactly 1 unresolved import, got ${renameResult.coverage.unresolved}`
    );
  }
  const fail = renameResult.coverage.unresolvedExamples[0];
  console.log(`Unresolved file: ${fail.sourceFile}:${fail.line}`);
  console.log(`Specifier: '${fail.specifier}'`);
  console.log(`Reason: ${fail.reason}`);
  console.log("CHECK 4 PASSED.\n");

  // Cleanup fixture
  fs.rmSync(fixtureDir, { recursive: true, force: true });

  // ----------------------------------------------------
  // Acceptance Check 5: Write typed data file & read back
  // ----------------------------------------------------
  console.log(">>> CHECK 5: Write typed data file and read back...");
  const outPath = path.resolve("./test-output.json");
  fs.writeFileSync(outPath, JSON.stringify(thisProject, null, 2), "utf8");
  const readBack = JSON.parse(fs.readFileSync(outPath, "utf8"));
  if (
    !Array.isArray(readBack.files) ||
    !Array.isArray(readBack.edges) ||
    readBack.files.length !== thisProject.files.length ||
    readBack.edges.length !== thisProject.edges.length ||
    typeof readBack.coverage.resolved !== "number"
  ) {
    throw new Error("Check 5 failed: typed structure does not hold");
  }
  console.log(`Output successfully written and deserialized. File count: ${readBack.files.length}, Edge count: ${readBack.edges.length}`);
  fs.rmSync(outPath, { force: true });
  console.log("CHECK 5 PASSED.\n");

  console.log("==========================================");
  console.log("   ALL 5 ACCEPTANCE CHECKS PASSED 100%    ");
  console.log("==========================================\n");
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
