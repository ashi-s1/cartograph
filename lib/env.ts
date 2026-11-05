/**
 * Environment configuration with startup validation.
 * Per Phase 1 spec: "Environment configuration fails loudly at startup if it's missing.
 * A blank value that produces a confusing error three screens later is worse than a crash on boot."
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `[CRITICAL CONFIG ERROR] Required environment variable "${name}" is missing or empty. Please check your .env.local file.`
    );
  }
  return value.trim();
}

export const env = {
  // Clerk authentication
  get NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY() {
    return requireEnv(
      "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    );
  },
  get CLERK_SECRET_KEY() {
    return requireEnv("CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY);
  },
  // Supabase
  get NEXT_PUBLIC_SUPABASE_URL() {
    return requireEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL
    );
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return requireEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    );
  },
};

/**
 * Validates critical environment variables at startup.
 */
export function validateEnv() {
  // Trigger property getters to validate immediately
  void env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  void env.CLERK_SECRET_KEY;
  void env.NEXT_PUBLIC_SUPABASE_URL;
  void env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
