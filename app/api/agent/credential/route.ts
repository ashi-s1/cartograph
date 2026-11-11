import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { mintAgentCredential } from "@/lib/ai/agent-credential";
import { createClerkSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { userId, orgId } = await auth();

    if (!userId || !orgId) {
      return NextResponse.json(
        { error: "Unauthorized. An active organization session is required." },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const analysisId = body?.analysisId;

    if (!analysisId || typeof analysisId !== "string") {
      return NextResponse.json(
        { error: "analysisId is required." },
        { status: 400 }
      );
    }

    // Verify caller's organization owns this analysis
    const supabase = await createClerkSupabaseServerClient();
    const { data: analysis, error: analysisErr } = await supabase
      .from("analyses")
      .select("id, org_id")
      .eq("id", analysisId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (analysisErr || !analysis) {
      return NextResponse.json(
        { error: "Analysis not found or access denied for this organization." },
        { status: 404 }
      );
    }

    // Mint short-lived signed credential (15 minutes = 900s)
    const credential = mintAgentCredential({
      analysisId,
      orgId,
      expiresInSeconds: 900,
    });

    return NextResponse.json({
      credential,
      analysisId,
      orgId,
      expiresIn: 900,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
