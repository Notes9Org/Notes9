import { LiteraturePageSkeleton } from "@/components/loading/page-skeletons"

export default function LiteratureReviewsLoading() {
  return (
    <div className="space-y-4 md:space-y-6 animate-pulse">
      <LiteraturePageSkeleton />
    </div>
  )
}
