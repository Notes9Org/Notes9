import type { ReactNode } from "react"
import Link from "next/link"
import { BookOpen, ClipboardList, FlaskConical, ArrowRight, ArrowUpRight } from "lucide-react"
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
    <Card className="h-full min-h-[220px] gap-0 py-2.5">
      <CardHeader className="pb-0 pt-2">
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex min-w-0 flex-1 items-start gap-1.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            {/* Fixed block so the first list row lines up across Literature / Protocols / Experiments */}
            <div className="min-h-[4.5rem] min-w-0 flex-1">
              <CardTitle className="text-base font-semibold leading-tight line-clamp-2">
                {title}
              </CardTitle>
              <CardDescription className="mt-0 text-xs leading-tight line-clamp-2">
                {description}
              </CardDescription>
            </div>
          </div>
          <Badge variant={isEmpty ? "secondary" : "default"} className="shrink-0 tabular-nums">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 pt-0">
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
    <div className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold leading-tight tracking-tight">Project workspace</h2>
        <p className="mt-0 text-sm leading-snug text-muted-foreground">
          Jump into literature, protocols, or experiments. Lab notes live under each experiment.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SectionCard
          title="Literature & search"
          description="References and discovery linked to this project"
          icon={BookOpen}
          count={literatureCount}
          emptyTitle="No references yet"
          emptyBody="Search literature and save papers to this project from your repository."
          primaryCta={{
            label: "Open literature",
            href: `/literature-reviews?project=${projectId}&tab=repo`,
          }}
          secondaryCta={{
            label: "Find",
            href: `/literature-reviews?project=${projectId}&tab=search`,
          }}
        >
          {literature.slice(0, 5).map((row) => (
            <li key={row.id}>
              <Link
                href={`/literature-reviews?project=${projectId}&tab=repo`}
                className="group flex items-start gap-3 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground group-hover:text-primary">
                    {row.title || "Untitled"}
                  </span>
                  {row.status ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.status.replace(/_/g, " ")}
                    </span>
                  ) : null}
                </span>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </SectionCard>

        <SectionCard
          title="Protocols"
          description="SOPs linked via experiments, lab notes in this project, or protocol project fields"
          icon={ClipboardList}
          count={protocolCount}
          emptyTitle="No protocols linked yet"
          emptyBody="Link from an experiment (Protocol & Assays), from a lab note, or set project/experiment on the protocol. You can also browse the library here."
          primaryCta={{
            label: "New protocol",
            href: `/protocols/new?project=${projectId}`,
          }}
          secondaryCta={{
            label: "Browse protocols",
            href: `/protocols?project=${projectId}`,
          }}
        >
          {protocols.slice(0, 5).map((row) => (
            <li key={row.id}>
              <Link
                href={`/protocols/${row.id}?project=${projectId}`}
                className="group flex items-start gap-3 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground group-hover:text-primary">
                    {row.name || "Untitled"}
                  </span>
                  {row.version ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      Version {row.version}
                    </span>
                  ) : null}
                </span>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
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
                className="group flex items-start gap-3 rounded-md px-1 py-1.5 text-sm transition-colors hover:bg-muted/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-foreground group-hover:text-primary">
                    {row.name || "Untitled"}
                  </span>
                </span>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              </Link>
            </li>
          ))}
        </SectionCard>
      </div>
    </div>
  )
}
