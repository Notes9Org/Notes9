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

        const isDarkMode = resolvedTheme === 'dark'

        let animationFrameId: number
        let particles: Particle[] = []

        const particleColors = variant === "marketing"
            ? (isDarkMode ? ["212, 132, 90", "168, 158, 142", "180, 120, 80"] : ["155, 71, 34", "160, 140, 110", "120, 90, 60"])
            : (isDarkMode ? ["148, 163, 184", "100, 116, 139", "71, 85, 105"] : ["100, 116, 139", "148, 163, 184", "203, 213, 225"])

        const connectionColor = variant === "marketing"
            ? (isDarkMode ? "168, 158, 142" : "160, 140, 110")
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
                this.vx = (Math.random() - 0.5) * 0.12
                this.vy = (Math.random() - 0.5) * 0.12
                this.size = Math.random() * 1.2 + 0.5
                this.alpha = isDarkMode ? 0.06 + Math.random() * 0.08 : 0.03 + Math.random() * 0.05
                this.color = particleColors[Math.floor(Math.random() * particleColors.length)]
            }

            update(mouse: { x: number; y: number }) {
                const dxHome = this.originX - this.x
                const dyHome = this.originY - this.y
                this.vx += dxHome * 0.004
                this.vy += dyHome * 0.004

                const dxMouse = mouse.x - this.x
                const dyMouse = mouse.y - this.y
                const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse)
                if (distMouse < 120) {
                    const force = (120 - distMouse) / 120
                    const angle = Math.atan2(dyMouse, dxMouse)
                    this.vx += Math.cos(angle) * force * 0.01
                    this.vy += Math.sin(angle) * force * 0.01
                }

                this.vx *= 0.96
                this.vy *= 0.96
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
            const particleCount = Math.max(18, Math.floor((canvas.width * canvas.height) / 22000))
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

            animationFrameId = requestAnimationFrame(animate)
        }

        const handleMouseMove = (e: MouseEvent) => {
            mouseRef.current = { x: e.clientX, y: e.clientY }
        }

        window.addEventListener("resize", resize)
        window.addEventListener("mousemove", handleMouseMove)
        resize()
        animate()

        return () => {
            window.removeEventListener("resize", resize)
            window.removeEventListener("mousemove", handleMouseMove)
            cancelAnimationFrame(animationFrameId)
        }
    }, [resolvedTheme, variant])

    return (
        <canvas
            ref={canvasRef}
            className={cn("pointer-events-none fixed inset-0 z-0 opacity-50 dark:opacity-60", className)}
        />
    )
}
