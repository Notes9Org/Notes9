"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, Database, Brain, BookOpen, GitBranch, Share2, Sparkles, FileText, BarChart } from "lucide-react"

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
                        A Unified <span className="text-primary">Research Operating System</span>
                    </h1>
                    <p className="text-xl text-muted-foreground max-w-3xl mx-auto text-pretty font-light leading-relaxed">
                        Notes9 integrates the three pillars of modern research—literature, experimentation, and analysis—into a single agentic workflow.
                    </p>
                </div>
            </div>

            {/* Feature Deep Dive 1: Literature */}
            <section className="py-24 bg-card">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <div className="space-y-6">
                            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-xl flex items-center justify-center">
                                <Search className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h2 className="text-3xl font-bold text-foreground">Agentic Literature Review</h2>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                Stop drowning in PDFs. Our agent proactively scans major databases (PubMed, biorxiv, etc.) to find papers relevant to your ongoing experiments.
                            </p>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <Sparkles className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-foreground">Semantic Search & Ranking</h3>
                                        <p className="text-sm text-muted-foreground">Finds papers based on concepts, not just keywords.</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <FileText className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-foreground">Automated Summaries</h3>
                                        <p className="text-sm text-muted-foreground">Get concise, structured summaries focused on methods and results.</p>
                                    </div>
                                </li>
                            </ul>
                        </div>
                        <div className="relative h-[400px] w-full bg-muted/50 rounded-2xl border border-border flex items-center justify-center p-8">
                            {/* Placeholder for elaborate illustration/screenshot */}
                            <div className="text-center">
                                <BookOpen className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                                <p className="text-muted-foreground font-medium">Literature Dashboard UI</p>
                                <p className="text-xs text-muted-foreground/60">(Coming Soon)</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature Deep Dive 2: ELN */}
            <section className="py-24 bg-background border-y border-border/60">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center lg:flex-row-reverse">
                        <div className="order-1 lg:order-2 space-y-6">
                            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-xl flex items-center justify-center">
                                <Database className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <h2 className="text-3xl font-bold text-foreground">Structured Lab Notebook</h2>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                Data entry that organizes itself. Notes9 captures your experimental context, automatically linking protocols, reagents, and results.
                            </p>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <GitBranch className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-foreground">Protocol Versioning</h3>
                                        <p className="text-sm text-muted-foreground">Track changes to methods over time with zero effort.</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <Share2 className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-foreground">Smart Inventory Links</h3>
                                        <p className="text-sm text-muted-foreground">Automatically decrement reagent stocks when you log usage.</p>
                                    </div>
                                </li>
                            </ul>
                        </div>
                        <div className="order-2 lg:order-1 relative h-[400px] w-full bg-muted/50 rounded-2xl border border-border flex items-center justify-center p-8">
                            {/* Placeholder */}
                            <div className="text-center">
                                <FileText className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                                <p className="text-muted-foreground font-medium">Notebook Interface UI</p>
                                <p className="text-xs text-muted-foreground/60">(Coming Soon)</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Feature Deep Dive 3: Analysis */}
            <section className="py-24 bg-card">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
                        <div className="space-y-6">
                            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-xl flex items-center justify-center">
                                <Brain className="h-6 w-6 text-green-600 dark:text-green-400" />
                            </div>
                            <h2 className="text-3xl font-bold text-foreground">AI-Powered Analysis</h2>
                            <p className="text-lg text-muted-foreground leading-relaxed">
                                Move from raw data to insights in seconds. Use natural language to query your entire lab's knowledge base.
                            </p>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <BarChart className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-foreground">Interactive Visualization</h3>
                                        <p className="text-sm text-muted-foreground">Generate publication-ready plots via chat.</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-3">
                                    <Brain className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                                    <div>
                                        <h3 className="font-semibold text-foreground">RAG Knowledge Engine</h3>
                                        <p className="text-sm text-muted-foreground">Ask "What was the optimal buffer concentration from last month's experiments?" and get an answer backed by data.</p>
                                    </div>
                                </li>
                            </ul>
                        </div>
                        <div className="relative h-[400px] w-full bg-muted/50 rounded-2xl border border-border flex items-center justify-center p-8">
                            {/* Placeholder */}
                            <div className="text-center">
                                <BarChart className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                                <p className="text-muted-foreground font-medium">Analysis Dashboard UI</p>
                                <p className="text-xs text-muted-foreground/60">(Coming Soon)</p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    )
}
