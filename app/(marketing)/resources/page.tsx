"use client"

import Link from "next/link"
import { ArrowRight, BookOpen, FlaskConical, LayoutDashboard, Play, Settings, TestTube2, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const features = [
    {
        title: "Projects",
        description: "Organize your research into structured projects. Learn how to create, manage, and collaborate on scientific initiatives.",
        icon: LayoutDashboard,
        demoUrl: "#",
        docsUrl: "#",
        status: "Coming Soon",
    },
    {
        title: "Experiments",
        description: "Track experimental procedures, improved status management, and real-time progress monitoring.",
        icon: FlaskConical,
        demoUrl: "#",
        docsUrl: "#",
        status: "Coming Soon",
    },
    {
        title: "Protocols",
        description: "Create and manage Standard Operating Procedures (SOPs). Version control and template management for your lab.",
        icon: FileText,
        demoUrl: "#",
        docsUrl: "#",
        status: "Coming Soon",
    },
    {
        title: "Samples",
        description: "Complete inventory management for biological samples, reagents, and chemicals with comprehensive tracking.",
        icon: TestTube2,
        demoUrl: "#",
        docsUrl: "#",
        status: "Coming Soon",
    },
    {
        title: "Lab Notes",
        description: "Digital notebook for recording daily observations, experimental data, and research notes securely.",
        icon: BookOpen,
        demoUrl: "#",
        docsUrl: "#",
        status: "Coming Soon",
    },
    {
        title: "Settings",
        description: "Configure your workspace, manage team members, and customize your lab environment preferences.",
        icon: Settings,
        demoUrl: "#",
        docsUrl: "#",
        status: "Coming Soon",
    },
]

export default function ResourcesPage() {
    return (
        <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
            {/* Hero Section */}
            <div className="text-center mb-16 space-y-4">
                <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
                    Help & Resources
                </h1>
                <p className="mx-auto max-w-2xl text-xl text-muted-foreground">
                    Guides, demos, and documentation to help you get the most out of Notes9.
                    Master every feature of your digital lab.
                </p>
            </div>

            {/* Features Grid */}
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {features.map((feature) => (
                    <Card key={feature.title} className="group overflow-hidden border-border/50 bg-background/50 backdrop-blur-sm transition-all hover:bg-muted/10 hover:border-primary/20 hover:shadow-md">
                        <CardHeader>
                            <div className="flex items-center justify-between mb-2">
                                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                                    <feature.icon className="h-6 w-6" />
                                </div>
                                {feature.status && (
                                    <Badge variant="secondary" className="text-xs">
                                        {feature.status}
                                    </Badge>
                                )}
                            </div>
                            <CardTitle className="text-xl">{feature.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <CardDescription className="text-base">
                                {feature.description}
                            </CardDescription>

                            <div className="flex gap-3 pt-2">
                                <Button variant="outline" size="sm" className="w-full gap-2" disabled>
                                    <Play className="h-4 w-4" />
                                    Watch Demo
                                </Button>
                                <Button variant="ghost" size="sm" className="w-full gap-2" disabled>
                                    <BookOpen className="h-4 w-4" />
                                    Read Guide
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Getting Started Section */}
            <div className="mt-20 rounded-2xl border border-border bg-card p-8 sm:p-12 text-center">
                <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
                <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
                    Join thousands of researchers using Notes9 to streamline their laboratory workflow.
                    Request access today to start your journey.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button size="lg" asChild>
                        <Link href="/auth/sign-up">
                            Request Access
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                        <Link href="/about">
                            Learn More
                        </Link>
                    </Button>
                </div>
            </div>
        </div>
    )
}
