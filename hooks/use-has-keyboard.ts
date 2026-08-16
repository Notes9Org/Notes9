'use client'

import { useEffect, useState } from 'react'

/**
 * Whether this device plausibly has a physical keyboard.
 *
 * Deliberately a pointer query, not a width breakpoint: a desktop browser in a
 * narrow window still has a keyboard and should still learn its shortcuts, while
 * a large tablet does not. `(pointer: coarse)` is the honest signal.
 *
 * Starts `true` so the server and the first client render agree and the markup
 * matches; a touch device then drops its hints one frame later. Erring toward
 * showing means the worst case is a chip that disappears on a phone, not a
 * hydration mismatch on every desktop.
 */
export function useHasKeyboard(): boolean {
  const [hasKeyboard, setHasKeyboard] = useState(true)

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)')
    const apply = () => setHasKeyboard(!query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  return hasKeyboard
}
