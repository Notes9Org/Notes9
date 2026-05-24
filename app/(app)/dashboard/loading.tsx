import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 md:gap-8 pb-8">
      <div className="flex flex-col gap-2">
        <Skeleton variant="title" className="w-64" />
        <Skeleton variant="text" className="w-96" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:gap-5 xl:grid-cols-12">
        <Skeleton variant="card" className="h-72 xl:col-span-4" />
        <Skeleton variant="card" className="h-72 xl:col-span-5" />
        <Skeleton variant="card" className="h-72 xl:col-span-3" />
      </div>
    </div>
  )
}
