import { EquipmentPageSkeleton } from "@/components/loading/page-skeletons"

export default function EquipmentLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <EquipmentPageSkeleton />
    </div>
  )
}
