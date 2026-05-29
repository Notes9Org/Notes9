import {
  CatalystComposerSkeleton,
  PapersPageSkeleton,
} from "@/components/loading/page-skeletons"

export default function PapersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <CatalystComposerSkeleton />
      <PapersPageSkeleton />
    </div>
  )
}
