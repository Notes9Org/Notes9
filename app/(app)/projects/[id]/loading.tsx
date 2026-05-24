import {
  BreadcrumbSkeleton,
  CatalystComposerSkeleton,
  ProjectHeaderRowSkeleton,
  ProjectWorkspaceGridSkeleton,
} from "@/components/loading/page-skeletons"

export default function ProjectDetailLoading() {
  return (
    <div className="space-y-5 md:space-y-6 pb-8 animate-pulse">
      <BreadcrumbSkeleton />
      <ProjectHeaderRowSkeleton />
      <CatalystComposerSkeleton maxWidth="max-w-4xl" height="h-14" />
      <ProjectWorkspaceGridSkeleton />
    </div>
  )
}
