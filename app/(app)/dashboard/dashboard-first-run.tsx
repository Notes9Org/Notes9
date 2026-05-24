import Link from "next/link"
import { Button } from "@/components/ui/button"
import { PageHeading, PageSubheading } from "@/components/ui/page-heading"
import { ArrowRight, FolderPlus, Upload, Compass } from "lucide-react"

/**
 * First-run Dashboard for users with no projects yet. Shows three deliberate
 * paths forward (create, import, learn) instead of an empty grid of cards.
 *
 * The four entity-hierarchy rows that used to live here moved INTO the
 * new-project flow, where they're contextual rather than abstract.
 */
export function DashboardFirstRun() {
  return (
    <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full pt-4 md:pt-12">
      <div className="flex flex-col gap-2 text-center">
        <PageHeading className="font-display text-3xl md:text-5xl">
          Welcome to Notes9
        </PageHeading>
        <PageSubheading className="text-center md:text-base">
          Your lab notebook of record. Projects keep your experiments, notes,
          protocols, samples, and papers in one place.
        </PageSubheading>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Button
          asChild
          size="lg"
          className="h-auto py-6 flex-col items-start gap-2 text-left"
        >
          <Link href="/projects/new">
            <div className="flex items-center gap-2 w-full">
              <FolderPlus className="size-4" />
              <span className="font-semibold">Create your first project</span>
            </div>
            <span className="text-xs opacity-80 font-normal whitespace-normal">
              The home for your experiments, notes, and data.
            </span>
          </Link>
        </Button>

        <Button
          asChild
          size="lg"
          variant="outline"
          className="h-auto py-6 flex-col items-start gap-2 text-left"
        >
          <Link href="/settings?tab=import">
            <div className="flex items-center gap-2 w-full">
              <Upload className="size-4" />
              <span className="font-semibold">Import existing work</span>
            </div>
            <span className="text-xs opacity-80 font-normal whitespace-normal">
              Bring in notebooks, papers, or protocols from elsewhere.
            </span>
          </Link>
        </Button>

        <Button
          asChild
          size="lg"
          variant="ghost"
          className="h-auto py-6 flex-col items-start gap-2 text-left"
        >
          <Link href="/catalyst">
            <div className="flex items-center gap-2 w-full">
              <Compass className="size-4" />
              <span className="font-semibold">Take the 60-second tour</span>
              <ArrowRight className="size-3.5 ml-auto opacity-60" />
            </div>
            <span className="text-xs opacity-80 font-normal whitespace-normal">
              See how Catalyst connects experiments, notes, and papers.
            </span>
          </Link>
        </Button>
      </div>
    </div>
  )
}
