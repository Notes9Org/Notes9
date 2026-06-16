"use client"

/**
 * Centered, chat-driven hero sequence. Each phase appears and disappears in
 * turn so the whole story reads as one flow:
 *   1. typing   - the researcher types a question into Catalyst (live caret)
 *   2. processing - the Notes9 deck→hub animation plays, then clears
 *   3. answering - Catalyst types out a cited answer with real sources
 *   4. timesaved - the time-saved result lands
 * then it loops. Everything is centred and professional. Honors reduced motion
 * by holding the answered state.
 */

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check, Clock, CornerDownLeft, MousePointer2, Quote, RotateCcw } from "lucide-react"
import { ConnectedResearchSystemDiagram } from "@/components/marketing/connected-research-system-diagram"

const QUERY =
  "Why did condition B give the highest transient yield, and does the 3:1 PEI:DNA ratio agree with the literature?"
const ANSWER =
  "Condition B used a 3:1 PEI:DNA ratio - the top-yield setting in your screen - and it matches the ratio reported in two papers you saved."
const SOURCES = ["Lab note · Expt #14", "Protocol P-07", "Longo et al., 2023"]

type Phase = "typing" | "processing" | "answering" | "timesaved"

const card =
  "rounded-2xl border border-white/45 bg-[linear-gradient(140deg,color-mix(in_oklab,var(--card)_90%,transparent),color-mix(in_oklab,var(--card)_70%,transparent))] shadow-[0_40px_100px_-50px_var(--n9-accent-glow)] backdrop-blur-xl dark:border-white/10"

function QueryComposer({ typed, done }: { typed: string; done: boolean }) {
  return (
    <div className={`relative w-full max-w-[660px] p-6 sm:p-8 ${card}`}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/notes9-logo-mark-transparent.png" alt="Notes9" className="h-6 w-6 object-contain" />
        </span>
        <span className="text-[14px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ask Catalyst</span>
      </div>
      <div className="flex items-end gap-3 rounded-2xl border border-border/60 bg-background/60 p-4">
        <p className="min-h-[8.5rem] flex-1 text-left text-[20px] leading-8 text-foreground">
          {typed}
          <span className="ml-0.5 inline-block h-5 w-[2px] -translate-y-[1px] animate-pulse bg-[var(--n9-accent)] align-middle" />
        </p>
        <span
          className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white transition-all duration-300 ${
            done ? "scale-110 bg-[var(--n9-accent)] shadow-[0_8px_24px_-8px_var(--n9-accent-glow)]" : "bg-[var(--n9-accent)]/45"
          }`}
        >
          <CornerDownLeft className="h-5 w-5" />
          {done && (
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-xl ring-2 ring-[var(--n9-accent)]"
              initial={{ scale: 0.7, opacity: 0.7 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          )}
        </span>
      </div>
      {/* animated mouse cursor - hovers the field while typing, then clicks Send */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute z-20 drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
        initial={false}
        animate={done ? { left: "calc(100% - 60px)", top: "calc(100% - 52px)", scale: 0.85 } : { left: "46%", top: "66%", scale: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <MousePointer2 className="h-6 w-6 fill-foreground text-background" />
      </motion.span>
    </div>
  )
}

function ProcessingStage({ loopKey }: { loopKey: number }) {
  return (
    <div className="relative w-full">
      <div aria-hidden className="pointer-events-none absolute inset-x-2 inset-y-3 rounded-[2rem] border border-border/60 bg-card shadow-[0_30px_90px_-44px_rgba(44,36,24,0.4)] dark:shadow-[0_30px_90px_-44px_rgba(0,0,0,0.65)]" />
      <div className="relative z-10">
        <ConnectedResearchSystemDiagram key={loopKey} className="w-full min-w-0" />
      </div>
    </div>
  )
}

function AnswerThread({ typed, showSources }: { typed: string; showSources: boolean }) {
  return (
    <div className={`flex w-full max-w-[680px] flex-col gap-4 p-6 sm:p-8 ${card}`}>
      {/* the question, as a sent message */}
      <div className="flex justify-end">
        <p className="max-w-[84%] rounded-2xl rounded-br-md bg-[var(--n9-accent)] px-4 py-3 text-[16px] font-medium leading-relaxed text-white shadow-[0_12px_30px_-14px_var(--n9-accent-glow)]">
          {QUERY}
        </p>
      </div>
      {/* Catalyst's answer, typed out */}
      <div className="flex gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/notes9-logo-mark-transparent.png" alt="Notes9" className="h-6 w-6 object-contain" />
        </span>
        <div className="min-h-[9.5rem] flex-1 rounded-2xl rounded-tl-md border border-border/50 bg-background/55 px-5 py-4 backdrop-blur-sm">
          <p className="text-[19px] leading-8 text-foreground">
            {typed}
            {!showSources && (
              <span className="ml-0.5 inline-block h-5 w-[2px] -translate-y-[1px] animate-pulse bg-[var(--n9-accent)] align-middle" />
            )}
          </p>
          <AnimatePresence>
            {showSources && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4 overflow-hidden border-t border-border/40 pt-3">
                <p className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">Sources</p>
                <div className="flex flex-wrap gap-2">
                  {SOURCES.map((s, i) => (
                    <motion.span
                      key={s}
                      initial={{ opacity: 0, y: 6, scale: 0.94 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ delay: 0.08 * i, type: "spring", stiffness: 320, damping: 22 }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--n9-accent)]/25 bg-[var(--n9-accent-light)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--n9-accent)]"
                    >
                      <Quote className="h-3.5 w-3.5" />
                      {s}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

const OUTCOMES = [
  { icon: Clock, value: "Seconds", label: "to a cited answer" },
  { icon: Quote, value: "3", label: "sources cited" },
  { icon: RotateCcw, value: "0×", label: "re-explaining" },
]

function TimeSavedStage() {
  return (
    <div className={`flex w-full max-w-[640px] flex-col gap-6 p-7 sm:p-9 ${card}`}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--n9-accent)] text-white">
          <Check className="h-4 w-4" />
        </span>
        <span className="text-[16px] font-semibold text-foreground">Answered from your project</span>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {OUTCOMES.map((o, i) => {
          const Icon = o.icon
          return (
            <motion.div
              key={o.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-border/50 bg-background/50 px-3 py-6 text-center"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--n9-accent-light)] text-[var(--n9-accent)]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[26px] font-bold leading-none tracking-tight text-foreground">{o.value}</span>
              <span className="text-[12px] leading-tight text-muted-foreground">{o.label}</span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

const fade = {
  initial: { opacity: 0, y: 16, scale: 0.975, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: -16, scale: 0.975, filter: "blur(6px)" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const },
}

export function HeroSequence() {
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState<Phase>("typing")
  const [loop, setLoop] = useState(0)
  const [qTyped, setQTyped] = useState("")
  const [aTyped, setATyped] = useState("")
  const timers = useRef<number[]>([])
  const push = (id: number) => timers.current.push(id)

  // Reduced motion: hold the answered state, no loop.
  useEffect(() => {
    if (!reduce) return
    setQTyped(QUERY)
    setATyped(ANSWER)
    setPhase("answering")
  }, [reduce])

  // 1 · type the query
  useEffect(() => {
    if (reduce || phase !== "typing") return
    setQTyped("")
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setQTyped(QUERY.slice(0, i))
      if (i >= QUERY.length) {
        window.clearInterval(id)
        push(window.setTimeout(() => setPhase("processing"), 1600))
      }
    }, 36)
    return () => window.clearInterval(id)
  }, [phase, loop, reduce])

  // 2 · processing (Notes9 animation plays, then clears)
  useEffect(() => {
    if (reduce || phase !== "processing") return
    const id = window.setTimeout(() => setPhase("answering"), 7000)
    push(id)
    return () => window.clearTimeout(id)
  }, [phase, loop, reduce])

  // 3 · type the answer, then reveal sources
  useEffect(() => {
    if (reduce || phase !== "answering") return
    setATyped("")
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setATyped(ANSWER.slice(0, i))
      if (i >= ANSWER.length) {
        window.clearInterval(id)
        push(window.setTimeout(() => setPhase("timesaved"), 3800))
      }
    }, 26)
    return () => window.clearInterval(id)
  }, [phase, loop, reduce])

  // 4 · time saved, then loop
  useEffect(() => {
    if (reduce || phase !== "timesaved") return
    const id = window.setTimeout(() => {
      setLoop((l) => l + 1)
      setPhase("typing")
    }, 5200)
    push(id)
    return () => window.clearTimeout(id)
  }, [phase, loop, reduce])

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])

  const answeredFull = aTyped.length >= ANSWER.length

  return (
    <div className="relative mx-auto flex min-h-[500px] w-full items-center justify-center sm:min-h-[560px]">
      <AnimatePresence mode="wait">
        {phase === "typing" && (
          <motion.div key="typing" {...fade} className="flex w-full justify-center">
            <QueryComposer typed={qTyped} done={qTyped.length >= QUERY.length} />
          </motion.div>
        )}
        {phase === "processing" && (
          <motion.div key="processing" {...fade} className="w-full">
            <ProcessingStage loopKey={loop} />
          </motion.div>
        )}
        {phase === "answering" && (
          <motion.div key="answering" {...fade} className="flex w-full justify-center">
            <AnswerThread typed={aTyped} showSources={answeredFull} />
          </motion.div>
        )}
        {phase === "timesaved" && (
          <motion.div key="timesaved" {...fade} className="flex w-full justify-center">
            <TimeSavedStage />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
