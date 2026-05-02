import "@/styles/marketing.css"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
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
    <div
      className={`marketing-theme marketing-glass-app ${dmSans.variable} ${dmSerif.variable} font-sans antialiased min-h-screen w-full min-w-0 max-w-full flex flex-col text-foreground relative overflow-visible`}
    >
      <MarketingParticles />
      <Header />
      <div className="relative z-10 flex min-h-screen w-full min-w-0 max-w-full flex-col marketing-glass-page">
        <main className="min-h-0 min-w-0 flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  )
}
