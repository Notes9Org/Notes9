import { redirect } from 'next/navigation'
import { getCurrentUser } from "@/lib/auth/current-user"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { AcademicHero } from "@/components/marketing/academic-hero"
import { ContactForm } from "@/components/marketing/contact-form"
import { FloatingPageMenu } from "@/components/marketing/floating-page-menu"
import { ScreenBackdrop } from "@/components/marketing/screen-backdrop"
import { AppGlyphRail } from "@/components/marketing/app-glyphs"
import {
  CatalystShowcaseSection,
  ConnectedChainSection,
  ContextEngineeringSection,
  DifferentiationSection,
  FinalCtaSection,
  IcpBenefitsSection,
  OutcomesSection,
  PainSection,
  PricingTeaserSection,
  SolutionSection,
} from "@/components/marketing/home-sections"

import { InteractiveParticles } from "@/components/ui/interactive-particles"

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
      className="marketing-theme font-sans min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden"
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
      <ScreenBackdrop />
      <InteractiveParticles variant="marketing" />
      <div className="marketing-mesh pointer-events-none absolute inset-0 opacity-[0.15] dark:opacity-[0.08]" />
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />
        <FloatingPageMenu />
        <AppGlyphRail />
        <main className="flex-1 pt-16">
          <AcademicHero />
          <ConnectedChainSection />
          <PainSection />
          <SolutionSection />
          <CatalystShowcaseSection />
          <ContextEngineeringSection />
          <OutcomesSection />
          <IcpBenefitsSection />
          <DifferentiationSection />
          <PricingTeaserSection />
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
          <FinalCtaSection />
        </main>
        <Footer />
      </div>
    </div>
  )
}
