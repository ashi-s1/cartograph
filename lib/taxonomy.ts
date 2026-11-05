/**
 * Framework Taxonomy & Left Rail Category Hierarchy
 * 
 * Spec Constraints:
 * 1. The rail taxonomy lives apart from the adapters themselves, so a browser
 *    component can read the list of category names without pulling a parser
 *    and a filesystem library into the bundle.
 * 2. Category names are the concrete role names, not abstractions.
 * 3. Rail order is reading order and it stays fixed — routable surfaces first,
 *    then the layers behind them, then plumbing.
 */

export type FrameworkType = "nextjs" | "nestjs" | "react" | "fallback";

export interface CategoryDefinition {
  id: string;
  name: string;
  color: string;
}

export interface FrameworkTaxonomy {
  id: FrameworkType;
  label: string;
  /**
   * Fixed reading order: routable surfaces first, then layers behind them, then plumbing.
   */
  categories: CategoryDefinition[];
}

export const FRAMEWORK_TAXONOMIES: Record<FrameworkType, FrameworkTaxonomy> = {
  nextjs: {
    id: "nextjs",
    label: "Next.js",
    categories: [
      { id: "Page routes", name: "Page routes", color: "#38bdf8" },
      { id: "API endpoints", name: "API endpoints", color: "#34d399" },
      { id: "Server actions", name: "Server actions", color: "#c084fc" },
      { id: "Components", name: "Components", color: "#818cf8" },
      { id: "Utilities", name: "Utilities", color: "#fbbf24" },
      { id: "Config", name: "Config", color: "#94a3b8" },
      { id: "Generic", name: "Generic", color: "#64748b" },
    ],
  },
  nestjs: {
    id: "nestjs",
    label: "NestJS",
    categories: [
      { id: "Controllers", name: "Controllers", color: "#38bdf8" },
      { id: "Services", name: "Services", color: "#34d399" },
      { id: "Modules", name: "Modules", color: "#c084fc" },
      { id: "Entities", name: "Entities", color: "#fb923c" },
      { id: "Generic", name: "Generic", color: "#64748b" },
    ],
  },
  react: {
    id: "react",
    label: "React",
    categories: [
      { id: "Components", name: "Components", color: "#818cf8" },
      { id: "Hooks", name: "Hooks", color: "#fbbf24" },
      { id: "Contexts", name: "Contexts", color: "#c084fc" },
      { id: "Utilities", name: "Utilities", color: "#34d399" },
      { id: "Generic", name: "Generic", color: "#64748b" },
    ],
  },
  fallback: {
    id: "fallback",
    label: "Generic",
    categories: [
      { id: "Generic", name: "Generic", color: "#94a3b8" },
    ],
  },
};

/**
 * Returns the fixed category definition for a role in a framework.
 */
export function getCategoryDefinition(framework: FrameworkType, role: string): CategoryDefinition {
  const taxonomy = FRAMEWORK_TAXONOMIES[framework] || FRAMEWORK_TAXONOMIES.fallback;
  const match = taxonomy.categories.find(
    (c) => c.name.toLowerCase() === role.toLowerCase() || c.id.toLowerCase() === role.toLowerCase()
  );
  if (match) return match;
  return { id: role, name: role, color: "#64748b" };
}

/**
 * Returns all categories defined for a framework in fixed reading order.
 */
export function getTaxonomyCategories(framework: FrameworkType): CategoryDefinition[] {
  const taxonomy = FRAMEWORK_TAXONOMIES[framework] || FRAMEWORK_TAXONOMIES.fallback;
  return taxonomy.categories;
}
