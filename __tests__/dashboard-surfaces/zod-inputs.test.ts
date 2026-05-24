import { describe, it, expect } from "vitest"
import {
  WhiteboardNoteCreateInput,
  WhiteboardNoteUpdatePositionInput,
} from "@/lib/whiteboard-notes"
import {
  CalendarEventCreateInput,
  CalendarEventUpdateInput,
} from "@/lib/calendar-events"

const VALID_UUID = "123e4567-e89b-12d3-a456-426614174000"
const START = "2026-05-22T09:00:00.000Z"
const END_AFTER = "2026-05-22T10:00:00.000Z"
const END_BEFORE = "2026-05-22T08:00:00.000Z"

// ---------------------------------------------------------------------------
// WhiteboardNoteCreateInput
// ---------------------------------------------------------------------------
describe("WhiteboardNoteCreateInput", () => {
  it("should accept minimal { x, y } and fill defaults", () => {
    const r = WhiteboardNoteCreateInput.safeParse({ x: 24, y: 24 })
    expect(r.success).toBe(true)
  })

  it("should reject kind that is not in the enum", () => {
    const r = WhiteboardNoteCreateInput.safeParse({ kind: "mango" })
    expect(r.success).toBe(false)
  })

  it("should reject negative x coordinate", () => {
    const r = WhiteboardNoteCreateInput.safeParse({ x: -1, y: 24 })
    expect(r.success).toBe(false)
  })

  it("should reject negative y coordinate", () => {
    const r = WhiteboardNoteCreateInput.safeParse({ x: 24, y: -1 })
    expect(r.success).toBe(false)
  })

  it("should reject body longer than 4000 chars", () => {
    const r = WhiteboardNoteCreateInput.safeParse({ body: "a".repeat(5000) })
    expect(r.success).toBe(false)
  })

  it("should accept projectId as null", () => {
    const r = WhiteboardNoteCreateInput.safeParse({ projectId: null })
    expect(r.success).toBe(true)
  })

  it("should accept projectId as undefined (omitted)", () => {
    const r = WhiteboardNoteCreateInput.safeParse({})
    expect(r.success).toBe(true)
  })

  it("should accept projectId as a valid uuid", () => {
    const r = WhiteboardNoteCreateInput.safeParse({ projectId: VALID_UUID })
    expect(r.success).toBe(true)
  })

  it("should reject projectId that is not a uuid", () => {
    const r = WhiteboardNoteCreateInput.safeParse({ projectId: "not-a-uuid" })
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// WhiteboardNoteUpdatePositionInput
// ---------------------------------------------------------------------------
describe("WhiteboardNoteUpdatePositionInput", () => {
  it("should require id to be a uuid and reject short strings", () => {
    const r = WhiteboardNoteUpdatePositionInput.safeParse({ id: "abc", x: 0, y: 0 })
    expect(r.success).toBe(false)
  })

  it("should reject negative x", () => {
    const r = WhiteboardNoteUpdatePositionInput.safeParse({ id: VALID_UUID, x: -5, y: 0 })
    expect(r.success).toBe(false)
  })

  it("should reject negative y", () => {
    const r = WhiteboardNoteUpdatePositionInput.safeParse({ id: VALID_UUID, x: 0, y: -5 })
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CalendarEventCreateInput
// ---------------------------------------------------------------------------
describe("CalendarEventCreateInput", () => {
  it("should accept minimal { title, startAt }", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "Lab meeting", startAt: START })
    expect(r.success).toBe(true)
  })

  it("should reject empty title", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "", startAt: START })
    expect(r.success).toBe(false)
  })

  it("should reject title longer than 255 chars", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "x".repeat(300), startAt: START })
    expect(r.success).toBe(false)
  })

  it("should reject endAt that is before startAt", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "T", startAt: START, endAt: END_BEFORE })
    expect(r.success).toBe(false)
  })

  it("should accept endAt equal to startAt", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "T", startAt: START, endAt: START })
    expect(r.success).toBe(true)
  })

  it.each(["ink", "leaf", "accent", "warning"] as const)(
    "should accept valid tone %s",
    (tone) => {
      const r = CalendarEventCreateInput.safeParse({ title: "T", startAt: START, tone })
      expect(r.success).toBe(true)
    }
  )

  it("should reject an invalid tone", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "T", startAt: START, tone: "neon" })
    expect(r.success).toBe(false)
  })

  it("should accept valid uuid for projectId", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "T", startAt: START, projectId: VALID_UUID })
    expect(r.success).toBe(true)
  })

  it("should reject non-uuid projectId", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "T", startAt: START, projectId: "bad" })
    expect(r.success).toBe(false)
  })

  it("should accept valid uuid for experimentId", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "T", startAt: START, experimentId: VALID_UUID })
    expect(r.success).toBe(true)
  })

  it("should reject non-uuid experimentId", () => {
    const r = CalendarEventCreateInput.safeParse({ title: "T", startAt: START, experimentId: "bad" })
    expect(r.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CalendarEventUpdateInput
// ---------------------------------------------------------------------------
describe("CalendarEventUpdateInput", () => {
  it("should require id to be a uuid", () => {
    const r = CalendarEventUpdateInput.safeParse({ id: "not-a-uuid" })
    expect(r.success).toBe(false)
  })

  it("should accept id-only update (all optional fields omitted)", () => {
    const r = CalendarEventUpdateInput.safeParse({ id: VALID_UUID })
    expect(r.success).toBe(true)
  })

  it("should accept a subset of optional fields alongside id", () => {
    const r = CalendarEventUpdateInput.safeParse({ id: VALID_UUID, title: "New title", tone: "leaf" })
    expect(r.success).toBe(true)
  })

  it("should reject done as a string value", () => {
    const r = CalendarEventUpdateInput.safeParse({ id: VALID_UUID, done: "yes" })
    expect(r.success).toBe(false)
  })
})
