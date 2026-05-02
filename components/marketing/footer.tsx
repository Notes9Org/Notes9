"use client"

import { Mail, MapPin } from "lucide-react"
import Link from "next/link"
import { Notes9Brand } from "@/components/brand/notes9-brand"

const footerLinks = {
  product: [
    { name: "Overview", href: "/platform" },
    { name: "Features", href: "/platform" },
    { name: "Integrations", href: "/platform#integrations" },
  ],
  company: [
    { name: "About", href: "/about" },
    { name: "Team", href: "/about#team" },
    { name: "Careers", href: "/about#careers" },
    { name: "Contact", href: "/about#contact" },
  ],
  resources: [
    { name: "Blog", href: "/resources" },
    { name: "Docs / Help Center", href: "/docs" },
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Use", href: "/terms" },
  ],
  social: [
    { name: "LinkedIn", href: "https://www.linkedin.com" },
    { name: "Twitter / X", href: "https://x.com" },
    { name: "YouTube", href: "https://www.youtube.com" },
  ],
}

export function Footer() {
  return (
    <footer className="marketing-footer-glass border-t border-border/50">
      <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 gap-8 mb-12 md:grid-cols-5">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center space-x-3 mb-4">
              <Notes9Brand showIcon textClassName="h-8 w-auto" />
            </Link>

            <p className="text-foreground/80 mb-6 text-sm leading-relaxed">
              Workflow-aware software for research teams that need better continuity across literature, execution, memory, and reporting.
            </p>

            <div className="space-y-2 text-sm text-foreground/80">
              <div className="flex items-center space-x-2">
                <MapPin className="h-4 w-4" />
                <span>Distributed team · United States, India & United Kingdom</span>
              </div>
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <a href="mailto:admin@notes9.com" className="transition-colors hover:text-foreground">
                  admin@notes9.com
                </a>
              </div>
            </div>
          </div>

          <div className="md:col-span-4 grid grid-cols-2 gap-10 sm:grid-cols-4 md:justify-items-end">
            <div>
              <h3 className="font-semibold text-foreground mb-4">Product</h3>
              <ul className="space-y-2">
                {footerLinks.product.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-sm text-foreground/80 hover:text-foreground transition-colors">
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
                    <Link href={link.href} className="text-sm text-foreground/80 hover:text-foreground transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-4">Resources</h3>
              <ul className="space-y-2">
                {footerLinks.resources.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-sm text-foreground/80 hover:text-foreground transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-4">Social</h3>
              <ul className="space-y-2">
                {footerLinks.social.map((link) => (
                  <li key={link.name}>
                    <Link href={link.href} className="text-sm text-foreground/80 hover:text-foreground transition-colors">
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-border/60 pt-8 text-center md:text-left">
          <span className="text-sm text-foreground/80">
            Notes9 is built by a multidisciplinary team spanning scientific research, AI systems, and product engineering.
          </span>
        </div>
      </div>
    </footer>
  )
}
