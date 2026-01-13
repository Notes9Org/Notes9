"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface InteractiveGridPatternProps {
    className?: string
    width?: number
    height?: number
    squares?: number // Number of squares in the grid (approx)
    color?: string
    hoverColor?: string
}

export function InteractiveGridPattern({
    className,
    width = 40,
    height = 40,
    squares = 40,
    color = "rgba(120, 120, 120, 0.1)", // Default subtle gray
    hoverColor = "rgba(59, 130, 246, 0.5)", // Default primary blue-ish
}: InteractiveGridPatternProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const mouseRef = useRef({ x: -1000, y: -1000 })

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        let animationFrameId: number
        let points: { x: number; y: number; originX: number; originY: number; vx: number; vy: number }[] = []

        const resize = () => {
            const parent = canvas.parentElement
            if (parent) {
                canvas.width = parent.clientWidth
                canvas.height = parent.clientHeight
            }
            initPoints()
        }

        const initPoints = () => {
            points = []
            const rows = Math.ceil(canvas.height / height)
            const cols = Math.ceil(canvas.width / width)

            for (let i = 0; i <= rows; i++) {
                for (let j = 0; j <= cols; j++) {
                    const x = j * width
                    const y = i * height
                    points.push({
                        x,
                        y,
                        originX: x,
                        originY: y,
                        vx: 0,
                        vy: 0
                    })
                }
            }
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height)

            // Update points
            points.forEach(point => {
                const dx = point.x - mouseRef.current.x
                const dy = point.y - mouseRef.current.y
                const distance = Math.sqrt(dx * dx + dy * dy)
                const maxDist = 200 // Radius of influence

                let targetX = point.originX
                let targetY = point.originY

                // Warping effect: Push points AWAY from cursor (or pull towards)
                // Let's pull slightly towards for a "gravity" feel, or push away for "repulsion".
                // Repulsion is usually more noticeable for "warping".
                if (distance < maxDist) {
                    const force = (maxDist - distance) / maxDist
                    const angle = Math.atan2(dy, dx)
                    const moveDist = force * 60 // Max displacement pixels

                    targetX = point.originX + Math.cos(angle) * moveDist
                    targetY = point.originY + Math.sin(angle) * moveDist
                }

                // Spring physics for smooth return
                const ax = (targetX - point.x) * 0.1 // stiffness
                const ay = (targetY - point.y) * 0.1

                point.vx += ax
                point.vy += ay
                point.vx *= 0.85 // friction
                point.vy *= 0.85

                point.x += point.vx
                point.y += point.vy
            })

            // Draw grid lines
            ctx.strokeStyle = color
            ctx.lineWidth = 1

            // We can draw lines between neighbors, but iterating points is O(N).
            // For a simple warped grid, simply drawing dots is cheaper, but lines look cooler.
            // Let's try drawing connected lines. Since points are ordered (row by row), we can connect:
            const rows = Math.ceil(canvas.height / height)
            const cols = Math.ceil(canvas.width / width)

            ctx.beginPath()
            for (let i = 0; i <= rows; i++) {
                for (let j = 0; j <= cols; j++) {
                    const index = i * (cols + 1) + j
                    const p = points[index]
                    if (!p) continue

                    // Draw Right Neighbor
                    if (j < cols) {
                        const rightIndex = index + 1
                        const rightP = points[rightIndex]
                        if (rightP) {
                            ctx.moveTo(p.x, p.y)
                            ctx.lineTo(rightP.x, rightP.y)
                        }
                    }

                    // Draw Bottom Neighbor
                    if (i < rows) {
                        const bottomIndex = index + (cols + 1)
                        const bottomP = points[bottomIndex]
                        if (bottomP) {
                            ctx.moveTo(p.x, p.y)
                            ctx.lineTo(bottomP.x, bottomP.y)
                        }
                    }
                }
            }
            ctx.stroke()

            animationFrameId = requestAnimationFrame(animate)
        }

        const handleMouseMove = (e: MouseEvent) => {
            // Get relative mouse position
            const rect = canvas.getBoundingClientRect()
            mouseRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            }
        }

        const handleMouseLeave = () => {
            mouseRef.current = { x: -1000, y: -1000 }
        }

        window.addEventListener("resize", resize)
        // We attach mouse listeners to window or parent to ensure smooth tracking even if cursor moves fast?
        // Actually attaching to canvas is fine for a background.
        // If it's a full screen background, canvas interaction is good.
        canvas.addEventListener("mousemove", handleMouseMove)
        canvas.addEventListener("mouseleave", handleMouseLeave)

        resize()
        animate()

        return () => {
            window.removeEventListener("resize", resize)
            canvas.removeEventListener("mousemove", handleMouseMove)
            canvas.removeEventListener("mouseleave", handleMouseLeave)
            cancelAnimationFrame(animationFrameId)
        }
    }, [width, height, color])

    return (
        <canvas
            ref={canvasRef}
            className={cn("absolute inset-0 pointer-events-auto", className)}
        />
    )
}
