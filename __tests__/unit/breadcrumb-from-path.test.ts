import { describe, expect, it } from "vitest"
import {
  buildBreadcrumbsFromPathname,
  resolveHeaderBreadcrumbs,
} from "@/lib/breadcrumb-from-path"
import type { BreadcrumbSegment } from "@/components/layout/breadcrumb-context"

// The builder now enriches crumbs with an `icon` field for the header UI.
// These tests assert label/href routing only, so we strip the icon before
// comparison rather than asserting on the icon implementation detail.
function stripIcons(crumbs: BreadcrumbSegment[]): BreadcrumbSegment[] {
  return crumbs.map(({ icon: _icon, ...rest }) => rest)
}

describe("buildBreadcrumbsFromPathname", () => {
  it("shows Dashboard on the home route", () => {
    expect(stripIcons(buildBreadcrumbsFromPathname("/dashboard"))).toEqual([
      { label: "Dashboard" },
    ])
  })

  it("builds section and new-page crumbs", () => {
    expect(stripIcons(buildBreadcrumbsFromPathname("/projects/new"))).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "New Project" },
    ])
  })

  it("prepends Dashboard when opened from dashboard quick actions", () => {
    const params = new URLSearchParams("from=dashboard")
    expect(stripIcons(buildBreadcrumbsFromPathname("/projects/new", params))).toEqual([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Projects", href: "/projects" },
      { label: "New Project" },
    ])
  })

  it("builds detail-page placeholder crumbs", () => {
    expect(
      stripIcons(buildBreadcrumbsFromPathname(
        "/projects/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      )),
    ).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Project" },
    ])
  })

  it("builds protocols and samples list crumbs", () => {
    expect(stripIcons(buildBreadcrumbsFromPathname("/protocols"))).toEqual([
      { label: "Protocols" },
    ])
    expect(stripIcons(buildBreadcrumbsFromPathname("/samples"))).toEqual([
      { label: "Samples" },
    ])
  })

  it("adds project scope to protocols list crumbs", () => {
    const projectId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    const params = new URLSearchParams(`project=${projectId}`)
    expect(
      stripIcons(buildBreadcrumbsFromPathname("/protocols", params, {
        projectId,
        projectName: "Cell Study",
      })),
    ).toEqual([
      { label: "Projects", href: "/projects" },
      { label: "Cell Study", href: `/projects/${projectId}` },
      { label: "Protocols" },
    ])
  })

  it("prepends Dashboard to page crumbs when auto has dashboard", () => {
    const auto = buildBreadcrumbsFromPathname(
      "/protocols/new",
      new URLSearchParams("from=dashboard"),
    )
    const page = [
      { label: "Protocols", href: "/protocols" },
      { label: "New Protocol" },
    ]
    expect(stripIcons(resolveHeaderBreadcrumbs(auto, page))).toEqual([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Protocols", href: "/protocols" },
      { label: "New Protocol" },
    ])
  })
})
