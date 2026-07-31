import { describe, it, expect } from "vitest"
import { parseSpec, type AnalysisSpec } from "@/lib/data-analysis/spec/analysis-spec"
import {
  LAYOUT_PRESETS,
  addPanel,
  assignPanel,
  draftLayoutCaption,
  layoutFromPreset,
  layoutRowCount,
  movePanel,
  panelLabel,
  placePanels,
  removePanel,
  setPanelSpan,
} from "./figure-layout"

const preset = (id: string) => LAYOUT_PRESETS.find((p) => p.id === id)!

function spec(title: string): AnalysisSpec {
  const parsed = parseSpec({
    schemaVersion: 1,
    dataset: {
      fileId: null,
      fileName: "d.xlsx",
      sheet: null,
      versionHash: "sha256:a",
      rowCount: 3,
      columnCount: 2,
    },
    design: { source: "inferred" },
    analysis: { test: "none" },
    figure: { kind: "bar-scatter-error", x: {}, y: {}, errorBars: "sd", title },
    export: {},
  })
  if (!parsed.ok) throw new Error("fixture invalid")
  return parsed.spec
}

describe("layout presets", () => {
  it("builds a layout with one panel per preset slot", () => {
    for (const p of LAYOUT_PRESETS) {
      const layout = layoutFromPreset(p)
      expect(layout.panels).toHaveLength(p.spans.length)
      expect(layout.columns).toBe(p.columns)
    }
  })

  it("gives every panel a distinct id", () => {
    const layout = layoutFromPreset(preset("quad"))
    expect(new Set(layout.panels.map((x) => x.id)).size).toBe(4)
  })

  it("starts every panel unassigned", () => {
    for (const panel of layoutFromPreset(preset("quad")).panels) {
      expect(panel.pipelineId).toBeNull()
    }
  })
})

describe("panel placement", () => {
  it("fills a two-by-two grid without overlap", () => {
    const placements = placePanels(layoutFromPreset(preset("quad")))
    const cells = placements.map((p) => `${p.row},${p.column}`)
    expect(new Set(cells).size).toBe(4)
    expect(cells).toEqual(["1,1", "1,2", "2,1", "2,2"])
  })

  it("puts a full-width panel on its own row and the rest beneath", () => {
    // "Wide over two": A spans both columns, so B and C cannot share its row.
    const placements = placePanels(layoutFromPreset(preset("hero-top")))
    expect(placements[0]).toMatchObject({ row: 1, column: 1 })
    expect(placements[1]).toMatchObject({ row: 2, column: 1 })
    expect(placements[2]).toMatchObject({ row: 2, column: 2 })
  })

  it("flows around a panel that spans two rows", () => {
    // "Tall beside two": A occupies column 1 of rows 1 and 2.
    const placements = placePanels(layoutFromPreset(preset("hero-left")))
    expect(placements[0]).toMatchObject({ row: 1, column: 1 })
    expect(placements[1]).toMatchObject({ row: 1, column: 2 })
    expect(placements[2]).toMatchObject({ row: 2, column: 2 })
  })

  it("never places a panel outside the declared columns", () => {
    let layout = layoutFromPreset(preset("side-by-side"))
    // Ask for a span wider than the grid; it must be clamped, not overflow.
    layout = setPanelSpan(layout, layout.panels[0].id, { colSpan: 5 })
    for (const p of placePanels(layout)) {
      expect(p.column + p.panel.colSpan - 1).toBeLessThanOrEqual(layout.columns)
    }
  })

  it("reports the rows the grid actually needs", () => {
    expect(layoutRowCount(layoutFromPreset(preset("single")))).toBe(1)
    expect(layoutRowCount(layoutFromPreset(preset("quad")))).toBe(2)
    expect(layoutRowCount(layoutFromPreset(preset("hero-left")))).toBe(2)
    expect(layoutRowCount(layoutFromPreset(preset("six")))).toBe(2)
  })
})

describe("panel labels", () => {
  it("letters panels by position", () => {
    const layout = layoutFromPreset(preset("quad"))
    expect([0, 1, 2, 3].map((i) => panelLabel(layout, i))).toEqual(["A", "B", "C", "D"])
  })

  it("relabels after a reorder so the third panel is always C", () => {
    const layout = layoutFromPreset(preset("quad"))
    const moved = movePanel(layout, layout.panels[3].id, -3)
    // The panel that was D is now first, and therefore labelled A.
    expect(moved.panels[0].id).toBe(layout.panels[3].id)
    expect(panelLabel(moved, 0)).toBe("A")
  })

  it("honours the styles a journal might ask for", () => {
    const layout = layoutFromPreset(preset("side-by-side"))
    expect(panelLabel({ ...layout, labelStyle: "lower" }, 1)).toBe("b")
    expect(panelLabel({ ...layout, labelStyle: "numeric" }, 1)).toBe("2")
    expect(panelLabel({ ...layout, labelStyle: "none" }, 1)).toBe("")
  })

  it("lets an explicit override win", () => {
    const layout = layoutFromPreset(preset("side-by-side"))
    const withOverride = {
      ...layout,
      panels: layout.panels.map((p, i) => (i === 1 ? { ...p, labelOverride: "B'" } : p)),
    }
    expect(panelLabel(withOverride, 1)).toBe("B'")
  })
})

describe("editing a layout", () => {
  it("binds a panel to a pipeline", () => {
    const layout = layoutFromPreset(preset("side-by-side"))
    const bound = assignPanel(layout, layout.panels[0].id, "pipe-1")
    expect(bound.panels[0].pipelineId).toBe("pipe-1")
    expect(bound.panels[1].pipelineId).toBeNull()
  })

  it("adds panels without disturbing the existing ones", () => {
    const layout = assignPanel(
      layoutFromPreset(preset("single")),
      layoutFromPreset(preset("single")).panels[0].id,
      "x"
    )
    const grown = addPanel(layout)
    expect(grown.panels).toHaveLength(2)
    expect(grown.panels[0]).toEqual(layout.panels[0])
  })

  it("refuses to remove the last panel", () => {
    // An empty canvas has no affordance to add the first panel back.
    const layout = layoutFromPreset(preset("single"))
    expect(removePanel(layout, layout.panels[0].id).panels).toHaveLength(1)
  })

  it("removes a panel when others remain", () => {
    const layout = layoutFromPreset(preset("quad"))
    expect(removePanel(layout, layout.panels[1].id).panels).toHaveLength(3)
  })

  it("clamps a span rather than letting it break the grid", () => {
    const layout = layoutFromPreset(preset("side-by-side"))
    const wide = setPanelSpan(layout, layout.panels[0].id, { colSpan: 99, rowSpan: 99 })
    expect(wide.panels[0].colSpan).toBe(2)
    expect(wide.panels[0].rowSpan).toBe(4)
  })

  it("keeps a move inside the list", () => {
    const layout = layoutFromPreset(preset("quad"))
    const first = layout.panels[0].id
    expect(movePanel(layout, first, -5).panels[0].id).toBe(first)
    expect(movePanel(layout, first, 99).panels[3].id).toBe(first)
  })
})

describe("caption", () => {
  it("names each bound panel by its letter", () => {
    let layout = layoutFromPreset(preset("side-by-side"))
    layout = assignPanel(layout, layout.panels[0].id, "p1")
    layout = assignPanel(layout, layout.panels[1].id, "p2")
    const caption = draftLayoutCaption(layout, {
      p1: { spec: spec("Viability at 48 h"), name: "Viability" },
      p2: { spec: spec("Dose response"), name: "Dose" },
    })
    expect(caption).toBe("(A) Viability at 48 h. (B) Dose response.")
  })

  it("skips panels nothing is assigned to", () => {
    let layout = layoutFromPreset(preset("side-by-side"))
    layout = assignPanel(layout, layout.panels[0].id, "p1")
    const caption = draftLayoutCaption(layout, { p1: { spec: spec("Only one"), name: "One" } })
    expect(caption).toBe("(A) Only one.")
  })

  it("carries the figure's own title", () => {
    let layout = { ...layoutFromPreset(preset("single")), title: "Figure 2" }
    layout = assignPanel(layout, layout.panels[0].id, "p1")
    const caption = draftLayoutCaption(layout, { p1: { spec: spec("Growth"), name: "G" } })
    expect(caption.startsWith("Figure 2. ")).toBe(true)
  })

  it("returns nothing when no panel is bound", () => {
    expect(draftLayoutCaption(layoutFromPreset(preset("quad")), {})).toBe("")
  })
})
