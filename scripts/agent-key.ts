import "./evals/env.ts";
import { mintAgentCredential } from "../lib/ai/agent-credential.ts";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const args = process.argv.slice(2);
  let analysisId = args[0];
  let orgId = args[1];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if ((!analysisId || !orgId) && supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    // Find the latest completed analysis
    const { data: latestAnalysis } = await supabase
      .from("analyses")
      .select("id, org_id, status, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestAnalysis) {
      analysisId = analysisId || latestAnalysis.id;
      orgId = orgId || latestAnalysis.org_id;
    }
  }

  // Fallback defaults for local offline development
  analysisId = analysisId || "default-local-analysis";
  orgId = orgId || "default-local-org";

  const token = mintAgentCredential({
    analysisId,
    orgId,
    expiresInSeconds: 3600, // 1 hour for manual CLI testing
  });

  console.log("\n=================================================");
  console.log(" Cartograph Agent Credential Generator");
  console.log("=================================================");
  console.log(`Analysis ID : ${analysisId}`);
  console.log(`Org ID      : ${orgId}`);
  console.log(`Expires In  : 3600 seconds (1 hour)`);
  console.log("\nBearer Token:");
  console.log(token);
  console.log("\nExample HTTP tool request:");
  console.log(`curl http://localhost:3000/api/agent/tools/summary -H "Authorization: Bearer ${token}"\n`);
}

main().catch((err) => {
  console.error("Failed to generate agent key:", err);
  process.exit(1);
});
