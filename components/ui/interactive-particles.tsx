"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export function InteractiveParticles({ className }: { className?: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const mouseRef = useRef({ x: -1000, y: -1000 })

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        let animationFrameId: number
        let particles: Particle[] = []

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
                this.vx = (Math.random() - 0.5) * 0.5 // Initial velocity
                this.vy = (Math.random() - 0.5) * 0.5
                this.size = Math.random() * 3 + 2 // Bigger atoms (2-5px)
                // Brighter chemical colors
                const colors = ["rgba(100, 200, 255, 0.9)", "rgba(255, 255, 255, 0.7)", "rgba(160, 100, 255, 0.9)"]
                this.color = colors[Math.floor(Math.random() * colors.length)]
            }

            update(mouse: { x: number; y: number }, w: number, h: number) {
                // 1. Spring force back to Origin (Home)
                const dxHome = this.originX - this.x
                const dyHome = this.originY - this.y

                // Spring stiffness (returns to home)
                this.vx += dxHome * 0.01
                this.vy += dyHome * 0.01

                // 2. Mouse Attraction (Subtle)
                const dxMouse = mouse.x - this.x
                const dyMouse = mouse.y - this.y
                const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse)
                const mouseRange = 300 // Interaction radius

                if (distMouse < mouseRange) {
                    const force = (mouseRange - distMouse) / mouseRange
                    const angle = Math.atan2(dyMouse, dxMouse)
                    // Very subtle pull (0.05 instead of 0.3)
                    this.vx += Math.cos(angle) * force * 0.08
                    this.vy += Math.sin(angle) * force * 0.08
                }

                // 3. Natural Drift / Noise
                this.vx += (Math.random() - 0.5) * 0.02
                this.vy += (Math.random() - 0.5) * 0.02

                // Physics
                this.vx *= 0.92 // Damping/Friction
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
            // Much higher density: divide by 4000 instead of 6000
            const particleCount = Math.floor((canvas.width * canvas.height) / 4000)
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle(canvas.width, canvas.height))
            }
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            // Draw Particles
            particles.forEach(p => {
                p.update(mouseRef.current, canvas.width, canvas.height)
                p.draw(ctx)
            })

            // Draw Bonds (Lines)
            ctx.lineWidth = 1 // Thicker lines
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x
                    const dy = particles[i].y - particles[j].y
                    const distance = Math.sqrt(dx * dx + dy * dy)
                    const connectDist = 160 // Longer connection range

                    if (distance < connectDist) {
                        // Opacity based on distance
                        const opacity = 1 - (distance / connectDist)
                        ctx.strokeStyle = `rgba(100, 180, 255, ${opacity * 0.6})`
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
    }, [])

    return (
        <canvas
            ref={canvasRef}
            className={cn("pointer-events-none fixed inset-0 z-0", className)}
        />
    )
}
