/**
 * Contract test: every entry in the SSE fixture JSON is accepted by the
 * isSseEvent type guard from agent-stream-types.ts.
 *
 * Fixture path: resolved from SSE_FIXTURE_PATH env var, falling back to the
 * sibling Python repo at ../../AI/catalyst/tests/fixtures/sse_events.json
 * relative to this file. If the cross-repo path is unavailable in CI, set
 * SSE_FIXTURE_PATH to a copied fixture location.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, it, expect } from "vitest";
import { isSseEvent } from "../lib/agent-stream-types";

const FIXTURE_PATH =
  process.env.SSE_FIXTURE_PATH ??
  resolve(__dirname, "../../AI/catalyst/tests/fixtures/sse_events.json");

const fixture: Record<string, unknown> = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf-8")
);

describe("SSE contract — every fixture entry is a valid SseEvent", () => {
  for (const [eventType, data] of Object.entries(fixture)) {
    it(`accepts event_type "${eventType}"`, () => {
      const candidate = { event: eventType, data };
      expect(isSseEvent(candidate)).toBe(true);
    });
  }
});
