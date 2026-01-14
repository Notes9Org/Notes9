"use client"

import { Mail, MapPin } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

const footerLinks = {
  product: [
    { name: "Platform Overview", href: "/platform" },
    // Removed placeholder links
  ],
  company: [
    { name: "About Us", href: "/about" },
    // Removed careers/press placeholders
  ],
}

export function Footer() {
  return (
    <footer className="bg-muted/30 border-t border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {/* Company Info */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center space-x-3 mb-4">
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

            <p className="text-foreground/80 mb-6 text-sm leading-relaxed">
              Empowering researchers worldwide with agentic intelligence that accelerates scientific discovery.
            </p>

            <div className="space-y-2 text-sm text-foreground/80">
              <div className="flex items-center space-x-2">
                <MapPin className="h-4 w-4" />
                <span>San Francisco, CA</span>
              </div>
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <span>hello@notes9.com</span>
              </div>
            </div>
          </div>

          {/* Links */}
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

        {/* Bottom Section */}
        <div className="border-t border-border pt-8 text-center md:text-left">
          <span className="text-sm text-foreground/80">© 2025 Notes9, Inc. All rights reserved.</span>
        </div>
      </div>
    </footer>
  )
}
