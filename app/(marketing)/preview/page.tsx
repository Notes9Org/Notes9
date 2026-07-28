import type { Metadata } from "next"
import {
  CatalystBand,
  ChainSection,
  ClosingSection,
  FractureSection,
  HeroEditorial,
  ProofBand,
} from "@/components/marketing/home-editorial"

export const metadata: Metadata = {
  title: "Notes9 — preview",
  description:
    "Preview of the editorial homepage direction: organic colour fields, monospace section labels and an expandable research chain.",
  // Not a page we want indexed while it is a candidate rather than the homepage.
  robots: { index: false, follow: false },
}

/**
 * Candidate homepage, parked on its own route.
 *
 * Kept separate from `app/page.tsx` deliberately: the live homepage is the
 * site's highest-traffic surface, and a redesign this large should be looked at
 * before it replaces anything. Promoting it is a copy of this composition into
 * `app/page.tsx` (which also renders Header/Footer itself and handles the
 * logged-in redirect) — no component changes required.
 *
 * Design notes, and why this does not look like the default AI-startup page:
 *
 *  - Warm neutrals and terracotta, never dark-blue enterprise SaaS. The one
 *    dark band is a deliberate temperature change, not the default.
 *  - Organic out-of-focus colour fields instead of hard geometric gradients or
 *    flat vector art, so backgrounds read as photographed depth rather than CSS.
 *  - Source Serif headlines at display sizes with tight tracking, against
 *    monospace index labels — an editorial pairing, not the Inter-everywhere
 *    default.
 *  - Structure carried by hairline rules and numbers rather than by boxing
 *    everything into cards.
 *  - Every statistic is sourced inline; the product claims map to features that
 *    actually exist.
 */
export default function HomePreviewPage() {
  return (
    <>
      <HeroEditorial />
      <ProofBand />
      <FractureSection />
      <ChainSection />
      <CatalystBand />
      <ClosingSection />
    </>
  )
}
