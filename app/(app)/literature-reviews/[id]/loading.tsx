import { BreadcrumbSkeleton, PageHeadingSkeleton } from "@/components/loading/page-skeletons"

/**
 * Detail-shaped fallback for `/literature-reviews/[id]`.
 *
 * Without this file the parent `../loading.tsx` (the LIST skeleton) is used as
 * the Suspense fallback for the whole subtree, so navigating into a paper
 * briefly re-rendered the list — the "returns to the same page and loads again"
 * flash. This mirrors the layout of `[id]/page.tsx` (`space-y-6` → breadcrumb →
 * LiteratureDetailView) so the transition reads as one continuous load.
 */
export default function LiteratureReviewDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <BreadcrumbSkeleton />

      {/* Title + meta header */}
      <div className="space-y-3">
        <PageHeadingSkeleton />
        <div className="flex gap-2">
          <div className="h-6 w-24 bg-muted rounded-full" />
          <div className="h-6 w-20 bg-muted rounded-full" />
          <div className="h-6 w-28 bg-muted rounded-full" />
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-4 border-b border-border pb-2">
        <div className="h-5 w-20 bg-muted rounded-md" />
        <div className="h-5 w-24 bg-muted rounded-md" />
        <div className="h-5 w-16 bg-muted rounded-md" />
      </div>

      {/* Content body */}
      <div className="space-y-3">
        <div className="h-4 w-full bg-muted rounded-md" />
        <div className="h-4 w-11/12 bg-muted rounded-md" />
        <div className="h-4 w-10/12 bg-muted rounded-md" />
        <div className="h-4 w-9/12 bg-muted rounded-md" />
        <div className="h-64 w-full bg-muted rounded-lg" />
      </div>
    </div>
  )
}
