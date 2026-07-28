import { describe, expect, it } from "vitest"

import {
  figureSpecReducer,
  type FigureSpecState,
} from "@/components/analysis/use-figure-spec"
import type { FigureSpec } from "@/types/analysis"

function makeSpec(): FigureSpec {
  return {
    data: [
      { type: "bar", name: "Control", marker: { color: "#0072B2" }, error_y: { visible: true } },
      { type: "bar", name: "Treated", marker: { color: "#D55E00" } },
    ],
    layout: {
      // Order matters below: `title` must stay between `showlegend` and `yaxis`.
      showlegend: true,
      xaxis: { title: { text: "Group" } },
      yaxis: { title: { text: "Signal" }, type: "linear" },
      shapes: [{ type: "line", visible: true }],
    },
    config: { displaylogo: false },
    meta: {
      template: "grouped_bar_sem_brackets",
      test_name: "One-way ANOVA",
      error_bar: "sem",
      n_per_group: { Control: 6, Treated: 6 },
      palette: ["#0072B2", "#D55E00"],
      alpha: 0.05,
      width_mm: 85,
      font_pt: 7,
    },
  }
}

const start = (spec: FigureSpec): FigureSpecState => ({ spec, past: [], future: [] })

describe("figureSpecReducer", () => {
  it("preserves key order when SET_PATH overwrites an existing key", () => {
    // The whole point: the JSON panel renders JSON.stringify(spec), so a
    // reordered object would reflow the text under the user's cursor.
    const before = makeSpec()
    const next = figureSpecReducer(start(before), {
      type: "SET_PATH",
      path: "/layout/yaxis/type",
      value: "log",
    })

    expect(Object.keys(next.spec.layout)).toEqual(Object.keys(before.layout))
    expect(Object.keys(next.spec.layout.yaxis as object)).toEqual(["title", "type"])
    expect(next.spec.layout.yaxis).toMatchObject({ type: "log" })
    // Untouched branches keep their identity, so Plotly's diff stays cheap.
    expect(next.spec.layout.xaxis).toBe(before.layout.xaxis)
    expect(next.spec.data).toBe(before.data)
  })

  it("creates missing intermediates and appends genuinely new keys last", () => {
    const before = makeSpec()
    const next = figureSpecReducer(start(before), {
      type: "SET_PATH",
      path: "/data/1/error_y/visible",
      value: false,
    })

    expect(next.spec.data[1]).toEqual({
      type: "bar",
      name: "Treated",
      marker: { color: "#D55E00" },
      error_y: { visible: false },
    })
    expect(Object.keys(next.spec.data[1])).toEqual(["type", "name", "marker", "error_y"])
    expect(next.spec.data[0]).toBe(before.data[0])
  })

  it("applies an RFC 6902 subset: replace, add and remove", () => {
    const next = figureSpecReducer(start(makeSpec()), {
      type: "APPLY_PATCH",
      ops: [
        { op: "replace", path: "/layout/showlegend", value: false },
        { op: "add", path: "/layout/shapes/-", value: { type: "line", visible: false } },
        { op: "remove", path: "/config/displaylogo" },
      ],
    })

    expect(next.spec.layout.showlegend).toBe(false)
    expect(next.spec.layout.shapes).toHaveLength(2)
    expect("displaylogo" in next.spec.config).toBe(false)
  })

  it("undoes and redoes, and never burns a slot on a no-op", () => {
    const before = start(makeSpec())
    const edited = figureSpecReducer(before, {
      type: "SET_PATH",
      path: "/layout/showlegend",
      value: false,
    })
    expect(edited.past).toHaveLength(1)

    // Removing a key that isn't there changes nothing — no undo entry.
    const noop = figureSpecReducer(edited, {
      type: "APPLY_PATCH",
      ops: [{ op: "remove", path: "/layout/nope" }],
    })
    expect(noop).toBe(edited)

    const undone = figureSpecReducer(edited, { type: "UNDO" })
    expect(undone.spec.layout.showlegend).toBe(true)
    expect(figureSpecReducer(undone, { type: "REDO" }).spec.layout.showlegend).toBe(false)
    expect(figureSpecReducer(before, { type: "UNDO" })).toBe(before)
  })

  it("bounds the undo stack at 50 entries", () => {
    let state = start(makeSpec())
    for (let i = 0; i < 70; i += 1) {
      state = figureSpecReducer(state, {
        type: "SET_PATH",
        path: "/layout/font/size",
        value: i,
      })
    }
    expect(state.past).toHaveLength(50)
  })
})
