import { redirect } from 'next/navigation'
import { getCurrentUser } from "@/lib/auth/current-user"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { AcademicHero } from "@/components/marketing/academic-hero"
import { ContactForm } from "@/components/marketing/contact-form"
import { FloatingPageMenu } from "@/components/marketing/floating-page-menu"
import { StackSection } from "@/components/marketing/stack-section"
import { ShowcaseSection } from "@/components/marketing/showcase-section"
import { CatalystWorkbench } from "@/components/marketing/catalyst-workbench"
import { Check } from "@phosphor-icons/react/ssr"
import {
  DifferentiationSection,
  FinalCtaSection,
  IcpBenefitsSection,
  PainSection,
  PricingTeaserSection,
  SolutionSection,
} from "@/components/marketing/home-sections"

import "@/styles/marketing.css"

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
          <AcademicHero />
          {/* Modern stacked layout: full-screen sticky pages that lock over
              the pinned hero and each other as you scroll. */}
          <StackSection index={0}><PainSection /></StackSection>
          <StackSection index={1}>
            <ShowcaseSection
              eyebrow="Connected workflow"
              title="Everything in your lab, connected"
              description="Projects, literature, protocols, experiments, samples and results are all linked — so the reasoning behind any result is one click away."
              points={[
                "Projects ↔ literature ↔ experiments ↔ results, linked by default",
                "Trace any figure back to its protocol and raw data",
                "See your whole research map at a glance",
              ]}
              image="research-map"
              imageAlt="Notes9 research map showing linked projects, experiments and literature"
            />
          </StackSection>
          <StackSection index={2} variant="highlight">
            <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8">
              <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent)]/[0.12] px-3 py-1 text-[12.5px] font-semibold uppercase tracking-[0.12em] text-[var(--n9-accent)]">
                    Meet Catalyst
                  </span>
                  <h2 className="mt-4 font-serif text-[2rem] font-bold leading-[1.12] tracking-tight text-foreground sm:text-[2.6rem] sm:leading-[1.08]">
                    Not a search box. An AI that does the&nbsp;work.
                  </h2>
                  <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-muted-foreground sm:text-[19px]">
                    Catalyst works across your whole project — grounded in your notes, experiments
                    and papers, and it cites every claim. Try each task &rarr;
                  </p>
                  <ul className="mt-6 space-y-3">
                    {[
                      "Answer project questions · design protocols · plan experiments",
                      "Generate graphs, edit spreadsheets, outline projects",
                      "Every answer cited — no context pasting, no hallucinations",
                    ].map((point) => (
                      <li key={point} className="flex items-start gap-3 text-[15px] text-foreground/90 sm:text-base">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--n9-accent)]/12 text-[var(--n9-accent)]">
                          <Check className="h-3.5 w-3.5" weight="bold" />
                        </span>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0">
                  <CatalystWorkbench />
                </div>
              </div>
            </div>
          </StackSection>
          <StackSection index={3}><IcpBenefitsSection /></StackSection>
          <StackSection index={4}><DifferentiationSection /></StackSection>
          <StackSection index={5}><PricingTeaserSection /></StackSection>
          <StackSection index={6}>
            <section id="contact">
              <div className="container mx-auto px-4 py-20 sm:px-6 lg:px-8">
                <div className="n9-readable mx-auto max-w-2xl text-center">
                  <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
                    Get in touch
                  </h2>
                  <p className="mt-4 text-[20px] leading-7 text-muted-foreground">
                    Tell us about your lab and where friction shows up today.
                  </p>
                </div>
                <div className="mx-auto mt-10 max-w-2xl">
                  <ContactForm />
                </div>
              </div>
            </section>
          </StackSection>
          <StackSection index={7}><FinalCtaSection /></StackSection>
        </main>
        <Footer />
      </div>
    </div>
  )
}
