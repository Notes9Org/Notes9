"use client"

import { InstagramLogo as Instagram, LinkedinLogo as Linkedin, Envelope as Mail, MapPin, YoutubeLogo as Youtube } from "@phosphor-icons/react/ssr"
import Link from "next/link"
import { Notes9Brand } from "@/components/brand/notes9-brand"

/** X (formerly Twitter) logo - not in lucide, so inline. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

const socials: { label: string; href: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "YouTube", href: "https://www.youtube.com/@Notes9-catalyst", Icon: Youtube },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/notes9", Icon: Linkedin },
  { label: "X (Twitter)", href: "https://x.com/CatalystAI_N9", Icon: XIcon },
  { label: "Instagram", href: "https://www.instagram.com/notes9_ai/", Icon: Instagram },
  { label: "Email", href: "mailto:admin@notes9.com", Icon: Mail },
]

const footerLinks = {
  product: [
    { name: "Platform", href: "/platform" },
    { name: "How it works", href: "/how-it-works" },
    { name: "Pricing", href: "/pricing" },
    { name: "Resources", href: "/resources" },
  ],
  company: [
    { name: "About", href: "/about" },
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
  ],
}

export function Footer() {
  return (
    <footer className="relative isolate overflow-hidden border-t border-border/60 bg-muted/40 backdrop-blur-[10px]">
      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* The columns and the masthead share one positioning context, which is
            what puts the masthead BEHIND the columns while keeping it ABOVE the
            closing line: its bottom edge is this wrapper's bottom edge, and the
            closing line comes after the wrapper. */}
        <div className="relative">
          {/* Masthead watermark. `-z-10` drops it behind the links (the footer's
              own background still paints first, so it stays visible), and
              pointer events are off so every link above it stays clickable.
              `overflow-hidden` lets it run past the right gutter at this size
              without ever widening the page. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 overflow-hidden"
          >
            <div
              /* Alpha lives on the PARENT, not on `text-foreground/[0.07]`: a
                 text colour alpha tints the letters but leaves the <img> at full
                 strength, which rendered the mark as a solid spiral beside grey
                 letters. Group opacity fades both identically. */
              className="n9-wordmark n9-wordmark-footer flex select-none items-baseline font-serif text-foreground opacity-[0.07] dark:opacity-[0.13]"
            >
              <span>N</span>
              {/* The mark stands in for the "o", that is the real lockup, so it
                  reads as the wordmark rather than as a logo placed beside text.
                  Sized in em so it tracks the clamped display size.
                  `items-baseline` already sits the image's bottom edge on the
                  text baseline, which is where a lowercase "o" belongs; the
                  small positive nudge only compensates for the transparent
                  padding baked into the asset.
                  The artwork is dark, so it needs the same dark-mode inversion
                  the header wordmark uses (components/brand/notes9-brand.tsx) or
                  it disappears against a dark background. */}
              <img
                src="/notes9-logo-mark-transparent.png"
                alt=""
                className="mx-[0.015em] h-[0.5em] w-auto translate-y-[0.03em] object-contain dark:invert dark:brightness-125"
              />
              <span>tes9</span>
            </div>
          </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center space-x-3 mb-4">
              <Notes9Brand showIcon textClassName="h-8 w-auto" />
            </Link>

            <p className="text-foreground/80 mb-6 text-[16px] leading-relaxed">
              Workflow-aware software for research teams that need better continuity across literature, execution, memory, and reporting.
            </p>

            <div className="space-y-2 text-[16px] text-foreground/80">
              <div className="flex items-center space-x-2">
                <MapPin className="h-4 w-4" />
                <span>Distributed team · India, United States & United Kingdom</span>
              </div>
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <a href="mailto:admin@notes9.com" className="transition-colors hover:text-foreground">
                  admin@notes9.com
                </a>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              {socials.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  title={label}
                  target={href.startsWith("mailto:") ? undefined : "_blank"}
                  rel={href.startsWith("mailto:") ? undefined : "noopener noreferrer"}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card text-foreground/70 transition-colors hover:border-[var(--n9-accent)]/40 hover:text-[var(--n9-accent)]"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="md:col-span-2 flex justify-start md:justify-end gap-16">
            <div>
              <h3 className="font-semibold text-foreground mb-4">Product</h3>
              <ul className="space-y-2">
                {footerLinks.product.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-[16px] text-foreground/80 hover:text-foreground transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-foreground mb-4">Company</h3>
              <ul className="space-y-2">
                {footerLinks.company.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-[16px] text-foreground/80 hover:text-foreground transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        </div>

        <div className="mt-6 border-t border-border/60 pt-8 text-center md:text-left">
          <span className="text-[16px] text-foreground/80">
            Notes9 is built by a multidisciplinary team spanning scientific research, AI systems, and product engineering.
          </span>
        </div>
      </div>
    </footer>
  )
}
