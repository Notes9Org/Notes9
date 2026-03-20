"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ModeToggle } from "@/components/mode-toggle"
import { Menu, X } from "lucide-react"
import Link from "next/link"
import { Notes9Brand } from "@/components/brand/notes9-brand"

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-[var(--n9-header-bg)] shadow-[0_10px_30px_-24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-[var(--n9-header-bg)] shadow-[0_10px_30px_-24px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center">
          <Link href="/" className="flex items-center space-x-3 shrink-0">
            <div className="relative h-8 w-8 shrink-0">
              <Image
                src="/notes9-logo.png"
                alt="Notes9 Logo"
                fill
                className="object-contain dark:invert dark:brightness-110 dark:contrast-125"
                priority
              />
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight">Notes9</span>
          </Link>

          <div className="hidden flex-1 lg:block" />

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
            <nav className="flex flex-col space-y-4">
              <div className="flex flex-col space-y-3 pt-4 px-4">
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
