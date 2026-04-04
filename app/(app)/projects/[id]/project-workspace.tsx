import type { ReactNode } from "react"
import Link from "next/link"
import { BookOpen, ClipboardList, FlaskConical, ArrowRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type ProjectWorkspaceLiterature = { id: string; title: string; status: string | null }
export type ProjectWorkspaceProtocol = { id: string; name: string; version: string | null }
export type ProjectWorkspaceExperiment = { id: string; name: string }

type ProjectWorkspaceProps = {
  projectId: string
  literature: ProjectWorkspaceLiterature[]
  literatureCount: number
  protocols: ProjectWorkspaceProtocol[]
  protocolCount: number
  experiments: ProjectWorkspaceExperiment[]
  experimentsCount: number
}

function SectionCard({
  title,
  description,
  icon: Icon,
  count,
  emptyTitle,
  emptyBody,
  primaryCta,
  secondaryCta,
  children,
}: {
  title: string
  description: string
  icon: typeof BookOpen
  count: number
  emptyTitle: string
  emptyBody: string
  primaryCta: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  children?: ReactNode
}) {
  const isEmpty = count === 0

  return (
    <Card className="flex flex-col h-full min-h-[220px]">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
              <CardDescription className="text-xs mt-0.5 line-clamp-2">{description}</CardDescription>
            </div>
          </div>
          <Badge variant={isEmpty ? "secondary" : "default"} className="shrink-0 tabular-nums">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 gap-3 pt-0">
        {isEmpty ? (
          <div className="flex flex-1 flex-col justify-center rounded-lg border border-dashed bg-muted/20 px-3 py-4 text-center">
            <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
            <p className="text-xs text-muted-foreground mt-1">{emptyBody}</p>
          </div>
        ) : (
          <ul className="space-y-1.5 text-sm flex-1 min-h-0">{children}</ul>
        )}
        <div className={cn("flex flex-wrap gap-2", secondaryCta && "flex-col sm:flex-row")}>
          <Button asChild size="sm" className="w-full sm:w-auto">
            <Link href={primaryCta.href}>
              {primaryCta.label}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
          {secondaryCta ? (
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function ProjectWorkspace({
  projectId,
  literature,
  literatureCount,
  protocols,
  protocolCount,
  experiments,
  experimentsCount,
}: ProjectWorkspaceProps) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Project workspace</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Jump into literature, protocols, or experiments. Lab notes live under each experiment.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SectionCard
          title="Literature & search"
          description="References and discovery linked to this project"
          icon={BookOpen}
          count={literatureCount}
          emptyTitle="No references yet"
          emptyBody="Search literature and save papers to this project from your repository."
          primaryCta={{
            label: "Open literature",
            href: `/literature-reviews?project=${projectId}`,
          }}
        >
          {literature.slice(0, 5).map((row) => (
            <li key={row.id}>
              <Link
                href={`/literature-reviews/${row.id}?project=${projectId}`}
                className="line-clamp-2 text-foreground hover:text-primary hover:underline block"
              >
                {row.title || "Untitled"}
              </Link>
            </li>
          ))}
        </SectionCard>

        <SectionCard
          title="Protocols"
          description="SOPs linked via this project’s experiments"
          icon={ClipboardList}
          count={protocolCount}
          emptyTitle="No protocols linked yet"
          emptyBody="Protocols are linked from experiment pages. Use the Experiments card to add a run, or browse the library here."
          primaryCta={{ label: "Browse protocols", href: `/protocols?project=${projectId}` }}
        >
          {protocols.slice(0, 5).map((row) => (
            <li key={row.id}>
              <Link
                href={`/protocols/${row.id}?project=${projectId}`}
                className="line-clamp-2 text-foreground hover:text-primary hover:underline block"
              >
                {row.name}
                {row.version ? (
                  <span className="text-muted-foreground font-normal"> · v{row.version}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </SectionCard>

        <SectionCard
          title="Experiments"
          description="Runs and plans under this project"
          icon={FlaskConical}
          count={experimentsCount}
          emptyTitle="No experiments yet"
          emptyBody="Create an experiment to organize protocols, samples, and lab notes for this project."
          primaryCta={{
            label: "New experiment",
            href: `/experiments/new?project=${projectId}`,
          }}
          secondaryCta={{
            label: "View experiments",
            href: `/experiments?project=${projectId}`,
          }}
        >
          {experiments.slice(0, 5).map((row) => (
            <li key={row.id}>
              <Link
                href={`/experiments/${row.id}?project=${projectId}`}
                className="line-clamp-2 text-foreground hover:text-primary hover:underline block"
              >
                {row.name || "Untitled"}
              </Link>
            </li>
          ))}
        </SectionCard>
      </div>
    </div>
  )
}
