"use client"

/**
 * Legal-safe, stylized representations of the everyday tools researchers juggle.
 * These are deliberately GENERIC category glyphs — not the trademarked logos of
 * Excel / Word / Notion / Zotero / ChatGPT / etc. They read instantly as "your
 * scattered stack" without implying any endorsement or infringing a mark.
 */

import {
  Calendar,
  Code2,
  FileSpreadsheet,
  FileText,
  FileType2,
  FolderOpen,
  Image as ImageIcon,
  Mail,
  MessageSquareText,
  Presentation,
  StickyNote,
} from "lucide-react"
import { motion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion"
import { cn } from "@/lib/utils"

export type AppKind =
  | "spreadsheet"
  | "doc"
  | "pdf"
  | "note"
  | "chat"
  | "slides"
  | "image"
  | "email"
  | "calendar"
  | "drive"
  | "code"

const APP_META: Record<AppKind, { color: string; name: string; Icon: typeof FileText }> = {
  spreadsheet: { color: "#15803d", name: "plate_map.xlsx", Icon: FileSpreadsheet },
  doc: { color: "#2563eb", name: "protocol.docx", Icon: FileText },
  pdf: { color: "#dc2626", name: "paper.pdf", Icon: FileType2 },
  note: { color: "#d97706", name: "notes", Icon: StickyNote },
  chat: { color: "#7c3aed", name: "ai-chat", Icon: MessageSquareText },
  slides: { color: "#ea580c", name: "slides.pptx", Icon: Presentation },
  image: { color: "#0d9488", name: "figure.png", Icon: ImageIcon },
  email: { color: "#0284c7", name: "inbox", Icon: Mail },
  calendar: { color: "#e11d48", name: "calendar", Icon: Calendar },
  drive: { color: "#ca8a04", name: "drive", Icon: FolderOpen },
  code: { color: "#475569", name: "analysis.py", Icon: Code2 },
}

export function AppGlyph({
  kind,
  withLabel = false,
  compact = false,
  className,
}: {
  kind: AppKind
  withLabel?: boolean
  compact?: boolean
  className?: string
}) {
  const m = APP_META[kind]
  const Icon = m.Icon
  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl border border-border/60 bg-card shadow-[0_10px_26px_-12px_rgba(20,18,16,0.3)]",
          compact ? "h-10 w-10 rounded-xl" : "h-14 w-14",
        )}
        style={{ color: m.color }}
      >
        <Icon className={compact ? "h-5 w-5" : "h-6 w-6"} />
      </div>
      {withLabel ? (
        <span className="text-[14px] font-medium text-muted-foreground/80">{m.name}</span>
      ) : null}
    </div>
  )
}

/** One rail glyph that eases in (soft scale + fade + rise) once the page scrolls
 *  past its threshold. */
function RailGlyph({
  kind,
  progress,
  start,
}: {
  kind: AppKind
  progress: MotionValue<number>
  start: number
}) {
  // Slow, refined entrance: gentle fade + soft scale and rise across a wide
  // scroll window, eased with an over-damped spring so it glides in smoothly
  // instead of popping.
  const end = start + 0.16
  const spring = { stiffness: 60, damping: 26, mass: 0.9 } as const
  const opacity = useTransform(progress, [start, end], [0, 1])
  const scale = useSpring(useTransform(progress, [start, end], [0.72, 1]), spring)
  const y = useSpring(useTransform(progress, [start, end], [14, 0]), spring)
  return (
    <motion.div
      style={{ opacity, scale, y }}
      className="relative z-10 rounded-xl bg-background shadow-[0_8px_22px_-10px_rgba(20,18,16,0.35)] backdrop-blur-sm"
    >
      <AppGlyph kind={kind} compact />
    </motion.div>
  )
}

/** A vertical rail of the tech-stack glyphs on the LEFT edge: each glyph pops up
 *  and the connecting line grows to link them as the page scrolls — as if the
 *  scattered tools from the problem section line up and get connected.
 *  Decorative, large screens only. */
export function AppGlyphRail() {
  const { scrollYProgress } = useScroll()
  const rail: AppKind[] = ["pdf", "spreadsheet", "doc", "note", "chat", "slides", "email", "calendar"]
  // Smooth, unhurried line growth that trails the glyphs as they ease in.
  const lineScale = useSpring(useTransform(scrollYProgress, [0.05, 0.72], [0, 1]), {
    stiffness: 55,
    damping: 24,
    mass: 0.9,
  })
  return (
    <div className="pointer-events-none fixed left-6 top-28 bottom-16 z-30 hidden flex-col items-center justify-between xl:flex">
      {/* connecting line behind the glyphs — grows to link them */}
      <div className="absolute left-1/2 top-3 bottom-3 w-[2px] -translate-x-1/2 overflow-hidden rounded-full bg-border/50">
        <motion.div
          className="h-full w-full origin-top bg-[var(--n9-accent)]"
          style={{ scaleY: lineScale }}
        />
      </div>
      {rail.map((kind, i) => (
        <RailGlyph
          key={kind}
          kind={kind}
          progress={scrollYProgress}
          start={0.05 + (i / rail.length) * 0.6}
        />
      ))}
    </div>
  )
}

/** A loose, slightly-rotated cluster of glyphs — "today: scattered". */
export function ScatteredStack({ className }: { className?: string }) {
  const items: { kind: AppKind; rot: number }[] = [
    { kind: "pdf", rot: -7 },
    { kind: "spreadsheet", rot: 5 },
    { kind: "note", rot: -3 },
    { kind: "doc", rot: 6 },
    { kind: "chat", rot: -5 },
    { kind: "slides", rot: 4 },
    { kind: "email", rot: -6 },
    { kind: "image", rot: 3 },
    { kind: "calendar", rot: -4 },
    { kind: "drive", rot: 6 },
    { kind: "code", rot: -3 },
  ]
  return (
    <div className={cn("flex flex-wrap items-end gap-3.5", className)}>
      {items.map((it, i) => (
        <motion.div
          key={it.kind}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ delay: i * 0.05 }}
          style={{ rotate: it.rot }}
          whileHover={{ rotate: 0, y: -3 }}
        >
          <AppGlyph kind={it.kind} withLabel />
        </motion.div>
      ))}
    </div>
  )
}
