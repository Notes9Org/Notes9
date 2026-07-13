/** Mirrors the Research map: compact heading, controls row, full-height canvas. */
export default function ResearchMapLoading() {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col animate-pulse">
      <div className="px-3 sm:px-4 md:px-6 pt-3 md:pt-4 pb-2 space-y-1.5">
        <div className="h-6 w-40 bg-muted rounded-md" />
        <div className="h-4 w-72 max-w-full bg-muted rounded-md" />
      </div>
      <div className="flex flex-wrap gap-2 px-3 sm:px-4 md:px-6 pb-3">
        <div className="h-9 w-40 bg-muted rounded-md" />
        <div className="h-9 w-40 bg-muted rounded-md" />
        <div className="h-9 w-28 bg-muted rounded-md" />
      </div>
      <div className="mx-3 sm:mx-4 md:mx-6 mb-4 flex-1 min-h-[400px] rounded-lg bg-muted/40" />
    </div>
  )
}
