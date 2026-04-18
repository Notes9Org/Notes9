import type { Metadata } from 'next'
import { JetBrains_Mono, Space_Grotesk, Work_Sans } from 'next/font/google'
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { NavigationLoader } from "@/components/navigation-loader"
import { RumProvider } from "@/components/rum-provider"

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
  metadataBase: new URL('https://notes9.com'),
  generator: 'v0.app',
  applicationName: 'Notes9',
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/notes9-logo-favicon.png', sizes: 'any', type: 'image/png' },
      { url: '/icon.png', sizes: '32x32', type: 'image/png' },
    ],
    shortcut: '/notes9-logo-favicon.png',
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: 'https://notes9.com',
    title: 'Notes9 - Research Lab Management',
    description: 'Professional laboratory research and experiment management platform',
    siteName: 'Notes9',
    images: [
      {
        url: '/notes9-logo.png',
        width: 1200,
        height: 630,
        alt: 'Notes9',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Notes9 - Research Lab Management',
    description: 'Professional laboratory research and experiment management platform',
    images: ['/notes9-logo.png'],
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
          <RumProvider>
            <NavigationLoader />
            {children}
            <Toaster />
            <Sonner />
          </RumProvider>
          {/*
            Univer UI portals toolbar/menu popups here (default id `univer-popup-portal`).
            If this node is missing, createPortal returns null — font/color dropdowns never appear.
            Zero-size + pointer-events-none so the host never blocks the page; popups set their own hit targets.
          */}
          <div
            id="univer-popup-portal"
            className="pointer-events-none fixed left-0 top-0 z-[300] h-0 w-0 overflow-visible"
            aria-hidden
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
