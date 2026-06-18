/**
 * P0 + AD1 regression tests.
 *
 * Source names on a tool card must derive ONLY from structured SSE fields,
 * never from parsing human-readable `thinking` prose. These tests lock in:
 *   - normalizeSourceNames: trim / drop-blank / dedupe / truncate / cap
 *   - sourceNamesFromEvent: structured extraction per event, and that a
 *     `thinking` event (the old regex source) yields nothing.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeSourceNames,
  sourceNamesFromEvent,
} from "../lib/agent-stream-types";

describe("normalizeSourceNames", () => {
  it("keeps strings, trims, and drops blanks / non-strings", () => {
    expect(
      normalizeSourceNames(["  Paper A  ", "", null, 42, "Paper B"]),
    ).toEqual(["Paper A", "Paper B"]);
  });

  it("dedupes case-insensitively, first spelling wins", () => {
    expect(normalizeSourceNames(["Paper A", "paper a", "PAPER A"])).toEqual([
      "Paper A",
    ]);
  });

  it("truncates each name to maxLen with an ellipsis", () => {
    const long = "x".repeat(120);
    const [out] = normalizeSourceNames([long]);
    expect(out).toHaveLength(80);
    expect(out.endsWith("…")).toBe(true);
  });

  it("caps the count when max is given", () => {
    expect(
      normalizeSourceNames(["a", "b", "c", "d", "e", "f"], { max: 5 }),
    ).toHaveLength(5);
  });

  it("returns [] for non-array input", () => {
    expect(normalizeSourceNames(undefined)).toEqual([]);
    expect(normalizeSourceNames("Paper A")).toEqual([]);
  });
});

describe("sourceNamesFromEvent — structured fields only", () => {
  it("reads tool_result.source_names", () => {
    expect(
      sourceNamesFromEvent("tool_result", {
        source_names: ["Protocol X", "Protocol X", "Lab note 1"],
      }),
    ).toEqual(["Protocol X", "Lab note 1"]);
  });

  it("reads tool_output.document_names, falling back to file_names", () => {
    expect(
      sourceNamesFromEvent("tool_output", { document_names: ["Doc 1"] }),
    ).toEqual(["Doc 1"]);
    expect(
      sourceNamesFromEvent("tool_output", { file_names: ["File 1"] }),
    ).toEqual(["File 1"]);
  });

  it("reads rag_chunks[].source_name and caps at 5", () => {
    const chunks = Array.from({ length: 8 }, (_, i) => ({
      source_name: `Source ${i}`,
    }));
    expect(sourceNamesFromEvent("rag_chunks", { chunks })).toHaveLength(5);
  });

  it("NEVER parses a thinking message — prose yields no sources (P0)", () => {
    expect(
      sourceNamesFromEvent("thinking", {
        node: "rag",
        status: "completed",
        message: "Retrieved 3 chunk(s) from: Paper A, Paper B, Paper C",
      }),
    ).toEqual([]);
  });

  it("returns [] for unknown events", () => {
    expect(sourceNamesFromEvent("token", { delta: "hi" })).toEqual([]);
  });
});
