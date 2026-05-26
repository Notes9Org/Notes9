"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FlaskConical, FolderOpen, ArrowRight } from "lucide-react"
import { getRecentProjectEntries } from "@/lib/recent-projects"

type ActiveExperiment = {
  id: string
  name: string
  status: string
  updated_at: string
  project_id: string | null
}

type RecentProject = {
  id: string
  name: string
  openedAt: number
}

type WorkItem =
  | {
      type: "project"
      id: string
      name: string
      sortKey: number
    }
  | {
      type: "experiment"
      id: string
      name: string
      status: string
      project_id: string | null
      sortKey: number
    }

function relativeTimeFromMs(ms: number): string {
  const diff = Date.now() - ms
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

export function DashboardRecentWork({
  activeExperiments,
}: {
  activeExperiments: ActiveExperiment[]
}) {
  const pathname = usePathname()
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const entries = getRecentProjectEntries()
    if (entries.length === 0) {
      setRecentProjects([])
      setLoading(false)
      return
    }

    let cancelled = false
    const supabase = createClient()
    const ids = entries.map((e) => e.id)

    void (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", ids)

      if (cancelled) return

      const byId = new Map((data ?? []).map((p) => [p.id, p]))
      const resolved = entries
        .map((entry) => {
          const row = byId.get(entry.id)
          if (!row) return null
          return {
            id: row.id,
            name: row.name || "Untitled project",
            openedAt: entry.openedAt,
          }
        })
        .filter((p): p is RecentProject => p !== null)

      setRecentProjects(resolved)
      setLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [pathname])

  const activeWorkItems = useMemo(() => {
    const projectIds = new Set(recentProjects.map((p) => p.id))

    const items: WorkItem[] = [
      ...recentProjects.map((p, index) => ({
        type: "project" as const,
        id: p.id,
        name: p.name,
        sortKey: index,
      })),
      ...activeExperiments
        .filter((e) => !e.project_id || !projectIds.has(e.project_id))
        .map((e, index) => ({
          type: "experiment" as const,
          id: e.id,
          name: e.name,
          status: e.status,
          project_id: e.project_id,
          sortKey: 100 + index,
        })),
    ]

    return items.slice(0, 4)
  }, [recentProjects, activeExperiments])

  const showEmpty = !loading && activeWorkItems.length === 0

  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader>
        <CardTitle className="text-base">Recent projects & experiments</CardTitle>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
        {loading && activeWorkItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : showEmpty ? (
          <p className="flex-1 text-sm text-muted-foreground">
            No recent work.{" "}
            <Link
              href="/projects"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Open a project →
            </Link>
          </p>
        ) : (
          <ul className="flex-1 space-y-2">
            {activeWorkItems.map((item) => (
              <li key={`${item.type}-${item.id}`}>
                <Link
                  href={
                    item.type === "experiment"
                      ? `/experiments/${item.id}${item.project_id ? `?project=${item.project_id}` : ""}`
                      : `/projects/${item.id}`
                  }
                  className="flex items-start gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:bg-muted/40"
                >
                  {item.type === "experiment" ? (
                    <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : (
                    <FolderOpen className="mt-0.5 size-4 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-1 text-sm font-medium">{item.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {item.type === "project"
                        ? `Opened ${relativeTimeFromMs(
                            recentProjects.find((p) => p.id === item.id)?.openedAt ??
                              Date.now(),
                          )}`
                        : "In progress"}
                    </div>
                  </div>
                  {item.type === "experiment" ? (
                    <Badge
                      variant="secondary"
                      className="shrink-0 text-2xs uppercase tracking-wide"
                    >
                      {item.status}
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-2xs uppercase tracking-wide"
                    >
                      Project
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="ghost" size="sm" className="mt-3 w-full justify-between">
          <Link href="/projects" className="text-muted-foreground hover:text-foreground">
            View all projects
            <ArrowRight className="size-4 opacity-50" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
