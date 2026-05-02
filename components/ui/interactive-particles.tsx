"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export function InteractiveParticles({ className, variant = "default" }: { className?: string; variant?: "default" | "marketing" }) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const mouseRef = useRef({ x: -1000, y: -1000 })
    const { resolvedTheme } = useTheme()

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const isDarkMode = resolvedTheme === "dark" || resolvedTheme === "black"
        const isMarketing = variant === "marketing"

        let animationFrameId: number
        let particles: Particle[] = []

        const particleColors = variant === "marketing"
            ? (isDarkMode ? ["109, 189, 114", "74, 144, 78", "140, 175, 145"] : ["88, 166, 92", "74, 144, 78", "120, 160, 124"])
            : (isDarkMode ? ["148, 163, 184", "100, 116, 139", "71, 85, 105"] : ["100, 116, 139", "148, 163, 184", "203, 213, 225"])

        const connectionColor = variant === "marketing"
            ? (isDarkMode ? "120, 165, 125" : "100, 150, 105")
            : (isDarkMode ? "148, 163, 184" : "148, 163, 184")

        class Particle {
            x: number
            originX: number
            originY: number
            y: number
            vx: number
            vy: number
            size: number
            color: string
            alpha: number

            constructor(w: number, h: number) {
                this.originX = Math.random() * w
                this.originY = Math.random() * h
                this.x = this.originX
                this.y = this.originY
                const vMult = isMarketing ? 0.042 : 0.12
                this.vx = (Math.random() - 0.5) * vMult
                this.vy = (Math.random() - 0.5) * vMult
                this.size = Math.random() * (isMarketing ? 0.95 : 1.2) + (isMarketing ? 0.35 : 0.5)
                /* Marketing: mild dot opacity */
                this.alpha = isMarketing
                    ? isDarkMode
                        ? 0.018 + Math.random() * 0.038
                        : 0.009 + Math.random() * 0.022
                    : isDarkMode
                      ? 0.06 + Math.random() * 0.08
                      : 0.03 + Math.random() * 0.05
                this.color = particleColors[Math.floor(Math.random() * particleColors.length)]
            }

            update(mouse: { x: number; y: number }) {
                const dxHome = this.originX - this.x
                const dyHome = this.originY - this.y
                const homeK = isMarketing ? 0.00165 : 0.004
                this.vx += dxHome * homeK
                this.vy += dyHome * homeK

                const dxMouse = mouse.x - this.x
                const dyMouse = mouse.y - this.y
                const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse)
                const mouseRadius = isMarketing ? 200 : 120
                if (distMouse < mouseRadius && distMouse > 0.5) {
                    const force = (mouseRadius - distMouse) / mouseRadius
                    const angle = Math.atan2(dyMouse, dxMouse)
                    const push = isMarketing ? 0.012 : 0.01
                    this.vx += Math.cos(angle) * force * push
                    this.vy += Math.sin(angle) * force * push
                }

                const friction = isMarketing ? 0.981 : 0.96
                this.vx *= friction
                this.vy *= friction
                this.x += this.vx
                this.y += this.vy
            }

            draw(context: CanvasRenderingContext2D) {
                context.fillStyle = `rgba(${this.color}, ${this.alpha})`
                context.beginPath()
                context.arc(this.x, this.y, this.size, 0, Math.PI * 2)
                context.fill()
            }
        }

        const resize = () => {
            const parent = canvas.parentElement
            if (parent) {
                canvas.width = parent.clientWidth
                canvas.height = parent.clientHeight
            }
            initParticles()
        }

        const initParticles = () => {
            particles = []
            const density = isMarketing ? 28000 : 22000
            const particleCount = Math.max(isMarketing ? 16 : 18, Math.floor((canvas.width * canvas.height) / density))
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle(canvas.width, canvas.height))
            }
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            particles.forEach(p => {
                p.update(mouseRef.current)
                p.draw(ctx)
            })

            /* Marketing surfaces: soft dots only — no connector lines */
            if (variant !== "marketing") {
                ctx.lineWidth = 0.5
                for (let i = 0; i < particles.length; i++) {
                    for (let j = i + 1; j < particles.length; j++) {
                        const dx = particles[i].x - particles[j].x
                        const dy = particles[i].y - particles[j].y
                        const distance = Math.sqrt(dx * dx + dy * dy)

                        if (distance < 100) {
                            const maxOpacity = isDarkMode ? 0.06 : 0.035
                            const opacity = (1 - (distance / 100)) * maxOpacity
                            ctx.strokeStyle = `rgba(${connectionColor}, ${opacity})`
                            ctx.beginPath()
                            ctx.moveTo(particles[i].x, particles[i].y)
                            ctx.lineTo(particles[j].x, particles[j].y)
                            ctx.stroke()
                        }
                    }
                }
            }

            animationFrameId = requestAnimationFrame(animate)
        }

        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect()
            mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
        }

        window.addEventListener("resize", resize)
        window.addEventListener("mousemove", handleMouseMove, { passive: true })
        resize()
        animate()

        return () => {
            window.removeEventListener("resize", resize)
            window.removeEventListener("mousemove", handleMouseMove as EventListener)
            cancelAnimationFrame(animationFrameId)
        }
    }, [resolvedTheme, variant])

    return (
        <canvas
            ref={canvasRef}
            className={cn(
                "pointer-events-none fixed inset-0 z-0",
                variant === "marketing" ? "opacity-[0.26] dark:opacity-[0.30]" : "opacity-50 dark:opacity-60",
                className,
            )}
        />
    )
}
