import { cn } from "@/lib/utils"

export function BreadcrumbSkeleton({ className }: { className?: string }) {
  return <div className={cn("h-4 w-40 bg-muted rounded-md", className)} />
}

/** Centered sparkle + greeting line (dashboard). */
export function CenteredGreetingSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-3xl items-center justify-center gap-3 md:gap-4 pt-2 md:pt-6",
        className,
      )}
    >
      <div className="size-7 md:size-9 shrink-0 rounded-full bg-muted" />
      <div className="h-9 md:h-12 flex-1 max-w-md bg-muted rounded-md" />
    </div>
  )
}

/** PageHeading + PageSubheading (planner, literature header, etc.). */
export function PageHeadingSkeleton({
  className,
  subtitle = true,
}: {
  className?: string
  subtitle?: boolean
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="h-8 md:h-9 w-36 bg-muted rounded-md" />
      {subtitle ? <div className="h-4 w-72 max-w-full bg-muted rounded-md" /> : null}
    </div>
  )
}

/** Vertical Catalyst composer (matches CatalystSectionHero). */
export function CatalystComposerSkeleton({
  className,
  size = "sm",
}: {
  className?: string
  size?: "sm" | "lg"
}) {
  const maxWidth = size === "lg" ? "max-w-4xl" : "max-w-3xl"
  const minHeight = size === "lg" ? "min-h-[132px]" : "min-h-[112px]"

  return (
    <div className={cn("mx-auto w-full", maxWidth, className)}>
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-2xl border-2 border-primary/20 bg-[var(--n9-accent-light)] p-3 dark:border-primary/25 dark:bg-card",
          minHeight,
        )}
      >
        <div className="min-h-[44px] w-full rounded-md bg-muted/70" />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-7 shrink-0 rounded-lg bg-muted" />
            <div className="h-4 w-16 rounded-md bg-muted" />
          </div>
          <div className="size-9 shrink-0 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  )
}

/** Description line + view toggle / action buttons (list pages). */
export function ResourceListToolbarSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="h-4 w-full max-w-md bg-muted rounded-md" />
      <div className="flex items-center gap-2 shrink-0">
        <div className="h-8 w-16 bg-muted rounded-md" />
        <div className="size-8 bg-muted rounded-md" />
      </div>
    </div>
  )
}

/** ResourceFilterRow pill skeletons. */
export function ResourceFilterRowSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-8 w-28 bg-muted rounded-md" />
      ))}
    </div>
  )
}

/** Project picker row + status badges. */
export function ProjectHeaderRowSkeleton() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="h-10 w-48 bg-muted rounded-lg border border-border/50" />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="h-6 w-20 bg-muted rounded-md" />
        <div className="h-6 w-28 bg-muted rounded-md" />
        <div className="h-9 w-9 bg-muted rounded-md" />
      </div>
    </div>
  )
}

/** 4 + 4 workspace cards on project detail. */
export function ProjectWorkspaceGridSkeleton() {
  const card = (
    <div className="flex min-h-[180px] flex-col rounded-[calc(var(--radius)+6px)] border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="size-10 shrink-0 rounded-xl bg-muted" />
        <div className="ml-auto h-5 w-24 bg-muted rounded-md" />
      </div>
      <div className="mt-4 flex flex-1 flex-col justify-center gap-2 px-2">
        <div className="h-2 w-full bg-muted/80 rounded-full" />
        <div className="h-2 w-[88%] bg-muted/60 rounded-full" />
        <div className="h-2 w-[72%] bg-muted/40 rounded-full" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border/80 pt-3">
        <div className="h-4 w-10 bg-muted rounded-md" />
        <div className="size-8 bg-muted rounded-lg" />
      </div>
    </div>
  )

  return (
    <section aria-hidden>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={`top-${i}`}>{card}</div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={`bottom-${i}`}>{card}</div>
        ))}
      </div>
    </section>
  )
}

/** Three-column lab overview (dashboard). */
export function DashboardLabGridSkeleton() {
  const card = (colClass: string) => (
    <div
      className={cn(
        "flex h-72 flex-col rounded-xl border border-border bg-card",
        colClass,
      )}
    >
      <div className="border-b border-border px-6 py-4">
        <div className="h-5 w-24 bg-muted rounded-md" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="h-16 rounded-md bg-muted/60" />
        <div className="h-10 rounded-md bg-muted/40" />
        <div className="mt-auto h-8 w-28 bg-muted rounded-md" />
      </div>
    </div>
  )

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 md:gap-5 xl:grid-cols-12">
      {card("xl:col-span-4")}
      {card("xl:col-span-5")}
      {card("xl:col-span-3")}
    </div>
  )
}

/** Schedule/tasks + whiteboard bench (planner). */
export function DashboardBenchSkeleton() {
  const panel = (
    <div className="flex h-full min-h-[280px] flex-col overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <div className="h-8 w-32 bg-muted rounded-md" />
      </div>
      <div className="flex-1 space-y-3 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <div className="h-3 w-8 bg-muted rounded-md shrink-0" />
            <div className="h-10 flex-1 bg-muted/60 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="grid flex-1 grid-cols-1 gap-4 md:gap-5 xl:grid-cols-12 xl:items-stretch min-h-[min(100%,calc(100dvh-17rem))]">
      <div className="flex min-h-[280px] flex-col xl:col-span-5">{panel}</div>
      <div className="flex min-h-[280px] flex-col xl:col-span-7">
        <div className="flex h-full min-h-[280px] flex-col overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="h-5 w-24 bg-muted rounded-md" />
            <div className="h-4 w-16 bg-muted rounded-md" />
          </div>
          <div className="flex-1 bg-muted/30 m-3 rounded-md" />
        </div>
      </div>
    </div>
  )
}

/** Equipment: toolbar, filters, status cards, table. */
export function EquipmentPageSkeleton() {
  return (
    <>
      <ResourceListToolbarSkeleton />
      <ResourceFilterRowSkeleton count={3} />
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="h-4 w-20 bg-muted rounded-md" />
            <div className="h-7 w-12 bg-muted rounded-md" />
          </div>
        ))}
      </div>
      <TableListSkeleton showHeader={false} showFilters={false} />
    </>
  )
}

/** List pages with Catalyst + filters + table. */
export function CatalystListPageSkeleton({
  filterCount = 2,
  rows = 5,
}: {
  filterCount?: number
  rows?: number
}) {
  return (
    <>
      <CatalystComposerSkeleton />
      <ResourceListToolbarSkeleton />
      {filterCount > 0 ? <ResourceFilterRowSkeleton count={filterCount} /> : null}
      <TableListSkeleton showHeader={false} showFilters={false} rows={rows} />
    </>
  )
}

/** Standard list table used on experiments, samples, protocols, etc. */
export function TableListSkeleton({
  rows = 5,
  showFilters = true,
  showHeader = true,
}: {
  rows?: number
  showFilters?: boolean
  showHeader?: boolean
}) {
  return (
    <>
      {showHeader && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-muted rounded-md" />
            <div className="h-4 w-72 bg-muted rounded-md" />
          </div>
          <div className="h-9 w-32 bg-muted rounded-md" />
        </div>
      )}
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <div className="h-8 w-28 bg-muted rounded-md" />
          <div className="h-8 w-28 bg-muted rounded-md" />
        </div>
      )}
      <div className="rounded-md border">
        <div className="border-b px-4 py-3 flex gap-8">
          <div className="h-4 w-48 bg-muted rounded-md" />
          <div className="h-4 w-24 bg-muted rounded-md" />
          <div className="h-4 w-16 bg-muted rounded-md ml-auto" />
        </div>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="border-b last:border-0 px-4 py-3 flex items-center gap-8"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="h-4 w-4 bg-muted rounded shrink-0" />
              <div className="h-4 flex-1 max-w-md bg-muted rounded-md" />
            </div>
            <div className="h-4 w-24 bg-muted rounded-md hidden sm:block" />
            <div className="h-4 w-8 bg-muted rounded-md ml-auto" />
          </div>
        ))}
      </div>
    </>
  )
}

/** Literature reviews: page title + tabs + grid (composer is separate). */
export function LiteraturePageSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PageHeadingSkeleton />
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-muted rounded-md" />
          <div className="h-9 w-32 bg-muted rounded-md" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-20 bg-muted rounded-md" />
        <div className="h-9 w-20 bg-muted rounded-md" />
        <div className="h-9 w-20 bg-muted rounded-md" />
      </div>
      <div className="space-y-4">
        <div className="h-10 w-full bg-muted rounded-md" />
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
              <div className="h-5 w-3/4 bg-muted rounded-md" />
              <div className="h-4 w-full bg-muted rounded-md" />
              <div className="h-4 w-1/2 bg-muted rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/** Papers workspace: tabs + split pane. */
export function PapersPageSkeleton() {
  return (
    <>
      <div className="flex gap-2 border-b border-border pb-2">
        <div className="h-9 w-24 bg-muted rounded-md" />
        <div className="h-9 w-28 bg-muted rounded-md" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,280px)_1fr] min-h-[400px]">
        <div className="rounded-lg border bg-card p-3 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-muted/60 rounded-md" />
          ))}
        </div>
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <div className="h-6 w-48 bg-muted rounded-md" />
          <div className="h-4 w-full bg-muted rounded-md" />
          <div className="h-4 w-5/6 bg-muted rounded-md" />
          <div className="flex-1 min-h-[200px] bg-muted/30 rounded-md" />
        </div>
      </div>
    </>
  )
}
