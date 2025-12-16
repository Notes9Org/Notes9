"use client"

import { useEffect, useRef } from "react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"

export function InteractiveParticles({ className }: { className?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const mouseRef = useRef({ x: -1000, y: -1000 })
    const { resolvedTheme } = useTheme() // Use resolvedTheme for better accuracy

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const isDarkMode = resolvedTheme === 'dark'

        let animationFrameId: number
        let particles: Particle[] = []

        // Theme-dependent colors - Professional Scientific Palette
        const particleColors = isDarkMode
            ? [
                "rgba(60, 180, 255, 0.8)",  // Bright Blue
                "rgba(50, 220, 200, 0.8)",  // Teal/Cyan
                "rgba(180, 100, 255, 0.8)", // Soft Purple
                "rgba(220, 220, 255, 0.8)", // White-ish Blue
                "rgba(100, 150, 255, 0.8)", // Azure
            ]
            : [
                "rgba(30, 58, 138, 0.8)",   // Navy Blue
                "rgba(13, 148, 136, 0.8)",  // Teal
                "rgba(88, 28, 135, 0.8)",   // Deep Purple
                "rgba(71, 85, 105, 0.8)",   // Slate
                "rgba(37, 99, 235, 0.8)",   // Royal Blue
            ]

        const connectionColor = isDarkMode
            ? "150, 150, 170" // Muted cool gray
            : "100, 116, 139" // Slate gray



        class Particle {
            x: number
            originX: number
            originY: number
            y: number
            vx: number
            vy: number
            size: number
            color: string

            constructor(w: number, h: number) {
                this.originX = Math.random() * w
                this.originY = Math.random() * h
                this.x = this.originX
                this.y = this.originY
                this.vx = (Math.random() - 0.5) * 0.5
                this.vy = (Math.random() - 0.5) * 0.5
                this.size = Math.random() * 3 + 2
                this.color = particleColors[Math.floor(Math.random() * particleColors.length)]
            }

            update(mouse: { x: number; y: number }, w: number, h: number) {
                const dxHome = this.originX - this.x
                const dyHome = this.originY - this.y

                this.vx += dxHome * 0.01
                this.vy += dyHome * 0.01

                const dxMouse = mouse.x - this.x
                const dyMouse = mouse.y - this.y
                const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse)
                const mouseRange = 300

                if (distMouse < mouseRange) {
                    const force = (mouseRange - distMouse) / mouseRange
                    const angle = Math.atan2(dyMouse, dxMouse)
                    this.vx += Math.cos(angle) * force * 0.08
                    this.vy += Math.sin(angle) * force * 0.08
                }

                this.vx += (Math.random() - 0.5) * 0.02
                this.vy += (Math.random() - 0.5) * 0.02

                this.vx *= 0.92
                this.vy *= 0.92

                this.x += this.vx
                this.y += this.vy
            }

            draw(context: CanvasRenderingContext2D) {
                context.fillStyle = this.color
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
            // Reduce count slightly as clusters are larger visually
            const particleCount = Math.floor((canvas.width * canvas.height) / 4000)
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle(canvas.width, canvas.height))
            }
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            particles.forEach(p => {
                p.update(mouseRef.current, canvas.width, canvas.height)
                p.draw(ctx)
            })

            ctx.lineWidth = 1
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x
                    const dy = particles[i].y - particles[j].y
                    const distance = Math.sqrt(dx * dx + dy * dy)
                    const connectDist = 160

                    if (distance < connectDist) {
                        const opacity = (1 - (distance / connectDist)) * 0.6
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
            mouseRef.current = {
                x: e.clientX,
                y: e.clientY
            }
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
    }, [resolvedTheme])

    return (
        <canvas
            ref={canvasRef}
            className={cn("pointer-events-none fixed inset-0 z-0", className)}
        />
    )
}

