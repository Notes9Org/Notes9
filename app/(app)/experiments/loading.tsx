export default function ExperimentsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Description + toggle row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="h-4 w-72 bg-muted rounded-md" />
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-8 w-36 bg-muted rounded-md" />
          <div className="h-8 w-8 bg-muted rounded-md" />
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-28 bg-muted rounded-md" />
        <div className="h-8 w-28 bg-muted rounded-md" />
      </div>

      {/* 3-column card grid */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-4">
            <div className="space-y-2">
              <div className="h-5 w-3/4 bg-muted rounded-md" />
              <div className="h-4 w-full bg-muted rounded-md" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 bg-muted rounded-md" />
              <div className="h-5 w-14 bg-muted rounded-md" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-32 bg-muted rounded-md" />
              <div className="h-2 w-full bg-muted rounded-md" />
            </div>
            <div className="h-8 w-full bg-muted rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
