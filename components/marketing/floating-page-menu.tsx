"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CircleDollarSign, FolderKanban, Home, Info, LibraryBig } from "lucide-react"

import { cn } from "@/lib/utils"

const pageLinks = [
  { href: "/", label: "Home", icon: Home },
  { href: "/platform", label: "Platform", icon: FolderKanban },
  { href: "/pricing", label: "Pricing", icon: CircleDollarSign },
  { href: "/resources", label: "Resources", icon: LibraryBig },
  { href: "/about", label: "About", icon: Info },
]

export function FloatingPageMenu() {
  const pathname = usePathname()

  return (
    <div className="pointer-events-none fixed right-4 top-24 z-40 hidden xl:block">
      <nav className="pointer-events-auto group flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/88 p-2 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        {pageLinks.map((link) => {
          const isActive = pathname === link.href
          const Icon = link.icon

          return (
            <Link
              key={link.href}
              href={link.href}
              aria-label={link.label}
              className={cn(
                "flex h-10 w-10 items-center justify-start overflow-hidden rounded-full px-3 transition-all duration-200 ease-out group-hover:w-36",
                isActive
                  ? "bg-[var(--n9-accent)] text-white shadow-[0_10px_30px_-14px_var(--n9-accent-glow)]"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span
                className={cn(
                  "ml-3 whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                )}
              >
                {link.label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
