import Link from "next/link"
import Image from "next/image"

export default function LegalLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <div className="min-h-screen flex flex-col bg-background font-sans antialiased">
            <header className="h-16 border-b border-border flex items-center px-4 sm:px-6 lg:px-8 bg-background/80 backdrop-blur-md sticky top-0 z-50">
                <Link href="/" className="flex items-center space-x-3">
                    <div className="w-8 h-8 relative">
                        <Image
                            src="/notes9-logo.png"
                            alt="Notes9"
                            fill
                            className="object-contain"
                        />
                    </div>
                    <span className="text-xl font-bold text-foreground tracking-tight">Notes9</span>
                </Link>
            </header>
            {children}
        </div>
    )
}
