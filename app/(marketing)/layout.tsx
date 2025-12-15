import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
// Removed marketing.css to avoid conflicting "startup/glass" styles
import { Inter, JetBrains_Mono } from "next/font/google"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

import { InteractiveParticles } from "@/components/ui/interactive-particles"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden`}>
      <InteractiveParticles />
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
