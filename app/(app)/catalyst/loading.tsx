export default function CatalystLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-32 bg-muted rounded-md" />
        <div className="h-4 w-64 bg-muted rounded-md" />
      </div>
      <div className="h-[400px] w-full bg-muted/40 rounded-lg" />
    </div>
  )
}
