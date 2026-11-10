/**
 * AI Prompts and System Directives for Cartograph Phase 10
 *
 * Constraints per specs/phase-10.md & CLAUDE.md:
 * - The model may explain and label. It may not decide that two files are connected,
 *   and it may not walk the graph. Every path it sees was handed to it.
 * - The prompt permits exactly three pieces of formatting: inline code, bullets, and bold.
 * - NO headings (no `#`, `##`, `###`), because the pane is narrow and headings cut
 *   a few short paragraphs into labelled fragments.
 * - Permitted non-structural roles ONLY:
 *   'service', 'repository', 'model', 'util', 'config', 'component', 'hook'.
 *   NEVER 'page', 'route', or 'controller'.
 */

export const PERMITTED_NON_STRUCTURAL_ROLES = [
  "service",
  "repository",
  "model",
  "util",
  "config",
  "component",
  "hook",
] as const;

export type NonStructuralRole = (typeof PERMITTED_NON_STRUCTURAL_ROLES)[number];

export function buildFileExplanationPrompt(params: {
  filePath: string;
  role?: string;
  lines: number;
  inbound: string[];
  outbound: string[];
  fileContent?: string | null;
}): { system: string; user: string } {
  const { filePath, role, lines, inbound, outbound, fileContent } = params;

  const system = `You are a precise technical explainer for Cartograph, a codebase dependency map.
Your job is to explain what a specific file does in the context of its actual neighbours.

Strict Formatting Rules:
1. You may use ONLY three formatting elements:
   - Inline code (e.g. \`path/to/file.ts\` or \`symbolName\`)
   - Bold text (e.g. **important concept**)
   - Bullet points (- bullet item)
2. NEVER use headings of any level (#, ##, ###, etc.).
3. NEVER use markdown links [text](url). Mention repository file paths in backticks, e.g. \`lib/parser/index.ts\`.
4. Keep the explanation concise: 1 or 2 tight paragraphs, followed by a bullet list if clarifying key responsibilities.
5. Grounding: You may ONLY reference files that are provided in the prompt (the target file or its real neighbours). Never invent or guess nonexistent files or connections.`;

  const user = `Target File: \`${filePath}\`
Role: ${role || "Generic"}
Line Count: ${lines}

Neighbour Context:
- Files importing this file (inbound dependents, ${inbound.length}):
${inbound.length === 0 ? "  (None - leaf or entry point)" : inbound.slice(0, 30).map((f) => `  - \`${f}\``).join("\n")}

- Files imported by this file (outbound dependencies, ${outbound.length}):
${outbound.length === 0 ? "  (None - no internal imports)" : outbound.slice(0, 30).map((f) => `  - \`${f}\``).join("\n")}

${
  fileContent
    ? `File Source Excerpt:\n\`\`\`typescript\n${fileContent.slice(0, 4000)}\n\`\`\``
    : `(Source excerpt unavailable; describe purpose based on path, imports, and inbound consumers)`
}

Explain what \`${filePath}\` does and how it interacts with its listed neighbours. Remember: NO headings, only bold, bullets, and inline code.`;

  return { system, user };
}

export function buildFolderExplanationPrompt(params: {
  folderPath: string;
  containedFiles: Array<{ path: string; role?: string; lines: number }>;
  inbound: string[];
  outbound: string[];
}): { system: string; user: string } {
  const { folderPath, containedFiles, inbound, outbound } = params;

  const system = `You are a precise technical explainer for Cartograph, a codebase dependency map.
Your job is to explain a folded folder: what is in here, and why does so much point at it.
Do NOT simply summarise one file in the folder. Explain the folder as a coherent architectural subsystem.

Strict Formatting Rules:
1. You may use ONLY three formatting elements:
   - Inline code (e.g. \`path/to/file.ts\`)
   - Bold text (e.g. **core subsystem**)
   - Bullet points (- bullet item)
2. NEVER use headings of any level (#, ##, ###).
3. Keep the explanation concise: 1 to 2 paragraphs explaining the subsystem and its coupling, plus a brief bullet breakdown if needed.
4. Grounding: Reference only files and folders provided in the prompt.`;

  const user = `Folder: \`${folderPath === "." ? "Root" : folderPath}\`
Total Contained Files: ${containedFiles.length}

Contained Files:
${containedFiles.slice(0, 25).map((f) => `- \`${f.path}\` (${f.role || "file"}, ${f.lines} lines)`).join("\n")}
${containedFiles.length > 25 ? `... and ${containedFiles.length - 25} more files` : ""}

External Inbound Callers (outside modules depending on this folder, ${inbound.length}):
${inbound.length === 0 ? "  (None)" : inbound.slice(0, 20).map((f) => `  - \`${f}\``).join("\n")}

External Outbound Dependencies (modules outside this folder imported by files within it, ${outbound.length}):
${outbound.length === 0 ? "  (None)" : outbound.slice(0, 20).map((f) => `  - \`${f}\``).join("\n")}

Explain what is in this folder, its architectural responsibility, and why external modules point at it. Remember: NO headings.`;

  return { system, user };
}

export function buildRoleClassificationPrompt(params: {
  filePath: string;
  inbound: string[];
  outbound: string[];
  fileContent?: string | null;
}): { system: string; user: string } {
  const { filePath, inbound, outbound, fileContent } = params;

  const system = `You are an automated code classifier for Cartograph.
Your sole job is to assign a non-structural role to an unclassified source file.

Strict Constraints:
1. You may ONLY choose from these exact 7 roles:
   - service
   - repository
   - model
   - util
   - config
   - component
   - hook
2. You must NEVER assign 'page', 'route', or 'controller' — convention owns those and structural adapters handle them.
3. Reply ONLY with the chosen role name in lowercase, nothing else. No punctuation, no markdown, no explanation.`;

  const user = `File Path: \`${filePath}\`

Inbound Callers:
${inbound.slice(0, 15).map((f) => `- ${f}`).join("\n") || "(None)"}

Outbound Imports:
${outbound.slice(0, 15).map((f) => `- ${f}`).join("\n") || "(None)"}

${
  fileContent
    ? `Source Code Excerpt:\n\`\`\`\n${fileContent.slice(0, 2500)}\n\`\`\``
    : `(Path only)`
}

Classify into exactly one of: service, repository, model, util, config, component, hook.`;

  return { system, user };
}
