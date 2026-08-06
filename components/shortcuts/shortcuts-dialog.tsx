'use client'

import { useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass as SearchIcon } from '@phosphor-icons/react/ssr'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { KbdRow } from '@/components/ui/kbd'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatCombo, isMacPlatform } from '@/lib/shortcuts/match'
import { groupedShortcuts } from '@/lib/shortcuts/registry'
import type { ShortcutDef } from '@/lib/shortcuts/types'

/** The registry is static, so the sections only need building once. */
const SECTIONS = groupedShortcuts()

/**
 * Keycap tokens for one entry.
 *
 * Three shapes, in priority order: literal `display` tokens ('@', '\\' 'B'),
 * a leader sequence (two or more plain keys, shown as separate caps), and a
 * single combo run through `formatCombo` so ⌘/Ctrl matches the platform.
 */
function keycaps(item: ShortcutDef, isMac: boolean): string[] {
  if (item.display?.length) return item.display
  if (item.keys.length > 1) {
    return item.keys.map((key) => formatCombo(key, isMac).join(''))
  }
  if (item.keys.length === 1) return formatCombo(item.keys[0], isMac)
  return []
}

/** Everything a search term is allowed to hit, lowercased once per entry. */
function haystack(item: ShortcutDef, isMac: boolean): string {
  return [item.label, item.hint ?? '', ...item.keys, ...keycaps(item, isMac)]
    .join(' ')
    .toLowerCase()
}

/**
 * The keyboard shortcuts cheat sheet.
 *
 * Renders the registry rather than a hand-kept copy, so a shortcut can never be
 * bound without being documented (or documented without existing).
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [query, setQuery] = useState('')
  // Resolved after mount: the server has no navigator, and rendering ⌘ on the
  // server for a Windows client (or the reverse) is a hydration mismatch.
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setIsMac(isMacPlatform())
  }, [])

  // Reopening should not inherit the last search.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const sections = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return SECTIONS
    return SECTIONS.map((section) => ({
      group: section.group,
      items: section.items.filter((item) => {
        const text = haystack(item, isMac)
        return terms.every((term) => text.includes(term))
      }),
    })).filter((section) => section.items.length > 0)
  }, [query, isMac])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dialogSize="xl"
        className="flex max-h-[86dvh] flex-col gap-0 overflow-hidden p-0"
      >
        <div className="shrink-0 border-b border-border/60 px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="text-base">Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Everything Notes9 listens for, in one place.
            </DialogDescription>
          </DialogHeader>

          <div className="relative mt-4">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shortcuts…"
              aria-label="Search keyboard shortcuts"
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {sections.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">
                No shortcuts match &ldquo;{query.trim()}&rdquo;
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Try what the shortcut does (&ldquo;note&rdquo;,
                &ldquo;sidebar&rdquo;) or the key itself.
              </p>
            </div>
          ) : (
            <div className="grid auto-rows-min grid-cols-1 items-start gap-x-10 gap-y-7 px-6 py-6 sm:grid-cols-2">
              {sections.map((section) => (
                <section key={section.group}>
                  <h3 className="mb-2 text-micro font-semibold tracking-wide text-muted-foreground uppercase">
                    {section.group}
                  </h3>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-foreground">
                            {item.label}
                          </p>
                          {item.hint && (
                            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                              {item.hint}
                            </p>
                          )}
                        </div>
                        <KbdRow
                          className="shrink-0 justify-end pt-0.5"
                          tokens={keycaps(item, isMac)}
                          joiner={item.keys.length > 1 ? 'then' : undefined}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-border/60 bg-muted/30 px-6 py-3 text-micro text-muted-foreground">
          <KbdRow tokens={['G', 'D']} joiner="then" />
          <span>
            is a sequence: press the first key, let go, then press the second.
            Everything else — like
          </span>
          <KbdRow tokens={formatCombo('mod+k', isMac)} />
          <span>— is held down together.</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
