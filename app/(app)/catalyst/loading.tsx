/** Full-page Catalyst chat: full-height pane with a centered composer block. */
export default function CatalystLoading() {
  return (
    <div className="flex h-full min-h-[60vh] w-full flex-1 animate-pulse flex-col items-center justify-center gap-4 overflow-hidden p-6">
      <div className="h-7 w-64 max-w-full rounded-md bg-muted" />
      <div className="w-full max-w-2xl rounded-2xl border border-border/60 bg-muted/20 p-3">
        <div className="min-h-[72px] w-full rounded-md bg-muted/50" />
        <div className="mt-2 flex items-center justify-between">
          <div className="size-7 rounded-lg bg-muted" />
          <div className="size-9 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  )
}
