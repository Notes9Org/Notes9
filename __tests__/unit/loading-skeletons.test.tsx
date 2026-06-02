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
  it("DashboardLoading matches lab overview (greeting, composer, 3 cards)", () => {
    const { container } = render(<DashboardLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".xl\\:col-span-4")).toBeInTheDocument()
    expect(container.querySelector(".xl\\:col-span-5")).toBeInTheDocument()
    expect(container.querySelector(".xl\\:col-span-3")).toBeInTheDocument()
    expect(container.querySelector(".min-h-\\[132px\\]")).toBeInTheDocument()
  })

  it("PlannerLoading has composer and bench", () => {
    const { container } = render(<PlannerLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".xl\\:col-span-5")).toBeInTheDocument()
    expect(container.querySelector(".xl\\:col-span-7")).toBeInTheDocument()
    expect(container.querySelector(".min-h-\\[132px\\]")).toBeInTheDocument()
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

  it("PapersLoading renders composer and workspace split", () => {
    const { container } = render(<PapersLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[112px\\]")).toBeInTheDocument()
    expect(container.querySelector(".lg\\:grid-cols-\\[minmax\\(0\\,280px\\)_1fr\\]")).toBeInTheDocument()
  })

  it("ReportsLoading renders composer and table", () => {
    const { container } = render(<ReportsLoading />)
    expectPulseSkeleton(container)
    expect(container.querySelector(".min-h-\\[112px\\]")).toBeInTheDocument()
  })
})
