import {
  CatalystComposerSkeleton,
  TableListSkeleton,
} from "@/components/loading/page-skeletons"

export default function EquipmentLoading() {
  return (
    <div className="space-y-6">
      <CatalystComposerSkeleton />
      <TableListSkeleton rows={5} />
    </div>
  )
}
