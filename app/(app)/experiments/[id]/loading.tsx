export default function ExperimentDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-4 w-64 bg-muted rounded-md" />
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 flex-1">
          <div className="h-8 w-2/3 bg-muted rounded-md" />
          <div className="h-4 w-32 bg-muted rounded-md" />
        </div>
        <div className="h-9 w-28 bg-muted rounded-md" />
      </div>
      <div className="flex gap-2">
        <div className="h-9 w-20 bg-muted rounded-md" />
        <div className="h-9 w-20 bg-muted rounded-md" />
        <div className="h-9 w-28 bg-muted rounded-md" />
        <div className="h-9 w-24 bg-muted rounded-md" />
      </div>
      <div className="rounded-md border p-4 space-y-3">
        <div className="h-5 w-40 bg-muted rounded-md" />
        <div className="h-4 w-full bg-muted rounded-md" />
        <div className="h-4 w-5/6 bg-muted rounded-md" />
        <div className="h-4 w-3/4 bg-muted rounded-md" />
      </div>
    </div>
  )
}
