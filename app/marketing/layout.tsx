import { JetBrains_Mono, Work_Sans } from "next/font/google"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { FloatingPageMenu } from "@/components/marketing/floating-page-menu"
import { DM_Sans, DM_Serif_Display } from "next/font/google"
import { MarketingParticles } from "@/components/marketing/marketing-particles"

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-work-sans",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${workSans.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden`}>
      <MarketingParticles />
      <div className="marketing-mesh pointer-events-none absolute inset-0 opacity-[0.15] dark:opacity-[0.08]" />
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />
        <FloatingPageMenu />
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
