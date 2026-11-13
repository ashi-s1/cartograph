import type { NonStructuralRole } from "./prompts";

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

