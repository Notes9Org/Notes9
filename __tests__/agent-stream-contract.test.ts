/**
 * Contract test for the Notes9 <-> Catalyst SSE seam.
 *
 * Two directions, because a one-way check cannot see its own blind spot:
 *
 *   1. contract -> client: every event Catalyst may emit is one this client
 *      accepts. Catches a NEW server event the UI would silently drop.
 *   2. client -> contract: every event this client claims to know is one the
 *      contract actually declares. Catches a client-only event that no server
 *      will ever send — invisible to a fixture-driven loop, which can only
 *      iterate what the server side already listed.
 *
 * Source of truth is contracts/notes9-catalyst.v1.json, which is committed to
 * BOTH repos byte-identically. The previous version of this test read the
 * fixture out of a sibling ../../AI checkout, so it passed locally and could
 * only ever fail on a CI runner that has one repo. The in-repo contract has no
 * such dependency; the sibling fixture is still used when present, but is
 * optional.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";
import { isSseEvent, KNOWN_EVENT_TYPES } from "../lib/agent-stream-types";

const contract: { sse_events: string[] } = JSON.parse(
  readFileSync(
    resolve(__dirname, "../contracts/notes9-catalyst.v1.json"),
    "utf-8"
  )
);

const contractEvents = new Set(contract.sse_events);

describe("SSE vocabulary agrees in both directions", () => {
  it("client knows every event the contract declares", () => {
    const missing = [...contractEvents].filter((e) => !KNOWN_EVENT_TYPES.has(e));
    expect(missing, `contract events the client would drop: ${missing}`).toEqual(
      []
    );
  });

  it("contract declares every event the client claims to know", () => {
    const extra = [...KNOWN_EVENT_TYPES].filter((e) => !contractEvents.has(e));
    expect(extra, `client events no server will send: ${extra}`).toEqual([]);
  });
});

// The fixture carries a representative PAYLOAD per event, which the contract
// (names only) cannot. Run it when the sibling checkout is there, skip when not.
const FIXTURE_PATH =
  process.env.SSE_FIXTURE_PATH ??
  resolve(__dirname, "../../AI/catalyst/tests/fixtures/sse_events.json");

describe.skipIf(!existsSync(FIXTURE_PATH))(
  "every fixture payload is accepted by isSseEvent",
  () => {
    const fixture: Record<string, unknown> = JSON.parse(
      readFileSync(FIXTURE_PATH, "utf-8")
    );
    for (const [eventType, data] of Object.entries(fixture)) {
      it(`accepts event_type "${eventType}"`, () => {
        expect(isSseEvent({ event: eventType, data })).toBe(true);
      });
    }
  }
);
