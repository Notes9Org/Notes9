export default function ProtocolsLoading() {
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

      {/* Tabs */}
      <div className="h-9 w-40 bg-muted rounded-md" />

      {/* Filter row */}
      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-28 bg-muted rounded-md" />
        <div className="h-8 w-28 bg-muted rounded-md" />
      </div>

      {/* Card grid */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
            <div className="h-5 w-3/4 bg-muted rounded-md" />
            <div className="h-4 w-full bg-muted rounded-md" />
            <div className="flex items-center gap-2">
              <div className="h-5 w-16 bg-muted rounded-md" />
              <div className="h-5 w-14 bg-muted rounded-md" />
            </div>
            <div className="h-4 w-1/2 bg-muted rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
