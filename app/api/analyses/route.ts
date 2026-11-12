import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClerkSupabaseServerClient, createJobSupabaseServerClient } from "@/lib/supabase/server";
import { parseGitHubUrl } from "@/lib/pipeline/fetcher";
import { runAnalysisPipeline } from "@/lib/pipeline/runner";
import crypto from "node:crypto";

export async function POST(req: NextRequest) {
  try {
    const { userId, orgId, sessionId, getToken } = await auth();
    if (!userId || !orgId) {
      return NextResponse.json(
        { error: "Unauthorized: Active organization required" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { repositoryUrl, forceRerun = false } = body;

    if (!repositoryUrl || typeof repositoryUrl !== "string") {
      return NextResponse.json(
        { error: "A repository URL is required" },
        { status: 400 }
      );
    }

    let parsed;
    try {
      parsed = parseGitHubUrl(repositoryUrl);
    } catch (err: any) /* eslint-disable-line @typescript-eslint/no-explicit-any */ {
      return NextResponse.json(
        { error: err.message || "Invalid GitHub repository URL" },
        { status: 400 }
      );
    }

    const supabase = await createClerkSupabaseServerClient();

    // 1. Check if project already exists for this organization
    const { data: existingProject } = await supabase
      .from("projects")
      .select("id, name, repository_url")
      .eq("org_id", orgId)
      .eq("repository_url", parsed.url)
      .maybeSingle();

    let existingAnalysisId: string | null = null;

    if (existingProject) {
      // Check for existing analysis (completed, active, or stalled)
      const { data: existingAnalysis } = await supabase
        .from("analyses")
        .select("id, status, created_at, summary")
        .eq("org_id", orgId)
        .eq("project_id", existingProject.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingAnalysis) {
        existingAnalysisId = existingAnalysis.id;

        const summary = (existingAnalysis.summary as Record<string, unknown>) || {};
        const lastHeartbeat = summary.heartbeat_at
          ? new Date(summary.heartbeat_at as string).getTime()
          : new Date(existingAnalysis.created_at).getTime();
        const isHeartbeatFresh = Date.now() - lastHeartbeat < 90_000;
        const isActive = existingAnalysis.status === "running" && isHeartbeatFresh;

        if (!forceRerun) {
          // If completed, reuse existing analysis
          if (existingAnalysis.status === "completed") {
            return NextResponse.json({
              analysisId: existingAnalysis.id,
              projectId: existingProject.id,
              isExisting: true,
              status: "completed",
            });
          }

          // If active run with fresh heartbeat, let it continue
          if (isActive) {
            return NextResponse.json({
              analysisId: existingAnalysis.id,
              projectId: existingProject.id,
              isExisting: true,
              status: "running",
            });
          }

          // Otherwise (stalled > 90s or failed), fall through to restart pipeline
        } else {
          // Concurrent forceRerun requested while analysis is actively running
          if (isActive) {
            return NextResponse.json(
              { error: "Analysis already actively running" },
              { status: 409 }
            );
          }
        }
      }
    }

    // 2. Prepare project & analysis IDs and atomic claim
    const projectId = existingProject?.id || crypto.randomUUID();
    const analysisId = existingAnalysisId || crypto.randomUUID();
    const claimId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    if (!existingProject) {
      const { error: projectErr } = await supabase.from("projects").insert({
        id: projectId,
        org_id: orgId,
        name: `${parsed.owner}/${parsed.repo}`,
        repository_url: parsed.url,
      });

      if (projectErr) {
        return NextResponse.json(
          { error: `Failed to create project: ${projectErr.message}` },
          { status: 500 }
        );
      }
    }

    // Insert or update analysis record to running state with atomic claim
    const { error: analysisErr } = await supabase.from("analyses").upsert({
      id: analysisId,
      org_id: orgId,
      project_id: projectId,
      status: "running",
      stage: "fetching",
      stage_message: "Downloading repository archive from GitHub",
      error_message: null,
      completed_at: null,
      created_at: nowIso,
      summary: {
        claim_id: claimId,
        heartbeat_at: nowIso,
      },
    });

    if (analysisErr) {
      return NextResponse.json(
        { error: `Failed to initialize analysis: ${analysisErr.message}` },
        { status: 500 }
      );
    }

    // 3. Create job-authenticated client with renewable credentials for background task
    let initialToken: string | null = null;
    try {
      initialToken = await getToken();
    } catch {
      // fallback
    }
    if (!initialToken) {
      try {
        initialToken = await getToken({ template: "supabase" });
      } catch {
        initialToken = null;
      }
    }

    const jobSupabase = createJobSupabaseServerClient({
      sessionId,
      orgId,
      initialToken,
    });

    // Kick off pipeline runner in background using Next.js after()
    after(async () => {
      try {
        await runAnalysisPipeline({
          supabase: jobSupabase,
          orgId,
          repositoryUrl: parsed.url,
          projectId,
          analysisId,
          forceRerun: true,
          claimId,
        });
      } catch (runErr) {
        console.error(`Pipeline execution failed for analysis ${analysisId}:`, runErr);
      }
    });

    return NextResponse.json({
      analysisId,
      projectId,
      isExisting: false,
      status: "running",
    });
  } catch (error: any) /* eslint-disable-line @typescript-eslint/no-explicit-any */ {
    console.error("Error in /api/analyses:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
