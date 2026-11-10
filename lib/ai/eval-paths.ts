/**
 * Deterministic Invented-Path Evaluator for Cartograph
 *
 * Constraints per specs/phase-11.md:
 * - "The invented-path check is deterministic code, not a model grading a model.
 *    This is set membership — it has an exact answer, and a hallucination detector
 *    that hallucinates is worth nothing."
 * - "Take every path-shaped token in an explanation and test it against the exact
 *    set of paths the model was shown. Anything else was invented."
 */

export interface PathCheckDetail {
  token: string;
  normalizedPath: string;
  valid: boolean;
  reason?: string;
}

export interface PathCheckResult {
  passed: boolean;
  score: number; // 1.0 = perfect grounding (0 invented paths)
  totalMentioned: number;
  validPaths: string[];
  inventedPaths: string[];
  details: PathCheckDetail[];
}

// Known external packages / libraries that are not repository file paths
const EXTERNAL_PACKAGE_EXCLUSIONS = new Set([
  "react",
  "react-dom",
  "next",
  "next/link",
  "next/server",
  "next/navigation",
  "@clerk/nextjs",
  "@supabase/supabase-js",
  "@supabase/ssr",
  "@xyflow/react",
  "dagre",
  "lucide-react",
  "ts-morph",
  "openai",
  "langsmith",
  "langchain",
  "deepagents",
  "tailwind",
  "tailwindcss",
  "zod",
]);

const FILE_EXTENSIONS_REGEX = /\.(?:tsx?|jsx?|json|mjs|cjs|sql|css|md|ya?ml|svg|ico)$/i;

/**
 * Normalizes a path token for comparison.
 */
export function normalizePath(rawPath: string): string {
  return rawPath
    .trim()
    .replace(/^[`'"]+|[`'"]+$/g, "")
    .replace(/\\/g, "/")
    .replace(/^(\.\/|\/)/, "")
    .replace(/[,.;:)]+$/, "");
}

/**
 * Deterministically extracts path-shaped tokens from prose.
 */
export function extractPathTokens(content: string): string[] {
  const tokens = new Set<string>();

  // 1. Extract tokens in backticks
  const backtickMatches = content.matchAll(/`([^`\n]+)`/g);
  for (const m of backtickMatches) {
    const raw = m[1].trim();
    // Path-shaped if it contains '/' or a file extension
    if (raw.includes("/") || FILE_EXTENSIONS_REGEX.test(raw)) {
      const clean = normalizePath(raw);
      if (clean && !clean.startsWith("http://") && !clean.startsWith("https://")) {
        tokens.add(clean);
      }
    }
  }

  // 2. Extract path-shaped tokens in plain text
  // Matches words with file extensions or slash-separated directory paths
  const wordMatches = content.matchAll(
    /\b([a-zA-Z0-9_\-./]+\/(?:[a-zA-Z0-9_\-./]+)?\.[a-zA-Z0-9]+|[a-zA-Z0-9_\-.]+\.(?:tsx?|jsx?|json|mjs|cjs|sql|css|md))\b/gi
  );
  for (const m of wordMatches) {
    const clean = normalizePath(m[1]);
    if (
      clean &&
      !clean.startsWith("http://") &&
      !clean.startsWith("https://") &&
      (clean.includes("/") || FILE_EXTENSIONS_REGEX.test(clean))
    ) {
      tokens.add(clean);
    }
  }

  return Array.from(tokens);
}

/**
 * Deterministically tests every path-shaped token against the exact set of paths
 * the model was shown.
 */
export function checkInventedPaths(
  content: string,
  allowedPaths: Iterable<string>
): PathCheckResult {
  // Build lookup sets
  const exactSet = new Set<string>();
  const baseNameMap = new Map<string, string[]>();

  for (const p of allowedPaths) {
    const norm = normalizePath(p);
    exactSet.add(norm);
    exactSet.add(norm.toLowerCase());

    const basename = norm.split("/").pop();
    if (basename) {
      const lowerBase = basename.toLowerCase();
      if (!baseNameMap.has(lowerBase)) {
        baseNameMap.set(lowerBase, []);
      }
      baseNameMap.get(lowerBase)!.push(norm);
    }
  }

  const extracted = extractPathTokens(content);
  const details: PathCheckDetail[] = [];
  const validPaths: string[] = [];
  const inventedPaths: string[] = [];

  for (const token of extracted) {
    const normalized = normalizePath(token);
    const lower = normalized.toLowerCase();

    // Check if it's an external library/framework package
    if (EXTERNAL_PACKAGE_EXCLUSIONS.has(lower) || lower.startsWith("node:")) {
      continue;
    }

    // Exact path match
    if (exactSet.has(normalized) || exactSet.has(lower)) {
      validPaths.push(normalized);
      details.push({
        token,
        normalizedPath: normalized,
        valid: true,
      });
      continue;
    }

    // Basename match (e.g. model mentioned "page.tsx" or "detail-pane.tsx" matching shown path)
    const base = normalized.split("/").pop()?.toLowerCase();
    if (base && baseNameMap.has(base)) {
      validPaths.push(normalized);
      details.push({
        token,
        normalizedPath: normalized,
        valid: true,
        reason: `Matched basename of ${baseNameMap.get(base)!.join(", ")}`,
      });
      continue;
    }

    // Subpath match (e.g. "canvas/detail-pane.tsx" matching "components/canvas/detail-pane.tsx")
    let matchedSubpath = false;
    for (const allowed of exactSet) {
      if (allowed.endsWith(`/${normalized}`) || allowed.endsWith(normalized)) {
        matchedSubpath = true;
        validPaths.push(normalized);
        details.push({
          token,
          normalizedPath: normalized,
          valid: true,
          reason: `Subpath match for ${allowed}`,
        });
        break;
      }
    }

    if (!matchedSubpath) {
      // It was NOT in the set of shown paths -> INVENTED!
      inventedPaths.push(normalized);
      details.push({
        token,
        normalizedPath: normalized,
        valid: false,
        reason: "Path was not provided in input prompt context",
      });
    }
  }

  const totalMentioned = validPaths.length + inventedPaths.length;
  const passed = inventedPaths.length === 0;
  const score = totalMentioned === 0 ? 1.0 : validPaths.length / totalMentioned;

  return {
    passed,
    score,
    totalMentioned,
    validPaths,
    inventedPaths,
    details,
  };
}
