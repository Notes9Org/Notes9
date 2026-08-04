"use client"

import { useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { ChartLine, Palette, Lightning, CaretDown } from "@phosphor-icons/react/ssr"

import { cn } from "@/lib/utils"
import { Collapse, EASE_OUT, TabPill } from "./motion"

/**
 * The inspector, split Data | Style.
 *
 * The split is not a tidiness choice. It is Law 5 made visible: everything on
 * the Data tab recomputes (and shows the compute indicator), everything on the
 * Style tab is applied client-side in a frame. Once a researcher notices that
 * the left tab thinks and the right tab doesn't, they stop wondering why some
 * edits pause and others don't.
 *
 * Nearly every chart editor worth copying already separates these, Rows, Hex,
 * Confluence, Canva, Mixpanel, but for them it is organisation. Here it is a
 * property of the architecture that happens to be legible.
 */

export type InspectorTab = "data" | "style"

export function Inspector({
  tab,
  onTabChange,
  computing,
  dataChildren,
  styleChildren,
  className,
  flush,
}: {
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  /** True while the engine runs. Only ever shown on the Data tab. */
  computing?: boolean
  dataChildren: ReactNode
  styleChildren: ReactNode
  className?: string
  /** Set when a dock already supplies the card surface and title. */
  flush?: boolean
}) {
  const reduce = useReducedMotion()

  return (
    <aside
      className={cn("flex min-h-0 flex-col bg-card", className)}
      aria-label="Figure inspector"
    >
      {/* No tinted header, no heavy rule. The segmented control IS the head:
          anything more is chrome competing with the controls beneath it. */}
      <div className={cn("px-3 pb-1", flush ? "pt-2.5" : "pt-3")}>
        <div
          role="tablist"
          aria-label="Inspector sections"
          className="relative flex gap-0.5 rounded-lg bg-muted/50 p-0.5"
        >
          {(
            [
              { id: "data" as const, label: "Data", icon: ChartLine, hint: "Changes recompute" },
              { id: "style" as const, label: "Style", icon: Palette, hint: "Applied instantly" },
            ]
          ).map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(t.id)}
                title={t.hint}
                className={cn(
                  "relative flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {active && <TabPill layoutId="inspector-tab-pill" />}
                <span className="relative z-[1] inline-flex items-center gap-1.5">
                  <t.icon className="size-3.5" weight={active ? "fill" : "regular"} />
                  {t.label}
                </span>
              </button>
            )
          })}
        </div>

        {/* The honest label for each side. */}
        <p className="mt-2 flex items-center gap-1.5 px-1 text-[11.5px] text-muted-foreground/80">
          {tab === "data" ? (
            <>
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  computing ? "bg-[var(--n9-accent)]" : "bg-muted-foreground/40"
                )}
              />
              {computing ? "Recomputing…" : "Changes here recompute the result"}
            </>
          ) : (
            <>
              <Lightning className="size-3 text-muted-foreground/70" weight="fill" />
              Changes here apply instantly, without recomputing
            </>
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <motion.div
          key={tab}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: tab === "data" ? -6 : 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, x: 0 }}
          transition={reduce ? { duration: 0.12 } : { duration: 0.2, ease: EASE_OUT }}
        >
          {tab === "data" ? dataChildren : styleChildren}
        </motion.div>
      </div>
    </aside>
  )
}

/** A collapsible group inside the inspector. */
export function InspectorSection({
  title,
  children,
  defaultOpen = true,
  hint,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
  hint?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="px-1 pt-4 first:pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group/sec flex w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="min-w-0">
          <span className="block text-[13px] font-medium text-foreground">{title}</span>
          {hint && <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{hint}</span>}
        </span>
        <CaretDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/0 transition-all duration-200 group-hover/sec:text-muted-foreground/70",
            open && "rotate-180"
          )}
        />
      </button>
      <Collapse open={open}>
        <div className="grid gap-3.5 px-3 pb-2 pt-2">{children}</div>
      </Collapse>
    </section>
  )
}

/** A labelled control row, so the inspector stays visually regular. */
export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-snug text-muted-foreground/80">{hint}</span>}
    </label>
  )
}

/**
 * Chart-type picker as an icon grid.
 *
 * Every reference that does this well uses a grid rather than a dropdown
 * (Better Stack, Asana, Attio, Airtable), because chart choice is recognition,
 * not recall: you know the shape you want before you know its name.
 */
export function ChartTypeGrid<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; icon: React.ComponentType<{ className?: string }> }[]
  value: T
  onChange: (id: T) => void
}) {
  const reduce = useReducedMotion()
  return (
    <div className="grid grid-cols-4 gap-2">
      {options.map((opt) => {
        const active = opt.id === value
        return (
          <motion.button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            title={opt.label}
            aria-pressed={active}
            whileTap={reduce ? undefined : { scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className={cn(
              "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl text-[10.5px] transition-colors",
              active
                ? "bg-[var(--n9-accent)]/[0.10] text-[var(--n9-accent)]"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            <opt.icon className="size-[18px]" />
            <span className="w-full truncate px-0.5 text-center leading-tight">{opt.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
