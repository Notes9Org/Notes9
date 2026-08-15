import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

// Must be set before any supabaseRequest() call (getSupabaseConfig reads
// these lazily, but set them up front so every test starts from a known
// config regardless of import/execution order).
process.env.SUPABASE_URL = "https://example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const { canAccessDocument, createDatabaseExtension } = await import(
  "./database.js"
);

const USER_ID = "11111111-1111-1111-1111-111111111111";
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

/** Installs a fetch mock that routes by URL substring and records every call. */
function mockFetch(handler: (url: string) => unknown) {
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit
  ) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, method: init?.method ?? "GET" });
    return jsonResponse(handler(url));
  }) as typeof fetch;
}

function routeByTable(routes: Record<string, unknown>) {
  mockFetch((url) => {
    for (const [table, body] of Object.entries(routes)) {
      if (url.includes(`/rest/v1/${table}?`)) {
        return body;
      }
    }
    throw new Error(`unexpected request to ${url}`);
  });
}

describe("canAccessDocument (SEC-002 / N9-1)", () => {
  it("rejects a malformed / non-UUID documentName before making any query", async () => {
    mockFetch(() => {
      throw new Error("should not be called");
    });

    const result = await canAccessDocument(USER_ID, "not-a-uuid");

    assert.equal(result, false);
    assert.equal(calls.length, 0);
  });

  it("rejects documentName containing PostgREST metacharacters before making any query", async () => {
    mockFetch(() => {
      throw new Error("should not be called");
    });

    const result = await canAccessDocument(USER_ID, `${PAPER_ID}&select=*`);

    assert.equal(result, false);
    assert.equal(calls.length, 0);
  });

  it("rejects an empty documentName before making any query", async () => {
    mockFetch(() => {
      throw new Error("should not be called");
    });

    const result = await canAccessDocument(USER_ID, "");

    assert.equal(result, false);
    assert.equal(calls.length, 0);
  });

  it("allows the paper's owner without any org lookup", async () => {
    routeByTable({
      papers: [{ created_by: USER_ID, project_id: PROJECT_ID }],
    });

    const result = await canAccessDocument(USER_ID, PAPER_ID);

    assert.equal(result, true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/papers\?id=eq\.[0-9a-f-]+&select=created_by,project_id$/);
  });

  it("denies a different user with no shared organization (cross-tenant read/write)", async () => {
    routeByTable({
      papers: [{ created_by: OTHER_USER_ID, project_id: PROJECT_ID }],
      profiles: [{ organization_id: ORG_ID }],
      projects: [{ organization_id: OTHER_ORG_ID }],
    });

    const result = await canAccessDocument(USER_ID, PAPER_ID);

    assert.equal(result, false);
  });

  it("allows a different user who shares the paper's project organization", async () => {
    routeByTable({
      papers: [{ created_by: OTHER_USER_ID, project_id: PROJECT_ID }],
      profiles: [{ organization_id: ORG_ID }],
      projects: [{ organization_id: ORG_ID }],
    });

    const result = await canAccessDocument(USER_ID, PAPER_ID);

    assert.equal(result, true);
  });

  it("denies when the paper does not exist", async () => {
    routeByTable({ papers: [] });

    const result = await canAccessDocument(USER_ID, PAPER_ID);

    assert.equal(result, false);
  });

  it("denies when the paper has no project and the caller isn't the owner", async () => {
    routeByTable({
      papers: [{ created_by: OTHER_USER_ID, project_id: null }],
    });

    const result = await canAccessDocument(USER_ID, PAPER_ID);

    assert.equal(result, false);
  });

  it("denies when the requesting user has no organization", async () => {
    routeByTable({
      papers: [{ created_by: OTHER_USER_ID, project_id: PROJECT_ID }],
      profiles: [{ organization_id: null }],
    });

    const result = await canAccessDocument(USER_ID, PAPER_ID);

    assert.equal(result, false);
  });
});

describe("createDatabaseExtension PostgREST parameter encoding", () => {
  it("encodeURIComponent-encodes documentName in fetch(), neutralizing injected query params", async () => {
    const injected = `${PAPER_ID}&select=*,secret_column`;
    routeByTable({ papers: [] });

    await createDatabaseExtension().configuration.fetch({
      documentName: injected,
    } as never);

    assert.equal(calls.length, 1);
    const requested = new URL(calls[0].url);
    // The injected "&select=*,secret_column" must be part of the (encoded)
    // `id` value, not a second `select` query param.
    assert.deepEqual(requested.searchParams.getAll("select"), ["content"]);
    assert.equal(requested.searchParams.get("id"), `eq.${injected}`);
  });
});
