import { CatalystListPageSkeleton } from "@/components/loading/page-skeletons"

/** Mirrors the Writing list: composer, toolbar, project filter, table. */
export default function PapersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <CatalystListPageSkeleton filterCount={1} />
    </div>
  )
}
