"use client"

import { MarketingAppPreview } from "@/components/marketing/app-preview/marketing-app-preview"
import { START_TOUR_EVENT } from "@/components/marketing/app-preview/preview-tour"
import { Button } from "@/components/ui/button"

/**
 * Interactive Notes9 shell for the marketing home page (post–`main` layout).
 * Inserted after `AcademicHero` only; does not change the hero or diagram.
 */
export function MarketingInteractivePreviewSection() {
  return (
    <section
      id="try-notes9"
      className="border-t border-border/40 scroll-mt-[calc(4rem+0.5rem)]"
      aria-labelledby="try-notes9-heading"
    >
      <p className="mb-3 text-center text-[11px] text-muted-foreground sm:text-left">
        <a href="#after-interactive-preview" className="underline underline-offset-2 hover:text-foreground">
          Skip to next section
        </a>
      </p>
      <div className="container mx-auto px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-5xl text-left">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--n9-accent)]">Try the workspace</p>
              <h2 id="try-notes9-heading" className="mt-2 font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
                Explore the app in a safe, hands-on preview
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                Walk through a sample project flow—projects, experiments, lab notes, literature, and a limited assistant—
                the same structure as the full Notes9 experience. No account required; your note text is kept in this browser
                session only.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 self-start sm:mb-1"
              onClick={() => {
                if (typeof window === "undefined") return
                window.dispatchEvent(new CustomEvent(START_TOUR_EVENT))
              }}
            >
              Start guided tour
            </Button>
          </div>
        </div>
        <div className="mx-auto mt-8 max-w-6xl">
          <MarketingAppPreview />
        </div>
      </div>
    </section>
  )
}
