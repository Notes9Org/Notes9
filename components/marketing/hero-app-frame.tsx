"use client"

import {
  Books,
  ChartLine,
  ClipboardText,
  Command,
  FolderSimple,
  Flask as FlaskConical,
  Gauge,
  Graph,
  MagnifyingGlass,
  NotePencil,
  PencilSimpleLine,
  Plus,
  Sparkle as Sparkles,
  TestTube,
  FileText,
  Quotes,
  CaretLeft,
  CaretDown,
  Printer,
  DownloadSimple,
  ArrowClockwise,
  ArrowCounterClockwise,
  WarningCircle,
  Check,
  Minus,
  ArrowsOut,
  Flag,
  Question,
  Moon,
  UploadSimple,
} from "@phosphor-icons/react/ssr"
import type { Icon as PhosphorIcon } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

/**
 * The literature page, rendered rather than screenshotted.
 *
 * This replaces a 700 KB PNG behind the hero. Real markup is sharp at any
 * viewport and on any display, follows the theme instead of needing a light and
 * a dark capture, reflows rather than cropping, and costs nothing to download.
 * It also cannot go stale the way a screenshot does the moment the app changes.
 *
 * Entirely decorative: `aria-hidden` with pointer events off throughout, so the
 * only reachable control in the hero is the real search bar layered above it.
 * Nothing here is a working input — it is a picture made of divs.
 *
 * Content mirrors the actual page, including the paper that the demo query
 * returns, so it is a faithful likeness rather than lorem filler.
 */
export function HeroAppFrame({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none overflow-hidden bg-background text-foreground",
        className
      )}
    >
      <div className="flex h-full min-w-[74rem]">
        <Sidebar />
        <Main />
      </div>
    </div>
  )
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */

const NAV: { icon: PhosphorIcon; label: string; active?: boolean; child?: boolean }[] = [
  { icon: Gauge, label: "Dashboard" },
  { icon: FolderSimple, label: "Projects" },
  { icon: Books, label: "Literature", active: true },
  { icon: ClipboardText, label: "Protocols" },
  { icon: FlaskConical, label: "Experiments" },
  { icon: NotePencil, label: "Lab notes", child: true },
  { icon: ChartLine, label: "Data", child: true },
  { icon: TestTube, label: "Samples" },
  { icon: PencilSimpleLine, label: "Writing" },
  { icon: FileText, label: "Reports" },
  { icon: Sparkles, label: "Catalyst" },
  { icon: Graph, label: "Research map" },
]

function Sidebar() {
  return (
    <aside className="w-[17rem] shrink-0 border-r border-border/60 bg-background px-3 py-4">
      <div className="px-2">
        <p className="font-serif text-[21px] font-semibold leading-none tracking-tight">
          Notes9
        </p>
        <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.28em] text-muted-foreground">
          Research Lab
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
        <MagnifyingGlass className="size-4 text-muted-foreground" />
        <span className="flex-1 text-[13.5px] text-muted-foreground">Search</span>
        <span className="flex items-center gap-0.5 font-mono text-[10.5px] text-muted-foreground/70">
          <Command className="size-3" />K
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-[color-mix(in_oklab,#6c8a68_18%,transparent)] px-2.5 py-2">
        <Plus className="size-4 text-[#4f6b4c]" />
        <span className="text-[13.5px] font-medium text-[#3f5a3c]">New</span>
      </div>

      <nav className="mt-4 rounded-xl border border-border/60 p-1.5">
        {NAV.map((item) => (
          <div
            key={item.label}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2",
              item.child && "ml-3",
              item.active && "bg-[var(--n9-accent-light)]"
            )}
          >
            <item.icon
              className={cn(
                "size-4 shrink-0",
                item.active ? "text-[var(--n9-accent)]" : "text-muted-foreground"
              )}
              weight={item.active ? "fill" : "regular"}
            />
            <span
              className={cn(
                "text-[13.5px]",
                item.active ? "font-medium text-foreground" : "text-muted-foreground"
              )}
            >
              {item.label}
            </span>
          </div>
        ))}
      </nav>
    </aside>
  )
}

/* ── Main column ────────────────────────────────────────────────────────── */

function Main() {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between border-b border-border/60 bg-[var(--n9-accent-light)]/60 px-8 py-3">
        <span className="text-[13.5px] text-muted-foreground">Literature</span>
        <div className="flex items-center gap-2.5">
          <Flag className="size-4 text-muted-foreground/70" />
          <Question className="size-4 text-muted-foreground/70" />
          <Moon className="size-4 text-muted-foreground/70" />
          <span className="flex size-7 items-center justify-center rounded-md border border-[var(--n9-accent)]/40 bg-[var(--n9-accent-light)]">
            <Sparkles className="size-4 text-[var(--n9-accent)]" weight="fill" />
          </span>
        </div>
      </div>

      <div className="px-8 py-7">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="font-serif text-[31px] leading-tight tracking-tight">
              Literature Reviews
            </h2>
            <p className="mt-1 text-[13.5px] text-muted-foreground">
              Search papers and manage your reference library
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3.5 py-2 text-[12.5px] font-medium text-foreground">
              <UploadSimple className="size-3" />
              Upload PDF
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--n9-accent)] px-3.5 py-2 text-[12.5px] font-semibold text-white">
              <Plus className="size-3" />
              Add Reference
            </span>
          </div>
        </div>

        <div className="mt-5 inline-flex items-center gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-3.5 py-2 text-[12.5px] font-medium shadow-sm">
            <MagnifyingGlass className="size-3" />
            Search &amp; read
          </span>
          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] text-muted-foreground">
            <Books className="size-3" />
            My Library
          </span>
        </div>

        {/* The app's own search field — flattened on purpose. Anything that reads
            as usable here competes with the real control layered above. */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-2.5">
          <MagnifyingGlass className="size-4 text-muted-foreground/60" />
          <span className="text-[13.5px] text-muted-foreground/60">
            cancer apoptotic protein review
          </span>
        </div>

        <div className="mt-5 flex items-center gap-4 border-b border-border/60">
          <span className="border-b-2 border-[var(--n9-accent)] pb-2 text-[12.5px] font-medium">
            Search results
          </span>
          <span className="pb-2 text-[12.5px] text-muted-foreground">Staging</span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] text-muted-foreground">
            Filters
          </span>
          <span className="text-[11.5px] text-muted-foreground">10 papers</span>
        </div>

        <AiOverview />
        <PaperResult />
      </div>
    </div>
  )
}

function AiOverview() {
  return (
    <div className="mt-4 rounded-xl border border-border/60 bg-card/60 p-5">
      <p className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--n9-accent)]">
        <Sparkles className="size-3" weight="fill" />
        AI overview
      </p>
      <p className="mt-2.5 text-[13px] leading-[1.85] text-foreground/80">
        Apoptosis is a fundamental programmed cell death mechanism whose dysregulation is a
        hallmark of cancer, driving tumour development, progression, and resistance to
        therapy<Cite n="1" />
        <Cite n="2" />. The two major apoptotic pathways—intrinsic (mitochondrial) and
        extrinsic (death receptor-mediated)—are regulated by a complex network of
        pro-apoptotic proteins such as Bid, Bim, Puma, Noxa and anti-apoptotic proteins
        (e.g. BCL-2, BCL-XL, MCL-1), with caspases serving as key executioners<Cite n="3" />.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] text-muted-foreground">
          Show more
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--n9-accent)] px-2.5 py-1 text-[11.5px] font-medium text-white">
          <Sparkles className="size-3" weight="fill" />
          Dive deeper with Catalyst
        </span>
      </div>
    </div>
  )
}

function Cite({ n }: { n: string }) {
  return (
    <sup className="ml-0.5 rounded-[3px] bg-[var(--n9-accent-light)] px-1 py-px font-mono text-[7px] text-[var(--n9-accent)]">
      {n}
    </sup>
  )
}

function PaperResult() {
  return (
    <>
      <p className="mt-5 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
        Directly relevant
      </p>
      <div className="mt-2 rounded-xl border border-border/60 bg-card/50 p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-4 items-center justify-center rounded border border-border/70 font-mono text-[9.5px] text-muted-foreground">
            1
          </span>
          <span className="rounded bg-[color-mix(in_oklab,#6c8a68_20%,transparent)] px-1.5 py-0.5 text-[10.5px] font-medium text-[#3f5a3c]">
            Open access
          </span>
          <span className="text-[10.5px] text-muted-foreground">
            British Journal of Cancer · 2016
          </span>
          <span className="text-[10.5px] text-muted-foreground">66 citations</span>
        </div>
        <p className="mt-2 text-[14.5px] font-semibold text-[var(--n9-accent)]">
          Targeting cell death signalling in cancer: minimising &lsquo;Collateral
          damage&rsquo;
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Joanna L. Fox, Marion MacFarlane
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-[var(--n9-accent-light)] px-2 py-0.5 text-[10.5px] font-medium text-[var(--n9-accent)]">
            <Sparkles className="size-3" weight="fill" />
            AI summary
          </span>
          <span className="rounded border border-border/70 px-2 py-0.5 text-[10.5px] text-muted-foreground">
            Abstract
          </span>
        </div>
      </div>
    </>
  )
}

/* ── Chart panel ────────────────────────────────────────────────────────── */

/** The seeded ELISA standard curve — the same points the demo workbook holds. */
const CURVE = [
  { x: 0, y: 0.05 },
  { x: 15.6, y: 0.28 },
  { x: 31.25, y: 0.51 },
  { x: 62.5, y: 0.92 },
  { x: 125, y: 1.45 },
  { x: 250, y: 1.98 },
  { x: 500, y: 2.42 },
  { x: 1000, y: 2.85 },
]

const PW = 520
const PH = 300
const PAD = { l: 52, r: 20, t: 34, b: 52 }

/**
 * The data workspace's chart card, rendered rather than captured.
 *
 * Plotly itself is far too heavy to pull onto a landing page — it is a
 * multi-megabyte dependency that exists for the real /data-analysis workspace,
 * not for a backdrop. Eight points, two axes and a legend are a path and some
 * text, so this reproduces the panel's chrome and the plot's look (including
 * Plotly's default blue) at no bundle cost.
 *
 * Decorative like the rest of the frame: aria-hidden, pointer events off.
 */
export function HeroChartPanel({ className }: { className?: string }) {
  const sx = (x: number) => PAD.l + (x / 1000) * (PW - PAD.l - PAD.r)
  const sy = (y: number) => PH - PAD.b - (y / 3) * (PH - PAD.t - PAD.b)

  const pts = CURVE.map((d) => ({ ...d, cx: sx(d.x), cy: sy(d.y) }))
  let path = `M ${pts[0].cx} ${pts[0].cy}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    path += ` C ${p1.cx + (p2.cx - p0.cx) / 6} ${p1.cy + (p2.cy - p0.cy) / 6}, ${
      p2.cx - (p3.cx - p1.cx) / 6
    } ${p2.cy - (p3.cy - p1.cy) / 6}, ${p2.cx} ${p2.cy}`
  }

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none rounded-xl border border-border/60 bg-card/85 shadow-[0_28px_70px_-32px_rgba(44,36,24,0.4)] backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <span className="flex items-center gap-2 text-[13.5px] font-medium">
          <ChartLine className="size-4 text-muted-foreground" />
          Drug Discovery Initiative
        </span>
        <span className="flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] text-muted-foreground">
          <UploadSimple className="size-3 rotate-180" />
          Export
        </span>
      </div>

      <div className="px-3 pb-3 pt-2">
        <svg viewBox={`0 0 ${PW} ${PH}`} className="w-full">
          <text
            x={PW / 2}
            y={18}
            textAnchor="middle"
            className="fill-foreground text-[15px]"
          >
            ELISA standard curve
          </text>

          {[0, 0.5, 1, 1.5, 2, 2.5, 3].map((v) => (
            <g key={v}>
              <line
                x1={PAD.l}
                x2={PW - PAD.r}
                y1={sy(v)}
                y2={sy(v)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={PAD.l - 8}
                y={sy(v) + 3.5}
                textAnchor="end"
                className="fill-muted-foreground text-[10px]"
              >
                {v}
              </text>
            </g>
          ))}

          {[0, 200, 400, 600, 800, 1000].map((v) => (
            <text
              key={v}
              x={sx(v)}
              y={PH - PAD.b + 18}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {v}
            </text>
          ))}

          <text
            x={(PW + PAD.l) / 2}
            y={PH - 16}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px]"
          >
            Concentration (pg/mL)
          </text>
          <text
            x={16}
            y={PH / 2}
            textAnchor="middle"
            transform={`rotate(-90 16 ${PH / 2})`}
            className="fill-muted-foreground text-[11px]"
          >
            OD450
          </text>

          {/* Plotly's default trace blue, so the plot reads as the real one. */}
          <path d={path} fill="none" stroke="#1f77b4" strokeWidth={2} strokeLinecap="round" />
          {pts.map((p) => (
            <circle key={p.x} cx={p.cx} cy={p.cy} r={3.2} fill="#1f77b4" />
          ))}

          <line
            x1={PAD.l + 10}
            x2={PAD.l + 34}
            y1={PH - 34}
            y2={PH - 34}
            stroke="#1f77b4"
            strokeWidth={2}
          />
          <circle cx={PAD.l + 22} cy={PH - 34} r={3.2} fill="#1f77b4" />
          <text
            x={PAD.l + 42}
            y={PH - 30}
            className="fill-muted-foreground text-[10px]"
          >
            OD450
          </text>
        </svg>
      </div>
    </div>
  )
}

/* ── Lab note panel ─────────────────────────────────────────────────────── */

/**
 * The lab-note editor, replicated from the real screen rather than approximated.
 *
 * The parts that make it recognisably Notes9 and not a generic text card are the
 * ones people actually look at: the Home / Insert / Layout ribbon with its
 * Calibri control and Citations menu, the horizontal ruler with terracotta
 * margin stops, the white page floating on a warm gutter with its "Enter
 * header…" slot, and — most distinctively — the pending-changes bar along the
 * bottom carrying Review diff, History, Discard and Accept & Save. That draft →
 * commit bar is unique to this product, so it does more identifying work than
 * the document body does.
 *
 * Decorative: aria-hidden, pointer events off.
 */
export function HeroNotePanel({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-[0_32px_80px_-34px_rgba(44,36,24,0.45)] backdrop-blur-sm",
        className
      )}
    >
      {/* Note title bar */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3.5 py-2.5">
        <CaretLeft className="size-3.5 text-muted-foreground" />
        <span className="flex-1 truncate text-[13.5px] font-medium">
          Drug Discovery Initiative
        </span>
        <Plus className="size-3.5 text-muted-foreground/70" />
        <Printer className="size-3.5 text-muted-foreground/70" />
        <DownloadSimple className="size-3.5 text-muted-foreground/70" />
      </div>

      {/* Ribbon */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
        <span className="rounded-md bg-background px-2 py-1 text-[10.5px] font-medium shadow-sm">
          Home
        </span>
        <span className="px-1.5 text-[10.5px] text-muted-foreground">Insert</span>
        <span className="px-1.5 text-[10.5px] text-muted-foreground">Layout</span>
        <span className="mx-1 h-3.5 w-px bg-border" />
        <ArrowCounterClockwise className="size-3 text-muted-foreground/70" />
        <ArrowClockwise className="size-3 text-muted-foreground/70" />
        <span className="ml-1 flex items-center gap-1 text-[10.5px] text-muted-foreground">
          Calibri
          <CaretDown className="size-2.5" />
        </span>
        <span className="ml-1 text-[11px] font-bold">B</span>
        <span className="text-[11px] italic text-muted-foreground">I</span>
        <span className="text-[11px] text-muted-foreground underline">U</span>
        <span className="ml-auto flex items-center gap-1 text-[10.5px] text-muted-foreground">
          <Quotes className="size-2.5" weight="fill" />
          Citations
        </span>
      </div>

      {/* Ruler with margin stops */}
      <div className="relative flex h-4 items-center gap-6 border-b border-border/40 bg-muted/25 px-8">
        <span className="absolute left-[18%] top-1/2 size-1.5 -translate-y-1/2 rounded-[1px] bg-[var(--n9-accent)]" />
        <span className="absolute right-[16%] top-1/2 size-1.5 -translate-y-1/2 rounded-[1px] bg-[var(--n9-accent)]" />
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <span key={n} className="font-mono text-[7px] text-muted-foreground/60">
            {n}
          </span>
        ))}
      </div>

      {/* Page on its gutter */}
      <div className="bg-muted/30 px-5 pb-2 pt-3">
        <div className="rounded-[2px] bg-white px-6 pb-4 pt-3.5 shadow-[0_1px_6px_rgba(44,36,24,0.14)]">
          <p className="text-[9px] text-[#b8b2a8]">Enter header…</p>
          <p className="mt-3 text-center text-[13px] font-bold leading-snug text-[#141414]">
            Latest Updates on Malaria Transmission Blocking Vaccines Pfs230
          </p>
          <p className="mt-3 text-[9.5px] text-[#1a56b8] underline">https://www.notes9.com</p>
          <p className="mt-3 text-[11px] font-semibold text-[#141414]">
            1. Recent Scientific Literature:
          </p>
          <p className="mt-1.5 text-[9.5px] leading-[1.75] text-[#2f2f2f]">
            – A comprehensive review titled &ldquo;Transmission-blocking malaria vaccines:
            past, present, and future&rdquo; was published in March 2023 in Cell Host
            Microbe, discussing the current state and future prospects of
            transmission-blocking vaccines, including Pfs23
          </p>
        </div>
      </div>

      {/* Draft → commit bar. The most distinctive strip on the screen. */}
      <div className="flex items-center gap-2 border-t border-border/50 px-3.5 py-2">
        <WarningCircle className="size-3 text-[#b98541]" />
        <span className="text-[10px] text-muted-foreground">Pending changes</span>
        <span className="ml-auto flex items-center gap-2.5 text-[10px] text-muted-foreground">
          <span className="hidden xl:inline">Review diff</span>
          <span className="hidden xl:inline">History</span>
          <span>Discard</span>
        </span>
        <span className="rounded-md bg-[var(--n9-accent)] px-2.5 py-1 text-[10px] font-semibold text-white">
          Accept &amp; Save
        </span>
      </div>
    </div>
  )
}

/* ── Research map panel ─────────────────────────────────────────────────── */

/** Node kinds, with the colours the app actually assigns them. */
const MAP_NODES = [
  { kind: "Drug Discovery Initiative", title: "Validation Run", c: "#7c3aed", x: 4, y: 12, w: 34 },
  { kind: "Experiment", title: "Protocol: Cell Culture Setup", c: "#2563eb", x: 42, y: 12, w: 36 },
  { kind: "Compound Screening", title: "Results Summary", c: "#dc2626", x: 82, y: 12, w: 32 },
  { kind: "Protein Structure Study", title: "Integrating deep learning with physics-based modeling", c: "#0d9488", x: 42, y: 40, w: 36 },
  { kind: "Gene Expression Analysis", title: "Observation Log — Day 1", c: "#ca8a04", x: 42, y: 68, w: 36 },
  { kind: "Protein Structure Study", title: "CBM-AB: graph-based antibody antigen binding", c: "#0d9488", x: 82, y: 44, w: 32 },
]

const MAP_FILTERS = [
  { label: "Project", icon: FolderSimple },
  { label: "Experiment", icon: FlaskConical },
  { label: "Protocol", icon: ClipboardText },
  { label: "Literature", icon: Books },
  { label: "Lab note", icon: NotePencil },
]

/**
 * The research map, replicated from the real screen.
 *
 * What identifies this screen is not the graph — every product with a graph has
 * a graph — but the filter bar above it: a scope select, an experiment
 * dropdown, a name filter, and a row of checked entity types, each with its own
 * icon and colour. That row is the product's data model stated out loud, so it
 * carries more meaning than the nodes do. The zoom stack and the minimap are the
 * other two things people recognise, so both are kept.
 *
 * Node and edge colours are the ones the app assigns per entity kind, not a
 * decorative palette.
 *
 * Decorative: aria-hidden, pointer events off.
 */
export function HeroResearchMapPanel({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-[0_32px_80px_-34px_rgba(44,36,24,0.45)] backdrop-blur-sm",
        className
      )}
    >
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/50 px-3 py-2.5">
        <span className="rounded-md border border-border/70 px-2 py-1 text-[9.5px]">
          Validation Run
        </span>
        <span className="flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-[9.5px] text-muted-foreground">
          All experiments
          <CaretDown className="size-2" />
        </span>
        {MAP_FILTERS.map((f) => (
          <span key={f.label} className="flex items-center gap-1">
            <span className="flex size-2.5 items-center justify-center rounded-[2px] bg-[var(--n9-accent)]">
              <Check className="size-1.5 text-white" weight="bold" />
            </span>
            <f.icon className="size-2.5 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground">{f.label}</span>
          </span>
        ))}
      </div>

      {/* Canvas */}
      <div className="relative h-[11.5rem] bg-[radial-gradient(circle,color-mix(in_oklab,var(--foreground)_10%,transparent)_0.6px,transparent_0.7px)] [background-size:9px_9px]">
        <svg viewBox="0 0 120 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d="M 21 16 H 44" stroke="#7c3aed" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
          <path d="M 62 20 V 44 H 60" stroke="#2563eb" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
          <path d="M 62 20 V 72 H 60" stroke="#ca8a04" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
          <path d="M 78 16 H 84" stroke="#dc2626" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
          <path d="M 78 48 H 84" stroke="#0d9488" strokeWidth="0.5" fill="none" vectorEffect="non-scaling-stroke" />
        </svg>

        {MAP_NODES.map((n) => (
          <div
            key={n.title}
            className="absolute rounded-[3px] border bg-card px-1.5 py-1 shadow-sm"
            style={{
              left: `${n.x}%`,
              top: `${n.y}%`,
              width: `${n.w}%`,
              borderColor: `color-mix(in oklab, ${n.c} 45%, transparent)`,
              background: `color-mix(in oklab, ${n.c} 7%, var(--card))`,
            }}
          >
            <p
              className="truncate text-[4.5px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: n.c }}
            >
              {n.kind}
            </p>
            <p className="mt-px line-clamp-2 text-[5.5px] leading-tight text-foreground/85">
              {n.title}
            </p>
          </div>
        ))}

        {/* Zoom stack */}
        <div className="absolute bottom-2 left-2 overflow-hidden rounded-md border border-border/70 bg-card">
          {[Plus, Minus, ArrowsOut].map((Icon, i) => (
            <div
              key={i}
              className={cn(
                "flex size-4 items-center justify-center",
                i > 0 && "border-t border-border/60"
              )}
            >
              <Icon className="size-2 text-muted-foreground" />
            </div>
          ))}
        </div>

        {/* Minimap */}
        <div className="absolute bottom-2 right-2 h-9 w-14 rounded-sm border-[1.5px] border-[var(--n9-accent)]/70 bg-card p-1">
          <div className="flex h-full flex-col justify-center gap-[1.5px] pl-3">
            {["#7c3aed", "#2563eb", "#0d9488", "#0d9488", "#ca8a04", "#dc2626"].map((c, i) => (
              <span key={i} className="h-[1.5px] w-3 rounded-full" style={{ background: c }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
