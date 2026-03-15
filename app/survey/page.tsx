"use client"

import { InteractiveParticles } from "@/components/ui/interactive-particles"
import { ModeToggle } from "@/components/mode-toggle"

export default function SurveyPage() {
  return (
    <div className="flex flex-col h-screen bg-background relative overflow-hidden">
      <InteractiveParticles />

      {/* Overlays matching login page pattern */}
      <div className="absolute inset-0 z-0 bg-background/30 backdrop-blur-[1px]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_800px_at_center,theme(colors.background)_30%,transparent_100%)]" />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Header */}
        <div className="p-4 text-center relative">
          <div className="absolute top-4 right-4">
            <ModeToggle />
          </div>
          <a
            href="https://notes9.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mx-auto mb-2 hover:opacity-80 transition-opacity"
          >
            <img
              src="/notes9-logo.png"
              alt="Notes9"
              className="h-10"
            />
            <span className="text-xl font-bold">Notes9</span>
          </a>
          <h1 className="text-2xl font-bold">ELN Experience Survey</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI in Laboratory Research
          </p>
        </div>

        {/* Google Form Embed */}
        <div className="flex-1 overflow-hidden px-4 pb-4">
          <div className="max-w-3xl mx-auto h-full rounded-xl overflow-hidden shadow-2xl border border-border">
            <iframe
              src="https://docs.google.com/forms/d/e/1FAIpQLScL1fAjzPqu34jByr-VvNZtn1uMc02ILo80BsAXrh5IlIXWdw/viewform?embedded=true"
              width="100%"
              height="100%"
              frameBorder="0"
              marginHeight={0}
              marginWidth={0}
              className="w-full h-full"
              title="User Survey"
            >
              Loading...
            </iframe>
          </div>
        </div>
      </div>
    </div>
  )
}
