import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="min-w-0 space-y-4 pb-6 md:space-y-6">
      {/* Welcome Section */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* Quick Actions Card */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>

      {/* Recent Experiments + Recent Notes */}
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-5 w-40" />
            </CardTitle>
            <CardDescription className="space-y-0">
              <Skeleton className="h-4 w-56" />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4 max-w-[280px]" />
                    <Skeleton className="h-3 w-1/2 max-w-[180px]" />
                    <Skeleton className="h-3 w-1/3 max-w-[120px]" />
                  </div>
                  <Skeleton className="h-5 w-16 shrink-0" />
                </div>
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded-md" />
              <Skeleton className="h-5 w-32" />
            </CardTitle>
            <CardDescription className="space-y-0">
              <Skeleton className="h-4 w-40" />
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-b pb-4 last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4 max-w-[280px]" />
                    <Skeleton className="h-3 w-1/2 max-w-[200px]" />
                    <Skeleton className="h-3 w-1/3 max-w-[140px]" />
                  </div>
                  <Skeleton className="h-5 w-14 shrink-0" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Todo Panel */}
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="space-y-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-4 shrink-0 rounded" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
