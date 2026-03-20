import Link from "next/link"
import { Notes9Brand } from "@/components/brand/notes9-brand"

export default function LegalLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen flex flex-col bg-background font-sans antialiased">
            <header className="h-16 border-b border-border flex items-center px-4 sm:px-6 lg:px-8 bg-background/80 backdrop-blur-md sticky top-0 z-50">
                <Link href="/" className="flex items-center space-x-3">
                    <Notes9Brand textClassName="h-8 w-auto" />
                </Link>
            </header>
            {children}
        </div>
    )
}
