import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseServerClient } from "@/lib/supabase/server";
import { mintAgentCredential } from "@/lib/ai/agent-credential";
import { loadVerifiedAnalysis } from "@/lib/supabase/agent-reader";

export const dynamic = "force-dynamic";

const AGENT_SERVICE_URL = process.env.AGENT_URL || "http://127.0.0.1:3001";

/**
 * Entry point that proves the asker owns the analysis, mints the signed credential,
 * loads the verified analysis data, and streams the agent response back.
 * Constraints per phase-12.md:
 * - "An entry point that proves the asker owns the analysis, mints that credential, opens a conversation, and relays the stream back."
 * - "When the agent is unreachable, the rest of the application keeps working."
 */
export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { analysisId, messages } = body;

    if (!analysisId || typeof analysisId !== "string") {
      return new Response(JSON.stringify({ error: "analysisId is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Prove asker owns the analysis
    const supabase = await createClerkSupabaseServerClient();
    const { data: analysisRecord, error: analysisErr } = await supabase
      .from("analyses")
      .select("id, org_id")
      .eq("id", analysisId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (analysisErr || !analysisRecord) {
      return new Response(
        JSON.stringify({ error: "Analysis not found or access denied for this organization" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 2. Mint short-lived signed credential
    const credential = mintAgentCredential({
      analysisId,
      orgId,
      expiresInSeconds: 900,
    });

    // 3. Load analysis data strictly for this analysis & org
    const analysisData = await loadVerifiedAnalysis(analysisId, orgId);

    // 4. Relay to local agent service over HTTP
    let agentResponse: Response;
    try {
      agentResponse = await fetch(`${AGENT_SERVICE_URL}/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${credential}`,
        },
        body: JSON.stringify({
          messages,
          analysis: analysisData,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      return new Response(
        JSON.stringify({
          error: "Agent service unreachable. Start the agent with 'pnpm --filter cartograph-agent dev' or 'cd agent && pnpm dev'.",
          unreachable: true,
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!agentResponse.ok) {
      const errText = await agentResponse.text();
      return new Response(
        JSON.stringify({ error: `Agent error: ${errText}` }),
        { status: agentResponse.status, headers: { "Content-Type": "application/json" } }
      );
    }

    // 5. Pipe the SSE stream back to the browser
    return new Response(agentResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
