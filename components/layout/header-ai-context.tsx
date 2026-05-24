"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

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

// Shallow-equality check on the scalar fields. Skipping the `panel` ReactNode
// (always a new element on every parent render) and the function identities
// (`onToggle` is usually a stable callback but we don't require it) prevents
// the entire AppLayoutBody from re-rendering when only the JSX identity of
// the panel changed — which it does on every protocol-page render.
function isRegistrationEquivalent(
  a: HeaderAiRegistration | null,
  b: HeaderAiRegistration | null,
): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return (
    a.active === b.active &&
    a.isOpen === b.isOpen &&
    a.ariaLabel === b.ariaLabel &&
    a.title === b.title &&
    a.onToggle === b.onToggle
  )
}

export function HeaderAiProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistrationState] = useState<HeaderAiRegistration | null>(null)

  const setRegistration = useCallback((next: HeaderAiRegistration | null) => {
    setRegistrationState((prev) => (isRegistrationEquivalent(prev, next) ? prev : next))
  }, [])

  const value = useMemo(
    () => ({
      registration,
      setRegistration,
    }),
    [registration, setRegistration]
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
