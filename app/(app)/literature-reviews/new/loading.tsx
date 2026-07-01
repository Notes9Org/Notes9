import { PageHeadingSkeleton } from "@/components/loading/page-skeletons"

/**
 * Form-shaped fallback for `/literature-reviews/new`.
 *
 * Without this file the parent `../loading.tsx` (the LIST skeleton) is the
 * Suspense fallback for this route too, so opening "New review" flashed the
 * list before the form appeared. This mirrors `new/page.tsx` (centered
 * `max-w-3xl` column → back button + heading → card form).
 */
export default function LiteratureReviewNewLoading() {
  return (
    <div className="max-w-3xl mx-auto space-y-4 md:space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 bg-muted rounded-md shrink-0" />
        <div className="min-w-0 space-y-2">
          <div className="h-6 w-48 bg-muted rounded-md" />
          <div className="h-4 w-64 bg-muted rounded-md" />
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-border p-6 space-y-4">
          <PageHeadingSkeleton subtitle={false} />
          <div className="h-10 w-full bg-muted rounded-md" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 w-full bg-muted rounded-md" />
            <div className="h-10 w-full bg-muted rounded-md" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-10 w-full bg-muted rounded-md" />
            <div className="h-10 w-full bg-muted rounded-md" />
            <div className="h-10 w-full bg-muted rounded-md" />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <div className="h-10 w-24 bg-muted rounded-md" />
          <div className="h-10 w-32 bg-muted rounded-md" />
        </div>
      </div>
    </div>
  )
}
