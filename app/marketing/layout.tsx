import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
// Removed marketing.css to avoid conflicting "startup/glass" styles

import { MarketingParticles } from "@/components/marketing/marketing-particles"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden`}>
      <MarketingParticles />
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
