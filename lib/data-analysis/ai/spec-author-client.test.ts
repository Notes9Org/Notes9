import { describe, it, expect, vi, afterEach } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import type { Table } from "@/lib/data-analysis/engine/resolver"
import { requestSpecPatch } from "./spec-author-client"

function spec(): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "plate.xlsx",
      sheet: null,
      versionHash: "sha256:abcd1234",
      rowCount: 24,
      columnCount: 3,
    },
    design: { source: "project-record", paired: true },
    analysis: { test: "t-paired", groupColumn: "treatment", responseColumns: ["viability"] },
    figure: { kind: "bar-scatter-error", x: {}, y: {} },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

const table: Table = {
  columns: ["treatment", "viability"],
  rows: [
    { rowId: "r1", values: { treatment: "vehicle", viability: 91 } },
    { rowId: "r2", values: { treatment: "drug", viability: 63 } },
  ],
}

/** Real `Response`, so `.json()` fails on non-JSON exactly as it does in a browser. */
function reply(body: string, status = 200) {
  const fetchMock = vi.fn(async () => new Response(body, { status }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const ask = (prompt = "compare viability across treatments", signal?: AbortSignal) =>
  requestSpecPatch({ prompt, spec: spec(), table, signal })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("requestSpecPatch, wire contract", () => {
  it("posts prompt, spec and table to the seam route", async () => {
    const fetchMock = reply(
      JSON.stringify({ rationale: "", mutations: [], clarificationNeeded: null, rejected: [] })
    )

    await ask("make the y axis log scale")

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/data-analysis/spec-author")
    expect(init.method).toBe("POST")
    const sent = JSON.parse(String(init.body))
    expect(sent.prompt).toBe("make the y axis log scale")
    expect(sent.spec.analysis.test).toBe("t-paired")
    expect(sent.table.rows).toHaveLength(2)
  })

  it("returns a patch, with the success discriminant the route omits", async () => {
    reply(
      JSON.stringify({
        rationale: "Unpaired is the right test for two independent groups.",
        mutations: [{ kind: "analysis.setTest", value: "t-unpaired" }],
        clarificationNeeded: null,
        rejected: [],
      })
    )

    const out = await ask()
    expect(out).toEqual({
      outcome: "patch",
      rationale: "Unpaired is the right test for two independent groups.",
      mutations: [{ kind: "analysis.setTest", value: "t-unpaired" }],
      clarificationNeeded: null,
      rejected: [],
    })
  })

  it("carries rejected mutations and clarifications through untouched", async () => {
    reply(
      JSON.stringify({
        rationale: "",
        mutations: [],
        clarificationNeeded: "Which column holds the dose?",
        rejected: [{ mutation: { kind: "analysis.setTest", value: "anova-rm" }, reason: "not supported" }],
      })
    )

    const out = await ask()
    if (out.outcome !== "patch") throw new Error(`expected a patch, got ${out.outcome}`)
    expect(out.clarificationNeeded).toBe("Which column holds the dose?")
    expect(out.rejected).toEqual([
      { mutation: { kind: "analysis.setTest", value: "anova-rm" }, reason: "not supported" },
    ])
  })
})

describe("requestSpecPatch, the route's own failures", () => {
  it("surfaces a screened request as refused, with the alternative", async () => {
    reply(
      JSON.stringify({
        outcome: "refused",
        reason: "That is p-hacking.",
        alternative: "Run a sensitivity analysis instead.",
      })
    )

    expect(await ask("make it significant")).toEqual({
      outcome: "refused",
      reason: "That is p-hacking.",
      alternative: "Run a sensitivity analysis instead.",
    })
  })

  it("surfaces the no-table 400 as its own case, not a generic error", async () => {
    reply(JSON.stringify({ outcome: "no-table", reason: "Select a data range first." }), 400)

    expect(await ask()).toEqual({ outcome: "no-table", reason: "Select a data range first." })
  })

  it("surfaces a bad request", async () => {
    reply(JSON.stringify({ outcome: "bad-request", reason: "A prompt is required." }), 400)

    expect(await ask("")).toEqual({ outcome: "bad-request", reason: "A prompt is required." })
  })

  it("surfaces Catalyst being unavailable", async () => {
    reply(JSON.stringify({ outcome: "unavailable", reason: "not configured" }), 503)

    expect(await ask()).toEqual({ outcome: "unavailable", reason: "not configured" })
  })

  it("reads the 401, which reports `error` rather than `outcome`", async () => {
    reply(JSON.stringify({ error: "Unauthorized" }), 401)

    expect(await ask()).toEqual({ outcome: "unauthorized", reason: "Unauthorized" })
  })
})

describe("requestSpecPatch, failures the route never sees", () => {
  it("turns an HTML 500 from a gateway into a typed error, not a parse crash", async () => {
    reply("<html><body>502 Bad Gateway</body></html>", 500)

    const out = await ask()
    expect(out.outcome).toBe("error")
    if (out.outcome !== "error") throw new Error("unreachable")
    expect(out.reason).toContain("500")
  })

  it("turns a dropped connection into a typed error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch")
      })
    )

    const out = await ask()
    expect(out.outcome).toBe("error")
    if (out.outcome !== "error") throw new Error("unreachable")
    expect(out.reason).toContain("analysis is unaffected")
  })

  it("reports an aborted request as aborted, so a superseded call stays silent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
            })
          })
      )
    )

    const controller = new AbortController()
    const pending = ask("compare the groups", controller.signal)
    controller.abort()

    expect(await pending).toEqual({ outcome: "aborted" })
  })
})
