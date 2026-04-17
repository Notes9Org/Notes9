export default function DashboardLoading() {
  return (
    <div className="min-w-0 space-y-4 md:space-y-6 pb-6 animate-pulse">
      {/* Welcome Section */}
      <div>
        <div className="h-8 w-48 bg-muted rounded-md" />
        <div className="h-4 w-72 bg-muted rounded-md mt-2" />
      </div>

      {/* Quick Actions Card */}
      <div className="rounded-xl border bg-card p-6">
        <div className="h-5 w-28 bg-muted rounded-md" />
        <div className="h-4 w-48 bg-muted rounded-md mt-1" />
        <div className="flex flex-wrap gap-2 mt-4">
          <div className="h-9 w-36 bg-muted rounded-md" />
          <div className="h-9 w-32 bg-muted rounded-md" />
          <div className="h-9 w-32 bg-muted rounded-md" />
        </div>
      </div>

      {/* 2-column grid: Recent Experiments + Recent Notes */}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {/* Recent Experiments */}
        <div className="rounded-xl border bg-card p-6 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-muted rounded-md" />
            <div className="h-5 w-40 bg-muted rounded-md" />
          </div>
          <div className="h-4 w-56 bg-muted rounded-md mt-1" />
          <div className="space-y-4 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <div className="h-4 w-3/4 bg-muted rounded-md" />
                    <div className="h-3 w-1/2 bg-muted rounded-md" />
                    <div className="h-3 w-1/3 bg-muted rounded-md" />
                  </div>
                  <div className="h-5 w-16 bg-muted rounded-md" />
                </div>
                <div className="h-2 w-full bg-muted rounded-md" />
              </div>
            ))}
          </div>
        </div>

        {/* Recent Notes */}
        <div className="rounded-xl border bg-card p-6 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 bg-muted rounded-md" />
            <div className="h-5 w-32 bg-muted rounded-md" />
          </div>
          <div className="h-4 w-40 bg-muted rounded-md mt-1" />
          <div className="space-y-4 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="pb-4 border-b last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 flex-1">
                    <div className="h-4 w-3/4 bg-muted rounded-md" />
                    <div className="h-3 w-1/2 bg-muted rounded-md" />
                    <div className="h-3 w-1/3 bg-muted rounded-md" />
                  </div>
                  <div className="h-5 w-14 bg-muted rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Todo Panel */}
      <div className="grid min-w-0 gap-4">
        <div className="rounded-xl border bg-card p-6">
          <div className="h-5 w-20 bg-muted rounded-md" />
          <div className="h-4 w-48 bg-muted rounded-md mt-1" />
          <div className="space-y-3 mt-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-4 bg-muted rounded" />
                <div className="h-4 flex-1 bg-muted rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
