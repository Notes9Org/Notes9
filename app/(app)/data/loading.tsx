import {
  CatalystComposerSkeleton,
  ResourceListToolbarSkeleton,
  ResourceFilterRowSkeleton,
  TableListSkeleton,
} from "@/components/loading/page-skeletons"

/** Mirrors Data & Files: composer, toolbar, project/experiment filters, table. */
export default function DataFilesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <CatalystComposerSkeleton />
      <ResourceListToolbarSkeleton />
      <ResourceFilterRowSkeleton count={2} />
      <TableListSkeleton showHeader={false} showFilters={false} />
    </div>
  )
}
