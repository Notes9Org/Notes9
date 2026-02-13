import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { AcademicHero } from "@/components/marketing/academic-hero"
import { StatusSection } from "@/components/marketing/status-section"
import { FeaturesSection } from "@/components/marketing/features-section"
import { DifferentiationSection } from "@/components/marketing/differentiation-section"
import { ContactForm } from "@/components/marketing/contact-form"

import { InteractiveParticles } from "@/components/ui/interactive-particles"

import "@/styles/marketing.css"
import { Inter, JetBrains_Mono } from "next/font/google"

// Using Inter for a more standard academic/professional look, keeping JetBrains for code/technical feel.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
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

  // If authenticated, redirect to dashboard
  if (user) {
    redirect("/dashboard")
  }

  // If not authenticated, show landing page with marketing theme
  return (
    <div className={`marketing-theme ${inter.variable} ${jetbrainsMono.variable} font-sans min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden`}>
      <InteractiveParticles />
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1">
          <AcademicHero />
          <StatusSection />
          <FeaturesSection />
          <DifferentiationSection />
          <section className="container mx-auto px-4 py-24">
            <div className="max-w-4xl mx-auto text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight mb-4">Ready to Transform Your Research?</h2>
              <p className="text-muted-foreground text-lg">
                Join leading labs in automating data workflows and accelerating discovery.
              </p>
            </div>
            <ContactForm />
          </section>
        </main>
        <Footer />
      </div>
    </div>
  )
}
