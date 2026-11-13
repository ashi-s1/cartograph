/**
 * Retired V1 Prompt (Baseline)
 *
 * Per specs/phase-11.md:
 * "The retired prompt lives with the evals, not in the application.
 * Shipping a dead prompt so a test can reach it is the test shaping the product."
 */

export function buildRetiredV1ExplanationPrompt(params: {
  filePath: string;
  role?: string;
  lines: number;
  inbound: string[];
  outbound: string[];
  fileContent?: string | null;
}): { system: string; user: string } {
  const { filePath, role, lines, inbound, outbound, fileContent } = params;

  const system = `You are an AI assistant that explains code files.
Explain what this file does, how it works, and describe its code structure.`;

  const user = `Please explain the following file:
File: ${filePath}
Role: ${role || "Unknown"}
Lines: ${lines}

Imports:
${outbound.join(", ") || "None"}

Imported by:
${inbound.join(", ") || "None"}

${fileContent ? `Source Code:\n${fileContent.slice(0, 3000)}` : ""}`;

  return { system, user };
}
