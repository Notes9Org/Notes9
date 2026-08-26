/**
 * T0.28 — free-text and arrow annotations, by hand.
 *
 * These rendered and were promptable with zero hand controls. Each test here
 * takes the emitted mutation all the way onto a real spec, because a control
 * that emits a well-formed object the spec refuses is the same dead end as no
 * control at all.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { AnnotationsPanel, annotationId, newArrowAnnotation, newTextAnnotation } from "@/components/data-analysis/workspace/annotations-panel"
import { applyMutation, type SpecMutation } from "@/lib/data-analysis/spec/mutations"
import { parseSpec, type Annotation } from "@/lib/data-analysis/spec/analysis-spec"
import { baseSpec } from "./spec-fixture"

afterEach(cleanup)

function setup(annotations: Annotation[] = []) {
  const onMutate = vi.fn<(m: SpecMutation) => void>()
  render(<AnnotationsPanel annotations={annotations} origin={{ x: 12, y: 3.5 }} onMutate={onMutate} />)
  return { onMutate }
}

describe("annotationId", () => {
  it("stays inside the schema's 64-character cap", () => {
    expect(annotationId("text").length).toBeLessThanOrEqual(64)
  })

  it("does not need crypto.randomUUID", () => {
    const original = globalThis.crypto
    // Insecure origins and older Safari have no randomUUID; the control must
    // still work rather than throwing on click.
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true })
    try {
      expect(annotationId("arrow")).toMatch(/^arrow-/)
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true })
    }
  })
})

describe("new annotations are valid spec objects", () => {
  it("a text note parses", () => {
    const spec = { ...baseSpec(), figure: { ...baseSpec().figure, annotations: [newTextAnnotation(1, 2)] } }
    expect(parseSpec(spec).ok).toBe(true)
  })
  it("an arrow parses", () => {
    const spec = { ...baseSpec(), figure: { ...baseSpec().figure, annotations: [newArrowAnnotation(1, 2)] } }
    expect(parseSpec(spec).ok).toBe(true)
  })
})

describe("AnnotationsPanel reaches the spec", () => {
  it("Add text puts a note on figure.annotations at the data's midpoint", () => {
    const { onMutate } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Add text" }))

    const after = applyMutation(baseSpec(), onMutate.mock.calls[0][0])
    expect(after.figure.annotations).toHaveLength(1)
    // Data coordinates, not (0,0): a note at the origin lands off the side of
    // a plot of concentrations in the hundreds.
    expect(after.figure.annotations[0]).toMatchObject({ kind: "text", x: 12, y: 3.5 })
  })

  it("Add arrow puts an arrow on figure.annotations", () => {
    const { onMutate } = setup()
    fireEvent.click(screen.getByRole("button", { name: "Add arrow" }))

    const after = applyMutation(baseSpec(), onMutate.mock.calls[0][0])
    expect(after.figure.annotations[0]).toMatchObject({ kind: "arrow", x1: 12, y1: 3.5 })
  })

  it("edited text lands on the same annotation", () => {
    const note = newTextAnnotation(1, 2)
    const start = applyMutation(baseSpec(), { kind: "figure.addAnnotation", annotation: note })
    const { onMutate } = setup(start.figure.annotations)

    fireEvent.change(screen.getByLabelText("Annotation text"), { target: { value: "p < 0.001" } })

    const after = applyMutation(start, onMutate.mock.calls[0][0])
    expect(after.figure.annotations).toHaveLength(1)
    expect(after.figure.annotations[0]).toMatchObject({ id: note.id, text: "p < 0.001" })
  })

  it("a moved arrow endpoint lands on the spec", () => {
    const arrow = newArrowAnnotation(1, 2)
    const start = applyMutation(baseSpec(), { kind: "figure.addAnnotation", annotation: arrow })
    const { onMutate } = setup(start.figure.annotations)

    fireEvent.change(screen.getByLabelText("to y"), { target: { value: "9.5" } })

    const after = applyMutation(start, onMutate.mock.calls[0][0])
    expect(after.figure.annotations[0]).toMatchObject({ kind: "arrow", y2: 9.5 })
  })

  it("a half-typed number never reaches the spec", () => {
    const arrow = newArrowAnnotation(1, 2)
    const start = applyMutation(baseSpec(), { kind: "figure.addAnnotation", annotation: arrow })
    const { onMutate } = setup(start.figure.annotations)

    fireEvent.change(screen.getByLabelText("to x"), { target: { value: "" } })
    fireEvent.change(screen.getByLabelText("to x"), { target: { value: "-" } })

    // NaN in a coordinate makes the whole figure unparseable.
    expect(onMutate).not.toHaveBeenCalled()
  })

  it("Remove takes it back off", () => {
    const note = newTextAnnotation(1, 2)
    const start = applyMutation(baseSpec(), { kind: "figure.addAnnotation", annotation: note })
    const { onMutate } = setup(start.figure.annotations)

    fireEvent.click(screen.getByRole("button", { name: "Remove" }))

    const after = applyMutation(start, onMutate.mock.calls[0][0])
    expect(after.figure.annotations).toHaveLength(0)
  })
})
