"use client"

import { Badge } from "@/components/ui/badge"
import { Search, Database, Brain, BookOpen, GitBranch, Share2, Sparkles, FileText, BarChart, FlaskConical, FolderKanban, Network } from "lucide-react"
import { ScrollFeature } from "@/components/marketing/scroll-feature"
import { BentoGrid, BentoGridItem } from "@/components/marketing/bento-grid"

export default function PlatformPage() {
    return (
        <div className="bg-background min-h-screen">
            {/* Hero */}
            <div className="relative py-20 sm:py-24 border-b border-border/60 overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none"></div>
                <div className="container mx-auto px-4 text-center relative z-10">
                    <Badge variant="outline" className="mb-6 text-sm font-medium border-primary/20 bg-primary/5 text-primary">
                        Platform Capabilities
                    </Badge>
                    <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance mb-6">
                        A Unified <span className="text-primary">Agentic Research Platform</span>
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-3xl mx-auto text-pretty font-light leading-relaxed">
                        Notes9 integrates the three pillars of modern research—literature, experimentation, and analysis—into a single agentic workflow.
                    </p>
                </div>
            </div>

            {/* 1. Literature Search - Full Width Hero Feature */}
            <ScrollFeature
                title="Agentic Literature Review"
                description="Stop drowning in PDFs. Our agent proactively scans major databases to find papers relevant to your ongoing experiments, understanding concepts rather than just keywords."
                icon={Search}
                image="literature-review-search.png"
                align="left"
            />

            {/* 2. Project Ecosystem */}
            <ScrollFeature
                title="Project Ecosystem"
                description="Manage your research with a flexible hierarchy. Organize experiments into projects and track progress from hypothesis to publication throughout the lifecycle."
                icon={FolderKanban}
                image="project-details.png"
                align="right"
            />


            {/* 3. Lab Notebook & Experiments - Alternating Scroll Features with tighter spacing */}
            <div className="space-y-0">
                <ScrollFeature
                    title="Design & Execute"
                    description="Define variables, samples, and protocols in a structured environment that ensures reproducibility."
                    icon={FlaskConical}
                    image="experiment-details.png"
                    align="right"
                />

                <ScrollFeature
                    title="The Notebook that Writes Itself"
                    description="Capture observations, link results, and maintain a chronological record of your daily research activities automatically."
                    icon={FileText}
                    image="lab_notes-details.png"
                    align="left"
                />
            </div>

            {/* CTA Section */}
            <div className="py-24 text-center">
                <h3 className="text-2xl font-bold mb-4">Ready to modernize your lab?</h3>
                <p className="text-muted-foreground mb-8">Join the researchers already using Notes9.</p>
                {/* CTA buttons would go here */}
            </div>
        </div>
    )
}
