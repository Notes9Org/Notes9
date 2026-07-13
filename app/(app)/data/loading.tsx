import {
  ResourceListToolbarSkeleton,
  ResourceFilterRowSkeleton,
  TableListSkeleton,
} from "@/components/loading/page-skeletons"

/** Mirrors the Data & Files list: toolbar, project/experiment filters, table. */
export default function DataFilesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <ResourceListToolbarSkeleton />
      <ResourceFilterRowSkeleton count={2} />
      <TableListSkeleton showHeader={false} showFilters={false} />
    </div>
  )
}
