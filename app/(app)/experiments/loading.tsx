import { CatalystListPageSkeleton } from "@/components/loading/page-skeletons"

export default function ExperimentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Project + Status filters are now always visible on the list. */}
      <CatalystListPageSkeleton filterCount={2} />
    </div>
  )
}
