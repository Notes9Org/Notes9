import { describe, it, expect } from "vitest"
import { isComposerBlocked } from "./composer-gate"

describe("isComposerBlocked", () => {
  it("does not block a page that stated no requirement", () => {
    expect(isComposerBlocked(null, 0, 0)).toBe(false)
  })

  it("blocks when a requirement is stated and nothing is attached", () => {
    expect(isComposerBlocked("Import a data file first.", 0, 0)).toBe(true)
  })

  it("lifts the block once a file is attached — an attachment IS a dataset", () => {
    expect(isComposerBlocked("Import a data file first.", 1, 0)).toBe(false)
  })

  it("lifts the block while a file is still uploading, so it cannot flicker", () => {
    expect(isComposerBlocked("Import a data file first.", 0, 1)).toBe(false)
  })
})
