"use client"

import { Compass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { requestStartTour } from "@/components/tour/app-tour"

/** Launches the onboarding product tour. Client island for use inside server
 *  components (e.g. the dashboard first-run card). */
export function StartTourButton({
  label = "Take a quick tour",
  size = "lg",
  variant = "outline",
}: {
  label?: string
  size?: "default" | "sm" | "lg"
  variant?: "default" | "outline" | "ghost" | "secondary"
}) {
  return (
    <Button type="button" size={size} variant={variant} className="gap-2" onClick={requestStartTour}>
      <Compass className="size-4" aria-hidden />
      {label}
    </Button>
  )
}
