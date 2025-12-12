"use client"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { BookOpen, FileText, Code, Zap } from "lucide-react"

export default function DocsPage() {
  return (
    <div className="relative overflow-hidden py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center mb-16">
          <Badge variant="secondary" className="mb-6 text-sm font-medium">
            <BookOpen className="mr-2 h-4 w-4" />
            Documentation
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Notes9 Documentation
          </h1>

          <p className="mt-6 text-xl max-w-3xl mx-auto text-muted-foreground">
            Conceptual overviews, user guides, and integration notes for using Notes9 as an AI-enabled electronic
            lab notebook and research assistant. This space will grow as we expand our early-access deployments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card className="p-6 hover:shadow-lg transition-shadow">
            <FileText className="h-8 w-8 text-blue-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">Getting Started</h3>
            <p className="text-muted-foreground mb-4">
              Learn the core concepts behind Notes9—projects, experiments, literature workspaces, and agentic
              assistants—and see how to set up your first study, whether you are digitising a single notebook or an
              entire lab.
            </p>
            <a href="#" className="text-blue-500 hover:underline">
              Read guides →
            </a>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow">
            <Code className="h-8 w-8 text-purple-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">API & Integrations</h3>
            <p className="text-muted-foreground mb-4">
              Explore how Notes9 connects with existing systems, instruments, and data warehouses. Designed for
              research-IT teams who want to integrate ELN records, LIMS entities, or analytical data into existing
              infrastructure.
            </p>
            <a href="#" className="text-purple-500 hover:underline">
              View API docs →
            </a>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow">
            <Zap className="h-8 w-8 text-yellow-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">AI Workflows & Good Practice</h3>
            <p className="text-muted-foreground mb-4">
              Guidance on using agentic AI responsibly in the lab—from literature triage and protocol drafting to data
              summarisation and report generation—with attention to provenance, human-in-the-loop checks, and
              reproducible analysis.
            </p>
            <a href="#" className="text-yellow-500 hover:underline">
              Learn more →
            </a>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow">
            <BookOpen className="h-8 w-8 text-green-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">Tutorials</h3>
            <p className="text-muted-foreground mb-4">
              Step-by-step examples of common research scenarios—for example, linking literature to an experiment,
              analysing a dataset, preparing figures for a group meeting, or drafting a structured report directly from
              your notebook entries.
            </p>
            <a href="#" className="text-green-500 hover:underline">
              Browse tutorials →
            </a>
          </Card>
        </div>

        <div className="mt-16 text-center">
          <Card className="p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Need Help?</h2>
            <p className="text-muted-foreground mb-6">
              During the early-access phase, our team works closely with collaborators to refine both the product and
              its documentation. If you have questions about using Notes9 in your lab or integrating it with existing
              systems, please contact us.
            </p>
            <a
              href="mailto:support@notes9.com"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
            >
              Contact Support
            </a>
          </Card>
        </div>
      </div>
    </div>
  )
}
