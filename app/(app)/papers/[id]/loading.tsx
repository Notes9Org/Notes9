export default function PaperDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 bg-muted rounded-md" />
        <div className="h-8 w-1/2 bg-muted rounded-md" />
        <div className="h-6 w-20 bg-muted rounded-md ml-auto" />
      </div>
      <div className="rounded-md border p-4 space-y-3">
        <div className="h-4 w-full bg-muted rounded-md" />
        <div className="h-4 w-5/6 bg-muted rounded-md" />
        <div className="h-4 w-3/4 bg-muted rounded-md" />
        <div className="h-4 w-2/3 bg-muted rounded-md" />
        <div className="h-4 w-4/5 bg-muted rounded-md" />
      </div>
    </div>
  )
}
