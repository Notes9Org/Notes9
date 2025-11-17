"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Menu, X, ChevronDown } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import Image from "next/image"
import Link from "next/link"

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full glass border-b border-white/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center">
                <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
                  <Image
                    src="/notes9-logo.png"
                    alt="Notes9"
                    width={24}
                    height={24}
                    className="brightness-0 invert animate-float-gentle"
                  />
                </div>
              </div>
              <span className="text-xl font-bold text-solid tracking-wider">Notes9</span>
            </div>
            <span className="hidden lg:inline text-sm text-solid font-light opacity-90 whitespace-nowrap">
              Agentic AI for Scientific Research
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center space-x-6">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center space-x-1 text-sm font-medium text-solid hover:text-blue-200 transition-colors">
                <span>Platform</span>
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-card border-white/20">
                <DropdownMenuItem className="text-solid hover:bg-white/10">Agentic Notebook</DropdownMenuItem>
                <DropdownMenuItem className="text-solid hover:bg-white/10">Smart Inventory</DropdownMenuItem>
                <DropdownMenuItem className="text-solid hover:bg-white/10">Data Analysis</DropdownMenuItem>
                <DropdownMenuItem className="text-solid hover:bg-white/10">Literature Intelligence</DropdownMenuItem>
                <DropdownMenuItem className="text-solid hover:bg-white/10">Team Collaboration</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center space-x-1 text-sm font-medium text-solid hover:text-blue-200 transition-colors">
                <span>Solutions</span>
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-card border-white/20">
                <DropdownMenuItem className="text-solid hover:bg-white/10">Biotech & Pharma</DropdownMenuItem>
                <DropdownMenuItem className="text-solid hover:bg-white/10">Materials Science</DropdownMenuItem>
                <DropdownMenuItem className="text-solid hover:bg-white/10">Academic Research</DropdownMenuItem>
                <DropdownMenuItem className="text-solid hover:bg-white/10">Quality Control</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center space-x-1 text-sm font-medium text-solid hover:text-blue-200 transition-colors">
                <span>Developers</span>
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="glass-card border-white/20">
                <DropdownMenuItem className="text-solid hover:bg-white/10">API Documentation</DropdownMenuItem>
                <DropdownMenuItem className="text-solid hover:bg-white/10">Integrations</DropdownMenuItem>
                <DropdownMenuItem className="text-solid hover:bg-white/10">SDK & Tools</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <a href="#pricing" className="text-sm font-medium text-solid hover:text-blue-200 transition-colors">
              Pricing
            </a>
            <a href="/about" className="text-sm font-medium text-solid hover:text-blue-200 transition-colors">
              About
            </a>
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center space-x-3">
            <Button variant="ghost" size="sm" className="glass text-solid hover:bg-white/20 border-white/20 whitespace-nowrap" asChild>
              <Link href="/auth/login">Sign In</Link>
            </Button>
            <Button size="sm" className="glass-card text-solid hover:bg-white/30 border-white/30 whitespace-nowrap" asChild>
              <Link href="/auth/sign-up">
                <span className="hidden xl:inline">Get Started Free</span>
                <span className="xl:hidden">Try Now</span>
              </Link>
            </Button>
          </div>

          {/* Mobile menu button */}
          <button className="lg:hidden text-solid" onClick={() => setIsMenuOpen(!isMenuOpen)}>
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="lg:hidden py-6 border-t border-white/20 glass-card">
            <nav className="flex flex-col space-y-6">
              <div className="flex flex-col space-y-4">
                <a href="#platform" className="text-base font-medium text-solid hover:text-blue-200 transition-colors px-4 py-2 rounded-lg hover:bg-white/10">
                  Platform
                </a>
                <a href="#solutions" className="text-base font-medium text-solid hover:text-blue-200 transition-colors px-4 py-2 rounded-lg hover:bg-white/10">
                  Solutions
                </a>
                <a href="#developers" className="text-base font-medium text-solid hover:text-blue-200 transition-colors px-4 py-2 rounded-lg hover:bg-white/10">
                  Developers
                </a>
                <a href="#pricing" className="text-base font-medium text-solid hover:text-blue-200 transition-colors px-4 py-2 rounded-lg hover:bg-white/10">
                  Pricing
                </a>
                <a href="/about" className="text-base font-medium text-solid hover:text-blue-200 transition-colors px-4 py-2 rounded-lg hover:bg-white/10">
                  About
                </a>
              </div>
              <div className="flex flex-col space-y-3 pt-4 border-t border-white/20">
                <Button variant="ghost" size="sm" className="glass text-solid hover:bg-white/20 border-white/20 w-full justify-center" asChild>
                  <Link href="/auth/login">Sign In</Link>
                </Button>
                <Button size="sm" className="glass-card text-solid hover:bg-white/30 border-white/30 w-full justify-center" asChild>
                  <Link href="/auth/sign-up">Get Started Free</Link>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
