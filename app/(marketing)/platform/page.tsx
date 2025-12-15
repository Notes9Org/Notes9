"use client"

import { Badge } from "@/components/ui/badge"
import { Search, Database, Brain, BookOpen, GitBranch, Share2, Sparkles, FileText, BarChart, FlaskConical, FolderKanban, Network } from "lucide-react"
import { PlatformFeature } from "@/components/marketing/platform-feature"

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

            {/* 1. Literature Search */}
            <PlatformFeature
                index={0}
                title="Agentic Literature Review"
                description="Stop drowning in PDFs. Our agent proactively scans major databases to find papers relevant to your ongoing experiments, understanding concepts rather than just keywords."
                icon={Search}
                align="left"
                images={["literature-review-search.png"]}
                features={[
                    {
                        icon: Sparkles,
                        title: "Semantic Search & Ranking",
                        description: "Finds papers based on scientific concepts and experimental context, filtering out irrelevant noise."
                    },
                    {
                        icon: BookOpen,
                        title: "Automated Summaries",
                        description: "Get concise, structured summaries focused on methods, results, and key findings instantly."
                    }
                ]}
            />

            {/* 2. Project Ecosystem */}
            <PlatformFeature
                index={1}
                title="Project Ecosystem"
                description="Manage your research with a flexible hierarchy. Organize experiments into projects and track progress from hypothesis to publication throughout the lifecycle."
                icon={FolderKanban}
                align="right"
                images={["project-details.png", "projects-page.png"]}
                features={[
                    {
                        icon: Network,
                        title: "Connected Workflow",
                        description: "Seamlessly link literature reviews, experiments, and notes within a unified project context."
                    },
                    {
                        icon: Share2,
                        title: "Collaborative Workspace",
                        description: "Share projects with your lab members and track contributions in real-time."
                    }
                ]}
            />

            {/* 3. Experimentation */}
            <PlatformFeature
                index={2}
                title="Experiment Management"
                description="Design and track experiments with precision. Define variables, samples, and protocols in a structured environment that ensures reproducibility."
                icon={FlaskConical}
                align="left"
                images={["experiment-details.png"]}
                features={[
                    {
                        icon: GitBranch,
                        title: "Protocol Versioning",
                        description: "Track changes to methods over time. maintain a complete history of protocol optimizations."
                    },
                    {
                        icon: Database,
                        title: "Structured Data Capture",
                        description: "Standardize how data is collected across the lab to enable better downstream analysis."
                    }
                ]}
            />

            {/* 4. Lab Notebook */}
            <PlatformFeature
                index={3}
                title="Digital Lab Notebook"
                description="A modern ELN that writes itself. Capture observations, link results, and maintain a chronological record of your daily research activities."
                icon={FileText}
                align="right"
                images={["lab_notes-details.png", "lab-notes.png"]}
                features={[
                    {
                        icon: Sparkles, // Or Edit3
                        title: "Rich Text & Media",
                        description: "Embed images, charts, and chemical structures directly into your daily notes."
                    },
                    {
                        icon: Brain,
                        title: "Context-Aware Linking",
                        description: "Automatically link note entries to specific experiments and literature sources."
                    }
                ]}
            />

            {/* Analysis Section (Optional - kept if needed for completeness, or maybe merged into others?) 
                Reviewing the request, it asked for Literature, Projects, Experiment, and Lab Notes.
                I will stop here to strictly follow the "images provided" guidance, 
                as I don't have a specific analysis image other than re-using placeholders.
            */}
        </div>
    )
}
