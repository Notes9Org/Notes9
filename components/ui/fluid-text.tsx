"use client"

import * as React from "react"
import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext"
import { motion, useInView } from "framer-motion"

/**
 * Line-aware headline reveal using @chenglou/pretext for layout without DOM thrash,
 * with a character-split fallback before width is measured or if layout fails.
 */
export function PretextReveal({
  text,
  className,
  delay = 0,
  stagger = 0.02,
}: {
  text: string
  className?: string
  delay?: number
  stagger?: number
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: "-10% 0px" })
  const [reduceMotion, setReduceMotion] = React.useState(false)
  const [dim, setDim] = React.useState<{
    width: number
    font: string
    lineHeight: number
  } | null>(null)

  React.useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w < 8) return
      const cs = getComputedStyle(el)
      const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      const lhRaw = cs.lineHeight
      const fontSize = parseFloat(cs.fontSize) || 16
      const lineHeight =
        lhRaw === "normal" ? fontSize * 1.25 : parseFloat(lhRaw) || fontSize * 1.25
      setDim({ width: w, font, lineHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  const linesResult = React.useMemo(() => {
    if (!dim || reduceMotion) return null
    try {
      const prepared = prepareWithSegments(text, dim.font)
      return layoutWithLines(prepared, dim.width, dim.lineHeight)
    } catch {
      return null
    }
  }, [text, dim, reduceMotion])

  const words = text.split(" ")

  if (reduceMotion) {
    return (
      <span ref={ref} className={`inline-block w-full ${className || ""}`}>
        {text}
      </span>
    )
  }

  if (linesResult && linesResult.lines.length > 0) {
    if (!isInView) {
      return (
        <span ref={ref} className={`inline-block w-full ${className || ""}`}>
          {text}
        </span>
      )
    }
    let wordIndex = 0
    return (
      <span ref={ref} className={`inline-block w-full ${className || ""}`}>
        {linesResult.lines.map((line, lineIdx) => {
          const parts = line.text.split(/\s+/).filter(Boolean)
          return (
            <span key={lineIdx} className="block">
              {parts.map((word) => {
                const idx = wordIndex++
                return (
                  <span
                    key={`${lineIdx}-${idx}`}
                    className="inline-block overflow-hidden align-bottom [&:not(:last-child)]:mr-[0.3em]"
                  >
                    <motion.span
                      className="inline-block"
                      initial={{ y: "115%", rotateX: 55, opacity: 0 }}
                      animate={{ y: "0%", rotateX: 0, opacity: 1 }}
                      transition={{
                        duration: 0.72,
                        ease: [0.22, 1, 0.36, 1],
                        delay: delay + idx * stagger * 1.2,
                      }}
                      style={{ transformOrigin: "bottom center" }}
                    >
                      {word}
                    </motion.span>
                  </span>
                )
              })}
            </span>
          )
        })}
      </span>
    )
  }

  return (
    <span ref={ref} className={`inline-block w-full ${className || ""}`}>
      {words.map((word, wordIndex) => (
        <span key={wordIndex} className="inline-block whitespace-nowrap overflow-hidden align-bottom">
          {word.split("").map((char, charIndex) => {
            const index = wordIndex * 5 + charIndex
            return (
              <motion.span
                key={`${wordIndex}-${charIndex}`}
                className="inline-block"
                initial={{ y: "120%", rotateX: 60, opacity: 0 }}
                animate={
                  isInView
                    ? { y: "0%", rotateX: 0, opacity: 1 }
                    : { y: "120%", rotateX: 60, opacity: 0 }
                }
                transition={{
                  duration: 0.8,
                  ease: [0.22, 1, 0.36, 1],
                  delay: delay + index * stagger,
                }}
                style={{ transformOrigin: "bottom center" }}
              >
                {char}
              </motion.span>
            )
          })}
          {wordIndex !== words.length - 1 && <span className="inline-block">&nbsp;</span>}
        </span>
      ))}
    </span>
  )
}
