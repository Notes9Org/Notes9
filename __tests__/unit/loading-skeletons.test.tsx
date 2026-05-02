import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"

import DashboardLoading from "@/app/(app)/dashboard/loading"
import ProjectsLoading from "@/app/(app)/projects/loading"
import ExperimentsLoading from "@/app/(app)/experiments/loading"
import SamplesLoading from "@/app/(app)/samples/loading"
import EquipmentLoading from "@/app/(app)/equipment/loading"
import ProtocolsLoading from "@/app/(app)/protocols/loading"
import LabNotesLoading from "@/app/(app)/lab-notes/loading"
import LiteratureReviewsLoading from "@/app/(app)/literature-reviews/loading"
import PapersLoading from "@/app/(app)/papers/loading"

describe("Skeleton loading components", () => {
  it("DashboardLoading renders animate-pulse skeleton", () => {
    const { container } = render(<DashboardLoading />)
    const pulseEl = container.querySelector(".animate-pulse")
    expect(pulseEl).toBeInTheDocument()
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-slot="card"]').length).toBeGreaterThan(0)
    const roundedBlocks = container.querySelectorAll(".rounded-md")
    expect(roundedBlocks.length).toBeGreaterThan(0)
  })

  it("ProjectsLoading renders animate-pulse table skeleton", () => {
    const { container } = render(<ProjectsLoading />)
    const pulseEl = container.querySelector(".animate-pulse")
    expect(pulseEl).toBeInTheDocument()
    const mutedBlocks = container.querySelectorAll(".bg-muted")
    expect(mutedBlocks.length).toBeGreaterThan(0)
    // Table skeleton has border rows
    const borderRows = container.querySelectorAll(".border-b")
    expect(borderRows.length).toBeGreaterThanOrEqual(3)
  })

  it("ExperimentsLoading renders animate-pulse table skeleton", () => {
    const { container } = render(<ExperimentsLoading />)
    const pulseEl = container.querySelector(".animate-pulse")
    expect(pulseEl).toBeInTheDocument()
    const borderRows = container.querySelectorAll(".border-b")
    expect(borderRows.length).toBeGreaterThanOrEqual(3)
  })

  it("SamplesLoading renders animate-pulse table skeleton", () => {
    const { container } = render(<SamplesLoading />)
    const pulseEl = container.querySelector(".animate-pulse")
    expect(pulseEl).toBeInTheDocument()
    const borderRows = container.querySelectorAll(".border-b")
    expect(borderRows.length).toBeGreaterThanOrEqual(3)
  })

  it("EquipmentLoading renders animate-pulse table skeleton", () => {
    const { container } = render(<EquipmentLoading />)
    const pulseEl = container.querySelector(".animate-pulse")
    expect(pulseEl).toBeInTheDocument()
    const borderRows = container.querySelectorAll(".border-b")
    expect(borderRows.length).toBeGreaterThanOrEqual(3)
  })

  it("ProtocolsLoading renders animate-pulse table skeleton", () => {
    const { container } = render(<ProtocolsLoading />)
    const pulseEl = container.querySelector(".animate-pulse")
    expect(pulseEl).toBeInTheDocument()
    const borderRows = container.querySelectorAll(".border-b")
    expect(borderRows.length).toBeGreaterThanOrEqual(3)
  })

  it("LabNotesLoading renders animate-pulse table skeleton", () => {
    const { container } = render(<LabNotesLoading />)
    const pulseEl = container.querySelector(".animate-pulse")
    expect(pulseEl).toBeInTheDocument()
    const borderRows = container.querySelectorAll(".border-b")
    expect(borderRows.length).toBeGreaterThanOrEqual(3)
  })

  it("LiteratureReviewsLoading renders animate-pulse skeleton with header and tabs", () => {
    const { container } = render(<LiteratureReviewsLoading />)
    const pulseEl = container.querySelector(".animate-pulse")
    expect(pulseEl).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-slot="skeleton"], [class*="bg-muted"]').length,
    ).toBeGreaterThan(0)
  })

  it("PapersLoading renders animate-pulse table skeleton", () => {
    const { container } = render(<PapersLoading />)
    const pulseEl = container.querySelector(".animate-pulse")
    expect(pulseEl).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-slot="skeleton"], [class*="bg-muted"]').length,
    ).toBeGreaterThan(0)
  })
})
