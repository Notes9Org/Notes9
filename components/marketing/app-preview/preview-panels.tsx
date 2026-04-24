"use client"

import Link from "next/link"
import {
  ArrowUpRight,
  BookOpen,
  FlaskConical,
  Microscope,
  NotebookPen,
  TestTube,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { stripNoteHtmlToPlain } from "@/lib/marketing/preview-note-content"
import {
  PREVIEW_HERO_EXPERIMENT,
  PREVIEW_HERO_PROJECT,
  PREVIEW_LITERATURE_TITLE,
  PREVIEW_PROJECTS,
} from "@/lib/marketing/preview-mock-data"
import type { PreviewRouteId, PreviewSessionFlags } from "@/lib/marketing/preview-workflow"

import { MarketingPreviewResearchMap } from "./preview-research-map"
import { PreviewLabNotesEditor } from "./preview-lab-notes-editor"
import type { PreviewAction } from "./preview-reducer"

type Dispatch = (a: PreviewAction) => void

function PanelFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("min-h-0 min-w-0 flex-1 space-y-4", className)}>{children}</div>
}

function statusLabel(status: string) {
  const m: Record<string, string> = {
    active: "Active",
    planning: "Planning",
    on_hold: "On hold",
    completed: "Completed",
  }
  return m[status] ?? status
}

function priorityLabel(p: string | null) {
  if (!p) return null
  const m: Record<string, string> = { high: "High", medium: "Medium", low: "Low" }
  return m[p] ?? p
}

export function DashboardPanel({ state, dispatch }: { state: PreviewSessionFlags; dispatch: Dispatch }) {
  const complete = state.paperStaged && state.mapVisited
  const nProjects = PREVIEW_PROJECTS.filter((p) => p.status === "active" || p.status === "planning").length
  const notePreviewPlain = stripNoteHtmlToPlain(state.noteBody)

  return (
    <PanelFrame>
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Hello, preview visitor</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here&apos;s a snapshot of how your laboratory workspace could look in Notes9.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="min-w-0 border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active projects</CardTitle>
            <FlaskConical className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-foreground">{nProjects}</div>
            <p className="text-xs text-muted-foreground">Sample projects in this preview</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Experiments in progress</CardTitle>
            <Microscope className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-foreground">2</div>
            <p className="text-xs text-muted-foreground">Linked to {PREVIEW_HERO_PROJECT}</p>
          </CardContent>
        </Card>
        <Card className="min-w-0 border-border/60 sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Staged papers (preview)</CardTitle>
            <BookOpen className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-foreground">{state.paperStaged ? 1 : 0}</div>
            <p className="text-xs text-muted-foreground">From the literature search flow</p>
          </CardContent>
        </Card>
      </div>

      <Card className="min-w-0 overflow-hidden border-border/60">
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
          <CardDescription>Common tasks (preview — navigates inside this frame)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "NAVIGATE", route: "projects" })}>
            Open projects
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              dispatch({ type: "NAVIGATE", route: "project" })
              dispatch({ type: "OPEN_PROJECT" })
            }}
          >
            Sample project
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "NAVIGATE", route: "lab-notes" })}>
            Lab notes
          </Button>
        </CardContent>
      </Card>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <Card className="min-w-0 overflow-hidden border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="size-5 shrink-0" />
              Recent experiments
            </CardTitle>
            <CardDescription>Sample data only</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-2 border-b border-border/40 pb-3">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium text-foreground">{PREVIEW_HERO_EXPERIMENT}</p>
                <p className="text-xs text-muted-foreground">{PREVIEW_HERO_PROJECT}</p>
              </div>
              <Badge variant="default" className="shrink-0">
                in progress
              </Badge>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-medium text-foreground">Hit confirmation (week 2)</p>
                <p className="text-xs text-muted-foreground">{PREVIEW_HERO_PROJECT}</p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                data collection
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0 overflow-hidden border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <NotebookPen className="size-5 shrink-0" />
              Recent lab notes
            </CardTitle>
            <CardDescription>Session-only in preview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <p className="truncate text-sm font-medium text-foreground">{state.noteTitle || "Untitled note"}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {notePreviewPlain
                  ? notePreviewPlain
                  : "Open Lab notes to add text — it’s kept in this browser session only."}
              </p>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 text-xs"
                onClick={() => dispatch({ type: "NAVIGATE", route: "lab-notes" })}
              >
                Open lab notes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {complete && (
        <p className="text-sm text-[var(--n9-accent)]">
          You can explore other areas from the sidebar, or start a real workspace below.
        </p>
      )}
    </PanelFrame>
  )
}

export function ProjectsPanel({ dispatch }: { dispatch: Dispatch }) {
  return (
    <PanelFrame>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">Browse and open research projects in your team workspace.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <span className="px-2 py-1.5 text-xs font-medium text-foreground">Grid</span>
          <span className="px-2 py-1.5 text-xs text-muted-foreground" title="Table view in full app on desktop">
            Table
          </span>
        </div>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        {PREVIEW_PROJECTS.map((project) => {
          const pMax = priorityLabel(project.priority)
          return (
            <Card
              key={project.id}
              className="flex min-w-0 flex-col overflow-hidden border-border/60 transition-colors hover:border-primary/50"
            >
              <CardHeader className="min-w-0 space-y-2 pb-3">
                <div className="min-w-0 space-y-1">
                  <CardTitle
                    className="line-clamp-2 min-h-9 text-base font-semibold leading-tight text-foreground"
                    title={project.name}
                  >
                    {project.name}
                  </CardTitle>
                  {project.description ? (
                    <CardDescription className="line-clamp-2 text-sm">{project.description}</CardDescription>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={project.status === "active" ? "default" : "secondary"} className="text-[10px]">
                      {statusLabel(project.status)}
                    </Badge>
                    {pMax ? (
                      <Badge variant="outline" className="text-[10px]">
                        {pMax}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="mt-auto border-t border-border/40 pt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" />
                    {project.no_of_members} members
                  </span>
                  <span>
                    {project.no_of_experiments} exp.
                  </span>
                </div>
                <Button
                  className="mt-3 w-full"
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => dispatch({ type: "OPEN_PROJECT" })}
                >
                  Open
                  <ArrowUpRight className="ml-1 size-3.5 opacity-80" />
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </PanelFrame>
  )
}

export function ProjectDetailPanel({ dispatch }: { dispatch: Dispatch }) {
  const p = PREVIEW_PROJECTS[0]!
  return (
    <PanelFrame>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{p.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {p.description ?? "Objective and context appear here in the full app."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>{statusLabel(p.status)}</Badge>
          {priorityLabel(p.priority) ? <Badge variant="outline">{priorityLabel(p.priority)}</Badge> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => dispatch({ type: "NAVIGATE", route: "experiments" })}>
          <FlaskConical className="mr-1.5 size-4" />
          Open experiments
        </Button>
        <Button type="button" variant="outline" onClick={() => dispatch({ type: "NAVIGATE", route: "literature" })}>
          <BookOpen className="mr-1.5 size-4" />
          Literature
        </Button>
      </div>
    </PanelFrame>
  )
}

export function ExperimentsPanel({ state, dispatch }: { state: PreviewSessionFlags; dispatch: Dispatch }) {
  return (
    <PanelFrame>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Experiments</h1>
        {state.projectOpened ? (
          <p className="mt-1 text-sm text-muted-foreground">Project context: {PREVIEW_HERO_PROJECT}</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Sample experiments in this preview.</p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card
          className="cursor-pointer border-border/60 transition-colors hover:border-primary/50"
          onClick={() => dispatch({ type: "OPEN_EXPERIMENT" })}
        >
          <CardHeader className="pb-2">
            <CardTitle className="line-clamp-2 text-base">{PREVIEW_HERO_EXPERIMENT}</CardTitle>
            <CardDescription>In progress · 2 team members</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="default">in progress</Badge>
          </CardContent>
        </Card>
        <Card
          className="cursor-pointer border-border/60 opacity-90 transition-colors hover:border-primary/50"
          onClick={() => dispatch({ type: "OPEN_EXPERIMENT" })}
        >
          <CardHeader className="pb-2">
            <CardTitle className="line-clamp-2 text-base">Hit confirmation (week 2)</CardTitle>
            <CardDescription>Data collection</CardDescription>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">data collection</Badge>
          </CardContent>
        </Card>
      </div>
    </PanelFrame>
  )
}

export function ExperimentDetailPanel({ state, dispatch }: { state: PreviewSessionFlags; dispatch: Dispatch }) {
  return (
    <PanelFrame>
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{PREVIEW_HERO_EXPERIMENT}</h1>
        <p className="text-xs text-muted-foreground">Project · {PREVIEW_HERO_PROJECT}</p>
      </div>
      <div className="mt-2 space-y-3">
        <div className="rounded-xl border border-border/50 bg-muted/15 p-3">
          <button
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_PROTOCOL" })}
            className="flex w-full items-center justify-between text-left text-sm font-medium text-foreground"
          >
            Linked protocol
            <Badge variant="outline" className="text-[10px]">v2.1</Badge>
          </button>
          {state.protocolExpanded && (
            <ol className="mt-2 list-decimal pl-4 text-sm text-muted-foreground">
              <li>Seed cells at 5k/well, verify viability.</li>
              <li>Apply compound at 0–20 µM, 3 technical replicates.</li>
              <li>Stain and image at 48h; export raw for QC.</li>
            </ol>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => dispatch({ type: "NAVIGATE", route: "samples" })}>
            <TestTube className="mr-1.5 size-4" />
            Samples
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => dispatch({ type: "NAVIGATE", route: "lab-notes" })}>
            <NotebookPen className="mr-1.5 size-4" />
            Lab notes
          </Button>
        </div>
      </div>
    </PanelFrame>
  )
}

export function SamplesPanel() {
  return (
    <PanelFrame>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Samples</h1>
        <p className="mt-1 text-sm text-muted-foreground">Materials linked to {PREVIEW_HERO_EXPERIMENT} (sample).</p>
      </div>
      <Card className="min-w-0 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Experiment samples</CardTitle>
          <CardDescription>Read-only in this preview</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Context</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-mono text-xs">SMP-10021</TableCell>
                <TableCell>primary cells</TableCell>
                <TableCell className="text-muted-foreground">Experiment</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-mono text-xs">SMP-10022</TableCell>
                <TableCell>compound aliquot</TableCell>
                <TableCell className="text-muted-foreground">Experiment</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </PanelFrame>
  )
}

export function LabNotesPanel({ state, dispatch }: { state: PreviewSessionFlags; dispatch: Dispatch }) {
  return (
    <PanelFrame>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Lab notes</h1>
      </div>
      <PreviewLabNotesEditor state={state} dispatch={dispatch} />
    </PanelFrame>
  )
}

export function LiteraturePanel({ state, dispatch }: { state: PreviewSessionFlags; dispatch: Dispatch }) {
  return (
    <PanelFrame>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Literature</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search, stage, and connect papers to your project (full app features).</p>
      </div>
      <Card className="min-w-0 border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Search</CardTitle>
          <CardDescription>Preview uses static results — no live API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input readOnly placeholder="Search papers…" className="max-w-md" />
            <Button type="button" size="sm" onClick={() => dispatch({ type: "LITERATURE_SEARCH" })}>
              Search
            </Button>
          </div>
        </CardContent>
      </Card>
      {state.literatureSearched && (
        <Card className="min-w-0 border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Static sample results (no live API in preview).</p>
            <div className="rounded-xl border border-border/50 p-3">
              <p className="font-medium text-foreground">{PREVIEW_LITERATURE_TITLE}</p>
              <p className="mt-1 text-xs text-muted-foreground">Staged: {state.paperStaged ? "yes" : "no"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={state.paperStaged ? "secondary" : "default"}
                  onClick={() => dispatch({ type: "STAGE_PAPER" })}
                >
                  {state.paperStaged ? "Staged to project" : "Add to project"}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => dispatch({ type: "NAVIGATE", route: "research-map" })}>
                  View research map
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </PanelFrame>
  )
}

export function ResearchMapPanel() {
  return <MarketingPreviewResearchMap />
}

export function WritingPanel() {
  return (
    <PanelFrame>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">Writing</h1>
        <p className="text-sm text-muted-foreground">Open the full app for long-form writing with project citations and Catalyst.</p>
      </div>
      <Button asChild className="mt-1" size="sm" variant="outline">
        <Link href="/auth/sign-up">Start writing in Notes9</Link>
      </Button>
    </PanelFrame>
  )
}

export function StubPanel({ title }: { title: string }) {
  return (
    <PanelFrame>
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This area is available in the full workspace with the same navigation you see in the sidebar.
        </p>
      </div>
      <Button asChild className="mt-1" size="sm">
        <Link href="/auth/sign-up">Create account</Link>
      </Button>
    </PanelFrame>
  )
}

export function routeTitle(route: PreviewRouteId): string {
  const map: Record<PreviewRouteId, string> = {
    dashboard: "Dashboard",
    projects: "Projects",
    project: "Project",
    experiments: "Experiments",
    experiment: "Experiment",
    samples: "Samples",
    "lab-notes": "Lab notes",
    protocols: "Protocols",
    literature: "Literature",
    "research-map": "Research map",
    writing: "Writing",
    equipment: "Equipment",
    reports: "Reports",
  }
  return map[route] ?? route
}

export function routeBreadcrumb(route: PreviewRouteId): string {
  if (route === "project") return `Projects · ${PREVIEW_HERO_PROJECT}`
  if (route === "experiments" || route === "experiment") return `Projects · ${PREVIEW_HERO_PROJECT} · Experiments`
  if (route === "samples" || route === "lab-notes")
    return `Experiments · ${PREVIEW_HERO_EXPERIMENT} · ${routeTitle(route)}`
  return routeTitle(route)
}
