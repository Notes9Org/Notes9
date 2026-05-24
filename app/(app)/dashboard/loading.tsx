import {
  CenteredGreetingSkeleton,
  CatalystComposerSkeleton,
  DashboardLabGridSkeleton,
} from "@/components/loading/page-skeletons"

export default function DashboardLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 md:gap-8 pb-8 min-w-0 animate-pulse">
      <CenteredGreetingSkeleton />
      <CatalystComposerSkeleton size="lg" />
      <DashboardLabGridSkeleton />
    </div>
  )
}
