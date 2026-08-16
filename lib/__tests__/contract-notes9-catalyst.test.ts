/**
 * Conformance test for the Notes9 <-> Catalyst seam.
 *
 * The type checker stops at the repo boundary. This test is what replaces it on the
 * Notes9 side. Its counterpart is AI/catalyst/tests/test_contract_notes9_seam.py, and
 * both assert against the byte-identical fixture committed to both repos.
 *
 * If this goes red, read the failure message before changing anything: it names which
 * repo is expected to move. Widening a cap here without widening it in Catalyst produces
 * a raw 422 at runtime that no build catches, which is the exact failure this exists for.
 *
 * See docs/arch/catalyst-seam-determinism/CONTRACTS.md.
 */
import { describe, it, expect } from "vitest"
import fixture from "../../contracts/notes9-catalyst.v1.json"
import {
  QUERY_CHARS_MAX,
  HISTORY_ITEMS_MAX,
  MESSAGE_CONTENT_CHARS_MAX,
  ATTACHMENTS_ITEMS_MAX,
} from "../limits/config"
import {
  SPEC_AUTHOR_PROMPT_MAX_CHARS,
  SPEC_AUTHOR_SYSTEM_MAX_CHARS,
} from "../data-analysis/ai/spec-author"

const L = fixture.limits

/** One assertion per row, so a failure names the single field that diverged. */
const drift = (field: string) =>
  `Notes9 disagrees with Catalyst on "${field}". The shared value lives in ` +
  `contracts/notes9-catalyst.v1.json and is mirrored in the AI repo at ` +
  `contracts/notes9-catalyst.v1.json. Catalyst's pydantic is the EFFECTIVE ceiling ` +
  `because LIMITS_MODE defaults to shadow here, so a larger value on this side is not ` +
  `a larger limit, it is a raw 422 the user sees instead of our own message.`

describe("seam contract: request limits", () => {
  it("query character cap matches the contract", () => {
    expect(QUERY_CHARS_MAX, drift("query_chars_max")).toBe(L.query_chars_max)
  })

  it("history item cap matches the contract", () => {
    expect(HISTORY_ITEMS_MAX, drift("history_items_max")).toBe(L.history_items_max)
  })

  it("message content character cap matches the contract", () => {
    expect(MESSAGE_CONTENT_CHARS_MAX, drift("message_content_chars_max")).toBe(
      L.message_content_chars_max,
    )
  })

  it("attachment item cap matches the contract", () => {
    expect(ATTACHMENTS_ITEMS_MAX, drift("attachments_items_max")).toBe(
      L.attachments_items_max,
    )
  })
})

describe("seam contract: spec-author bounds (ADR-004)", () => {
  // These three already agree. They are the proof that the mechanism works, and they
  // are what the four above are being brought into line with.
  it("prompt character bound matches the contract", () => {
    expect(SPEC_AUTHOR_PROMPT_MAX_CHARS, drift("spec_author_prompt_chars_max")).toBe(
      L.spec_author_prompt_chars_max,
    )
  })

  it("system character bound matches the contract", () => {
    expect(SPEC_AUTHOR_SYSTEM_MAX_CHARS, drift("spec_author_system_chars_max")).toBe(
      L.spec_author_system_chars_max,
    )
  })
})

describe("seam contract: fixture integrity", () => {
  it("declares contract_version 1", () => {
    expect(fixture.contract_version).toBe("1")
  })

  it("names all 21 SSE events, so a client can be built from this file alone", () => {
    // The AI-side test asserts this list equals Catalyst's live registry. The
    // client-side comparison is no longer missing: KNOWN_EVENT_TYPES is exported
    // and __tests__/agent-stream-contract.test.ts diffs it against this list in
    // BOTH directions. Keep this as the shape check.
    expect(fixture.sse_events).toHaveLength(21)
    expect(fixture.sse_events).toContain("text_reset")
    expect([...fixture.sse_events].sort()).toEqual(fixture.sse_events)
  })
})
