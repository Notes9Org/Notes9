"use client"

import { usePathname } from "next/navigation"
import { useReducedMotion } from "framer-motion"

import { HeroMoleculeField } from "@/components/marketing/hero-molecule-field"
import { InteractiveParticles } from "@/components/ui/interactive-particles"

export function MarketingParticles() {
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()

  // Don't show ambient backdrop on the resources page
  if (pathname?.startsWith("/resources")) {
    return null
  }

  return (
    <>
      <InteractiveParticles variant="marketing" />
      <div className="pointer-events-none fixed inset-0 z-[1]" aria-hidden>
        <HeroMoleculeField reduceMotion={!!reduceMotion} />
      </div>
    </>
  )
}
