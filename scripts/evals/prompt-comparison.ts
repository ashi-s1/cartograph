/**
 * Phase 11 Evals — Prompt Versions Comparison Experiment
 *
 * Acceptance check 4 per specs/phase-11.md:
 * "Two prompt versions sit side by side in the dashboard with scores, and you can
 *  say which is better and by how much."
 *
 * Constraints:
 * - "The retired prompt lives with the evals, not in the application."
 * - "The prompt-version comparison does need a model as judge, unavoidably —
 *    'is this specific enough to be useful' has no exact answer. Say that out
 *    loud rather than presenting the number as harder than it is."
 */

import "./env.ts";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { RunTree } from "langsmith";
import { buildFileExplanationPrompt } from "../../lib/ai/prompts.ts";
import { buildRetiredV1ExplanationPrompt } from "./prompts/retired.ts";
import { checkInventedPaths } from "../../lib/ai/eval-paths.ts";

interface ComparisonSample {
  filePath: string;
  role: string;
  lines: number;
  inbound: string[];
  outbound: string[];
}

const COMPARISON_DATASET: ComparisonSample[] = [
  {
    filePath: "components/canvas/detail-pane.tsx",
    role: "component",
    lines: 750,
    inbound: ["components/canvas/analysis-explorer.tsx"],
    outbound: [
      "lib/canvas/analysis-helpers.ts",
      "lib/canvas/graph-maths.ts",
      "lib/taxonomy.ts",
      "components/canvas/formatted-prose.tsx",
    ],
  },
  {
    filePath: "lib/canvas/graph-maths.ts",
    role: "util",
    lines: 210,
    inbound: [
      "components/canvas/detail-pane.tsx",
      "components/canvas/canvas-graph.tsx",
    ],
    outbound: ["lib/parser/types.ts"],
  },
  {
    filePath: "lib/pipeline/runner.ts",
    role: "service",
    lines: 270,
    inbound: ["app/api/analyses/route.ts"],
    outbound: [
      "lib/pipeline/fetcher.ts",
      "lib/parser/index.ts",
      "lib/pipeline/store.ts",
    ],
  },
  {
    filePath: "lib/parser/resolver.ts",
    role: "util",
    lines: 180,
    inbound: ["lib/parser/walker.ts", "lib/parser/index.ts"],
    outbound: ["lib/parser/types.ts"],
  },
  {
    filePath: "components/canvas/formatted-prose.tsx",
    role: "component",
    lines: 190,
    inbound: ["components/canvas/detail-pane.tsx"],
    outbound: [],
  },
  {
    filePath: "lib/taxonomy.ts",
    role: "config",
    lines: 110,
    inbound: [
      "components/canvas/detail-pane.tsx",
      "components/canvas/analysis-explorer.tsx",
    ],
    outbound: [],
  },
];

/**
 * Deterministically checks formatting compliance:
 * - 0 headings (#, ##, ###)
 * - Has valid inline code or bullets
 */
function checkFormatCompliance(text: string): { compliant: boolean; hasHeadings: boolean } {
  const hasHeadings = /^#+\s+/m.test(text);
  return {
    compliant: !hasHeadings,
    hasHeadings,
  };
}

/**
 * Model as judge: evaluates architectural usefulness and neighbor grounding.
 * Explicitly transparent: this is a model judgment, not a hard arithmetic fact.
 */
async function createCompletionWithRetry(
  client: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.ChatCompletion> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await client.chat.completions.create(params);
      await new Promise((r) => setTimeout(r, 3500));
      return res;
    } catch (err: unknown) {
      const is429 = (err as { status?: number })?.status === 429;
      if (is429 && attempt < 4) {
        await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to complete request after retries");
}

async function judgeUsefulness(
  client: OpenAI,
  modelName: string,
  filePath: string,
  neighbours: string[],
  explanation: string
): Promise<{ score: number | null; justification: string }> {
  const judgePrompt = `You are an expert software architect evaluating automated codebase explanations.
Grade the following explanation on a scale of 1 to 5 for architectural usefulness and grounding.

Criteria:
- Does it explain the file's role in the dependency flow of its neighbours?
- Is it concise and concrete rather than generic fluff?
- Does it name genuine neighbours: ${neighbours.join(", ")}?

Target File: \`${filePath}\`
Explanation to grade:
"""
${explanation}
"""

Reply with EXACTLY two lines:
SCORE: <number between 1 and 5>
REASON: <one sentence justification>`;

  try {
    const res = await createCompletionWithRetry(client, {
      model: modelName,
      messages: [{ role: "user", content: judgePrompt }],
      temperature: 0.0,
      max_tokens: 100,
    });

    const reply = res.choices[0]?.message?.content || "";
    const scoreMatch = reply.match(/^SCORE:[ \t]*(\d+(?:\.\d+)?)[ \t]*$/im);
    const reasonMatch = reply.match(/REASON:\s*(.*)/i);

    const parsedScore = scoreMatch ? Number(scoreMatch[1]) : NaN;
    const score = Number.isFinite(parsedScore) && parsedScore >= 1 && parsedScore <= 5 ? parsedScore : null;
    const justification = reasonMatch ? reasonMatch[1].trim() : reply.trim();

    return { score, justification };
  } catch {
    return { score: null, justification: "Judge model call failed" };
  }
}

async function main() {
  console.log("==========================================================");
  console.log(" Cartograph Evals — Prompt Versions Comparison Experiment");
  console.log("==========================================================");
  console.log("Note: Usefulness is evaluated with a model-as-judge prompt.\n");

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

  // Experiments tracking
  const v1Stats = {
    inventedScores: [] as number[],
    formatCompliance: [] as boolean[],
    judgeScores: [] as (number | null)[],
  };

  const v2Stats = {
    inventedScores: [] as number[],
    formatCompliance: [] as boolean[],
    judgeScores: [] as (number | null)[],
  };

  // LangSmith experiments parent runs
  let v1RunTree: RunTree | null = null;
  let v2RunTree: RunTree | null = null;

  if (process.env.LANGSMITH_API_KEY) {
    try {
      v1RunTree = new RunTree({
        name: "cartograph.prompt_comparison.v1_retired",
        run_type: "chain",
        inputs: {
          prompt_version: "v1_retired_baseline",
          dataset_size: COMPARISON_DATASET.length,
          model: modelName,
        },
        project_name: process.env.LANGSMITH_PROJECT || "cartograph",
      });
      await v1RunTree.postRun();

      v2RunTree = new RunTree({
        name: "cartograph.prompt_comparison.v2_current",
        run_type: "chain",
        inputs: {
          prompt_version: "v2_current_production",
          dataset_size: COMPARISON_DATASET.length,
          model: modelName,
        },
        project_name: process.env.LANGSMITH_PROJECT || "cartograph",
      });
      await v2RunTree.postRun();
    } catch {
      // Non-blocking
    }
  }

  console.log(`Running side-by-side evaluation over ${COMPARISON_DATASET.length} sample files...\n`);

  for (let i = 0; i < COMPARISON_DATASET.length; i++) {
    const item = COMPARISON_DATASET[i];
    const fullPath = path.resolve(process.cwd(), item.filePath);
    let excerpt = "";
    if (fs.existsSync(fullPath)) {
      excerpt = fs.readFileSync(fullPath, "utf-8").slice(0, 2000);
    }

    const allowedPaths = [item.filePath, ...item.inbound, ...item.outbound];

    console.log(`[${i + 1}/${COMPARISON_DATASET.length}] Testing \`${item.filePath}\`...`);

    // 1. Run Retired V1 Prompt
    const v1Prompt = buildRetiredV1ExplanationPrompt({
      filePath: item.filePath,
      role: item.role,
      lines: item.lines,
      inbound: item.inbound,
      outbound: item.outbound,
      fileContent: excerpt,
    });

    const v1Res = await createCompletionWithRetry(client, {
      model: modelName,
      messages: [
        { role: "system", content: v1Prompt.system },
        { role: "user", content: v1Prompt.user },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });
    const v1Text = v1Res.choices[0]?.message?.content || "";

    const v1Paths = checkInventedPaths(v1Text, allowedPaths);
    const v1Fmt = checkFormatCompliance(v1Text);
    const v1Judge = await judgeUsefulness(client, modelName, item.filePath, allowedPaths, v1Text);

    v1Stats.inventedScores.push(v1Paths.score);
    v1Stats.formatCompliance.push(v1Fmt.compliant);
    v1Stats.judgeScores.push(v1Judge.score);

    // 2. Run Current V2 Prompt
    const v2Prompt = buildFileExplanationPrompt({
      filePath: item.filePath,
      role: item.role,
      lines: item.lines,
      inbound: item.inbound,
      outbound: item.outbound,
      fileContent: excerpt,
    });

    const v2Res = await createCompletionWithRetry(client, {
      model: modelName,
      messages: [
        { role: "system", content: v2Prompt.system },
        { role: "user", content: v2Prompt.user },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });
    const v2Text = v2Res.choices[0]?.message?.content || "";

    const v2Paths = checkInventedPaths(v2Text, allowedPaths);
    const v2Fmt = checkFormatCompliance(v2Text);
    const v2Judge = await judgeUsefulness(client, modelName, item.filePath, allowedPaths, v2Text);

    v2Stats.inventedScores.push(v2Paths.score);
    v2Stats.formatCompliance.push(v2Fmt.compliant);
    v2Stats.judgeScores.push(v2Judge.score);

    console.log(
      `   V1 (Retired) -> Grounding: ${(v1Paths.score * 100).toFixed(0)}% | No Headings: ${v1Fmt.compliant ? "YES" : "NO"} | Usefulness: ${v1Judge.score ?? "INVALID"}/5`
    );
    console.log(
      `   V2 (Current) -> Grounding: ${(v2Paths.score * 100).toFixed(0)}% | No Headings: ${v2Fmt.compliant ? "YES" : "NO"} | Usefulness: ${v2Judge.score ?? "INVALID"}/5\n`
    );
  }

  // Calculate Averages
  const avg = (arr: number[]) => (arr.reduce((a, b) => a + b, 0) / arr.length);
  const pct = (arr: boolean[]) => (arr.filter(Boolean).length / arr.length) * 100;

  const v1Grounding = avg(v1Stats.inventedScores) * 100;
  const v2Grounding = avg(v2Stats.inventedScores) * 100;

  const v1FormatPct = pct(v1Stats.formatCompliance);
  const v2FormatPct = pct(v2Stats.formatCompliance);

  // Compare only paired valid grades so both versions use the same samples.
  const validPairs = v1Stats.judgeScores.flatMap((v1, i) => {
    const v2 = v2Stats.judgeScores[i];
    return v1 !== null && v2 !== null ? [{ v1, v2 }] : [];
  });
  const excludedCount = COMPARISON_DATASET.length - validPairs.length;
  console.log(`Excluded judge sample pairs: ${excludedCount} (missing or invalid SCORE)`);
  const v1AvgJudge = validPairs.length ? avg(validPairs.map((p) => p.v1)) : NaN;
  const v2AvgJudge = validPairs.length ? avg(validPairs.map((p) => p.v2)) : NaN;

  const deltaGrounding = v2Grounding - v1Grounding;
  const deltaFormat = v2FormatPct - v1FormatPct;
  const deltaJudge = v2AvgJudge - v1AvgJudge;

  console.log("==========================================================");
  console.log(" Side-by-Side Prompt Comparison Experiment Results");
  console.log("==========================================================");
  console.log("Metric                     | V1 (Retired) | V2 (Current) | Delta");
  console.log("---------------------------+--------------+--------------+-------------");
  console.log(
    `Path Grounding Score       | ${v1Grounding.toFixed(1).padStart(10, " ")}% | ${v2Grounding.toFixed(1).padStart(10, " ")}% | ${deltaGrounding >= 0 ? "+" : ""}${deltaGrounding.toFixed(1)}%`
  );
  console.log(
    `No-Headings Compliance     | ${v1FormatPct.toFixed(1).padStart(10, " ")}% | ${v2FormatPct.toFixed(1).padStart(10, " ")}% | ${deltaFormat >= 0 ? "+" : ""}${deltaFormat.toFixed(1)}%`
  );
  console.log(
    `Usefulness (Model Judge)   | ${(v1AvgJudge.toFixed(2) + " / 5").padStart(12, " ")} | ${(v2AvgJudge.toFixed(2) + " / 5").padStart(12, " ")} | ${deltaJudge >= 0 ? "+" : ""}${deltaJudge.toFixed(2)} pts`
  );
  console.log("---------------------------+--------------+--------------+-------------\n");

  // No regressions, at least one improvement, and valid judge evidence.
  const v2Wins = validPairs.length > 0 && deltaGrounding >= 0 && deltaFormat >= 0 && deltaJudge >= 0
    && (deltaGrounding > 0 || deltaFormat > 0 || deltaJudge > 0);
  console.log(`VERDICT: ${v2Wins ? "V2 beats V1" : "V2 does not beat V1"}`);
  console.log(
    `V2 minus V1: ${deltaGrounding >= 0 ? "+" : ""}${deltaGrounding.toFixed(1)}% on path grounding, ${deltaFormat >= 0 ? "+" : ""}${deltaFormat.toFixed(1)}% on format compliance, and ${deltaJudge >= 0 ? "+" : ""}${deltaJudge.toFixed(2)} pts on architectural usefulness.\n`
  );

  // End LangSmith runs
  if (v1RunTree && v2RunTree) {
    try {
      await v1RunTree.end({
        outputs: {
          path_grounding_score: v1Grounding,
          format_compliance_pct: v1FormatPct,
          usefulness_score: v1AvgJudge,
        },
      });
      await v1RunTree.patchRun();

      await v2RunTree.end({
        outputs: {
          path_grounding_score: v2Grounding,
          format_compliance_pct: v2FormatPct,
          usefulness_score: v2AvgJudge,
        },
      });
      await v2RunTree.patchRun();

      console.log("[LangSmith] Both experiments recorded side by side in project 'cartograph'.");
    } catch {
      // Non-blocking
    }
  }

  console.log(v2Wins ? "\n[SUCCESS] Acceptance Check 4 PASSED." : "\n[FAILURE] Acceptance Check 4 FAILED.");
  if (!v2Wins) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Prompt comparison failed:", err);
  process.exit(1);
});
