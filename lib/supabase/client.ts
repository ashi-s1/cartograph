"use client";

import { createClient } from "@supabase/supabase-js";
import { useSession, useOrganization } from "@clerk/nextjs";
import { useMemo } from "react";

/**
 * Browser-side Supabase client carrying the active Clerk token and org claims.
 * Single session system: does not create or refresh Supabase cookies.
 * Passes accessToken to both HTTP fetch and Realtime WebSocket connections.
 */
export function useClerkSupabaseClient() {
  const { session } = useSession();
  const { organization } = useOrganization();

  return useMemo(() => {
    const getToken = async (): Promise<string | null> => {
      if (!session) return null;
      try {
        const token = await session.getToken({ template: "supabase" });
        if (token) return token;
      } catch {
        // Fall back to default session token
      }
      return session.getToken();
    };

    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        "",
      {
        accessToken: async () => {
          const t = await getToken();
          return t ?? "";
        },
        global: {
          fetch: async (url, options = {}) => {
            const token = await getToken();
            const headers = new Headers(options.headers);
            if (token) {
              headers.set("Authorization", `Bearer ${token}`);
            }
            if (organization?.id) {
              headers.set("x-organization-id", organization.id);
            }

            return fetch(url, {
              ...options,
              headers,
            });
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );

    return client;
  }, [session, organization]);
}
