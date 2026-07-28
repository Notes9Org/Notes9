"use client"

import { HeroSearch } from "@/components/marketing/hero-search"

/**
 * Literature-search hero.
 *
 * The product is not shown *beside* the pitch here — it is the surface the
 * pitch sits on. A real capture of the literature page fills the section,
 * sidebar and all, so the visitor is looking at Notes9 before they have read a
 * word. The only live control is our own search bar, floating sharp above it.
 *
 * Two deliberate constraints make that work:
 *
 *  1. The capture is pushed back — softened, desaturated and washed with the
 *     page background — so it reads as context rather than as an interface
 *     competing for clicks. Without that the visitor tries to use the app's own
 *     search field, which is a picture.
 *  2. There are no other calls to action. The buttons that used to sit under
 *     the search bar were splitting attention three ways; here the single
 *     working control is the one the whole section is about. Sign-up is still a
 *     click away in the header, and running a search routes into it anyway.
 */
export function HeroLiterature() {
  return (
    <section className="relative isolate flex min-h-[86svh] items-center overflow-hidden">
      {/* ── The product, as backdrop ─────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <img
          src="/demo/light/literature-search.png"
          alt=""
          className="absolute inset-0 hidden h-full w-full object-cover object-left-top blur-[2px] saturate-[0.85] dark:hidden sm:block"
        />
        <img
          src="/demo/dark/literature-search.png"
          alt=""
          className="absolute inset-0 hidden h-full w-full object-cover object-left-top blur-[2px] saturate-[0.85] dark:sm:block"
        />

        {/* Wash. Heavier through the middle where the type sits, lighter at the
            left edge so the sidebar stays legible as context. */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,color-mix(in_oklab,var(--background)_62%,transparent)_0%,color-mix(in_oklab,var(--background)_88%,transparent)_28%,color-mix(in_oklab,var(--background)_92%,transparent)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(72%_58%_at_54%_46%,color-mix(in_oklab,var(--background)_84%,transparent),transparent_78%)]" />

        {/* Same warmth and texture the rest of the page uses, so this section
            still belongs to the site rather than to the app. */}
        <div className="n9-organic n9-organic-mask opacity-70" />
        <div className="n9-grain-overlay" />
        <div className="n9-vignette" />
      </div>

      {/* ── The one live control ─────────────────────────────────────────── */}
      <div className="container relative mx-auto px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="n9-label n9-rise" style={{ ["--n9-rise-delay" as string]: "60ms" }}>
            The connected research workspace
          </p>

          <h1 className="mt-7 font-serif tracking-[-0.03em] text-[clamp(2.4rem,6vw,4.8rem)] leading-[1.0]">
            <span
              className="n9-rise block text-foreground"
              style={{ ["--n9-rise-delay" as string]: "140ms" }}
            >
              AI that answers from
            </span>
            <span
              className="n9-rise block text-muted-foreground"
              style={{ ["--n9-rise-delay" as string]: "240ms" }}
            >
              your lab&apos;s actual work.
            </span>
          </h1>

          <p
            className="n9-rise mt-6 max-w-xl text-[17px] leading-7 text-foreground/80"
            style={{ ["--n9-rise-delay" as string]: "320ms" }}
          >
            Every paper, protocol, result and note stays linked. Ask a real research
            question and see it answered from live literature — cited, in seconds.
          </p>

          <div
            className="n9-rise mt-10 w-full max-w-2xl"
            style={{ ["--n9-rise-delay" as string]: "400ms" }}
          >
            <HeroSearch />
          </div>
        </div>
      </div>
    </section>
  )
}
