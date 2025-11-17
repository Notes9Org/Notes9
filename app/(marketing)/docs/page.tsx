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
            Everything you need to get started with Notes9 and maximize your research productivity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <Card className="p-6 hover:shadow-lg transition-shadow">
            <FileText className="h-8 w-8 text-blue-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">Getting Started</h3>
            <p className="text-muted-foreground mb-4">
              Learn the basics of Notes9 and set up your first project in minutes.
            </p>
            <a href="#" className="text-blue-500 hover:underline">Read guides →</a>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow">
            <Code className="h-8 w-8 text-purple-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">API Reference</h3>
            <p className="text-muted-foreground mb-4">
              Integrate Notes9 with your existing tools and workflows.
            </p>
            <a href="#" className="text-purple-500 hover:underline">View API docs →</a>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow">
            <Zap className="h-8 w-8 text-yellow-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">Best Practices</h3>
            <p className="text-muted-foreground mb-4">
              Discover tips and workflows from leading research teams.
            </p>
            <a href="#" className="text-yellow-500 hover:underline">Learn more →</a>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow">
            <BookOpen className="h-8 w-8 text-green-500 mb-4" />
            <h3 className="text-xl font-bold mb-2">Tutorials</h3>
            <p className="text-muted-foreground mb-4">
              Step-by-step guides for common research workflows.
            </p>
            <a href="#" className="text-green-500 hover:underline">Browse tutorials →</a>
          </Card>
        </div>

        <div className="mt-16 text-center">
          <Card className="p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4">Need Help?</h2>
            <p className="text-muted-foreground mb-6">
              Our team is here to help you get the most out of Notes9.
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

