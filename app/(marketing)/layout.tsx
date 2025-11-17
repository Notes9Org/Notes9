import { Header } from "@/components/marketing/header"
import { Footer } from "@/components/marketing/footer"
import "@/styles/marketing.css"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="marketing-theme">
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  )
}

