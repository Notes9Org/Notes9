import { redirect } from 'next/navigation'
import { getCurrentUser } from "@/lib/auth/current-user"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
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
            <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8" id="contact">
              <div className="mx-auto max-w-2xl">
                <p className="n9-label">Get in touch</p>
                <h2 className="mt-6 font-serif text-[clamp(1.9rem,4vw,2.9rem)] leading-[1.1] tracking-[-0.02em] text-foreground">
                  Talk to us about your lab.
                </h2>
                <div className="mt-8">
                  <ContactForm />
                </div>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </div>
  )
}
