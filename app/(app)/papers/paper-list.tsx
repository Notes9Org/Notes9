"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileText, Calendar } from "lucide-react"

interface Paper {
  id: string
  title: string
  status: string
  updated_at: string
  created_at: string
  project?: { id: string; name: string } | null
  created_by_profile?: { first_name: string; last_name: string } | null
}

export function PaperList({ papers }: { papers: Paper[] }) {
  if (papers.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No papers yet</h3>
          <p className="text-sm text-muted-foreground">
            Create your first research paper to get started.
          </p>
        </CardContent>
      </Card>
    )
  }

  const statusColor = (status: string) => {
    switch (status) {
      case "draft": return "outline"
      case "in_review": return "default"
      case "published": return "success" as any
      default: return "outline"
    }
  }

  return (
    <div className="grid gap-4">
      {papers.map((paper) => (
        <Link key={paper.id} href={`/papers/${paper.id}`}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{paper.title}</CardTitle>
                <Badge variant={statusColor(paper.status)}>
                  {paper.status?.replace("_", " ")}
                </Badge>
              </div>
              {paper.project && (
                <CardDescription>{paper.project.name}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Updated {new Date(paper.updated_at).toLocaleDateString()}
                </span>
                {paper.created_by_profile && (
                  <span>
                    {paper.created_by_profile.first_name} {paper.created_by_profile.last_name}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
