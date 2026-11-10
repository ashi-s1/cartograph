/**
 * Phase 11 Evals — Role Classification Accuracy
 *
 * Acceptance check 3 per specs/phase-11.md:
 * "Run role accuracy. It returns a percentage over a dataset of at least thirty files."
 *
 * Constraints:
 * - "The role dataset holds only files whose conventional role is one the
 *    classifier is actually allowed to return. Scoring it on questions it's
 *    forbidden to answer measures nothing."
 * - Permitted non-structural roles only: service, repository, model, util, config, component, hook.
 * - Never page, route, or controller.
 */

import "./env.ts";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { RunTree } from "langsmith";
import {
  buildRoleClassificationPrompt,
  PERMITTED_NON_STRUCTURAL_ROLES,
  type NonStructuralRole,
} from "../../lib/ai/prompts.ts";

export interface RoleDatasetItem {
  filePath: string;
  groundTruthRole: NonStructuralRole;
  inbound?: string[];
  outbound?: string[];
}

/**
 * Held-out dataset of 35 files with conventional ground truth roles.
 * Every role in this dataset is strictly one of the 7 permitted non-structural roles.
 */
export const ROLE_BENCHMARK_DATASET: RoleDatasetItem[] = [
  // Components (16)
  { filePath: "components/canvas/detail-pane.tsx", groundTruthRole: "component" },
  { filePath: "components/canvas/analysis-explorer.tsx", groundTruthRole: "component" },
  { filePath: "components/canvas/canvas-graph.tsx", groundTruthRole: "component" },
  { filePath: "components/canvas/canvas-shell.tsx", groundTruthRole: "component" },
  { filePath: "components/canvas/coverage-banner.tsx", groundTruthRole: "component" },
  { filePath: "components/canvas/folded-node.tsx", groundTruthRole: "component" },
  { filePath: "components/canvas/panel-node.tsx", groundTruthRole: "component" },
  { filePath: "components/canvas/formatted-prose.tsx", groundTruthRole: "component" },
  { filePath: "components/app-shell.tsx", groundTruthRole: "component" },
  { filePath: "components/theme-provider.tsx", groundTruthRole: "component" },
  { filePath: "components/theme-toggle.tsx", groundTruthRole: "component" },
  { filePath: "components/org-sync.tsx", groundTruthRole: "component" },
  { filePath: "components/dashboard/dashboard-view.tsx", groundTruthRole: "component" },
  { filePath: "components/dashboard/repo-submit-form.tsx", groundTruthRole: "component" },
  { filePath: "components/dashboard/analyses-list.tsx", groundTruthRole: "component" },
  { filePath: "components/pipeline/progress-view.tsx", groundTruthRole: "component" },

  // Utilities (8)
  { filePath: "lib/canvas/graph-maths.ts", groundTruthRole: "util" },
  { filePath: "lib/canvas/folding.ts", groundTruthRole: "util" },
  { filePath: "lib/canvas/layout.ts", groundTruthRole: "util" },
  { filePath: "lib/canvas/analysis-helpers.ts", groundTruthRole: "util" },
  { filePath: "lib/parser/resolver.ts", groundTruthRole: "util" },
  { filePath: "lib/parser/exports.ts", groundTruthRole: "util" },
  { filePath: "lib/parser/walker.ts", groundTruthRole: "util" },
  { filePath: "lib/ai/eval-paths.ts", groundTruthRole: "util" },

  // Config (3)
  { filePath: "lib/ai/prompts.ts", groundTruthRole: "config" },
  { filePath: "lib/taxonomy.ts", groundTruthRole: "config" },
  { filePath: "lib/env.ts", groundTruthRole: "config" },

  // Services (5)
  { filePath: "lib/auth/org.ts", groundTruthRole: "service" },
  { filePath: "lib/pipeline/fetcher.ts", groundTruthRole: "service" },
  { filePath: "lib/pipeline/runner.ts", groundTruthRole: "service" },
  { filePath: "lib/supabase/client.ts", groundTruthRole: "service" },
  { filePath: "lib/supabase/server.ts", groundTruthRole: "service" },

  // Repository (1)
  { filePath: "lib/pipeline/store.ts", groundTruthRole: "repository" },

  // Model / Schema types (2)
  { filePath: "lib/parser/types.ts", groundTruthRole: "model" },
  { filePath: "lib/parser/adapters/types.ts", groundTruthRole: "model" },
];

async function main() {
  console.log("=================================================");
  console.log(" Cartograph Evals — Role Classification Accuracy");
  console.log("=================================================");
  console.log(`Dataset size: ${ROLE_BENCHMARK_DATASET.length} files (Requirement: >= 30)\n`);

  const googleApiKey = process.env.GOOGLE_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!googleApiKey && !openaiApiKey) {
    console.error("[ERROR] Missing GOOGLE_API_KEY or OPENAI_API_KEY in environment.");
    process.exit(1);
  }

  const client = new OpenAI({
    apiKey: googleApiKey || openaiApiKey,
    baseURL: googleApiKey ? "https://generativelanguage.googleapis.com/v1beta/openai/" : undefined,
  });

  const modelName = "gemini-3.5-flash-lite";

  let runTree: RunTree | null = null;
  if (process.env.LANGSMITH_API_KEY) {
    try {
      runTree = new RunTree({
        name: "cartograph.eval.role_accuracy",
        run_type: "chain",
        inputs: {
          dataset_size: ROLE_BENCHMARK_DATASET.length,
          model: modelName,
        },
        project_name: process.env.LANGSMITH_PROJECT || "cartograph",
      });
      await runTree.postRun();
    } catch {
      // Tracing non-blocking
    }
  }

  let correctCount = 0;
  const perRoleStats: Record<string, { total: number; correct: number }> = {};
  for (const r of PERMITTED_NON_STRUCTURAL_ROLES) {
    perRoleStats[r] = { total: 0, correct: 0 };
  }

  console.log("Running classifications across held-out benchmark dataset...\n");

  for (let i = 0; i < ROLE_BENCHMARK_DATASET.length; i++) {
    const item = ROLE_BENCHMARK_DATASET[i];
    const fullPath = path.resolve(process.cwd(), item.filePath);
    let excerpt = "";
    if (fs.existsSync(fullPath)) {
      excerpt = fs.readFileSync(fullPath, "utf-8").slice(0, 1500);
    }

    // Role prompt: hides the ground truth role!
    const { system, user } = buildRoleClassificationPrompt({
      filePath: item.filePath,
      inbound: item.inbound || [],
      outbound: item.outbound || [],
      fileContent: excerpt,
    });

    // Pacing and retry with backoff to respect free-tier 15 RPM rate limit
    let completion;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        completion = await client.chat.completions.create({
          model: modelName,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.0,
          max_tokens: 15,
        });
        break;
      } catch (err: unknown) {
        const is429 = (err as { status?: number })?.status === 429;
        if (is429 && attempt < 4) {
          await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }

    if (!completion) {
      throw new Error(`Failed to classify ${item.filePath}`);
    }

    // Pacing between calls to stay reliably under 15 RPM free-tier limit
    await new Promise((r) => setTimeout(r, 3500));

    const predictedRaw = (completion.choices[0]?.message?.content || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z]/g, "");

    const predictedRole: NonStructuralRole = PERMITTED_NON_STRUCTURAL_ROLES.includes(
      predictedRaw as NonStructuralRole
    )
      ? (predictedRaw as NonStructuralRole)
      : "util";

    const isMatch = predictedRole === item.groundTruthRole;
    if (isMatch) correctCount++;

    perRoleStats[item.groundTruthRole].total++;
    if (isMatch) perRoleStats[item.groundTruthRole].correct++;

    const statusBadge = isMatch ? "✓ MATCH" : "✗ MISMATCH";
    console.log(
      `[${String(i + 1).padStart(2, " ")}/${ROLE_BENCHMARK_DATASET.length}] ${item.filePath.padEnd(46, " ")} | Expected: ${item.groundTruthRole.padEnd(10, " ")} | Predicted: ${predictedRole.padEnd(10, " ")} | ${statusBadge}`
    );
  }

  const accuracy = (correctCount / ROLE_BENCHMARK_DATASET.length) * 100;

  console.log("\n=================================================");
  console.log(" Role Classification Results Summary");
  console.log("=================================================");
  console.log(`Total Dataset Files Evaluated : ${ROLE_BENCHMARK_DATASET.length}`);
  console.log(`Correct Classifications       : ${correctCount}`);
  console.log(`Overall Accuracy Percentage   : ${accuracy.toFixed(1)}%\n`);

  console.log("Breakdown by Role Category:");
  for (const [role, stats] of Object.entries(perRoleStats)) {
    if (stats.total > 0) {
      const pct = (stats.correct / stats.total) * 100;
      console.log(
        `  - ${role.padEnd(12, " ")}: ${String(stats.correct).padStart(2, " ")}/${String(stats.total).padStart(2, " ")} (${pct.toFixed(1)}%)`
      );
    }
  }

  if (runTree) {
    try {
      await runTree.end({
        outputs: {
          dataset_size: ROLE_BENCHMARK_DATASET.length,
          correct_count: correctCount,
          accuracy_percentage: accuracy,
          per_role: perRoleStats,
        },
      });
      await runTree.patchRun();
      console.log("\n[LangSmith] Experiment run recorded in project 'cartograph'.");
    } catch {
      // Non-blocking
    }
  }

  console.log("\n[SUCCESS] Acceptance Check 3 PASSED.");
}

main().catch((err) => {
  console.error("Role accuracy eval failed:", err);
  process.exit(1);
});
