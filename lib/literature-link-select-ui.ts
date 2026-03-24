import type { CSSProperties } from 'react'

/**
 * Project / experiment selects on literature forms: triggers stay within the grid column,
 * long titles scroll horizontally, and dropdown width matches the trigger so menus do not
 * spill over the adjacent control.
 *
 * SelectTrigger defaults apply `line-clamp-1` to the value (overflow:hidden) — we override
 * with `!` so horizontal scroll works on the selected label.
 *
 * Radix sets `pointer-events: none` on SelectValue — restore so the value area can be
 * drag-scrolled; clicks still bubble to the trigger button.
 */
export const literatureLinkSelectTriggerClassName =
  "w-full min-w-0 max-w-full min-h-9 justify-between gap-2 overflow-hidden [&_[data-slot=select-value]]:!pointer-events-auto [&_[data-slot=select-value]]:!block [&_[data-slot=select-value]]:!min-w-0 [&_[data-slot=select-value]]:!flex-1 [&_[data-slot=select-value]]:!max-w-full [&_[data-slot=select-value]]:!basis-0 [&_[data-slot=select-value]]:!overflow-x-auto [&_[data-slot=select-value]]:!overflow-y-hidden [&_[data-slot=select-value]]:!whitespace-nowrap [&_[data-slot=select-value]]:!text-left [&_[data-slot=select-value]]:!line-clamp-none"

export const literatureLinkSelectContentClassName =
  "max-h-[min(18rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] !overflow-x-auto overflow-y-auto"

/** Radix/shadcn viewport defaults to h=trigger height; use auto + max-h so lists and long lines scroll. */
export const literatureLinkSelectViewportClassName =
  "!h-auto max-h-[min(18rem,var(--radix-select-content-available-height))] min-h-9 w-full min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)] overflow-x-auto overflow-y-auto scroll-my-1"

/**
 * Radix Viewport sets inline `overflow: hidden auto`, which wins over Tailwind and blocks
 * horizontal scrolling for long option labels before a value is chosen.
 */
export const literatureLinkSelectViewportStyle: CSSProperties = {
  overflow: 'auto',
}

/** At least viewport width, grow with label text so the viewport can scroll horizontally. */
export const literatureLinkSelectItemClassName =
  '!w-max min-w-full max-w-none shrink-0 whitespace-nowrap [&_span]:whitespace-nowrap'
