export default function ProtocolsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-48 bg-muted rounded-md" />
          <div className="h-4 w-72 bg-muted rounded-md" />
        </div>
        <div className="h-9 w-32 bg-muted rounded-md" />
      </div>
      {/* Filter row */}
      <div className="flex flex-wrap gap-2">
        <div className="h-8 w-28 bg-muted rounded-md" />
        <div className="h-8 w-28 bg-muted rounded-md" />
      </div>
      {/* Table skeleton */}
      <div className="rounded-md border">
        <div className="border-b px-4 py-3 flex gap-8">
          <div className="h-4 w-48 bg-muted rounded-md" />
          <div className="h-4 w-24 bg-muted rounded-md" />
          <div className="h-4 w-16 bg-muted rounded-md ml-auto" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border-b last:border-0 px-4 py-3 flex items-center gap-8">
            <div className="flex items-center gap-2 flex-1">
              <div className="h-4 w-4 bg-muted rounded" />
              <div className="h-4 w-3/4 bg-muted rounded-md" />
            </div>
            <div className="h-4 w-24 bg-muted rounded-md" />
            <div className="h-4 w-8 bg-muted rounded-md ml-auto" />
          </div>
        ))}
      </div>
    </div>
  )
}
