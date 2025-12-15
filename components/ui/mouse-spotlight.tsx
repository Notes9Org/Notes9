"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export function MouseSpotlight({ className }: { className?: string }) {
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [opacity, setOpacity] = useState(0)

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setOpacity(1)
            setPosition({ x: e.clientX, y: e.clientY })
        }

        const handleMouseLeave = () => {
            setOpacity(0)
        }

        window.addEventListener("mousemove", handleMouseMove)
        document.body.addEventListener("mouseleave", handleMouseLeave)

        return () => {
            window.removeEventListener("mousemove", handleMouseMove)
            document.body.removeEventListener("mouseleave", handleMouseLeave)
        }
    }, [])

    return (
        <div
            className={cn(
                "pointer-events-none fixed inset-0 z-0 transition-opacity duration-500",
                className
            )}
            style={{
                opacity,
                background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(59, 130, 246, 0.4), transparent 80%)`,
            }}
        />
    )
}
