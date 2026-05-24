import { CatalystListPageSkeleton } from "@/components/loading/page-skeletons"

export default function ProjectsLoading() {
  return (
    <div className="flex flex-col gap-6 md:gap-8 pb-8 animate-pulse">
      <CatalystListPageSkeleton filterCount={2} />
    </div>
  )
}
