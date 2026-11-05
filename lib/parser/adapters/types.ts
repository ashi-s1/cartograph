/**
 * Adapter interface for framework detection and file filtering.
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
}
