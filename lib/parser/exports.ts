import {
  SyntaxKind,
  type SourceFile,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type ShorthandPropertyAssignment,
  type MethodDeclaration,
} from "ts-morph";

/**
 * Reads the exported names of an ESM or CommonJS module without execution.
 * Pure AST function: returns sorted list of unique export names.
 */
export function readModuleExports(sourceFile: SourceFile): string[] {
  const exportNames = new Set<string>();

  // 1. ESM: export declarations and exported symbols
  for (const [name] of sourceFile.getExportedDeclarations()) {
    exportNames.add(name);
  }

  // 2. CommonJS: module.exports and exports assignments
  const binaryExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.BinaryExpression);
  for (const binExpr of binaryExpressions) {
    if (binExpr.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      continue;
    }

    const left = binExpr.getLeft();
    const leftText = left.getText().replace(/\s+/g, "");

    // Pattern 2a: module.exports.foo = ... OR exports.foo = ...
    if (leftText.startsWith("module.exports.") || leftText.startsWith("exports.")) {
      const propName = leftText.startsWith("module.exports.")
        ? leftText.slice("module.exports.".length)
        : leftText.slice("exports.".length);
      if (propName && /^[a-zA-Z0-9_$]+$/.test(propName)) {
        exportNames.add(propName);
      }
    }

    // Pattern 2b: module.exports = { ... } OR exports = { ... }
    if (leftText === "module.exports" || leftText === "exports") {
      const right = binExpr.getRight();
      if (right.getKind() === SyntaxKind.ObjectLiteralExpression) {
        const obj = right as ObjectLiteralExpression;
        for (const prop of obj.getProperties()) {
          const kind = prop.getKind();
          if (kind === SyntaxKind.PropertyAssignment) {
            exportNames.add((prop as PropertyAssignment).getName());
          } else if (kind === SyntaxKind.ShorthandPropertyAssignment) {
            exportNames.add((prop as ShorthandPropertyAssignment).getName());
          } else if (kind === SyntaxKind.MethodDeclaration) {
            exportNames.add((prop as MethodDeclaration).getName());
          }
        }
      } else if (right.getKind() === SyntaxKind.Identifier) {
        exportNames.add(right.getText());
      } else if (
        right.getKind() === SyntaxKind.FunctionExpression ||
        right.getKind() === SyntaxKind.ClassExpression
      ) {
        const namedExpr = right as { getName?: () => string | undefined };
        const name = namedExpr.getName ? namedExpr.getName() : undefined;
        if (name) {
          exportNames.add(name);
        } else {
          exportNames.add("default");
        }
      } else {
        exportNames.add("default");
      }
    }
  }

  return Array.from(exportNames).sort();
}
