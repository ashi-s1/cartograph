import { createClient } from "@supabase/supabase-js";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/lib/env";

/**
 * Creates a server-side Supabase client carrying the current Clerk session token and org claims.
 * Single session system: Clerk owns session cookies and tokens.
 * The Supabase client forwards the token so Postgres RLS can inspect user and org claims.
 */
export async function createClerkSupabaseServerClient() {
  const { getToken, orgId } = await auth();

  let token: string | null = null;
  try {
    token = await getToken({ template: "supabase" });
  } catch {
    // If supabase JWT template is not configured, fallback to standard token
    token = await getToken();
  }
  if (!token) {
    token = await getToken();
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (orgId) {
    headers["x-organization-id"] = orgId;
  }

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
