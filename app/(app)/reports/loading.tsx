import { CatalystComposerSkeleton, TableListSkeleton } from "@/components/loading/page-skeletons"

export default function ReportsLoading() {
  return (
    <div className="space-y-4 md:space-y-6 animate-pulse">
      <CatalystComposerSkeleton />
      <TableListSkeleton showHeader={false} showFilters={false} />
    </div>
  )
}
