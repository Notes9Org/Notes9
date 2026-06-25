import type { ReactNode } from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  Database,
  FlaskConical,
  PenLine,
  BarChart3,
  ArrowRight,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"

export type ProjectWorkspaceLiterature = { id: string; title: string; status: string | null }
export type ProjectWorkspaceProtocol = { id: string; name: string; version: string | null }
export type ProjectWorkspaceExperiment = {
  id: string
  name: string
  status: string | null
}
export type ProjectWorkspaceDataFile = {
  id: string
  file_name: string
  experiment_id: string | null
}
export type ProjectWorkspaceSample = { id: string; sample_code: string; sample_type: string | null }
export type ProjectWorkspaceLabNote = { id: string; title: string | null; experiment_id: string | null }
export type ProjectWorkspacePaper = { id: string; title: string | null; updated_at: string | null }
export type ProjectWorkspaceReport = { id: string; title: string | null; created_at: string | null }

type WorkspaceProps = {
  projectId: string
  literature: ProjectWorkspaceLiterature[]
  literatureCount: number
  protocols: ProjectWorkspaceProtocol[]
  protocolCount: number
  experiments: ProjectWorkspaceExperiment[]
  experimentsCount: number
  dataFiles: ProjectWorkspaceDataFile[]
  dataFilesCount: number
  samples: ProjectWorkspaceSample[]
  samplesCount: number
  labNotes: ProjectWorkspaceLabNote[]
  labNotesCount: number
  papers: ProjectWorkspacePaper[]
  papersCount: number
  reports: ProjectWorkspaceReport[]
  reportsCount: number
}

type ModuleTone = "default" | "leaf" | "warm" | "neutral" | "accent"

// All values reference CSS variables defined in globals.css with both :root
// (light) and .dark overrides, so the workspace cards adapt to dark mode
// without any JS theme detection.
const TONE_BG: Record<ModuleTone, string> = {
  default: "color-mix(in srgb, var(--foreground) 6%, var(--card))",
  leaf: "var(--tone-leaf-bg)",
  accent: "var(--n9-accent-light)",
  warm: "var(--tone-warm-bg)",
  neutral: "var(--muted)",
}

const TONE_FG: Record<ModuleTone, string> = {
  default: "var(--foreground)",
  leaf: "var(--tone-leaf-fg)",
  accent: "var(--n9-accent)",
  warm: "var(--tone-warm-fg)",
  neutral: "var(--foreground)",
}

function WorkspaceCard({
  href,
  newHref,
  icon: Icon,
  tone = "default",
  name,
  count,
  children,
}: {
  href: string
  newHref?: string
  icon: LucideIcon
  tone?: ModuleTone
  name: string
  /** Optional count/status pill shown top-right (e.g. 23, "7 active", "2 drafts"). */
  count?: string | number
  children?: ReactNode
}) {
  const isEmpty = !children
  const hasCount = count !== undefined && count !== null && count !== "" && count !== 0
  return (
    <article className="flex h-full min-h-[180px] flex-col rounded-[calc(var(--radius)+6px)] border border-border bg-card p-4 shadow-[0_1px_2px_rgba(44,36,24,0.04)]">
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: TONE_BG[tone], color: TONE_FG[tone] }}
        >
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <h3 className="min-w-0 flex-1 font-display text-[15px] font-semibold text-foreground">
          {name}
        </h3>
        {hasCount && (
          <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </header>

      <div className="mt-4 flex flex-1 flex-col justify-center gap-2">
        {isEmpty ? (
          <>
            <div className="h-2 rounded-full bg-muted/80" aria-hidden />
            <div className="h-2 w-[88%] rounded-full bg-muted/60" aria-hidden />
            <div className="h-2 w-[72%] rounded-full bg-muted/40" aria-hidden />
          </>
        ) : (
          children
        )}
      </div>

      <footer className="mt-4 flex items-center justify-between border-t border-border/80 pt-3">
        {newHref ? (
          <Link
            href={newHref}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-500 dark:hover:text-emerald-400"
          >
            + New
          </Link>
        ) : (
          <div />
        )}
        <Link
          href={href}
          className="group inline-flex items-center gap-1 text-[13px] font-medium text-foreground/80 transition-colors hover:text-foreground"
        >
          Open
          <ArrowRight size={14} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </footer>
    </article>
  )
}

function PreviewLine({ text, href }: { text: string; href?: string }) {
  const className =
    "truncate text-[12.5px] text-foreground/85 leading-snug hover:text-foreground"
  if (href) {
    return (
      <Link href={href} className={`block ${className} underline-offset-2 hover:underline`}>
        {text}
      </Link>
    )
  }
  return <p className={className}>{text}</p>
}

function formatExperimentPreview(experiment: ProjectWorkspaceExperiment) {
  return experiment.status
    ? `${experiment.name} · ${experiment.status.replace(/_/g, " ")}`
    : experiment.name
}

export function ProjectWorkspace({
  projectId,
  literature,
  literatureCount,
  protocols,
  protocolCount,
  experiments,
  experimentsCount,
  dataFiles,
  dataFilesCount,
  samples,
  samplesCount,
  labNotes,
  labNotesCount,
  papers,
  papersCount,
  reports,
  reportsCount,
}: WorkspaceProps) {
  // First-run teaching banner: when the project is brand-new and every module
  // tile is empty, the workspace is 8 identical placeholder cards with no
  // anchor for what to do first. Surface a single canonical next-step
  // ("New experiment") above the grid; once any entity exists, the banner
  // disappears and the populated tiles speak for themselves.
  const isFirstRun =
    literatureCount === 0 &&
    protocolCount === 0 &&
    experimentsCount === 0 &&
    dataFilesCount === 0 &&
    samplesCount === 0 &&
    labNotesCount === 0 &&
    papersCount === 0 &&
    reportsCount === 0

  return (
    <section aria-label="Project workspace" className="space-y-4">
      {isFirstRun ? (
        <div className="rounded-[calc(var(--radius)+6px)] border border-dashed border-border bg-card/60 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg"
                style={{ background: TONE_BG.accent, color: TONE_FG.accent }}
              >
                <Sparkles size={18} strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-foreground">
                  Start with an experiment
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  An experiment is the anchor of this project — link a protocol to it, attach the
                  samples you used, and capture lab notes as you go. The eight cards below fill in
                  as you work.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="shrink-0 gap-2">
              <Link href={`/experiments/new?project=${projectId}`}>
                New experiment
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      {/* Lab Notes, Protocols, and Samples cards intentionally removed — they
          now live as sub-items under Experiments in the project sidebar, so
          surfacing them as separate workspace cards was redundant. */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <WorkspaceCard
          href={`/literature-reviews?project=${projectId}`}
          newHref={`/literature-reviews/new?project=${projectId}`}
          icon={BookOpen}
          tone="default"
          name="Literature"
          count={literatureCount}
        >
          {literatureCount > 0
            ? literature.slice(0, 3).map((l) => (
                <PreviewLine key={l.id} href={`/literature-reviews/${l.id}`} text={l.title} />
              ))
            : null}
        </WorkspaceCard>

        <WorkspaceCard
          href={`/experiments?project=${projectId}`}
          newHref={`/experiments/new?project=${projectId}`}
          icon={FlaskConical}
          tone="accent"
          name="Experiments"
          count={experimentsCount > 0 ? `${experimentsCount} active` : undefined}
        >
          {experimentsCount > 0
            ? experiments.slice(0, 3).map((e) => (
                <PreviewLine
                  key={e.id}
                  href={`/experiments/${e.id}?project=${projectId}`}
                  text={formatExperimentPreview(e)}
                />
              ))
            : null}
        </WorkspaceCard>

        <WorkspaceCard
          href={
            experiments[0]?.id
              ? `/experiments/${experiments[0].id}?project=${projectId}&tab=data`
              : `/experiments?project=${projectId}`
          }
          newHref={
            experiments[0]?.id
              ? `/experiments/${experiments[0].id}?project=${projectId}&tab=data`
              : `/experiments/new?project=${projectId}`
          }
          icon={Database}
          tone="leaf"
          name="Data"
          count={dataFilesCount}
        >
          {dataFilesCount > 0
            ? dataFiles.slice(0, 3).map((f) => (
                <PreviewLine
                  key={f.id}
                  href={
                    f.experiment_id
                      ? `/experiments/${f.experiment_id}?project=${projectId}&tab=data`
                      : `/experiments?project=${projectId}`
                  }
                  text={f.file_name}
                />
              ))
            : null}
        </WorkspaceCard>

        <WorkspaceCard
          href={`/reports?project=${projectId}`}
          newHref={`/reports?project=${projectId}&new=true`}
          icon={BarChart3}
          tone="neutral"
          name="Reports"
          count={reportsCount}
        >
          {reportsCount > 0
            ? reports.slice(0, 3).map((r) => (
                <PreviewLine key={r.id} href={`/reports/${r.id}`} text={r.title || "Untitled report"} />
              ))
            : null}
        </WorkspaceCard>

        <WorkspaceCard
          href={`/papers?project=${projectId}`}
          newHref={`/papers/new?project=${projectId}`}
          icon={PenLine}
          tone="accent"
          name="Writing"
          count={papersCount > 0 ? `${papersCount} drafts` : undefined}
        >
          {papersCount > 0
            ? papers.slice(0, 3).map((p) => (
                <PreviewLine key={p.id} href={`/papers/${p.id}`} text={p.title || "Untitled draft"} />
              ))
            : null}
        </WorkspaceCard>
      </div>
    </section>
  )
}
