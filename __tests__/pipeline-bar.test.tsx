import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { PipelineBar } from "@/components/data-analysis/pipeline-bar"
import type { PrepOffer } from "@/lib/data-analysis/workspace/prep-offers"

afterEach(cleanup)

const offer: PrepOffer = {
  id: "log10:signal",
  kind: "log10",
  summary: '"signal" is strongly right-tailed — take log10',
  evidence: "A pre-flight scan puts \"signal\" past the conventional skew cut.",
  apply: [{ kind: "data.addTransform", transform: { kind: "log10", column: "signal" } }],
}

function noop() {}

describe("PipelineBar", () => {
  it("renders nothing when there is no pipeline state and no offer", () => {
    const { container } = render(
      <PipelineBar
        filters={[]}
        transforms={[]}
        exclusions={[]}
        onSetFilters={noop}
        onRemoveTransform={noop}
        onRestoreRow={noop}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders an offer chip and dispatches exactly the offer's mutations on accept, nothing else", () => {
    const onAcceptOffer = vi.fn()
    render(
      <PipelineBar
        filters={[]}
        transforms={[]}
        exclusions={[]}
        offers={[offer]}
        onSetFilters={noop}
        onRemoveTransform={noop}
        onRestoreRow={noop}
        onAcceptOffer={onAcceptOffer}
      />
    )
    const chip = screen.getByRole("button", { name: /apply:.*signal/i })
    fireEvent.click(chip)
    expect(onAcceptOffer).toHaveBeenCalledTimes(1)
    expect(onAcceptOffer).toHaveBeenCalledWith(offer)
  })

  it("does not render offers when there is no handler to accept them", () => {
    render(
      <PipelineBar
        filters={[]}
        transforms={[]}
        exclusions={[]}
        offers={[offer]}
        onSetFilters={noop}
        onRemoveTransform={noop}
        onRestoreRow={noop}
      />
    )
    expect(screen.queryByRole("button", { name: /apply:/i })).toBeNull()
  })

  it("renders a filter chip and removes only that filter on click", () => {
    const onSetFilters = vi.fn()
    const filters = [
      { column: "group", op: "eq" as const, value: "A" },
      { column: "batch", op: "eq" as const, value: "1" },
    ]
    render(
      <PipelineBar
        filters={filters}
        transforms={[]}
        exclusions={[]}
        onSetFilters={onSetFilters}
        onRemoveTransform={noop}
        onRestoreRow={noop}
      />
    )
    const removeButtons = screen.getAllByRole("button", { name: /remove filter/i })
    fireEvent.click(removeButtons[0])
    expect(onSetFilters).toHaveBeenCalledTimes(1)
    expect(onSetFilters).toHaveBeenCalledWith([filters[1]])
  })
})
