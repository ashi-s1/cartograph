import { createClient } from "@supabase/supabase-js";
import { auth, createClerkClient } from "@clerk/nextjs/server";
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

/**
 * Creates a job-authenticated Supabase client that dynamically refreshes tokens
 * for the full duration of a background task while preserving organization isolation.
 */
export function createJobSupabaseServerClient(options: {
  sessionId?: string | null;
  orgId: string;
  initialToken?: string | null;
}) {
  const { sessionId, orgId, initialToken } = options;
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: {
          "x-organization-id": orgId,
          ...(initialToken ? { Authorization: `Bearer ${initialToken}` } : {}),
        },
      },
      accessToken: async () => {
        if (!sessionId) {
          return initialToken || "";
        }
        try {
          const res = await clerk.sessions.getToken(sessionId, "supabase");
          return (res as { raw?: string }).raw || initialToken || "";
        } catch {
          try {
            const res = await clerk.sessions.getToken(sessionId);
            return (res as { raw?: string }).raw || initialToken || "";
          } catch {
            return initialToken || "";
          }
        }
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
