"use client"

import { createContext, useContext, type ReactNode } from "react"

/**
 * Lets descendants (notably <CatalystSectionHero>) react to the right Catalyst
 * panel's open/close state — used to hide the scoped hero composer while the
 * persistent thread is taking over, and restore it on close so the user lands
 * back on the scoped intake. The panel state itself is owned by app-layout
 * (alongside the panel itself); this context only exposes a read view.
 */
type CatalystPanelState = {
  /** Is the right Catalyst sidebar currently visible? */
  isOpen: boolean
}

const Context = createContext<CatalystPanelState>({ isOpen: false })

export function CatalystPanelStateProvider({
  isOpen,
  children,
}: {
  isOpen: boolean
  children: ReactNode
}) {
  return <Context.Provider value={{ isOpen }}>{children}</Context.Provider>
}

export function useCatalystPanelState(): CatalystPanelState {
  return useContext(Context)
}
