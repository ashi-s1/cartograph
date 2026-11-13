/**
 * Environment loader for standalone eval scripts.
 * Loads .env.local without requiring Next.js or React runtime.
 */

import fs from "node:fs";
import path from "node:path";

export function loadEnv(rootDir: string = process.cwd()): void {
  const envPath = path.resolve(rootDir, ".env.local");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf-8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let val = trimmed.slice(eqIndex + 1).trim();

    // Strip quotes if present
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

// Auto-run if imported
loadEnv();
