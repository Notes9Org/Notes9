"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

export function resolveDemoScreenshot(path: string, theme: string | undefined) {
  if (!path.startsWith("/demo/")) return path
  if (path.startsWith("/demo/light/") || path.startsWith("/demo/dark/")) return path
  if (!/\.(png|jpg|jpeg|webp|avif)$/i.test(path)) return path

  const mode = theme === "dark" ? "dark" : "light"
  return path.replace("/demo/", `/demo/${mode}/`)
}

export function useStableDemoTheme() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted ? resolvedTheme : undefined
}
