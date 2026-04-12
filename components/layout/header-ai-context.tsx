"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

export interface HeaderAiRegistration {
  active: boolean
  isOpen: boolean
  onToggle: () => void
  panel: ReactNode
  ariaLabel?: string
  title?: string
}

interface HeaderAiContextValue {
  registration: HeaderAiRegistration | null
  setRegistration: (registration: HeaderAiRegistration | null) => void
}

const HeaderAiContext = createContext<HeaderAiContextValue | null>(null)

export function HeaderAiProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<HeaderAiRegistration | null>(null)

  const value = useMemo(
    () => ({
      registration,
      setRegistration,
    }),
    [registration]
  )

  return <HeaderAiContext.Provider value={value}>{children}</HeaderAiContext.Provider>
}

export function useHeaderAi() {
  const context = useContext(HeaderAiContext)
  if (!context) {
    throw new Error("useHeaderAi must be used within a HeaderAiProvider")
  }
  return context
}
