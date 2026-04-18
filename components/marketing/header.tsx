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
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/60 bg-[var(--n9-header-bg)] shadow-[0_10px_30px_-24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center">
          <Link
            href="/"
            className="group flex shrink-0 items-center self-start pt-0"
          >
            <Notes9Brand
              textClassName="h-8 w-auto"
              wordmarkClassName="-translate-y-1"
            />
          </Link>

          <nav className="hidden lg:flex flex-1 items-center justify-center space-x-8 px-8 xl:hidden">
            {pageLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          
          <div className="hidden flex-1 lg:block xl:hidden" />
          <div className="hidden flex-1 xl:block" />

          <div className="hidden lg:flex items-center space-x-3 shrink-0">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button
              size="sm"
              asChild
              className="rounded-full bg-[var(--n9-accent)] px-5 text-white shadow-[0_12px_40px_-12px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)]"
            >
              <Link href="/#contact">Request a demo</Link>
            </Button>
            <ModeToggle />
          </div>

          <button className="lg:hidden ml-auto text-foreground" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

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
