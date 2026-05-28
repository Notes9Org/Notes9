import type { BreadcrumbSegment } from "@/components/layout/breadcrumb-context"
import {
  FROM_DASHBOARD_PARAM,
  FROM_DASHBOARD_VALUE,
} from "@/lib/from-dashboard"
import { isLikelyUuid } from "@/lib/url-project-param"
import {
  LayoutDashboard, Folder, FlaskConical, Microscope, FileText, 
  TestTube, BookOpen, PenTool, Notebook, Settings, BarChart, 
  Sparkles, Database, Building, Map
} from "lucide-react"

type RouteCrumbConfig = {
  path: string
  title: string
  icon?: React.ElementType
  newLabel?: string
  detailLabel?: string
  children?: Record<string, { label: string; newLabel?: string }>
}

export const APP_ROUTE_CRUMBS: RouteCrumbConfig[] = [
  { path: "/literature-reviews", title: "Literature", icon: BookOpen, newLabel: "New Review", detailLabel: "Review" },
  { path: "/research-map", title: "Research map", icon: Map },
  { path: "/lab-notes", title: "Lab Notes", icon: Notebook, detailLabel: "Lab Note" },
  { path: "/dashboard", title: "Dashboard", icon: LayoutDashboard },
  { path: "/experiments", title: "Experiments", icon: FlaskConical, newLabel: "New Experiment", detailLabel: "Experiment" },
  { path: "/equipment", title: "Equipment", icon: Microscope, newLabel: "New Equipment", detailLabel: "Equipment" },
  { path: "/protocols", title: "Protocols", icon: FileText, newLabel: "New Protocol", detailLabel: "Protocol" },
  { path: "/projects", title: "Projects", icon: Folder, newLabel: "New Project", detailLabel: "Project" },
  { path: "/samples", title: "Samples", icon: TestTube, newLabel: "New Sample", detailLabel: "Sample" },
  { path: "/settings", title: "Settings", icon: Settings, children: { organization: { label: "Organization" } } },
  { path: "/reports", title: "Reports", icon: BarChart, detailLabel: "Report" },
  { path: "/catalyst", title: "Catalyst", icon: Sparkles, detailLabel: "Conversation" },
  { path: "/papers", title: "Writing", icon: PenTool, newLabel: "New Paper", detailLabel: "Paper" },
  { path: "/data", title: "Data", icon: Database },
  { path: "/org", title: "Organization", icon: Building, children: { setup: { label: "Setup" } } },
].sort((a, b) => b.path.length - a.path.length)

const PROJECT_SCOPED_LIST_PATHS = new Set([
  "/protocols",
  "/experiments",
  "/samples",
  "/lab-notes",
  "/literature-reviews",
  "/reports",
  "/papers",
])

export type BreadcrumbBuildScope = {
  projectId?: string | null
  projectName?: string | null
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isDynamicId(segment: string): boolean {
  if (!segment || segment === "new") return false
  return UUID_RE.test(segment) || segment.length >= 16
}

function titleCase(segment: string): string {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function findRouteConfig(pathname: string): RouteCrumbConfig | undefined {
  const normalized = pathname.replace(/\/+$/, "") || "/"
  return APP_ROUTE_CRUMBS.find(
    (route) => normalized === route.path || normalized.startsWith(`${route.path}/`),
  )
}

export function getHeaderTitleFromPath(pathname: string): string {
  const crumbs = buildBreadcrumbsFromPathname(pathname)
  return crumbs[crumbs.length - 1]?.label ?? "Notes9"
}

function projectIdFromInputs(
  searchParams: Pick<URLSearchParams, "get"> | null | undefined,
  scope?: BreadcrumbBuildScope,
): string | null {
  const fromQuery = searchParams?.get("project")
  if (fromQuery && isLikelyUuid(fromQuery)) return fromQuery
  if (scope?.projectId && isLikelyUuid(scope.projectId)) return scope.projectId
  return null
}

function dedupeSegments(segments: BreadcrumbSegment[]): BreadcrumbSegment[] {
  const seen = new Set<string>()
  return segments.filter((segment) => {
    const key = `${segment.label}|${segment.href ?? ""}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Merge page-specific crumbs (entity names) with auto path crumbs (incl. Dashboard / project). */
export function resolveHeaderBreadcrumbs(
  auto: BreadcrumbSegment[],
  page: BreadcrumbSegment[],
): BreadcrumbSegment[] {
  if (page.length === 0) return auto

  const dashboardCrumb = auto.find(
    (segment) => segment.label === "Dashboard" && segment.href === "/dashboard",
  )
  const pageHasDashboard = page.some(
    (segment) => segment.label === "Dashboard" && segment.href === "/dashboard",
  )

  const merged =
    dashboardCrumb && !pageHasDashboard ? [dashboardCrumb, ...page] : [...page]

  return dedupeSegments(merged.length > 0 ? merged : auto)
}

export function buildBreadcrumbsFromPathname(
  pathname: string,
  searchParams?: Pick<URLSearchParams, "get"> | null,
  scope?: BreadcrumbBuildScope,
): BreadcrumbSegment[] {
  const normalized = pathname?.replace(/\/+$/, "") || "/dashboard"
  const segments: BreadcrumbSegment[] = []

  if (searchParams?.get(FROM_DASHBOARD_PARAM) === FROM_DASHBOARD_VALUE) {
    segments.push({ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard })
  }

  if (normalized === "/" || normalized === "/dashboard") {
    if (segments.length > 0) {
      segments.push({ label: "Dashboard", icon: LayoutDashboard })
      return segments
    }
    return [{ label: "Dashboard", icon: LayoutDashboard }]
  }

  const config = findRouteConfig(normalized)
  if (!config) {
    if (segments.length > 0) return segments
    return [{ label: "Notes9" }]
  }

  if (normalized === config.path) {
    const projectId = projectIdFromInputs(searchParams, scope)
    const projectName = scope?.projectName
    if (
      projectId &&
      projectName &&
      PROJECT_SCOPED_LIST_PATHS.has(config.path)
    ) {
      return [
        ...segments,
        { label: "Projects", href: "/projects", icon: Folder },
        { label: projectName, href: `/projects/${projectId}`, icon: Folder },
        { label: config.title, icon: config.icon },
      ]
    }
    segments.push({ label: config.title, icon: config.icon })
    return segments
  }

  const rest = normalized.slice(config.path.length + 1)
  const parts = rest.split("/").filter(Boolean)
  const first = parts[0] ?? ""

  segments.push({ label: config.title, href: config.path, icon: config.icon })

  if (first === "new") {
    segments.push({
      label: config.newLabel ?? `New ${config.title.replace(/s$/, "")}`,
    })
    return segments
  }

  const child = config.children?.[first]
  if (child && !isDynamicId(first)) {
    segments.push({ label: child.label })
    const second = parts[1]
    if (second === "new") {
      segments.push({ label: child.newLabel ?? "New" })
    } else if (second && isDynamicId(second)) {
      segments.push({ label: config.detailLabel ?? "Details" })
    }
    return segments
  }

  if (isDynamicId(first)) {
    segments.push({ label: config.detailLabel ?? "Details" })
    return segments
  }

  segments.push({ label: titleCase(first) })
  return segments
}
