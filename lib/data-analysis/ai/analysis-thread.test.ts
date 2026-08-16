import { describe, expect, it } from "vitest"

import {
  ANALYSIS_TURN_VERSION,
  approvalBlockedReason,
  canApprovePlan,
  markStalePlans,
  fromStoredThread,
  toStoredThread,
  setPlanStatus,
  toHistory,
  type AnalysisAssistantTurn,
  type AnalysisTurn,
} from "@/lib/data-analysis/ai/analysis-thread"
import type { SpecMutation } from "@/lib/data-analysis/spec/mutations"

const MUTATION = { kind: "chart.setYLog", value: true } as unknown as SpecMutation

function assistant(over: Partial<AnalysisAssistantTurn> = {}): AnalysisAssistantTurn {
  return {
    v: ANALYSIS_TURN_VERSION,
    id: "m2",
    role: "assistant",
    content: "Log the Y axis.",
    specHashAtProposal: "spec-1",
    createdAt: "2026-08-15T00:00:00.000Z",
    plan: {
      steps: ["Log the Y axis"],
      mutations: [MUTATION],
      rejected: [],
      clarificationNeeded: null,
      status: "proposed",
    },
    ...over,
  }
}

function user(content: string): AnalysisTurn {
  return {
    v: ANALYSIS_TURN_VERSION,
    id: "m1",
    role: "user",
    content,
    dataFileId: "file-1",
    specHash: "spec-1",
    createdAt: "2026-08-15T00:00:00.000Z",
  }
}

describe("canApprovePlan", () => {
  it("offers Approve for a fresh proposal against the spec it was computed on", () => {
    expect(canApprovePlan(assistant(), "spec-1")).toBe(true)
    expect(approvalBlockedReason(assistant(), "spec-1")).toBeNull()
  })

  it("withholds Approve when the assistant asked a question", () => {
    const turn = assistant({
      plan: { ...assistant().plan!, clarificationNeeded: "Which group is the control?" },
    })
    expect(canApprovePlan(turn, "spec-1")).toBe(false)
    expect(approvalBlockedReason(turn, "spec-1")).toMatch(/question/i)
  })

  it("withholds Approve when nothing survived validation", () => {
    const turn = assistant({ plan: { ...assistant().plan!, mutations: [] } })
    expect(canApprovePlan(turn, "spec-1")).toBe(false)
  })

  it("withholds Approve once the spec has moved — the whole point of specHashAtProposal", () => {
    expect(canApprovePlan(assistant(), "spec-2")).toBe(false)
    expect(approvalBlockedReason(assistant(), "spec-2")).toMatch(/changed after/i)
  })

  it("withholds Approve for a turn written by a newer format", () => {
    const turn = assistant({ v: ANALYSIS_TURN_VERSION + 1 })
    expect(canApprovePlan(turn, "spec-1")).toBe(false)
  })

  it("withholds Approve for a plan already decided", () => {
    const approved = assistant({ plan: { ...assistant().plan!, status: "approved" } })
    expect(canApprovePlan(approved, "spec-1")).toBe(false)
    expect(approvalBlockedReason(approved, "spec-1")).toBe("Applied.")
  })
})

describe("markStalePlans", () => {
  it("stales open plans when the spec moves and leaves decided ones alone", () => {
    const turns: AnalysisTurn[] = [
      assistant({ id: "open" }),
      assistant({ id: "done", plan: { ...assistant().plan!, status: "approved" } }),
    ]
    const next = markStalePlans(turns, "spec-2") as AnalysisAssistantTurn[]
    expect(next[0].plan!.status).toBe("stale")
    expect(next[1].plan!.status).toBe("approved")
  })

  it("returns the same array when nothing changed, so it is cheap to call often", () => {
    const turns: AnalysisTurn[] = [assistant()]
    expect(markStalePlans(turns, "spec-1")).toBe(turns)
  })
})

describe("setPlanStatus", () => {
  it("settles a proposed plan and refuses to re-settle a decided one", () => {
    const turns: AnalysisTurn[] = [assistant()]
    const approved = setPlanStatus(turns, "m2", "approved") as AnalysisAssistantTurn[]
    expect(approved[0].plan!.status).toBe("approved")
    const again = setPlanStatus(approved, "m2", "discarded") as AnalysisAssistantTurn[]
    expect(again[0].plan!.status).toBe("approved")
  })
})

describe("toHistory", () => {
  it("says what happened to each plan, so a discarded one is not proposed again", () => {
    const turns: AnalysisTurn[] = [
      user("log the y axis"),
      assistant({ plan: { ...assistant().plan!, status: "discarded" } }),
    ]
    const history = toHistory(turns)
    expect(history).toHaveLength(2)
    expect(history[0]).toEqual({ role: "user", content: "log the y axis" })
    expect(history[1].content).toContain("discarded")
  })

  it("drops failure turns and unreadable turns", () => {
    const turns: AnalysisTurn[] = [
      user("go"),
      assistant({ id: "boom", content: "", plan: null, error: "timed out" }),
      assistant({ id: "future", v: ANALYSIS_TURN_VERSION + 1 }),
    ]
    expect(toHistory(turns)).toEqual([{ role: "user", content: "go" }])
  })
})

describe("fromStoredThread", () => {
  it("round-trips a saved transcript", () => {
    const turns: AnalysisTurn[] = [user("log the y axis"), assistant()]
    expect(fromStoredThread(toStoredThread(turns))).toEqual(turns)
  })

  it("skips rows that are not turns instead of throwing on a corrupt revision", () => {
    expect(fromStoredThread([null, 7, {}, { role: "user" }, user("ok")])).toEqual([user("ok")])
    expect(fromStoredThread("not an array")).toEqual([])
  })

  it("never offers Approve on a reopened plan, whatever the current spec is", () => {
    const [restored] = fromStoredThread(toStoredThread([assistant()])) as AnalysisAssistantTurn[]
    expect(canApprovePlan(restored, "spec-1")).toBe(true) // same session token
    // …but a revision opened in a new session carries a token that cannot match.
    const [stale] = fromStoredThread([
      { ...assistant(), specHashAtProposal: "s-oldsession:4" },
    ]) as AnalysisAssistantTurn[]
    expect(canApprovePlan(stale, "s-newsession:1")).toBe(false)
  })
})
