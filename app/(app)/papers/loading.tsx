export default function PapersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Description + button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-4 w-80 bg-muted rounded-md" />
        <div className="h-9 w-28 bg-muted rounded-md shrink-0" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <div className="h-9 w-24 bg-muted rounded-md" />
        <div className="h-9 w-28 bg-muted rounded-md" />
        <div className="h-9 w-28 bg-muted rounded-md" />
      </div>

      {/* Tab content placeholder */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
            <div className="h-5 w-3/4 bg-muted rounded-md" />
            <div className="h-4 w-full bg-muted rounded-md" />
            <div className="h-4 w-1/2 bg-muted rounded-md" />
            <div className="h-3 w-1/3 bg-muted rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
