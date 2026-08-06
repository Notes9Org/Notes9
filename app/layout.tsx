import type { Metadata } from 'next'
import "./globals.css"
import "katex/dist/katex.min.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster as Sonner } from "@/components/ui/sonner"
import HolyLoader from "holy-loader"
import { NavigationLoader } from "@/components/navigation-loader"
import { PostHogProvider } from "@/components/analytics/posthog-provider"

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

// Pre-extract the Supabase host so we can preconnect to it from <head>.
// Browsers do the TCP+TLS handshake in parallel with HTML parsing instead of
// waiting until the first Supabase request fires.
const SUPABASE_ORIGIN = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  try {
    return url ? new URL(url).origin : ""
  } catch {
    return ""
  }
})()

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {SUPABASE_ORIGIN ? (
          <>
            <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />
          </>
        ) : null}
        {/* Load Google Fonts directly in the browser to bypass Next.js compilation network fetching */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500;1,700&family=DM+Serif+Display&family=Familjen+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Serif:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Merriweather+Sans:wght@400;500;600;700;800&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700&family=Work+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        // Browser extensions (password managers, ad blockers, etc.) inject
        // attributes like `data-atm-ext-installed` onto <body> before React
        // hydrates, which would otherwise log a hydration-mismatch warning.
        // Same guard already on <html>; harmless for our own attributes.
        suppressHydrationWarning
        className="font-sans antialiased"
        style={{
          // Map global styles to CSS variables so Tailwind classes still function correctly.
          //
          // The platform runs on the native system UI stack. docs/UI_UX_REVAMP_PLAN.md
          // §3.1 specifies a webfont trio (Merriweather Sans / Source Serif 4 /
          // IBM Plex Mono), and for a while these variables were written as
          // `var(--font-ibm-sans, 'Merriweather Sans', ...)`, self-referential,
          // therefore invalid at computed-value time, therefore silently dropped
          // along with every `font-family` rule built on them. The whole product
          // rendered in the system stack as a result. Wiring the webfonts up
          // "correctly" changed typography across every surface at once, which is
          // not the look this product wants, so the system stack is now the
          // deliberate choice rather than an accident.
          //
          // Write literal stacks here. A custom property that references its own
          // name resolves to nothing and takes its dependents down with it.
          "--font-ibm-sans": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          "--font-ibm-serif": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          "--font-familjen": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          "--font-jetbrains-mono": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        } as React.CSSProperties}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <PostHogProvider>
            {/*
              Slim top progress bar tied to real navigation lifecycle: starts on
              link click, only stops when the route actually commits. Unlike the
              full-screen NavigationLoader (which must bail out on a safety
              timeout and can reveal the old page mid-navigation), a lingering
              bar is harmless, so it stays honest through slow compiles/fetches.
            */}
            <HolyLoader color="var(--primary)" height="3px" zIndex={2147483647} />
            <NavigationLoader />
            {children}
            <Sonner />
          </PostHogProvider>
          {/*
            Univer UI portals toolbar/menu popups here (default id `univer-popup-portal`).
            If this node is missing, createPortal returns null, font/color dropdowns never appear.
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
