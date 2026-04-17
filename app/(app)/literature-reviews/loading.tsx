export default function LiteratureReviewsLoading() {
  return (
    <div className="space-y-4 md:space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-8 w-48 bg-muted rounded-md" />
          <div className="h-4 w-64 bg-muted rounded-md mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-muted rounded-md" />
          <div className="h-9 w-32 bg-muted rounded-md" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <div className="h-9 w-20 bg-muted rounded-md" />
        <div className="h-9 w-20 bg-muted rounded-md" />
        <div className="h-9 w-20 bg-muted rounded-md" />
      </div>

      {/* Tab content placeholder */}
      <div className="space-y-4">
        <div className="h-10 w-full bg-muted rounded-md" />
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
              <div className="h-5 w-3/4 bg-muted rounded-md" />
              <div className="h-4 w-full bg-muted rounded-md" />
              <div className="h-4 w-1/2 bg-muted rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
