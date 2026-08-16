'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  MagnifyingGlass as SearchIcon,
  X as ClearIcon,
} from '@phosphor-icons/react/ssr'

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
import { cn } from '@/lib/utils'
import { formatCombo, isMacPlatform } from '@/lib/shortcuts/match'
import { groupedShortcuts } from '@/lib/shortcuts/registry'
import type { ShortcutDef } from '@/lib/shortcuts/types'
import { keycapsOf } from '@/lib/shortcuts/keycaps'

/** The registry is static, so the sections only need building once. */
const SECTIONS = groupedShortcuts()
const TOTAL = SECTIONS.reduce((n, s) => n + s.items.length, 0)

/** Sentinel for "don't narrow to one group". Not a real group name. */
const ALL = '__all__'

const INDICATOR_SPRING = {
  type: 'spring',
  stiffness: 500,
  damping: 40,
  mass: 0.7,
} as const


/** Everything a search term is allowed to hit, lowercased once per entry. */
function haystack(item: ShortcutDef, isMac: boolean): string {
  return [item.label, item.hint ?? '', ...item.keys, ...keycapsOf(item, isMac)]
    .join(' ')
    .toLowerCase()
}

/**
 * The keyboard shortcuts cheat sheet.
 *
 * Renders the registry rather than a hand-kept copy, so a shortcut can never be
 * bound without being documented (or documented without existing). Search and a
 * category row narrow it: both apply at once, and a category that the current
 * search empties simply stops being offered, so you can never land on a blank
 * panel by typing.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>(ALL)
  // Resolved after mount: the server has no navigator, and rendering ⌘ on the
  // server for a Windows client (or the reverse) is a hydration mismatch.
  const [isMac, setIsMac] = useState(false)
  const reduce = useReducedMotion()

  useEffect(() => {
    setIsMac(isMacPlatform())
  }, [])

  // Reopening should not inherit the last search or the last category.
  useEffect(() => {
    if (!open) {
      setQuery('')
      setCategory(ALL)
    }
  }, [open])

  // Search spans every category, so the pill counts below can say how many hits
  // each one holds rather than only describing the active one.
  const matched = useMemo(() => {
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

  // A category the search has emptied is no longer selectable, so fall back to
  // showing everything instead of an empty panel. Derived, not stored, so the
  // choice comes back if the search widens again.
  const effectiveCategory =
    category !== ALL && matched.some((s) => s.group === category) ? category : ALL

  const sections =
    effectiveCategory === ALL
      ? matched
      : matched.filter((s) => s.group === effectiveCategory)

  const totalMatches = matched.reduce((n, s) => n + s.items.length, 0)
  const searching = query.trim().length > 0
  const single = sections.length === 1

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dialogSize="xl"
        className="flex max-h-[86dvh] flex-col gap-0 overflow-hidden p-0"
      >
        <div className="shrink-0 border-b border-border/60 px-6 pt-6 pb-3">
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
              placeholder="Search by what it does, or by key…"
              aria-label="Search keyboard shortcuts"
              className="h-10 rounded-xl pl-9 pr-9"
            />
            {searching && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ClearIcon className="size-3.5" />
              </button>
            )}
          </div>

          {/* Category row. Scrolls sideways rather than wrapping, so the header
              keeps a fixed height and the list below never jumps. */}
          <div className="hide-scrollbar -mx-1 mt-3 flex items-center gap-1 overflow-x-auto px-1 pb-1">
            <CategoryPill
              label="All"
              count={searching ? totalMatches : TOTAL}
              active={effectiveCategory === ALL}
              onClick={() => setCategory(ALL)}
              reduce={reduce}
            />
            {matched.map((section) => (
              <CategoryPill
                key={section.group}
                label={section.group}
                count={section.items.length}
                active={effectiveCategory === section.group}
                onClick={() => setCategory(section.group)}
                reduce={reduce}
              />
            ))}
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
            <div
              className={cn(
                'grid auto-rows-min grid-cols-1 items-start gap-x-10 gap-y-6 px-6 py-5',
                // Two columns of sections normally. Narrowed to a single
                // section there is nothing to put beside it, so the section
                // goes full width and flows its own rows into two columns
                // instead of leaving half the panel empty.
                !single && 'sm:grid-cols-2',
              )}
            >
              {sections.map((section) => (
                <section key={section.group}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 border-b border-border/50 pb-1.5">
                    <h3 className="text-micro font-semibold tracking-wide text-muted-foreground uppercase">
                      {section.group}
                    </h3>
                    <span className="text-2xs tabular-nums text-muted-foreground/60">
                      {section.items.length}
                    </span>
                  </div>
                  <ul className={cn(single && 'sm:columns-2 sm:gap-x-10')}>
                    {section.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex break-inside-avoid items-start justify-between gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50"
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
                          tokens={keycapsOf(item, isMac)}
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

/**
 * One category chip. The active background is a shared `layoutId` element, so
 * moving between categories slides the chip instead of cutting to it — the same
 * treatment the view-mode and section toggles use.
 */
function CategoryPill({
  label,
  count,
  active,
  onClick,
  reduce,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  reduce: boolean | null
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'relative shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors duration-200',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {active &&
        (reduce ? (
          <span className="absolute inset-0 rounded-lg bg-muted ring-1 ring-border/60" />
        ) : (
          <motion.span
            layoutId="shortcut-category-pill"
            className="absolute inset-0 rounded-lg bg-muted ring-1 ring-border/60"
            transition={INDICATOR_SPRING}
          />
        ))}
      <span className="relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap">
        {label}
        <span
          className={cn(
            'text-2xs tabular-nums',
            active ? 'text-muted-foreground' : 'text-muted-foreground/60',
          )}
        >
          {count}
        </span>
      </span>
    </button>
  )
}
