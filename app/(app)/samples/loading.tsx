export default function SamplesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Description + toggle row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="h-4 w-56 bg-muted rounded-md" />
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-8 w-36 bg-muted rounded-md" />
          <div className="h-8 w-8 bg-muted rounded-md" />
        </div>
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-28 bg-muted rounded-md" />
        <div className="h-8 w-28 bg-muted rounded-md" />
        <div className="h-8 w-28 bg-muted rounded-md" />
      </div>

      {/* 4-column status cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {["Available", "In Use", "Depleted", "Disposed"].map((label) => (
          <div key={label} className="rounded-xl border bg-card p-6">
            <div className="h-4 w-16 bg-muted rounded-md" />
            <div className="h-7 w-10 bg-muted rounded-md mt-2" />
          </div>
        ))}
      </div>

      {/* Card grid */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
            <div className="h-5 w-3/4 bg-muted rounded-md" />
            <div className="h-4 w-1/2 bg-muted rounded-md" />
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 bg-muted rounded-md" />
              <div className="h-5 w-14 bg-muted rounded-md" />
            </div>
            <div className="h-4 w-2/3 bg-muted rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
