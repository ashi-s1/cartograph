import crypto from "node:crypto";
import { env } from "../env.ts";

export interface AgentCredentialPayload {
  analysisId: string;
  orgId: string;
  exp: number;
  iat: number;
}

function getSigningSecret(): string {
  return process.env.AGENT_TOKEN_SECRET || env.CLERK_SECRET_KEY || "cartograph-agent-fallback-secret";
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf8").toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf8");
}

/**
 * Mints a short-lived signed credential naming exactly one analysis and its organization.
 * Constraints per phase-12.md:
 * - "A short-lived signed credential naming exactly one analysis and the organization it belongs to."
 * - "The agent is never told which analysis it's reading. That lives inside the signed credential."
 */
export function mintAgentCredential(options: {
  analysisId: string;
  orgId: string;
  expiresInSeconds?: number;
}): string {
  const { analysisId, orgId, expiresInSeconds = 900 } = options;
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "HS256", typ: "AGENT_CREDENTIAL" };
  const payload: AgentCredentialPayload = {
    analysisId,
    orgId,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const content = `${headerEncoded}.${payloadEncoded}`;

  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(content)
    .digest("base64url");

  return `${content}.${signature}`;
}

/**
 * Verifies a short-lived signed credential.
 * Throws an error if invalid, expired, or tampered with.
 */
export function verifyAgentCredential(token: string): AgentCredentialPayload {
  if (!token || typeof token !== "string") {
    throw new Error("Missing agent credential");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid agent credential format");
  }

  const [headerEncoded, payloadEncoded, signature] = parts;
  const content = `${headerEncoded}.${payloadEncoded}`;

  const expectedSignature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(content)
    .digest("base64url");

  const sigBuffer = Buffer.from(signature, "base64url");
  const expectedSigBuffer = Buffer.from(expectedSignature, "base64url");

  if (
    sigBuffer.length !== expectedSigBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)
  ) {
    throw new Error("Agent credential signature verification failed");
  }

  const payload: AgentCredentialPayload = JSON.parse(base64UrlDecode(payloadEncoded));
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp < now) {
    throw new Error("Agent credential has expired");
  }

  return payload;
}
