"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Menu, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-3">
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

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-8">
            <Link href="/platform" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Platform Features
            </Link>
            <Link href="/about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              About
            </Link>
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center space-x-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/sign-up">
                Request Access
              </Link>
            </Button>
          </div>

          {/* Mobile menu button */}
          <button className="lg:hidden text-foreground" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="lg:hidden py-4 border-t border-border">
            <nav className="flex flex-col space-y-4">
              <Link
                href="/platform"
                className="text-base font-medium text-foreground px-4 py-2 hover:bg-muted rounded-md"
                onClick={() => setIsMenuOpen(false)}
              >
                Platform Features
              </Link>
              <Link
                href="/about"
                className="text-base font-medium text-foreground px-4 py-2 hover:bg-muted rounded-md"
                onClick={() => setIsMenuOpen(false)}
              >
                About
              </Link>
              <div className="flex flex-col space-y-3 pt-4 px-4">
                <Button variant="outline" size="sm" className="w-full justify-center" asChild>
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button size="sm" className="w-full justify-center" asChild>
                  <Link href="/auth/sign-up">Request Access</Link>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
