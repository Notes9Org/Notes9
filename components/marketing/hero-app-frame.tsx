"use client"

import {
  Books,
  ChartLine,
  House,
  ClipboardText,
  Command,
  FolderSimple,
  Flask as FlaskConical,
  Gauge,
  Graph,
  MagnifyingGlass,
  NotePencil,
  PencilSimpleLine,
  PenNib,
  Plus,
  Sparkle as Sparkles,
  TestTube,
  FileText,
  Quotes,
  CaretLeft,
  CaretDown,
  CaretUpDown,
  Database,
  Link as LinkIcon,
  Printer,
  DownloadSimple,
  ArrowClockwise,
  ArrowCounterClockwise,
  WarningCircle,
  Check,
  CheckCircle,
  Circle,
  CircleNotch,
  Minus,
  ArrowsOut,
  Flag,
  Question,
  Moon,
  UploadSimple,
  SlidersHorizontal,
  LockOpen,
  Scroll,
  ArrowSquareOut,
  Bookmark,
  GitDiff,
  TextAa,
  ClockCounterClockwise,
  XCircle,
  SquaresFour,
  List as ListIcon,
  ArrowUpRight,
  Sigma,
  TrendUp,
  Atom,
  FolderOpen,
  Globe,
  Paperclip,
  Microphone,
  ArrowUp,
} from "@phosphor-icons/react/ssr"
import type { CSSProperties, ReactNode } from "react"
import type { Icon as PhosphorIcon } from "@phosphor-icons/react"
import { FlareIcon } from "@/components/ui/flare-icon"
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
 * Nothing here is a working input, it is a picture made of divs.
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
  { icon: FlareIcon as unknown as PhosphorIcon, label: "Catalyst" },
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
            <FlareIcon className="size-4 text-[var(--n9-accent)]" weight="fill" />
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

        {/* The app's own search field, flattened on purpose. Anything that reads
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
        <Cite n="2" />. The two major apoptotic pathways, intrinsic (mitochondrial) and
        extrinsic (death receptor-mediated), are regulated by a complex network of
        pro-apoptotic proteins such as Bid, Bim, Puma, Noxa and anti-apoptotic proteins
        (e.g. BCL-2, BCL-XL, MCL-1), with caspases serving as key executioners<Cite n="3" />.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="rounded-md border border-border/70 px-2.5 py-1 text-[11.5px] text-muted-foreground">
          Show more
        </span>
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--n9-accent)] px-2.5 py-1 text-[11.5px] font-medium text-white">
          <FlareIcon className="size-3" weight="fill" />
          Dive deeper with Catalyst
        </span>
      </div>
    </div>
  )
}

/**
 * An inline citation, drawn the way the product draws it.
 *
 * The real marker is `.notes9-cite` (styles/html-content.css): a fully rounded
 * superscript pill, tinted to the accent at 12% fill and 25% border, not the
 * square bracket most tools use. It is the single most repeated element in a
 * grounded answer, so getting its silhouette right does more for the likeness
 * than any of the surrounding chrome.
 */
function Cite({ n }: { n: string }) {
  return (
    <sup className="ml-0.5 inline-block min-w-[1.25em] rounded-full border border-[var(--n9-accent)]/25 bg-[var(--n9-accent)]/[0.12] px-[0.4em] text-center align-super text-[0.7em] font-semibold leading-[1.4] text-[var(--n9-accent)]">
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

/** The seeded ELISA standard curve, the same points the demo workbook holds. */
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
 * Plotly itself is far too heavy to pull onto a landing page, it is a
 * multi-megabyte dependency that exists for the real /data-analysis workspace,
 * not for a backdrop. Eight points, two axes and a legend are a path and some
 * text, so this reproduces the panel's chrome and the plot's look (including
 * Plotly's default blue) at no bundle cost.
 *
 * Decorative like the rest of the frame: aria-hidden, pointer events off.
 */
export function HeroChartPanel({ className, style }: {
  className?: string
  style?: CSSProperties
}) {
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
        "pointer-events-none select-none rounded-xl border border-border/60 bg-card/85 shadow-[0_20px_54px_-32px_rgba(44,36,24,0.28)] backdrop-blur-sm",
        className
      )}
      style={style}
    >
      {/* The analysis phase tabs. Standard curve and Plate only appear when the
          data warrants them, and carry an accent dot marking that the workspace
          surfaced them automatically. That behaviour is the distinctive thing
          about this screen, so both are shown. */}
      <div className="flex items-center gap-1 border-b border-border/50 px-3 py-1.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-background px-1.5 py-1 text-[9.5px] font-medium shadow-sm">
          <ChartLine className="size-2.5" weight="fill" />
          Chart
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-1 text-[9.5px] text-muted-foreground">
          <Sigma className="size-2.5" />
          Statistics
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-1 text-[9.5px] text-muted-foreground">
          <TrendUp className="size-2.5" />
          Standard curve
          <span className="size-1 rounded-full bg-[var(--n9-accent)]" />
        </span>
        <span className="ml-auto shrink-0 text-[8.5px] tabular-nums text-muted-foreground">
          8 rows · 4 cols
        </span>
      </div>

      {/* The chart card's own header. The pane is titled "Chart"; the record's
          name lives in the plot title, not the chrome. */}
      <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-2">
        <span className="flex items-center gap-2 text-[12px] font-semibold">
          <ChartLine className="size-3.5 text-muted-foreground" />
          Chart
        </span>
        <span className="flex items-center gap-2">
          <span className="hidden text-[8.5px] text-muted-foreground min-[1600px]:inline">
            Double-click to edit · right-click for menu
          </span>
          <span className="flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 text-[9.5px] text-muted-foreground">
            <DownloadSimple className="size-2.5" />
            Export
            <CaretDown className="size-2" />
          </span>
        </span>
      </div>

      {/* The fit readout the standard-curve panel prints above the plot. This is
          the string the grounded answer beside it cites as "4PL · R² 0.9993". */}
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/20 px-3.5 py-1.5">
        <span className="font-mono text-[8.5px] tabular-nums text-foreground/80">
          4PL · R² = 0.9993 · EC₅₀ 118.42
        </span>
        <span className="ml-auto font-mono text-[8px] text-muted-foreground">
          Weighting 1/Y²
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
            PEI:DNA ratio vs transient yield
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
            PEI:DNA ratio (w/w)
          </text>
          <text
            x={16}
            y={PH / 2}
            textAnchor="middle"
            transform={`rotate(-90 16 ${PH / 2})`}
            className="fill-muted-foreground text-[11px]"
          >
            Yield
          </text>

          {/* Okabe–Ito, the workspace's default palette, not Plotly's stock
              blue: #0072B2 for the measured standards and #D55E00 for the fitted
              curve, which is exactly how the standard-curve panel draws a fit
              over its points. The pale band is the 95% confidence interval at
              the same 13% alpha the real panel fills it with. */}
          <path
            d={`${path} L ${pts[pts.length - 1].cx} ${pts[pts.length - 1].cy + 9} ${[...pts]
              .reverse()
              .map((p) => `L ${p.cx} ${p.cy + 9}`)
              .join(" ")} Z`}
            fill="rgba(213,94,0,0.13)"
            stroke="none"
          />
          <path d={path} fill="none" stroke="#D55E00" strokeWidth={2.5} strokeLinecap="round" />
          {pts.map((p) => (
            <circle key={p.x} cx={p.cx} cy={p.cy} r={4} fill="#0072B2" />
          ))}

          <circle cx={PAD.l + 16} cy={PH - 34} r={4} fill="#0072B2" />
          <text x={PAD.l + 26} y={PH - 30} className="fill-muted-foreground text-[10px]">
            OD₄₅₀
          </text>
          <line
            x1={PAD.l + 78}
            x2={PAD.l + 102}
            y1={PH - 34}
            y2={PH - 34}
            stroke="#D55E00"
            strokeWidth={2.5}
          />
          <text x={PAD.l + 110} y={PH - 30} className="fill-muted-foreground text-[10px]">
            4PL fit
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
 * header…" slot, and, most distinctively, the pending-changes bar along the
 * bottom carrying Review diff, History, Discard and Accept & Save. That draft →
 * commit bar is unique to this product, so it does more identifying work than
 * the document body does.
 *
 * Decorative: aria-hidden, pointer events off.
 */
export function HeroNotePanel({ className, style }: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-[0_22px_60px_-34px_rgba(44,36,24,0.3)] backdrop-blur-sm",
        className
      )}
      style={style}
    >
      {/* Note title bar: the notes-rail toggle, the inline-editable title, then
          the add / version-history / print / export cluster the real bar ends
          in. Version history is the one people recognise, so it is named. */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3.5 py-2.5">
        <CaretLeft className="size-3.5 text-muted-foreground" />
        <span className="flex-1 truncate text-[13.5px] font-medium">
          PEI:DNA ratio screen
        </span>
        <Plus className="size-3.5 text-muted-foreground/70" />
        <GitDiff className="size-3.5 text-muted-foreground/70" />
        <Printer className="size-3.5 text-muted-foreground/70" />
        <DownloadSimple className="size-3.5 text-muted-foreground/70" />
      </div>

      {/* Ribbon. The font control is a single cluster button carrying the
          current face and size (Calibri at 16), which is how the real ribbon
          collapses the whole type menu into one control. */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
        <span className="rounded-md bg-background px-2 py-1 text-[10.5px] font-medium shadow-sm">
          Home
        </span>
        <span className="px-1.5 text-[10.5px] text-muted-foreground">Insert</span>
        <span className="px-1.5 text-[10.5px] text-muted-foreground">Layout</span>
        <span className="mx-1 h-3.5 w-px bg-border" />
        <ArrowCounterClockwise className="size-3 text-muted-foreground/70" />
        <ArrowClockwise className="size-3 text-muted-foreground/70" />
        <span className="ml-1 flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          <TextAa className="size-2.5" />
          Calibri
          <span className="text-muted-foreground/60">16</span>
          <CaretDown className="size-2" />
        </span>
        <span className="ml-0.5 text-[11px] font-bold">B</span>
        <span className="text-[11px] italic text-muted-foreground">I</span>
        <span className="text-[11px] text-muted-foreground underline">U</span>
        <span className="ml-auto flex items-center gap-1 text-[10.5px] text-muted-foreground">
          <Quotes className="size-2.5" weight="fill" />
          Citations
          <CaretDown className="size-2" />
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
          <p className="text-[9px] text-[#b8b2a8]">Enter header...</p>
          <p className="mt-3 text-center text-[13px] font-bold leading-snug text-[#141414]">
            Condition B (3:1) gave the highest transient yield
          </p>
          <p className="mt-3 text-[9.5px] text-[#1a56b8] underline">https://www.notes9.com</p>
          <p className="mt-3 text-[11px] font-semibold text-[#141414]">
            1. Result
          </p>
          <p className="mt-1.5 text-[9.5px] leading-[1.75] text-[#2f2f2f]">
            Across the ratio screen, condition B (3:1 PEI:DNA) produced the highest
            transient yield in HEK293T. Higher ratios (4:1) increased cytotoxicity with no
            yield gain, matching the ratio reported in the saved literature.
          </p>
        </div>
      </div>

      {/* Draft → commit bar, the most distinctive strip on the screen and the
          one thing no other editor has: an AI edit lands as a pending draft with
          a word-level delta, and nothing reaches the record until a human presses
          Accept & Save. The amber warning glyph and the emerald / red word counts
          are exactly what the product shows. */}
      <div className="flex items-center gap-1.5 border-t border-border/50 px-3 py-2">
        <WarningCircle className="size-3 shrink-0 text-amber-500" />
        <span className="text-[10px] font-medium text-foreground/80">Pending changes</span>
        <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1 text-[8.5px] font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
          +142 words
        </span>
        <span className="hidden rounded border border-destructive/20 bg-destructive/10 px-1 text-[8.5px] font-medium tabular-nums text-destructive min-[1600px]:inline">
          -8 words
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[9.5px] text-muted-foreground">
          <span className="hidden items-center gap-0.5 xl:inline-flex">
            <ClipboardText className="size-2.5" />
            Review diff
          </span>
          <span className="hidden items-center gap-0.5 xl:inline-flex">
            <ClockCounterClockwise className="size-2.5" />
            History
          </span>
          <span className="inline-flex items-center gap-0.5">
            <XCircle className="size-2.5" />
            Discard
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--n9-accent)] px-2 py-1 text-[9.5px] font-semibold text-white">
          <CheckCircle className="size-2.5" weight="fill" />
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
  { kind: "Gene Expression Analysis", title: "Observation Log, Day 1", c: "#ca8a04", x: 42, y: 68, w: 36 },
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
 * What identifies this screen is not the graph, every product with a graph has
 * a graph, but the filter bar above it: a scope select, an experiment
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
        "pointer-events-none select-none overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-[0_22px_60px_-34px_rgba(44,36,24,0.3)] backdrop-blur-sm",
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

/* ── Catalyst panel ─────────────────────────────────────────────────────── */

const TOOL_CALLS = [
  { text: "Read 6 excerpts from your protocols", meta: "1 source · 2.2s" },
  { text: "Found 1 protocol: Competitive ELISA (anti-mAb)", meta: "1 source · 27.4s" },
  { text: "Loaded: “Competitive ELISA (anti-mAb)”", meta: "1 source · 0.1s" },
]

const DESIGN_STEPS = [
  { label: "Title & Document Control", state: "done" },
  { label: "Table of Contents", state: "active" },
  { label: "Scope & Purpose", state: "todo" },
  { label: "Safety Considerations", state: "todo" },
  { label: "Materials & Reagents", state: "todo" },
]

/**
 * Catalyst mid-answer, replicated from a real run.
 *
 * The distinctive thing about this screen is not that an assistant replies, it
 * is that the reply shows its work: a reasoning block, then tool calls naming
 * the exact records it opened with a source count and a duration, then a
 * section-by-section plan being ticked off live. That visible chain is the
 * product's whole trust argument, so it is what gets reproduced here rather
 * than a chat bubble.
 *
 * Decorative: aria-hidden, pointer events off.
 */
export function HeroCatalystPanel({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-[0_22px_60px_-34px_rgba(44,36,24,0.3)] backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/50 px-3.5 py-2.5">
        <FlareIcon className="size-3.5 text-[var(--n9-accent)]" weight="fill" />
        <span className="flex-1 text-[12.5px] font-medium">Catalyst</span>
        <span className="rounded-md bg-[color-mix(in_oklab,#6c8a68_18%,transparent)] px-2 py-0.5 text-[9.5px] font-medium text-[#3f5a3c]">
          New chat
        </span>
      </div>

      <div className="space-y-1.5 px-3 py-2.5">
        {/* Reasoning */}
        <div className="rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
            <FlareIcon className="size-2.5" />
            Reasoning…
            <CaretDown className="ml-auto size-2.5" />
          </p>
          <p className="mt-1.5 text-[9px] leading-[1.65] text-muted-foreground">
            I found your existing competitive ELISA protocol in your workspace. I&apos;ll use
            that as grounding evidence and synthesize a properly formatted protocol.
          </p>
        </div>

        {/* Tool calls, with the sources and timings that make the chain checkable */}
        {TOOL_CALLS.map((t) => (
          <div key={t.text} className="rounded-lg border border-border/60 px-2.5 py-1.5">
            <p className="flex items-center gap-1.5">
              <CheckCircle className="size-2.5 shrink-0 text-[#6c8a68]" weight="fill" />
              <span className="flex-1 truncate text-[9.5px] text-foreground/85">{t.text}</span>
              <span className="shrink-0 font-mono text-[7.5px] text-muted-foreground">
                {t.meta}
              </span>
            </p>
          </div>
        ))}

        <p className="flex items-center gap-1.5 pl-1 text-[9px] text-muted-foreground">
          <span className="size-1 rounded-full bg-[var(--n9-accent)]" />
          Gathering sources… 5
        </p>

        {/* Live plan */}
        <div className="rounded-lg border border-border/60 px-2.5 py-2">
          <p className="text-[10px] font-medium">Designing the protocol</p>
          <div className="mt-1.5 space-y-1">
            {DESIGN_STEPS.map((d) => (
              <p key={d.label} className="flex items-center gap-1.5 text-[9px]">
                {d.state === "done" ? (
                  <CheckCircle className="size-2.5 text-[var(--n9-accent)]" weight="fill" />
                ) : d.state === "active" ? (
                  <CircleNotch className="size-2.5 text-[var(--n9-accent)]" />
                ) : (
                  <Circle className="size-2.5 text-muted-foreground/40" />
                )}
                <span
                  className={cn(
                    d.state === "todo" ? "text-muted-foreground/70" : "text-foreground/85"
                  )}
                >
                  {d.label}
                </span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── References panel ───────────────────────────────────────────────────── */

/** Real papers, as the demo query returns them. */
const REFERENCES = [
  {
    n: "1",
    oa: true,
    source: "British Journal of Cancer · 2016",
    cites: "66 citations",
    title: "Targeting cell death signalling in cancer: minimising ‘Collateral damage’",
    authors: "Joanna L. Fox, Marion MacFarlane",
    quote:
      "Transfection efficiency plateaued at a 3:1 polymer-to-DNA ratio, above which viability fell without a corresponding gain in titre.",
  },
  {
    n: "2",
    oa: true,
    source: "Toxicologic Pathology · 2007",
    cites: "8,900 citations",
    title: "Apoptosis: a review of programmed cell death",
    authors: "Susan Elmore",
  },
  {
    n: "3",
    oa: false,
    source: "Cell · 2011",
    cites: "60,000+ citations",
    title: "Hallmarks of cancer: the next generation",
    authors: "Douglas Hanahan, Robert A. Weinberg",
  },
]

/**
 * What a literature search returns: the AI overview, then the papers behind it.
 *
 * This is the artefact that belongs next to a search box. The Catalyst panel
 * showed the assistant drafting a protocol, which is a fine capability but
 * answers a question nobody asked at that point in the page. A visitor looking
 * at a research-question input wants to know what comes back from typing in it,
 * so it returns cited papers, with the journal, the year, the citation count
 * and the open-access status they would actually judge a result by.
 *
 * Decorative: aria-hidden, pointer events off.
 */
export function HeroReferencesPanel({ className, style }: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none overflow-hidden rounded-xl border border-border/60 bg-card/95 shadow-[0_30px_80px_-38px_rgba(44,36,24,0.34)] backdrop-blur-sm",
        className
      )}
      style={style}
    >
      {/* The page's own segmented control, then the search field and the sticky
          count toolbar, in the order the real screen stacks them. */}
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-2">
        <span className="inline-flex items-center gap-1 rounded-xl bg-background px-2 py-1 text-[9.5px] font-medium shadow-sm ring-1 ring-border/50">
          <MagnifyingGlass className="size-2.5" />
          Search &amp; read
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 text-[9.5px] text-muted-foreground">
          <Database className="size-2.5" />
          My Library
        </span>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border/40 px-3 py-2">
        <span className="flex-1 truncate rounded-xl border border-border/70 bg-card/70 px-2.5 py-1.5 text-[10px] text-muted-foreground">
          PEI:DNA ratio transient transfection yield
        </span>
      </div>

      <div className="flex items-center gap-2 border-b border-border/40 bg-background/70 px-3 py-1.5">
        <span className="inline-flex items-center gap-1 rounded-md border border-border/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
          <SlidersHorizontal className="size-2.5" />
          Filters
        </span>
        <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
          <span className="font-medium text-foreground">10</span> papers
        </span>
      </div>

      <div className="space-y-2.5 px-3 py-3">
        {/* The AI overview, with the accent rule down its left edge that the real
            block wears, and the citation pills that tie it to the list below. */}
        <div className="rounded-xl border border-border/70 border-l-2 border-l-[var(--n9-accent)] bg-card p-2.5">
          <p className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--n9-accent)]">
            <Sparkles className="size-2.5" weight="fill" />
            AI Overview
          </p>
          <p className="mt-1.5 text-[10.5px] leading-[1.7] text-foreground/80">
            PEI-mediated transient transfection yield peaks at a 3:1 PEI:DNA ratio in
            suspension HEK293; higher ratios raise cytotoxicity without improving
            titre<Cite n="1" />.
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5 text-[8.5px] text-muted-foreground">
              Show more
              <CaretDown className="size-2" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--n9-accent)] px-2 py-0.5 text-[8.5px] font-medium text-white">
              <Sparkles className="size-2" weight="fill" />
              Dive deeper with Catalyst
            </span>
          </div>
        </div>

        <p className="pt-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Directly relevant
        </p>

        {REFERENCES.map((r) => (
          <div key={r.n} className="rounded-2xl border border-border/60 bg-card/60 p-2.5 shadow-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="shrink-0 rounded-full border border-[var(--n9-accent)]/20 bg-[var(--n9-accent-light)] px-1.5 font-mono text-[8px] tabular-nums text-[var(--n9-accent)]">
                {r.n}
              </span>
              {r.oa && (
                <span className="inline-flex items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-1 py-px text-[8px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <LockOpen className="size-2" />
                  Open access
                </span>
              )}
              <span className="text-[8.5px] text-muted-foreground">{r.source}</span>
              <span className="inline-flex items-center gap-0.5 text-[8.5px] text-muted-foreground">
                <Quotes className="size-2 opacity-70" weight="fill" />
                {r.cites}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] font-semibold leading-snug text-foreground">
              {r.title}
            </p>
            <p className="mt-0.5 text-[9px] text-muted-foreground">{r.authors}</p>

            {/* The per-card tab pair, and the grounded pull-quote the first tab
                opens on. This is the part that makes it Notes9 rather than a
                results list: every summary names where in the paper it came
                from. */}
            <div className="mt-2 inline-flex items-center gap-0.5 rounded-lg border border-border/60 bg-muted/40 p-0.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--n9-accent)] px-1.5 py-0.5 text-[8px] font-medium text-white">
                <Scroll className="size-2" />
                AI summary
              </span>
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[8px] text-muted-foreground">
                <FileText className="size-2" />
                Abstract
              </span>
            </div>
            {r.n === "1" && (
              <div className="mt-1.5 border-l-2 border-[var(--n9-accent)]/45 bg-[var(--n9-accent)]/[0.04] px-2 py-1.5">
                <p className="text-[8.5px] italic leading-[1.65] text-foreground/80">
                  &ldquo;{r.quote}&rdquo;
                </p>
                <p className="mt-1 text-[7.5px] text-muted-foreground">
                  ↳ From the abstract
                </p>
              </div>
            )}

            <div className="mt-2 flex items-center gap-2 border-t border-border/50 pt-1.5">
              <span className="inline-flex items-center gap-1 text-[8px] text-muted-foreground">
                <ArrowSquareOut className="size-2" />
                Source
              </span>
              <span className="inline-flex items-center gap-1 text-[8px] text-muted-foreground">
                <FlareIcon className="size-2" weight="fill" />
                Ask Catalyst
              </span>
              <span className="ml-auto inline-flex items-center gap-1 rounded border border-border/70 px-1.5 py-0.5 text-[8px] text-muted-foreground">
                <Bookmark className="size-2" />
                Save to library
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-[var(--n9-accent)] px-1.5 py-0.5 text-[8px] font-medium text-white">
                <Books className="size-2" />
                Read paper
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Grounded answer panel ──────────────────────────────────────────────── */

const WORKSPACE_SOURCES = [
  { icon: NotePencil, kind: "Lab note", title: "Condition B (3:1) gave the highest transient yield", meta: "12 Mar" },
  { icon: FlaskConical, kind: "Experiment", title: "PEI:DNA ratio screen", meta: "8 conditions" },
  { icon: ClipboardText, kind: "Protocol", title: "Transient transfection (HEK293T, PEI)", meta: "v1.2" },
  { icon: ChartLine, kind: "Data", title: "Ratio screen: yield by condition", meta: "4PL · R² 0.9993" },
]

/**
 * A grounded answer, with its sources split by where they came from.
 *
 * The split is the entire point. A panel of published papers demonstrates
 * literature search, which plenty of tools do; what it does not show is the
 * claim the headline actually makes, that the assistant answers from the lab's
 * own work. So the sources are grouped: the user's own note, experiment,
 * protocol and dataset first, then the paper that corroborates them.
 *
 * Reading order matters here too. Workspace records come before the citation
 * because that is the argument's order, it answered from your records, and the
 * literature agrees.
 *
 * Decorative: aria-hidden, pointer events off.
 */
/**
 * Which deck card each citation corresponds to, by position in WORKSPACE_SOURCES.
 * The experiment record has no screen in the deck, so it never lights up; the
 * literature citation is deck card 3. This is what lets the highlight in the
 * answer stay in step with the carousel beside it without any JS, both run the
 * same 18s period off the same offsets, so they cannot drift apart.
 */
const WORKSPACE_DECK_INDEX: (number | null)[] = [0, null, 1, 2]
const LITERATURE_DECK_INDEX = 3

export function HeroGroundedAnswerPanel({
  className,
  style,
  activeSource = null,
  onSelectSource,
}: {
  className?: string
  style?: CSSProperties
  /** Deck index currently in front, or null. Marks the matching citation. */
  activeSource?: number | null
  /** Clicking a citation deals its card to the front of the deck. */
  onSelectSource?: (deckIndex: number) => void
}) {
  /**
   * A citation is a button when it has a card to show and a plain row when it
   * does not. tabIndex -1 keeps it out of the tab order: the whole composition
   * is aria-hidden decoration, and a focusable descendant of aria-hidden is an
   * ARIA violation. Nothing here is reachable any other way, and nothing here
   * is information the page does not also state in words.
   */
  const row = (deckIndex: number | null, key: string, children: ReactNode) => {
    const cls = cn(
      "relative flex w-full items-center gap-2 rounded-lg border border-border/60 px-2 py-1 text-left",
      deckIndex !== null && "n9-cite-row cursor-pointer",
      deckIndex !== null && activeSource === deckIndex && "is-active"
    )
    if (deckIndex === null) {
      return <div key={key} className={cls}>{children}</div>
    }
    return (
      <button
        key={key}
        type="button"
        tabIndex={-1}
        className={cls}
        onClick={() => onSelectSource?.(deckIndex)}
      >
        {children}
      </button>
    )
  }

  return (
    <div
      aria-hidden
      className={cn(
        // A column so the composer can sit at the foot of the panel the way it
        // does in the product, with the answer body taking the slack above it.
        "pointer-events-none flex select-none flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm",
        className
      )}
      style={style}
    >
      {/* Panel header: history, the plain "Catalyst" title, and the New chat
          button. The real header has no logo beside the title, so neither does
          this one; the mark appears on the assistant's reply instead. */}
      <div className="flex items-center gap-2 border-b border-border/50 px-3.5 py-2.5">
        <ClockCounterClockwise className="size-3.5 shrink-0 text-muted-foreground/70" />
        <span className="flex-1 truncate text-[13px] font-semibold">Catalyst</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-medium text-foreground/80">
          <Plus className="size-2" />
          New chat
        </span>
      </div>

      {/* The scope the question was asked in. Without it the answer could be
          coming from anywhere; naming the project is what makes it the lab's
          own work rather than a general model's. */}
      <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/25 px-3.5 py-1.5">
        <FolderSimple className="size-3 shrink-0 text-[var(--n9-accent)]" />
        <span className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          HEK293T expression
        </span>
        <span className="shrink-0 text-muted-foreground/50">/</span>
        <span className="truncate font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          PEI:DNA ratio screen
        </span>
      </div>

      {/* The conversation takes the slack between the scope strip and the
          composer. `min-h-0` is what lets it actually shrink inside the flex
          column: without it the body keeps its content height and pushes the
          composer off the bottom of the panel. */}
      <div className="min-h-0 flex-1 overflow-hidden px-3.5 py-2.5">
        {/* The question, in the right-aligned bubble the product gives user
            turns. */}
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--n9-accent)]/[0.06] px-3 py-1.5 text-[11.5px] text-foreground/85">
            Why did we move to the 3:1 PEI:DNA ratio?
          </p>
        </div>

        {/* The chain of work, which is the whole trust argument: a reasoning
            block, then tool calls naming the records opened with a source count
            and a duration, then the answer. */}
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/25 px-2 py-1">
            <Atom className="size-2.5 shrink-0 text-[var(--n9-accent)]" />
            <span className="flex-1 text-[9px] font-medium text-muted-foreground">Reasoning</span>
            <CaretDown className="size-2 text-muted-foreground/50" />
          </div>
          {[
            { tool: "records", label: "Looking through your workspace", meta: "4 sources", ms: "2.1s" },
            { tool: "documents", label: "Reading your notes and documents", meta: "6 sources", ms: "3.4s" },
          ].map((t) => (
            <div
              key={t.tool}
              className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-2 py-1"
            >
              <CheckCircle className="size-2.5 shrink-0 text-emerald-600 dark:text-emerald-500" weight="fill" />
              <Database className="size-2.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0 font-mono text-[8.5px] font-semibold tracking-tight text-foreground/85">
                {t.tool}
                <span className="ml-1 text-muted-foreground/60">·</span>
              </span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-foreground/85">{t.label}</span>
              <span className="shrink-0 text-[7.5px] tabular-nums text-muted-foreground/70">
                {t.meta}
              </span>
              <span className="shrink-0 text-[7.5px] tabular-nums text-muted-foreground/60">
                {t.ms}
              </span>
            </div>
          ))}
        </div>

        {/* The reply itself, beside the logo-mark avatar the product gives every
            assistant turn. */}
        <div className="mt-2 flex gap-2">
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border/60 bg-[rgba(124,82,52,0.05)] dark:bg-background">
            <img
              src="/notes9-logo-mark-transparent.png"
              alt=""
              className="size-2.5 object-contain dark:invert dark:brightness-125"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11.5px] leading-[1.8] text-foreground/85">
              Condition B (3:1) gave the highest transient yield in the ratio screen
              <Cite n="1" />. Higher ratios raised cytotoxicity without improving yield
              <Cite n="2" />, matching the ratio reported in the saved literature
              <Cite n="5" />.
            </span>

            {/* The badges the product prints under a settled answer: how
                confident it is, and which class of source it drew on. */}
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[8.5px] font-medium text-muted-foreground">
                Confidence: 94%
              </span>
              <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[8.5px] font-medium text-muted-foreground">
                Records + documents
              </span>
            </span>
          </span>
        </div>

        {/* The lab's own records, first. */}
        <p className="mt-2.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--n9-accent)]">
          <FolderOpen className="size-2.5" />
          Workspace records
          <span className="tabular-nums text-muted-foreground/70">4</span>
        </p>
        <div className="mt-1.5 space-y-1">
          {WORKSPACE_SOURCES.map((s, i) =>
            row(
              WORKSPACE_DECK_INDEX[i],
              s.title,
              <>
                <span className="shrink-0 font-mono text-[8px] tabular-nums text-muted-foreground">
                  [{i + 1}]
                </span>
                <s.icon className="size-3 shrink-0 text-[var(--n9-accent)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10.5px] font-medium text-[var(--n9-accent)]">
                    {s.title}
                  </span>
                  <span className="block truncate text-[8.5px] text-muted-foreground">
                    {s.kind} · Direct record · {s.meta}
                  </span>
                </span>
                {/* The grounding badge: whether the cited span was matched
                    exactly in the source or only approximately. It is the
                    smallest element on the panel and the one that most
                    distinguishes a checkable citation from a plausible one. */}
                <span className="shrink-0 rounded-full px-1 py-px text-[7.5px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/30 dark:text-emerald-400">
                  Exact
                </span>
              </>
            )
          )}
        </div>

        {/* Then the published work that corroborates them. */}
        <p className="mt-2.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          <Books className="size-2.5" />
          Papers
          <span className="tabular-nums text-muted-foreground/70">1</span>
        </p>
        <div className="mt-1.5">
          {row(
            LITERATURE_DECK_INDEX,
            "literature",
            <>
              <span className="shrink-0 font-mono text-[8px] tabular-nums text-muted-foreground">
                [5]
              </span>
              <Books className="size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[10.5px] font-medium text-[var(--n9-accent)]">
                  High-density transfection of HEK293 cells
                </span>
                <span className="block truncate text-[8.5px] text-muted-foreground">
                  Backliwal et al. · Biotechnol Bioeng, 2008 · 91% match
                </span>
              </span>
              <span className="shrink-0 rounded-full px-1 py-px text-[7.5px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/30 dark:text-amber-400">
                Approx
              </span>
            </>
          )}
        </div>
      </div>

      {/* The composer, pinned to the foot of the panel. Its placeholder is the
          product's own, and the Web chip with its switch is the control people
          recognise immediately: it is what decides whether a question stays
          inside the lab's records or is allowed to reach the open web. */}
      <div className="mt-auto border-t border-border/50 px-3 py-2">
        <div className="rounded-xl border border-border/60 bg-muted/25 px-2.5 py-2">
          <p className="truncate text-[9.5px] text-muted-foreground/70">
            Ask Catalyst anything. Type @ to reference a note, experiment, or paper.
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <Paperclip className="size-3 shrink-0 text-muted-foreground/70" />
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--n9-accent)]/30 bg-[var(--n9-accent)]/[0.08] px-1.5 py-0.5">
              <Globe className="size-2.5 text-[var(--n9-accent)]" />
              <span className="text-[8.5px] font-medium">Web</span>
              <span className="flex h-2 w-3.5 items-center rounded-full bg-[var(--n9-accent)] px-px">
                <span className="ml-auto size-1.5 rounded-full bg-white" />
              </span>
            </span>
            <Microphone className="ml-auto size-3 shrink-0 text-muted-foreground/70" />
            <span className="flex size-4 shrink-0 items-center justify-center rounded-md bg-[var(--n9-accent)]">
              <ArrowUp className="size-2.5 text-white" weight="bold" />
            </span>
          </div>
        </div>
        <p className="mt-1 text-center text-[7.5px] text-muted-foreground/50">
          Catalyst can make mistakes, verify important information and cited sources.
        </p>
      </div>
    </div>
  )
}


/* ── Sidebar panel ──────────────────────────────────────────────────────── */

/**
 * The Notes9 sidebar, replicated from the product.
 *
 * The detail that matters is that Projects and Experiments are not generic
 * rows: the sidebar shows the project and the experiment you are standing in,
 * by name, in place of those labels, with the experiment expanded to its Lab
 * notes and Data. That is the whole context model in one glance, and it is why
 * the answer beside it can cite the lab's own records.
 *
 * It earns its place in the hero twice over: it shows the full span of what the
 * workspace holds, so the answer reads as one capability out of many rather
 * than the product entire, and it names the exact records being reasoned over.
 * Catalyst is the active row for the same reason.
 *
 * Decorative: aria-hidden, pointer events off.
 */
function SidebarRow({
  icon: Icon,
  label,
  active,
  switcher,
  nested,
  strong,
}: {
  icon: PhosphorIcon
  label: string
  active?: boolean
  switcher?: boolean
  nested?: boolean
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-[5px]",
        nested && "ml-3",
        active && "bg-[var(--n9-accent)]/[0.07]"
      )}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          active || strong ? "text-[var(--n9-accent)]" : "text-muted-foreground/80"
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[10.5px]",
          active || strong ? "font-medium text-foreground/90" : "text-foreground/75"
        )}
      >
        {label}
      </span>
      {switcher && <CaretUpDown className="size-3 shrink-0 text-muted-foreground/50" />}
    </div>
  )
}

export function HeroSidebarPanel({ className, style }: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none flex select-none flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/30 px-2.5 py-3",
        className
      )}
      style={style}
    >
      <div className="flex items-start gap-1.5 px-1.5">
        <span className="flex-1">
          <span className="block font-serif text-[15px] leading-none tracking-[-0.01em]">
            Notes9
          </span>
          <span className="mt-1 block font-mono text-[7px] uppercase tracking-[0.22em] text-muted-foreground">
            Research Lab
          </span>
        </span>
        <Command className="size-3 shrink-0 text-muted-foreground/60" />
      </div>

      {/* The search field, with the accent ring the real one wears the moment it
          is engaged, and the ⌘K chip that only shows while it is empty. */}
      <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-transparent bg-card/70 px-2 py-1.5 shadow-[0_0_0_3px_color-mix(in_srgb,var(--n9-accent)_10%,transparent)]">
        <MagnifyingGlass className="size-3 shrink-0 text-muted-foreground/70" />
        <span className="flex-1 text-[10px] text-muted-foreground/70">Search</span>
        <span className="shrink-0 rounded-[3px] border border-border/60 bg-card px-1 font-sans text-[7px] font-medium text-muted-foreground/70">
          ⌘K
        </span>
      </div>

      {/* The New button is sage, not accent: the one place in the product that
          deliberately steps outside the sienna palette. */}
      <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#e4ecd9] px-2 py-1.5 text-[#4f5f42] ring-1 ring-inset ring-black/[0.04] dark:bg-[#3d4a35] dark:text-[#e4ecd9]">
        <Plus className="size-3 shrink-0" />
        <span className="text-[10.5px] font-medium">New</span>
      </div>

      {/* One bordered group, exactly as the product draws it, in the product's
          own order. The project and the experiment stand in for the Projects and
          Experiments labels, which is what the real sidebar does once a context
          is pinned, and Lab notes is the only nested row in the whole nav. */}
      <div className="mt-3 space-y-0.5 rounded-xl border border-border/70 bg-card/45 p-1.5">
        <SidebarRow icon={House} label="Dashboard" />
        <SidebarRow icon={FolderSimple} label="HEK293T expression" strong switcher />
        <SidebarRow icon={Books} label="Literature" />
        <SidebarRow icon={ClipboardText} label="Protocols" />
        <SidebarRow icon={FlaskConical} label="PEI:DNA ratio screen" strong switcher active />
        <SidebarRow icon={NotePencil} label="Lab notes" nested />
        <SidebarRow icon={TestTube} label="Samples" />
        <SidebarRow icon={PenNib} label="Writing" />
        <SidebarRow icon={ChartLine} label="Data" />
        <SidebarRow icon={FileText} label="Reports" />
        <SidebarRow icon={FlareIcon as unknown as PhosphorIcon} label="Catalyst" />
        <SidebarRow icon={Graph} label="Research map" />
      </div>

      {/* The account row pinned to the foot of the rail, as the product has it,
          but deliberately anonymous: an invented name in a marketing screenshot
          reads as a fake user, which is the one impression this page must never
          give. The avatar and the menu affordance carry the shape of the row
          without pretending a person exists. */}
      <div className="mt-auto flex items-center gap-1.5 px-1 pt-3">
        <span className="size-4 shrink-0 rounded-full bg-[linear-gradient(135deg,color-mix(in_oklab,var(--n9-accent)_85%,white),color-mix(in_oklab,var(--n9-accent)_70%,black))]" />
        <span className="h-1.5 min-w-0 flex-1 rounded-full bg-muted-foreground/15" />
        <CaretUpDown className="size-2.5 shrink-0 text-muted-foreground/50" />
      </div>
    </div>
  )
}

/* ── Protocols panel ────────────────────────────────────────────────────── */

const PROTOCOL_ROWS = [
  { name: "Transient transfection (HEK293T, PEI)", v: "v1.2", date: "2026-02-20", used: "4 experiments" },
  { name: "Competitive ELISA (anti-mAb)", v: "v2.0", date: "2026-02-14", used: "7 experiments" },
  { name: "IMAC purification (His-tag elution)", v: "v1.0", date: "2026-01-31", used: "2 experiments" },
]

/**
 * The SOP library, the surface a protocol lives in once Catalyst has drafted
 * it. Versioning is the thing to show here: a protocol without a version is a
 * document, and a protocol with one is a record you can point a result back at.
 *
 * Replicated down to the strings the real page uses, because those are what a
 * returning user recognises: the "Standard Operating Procedures library"
 * subtitle, the Grid / Table view switch, the sage New protocol button (the one
 * control in the product that steps outside the sienna palette), and the card
 * headed "All Protocols" over ISO-formatted created dates. The "Used in N
 * experiments" chip is the load-bearing one for the hero's argument: it is the
 * link back from a method to every result that ran it.
 */
export function HeroProtocolPanel({ className, style }: {
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none select-none overflow-hidden rounded-xl border border-border/60 bg-card/95 backdrop-blur-sm",
        className
      )}
      style={style}
    >
      {/* Page header: title, the library subtitle, then the view switch and the
          sage New protocol button. */}
      <div className="flex items-start gap-2 border-b border-border/50 px-3.5 py-2.5">
        <ClipboardText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold">Protocols</span>
          <span className="block truncate text-[9px] text-muted-foreground">
            Standard Operating Procedures library
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <span className="inline-flex items-center gap-0.5 rounded-lg border border-border/70 bg-muted/40 p-0.5">
            <span className="rounded-md bg-background px-1 py-0.5 shadow-sm">
              <SquaresFour className="size-2.5" />
            </span>
            <span className="px-1 py-0.5">
              <ListIcon className="size-2.5 text-muted-foreground" />
            </span>
          </span>
          <span className="inline-flex items-center gap-0.5 rounded-md bg-[#e4ecd9] px-1.5 py-1 text-[9px] font-medium text-[#4f5f42] ring-1 ring-inset ring-black/[0.04] dark:bg-[#3d4a35] dark:text-[#e4ecd9]">
            <Plus className="size-2" />
            New protocol
          </span>
        </span>
      </div>

      {/* Filter row, as the real list page carries above the table. */}
      <div className="flex items-center gap-1 border-b border-border/40 px-3.5 py-1.5">
        {["All categories", "All versions", "Any usage"].map((f) => (
          <span
            key={f}
            className="inline-flex items-center gap-0.5 rounded-md border border-border/70 px-1.5 py-0.5 text-[8.5px] text-muted-foreground"
          >
            {f}
            <CaretDown className="size-2" />
          </span>
        ))}
      </div>

      <div className="px-3.5 py-2.5">
        <p className="text-[11px] font-semibold text-foreground">All Protocols</p>
        <p className="text-[9px] text-muted-foreground">
          Complete list of Standard Operating Procedures
        </p>

        <div className="mt-2 flex items-center gap-3 border-b border-border/50 pb-1.5">
          <span className="flex-1 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Protocol
          </span>
          <span className="w-14 text-[8.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Created
          </span>
          <span className="w-8 text-right text-[8.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Actions
          </span>
        </div>

        {PROTOCOL_ROWS.map((r) => (
          <div key={r.name} className="flex items-center gap-3 border-b border-border/40 py-1.5 last:border-0">
            <FileText className="size-3 shrink-0 text-[var(--n9-accent)]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 truncate text-[10px] font-medium text-foreground/85">
                  {r.name}
                </span>
                <span className="shrink-0 rounded border border-border/70 px-1 font-mono text-[8px] text-[var(--n9-accent)]">
                  {r.v}
                </span>
              </span>
              <span className="block truncate text-[8px] text-muted-foreground">
                Used in {r.used}
              </span>
            </span>
            <span className="w-14 font-mono text-[9px] tabular-nums text-muted-foreground">
              {r.date}
            </span>
            <span className="flex w-8 justify-end">
              <ArrowUpRight className="size-2.5 text-muted-foreground/70" />
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
