import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { AcademicHero } from "@/components/marketing/academic-hero"
import { StatusSection } from "@/components/marketing/status-section"
import { ProductShowcase } from "@/components/marketing/video-showcase"
import { DifferentiationSection } from "@/components/marketing/differentiation-section"
import { ContactForm } from "@/components/marketing/contact-form"
import { FloatingPageMenu } from "@/components/marketing/floating-page-menu"

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

  return (
    <div className={`marketing-theme ${dmSans.variable} ${dmSerif.variable} font-sans min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden`}>
      <InteractiveParticles variant="marketing" />
      <div className="marketing-mesh pointer-events-none absolute inset-0 opacity-[0.15] dark:opacity-[0.08]" />
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />
        <FloatingPageMenu />
        <main className="flex-1">
          <AcademicHero />
          <StatusSection />
          <ProductShowcase />
          <DifferentiationSection />
          <section id="contact">
            <div className="container mx-auto px-4 py-24 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="font-serif text-3xl tracking-tight text-foreground sm:text-4xl">
                  Get in touch
                </h2>
                <p className="mt-4 text-lg leading-7 text-muted-foreground">
                  Tell us about your lab and where friction shows up today.
                </p>
              </div>
              <div className="mx-auto mt-10 max-w-2xl">
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
