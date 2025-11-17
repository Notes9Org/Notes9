import { redirect } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BookOpen, Plus, Search, Star } from 'lucide-react'
import Link from 'next/link'

export default async function LiteratureReviewsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch literature reviews with related data
  const { data: literatureReviews } = await supabase
    .from("literature_reviews")
    .select(`
      *,
      project:projects(id, name),
      experiment:experiments(id, name),
      created_by_profile:profiles!literature_reviews_created_by_fkey(first_name, last_name)
    `)
    .order("created_at", { ascending: false })

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      saved: "outline",
      reading: "secondary",
      completed: "default",
      archived: "outline"
    }
    return variants[status] || "outline"
  }

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-xs text-muted-foreground">Not rated</span>
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-3 w-3 ${
              i < rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            }`}
          />
        ))}
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Literature Reviews</h1>
            <p className="text-muted-foreground mt-1">
              Research papers and reference library
            </p>
          </div>
          <Button asChild>
            <Link href="/literature-reviews/new">
              <Plus className="h-4 w-4 mr-2" />
              Add Reference
            </Link>
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search literature..." className="pl-9 text-foreground" />
        </div>

        {/* Literature Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">All References</CardTitle>
            <CardDescription>
              Saved research papers and citations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {literatureReviews && literatureReviews.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[350px]">Title</TableHead>
                    <TableHead className="w-[200px]">Authors</TableHead>
                    <TableHead className="w-[150px]">Journal & Year</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[100px]">Rating</TableHead>
                    <TableHead className="w-[150px]">Linked To</TableHead>
                    <TableHead className="w-[80px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {literatureReviews.map((lit: any) => (
                    <TableRow key={lit.id}>
                      <TableCell>
                        <Link 
                          href={`/literature-reviews/${lit.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {lit.title}
                        </Link>
                        {lit.doi && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            DOI: {lit.doi}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {lit.authors ? (
                          lit.authors.split(',')[0] + (lit.authors.split(',').length > 1 ? ' et al.' : '')
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-foreground">
                        {lit.journal && lit.publication_year ? (
                          <>
                            <div className="font-medium">{lit.journal}</div>
                            <div className="text-xs text-muted-foreground">{lit.publication_year}</div>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadge(lit.status)} className="text-xs capitalize">
                          {lit.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {renderStars(lit.relevance_rating)}
                      </TableCell>
                      <TableCell>
                        {lit.project ? (
                          <Link
                            href={`/projects/${lit.project.id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {lit.project.name}
                          </Link>
                        ) : lit.experiment ? (
                          <Link
                            href={`/experiments/${lit.experiment.id}`}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {lit.experiment.name}
                          </Link>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/literature-reviews/${lit.id}`}>
                            View
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-4">No literature references yet</p>
                <Button asChild>
                  <Link href="/literature-reviews/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Reference
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}

