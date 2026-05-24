import { CatalystListPageSkeleton } from "@/components/loading/page-skeletons"

export default function ExperimentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <CatalystListPageSkeleton filterCount={0} />
    </div>
  )
}
