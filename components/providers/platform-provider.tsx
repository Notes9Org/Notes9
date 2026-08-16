'use client'

/**
 * One source of `isMac` for the whole app (ADR-020).
 *
 * Before this existed there were three competing answers in tree: the cheat
 * sheet held it in state and corrected it in an effect, the header called
 * `isMacPlatform()` straight through render — safe only because its dropdown
 * mounts on click, and a hydration mismatch the moment anyone copied it — and
 * the command palette had a third. Putting a shortcut hint on ~20 always-visible
 * controls multiplies both problems, so detection happens here, once.
 *
 * The value never branches the component tree, only the text inside a keycap.
 * Same nodes, same order, same count on server and client — which is what keeps
 * this from shifting every `useId` below it the way the app shell did once
 * before.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { isMacPlatform } from '@/lib/shortcuts/match'
import {
  PLATFORM_COOKIE,
  PLATFORM_COOKIE_MAX_AGE,
  platformCookieValue,
} from '@/lib/shortcuts/platform'

const PlatformContext = createContext<boolean | null>(null)

export function PlatformProvider({
  initialIsMac,
  children,
}: {
  /** Read from the platform cookie on the server. `false` on a first visit. */
  initialIsMac: boolean
  children: ReactNode
}) {
  const [isMac, setIsMac] = useState(initialIsMac)

  useEffect(() => {
    const actual = isMacPlatform()

    // Only re-render when the server guessed wrong — a first visit, or a cookie
    // carried to a different machine. On every other load this is a no-op and
    // nothing flickers.
    setIsMac((current) => (current === actual ? current : actual))

    try {
      document.cookie = `${PLATFORM_COOKIE}=${platformCookieValue(actual)}; path=/; max-age=${PLATFORM_COOKIE_MAX_AGE}; SameSite=Lax`
    } catch {
      // Private browsing / cookies disabled. The in-memory value above is already
      // correct for this session; only the head start on the next load is lost.
    }
  }, [])

  return (
    <PlatformContext.Provider value={isMac}>{children}</PlatformContext.Provider>
  )
}

/**
 * `true` on macOS. Outside a provider this returns `false` rather than throwing:
 * the consequence is a keycap that says `Ctrl`, which is not worth taking a
 * screen down for, and marketing surfaces legitimately render shortcut-free
 * chrome outside the app tree.
 */
export function useIsMac(): boolean {
  return useContext(PlatformContext) ?? false
}
