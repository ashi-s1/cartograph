import path from "node:path";
import { SyntaxKind, type SourceFile, type StringLiteral, type ObjectLiteralExpression, type PropertyAssignment } from "ts-morph";
import type { ExtractedRoute } from "../types.ts";
import type { FrameworkAdapter } from "./types.ts";

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);

const IGNORED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "out",
  ".turbo",
  "coverage",
  ".gemini",
  ".agents",
  ".pnpm-store",
]);

const NEST_HTTP_DECORATORS = new Map<string, string>([
  ["Get", "GET"],
  ["Post", "POST"],
  ["Put", "PUT"],
  ["Delete", "DELETE"],
  ["Patch", "PATCH"],
  ["Options", "OPTIONS"],
  ["Head", "HEAD"],
  ["All", "ALL"],
]);

function normalizePosix(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * Combines controller prefix and method path into an exact normalized route pattern.
 */
function combineRoutePath(prefix: string, subPath: string): string {
  const p1 = prefix.trim().replace(/^\/+|\/+$/g, "");
  const p2 = subPath.trim().replace(/^\/+|\/+$/g, "");
  if (!p1 && !p2) return "/";
  if (!p1) return `/${p2}`;
  if (!p2) return `/${p1}`;
  return `/${p1}/${p2}`;
}

/**
 * Adapter for NestJS.
 * Identifies roles from filename conventions and decorators,
 * and extracts exact routes from @Controller and method decorators.
 */
export class NestAdapter implements FrameworkAdapter {
  readonly name = "nestjs";

  isCodeModule(relativePath: string): boolean {
    const ext = path.extname(relativePath).toLowerCase();
    if (relativePath.endsWith(".d.ts")) {
      return false;
    }
    return CODE_EXTENSIONS.has(ext);
  }

  isIgnored(relativePath: string): { ignored: boolean; reason?: string } {
    const segments = relativePath.split(/[/\\]/);
    for (const segment of segments) {
      if (IGNORED_DIRECTORIES.has(segment)) {
        return { ignored: true, reason: `Ignored directory: ${segment}` };
      }
    }
    return { ignored: false };
  }

  classifyFile(relativePath: string, sourceFile?: SourceFile): string {
    const posix = normalizePosix(relativePath).toLowerCase();

    // 1. Controllers (*.controller.ts or @Controller decorator)
    if (posix.endsWith(".controller.ts") || posix.endsWith(".controller.js")) {
      return "Controllers";
    }

    // 2. Services (*.service.ts or @Injectable service)
    if (posix.endsWith(".service.ts") || posix.endsWith(".service.js")) {
      return "Services";
    }

    // 3. Modules (*.module.ts or @Module)
    if (posix.endsWith(".module.ts") || posix.endsWith(".module.js")) {
      return "Modules";
    }

    // 4. Entities (*.entity.ts or @Entity)
    if (posix.endsWith(".entity.ts") || posix.endsWith(".entity.js")) {
      return "Entities";
    }

    // Fall back to decorator inspection if sourceFile is available
    if (sourceFile) {
      for (const cls of sourceFile.getClasses()) {
        if (cls.getDecorator("Controller")) return "Controllers";
        if (cls.getDecorator("Module")) return "Modules";
        if (cls.getDecorator("Entity")) return "Entities";
        if (cls.getDecorator("Injectable")) return "Services";
      }
    }

    return "Generic";
  }

  extractRoutes(relativePath: string, sourceFile: SourceFile): ExtractedRoute[] {
    const routes: ExtractedRoute[] = [];

    for (const cls of sourceFile.getClasses()) {
      const controllerDecorator = cls.getDecorator("Controller");
      if (!controllerDecorator) continue;

      // Determine controller path prefix
      let controllerPrefix = "";
      const args = controllerDecorator.getArguments();

      if (args.length > 0) {
        const firstArg = args[0];
        if (firstArg.getKind() === SyntaxKind.StringLiteral) {
          controllerPrefix = (firstArg as StringLiteral).getLiteralValue();
        } else if (firstArg.getKind() === SyntaxKind.ObjectLiteralExpression) {
          const obj = firstArg as ObjectLiteralExpression;
          const pathProp = obj.getProperty("path");
          if (pathProp && pathProp.getKind() === SyntaxKind.PropertyAssignment) {
            const init = (pathProp as PropertyAssignment).getInitializer();
            if (init && init.getKind() === SyntaxKind.StringLiteral) {
              controllerPrefix = (init as StringLiteral).getLiteralValue();
            } else {
              // Non-string or dynamic expression: skip according to constraint
              continue;
            }
          }
        } else {
          // Dynamic variable or expression: cannot infer with certainty, skip
          continue;
        }
      }

      // Inspect methods on the controller
      for (const method of cls.getMethods()) {
        for (const dec of method.getDecorators()) {
          const decName = dec.getName();
          const httpMethod = NEST_HTTP_DECORATORS.get(decName);
          if (!httpMethod) continue;

          let methodPath = "";
          const decArgs = dec.getArguments();
          if (decArgs.length > 0) {
            const arg = decArgs[0];
            if (arg.getKind() === SyntaxKind.StringLiteral) {
              methodPath = (arg as StringLiteral).getLiteralValue();
            } else {
              // Expression or dynamic identifier: skip route according to exact constraint
              continue;
            }
          }

          const fullPath = combineRoutePath(controllerPrefix, methodPath);
          routes.push({
            file: relativePath,
            method: httpMethod,
            path: fullPath,
          });
        }
      }
    }

    return routes;
  }
}
