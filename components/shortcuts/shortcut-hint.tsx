'use client'

/**
 * The keycaps you put next to the control they trigger.
 *
 * The point of the feature: a researcher picks up a binding while doing the
 * thing, instead of reading a table of thirty of them out of context and
 * retaining none. So the hint lives on the control, and it is always the real
 * binding — `id` is a `ShortcutId`, so renaming a shortcut turns every stale
 * hint into a compile error rather than a wrong keycap (ADR-021).
 *
 * Renders nothing at all — never an empty or disabled chip — when there is no
 * shortcut to show, when the shortcut cannot fire here, or when there is no
 * keyboard to press it with.
 */

import { KbdRow } from '@/components/ui/kbd'
import { useIsMac } from '@/components/providers/platform-provider'
import { keycapsFor, isSequenceFor } from '@/lib/shortcuts/keycaps'
import type { ShortcutId } from '@/lib/shortcuts/registry'
import { useHasKeyboard } from '@/hooks/use-has-keyboard'
import { cn } from '@/lib/utils'

export function ShortcutHint({
  id,
  variant = 'inline',
  className,
}: {
  id: ShortcutId
  /**
   * `inline`  — sits in the flow beside a label.
   * `menu`    — pushed to the trailing edge of a menu row.
   * `tooltip` — muted, for the tail of a tooltip on an icon-only button.
   */
  variant?: 'inline' | 'menu' | 'tooltip'
  className?: string
}) {
  const isMac = useIsMac()
  const hasKeyboard = useHasKeyboard()
  const caps = keycapsFor(id, isMac)

  // No keyboard, no hint. A touch user cannot press it, so the chip is pure
  // clutter on the smallest screens — the ones that can least afford it.
  if (!hasKeyboard) return null
  if (caps.length === 0) return null

  return (
    <KbdRow
      // Decorative: `⌘` announces as "place of interest sign". The shortcut
      // reaches assistive tech through the control's `aria-keyshortcuts`
      // instead — see ADR-022 and `ariaKeyshortcutsFor`.
      aria-hidden="true"
      tokens={caps}
      joiner={isSequenceFor(id) ? 'then' : undefined}
      className={cn(
        variant === 'menu' && 'ml-auto pl-3',
        variant === 'tooltip' && 'opacity-80',
        className,
      )}
    />
  )
}
