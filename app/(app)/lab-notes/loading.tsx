import { CatalystListPageSkeleton } from "@/components/loading/page-skeletons"

export default function LabNotesLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <CatalystListPageSkeleton filterCount={2} />
    </div>
  )
}
