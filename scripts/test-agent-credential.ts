import "./evals/env.ts";
import {
  mintAgentCredential,
  verifyAgentCredential,
} from "../lib/ai/agent-credential.ts";

function testCredential() {
  console.log("=========================================");
  console.log(" Testing Agent Credential Mint & Verify");
  console.log("=========================================\n");

  const testAnalysisId = "7f3a-sample-analysis-uuid";
  const testOrgId = "org_cartograph_team_123";

  // 1. Mint valid credential
  const token = mintAgentCredential({
    analysisId: testAnalysisId,
    orgId: testOrgId,
    expiresInSeconds: 300,
  });

  console.log("Minted token:", token.slice(0, 40) + "...\n");

  // 2. Verify valid credential
  const payload = verifyAgentCredential(token);
  console.log("Verified payload:", payload);

  if (payload.analysisId !== testAnalysisId || payload.orgId !== testOrgId) {
    throw new Error("Payload mismatch!");
  }
  console.log("▶ Valid Token Check: PASS\n");

  // 3. Test tampering (modify payload)
  let tamperedCaught = false;
  try {
    const parts = token.split(".");
    // Tamper with analysisId in payload
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        analysisId: "tampered-analysis-uuid",
        orgId: testOrgId,
        exp: payload.exp,
        iat: payload.iat,
      })
    ).toString("base64url");
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    verifyAgentCredential(tamperedToken);
  } catch (err: unknown) {
    tamperedCaught = true;
    console.log("Caught tampering:", (err as Error).message);
  }

  if (!tamperedCaught) {
    throw new Error("Tampered token was not caught!");
  }
  console.log("▶ Tamper Resistance Check: PASS\n");

  // 4. Test expired token
  let expiredCaught = false;
  try {
    const expiredToken = mintAgentCredential({
      analysisId: testAnalysisId,
      orgId: testOrgId,
      expiresInSeconds: -10, // expired 10 seconds ago
    });
    verifyAgentCredential(expiredToken);
  } catch (err: unknown) {
    expiredCaught = true;
    console.log("Caught expired:", (err as Error).message);
  }

  if (!expiredCaught) {
    throw new Error("Expired token was not caught!");
  }
  console.log("▶ Expiration Check: PASS\n");

  console.log("All credential security checks passed successfully!");
}

testCredential();
