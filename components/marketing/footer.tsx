"use client"

import { Instagram, Linkedin, Mail, MapPin, Youtube } from "lucide-react"
import Link from "next/link"
import { Notes9Brand } from "@/components/brand/notes9-brand"

/** X (formerly Twitter) logo — not in lucide, so inline. */
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
    <footer className="border-t border-border/60 bg-muted/40 backdrop-blur-[10px]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
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

        <div className="border-t border-border/60 pt-8 text-center md:text-left">
          <span className="text-[16px] text-foreground/80">
            Notes9 is built by a multidisciplinary team spanning scientific research, AI systems, and product engineering.
          </span>
        </div>
      </div>
    </footer>
  )
}
