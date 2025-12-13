import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { AcademicHero } from "@/components/marketing/academic-hero"
import { StatusSection } from "@/components/marketing/status-section"
import { FeaturesSection } from "@/components/marketing/features-section"
import { DifferentiationSection } from "@/components/marketing/differentiation-section"

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

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // If authenticated, redirect to dashboard
  if (user) {
    redirect("/dashboard")
  }

  // If not authenticated, show landing page with marketing theme
  return (
    <div className={`marketing-theme ${inter.variable} ${jetbrainsMono.variable} font-sans min-h-screen flex flex-col bg-background text-foreground`}>
      <Header />
      <main className="flex-1">
        <AcademicHero />
        <StatusSection />
        <FeaturesSection />
        <DifferentiationSection />
      </main>
      <Footer />
    </div>
  )
}
