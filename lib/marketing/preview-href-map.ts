import type { PreviewRouteId } from "@/lib/marketing/preview-workflow"

const HREF_TO_PREVIEW: Record<string, PreviewRouteId> = {
  "/dashboard": "dashboard",
  "/projects": "projects",
  "/experiments": "experiments",
  "/lab-notes": "lab-notes",
  "/samples": "samples",
  "/equipment": "equipment",
  "/protocols": "protocols",
  "/literature-reviews": "literature",
  "/research-map": "research-map",
  "/papers": "writing",
  "/reports": "reports",
}

const PREVIEW_TO_HREF: Record<PreviewRouteId, string> = {
  dashboard: "/dashboard",
  projects: "/projects",
  project: "/projects",
  experiments: "/experiments",
  experiment: "/experiments",
  samples: "/samples",
  "lab-notes": "/lab-notes",
  protocols: "/protocols",
  literature: "/literature-reviews",
  "research-map": "/research-map",
  writing: "/papers",
  equipment: "/equipment",
  reports: "/reports",
}

export function previewRouteForHref(href: string): PreviewRouteId {
  return HREF_TO_PREVIEW[href] ?? "dashboard"
}

export function hrefForPreviewRoute(route: PreviewRouteId): string {
  return PREVIEW_TO_HREF[route] ?? "/dashboard"
}

export function isNavActive(previewRoute: PreviewRouteId, itemHref: string): boolean {
  const r = previewRouteForHref(itemHref)
  if (previewRoute === "project" && r === "projects") return true
  if (previewRoute === "experiment" && r === "experiments") return true
  return previewRoute === r
}
