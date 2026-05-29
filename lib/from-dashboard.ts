import type { BreadcrumbSegment } from "@/components/layout/breadcrumb-context"

export const FROM_DASHBOARD_PARAM = "from"
export const FROM_DASHBOARD_VALUE = "dashboard"

export function isFromDashboard(
  searchParams: Pick<URLSearchParams, "get"> | null | undefined,
): boolean {
  return searchParams?.get(FROM_DASHBOARD_PARAM) === FROM_DASHBOARD_VALUE
}

/** Append `from=dashboard` while preserving existing query params. */
export function withFromDashboard(path: string): string {
  const qIndex = path.indexOf("?")
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex)
  const params = new URLSearchParams(qIndex === -1 ? "" : path.slice(qIndex + 1))
  params.set(FROM_DASHBOARD_PARAM, FROM_DASHBOARD_VALUE)
  const qs = params.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export function createPageBreadcrumbSegments(
  fromDashboard: boolean,
  pageLabel: string,
): BreadcrumbSegment[] {
  if (!fromDashboard) return []
  return [
    { label: "Dashboard", href: "/dashboard" },
    { label: pageLabel },
  ]
}
