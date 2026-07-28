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
