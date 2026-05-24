import { CatalystComposerSkeleton, TableListSkeleton } from "@/components/loading/page-skeletons"

export default function LabNotesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <CatalystComposerSkeleton />
      <TableListSkeleton showHeader={false} />
    </div>
  )
}
