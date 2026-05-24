import { CatalystListPageSkeleton } from "@/components/loading/page-skeletons"

export default function ProtocolsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <CatalystListPageSkeleton />
    </div>
  )
}
