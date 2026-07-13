import {
  CatalystComposerSkeleton,
  ResourceListToolbarSkeleton,
  ResourceFilterRowSkeleton,
  TableListSkeleton,
} from "@/components/loading/page-skeletons"

/** Mirrors the Samples page: composer, toolbar, four filters, status cards, list. */
export default function SamplesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <CatalystComposerSkeleton />
      <ResourceListToolbarSkeleton />
      <ResourceFilterRowSkeleton count={4} />
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="h-4 w-20 bg-muted rounded-md" />
            <div className="h-7 w-12 bg-muted rounded-md" />
          </div>
        ))}
      </div>
      <TableListSkeleton showHeader={false} showFilters={false} />
    </div>
  )
}
