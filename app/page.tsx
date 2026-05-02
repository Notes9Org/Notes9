import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { AcademicHero } from "@/components/marketing/academic-hero"
import { StatusSection } from "@/components/marketing/status-section"
import { FeatureDeepDive } from "@/components/marketing/feature-deep-dive"
import { WhyResearchersStaySection } from "@/components/marketing/why-researchers-stay-section"

import { InteractiveParticles } from "@/components/ui/interactive-particles"

import "@/styles/marketing.css"
import { DM_Sans, DM_Serif_Display } from "next/font/google"

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
})

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif",
})

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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

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
      className={`marketing-theme marketing-glass-app ${dmSans.variable} ${dmSerif.variable} font-sans min-h-screen w-full min-w-0 max-w-full flex flex-col text-foreground relative overflow-visible`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <InteractiveParticles variant="marketing" />
      <Header />
      <div className="relative z-10 flex min-h-screen w-full min-w-0 max-w-full flex-col marketing-glass-page">
        <main className="min-h-0 min-w-0 flex-1">
          {/* 01.1 Hero */}
          <AcademicHero />

          {/* 01.2 The Pain */}
          <StatusSection />

          {/* 01.3 Feature deep dive */}
          <FeatureDeepDive />

          {/* 01.4 Why choose Notes9 + CTA */}
          <WhyResearchersStaySection />
        </main>
        <Footer />
      </div>
    </div>
  )
}
