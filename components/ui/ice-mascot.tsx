"use client"

import { useEffect, useRef, type HTMLAttributes } from "react"

export interface IceEyeTrackerOptions {
  src: string
  leftPupil?: [number, number]
  rightPupil?: [number, number]
  pupilSize?: number
  maxTravel?: number
  lerp?: number
}

type Pupil = {
  el: HTMLDivElement
  mask: HTMLDivElement
  originX: number
  originY: number
  x: number
  y: number
  targetX: number
  targetY: number
}

export class IceEyeTracker {
  private host: HTMLElement
  private img: HTMLImageElement
  private inner: HTMLDivElement
  private pupils: Pupil[] = []
  private opts: Required<IceEyeTrackerOptions>
  private raf = 0
  private running = false

  private headX = 0
  private headY = 0
  private headTargetX = 0
  private headTargetY = 0

  constructor(hostSelector: string | HTMLElement, srcOrOptions: string | IceEyeTrackerOptions) {
    const host =
      typeof hostSelector === "string"
        ? document.querySelector<HTMLElement>(hostSelector)
        : hostSelector
    if (!host) throw new Error(`IceEyeTracker: host not found: ${hostSelector}`)
    this.host = host

    const opts: IceEyeTrackerOptions =
      typeof srcOrOptions === "string" ? { src: srcOrOptions } : srcOrOptions

    this.opts = {
      src: opts.src,
      leftPupil: opts.leftPupil ?? [0.356, 0.325],
      rightPupil: opts.rightPupil ?? [0.6375, 0.325],
      pupilSize: opts.pupilSize ?? 0.09,
      maxTravel: opts.maxTravel ?? 0.025,
      lerp: opts.lerp ?? 0.18,
    }

    this.host.style.position = this.host.style.position || "relative"
    this.host.style.display = "inline-block"
    this.host.style.lineHeight = "0"

    this.inner = document.createElement("div")
    this.inner.style.cssText = "position:relative;width:100%;height:100%;will-change:transform;"
    this.host.appendChild(this.inner)

    this.img = document.createElement("img")
    this.img.src = this.opts.src
    this.img.alt = "Ice - Notes9 mascot"
    this.img.style.cssText =
      "width:100%;height:auto;display:block;user-select:none;pointer-events:none;"
    this.inner.appendChild(this.img)

    this.pupils = [
      this.createPupil(this.opts.leftPupil),
      this.createPupil(this.opts.rightPupil),
    ]
  }

  private createPupil([x, y]: [number, number]): Pupil {
    const mask = document.createElement("div")
    const maskSizePct = this.opts.pupilSize * 100 * 1.25
    mask.style.cssText = `
      position:absolute;
      left:${x * 100}%;
      top:${y * 100}%;
      width:${maskSizePct}%;
      aspect-ratio:1;
      background:#ffffff;
      border-radius:50%;
      transform:translate(-50%, -50%);
      pointer-events:none;
    `
    this.inner.appendChild(mask)

    const el = document.createElement("div")
    const sizePct = this.opts.pupilSize * 100
    el.style.cssText = `
      position:absolute;
      left:${x * 100}%;
      top:${y * 100}%;
      width:${sizePct}%;
      aspect-ratio:1;
      background:#0a0a0a;
      border-radius:50%;
      transform:translate(-50%, -50%);
      pointer-events:none;
      will-change:transform;
    `
    this.inner.appendChild(el)

    return { el, mask, originX: x, originY: y, x: 0, y: 0, targetX: 0, targetY: 0 }
  }

  start() {
    if (this.running) return
    this.running = true
    window.addEventListener("pointermove", this.onMove, { passive: true })
    window.addEventListener("pointerleave", this.onLeave, { passive: true })
    window.addEventListener("resize", this.onResize)
    this.tick()
  }

  stop() {
    if (!this.running) return
    this.running = false
    window.removeEventListener("pointermove", this.onMove)
    window.removeEventListener("pointerleave", this.onLeave)
    window.removeEventListener("resize", this.onResize)
    cancelAnimationFrame(this.raf)
  }

  destroy() {
    this.stop()
    this.pupils.forEach((p) => {
      p.el.remove()
      p.mask.remove()
    })
    this.img.remove()
    this.inner.remove()
    this.pupils = []
  }

  private onResize = () => {}

  private onMove = (e: PointerEvent) => {
    const rect = this.host.getBoundingClientRect()
    if (rect.width === 0) return

    const maxTravelPx = rect.width * this.opts.maxTravel

    const headMaxTravelPx = maxTravelPx * 0.45
    const headOriginX = rect.left + rect.width * 0.5
    const headOriginY = rect.top + rect.height * 0.5
    const hdx = e.clientX - headOriginX
    const hdy = e.clientY - headOriginY
    const hDist = Math.hypot(hdx, hdy)
    const ht = hDist > 0 ? Math.min(1, headMaxTravelPx / hDist) : 0
    this.headTargetX = hdx * ht
    this.headTargetY = hdy * ht

    for (const p of this.pupils) {
      const originPxX = rect.left + rect.width * p.originX
      const originPxY = rect.top + rect.height * p.originY
      const dx = e.clientX - originPxX
      const dy = e.clientY - originPxY
      const dist = Math.hypot(dx, dy)
      const t = dist > 0 ? Math.min(1, maxTravelPx / dist) : 0
      p.targetX = dx * t
      p.targetY = dy * t
    }
  }

  private onLeave = () => {
    this.headTargetX = 0
    this.headTargetY = 0
    for (const p of this.pupils) {
      p.targetX = 0
      p.targetY = 0
    }
  }

  private tick = () => {
    if (!this.running) return
    const k = this.opts.lerp

    this.headX += (this.headTargetX - this.headX) * k
    this.headY += (this.headTargetY - this.headY) * k
    this.inner.style.transform = `translate(${this.headX.toFixed(2)}px, ${this.headY.toFixed(2)}px)`

    for (const p of this.pupils) {
      p.x += (p.targetX - p.x) * k
      p.y += (p.targetY - p.y) * k
      p.el.style.transform = `translate(calc(-50% + ${p.x.toFixed(2)}px), calc(-50% + ${p.y.toFixed(2)}px))`
    }

    this.raf = requestAnimationFrame(this.tick)
  }
}

export function useIceMascot(opts: IceEyeTrackerOptions) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const tracker = new IceEyeTracker(ref.current, opts)
    tracker.start()

    return () => tracker.destroy()
  }, [
    opts.src,
    opts.leftPupil?.[0],
    opts.leftPupil?.[1],
    opts.rightPupil?.[0],
    opts.rightPupil?.[1],
    opts.pupilSize,
    opts.maxTravel,
    opts.lerp,
  ])

  return ref
}

interface IceMascotProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  options?: Partial<IceEyeTrackerOptions>
}

export function IceMascot({ options = {}, className, style, ...props }: IceMascotProps) {
  const ref = useIceMascot({
    src: "/notes9-mascot-ui.png",
    ...options,
  })

  return (
    <div
      ref={ref}
      className={className}
      style={{
        display: "inline-block",
        ...style,
      }}
      {...props}
    />
  )
}
