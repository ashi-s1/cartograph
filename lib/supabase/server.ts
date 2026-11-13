import { createClient } from "@supabase/supabase-js";
import { auth, createClerkClient } from "@clerk/nextjs/server";
import { env } from "@/lib/env";

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf-8"));
    if (typeof payload.exp === "number") {
      // Buffer of 5 seconds
      return payload.exp * 1000 <= Date.now() + 5_000;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Creates a server-side Supabase client carrying the current Clerk session token and org claims.
 * Single session system: Clerk owns session cookies and tokens.
 * The Supabase client forwards the token so Postgres RLS can inspect user and org claims.
 */
export async function createClerkSupabaseServerClient() {
  const { getToken, orgId } = await auth();

  // Prefer standard Clerk token for Supabase Third-Party Auth (JWKS)
  let token: string | null = null;
  try {
    token = await getToken();
  } catch {
    // fallback
  }

  if (!token) {
    try {
      token = await getToken({ template: "supabase" });
    } catch {
      token = null;
    }
  }

  // If token is expired, omit it to prevent Supabase rejecting with 401 JWT expired
  if (token && isJwtExpired(token)) {
    token = null;
  }

  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (orgId) {
    headers["x-organization-id"] = orgId;
  }

  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    apiKey,
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
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const validToken = initialToken && !isJwtExpired(initialToken) ? initialToken : null;

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    apiKey,
    {
      global: {
        headers: {
          "x-organization-id": orgId,
          ...(validToken ? { Authorization: `Bearer ${validToken}` } : {}),
        },
      },
      accessToken: async () => {
        if (!sessionId) {
          return initialToken || "";
        }
        try {
          const res = await clerk.sessions.getToken(sessionId);
          return (res as { raw?: string }).raw || initialToken || "";
        } catch {
          try {
            const res = await clerk.sessions.getToken(sessionId, "supabase");
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
