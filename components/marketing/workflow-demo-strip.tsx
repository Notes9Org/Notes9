"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { resolveDemoScreenshot } from "@/components/marketing/demo-asset"

export interface WorkflowStep {
  image: string
  label: string
}

interface WorkflowDemoStripProps {
  /** Video URL for screen recording (preferred when available) */
  videoSrc?: string
  steps: WorkflowStep[]
  fallbackSteps?: WorkflowStep[]
  intervalMs?: number
  className?: string
  fullBleed?: boolean
}

export function WorkflowDemoStrip({
  videoSrc,
  steps,
  fallbackSteps,
  intervalMs = 4500,
  className = "",
  fullBleed = false,
}: WorkflowDemoStripProps) {
  const { resolvedTheme } = useTheme()
  const [current, setCurrent] = useState(0)
  const [prev, setPrev] = useState(0)
  const [prevOpacity, setPrevOpacity] = useState(0)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const [videoFailed, setVideoFailed] = useState(false)

  const effectiveSteps = steps.map((s, i) => {
    const fallback = fallbackSteps?.[i]
    const themedStep = { ...s, image: resolveDemoScreenshot(s.image, resolvedTheme) }
    const themedFallback = fallback
      ? { ...fallback, image: resolveDemoScreenshot(fallback.image, resolvedTheme) }
      : undefined
    if (failedImages.has(themedStep.image) && themedFallback) return themedFallback
    return themedStep
  })

  useEffect(() => {
    if (effectiveSteps.length <= 1) return
    const id = setInterval(() => {
      setPrev(current)
      setCurrent((c) => (c + 1) % effectiveSteps.length)
      setPrevOpacity(1)
    }, intervalMs)
    return () => clearInterval(id)
  }, [effectiveSteps.length, intervalMs, current])

  useEffect(() => {
    if (prevOpacity < 1) return
    const t = setTimeout(() => setPrevOpacity(0), 50)
    return () => clearTimeout(t)
  }, [prevOpacity])

  const step = effectiveSteps[current]
  const prevStep = effectiveSteps[prev]

  const handleError = (src: string) => {
    setFailedImages((prev) => new Set(prev).add(src))
  }

  const showVideo = videoSrc && !videoFailed

  if (showVideo) {
    return (
      <div
        className={`marketing-glass-surface relative overflow-hidden bg-background/78 ${
          fullBleed ? "absolute inset-0" : "rounded-xl border border-border/60 shadow-lg"
        } ${className}`}
      >
        <div className={`relative w-full ${fullBleed ? "h-full" : "aspect-video"}`}>
          <video
            src={videoSrc}
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover object-top"
            onError={() => setVideoFailed(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <span className="inline-flex rounded-full border border-[var(--n9-accent)]/40 bg-[var(--n9-accent-light)] px-4 py-1.5 text-sm font-semibold text-[var(--n9-accent)]">
              Research workflow in action
            </span>
          </div>
        </div>
      </div>
    )
  }

  if (!step || effectiveSteps.length === 0) return null

  return (
    <div
      className={`marketing-glass-surface relative overflow-hidden bg-background/78 ${
        fullBleed ? "absolute inset-0" : "rounded-xl border border-border/60 shadow-lg"
      } ${className}`}
    >
      <div className={`relative w-full ${fullBleed ? "h-full" : "aspect-video"}`}>
        {/* Use native img for reliable local path loading */}
        <img
          key={step.image}
          src={step.image}
          alt={step.label}
          className="absolute inset-0 h-full w-full object-cover object-top"
          onError={() => handleError(step.image)}
        />
        {effectiveSteps.length > 1 && prevStep && prevStep.image !== step.image && (
          <img
            key={`prev-${prevStep.image}`}
            src={prevStep.image}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-top transition-opacity duration-700"
            style={{ opacity: prevOpacity }}
            aria-hidden
          />
        )}
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {/* Narrative label badge */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <span
            key={step.label}
            className="inline-flex rounded-full border border-[var(--n9-accent)]/40 bg-[var(--n9-accent-light)] px-4 py-1.5 text-sm font-semibold text-[var(--n9-accent)] transition-opacity duration-300"
          >
            {step.label}
          </span>
        </div>
      </div>
      {/* Step indicators */}
      {effectiveSteps.length > 1 && (
        <div className="absolute right-3 top-3 flex gap-1.5">
          {effectiveSteps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === current ? "w-4 bg-[var(--n9-accent)]" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
