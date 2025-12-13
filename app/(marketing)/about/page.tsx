"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Crosshair, Trophy, MapPin, Send, School, FlaskConical, Target } from "lucide-react"

export default function AboutPage() {
  return (
    <div className="bg-background min-h-screen">
      {/* Subtle Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:14px_24px] pointer-events-none h-[500px] mask-gradient-to-b from-black to-transparent"></div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10 py-16 sm:py-24">
        {/* Hero Section */}
        <div className="mx-auto max-w-4xl text-center mb-20">
          <Badge variant="outline" className="mb-6 text-sm font-medium border-primary/20 bg-primary/5 text-primary">
            <Users className="mr-2 h-4 w-4" />
            About Notes9
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl text-balance mb-6">
            Agentic AI for <span className="text-primary">Scientific Research</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-3xl mx-auto text-pretty font-light leading-relaxed">
            Notes9 is an AI-native electronic lab notebook that unifies experimental records, inventory management, literature, and analysis in a single, structured workspace.
          </p>
        </div>

        {/* Mission & Vision */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-20">
          <Card className="border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Target className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle>Our Mission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                To design an AI-augmented research environment that reduces manual overhead, strengthens reproducibility, and helps scientists move from hypothesis to robust results with fewer fragmented tools.
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <FlaskConical className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle>Our Vision</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                We envision every research group working alongside an AI assistant that understands their projects, preserves institutional knowledge, and provides transparent support across the entire discovery lifecycle.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Company Story */}
        <div className="mb-20 max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground">Our Story</h2>
          </div>
          <div className="prose prose-lg dark:prose-invert mx-auto text-muted-foreground">
            <p className="mb-4">
              Notes9 emerged directly from the day-to-day experience of working in academic and industrial laboratories. As bench scientists and data scientists, we repeatedly encountered the same pattern: project-critical knowledge scattered across paper notebooks, PDFs, and ad-hoc spreadsheets.
            </p>
            <p className="mb-4">
              Conventional ELNs improved record-keeping but did little to help researchers reason with their data. Generic LLMs showed promise but lacked the domain awareness required for serious rigor.
            </p>
            <p>
              Notes9 is our response: an agentic AI layer built on top of a structured research workspace, designed to assist with literature triage, experiment design, data curation, and analysis—while preserving clear provenance and oversight.
            </p>
          </div>
        </div>

        {/* Team Summary for Investors */}
        <div className="mb-20">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-4">Our Team</h2>
          </div>
          <Card className="border-border/60 bg-card/50 max-w-4xl mx-auto">
            <CardContent className="p-8 sm:p-12">
              <p className="text-lg text-muted-foreground leading-relaxed text-center">
                We are a multidisciplinary team of scientists and engineers with deep expertise bridging pharmaceutical sciences, artificial intelligence, and enterprise software development.
              </p>
              <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-center border-t border-border pt-8">
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Scientific Rigor</h3>
                  <p className="text-sm text-muted-foreground">Backgrounds in PBPK modeling, vaccine development, and translational research from institutions like Oxford, UCL, and University at Buffalo.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Technical Excellence</h3>
                  <p className="text-sm text-muted-foreground">Experience building scalable SaaS platforms, agentic AI systems, and secure data infrastructure for regulated industries.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-2">Domain Focus</h3>
                  <p className="text-sm text-muted-foreground">Combined experience in formulation science, clinical data extraction, and health economics strategy.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Contact */}
        <div className="text-center">
          <div className="p-8 border border-border rounded-xl bg-muted/30 max-w-2xl mx-auto">
            <div className="flex items-center justify-center mb-4">
              <Send className="h-6 w-6 text-primary mr-3" />
              <h2 className="text-2xl font-semibold text-foreground">Get in Touch</h2>
            </div>
            <p className="text-muted-foreground mb-6">
              Notes9 is currently in an early-access phase. We are actively seeking design partner labs and investment opportunities.
            </p>
            <div className="flex items-center justify-center space-x-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span className="text-sm">Distributed team · United States & United Kingdom</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
