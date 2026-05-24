import { cn } from "@/lib/utils"

export function BreadcrumbSkeleton({ className }: { className?: string }) {
  return <div className={cn("h-4 w-40 bg-muted rounded-md", className)} />
}

/** Centered sparkle + greeting line (dashboard, projects list). */
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

/** Fancy rounded composer (CatalystSectionHero). */
export function CatalystComposerSkeleton({
  className,
  maxWidth = "max-w-3xl",
  height = "h-12",
}: {
  className?: string
  maxWidth?: string
  height?: string
}) {
  return (
    <div className={cn("mx-auto w-full", maxWidth, className)}>
      <div
        className={cn(
          "flex items-center gap-2 overflow-hidden rounded-2xl border border-border/70 bg-card pl-5 pr-2 shadow-sm",
          height,
        )}
      >
        <div className="h-4 flex-1 max-w-sm rounded-md bg-muted" />
        <div className="size-9 shrink-0 rounded-full bg-muted" />
      </div>
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

/** Schedule/tasks + whiteboard bench (dashboard). */
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

  // Class strings here MUST stay in lock-step with the real Bench in
  // app/(app)/dashboard/page.tsx so the skeleton lays out identically.
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

/** Literature reviews: hero + page title + tabs + grid. */
export function LiteraturePageSkeleton() {
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-52 bg-muted rounded-md" />
          <div className="h-4 w-64 bg-muted rounded-md mt-2" />
        </div>
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
