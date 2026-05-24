import { Suspense } from "react"
import { PapersPageInner } from "./papers-page-inner"
import { CatalystSectionHero } from "@/components/catalyst/catalyst-section-hero"

export default function PapersPage() {
  return (
    <div className="space-y-6">
      <CatalystSectionHero size="sm" scope="writing" />
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">
            Loading writing workspace…
          </div>
        }
      >
        <PapersPageInner />
      </Suspense>
    </div>
  )
}
