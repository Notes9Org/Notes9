"use client"

import { Info } from "lucide-react"

export function StatusSection() {
    return (
        <section className="bg-muted/50 py-6 border-y border-border/50">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-center sm:text-left">
                <Info className="h-5 w-5 text-blue-500 flex-shrink-0" />
                <p className="text-sm sm:text-base text-muted-foreground font-medium">
                    <span className="text-foreground font-semibold">Currently in Development:</span> We are gathering insights from researchers to build the ultimate agentic laboratory assistant.
                </p>
            </div>
        </section>
    )
}
