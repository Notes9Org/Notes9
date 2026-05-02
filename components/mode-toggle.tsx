"use client"

import * as React from "react"
import { Contrast, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function ThemeGlyph({
  resolvedTheme,
  className,
}: {
  resolvedTheme: string | undefined
  className?: string
}) {
  if (resolvedTheme === "light") {
    return <Sun className={className} />
  }
  if (resolvedTheme === "black") {
    return <Contrast className={className} />
  }
  return <Moon className={className} />
}

export type ModeToggleVariant = "menu" | "toggle"

export function ModeToggle({ variant = "menu" }: { variant?: ModeToggleVariant }) {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const iconClass = "h-[1.2rem] w-[1.2rem]"

  if (variant === "toggle") {
    if (!mounted) {
      return (
        <Button variant="ghost" size="icon" className="relative" disabled aria-hidden type="button">
          <Moon className={iconClass} />
          <span className="sr-only">Cycle theme</span>
        </Button>
      )
    }
    const order = ["light", "dark", "black"] as const
    const step =
      resolvedTheme === "light"
        ? 0
        : resolvedTheme === "dark"
          ? 1
          : resolvedTheme === "black"
            ? 2
            : 0
    return (
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        type="button"
        aria-label={`Cycle theme (${resolvedTheme ?? "light"}). Next: ${order[(step + 1) % order.length]}`}
        onClick={() => setTheme(order[(step + 1) % order.length])}
      >
        <ThemeGlyph resolvedTheme={resolvedTheme} className={iconClass} />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {mounted ? (
            <ThemeGlyph resolvedTheme={resolvedTheme} className={iconClass} />
          ) : (
            <Sun className={iconClass} />
          )}
          <span className="sr-only">Theme menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("black")}>
          Black <span className="text-muted-foreground">(OLED)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
