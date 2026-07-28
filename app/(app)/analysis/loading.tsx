import {
  CatalystComposerSkeleton,
  ResourceListToolbarSkeleton,
  ResourceFilterRowSkeleton,
  TableListSkeleton,
} from "@/components/loading/page-skeletons"

/** Mirrors Analysis: composer, toolbar, project/experiment filters, table. */
export default function AnalysisLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <CatalystComposerSkeleton />
      <ResourceListToolbarSkeleton />
      <ResourceFilterRowSkeleton count={2} />
      <TableListSkeleton showHeader={false} showFilters={false} />
    </div>
  )
}
