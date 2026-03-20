import type { Metadata } from 'next'
import { JetBrains_Mono, Space_Grotesk, Work_Sans } from 'next/font/google'
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { NavigationLoader } from "@/components/navigation-loader"

const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-work-sans',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
})

export const metadata: Metadata = {
  title: 'Notes9 - Research Lab Management',
  description: 'Professional laboratory research and experiment management platform',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/notes9-logo-favicon.png', sizes: 'any', type: 'image/png' },
    ],
    shortcut: '/notes9-logo-favicon.png',
    apple: '/notes9-logo-favicon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`font-sans ${workSans.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NavigationLoader />
          {children}
          <Toaster />
          <Sonner />
        </ThemeProvider>
      </body>
    </html>
  )
}
