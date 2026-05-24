import {
  BreadcrumbSkeleton,
  CatalystComposerSkeleton,
  TableListSkeleton,
} from "@/components/loading/page-skeletons"

export default function ExperimentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <BreadcrumbSkeleton className="w-56" />
      <CatalystComposerSkeleton />
      <TableListSkeleton showHeader={false} />
    </div>
  )
}
