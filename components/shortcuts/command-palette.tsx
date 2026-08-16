'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight as GoToIcon,
  CircleNotch as SpinnerIcon,
  ClipboardText as ProtocolIcon,
  Flask as ExperimentIcon,
  FolderOpen as ProjectIcon,
  Keyboard as KeyboardIcon,
  NotePencil as LabNoteIcon,
  Plus as CreateIcon,
  TestTube as SampleIcon,
} from '@phosphor-icons/react/ssr'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { keycapsOf } from '@/lib/shortcuts/keycaps'
import { Kbd, KbdRow } from '@/components/ui/kbd'
import { CREATE_LAB_NOTE_EVENT, useShortcuts } from '@/contexts/shortcuts-context'
import { CREATE_ACTIONS, createActionHref } from '@/lib/app-create-actions'
import { formatCombo, isMacPlatform, isSequence } from '@/lib/shortcuts/match'
import { SHORTCUTS } from '@/lib/shortcuts/registry'
import type { ShortcutDef } from '@/lib/shortcuts/types'
import { cn } from '@/lib/utils'
// Type-only, so the route module never enters the client bundle.
import type { SearchResultItem } from '@/app/api/search/route'

type EntityType = SearchResultItem['type']

/** Leading character that narrows what the palette searches. */
type PrefixMode = '>' | '@' | '#'

const PREFIXES: { char: PrefixMode; name: string; hint: string }[] = [
  { char: '>', name: 'Commands', hint: 'run a command' },
  { char: '@', name: 'Jump to', hint: 'jump to an entity' },
  { char: '#', name: 'Lab notes', hint: 'lab notes only' },
]

/**
 * Icons are stored as elements rather than components so the per-type map needs
 * no component-type gymnastics — they are created once at module scope.
 */
const TYPE_ICON: Record<EntityType, ReactNode> = {
  project: <ProjectIcon className="size-4" aria-hidden />,
  experiment: <ExperimentIcon className="size-4" aria-hidden />,
  lab_note: <LabNoteIcon className="size-4" aria-hidden />,
  protocol: <ProtocolIcon className="size-4" aria-hidden />,
  sample: <SampleIcon className="size-4" aria-hidden />,
}

const TYPE_LABEL: Record<EntityType, string> = {
  project: 'Project',
  experiment: 'Experiment',
  lab_note: 'Lab note',
  protocol: 'Protocol',
  sample: 'Sample',
}

const MIN_QUERY = 2
const DEBOUNCE_MS = 300

type PaletteCommand = {
  id: string
  label: string
  /** Rendered keycap tokens, e.g. `['G', 'D']` or `['⌘', '/']`. */
  caps: string[]
  /** True for leader sequences ("G then D"), false for held chords. */
  sequence: boolean
  icon: ReactNode
  run: () => void
}


/**
 * The command palette — search plus every navigable and creatable thing, with
 * each row wearing its own shortcut so the palette teaches the keyboard.
 *
 * Commands are derived from `lib/shortcuts/registry.ts` and
 * `lib/app-create-actions.ts`, never hand-listed, so they cannot drift from the
 * keys the global dispatcher actually binds.
 */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const { openCheatSheet } = useShortcuts()

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultItem[]>([])
  const [loading, setLoading] = useState(false)
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

  const firstChar = query.charAt(0)
  const mode: PrefixMode | null =
    firstChar === '>' || firstChar === '@' || firstChar === '#'
      ? firstChar
      : null
  const term = (mode ? query.slice(1) : query).trim()

  const showCommands = mode === null || mode === '>'
  const showResults = mode === null || mode === '@' || mode === '#'

  // Debounced server search. Aborting on cleanup is what stops a slow response
  // for an older query from landing after a newer one.
  useEffect(() => {
    if (!showResults || term.length < MIN_QUERY) {
      setResults([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        })
        const data = await res.json()
        setResults(res.ok ? (data.results ?? []) : [])
      } catch (err) {
        // A superseded query is expected, not a failure — leave state alone.
        if (controller.signal.aborted) return
        console.error('Command palette search failed', err)
        setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [showResults, term])

  const commands = useMemo<PaletteCommand[]>(() => {
    const out: PaletteCommand[] = []

    // goto.* — derived from the registry so a new nav entry needs no edit here.
    for (const def of SHORTCUTS) {
      if (!def.id.startsWith('goto.') || !def.href) continue
      const href = def.href
      out.push({
        id: def.id,
        label: def.label,
        caps: keycapsOf(def, isMac),
        sequence: isSequence(def.keys),
        icon: <GoToIcon className="size-4" aria-hidden />,
        run: () => router.push(href),
      })
    }

    // create.* — CREATE_ACTIONS owns the order and the hrefs; the registry
    // supplies the keys and the wording.
    const createDefs = new Map(
      SHORTCUTS.filter((def) => def.id.startsWith('create.')).map((def) => [
        def.id,
        def,
      ]),
    )

    for (const action of CREATE_ACTIONS) {
      const id = `create.${action.id}`
      const def = createDefs.get(id)
      const row = {
        id,
        label: def?.label ?? `New ${action.label.toLowerCase()}`,
        caps: def ? keycapsOf(def, isMac) : [],
        sequence: def ? isSequence(def.keys) : false,
        icon: <CreateIcon className="size-4" aria-hidden />,
      }

      // The new-lab-note dialog is owned by the sidebar, so ask for it by event.
      if (action.id === 'labNote') {
        out.push({
          ...row,
          run: () => window.dispatchEvent(new CustomEvent(CREATE_LAB_NOTE_EVENT)),
        })
        continue
      }

      // ponytail: unscoped hrefs, matching the global dispatcher. Pass the
      // active project id to createActionHref() here if the palette should
      // inherit project scope the way the sidebar New menu does.
      const href = createActionHref(action)
      if (href) out.push({ ...row, run: () => router.push(href) })
    }

    const cheatSheet = SHORTCUTS.find((def) => def.id === 'shortcuts.open')
    out.push({
      id: 'shortcuts.open',
      label: 'Keyboard shortcuts',
      caps: cheatSheet ? keycapsOf(cheatSheet, isMac) : [],
      sequence: cheatSheet ? isSequence(cheatSheet.keys) : false,
      icon: <KeyboardIcon className="size-4" aria-hidden />,
      run: openCheatSheet,
    })

    return out
  }, [isMac, router, openCheatSheet])

  const visibleCommands = useMemo(() => {
    if (!showCommands) return []
    const needles = term.toLowerCase().split(/\s+/).filter(Boolean)
    if (needles.length === 0) return commands
    return commands.filter((command) => {
      const haystack = `${command.label} ${command.caps.join(' ')}`.toLowerCase()
      return needles.every((needle) => haystack.includes(needle))
    })
  }, [commands, showCommands, term])

  // '#' narrows the same endpoint's results rather than asking for a
  // lab-note-only search — /api/search has no type filter.
  const visibleResults = useMemo(() => {
    if (!showResults) return []
    return mode === '#'
      ? results.filter((item) => item.type === 'lab_note')
      : results
  }, [results, showResults, mode])

  const activeMode = mode ? PREFIXES.find((p) => p.char === mode) : undefined
  const needsMoreChars =
    showResults && !showCommands && term.length > 0 && term.length < MIN_QUERY

  /**
   * Close first, then act on the next frame: two of these actions open another
   * dialog (the cheat sheet, the new-lab-note dialog) and Radix needs the
   * closing dialog to finish releasing focus before the next one traps it.
   */
  function runAndClose(action: () => void) {
    onOpenChange(false)
    setQuery('')
    requestAnimationFrame(action)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dialogSize="md"
        showCloseButton={false}
        className="flex max-h-[70dvh] flex-col gap-0 overflow-hidden p-0"
      >
        {/* The shadcn CommandDialog puts these outside DialogContent, where
            Radix cannot use them to label the dialog. Kept inside here. */}
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search projects, experiments, lab notes, protocols and samples, or run
          a command.
        </DialogDescription>

        {/* Filtering is ours: results come pre-filtered from the server and
            commands are matched above. cmdk's own fuzzy pass would fight both. */}
        <Command
          shouldFilter={false}
          className="flex min-h-0 flex-1 flex-col bg-transparent"
        >
          <div className="relative shrink-0 border-b border-border/60">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search or type a command…"
              className={cn('h-11', activeMode && 'pr-28')}
            />
            {activeMode && (
              <span className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md bg-muted px-2 py-0.5 text-2xs font-medium text-muted-foreground">
                {activeMode.name}
              </span>
            )}
          </div>

          <CommandList className="max-h-none min-h-0 flex-1">
            {loading && (
              <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <SpinnerIcon className="size-4 animate-spin" aria-hidden />
                Searching…
              </div>
            )}

            {/* Suppressed while loading: cmdk counts rendered items, and the
                spinner is not one, so Empty would show alongside it. */}
            {!loading && (
              <CommandEmpty>
                {needsMoreChars
                  ? `Type at least ${MIN_QUERY} characters to search.`
                  : 'No matches.'}
              </CommandEmpty>
            )}

            {visibleResults.length > 0 && (
              <CommandGroup heading={mode === '#' ? 'Lab notes' : 'Results'}>
                {visibleResults.map((item) => (
                  <CommandItem
                    key={`${item.type}:${item.id}`}
                    value={`result:${item.type}:${item.id}`}
                    onSelect={() => runAndClose(() => router.push(item.href))}
                  >
                    {TYPE_ICON[item.type]}
                    <span className="min-w-0 flex-1 truncate">
                      {item.title}
                      {item.subtitle && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.subtitle}
                        </span>
                      )}
                    </span>
                    <span className="ml-auto shrink-0 text-2xs tracking-wide text-muted-foreground uppercase">
                      {TYPE_LABEL[item.type]}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {visibleResults.length > 0 && visibleCommands.length > 0 && (
              <CommandSeparator />
            )}

            {visibleCommands.length > 0 && (
              <CommandGroup heading="Commands">
                {visibleCommands.map((command) => (
                  <CommandItem
                    key={command.id}
                    value={`command:${command.id}`}
                    onSelect={() => runAndClose(command.run)}
                  >
                    {command.icon}
                    <span className="min-w-0 flex-1 truncate">
                      {command.label}
                    </span>
                    {command.caps.length > 0 && (
                      <KbdRow
                        className="ml-auto shrink-0 justify-end"
                        tokens={command.caps}
                        joiner={command.sequence ? 'then' : undefined}
                      />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 bg-muted/30 px-4 py-2.5 text-micro text-muted-foreground">
            {PREFIXES.map((prefix) => (
              <span
                key={prefix.char}
                className="inline-flex items-center gap-1.5"
              >
                <Kbd>{prefix.char}</Kbd>
                {prefix.hint}
              </span>
            ))}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
