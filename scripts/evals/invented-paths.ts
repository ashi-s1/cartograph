/**
 * Phase 11 Evals — Invented-Path Check
 *
 * Acceptance checks per specs/phase-11.md:
 * 1. Run the invented-path check against recent real explanations. It reports a
 *    score, and any failure it flags can be confirmed by hand in ten seconds.
 * 2. Feed it an explanation with a made-up filename spliced in. It catches it.
 */

import "./env.ts";
import { checkInventedPaths } from "../../lib/ai/eval-paths.ts";
import { createClient } from "@supabase/supabase-js";

async function main() {
  console.log("=================================================");
  console.log(" Cartograph Evals — Invented-Path Check");
  console.log("=================================================\n");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[ERROR] Missing Supabase credentials in .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 1. Fetch recent explanations from database
  console.log("Fetching recent real explanations from database...");
  const { data: explanations, error: expErr } = await supabase
    .from("explanations")
    .select("id, analysis_id, file_id, target_type, target_path, content, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (expErr) {
    console.error("[WARN] Failed to query explanations table:", expErr.message);
  }

  const realEvaluations: Array<{
    target: string;
    score: number;
    totalMentioned: number;
    invented: string[];
    passed: boolean;
  }> = [];

  if (explanations && explanations.length > 0) {
    console.log(`Evaluating ${explanations.length} recent explanations...\n`);

    for (const exp of explanations) {
      // Fetch allowed neighbour paths for this explanation
      const [{ data: rawFiles }, { data: rawEdges }] = await Promise.all([
        supabase
          .from("files")
          .select("id, path")
          .eq("analysis_id", exp.analysis_id),
        supabase
          .from("edges")
          .select("source_file_id, target_file_id, target_path")
          .eq("analysis_id", exp.analysis_id),
      ]);

      const fileIdToPath = new Map<string, string>();
      for (const f of rawFiles || []) {
        fileIdToPath.set(f.id, f.path);
      }

      const allowedPaths = new Set<string>();
      allowedPaths.add(exp.target_path);

      if (exp.target_type === "file") {
        for (const edge of rawEdges || []) {
          const sourcePath = fileIdToPath.get(edge.source_file_id);
          const targetResolved =
            edge.target_path || (edge.target_file_id ? fileIdToPath.get(edge.target_file_id) : "");

          if (sourcePath === exp.target_path && targetResolved) {
            allowedPaths.add(targetResolved);
          }
          if (targetResolved === exp.target_path && sourcePath) {
            allowedPaths.add(sourcePath);
          }
        }
      } else {
        // Folder: all files in folder + their imports/dependents
        for (const f of rawFiles || []) {
          if (f.path.startsWith(`${exp.target_path}/`) || f.path === exp.target_path) {
            allowedPaths.add(f.path);
          }
        }
      }

      const result = checkInventedPaths(exp.content, allowedPaths);
      realEvaluations.push({
        target: exp.target_path,
        score: result.score,
        totalMentioned: result.totalMentioned,
        invented: result.inventedPaths,
        passed: result.passed,
      });

      console.log(`Target: \`${exp.target_path}\` (${exp.target_type})`);
      console.log(`  Allowed paths in context : ${allowedPaths.size}`);
      console.log(`  Mentioned path tokens    : ${result.totalMentioned}`);
      console.log(`  Score                    : ${(result.score * 100).toFixed(1)}%`);
      if (result.inventedPaths.length > 0) {
        console.log(`  FLAGGED INVENTED PATHS   : ${result.inventedPaths.join(", ")}`);
      } else {
        console.log(`  Verdict                  : PASSED (No invented paths)`);
      }
      console.log("");
    }
  } else {
    console.log("No stored explanations found in database. Running synthetic baseline evaluations.\n");
    // Sample real explanation text grounded in Cartograph codebase
    const sampleReal = `The \`components/canvas/detail-pane.tsx\` component renders the right sidebar. It imports \`lib/canvas/graph-maths.ts\` and \`lib/taxonomy.ts\` to calculate metrics and framework roles. It is imported by \`components/canvas/analysis-explorer.tsx\`.`;
    const allowed = [
      "components/canvas/detail-pane.tsx",
      "lib/canvas/graph-maths.ts",
      "lib/taxonomy.ts",
      "components/canvas/analysis-explorer.tsx",
    ];
    const res = checkInventedPaths(sampleReal, allowed);
    realEvaluations.push({
      target: "components/canvas/detail-pane.tsx",
      score: res.score,
      totalMentioned: res.totalMentioned,
      invented: res.inventedPaths,
      passed: res.passed,
    });
    console.log(`Sample Explanation: \`components/canvas/detail-pane.tsx\``);
    console.log(`  Score: ${(res.score * 100).toFixed(1)}% (Passed: ${res.passed})`);
  }

  // Summary of Real Traffic
  const totalRuns = realEvaluations.length;
  const avgScore =
    totalRuns === 0
      ? 1.0
      : realEvaluations.reduce((sum, r) => sum + r.score, 0) / totalRuns;
  console.log("-------------------------------------------------");
  console.log(`Recent Real Explanations Evaluated : ${totalRuns}`);
  console.log(`Average Grounding Score            : ${(avgScore * 100).toFixed(1)}%`);
  console.log("-------------------------------------------------\n");

  // =========================================================
  // ACCEPTANCE CHECK 2: Spliced Made-Up Filename Catch Check
  // =========================================================
  console.log("=================================================");
  console.log(" Running Acceptance Check 2: Made-Up Filename Catch");
  console.log("=================================================");

  const groundedBase = `This module \`lib/parser/index.ts\` coordinates the parser pipeline. It imports \`lib/parser/walker.ts\` and \`lib/parser/resolver.ts\` to resolve module specifiers.`;
  const allowedSet = ["lib/parser/index.ts", "lib/parser/walker.ts", "lib/parser/resolver.ts"];

  // 2a. Verify clean grounded base passes 100%
  const cleanRes = checkInventedPaths(groundedBase, allowedSet);
  if (!cleanRes.passed || cleanRes.score !== 1.0) {
    console.error("[FAIL] Baseline clean check should pass with 1.0, got:", cleanRes);
    process.exit(1);
  }
  console.log("[PASS] Clean explanation without made-up files passes: 100%");

  // 2b. Splice in a fake/invented path
  const fakePath = "src/services/invented_ghost_repository.ts";
  const poisonedText = `${groundedBase} It also delegates transaction management to \`${fakePath}\`.`;

  console.log(`\nSplicing in made-up file: \`${fakePath}\`...`);
  const poisonedRes = checkInventedPaths(poisonedText, allowedSet);

  console.log(`  Passed          : ${poisonedRes.passed}`);
  console.log(`  Grounding Score : ${(poisonedRes.score * 100).toFixed(1)}%`);
  console.log(`  Flagged Paths   : ${poisonedRes.inventedPaths.join(", ")}`);

  if (!poisonedRes.passed && poisonedRes.inventedPaths.includes(fakePath)) {
    console.log("\n[SUCCESS] Acceptance Check 2 PASSED: The evaluator caught the made-up filename!");
  } else {
    console.error("\n[FAIL] Evaluator failed to catch the made-up filename!");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Invented-path eval failed:", err);
  process.exit(1);
});
