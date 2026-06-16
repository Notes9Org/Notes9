import "@/styles/marketing.css"
import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import { FloatingPageMenu } from "@/components/marketing/floating-page-menu"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className="marketing-theme font-sans antialiased min-h-screen flex flex-col bg-background text-foreground relative overflow-hidden"
      style={{
        "--font-dm-sans": "var(--font-dm-sans, 'DM Sans', sans-serif)",
        "--font-dm-serif": "var(--font-dm-serif, 'DM Serif Display', serif)",
      } as React.CSSProperties}
    >
      <div className="relative z-10 flex flex-col min-h-screen">
        <Header />
        <FloatingPageMenu />
        <main className="flex-1 pt-16">
          {children}
        </main>
        <Footer />
      </div>
    </div>
  )
}
