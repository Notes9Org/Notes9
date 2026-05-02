"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Menu, X } from "lucide-react"
import Link from "next/link"
import { Notes9Brand } from "@/components/brand/notes9-brand"

const pageLinks = [
  { href: "/platform", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
]

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="marketing-header-glass fixed inset-x-0 top-0 z-50 min-h-16 overflow-visible border-b border-border/35">
      <div className="relative z-10 container mx-auto flex min-h-16 flex-col justify-center px-4 sm:px-6 lg:px-8">
        <div className="relative flex min-h-16 items-center overflow-visible">
          <div className="flex min-w-0 shrink-0 items-center gap-8 lg:gap-10">
            <Link href="/" className="group inline-flex shrink-0 items-center justify-center leading-none">
              <Notes9Brand navRow textClassName="h-8 w-auto" />
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {pageLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex h-9 items-center rounded-md px-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Spacer — pushes controls to the right */}
          <div className="min-w-0 flex-1" />

          {/* Controls — right (desktop); h-9 matches default Button height for vertical rhythm with wordmark */}
          <div className="hidden shrink-0 items-center gap-2 sm:gap-3 lg:flex">
            <Button variant="ghost" asChild>
              <Link href="/auth/login">Login</Link>
            </Button>
            <Button
              asChild
              className="h-9 rounded-full bg-[var(--n9-accent)] px-5 text-primary-foreground shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]"
            >
              <Link href="/#contact">Get Started</Link>
            </Button>
            <ModeToggle variant="toggle" />
          </div>

          {/* Hamburger — mobile */}
          <button
            aria-label="Toggle navigation"
            className="lg:hidden text-foreground"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-border/60">
            <nav className="flex flex-col space-y-1">
              {pageLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="flex h-11 items-center px-4 text-base font-medium text-foreground hover:bg-muted"
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col space-y-3 pt-4 px-4 border-t border-border/60 mt-2">
                <Button variant="outline" size="sm" className="w-full justify-center" asChild>
                  <Link href="/auth/login">Login</Link>
                </Button>
                <Button
                  size="sm"
                  className="w-full justify-center rounded-full bg-[var(--n9-accent)] text-primary-foreground hover:bg-[var(--n9-accent-hover)]"
                  asChild
                >
                  <Link href="/#contact">Get Started</Link>
                </Button>
                <div className="flex justify-center pt-2">
                  <ModeToggle variant="toggle" />
                </div>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
