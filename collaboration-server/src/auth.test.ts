import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-jwt-secret";
process.env.SUPABASE_URL = "https://example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const { onAuthenticate } = await import("./auth.js");

const OWNER_USER_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_USER_ID = "22222222-2222-2222-2222-222222222222";
const PAPER_ID = "33333333-3333-3333-3333-333333333333";
const PROJECT_ID = "44444444-4444-4444-4444-444444444444";
const ORG_ID = "55555555-5555-5555-5555-555555555555";
const OTHER_ORG_ID = "66666666-6666-6666-6666-666666666666";

interface FetchCall {
  url: string;
  method: string;
}

let calls: FetchCall[];
let originalFetch: typeof fetch;

beforeEach(() => {
  calls = [];
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function routeByTable(routes: Record<string, unknown>) {
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit
  ) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, method: init?.method ?? "GET" });
    for (const [table, body] of Object.entries(routes)) {
      if (url.includes(`/rest/v1/${table}?`)) {
        return jsonResponse(body);
      }
    }
    throw new Error(`unexpected request to ${url}`);
  }) as typeof fetch;
}

function signToken(sub: string, overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    { sub, email: "user@example.test", ...overrides },
    process.env.JWT_SECRET as string
  );
}

describe("onAuthenticate (SEC-002 / N9-1 document authorization)", () => {
  it("returns UserContext when the caller owns the requested paper", async () => {
    routeByTable({
      papers: [{ created_by: OWNER_USER_ID, project_id: PROJECT_ID }],
    });
    const token = signToken(OWNER_USER_ID);

    const result = await onAuthenticate({ token, documentName: PAPER_ID });

    assert.equal(result.userId, OWNER_USER_ID);
  });

  it("returns UserContext when the caller shares the paper's project organization", async () => {
    routeByTable({
      papers: [{ created_by: OTHER_USER_ID, project_id: PROJECT_ID }],
      profiles: [{ organization_id: ORG_ID }],
      projects: [{ organization_id: ORG_ID }],
    });
    const token = signToken(OWNER_USER_ID);

    const result = await onAuthenticate({ token, documentName: PAPER_ID });

    assert.equal(result.userId, OWNER_USER_ID);
  });

  it("rejects a connection when the user has no access to the document (cross-tenant)", async () => {
    // User A (a valid, correctly-signed JWT) tries to open user B's paper.
    // A and B are in different orgs, so this must be denied.
    routeByTable({
      papers: [{ created_by: OTHER_USER_ID, project_id: PROJECT_ID }],
      profiles: [{ organization_id: ORG_ID }],
      projects: [{ organization_id: OTHER_ORG_ID }],
    });
    const token = signToken(OWNER_USER_ID);

    await assert.rejects(
      () => onAuthenticate({ token, documentName: PAPER_ID }),
      /Access to document denied/
    );

    // No content was ever read back to the denied caller...
    assert.ok(
      !calls.some((c) => c.url.includes("select=content")),
      "denied caller must never receive document content"
    );
    // ...and no write to the paper occurred either.
    assert.ok(
      !calls.some((c) => c.method === "PATCH"),
      "denied caller must never trigger a store() write"
    );
  });

  it("rejects a non-UUID documentName before making any authorization query", async () => {
    routeByTable({});
    const token = signToken(OWNER_USER_ID);

    await assert.rejects(() =>
      onAuthenticate({ token, documentName: "not-a-uuid" })
    );

    assert.equal(calls.length, 0);
  });

  it("rejects a documentName containing PostgREST metacharacters before making any query", async () => {
    routeByTable({});
    const token = signToken(OWNER_USER_ID);

    await assert.rejects(() =>
      onAuthenticate({
        token,
        documentName: `${PAPER_ID}&select=*`,
      })
    );

    assert.equal(calls.length, 0);
  });

  it("still rejects when no token is provided (preserves existing behavior)", async () => {
    await assert.rejects(
      () => onAuthenticate({ token: "", documentName: PAPER_ID }),
      /Authentication token is required/
    );
  });

  it("still rejects an invalid signature (preserves existing behavior)", async () => {
    const badToken = jwt.sign({ sub: OWNER_USER_ID }, "wrong-secret");

    await assert.rejects(
      () => onAuthenticate({ token: badToken, documentName: PAPER_ID }),
      /Invalid token/
    );
  });
});
