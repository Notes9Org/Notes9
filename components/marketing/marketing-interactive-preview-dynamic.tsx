"use client"

import dynamic from "next/dynamic"

const MarketingInteractivePreviewSection = dynamic(
  () =>
    import("@/components/marketing/marketing-interactive-preview-section").then((m) => ({
      default: m.MarketingInteractivePreviewSection,
    })),
  {
    ssr: false,
    loading: () => (
      <section className="border-t border-border/40" aria-hidden>
        <div className="container mx-auto px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <div className="mx-auto h-[min(60vh,520px)] max-w-6xl animate-pulse rounded-2xl bg-muted/35" />
        </div>
      </section>
    ),
  }
)

export function MarketingInteractivePreviewDynamic() {
  return <MarketingInteractivePreviewSection />
}
