import "@/styles/marketing.css"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { FloatingPageMenu } from "@/components/marketing/floating-page-menu"
import { DM_Sans, DM_Serif_Display } from "next/font/google"
import { MarketingParticles } from "@/components/marketing/marketing-particles"

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
})

const dmSerif = DM_Serif_Display({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-dm-serif",
})

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`marketing-theme ${dmSans.variable} ${dmSerif.variable} font-sans antialiased min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden`}>
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
