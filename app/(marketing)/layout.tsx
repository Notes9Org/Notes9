import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import "@/styles/marketing.css"
import { Rajdhani, JetBrains_Mono } from "next/font/google"

const rajdhani = Rajdhani({
  subsets: ["latin"],
  variable: "--font-rajdhani",
  weight: ["300", "400", "500", "600", "700"],
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["300", "400", "500", "600", "700"],
})

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`marketing-theme font-sans ${rajdhani.variable} ${jetbrainsMono.variable} antialiased`}>
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  )
}

