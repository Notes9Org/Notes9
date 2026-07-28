import { describe, expect, it } from "vitest"
import { deriveTableType } from "@/components/analysis/data/table-type-chip"
import { detectDtype } from "@/components/analysis/data/column-role-grid"

/**
 * The table type is derived, not chosen — if this rule drifts, the Data section
 * silently mislabels the analysis shape. One case per branch, plus the
 * precedence pairs that would break if the order were rearranged.
 */
describe("deriveTableType", () => {
  it("maps one measurement + one group to a column table", () => {
    expect(deriveTableType(["measurement", "group"])).toBe("column")
  })

  it("maps one measurement + two groups to a grouped table", () => {
    expect(deriveTableType(["measurement", "group", "group"])).toBe("grouped")
  })

  it("maps a continuous X against a measurement to an xy table", () => {
    expect(deriveTableType(["x", "measurement"])).toBe("xy")
  })

  it("maps two categoricals with nothing measured to a contingency table", () => {
    expect(deriveTableType(["group", "group"])).toBe("contingency")
  })

  it("maps time + event to a survival table", () => {
    expect(deriveTableType(["time", "event", "group"])).toBe("survival")
  })

  it("maps subjects nested inside groups to a nested table", () => {
    expect(deriveTableType(["measurement", "group", "subject"])).toBe("nested")
  })

  it("prefers survival over xy when both sets of roles are present", () => {
    expect(deriveTableType(["time", "event", "x", "measurement"])).toBe("survival")
  })

  it("prefers nested over grouped when a subject column is assigned", () => {
    expect(deriveTableType(["measurement", "group", "group", "subject"])).toBe("nested")
  })

  it("returns null when the roles describe no analysable shape", () => {
    expect(deriveTableType([])).toBeNull()
    expect(deriveTableType(["ignore", "ignore"])).toBeNull()
    expect(deriveTableType(["measurement"])).toBeNull()
  })
})

describe("detectDtype", () => {
  it("ignores blanks when deciding a column is numeric", () => {
    expect(detectDtype(["1", "", "2.5", null, "  "])).toBe("number")
  })

  it("does not read a bare number as a date", () => {
    expect(detectDtype(["2024", "2025"])).toBe("number")
  })

  it("reads separated date strings as dates", () => {
    expect(detectDtype(["2024-01-02", "2024-03-04"])).toBe("date")
  })

  it("reads yes/no as boolean and anything else as text", () => {
    expect(detectDtype(["yes", "no", "TRUE"])).toBe("boolean")
    expect(detectDtype(["ctrl", "dose A"])).toBe("text")
    expect(detectDtype([])).toBe("text")
  })
})
