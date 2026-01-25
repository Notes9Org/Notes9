"use client"

import { usePathname } from "next/navigation"
import { InteractiveParticles } from "@/components/ui/interactive-particles"

export function MarketingParticles() {
    const pathname = usePathname()

    // Don't show particles on the resources page
    if (pathname?.startsWith("/resources")) {
        return null
    }

    return <InteractiveParticles />
}
