import type { SourceFile } from "ts-morph";
import type { ExtractedRoute } from "../types.ts";

/**
 * Adapter interface for framework detection, file filtering, role classification, and route extraction.
 * The core parser imports no frameworks; framework knowledge is encapsulated in adapters.
 */
export interface FrameworkAdapter {
  readonly name: string;

  /**
   * Returns true if the relative file path represents a parseable code module.
   */
  isCodeModule(relativePath: string): boolean;

  /**
   * Returns true if a folder or file path should be ignored during walking.
   */
  isIgnored(relativePath: string): { ignored: boolean; reason?: string };

  /**
   * Classifies a file into a framework role, or undefined if generic/unclassified.
   */
  classifyFile?(relativePath: string, sourceFile?: SourceFile): string | undefined;

  /**
   * Extracts exact HTTP routes declared by this file.
   * Spec: Routes are exact or absent. Emit a route only when the method and the
   * full pattern are both recoverable from the parsed syntax with no inference.
   */
  extractRoutes?(relativePath: string, sourceFile: SourceFile): ExtractedRoute[];
}
