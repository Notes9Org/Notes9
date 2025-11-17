import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { HeroSection } from "@/components/marketing/hero-section"
import { FeaturesSection } from "@/components/marketing/features-section"
import { DifferentiationSection } from "@/components/marketing/differentiation-section"
import { TechnicalSpecsSection } from "@/components/marketing/technical-specs-section"
import { IndustryTargetingSection } from "@/components/marketing/industry-targeting-section"
import { SocialProofSection } from "@/components/marketing/social-proof-section"
import { PricingSection } from "@/components/marketing/pricing-section"
import { CTASection } from "@/components/marketing/cta-section"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import "@/styles/marketing.css"

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If authenticated, redirect to dashboard
  if (user) {
    redirect("/dashboard")
  }
  
  // If not authenticated, show landing page with marketing theme
  return (
    <div className="marketing-theme">
      <Header />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <DifferentiationSection />
        <TechnicalSpecsSection />
        <IndustryTargetingSection />
        <SocialProofSection />
        <PricingSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
