import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"

import DashboardLoading from "@/app/(app)/dashboard/loading"
import PlannerLoading from "@/app/(app)/dashboard/loading"
import ProjectsLoading from "@/app/(app)/projects/loading"
import ProjectDetailLoading from "@/app/(app)/projects/[id]/loading"
import ExperimentsLoading from "@/app/(app)/experiments/loading"
import SamplesLoading from "@/app/(app)/samples/loading"
import EquipmentLoading from "@/app/(app)/equipment/loading"
import ProtocolsLoading from "@/app/(app)/protocols/loading"
import LabNotesLoading from "@/app/(app)/lab-notes/loading"
import LiteratureReviewsLoading from "@/app/(app)/literature-reviews/loading"
import PapersLoading from "@/app/(app)/papers/loading"
import ReportsLoading from "@/app/(app)/reports/loading"

function expectPulseSkeleton(container: HTMLElement) {
  expect(container.querySelector(".animate-pulse")).toBeInTheDocument()
  expect(container.querySelectorAll(".bg-muted").length).toBeGreaterThan(0)
}

describe("Skeleton loading components", () => {
  it("DashboardLoading matches lab overview (masthead, composer, 2x2 card grid)", () => {
    const { container } = render(<DashboardLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[132px\\]")).toBeInTheDocument()
    expect(container.querySelector(".xl\\:grid-cols-2")).toBeInTheDocument()
    expect(container.querySelectorAll(".bg-card").length).toBeGreaterThanOrEqual(4)
  })

  // PlannerLoading resolves to the dashboard loading route (there is no
  // separate planner route). The dashboard loading now renders the lab grid
  // skeleton (masthead + composer + 2x2 card grid), so we assert that layout.
  it("PlannerLoading renders masthead, composer, and lab grid", () => {
    const { container } = render(<PlannerLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[132px\\]")).toBeInTheDocument()
    expect(container.querySelector(".xl\\:grid-cols-2")).toBeInTheDocument()
    expect(container.querySelectorAll(".bg-card").length).toBeGreaterThanOrEqual(4)
  })

  it("ProjectsLoading has composer and table", () => {
    const { container } = render(<ProjectsLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[112px\\]")).toBeInTheDocument()
    expect(container.querySelectorAll(".border-b").length).toBeGreaterThanOrEqual(3)
  })

  it("ProjectDetailLoading has picker row, composer, and 8-card grid", () => {
    const { container } = render(<ProjectDetailLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelectorAll(".lg\\:grid-cols-4").length).toBe(2)
    expect(container.querySelector(".min-h-\\[132px\\]")).toBeInTheDocument()
  })

  it("ExperimentsLoading has composer and table rows", () => {
    const { container } = render(<ExperimentsLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[112px\\]")).toBeInTheDocument()
    expect(container.querySelectorAll(".border-b").length).toBeGreaterThanOrEqual(3)
  })

  it("SamplesLoading renders table skeleton", () => {
    const { container } = render(<SamplesLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelectorAll(".border-b").length).toBeGreaterThanOrEqual(3)
  })

  it("EquipmentLoading renders status cards and table (no composer)", () => {
    const { container } = render(<EquipmentLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[112px\\]")).not.toBeInTheDocument()
    expect(container.querySelectorAll(".md\\:grid-cols-4").length).toBeGreaterThanOrEqual(1)
    expect(container.querySelectorAll(".border-b").length).toBeGreaterThanOrEqual(3)
  })

  it("ProtocolsLoading renders composer and table", () => {
    const { container } = render(<ProtocolsLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[112px\\]")).toBeInTheDocument()
  })

  it("LabNotesLoading renders composer and table", () => {
    const { container } = render(<LabNotesLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[112px\\]")).toBeInTheDocument()
  })

  it("LiteratureReviewsLoading has tabs and cards", () => {
    const { container } = render(<LiteratureReviewsLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelectorAll(".rounded-xl").length).toBeGreaterThanOrEqual(3)
  })

  // Papers now uses the shared Catalyst list-page skeleton (composer +
  // toolbar + filter + table), not the old workspace split.
  it("PapersLoading renders composer and table", () => {
    const { container } = render(<PapersLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[112px\\]")).toBeInTheDocument()
    expect(container.querySelectorAll(".border-b").length).toBeGreaterThanOrEqual(3)
  })

  it("ReportsLoading renders composer and table", () => {
    const { container } = render(<ReportsLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[112px\\]")).toBeInTheDocument()
  })
})
