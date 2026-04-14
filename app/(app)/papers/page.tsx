import { Suspense } from "react"
import { PapersPageInner } from "./papers-page-inner"

export default function PapersPage() {
  return (
    <Suspense
      fallback={
        <div className="text-sm text-muted-foreground">
          Loading writing workspace…
        </div>
      }
    >
      <PapersPageInner />
    </Suspense>
  )
}
