import type { ReactNode } from "react"
import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import {
  BookOpen,
  ClipboardList,
  Database,
  FlaskConical,
  TestTube,
  NotebookPen,
  PenLine,
  BarChart3,
  Plus,
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

const TONE_BG: Record<ModuleTone, string> = {
  default: "color-mix(in srgb, var(--foreground) 6%, var(--card))",
  leaf: "color-mix(in srgb, #5e7a4a 14%, var(--card))",
  accent: "var(--n9-accent-light)",
  warm: "color-mix(in srgb, #b56b54 14%, var(--card))",
  neutral: "var(--muted)",
}

const TONE_FG: Record<ModuleTone, string> = {
  default: "var(--foreground)",
  leaf: "#3f5c33",
  accent: "var(--n9-accent)",
  warm: "#8c4f38",
  neutral: "var(--foreground)",
}

function WorkspaceCard({
  href,
  newHref,
  icon: Icon,
  tone = "default",
  name,
  children,
}: {
  href: string
  newHref: string
  icon: LucideIcon
  tone?: ModuleTone
  name: string
  children?: ReactNode
}) {
  const isEmpty = !children
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
        <h3 className="min-w-0 flex-1 text-right font-display text-[15px] font-semibold text-foreground">
          {name}
        </h3>
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
        <Link
          href={href}
          className="text-[13px] font-medium text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
        >
          Open
        </Link>
        <Link
          href={newHref}
          aria-label={`Add to ${name}`}
          className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus size={16} aria-hidden />
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

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <WorkspaceCard
          href={`/literature-reviews?project=${projectId}`}
          newHref={`/literature-reviews/new?project=${projectId}`}
          icon={BookOpen}
          tone="default"
          name="Literature"
        >
          {literatureCount > 0
            ? literature.slice(0, 3).map((l) => (
                <PreviewLine key={l.id} text={l.title} />
              ))
            : null}
        </WorkspaceCard>

        <WorkspaceCard
          href={`/experiments?project=${projectId}`}
          newHref={`/experiments/new?project=${projectId}`}
          icon={FlaskConical}
          tone="accent"
          name="Experiments"
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
          href={`/protocols?project=${projectId}`}
          newHref={`/protocols/new?project=${projectId}`}
          icon={ClipboardList}
          tone="leaf"
          name="Protocols"
        >
          {protocolCount > 0
            ? protocols.slice(0, 3).map((p) => (
                <PreviewLine key={p.id} text={p.name} />
              ))
            : null}
        </WorkspaceCard>

        <WorkspaceCard
          href={`/lab-notes?project=${projectId}`}
          newHref={`/lab-notes?project=${projectId}`}
          icon={NotebookPen}
          tone="neutral"
          name="Lab Notes"
        >
          {labNotesCount > 0
            ? labNotes.slice(0, 3).map((n) => (
                <PreviewLine key={n.id} text={n.title || "Untitled note"} />
              ))
            : null}
        </WorkspaceCard>
      </div>

      <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <WorkspaceCard
          href={`/experiments?project=${projectId}`}
          newHref={
            experiments[0]?.id
              ? `/experiments/${experiments[0].id}?project=${projectId}`
              : `/experiments/new?project=${projectId}`
          }
          icon={Database}
          tone="leaf"
          name="Data"
        >
          {dataFilesCount > 0
            ? dataFiles.slice(0, 3).map((f) => (
                <PreviewLine
                  key={f.id}
                  href={
                    f.experiment_id
                      ? `/experiments/${f.experiment_id}?project=${projectId}`
                      : `/experiments?project=${projectId}`
                  }
                  text={f.file_name}
                />
              ))
            : null}
        </WorkspaceCard>

        <WorkspaceCard
          href={`/samples?project=${projectId}`}
          newHref={`/samples?project=${projectId}`}
          icon={TestTube}
          tone="warm"
          name="Samples"
        >
          {samplesCount > 0
            ? samples.slice(0, 3).map((s) => (
                <PreviewLine
                  key={s.id}
                  text={s.sample_type ? `${s.sample_code} · ${s.sample_type}` : s.sample_code}
                />
              ))
            : null}
        </WorkspaceCard>

        <WorkspaceCard
          href={`/reports?project=${projectId}`}
          newHref={`/reports?project=${projectId}`}
          icon={BarChart3}
          tone="neutral"
          name="Reports"
        >
          {reportsCount > 0
            ? reports.slice(0, 3).map((r) => (
                <PreviewLine key={r.id} text={r.title || "Untitled report"} />
              ))
            : null}
        </WorkspaceCard>

        <WorkspaceCard
          href={`/papers?project=${projectId}`}
          newHref={`/papers?project=${projectId}`}
          icon={PenLine}
          tone="accent"
          name="Writing"
        >
          {papersCount > 0
            ? papers.slice(0, 3).map((p) => (
                <PreviewLine key={p.id} text={p.title || "Untitled draft"} />
              ))
            : null}
        </WorkspaceCard>
      </div>
    </section>
  )
}
