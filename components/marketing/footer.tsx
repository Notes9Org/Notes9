"use client"

import { Mail, MapPin } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

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
    <footer className="border-t border-border/60 bg-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 relative">
                <Image
                  src="/notes9-logo.png"
                  alt="Notes9 Logo"
                  fill
                  className="object-contain dark:invert dark:brightness-110 dark:contrast-125"
                />
              </div>
              <span className="text-xl font-bold text-foreground tracking-tight">Notes9</span>
            </Link>

            <p className="text-foreground/80 mb-6 text-sm leading-relaxed">
              Workflow-aware software for research teams that need better continuity across literature, execution, memory, and reporting.
            </p>

            <div className="space-y-2 text-sm text-foreground/80">
              <div className="flex items-center space-x-2">
                <MapPin className="h-4 w-4" />
                <span>Distributed team · United States & United Kingdom</span>
              </div>
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <a href="mailto:admin@notes9.com" className="transition-colors hover:text-foreground">
                  admin@notes9.com
                </a>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 flex justify-start md:justify-end gap-16">
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
