"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { ArrowRight, ClipboardList, Link2, MessageCircle, Play, type LucideIcon } from "lucide-react"
import { useId } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const CONTACT_HASH = "/#contact" as const

const ctaBannerFeatures: {
  id: string
  Icon: LucideIcon
  iconWrap: string
  title: string
  body: string
}[] = [
  {
    id: "action",
    Icon: Play,
    iconWrap:
      "border-violet-200/90 bg-violet-50 text-violet-700 dark:border-violet-500/35 dark:bg-violet-950/50 dark:text-violet-300",
    title: "See Notes9 in action",
    body: "Personalized walkthrough for your team's research workflow.",
  },
  {
    id: "team",
    Icon: ClipboardList,
    iconWrap:
      "border-emerald-200/90 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-950/45 dark:text-emerald-300",
    title: "Built for your team",
    body: "Secure, scalable, and ready to integrate with your existing tools.",
  },
  {
    id: "onboard",
    Icon: Link2,
    iconWrap:
      "border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] text-[var(--n9-accent)] dark:border-[var(--n9-accent)]/40 dark:bg-[var(--n9-accent)]/12 dark:text-[var(--n9-accent)]",
    title: "Start faster, go further",
    body: "From onboarding to outcomes—we're with you.",
  },
]

/* ─── Card copy + styling (from Notes9 Marketing Page.html) ─── */

type CardTone = "green" | "purple" | "orange"

type CardDef = {
  id: string
  title: string
  body: string
  tone: CardTone
}

const cards: CardDef[] = [
  {
    id: "workflow",
    title: "Connected researchworkflow",
    body: "Links literature review, experiment work, and research writing in one workspace",
    tone: "green",
  },
  {
    id: "ai",
    title: "Science-aware AI",
    body: "Designed to work from connected biotech context from your papers, protocols, notes, and results",
    tone: "purple",
  },
  {
    id: "labs",
    title: "Practical, Researcher-first design",
    body: "A practical research workspace built for real lab work, day to day",
    tone: "orange",
  },
]

const toneStyles: Record<CardTone, { title: string; hover: string; border: string }> = {
  green: {
    title: "text-[#2d6045] dark:text-emerald-400",
    hover:
      "hover:border-[#5a9070]/50 hover:shadow-[0_20px_50px_-28px_rgba(90,144,112,0.35)] dark:hover:border-emerald-500/30",
    border: "border-[#e8e2d8] dark:border-border/60",
  },
  purple: {
    title: "text-[#6b4fa0] dark:text-violet-400",
    hover:
      "hover:border-[#9b72cf]/45 hover:shadow-[0_20px_50px_-28px_rgba(155,114,207,0.32)] dark:hover:border-violet-500/30",
    border: "border-[#e8e2d8] dark:border-border/60",
  },
  orange: {
    title: "text-[#3d7a42] dark:text-[var(--n9-accent)]",
    hover:
      "hover:border-[#58a65c]/45 hover:shadow-[0_20px_50px_-28px_rgba(88,166,92,0.28)] dark:hover:border-[var(--n9-accent)]/35",
    border: "border-[#e8e2d8] dark:border-border/60",
  },
}

/* ─── Card illustrations (inline SVG from HTML) ─── */

function CardWorkflowIllustration({ markerId }: { markerId: string }) {
  return (
    <div className="mb-3.5 flex h-[100px] w-[120px] shrink-0 items-center justify-center">
      <svg width={120} height={100} viewBox="0 0 120 100" fill="none" aria-hidden>
        <g transform="translate(8,8)">
          {/* Circular arrows centered in the gaps between the 3 nodes */}
          <path d="M34 19 C44 13 58 13 68 19" stroke="#4a8864" strokeWidth={1.6} fill="none" markerEnd={`url(#${markerId})`} />
          <path d="M84 42 C86 51 83 61 77 67" stroke="#4a8864" strokeWidth={1.6} fill="none" markerEnd={`url(#${markerId})`} />
          <path d="M62 70 C49 74 34 72 25 66" stroke="#4a8864" strokeWidth={1.6} fill="none" markerEnd={`url(#${markerId})`} />

          {/* Document */}
          <rect x="40" y="0" width="24" height="30" rx="3" fill="#f3faf5" stroke="#3f7f5b" strokeWidth={1.8} />
          <path d="M56 0 L64 8 L56 8 Z" fill="#d9efdf" stroke="#3f7f5b" strokeWidth={1.4} />
          <line x1="45" y1="12" x2="57" y2="12" stroke="#6b9e82" strokeWidth={1.3} />
          <line x1="45" y1="17" x2="58" y2="17" stroke="#6b9e82" strokeWidth={1.3} />
          <line x1="45" y1="22" x2="56" y2="22" stroke="#6b9e82" strokeWidth={1.3} />

          {/* Flask */}
          <path
            d="M6 62 C6 54 12 49 16 45 L16 29 L28 29 L28 45 C32 49 38 54 38 62 C38 70 31 76 22 76 C13 76 6 70 6 62 Z"
            fill="#edf8f0"
            stroke="#3f7f5b"
            strokeWidth={1.8}
          />
          <path d="M12 63 C12 58 16 55 20 53 C24 51 28 50 32 52 C34 53 35 56 35 59 C35 66 30 70 22 70 C16 70 12 67 12 63 Z" fill="#9fd0a8" />
          <circle cx="16.5" cy="59" r="1.7" fill="#d8efdd" />
          <circle cx="23" cy="56.5" r="1.55" fill="#d8efdd" />
          <circle cx="29.5" cy="61" r="1.45" fill="#d8efdd" />

          {/* Chart card */}
          <rect x="72" y="44" width="28" height="26" rx="4" fill="#f3faf5" stroke="#3f7f5b" strokeWidth={1.8} />
          <rect x="78" y="58" width="4" height="7" rx="1" fill="#5d9a74" />
          <rect x="85" y="54" width="4" height="11" rx="1" fill="#5d9a74" />
          <rect x="92" y="49" width="4" height="16" rx="1" fill="#5d9a74" />

        </g>
        <defs>
          <marker id={markerId} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="#4a8864" />
          </marker>
        </defs>
      </svg>
    </div>
  )
}

function CardAiIllustration() {
  return (
    <div className="mb-3.5 flex h-[100px] w-[120px] shrink-0 items-center justify-center">
      <svg width={120} height={100} viewBox="0 0 120 100" fill="none" aria-hidden>
        {/* Center brain */}
        <ellipse cx="60" cy="46" rx="30" ry="25" fill="#dcc8f2" />
        <line x1="60" y1="23" x2="60" y2="69" stroke="#a07dcc" strokeWidth={1.4} />
        <path d="M60 24 C49 24 41 31 41 39 C36 42 35 51 41 56 C41 64 48 69 56 69" stroke="#8f6cc0" strokeWidth={1.5} fill="none" />
        <path d="M60 24 C71 24 79 31 79 39 C84 42 85 51 79 56 C79 64 72 69 64 69" stroke="#8f6cc0" strokeWidth={1.5} fill="none" />
        <circle cx="52" cy="35" r="2.2" fill="#8f6cc0" />
        <circle cx="68" cy="35" r="2.2" fill="#8f6cc0" />
        <circle cx="47" cy="48" r="2.2" fill="#8f6cc0" />
        <circle cx="73" cy="48" r="2.2" fill="#8f6cc0" />
        <circle cx="56" cy="58" r="2.2" fill="#8f6cc0" />
        <circle cx="64" cy="58" r="2.2" fill="#8f6cc0" />

        {/* Corner cards */}
        <g transform="translate(6,14)">
          <rect x="0" y="0" width="22" height="22" rx="4" fill="#f8f3fe" stroke="#a78bce" strokeWidth={1.3} />
          <line x1="6" y1="7" x2="16" y2="7" stroke="#8f6cc0" strokeWidth={1.1} />
          <line x1="6" y1="11.5" x2="16" y2="11.5" stroke="#8f6cc0" strokeWidth={1.1} />
          <line x1="6" y1="16" x2="13" y2="16" stroke="#8f6cc0" strokeWidth={1.1} />
        </g>
        <g transform="translate(92,12)">
          <rect x="0" y="0" width="22" height="24" rx="4" fill="#f8f3fe" stroke="#a78bce" strokeWidth={1.3} />
          <rect x="7" y="-4" width="8" height="5" rx="1.5" fill="#ede3fa" stroke="#8f6cc0" strokeWidth={1} />
          <polyline points="5,10 8,13 12,8" stroke="#8f6cc0" strokeWidth={1.2} fill="none" />
          <line x1="13" y1="9" x2="17" y2="9" stroke="#8f6cc0" strokeWidth={1.2} />
          <polyline points="5,16 8,19 12,14" stroke="#8f6cc0" strokeWidth={1.2} fill="none" />
          <line x1="13" y1="15" x2="17" y2="15" stroke="#8f6cc0" strokeWidth={1.2} />
        </g>
        <g transform="translate(8,68)">
          <rect x="0" y="0" width="22" height="22" rx="4" fill="#f8f3fe" stroke="#a78bce" strokeWidth={1.3} />
          <line x1="6" y1="8" x2="16" y2="8" stroke="#8f6cc0" strokeWidth={1.1} />
          <line x1="6" y1="12.5" x2="16" y2="12.5" stroke="#8f6cc0" strokeWidth={1.1} />
          <line x1="6" y1="17" x2="13" y2="17" stroke="#8f6cc0" strokeWidth={1.1} />
        </g>
        <g transform="translate(91,69)">
          <rect x="0" y="0" width="23" height="21" rx="4" fill="#f8f3fe" stroke="#a78bce" strokeWidth={1.3} />
          <rect x="5" y="12" width="3.5" height="5" rx="0.8" fill="#7f5eb0" />
          <rect x="10.5" y="9" width="3.5" height="8" rx="0.8" fill="#7f5eb0" />
          <rect x="16" y="6" width="3.5" height="11" rx="0.8" fill="#7f5eb0" />
        </g>

        {/* Dashed connectors */}
        <path d="M28 25 C38 24 44 30 49 34" stroke="#a48ac9" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />
        <path d="M92 25 C82 24 76 30 71 34" stroke="#a48ac9" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />
        <path d="M30 79 C40 77 45 69 50 62" stroke="#a48ac9" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />
        <path d="M91 79 C81 77 76 69 70 62" stroke="#a48ac9" strokeWidth={1.4} strokeDasharray="3 3" fill="none" />

        <circle cx="60" cy="46" r="5" fill="#ffffff" opacity={0.72} />
      </svg>
    </div>
  )
}

function CardLabIllustration() {
  return (
    <div className="mb-3.5 flex h-[100px] w-[120px] shrink-0 items-center justify-center">
      <svg width={120} height={100} viewBox="0 0 120 100" fill="none" aria-hidden>
        <g transform="translate(8,10)">
          <rect x="16" y="0" width="12" height="30" rx="2" stroke="#4d8f52" strokeWidth={1.5} fill="#eef6ef" />
          <rect x="10" y="28" width="24" height="10" rx="2" stroke="#4d8f52" strokeWidth={1.5} fill="#eef6ef" />
          <ellipse cx="22" cy="48" rx="16" ry="5" stroke="#4d8f52" strokeWidth={1.5} fill="#eef6ef" />
          <rect x="18" y="36" width="8" height="14" stroke="#4d8f52" strokeWidth={1.2} fill="#eef6ef" />
          <circle cx="22" cy="4" r="4" stroke="#4d8f52" strokeWidth={1.3} fill="none" />
        </g>
        <g transform="translate(54,8)">
          <rect x="0" y="6" width="46" height="56" rx="3" stroke="#4d8f52" strokeWidth={1.5} fill="#f4faf4" />
          <rect x="14" y="0" width="18" height="12" rx="3" stroke="#4d8f52" strokeWidth={1.3} fill="#f4faf4" />
          <line x1="8" y1="22" x2="38" y2="22" stroke="#8fbc93" strokeWidth={1.2} />
          <polyline points="8,20 11,23 16,17" stroke="#4d8f52" strokeWidth={1.5} fill="none" />
          <line x1="8" y1="32" x2="38" y2="32" stroke="#8fbc93" strokeWidth={1.2} />
          <polyline points="8,30 11,33 16,27" stroke="#4d8f52" strokeWidth={1.5} fill="none" />
          <line x1="8" y1="42" x2="38" y2="42" stroke="#8fbc93" strokeWidth={1.2} />
          <polyline points="8,40 11,43 16,37" stroke="#4d8f52" strokeWidth={1.5} fill="none" />
        </g>
        <g transform="translate(60,54)">
          <rect x="0" y="12" width="7" height="8" fill="#58a65c" opacity={0.5} />
          <rect x="11" y="6" width="7" height="14" fill="#58a65c" opacity={0.5} />
          <rect x="22" y="2" width="7" height="18" fill="#58a65c" opacity={0.5} />
          <line x1="-2" y1="20" x2="34" y2="20" stroke="#4d8f52" strokeWidth={1} />
        </g>
        <g transform="translate(88,54)">
          <circle cx="12" cy="12" r="12" fill="#eef6ef" stroke="#4d8f52" strokeWidth={1.3} />
          <path d="M12 12 L12 0 A12 12 0 0 1 24 12 Z" fill="#58a65c" opacity={0.6} />
          <path d="M12 12 L24 12 A12 12 0 0 1 6 22 Z" fill="#4d8f52" opacity={0.4} />
        </g>
      </svg>
    </div>
  )
}

function CardIllustration({ cardId, markerId }: { cardId: string; markerId: string }) {
  if (cardId === "workflow") return <CardWorkflowIllustration markerId={markerId} />
  if (cardId === "ai") return <CardAiIllustration />
  return <CardLabIllustration />
}

/* ─── Motion ─── */

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
}

function AdoptionIntroBlock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      viewport={{ once: true, margin: "-32px" }}
      className="mx-auto mt-12 max-w-3xl text-center sm:mt-14 lg:mt-16"
    >
      <p className="text-[13px] font-semibold leading-snug text-[#2a5740] dark:text-[var(--n9-accent)] sm:text-sm">
        Practical to adopt. Serious about research data.
      </p>
    </motion.div>
  )
}

function CtaBannerMoleculeGraphic({ className }: { className?: string }) {
  return (
    <svg
      className={cn("pointer-events-none text-sky-400/35 dark:text-sky-300/20", className)}
      viewBox="0 0 200 180"
      fill="none"
      aria-hidden
    >
      <circle cx="160" cy="40" r="14" stroke="currentColor" strokeWidth={1.2} fill="rgb(255 255 255 / 0.06)" />
      <circle cx="120" cy="88" r="12" stroke="currentColor" strokeWidth={1.2} fill="rgb(255 255 255 / 0.06)" />
      <circle cx="170" cy="120" r="10" stroke="currentColor" strokeWidth={1} fill="rgb(255 255 255 / 0.05)" />
      <circle cx="95" cy="135" r="9" stroke="currentColor" strokeWidth={1} fill="rgb(255 255 255 / 0.05)" />
      <line x1="149" y1="49" x2="128" y2="78" stroke="currentColor" strokeWidth={0.9} opacity={0.55} />
      <line x1="131" y1="96" x2="162" y2="113" stroke="currentColor" strokeWidth={0.85} opacity={0.45} />
      <line x1="125" y1="96" x2="102" y2="128" stroke="currentColor" strokeWidth={0.75} opacity={0.4} />
      <line x1="168" y1="114" x2="148" y2="132" stroke="currentColor" strokeWidth={0.7} opacity={0.35} />
    </svg>
  )
}

function PostTrustCtaBlock() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.48 }}
      viewport={{ once: true, margin: "-40px" }}
      className={cn(
        "relative mx-auto mt-10 max-w-6xl overflow-hidden rounded-[24px] border px-5 py-8 font-sans sm:mt-12 sm:rounded-3xl sm:px-8 sm:py-10",
        "border-[#e8e2d8] bg-white text-[#1a1a1a] shadow-[0_22px_55px_-38px_rgba(44,36,24,0.12)] ring-1 ring-black/[0.03]",
        "dark:border-[#c59d7c]/25 dark:bg-[#1a1614] dark:text-[#f5f0e8] dark:shadow-[0_24px_70px_-40px_rgba(0,0,0,0.45)] dark:ring-0",
      )}
    >
      <div
        className="pointer-events-none absolute -left-24 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-emerald-500/[0.09] blur-3xl dark:bg-emerald-500/[0.06]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-16 top-0 h-80 w-80 rounded-full bg-sky-400/[0.08] blur-3xl dark:bg-sky-400/[0.07]"
        aria-hidden
      />
      <CtaBannerMoleculeGraphic className="absolute bottom-2 right-2 z-0 hidden h-44 w-auto opacity-[0.55] sm:block lg:h-52" />

      <div className="relative z-[1] grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(360px,480px)] lg:items-center lg:gap-12">
        <div className="text-left">
          <h3 className="font-serif text-[clamp(1.5rem,3.6vw,2.125rem)] font-bold leading-[1.18] tracking-tight text-[#1a1a1a] dark:text-[#f5f0e8]">
            You do science.
            <br />
            Let <span className="text-[var(--n9-accent)]">Notes9</span> do the grunt work.
          </h3>
          <div className="mt-8 flex flex-col gap-3 sm:mt-9 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              asChild
              className={cn(
                "h-11 w-full rounded-full border-0 px-6 text-white sm:w-auto",
                "bg-[var(--n9-accent)] shadow-[0_12px_30px_-14px_var(--n9-accent-glow)] hover:bg-[var(--n9-accent-hover)] hover:shadow-[0_18px_38px_-14px_var(--n9-accent-glow)]",
                "dark:bg-[var(--n9-accent)] dark:hover:bg-[var(--n9-accent-hover)]",
              )}
            >
              <Link href={CONTACT_HASH} className="inline-flex items-center justify-center gap-2">
                Try for free
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </Button>
            <Button
              variant="outline"
              asChild
              className={cn(
                "h-11 w-full bg-transparent sm:w-auto",
                "border-[#2a5740]/30 text-[#1a1a1a] hover:bg-[var(--n9-accent-light)]/60",
                "dark:border-[#c59d7c]/55 dark:text-[#f5f0e8] dark:hover:bg-white/5",
              )}
            >
              <Link href={CONTACT_HASH} className="inline-flex items-center justify-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full border",
                    "border-[var(--n9-accent)]/40 dark:border-[#c59d7c]/50",
                  )}
                >
                  <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </span>
                Request a demo
              </Link>
            </Button>
          </div>
        </div>

        <ul className="relative z-[1] flex flex-col gap-6 border-t border-[#e8e2d8]/90 pt-8 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 dark:border-[#c59d7c]/25">
          {ctaBannerFeatures.map((item) => (
            <li key={item.id} className="flex gap-4">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px]",
                  item.iconWrap,
                )}
              >
                <item.Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.65} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="font-sans text-[0.9375rem] font-semibold leading-snug text-[#1a1a1a] dark:text-[#f5f0e8]">
                  {item.title}
                </p>
                <p className="mt-1 font-sans text-[0.8125rem] leading-relaxed text-[#555] dark:text-muted-foreground sm:text-[0.875rem]">
                  {item.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  )
}

/* ─── Section ─── */

export function WhyResearchersStaySection() {
  const markerId = `n9-diff-wf-${useId().replace(/:/g, "")}`

  return (
    <section
      id="contact"
      className="marketing-section-alt border-t border-border/50 dark:border-border/40"
    >
      <div className="container relative z-[1] mx-auto px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        {/* Header — typography aligned with HTML mock */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          viewport={{ once: true }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-[18px] flex items-center justify-center gap-3 leading-none">
            <p className="text-[15px] font-semibold tracking-[0.012em] text-[#2f6a4d] dark:text-[var(--n9-accent)]">
              WHY CHOOSE Notes9
            </p>
          </div>
          <h2 className="font-serif text-[clamp(1.75rem,4.2vw,3.25rem)] font-bold leading-[1.15] tracking-tight text-[#1a1a1a] dark:text-foreground">
            Not just another ELN.
            <br />
            Not just another AI tool.
          </h2>
          <p className="mt-3.5 text-base font-normal text-[#555] dark:text-muted-foreground sm:text-[16px]">
          Traditional ELNs are good at recordkeeping. Current Al tools are good at general tasks, literature search, and writing assistance. Notes bridges that gap by connecting
          literature review, experiment work, and research writing in one Al-native workspace.
          </p>
        </motion.div>

        {/* Desktop scene — layout from Notes9 Marketing Page.html */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.06 }}
          viewport={{ once: true }}
          className="relative mx-auto mt-9 hidden max-w-[1200px] overflow-hidden rounded-none px-5 pb-12 pt-10 sm:px-8 md:block"
        >
          <div className="relative z-[2] flex items-stretch justify-center">
            <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col items-center self-stretch px-2 sm:px-4 lg:px-6">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-24px" }}
                className="flex w-full items-stretch gap-4 sm:gap-5"
              >
                {cards.map((c) => {
                  const ts = toneStyles[c.tone]
                  return (
                    <motion.article
                      key={c.id}
                      variants={itemVariants}
                      className={cn(
                        "flex h-full min-h-0 flex-1 flex-col items-center rounded-[18px] border bg-white px-5 pb-6 pt-5 text-center transition-colors duration-300 dark:bg-card/95",
                        ts.border,
                        ts.hover,
                      )}
                    >
                      <CardIllustration cardId={c.id} markerId={markerId} />
                      <h3 className={cn("mt-1 text-[calc(17px*1.3)] font-bold leading-[1.2]", ts.title)}>{c.title}</h3>
                      <p className="text-[calc(13px*1.3)] leading-[1.5] text-[#666] dark:text-muted-foreground">{c.body}</p>
                    </motion.article>
                  )
                })}
              </motion.div>
            </div>
          </div>
        </motion.div>

        {/* Mobile: stacked cards */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mt-10 max-w-lg space-y-5 md:hidden"
        >
          {cards.map((c) => {
            const ts = toneStyles[c.tone]
            return (
              <article
                key={c.id}
                className={cn(
                  "flex flex-col items-center rounded-[18px] border bg-white px-5 pb-6 pt-5 text-center dark:bg-card/95",
                  ts.border,
                )}
              >
                <CardIllustration cardId={c.id} markerId={markerId} />
                <h3 className={cn("mt-1 text-[calc(1.125rem*1.3)] font-bold", ts.title)}>{c.title}</h3>
                <p className="text-[calc(0.875rem*1.3)] leading-relaxed text-[#666] dark:text-muted-foreground">{c.body}</p>
              </article>
            )
          })}
        </motion.div>

        <AdoptionIntroBlock />
        <PostTrustCtaBlock />
      </div>
    </section>
  )
}
