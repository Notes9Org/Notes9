import Link from "next/link"
import { FlaskConical, NotebookPen, TestTube, ClipboardList, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty"

/**
 * First-run dashboard surface — rendered in place of Schedule/Tasks/Whiteboard
 * when the user has zero projects. The bench panels are useless without a
 * project to ground them, so this teaches the entity hierarchy upfront and
 * routes the user to the canonical first action: create a project.
 *
 * The four item rows mirror the entities the user will see inside a project
 * workspace — this is the same vocabulary they'll encounter once they create
 * one, so the mental model is primed before they get there.
 */
export function DashboardFirstRun() {
  return (
    <Empty className="border border-dashed bg-muted/20">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FlaskConical aria-hidden />
        </EmptyMedia>
        <EmptyTitle>Start with a project</EmptyTitle>
        <EmptyDescription>
          Projects are the home for your research. Each one holds the experiments you run, the
          samples and protocols you use, and the lab notes you write — all in one place.
        </EmptyDescription>
      </EmptyHeader>

      <EmptyContent className="max-w-md">
        <ul className="flex w-full flex-col gap-2 text-left text-sm">
          <HierarchyRow
            icon={<FlaskConical className="size-4" aria-hidden />}
            title="Experiments"
            description="What you ran, when, and with which protocol."
          />
          <HierarchyRow
            icon={<NotebookPen className="size-4" aria-hidden />}
            title="Lab notes"
            description="Observations and results, attached to an experiment."
          />
          <HierarchyRow
            icon={<TestTube className="size-4" aria-hidden />}
            title="Samples"
            description="Reagents, cells, constructs — linked from experiments."
          />
          <HierarchyRow
            icon={<ClipboardList className="size-4" aria-hidden />}
            title="Protocols"
            description="Reusable procedures, versioned over time."
          />
        </ul>

        <Button asChild size="lg" className="gap-2">
          <Link href="/projects/new">
            Create your first project
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}

function HierarchyRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{description}</p>
      </div>
    </li>
  )
}
