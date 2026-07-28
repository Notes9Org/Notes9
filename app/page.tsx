import { redirect } from 'next/navigation'
import { getCurrentUser } from "@/lib/auth/current-user"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { ArrowUpRight } from "@phosphor-icons/react/ssr"
import { ContactForm } from "@/components/marketing/contact-form"
import { FloatingPageMenu } from "@/components/marketing/floating-page-menu"
import { HeroSplit } from "@/components/marketing/hero-split"
import {
  CatalystBand,
  ChainSection,
  ClosingSection,
  FractureSection,
  ProofBand,
} from "@/components/marketing/home-editorial"

import "@/styles/marketing.css"

/**
 * Only routes that correspond to something that exists.
 *
 * "Data & governance" and "Press & partnerships" were removed: the first implies
 * a formal governance programme and the second a press function, and the brand
 * guardrails are explicit about not implying capabilities or certifications we
 * cannot back. What is left maps to real surfaces — the demo the header already
 * offers, and the Free/Enterprise tiers on the pricing page.
 */
const ENQUIRIES = [
  {
    label: "Book a demo",
    subject: "Notes9 demo",
    hint: "A 15-minute walkthrough against your own workflow.",
  },
  {
    label: "Pricing & plans",
    subject: "Notes9 pricing",
    hint: "What is included in Free, and what Enterprise adds.",
  },
]

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const code = params.code

  // Handle OAuth redirect falling back to root
  // If we have a code, forward to the callback handler
  if (code && typeof code === 'string') {
    return redirect(`/auth/callback?code=${code}`)
  }

  let user = null
  try {
    user = await getCurrentUser()
  } catch (error) {
    console.error("HomePage failed to fetch user from Supabase (offline/timeout):", error)
  }

  if (user) {
    redirect("/dashboard")
  }

  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Notes9",
    url: "https://notes9.com",
    logo: "https://notes9.com/notes9-logo.png",
  }

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Notes9",
    url: "https://notes9.com",
  }

  return (
    <div
      className="marketing-theme font-sans min-h-screen flex flex-col bg-background text-foreground relative overflow-x-clip"
      style={{
        "--font-dm-sans": "var(--font-dm-sans, 'DM Sans', sans-serif)",
        "--font-dm-serif": "var(--font-dm-serif, 'DM Serif Display', serif)",
      } as React.CSSProperties}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />
        <FloatingPageMenu />
        <main className="flex-1 pt-16">
          {/* Replaces the AcademicHero + eight scroll-locked StackSections.
              The stacked layout pinned a hero and slid full-screen panels over
              it, which meant eight viewport-height scroll events before a
              visitor reached pricing. This composition is a normal document:
              sections follow one another, and the page is roughly half as tall.

              The previous version is not deleted — every section component it
              used still exists in components/marketing/home-sections.tsx, so
              reverting is an import change rather than a rebuild. */}
          <HeroSplit />
          <ProofBand />
          <FractureSection />
          <ChainSection />
          <CatalystBand />
          <ClosingSection />

          <section className="border-t border-border/40">
            <div className="container mx-auto px-4 py-20 sm:px-6 sm:py-24 lg:px-8" id="contact">
              {/* Two columns rather than a stacked block. ContactForm brings its
                  own card and heading, so a second heading above it read as a
                  duplicate; the left column now carries the editorial framing
                  and the direct details, and the form keeps its own surface. */}
              <div className="grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] lg:gap-20">
                <div>
                  <p className="n9-label">Get in touch</p>
                  <h2 className="mt-6 max-w-sm font-serif text-[clamp(1.9rem,4vw,2.9rem)] leading-[1.08] tracking-[-0.02em] text-foreground">
                    Talk to us about your lab.
                  </h2>
                  <p className="mt-5 max-w-sm text-[16px] leading-7 text-muted-foreground">
                    Tell us what you are working on and how your group records it today.
                    We will show you how Notes9 would fit around it.
                  </p>

                  <hr className="n9-hairline mt-10" />

                  {/* Routed enquiries, after Fiasco: naming what each kind of
                      message is for tells a visitor they will reach the right
                      person, which one undifferentiated address does not. Each
                      is a mailto with the subject pre-set — honest, since there
                      is genuinely one inbox behind them rather than the invented
                      names a fake routing table would need. */}
                  <div className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2">
                    {ENQUIRIES.map((e) => (
                      <div key={e.label}>
                        <a
                          href={`mailto:admin@notes9.com?subject=${encodeURIComponent(e.subject)}`}
                          className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground transition-colors hover:text-[var(--n9-accent)]"
                        >
                          {e.label}
                          <ArrowUpRight className="size-3.5 text-muted-foreground transition-colors group-hover:text-[var(--n9-accent)]" />
                        </a>
                        <p className="mt-1 max-w-[15rem] text-[13px] leading-5 text-muted-foreground">
                          {e.hint}
                        </p>
                      </div>
                    ))}
                  </div>

                  <hr className="n9-hairline mt-10" />

                  <dl className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Email
                      </dt>
                      <dd className="mt-1.5">
                        <a
                          href="mailto:admin@notes9.com"
                          className="text-[15px] text-foreground underline-offset-4 transition-colors hover:text-[var(--n9-accent)] hover:underline"
                        >
                          admin@notes9.com
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Team
                      </dt>
                      <dd className="mt-1.5 text-[15px] text-foreground">
                        India, United States &amp; United Kingdom
                      </dd>
                    </div>
                  </dl>
                </div>

                <ContactForm />
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  )
}
