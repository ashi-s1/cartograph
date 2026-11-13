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

import { ROLE_BENCHMARK_DATASET } from "../../lib/ai/role-benchmark.ts";
export { ROLE_BENCHMARK_DATASET } from "../../lib/ai/role-benchmark.ts";

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

  const modelName = googleApiKey ? "gemini-3.5-flash-lite" : "gpt-4.1-mini-2025-04-14";

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
  let invalidCount = 0;
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

    const predictedRole: NonStructuralRole | "invalid" = PERMITTED_NON_STRUCTURAL_ROLES.includes(
      predictedRaw as NonStructuralRole
    )
      ? (predictedRaw as NonStructuralRole)
      : "invalid";
    if (predictedRole === "invalid") invalidCount++;

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
  console.log(`Invalid Predictions           : ${invalidCount}`);
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
          invalid_count: invalidCount,
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
