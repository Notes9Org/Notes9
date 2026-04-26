"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Menu, X } from "lucide-react"
import Link from "next/link"
import { Notes9Brand } from "@/components/brand/notes9-brand"

const pageLinks = [
  { href: "/", label: "Home" },
  { href: "/platform", label: "Platform" },
  { href: "/pricing", label: "Pricing" },
  { href: "/resources", label: "Resources" },
  { href: "/about", label: "About" },
]

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 overflow-visible bg-[var(--n9-header-bg)] shadow-[0_10px_30px_-24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex h-16 items-center overflow-visible">

          {/* Logo — left */}
          <Link href="/" className="group flex shrink-0 items-center">
            <Notes9Brand
              textClassName="h-8 w-auto"
              wordmarkClassName="-translate-y-1"
            />
          </Link>

          {/* Spacer — pushes controls to the right */}
          <div className="flex-1" />

          {/* Controls — right (desktop) */}
          <div className="hidden lg:flex items-center space-x-3 shrink-0">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="rounded-full">
              <Link href="/#contact">Request a demo</Link>
            </Button>
            <Button
              size="sm"
              asChild
              className="rounded-full bg-[var(--n9-accent)] px-5 text-white shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]"
            >
              <Link href="/auth/sign-up">Start free</Link>
            </Button>
            <ModeToggle />
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
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button
                  size="sm"
                  className="w-full justify-center rounded-full bg-[var(--n9-accent)] text-white hover:bg-[var(--n9-accent-hover)]"
                  asChild
                >
                  <Link href="/auth/sign-up">Start free</Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center rounded-full"
                  asChild
                >
                  <Link href="/#contact">Request a demo</Link>
                </Button>
                <div className="flex justify-center pt-2">
                  <ModeToggle />
                </div>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
