"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Loader2 } from "lucide-react"

export function NavigationLoader() {
  const [isLoading, setIsLoading] = useState(false)
  const [mounted, setMounted] = useState(false)
  const pathname = usePathname()

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    // Set loading to false when pathname changes (navigation complete)
    setIsLoading(false)
  }, [pathname])

  useEffect(() => {
    if (!mounted) return

    let timeoutId: NodeJS.Timeout | null = null

    // Intercept all clicks to detect navigation
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      
      // Check if it's a link or inside a link
      const link = target.closest("a")
      if (link) {
        const href = link.getAttribute("href")
        const targetAttr = link.getAttribute("target")
        
        // Only show loader for internal navigation (not external links or new tabs)
        if (href && href.startsWith("/") && targetAttr !== "_blank") {
          // Don't show loader if clicking the current page or hash links
          const isSamePage = href === pathname || href.split("?")[0] === pathname
          const isHashLink = href.startsWith("/#") || href.includes("#")
          
          if (!isSamePage && !isHashLink) {
            setIsLoading(true)
            
            // Safety timeout to hide loader after 10 seconds
            timeoutId = setTimeout(() => {
              setIsLoading(false)
            }, 10000)
          }
        }
        return
      }

      // Check if it's a button that might navigate
      const button = target.closest("button")
      if (button) {
        // Look for data attribute that indicates navigation
        if (button.hasAttribute("data-navigate")) {
          setIsLoading(true)
          
          // Safety timeout
          timeoutId = setTimeout(() => {
            setIsLoading(false)
          }, 10000)
        }
      }
    }

    document.addEventListener("click", handleClick, true)

    return () => {
      document.removeEventListener("click", handleClick, true)
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [pathname, mounted])

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!mounted || !isLoading) return null

  return (
    <>
      {/* Subtle overlay backdrop */}
      <div className="fixed inset-0 z-[9998] bg-background/5 backdrop-blur-[2px] pointer-events-none animate-in fade-in duration-300" />
      
      {/* Centered circular loader */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none animate-in fade-in duration-300">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    </>
  )
}
