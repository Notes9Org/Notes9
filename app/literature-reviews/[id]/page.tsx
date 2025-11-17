import { redirect, notFound } from 'next/navigation'
import { createClient } from "@/lib/supabase/server"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BookOpen, Calendar, Star, ExternalLink, Link as LinkIcon } from 'lucide-react'
import Link from 'next/link'
import { LiteratureReviewActions } from './literature-review-actions'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

export default async function LiteratureReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect("/auth/login")
  }

  // Fetch literature review details
  const { data: literature, error } = await supabase
    .from("literature_reviews")
    .select(`
      *,
      created_by_profile:profiles!literature_reviews_created_by_fkey(
        first_name,
        last_name,
        email
      ),
      project:projects(id, name),
      experiment:experiments(id, name)
    `)
    .eq("id", id)
    .single()

  if (error || !literature) {
    notFound()
  }

  const formatDate = (date: string | null) => {
    if (!date) return "—"
    return new Date(date).toLocaleDateString()
  }

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
    if (!rating) return <span className="text-sm text-muted-foreground">Not rated</span>
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i < rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"
            }`}
          />
        ))}
      </div>
    )
  }

  const formatCitation = (format: 'apa' | 'mla' | 'bibtex') => {
    const authors = literature.authors || 'Unknown'
    const year = literature.publication_year || 'n.d.'
    const title = literature.title
    const journal = literature.journal || ''
    const volume = literature.volume || ''
    const issue = literature.issue || ''
    const pages = literature.pages || ''
    const doi = literature.doi || ''

    if (format === 'apa') {
      let citation = `${authors} (${year}). ${title}.`
      if (journal) citation += ` ${journal}`
      if (volume) citation += `, ${volume}`
      if (issue) citation += `(${issue})`
      if (pages) citation += `, ${pages}`
      if (doi) citation += `. https://doi.org/${doi}`
      return citation
    } else if (format === 'mla') {
      let citation = `${authors}. "${title}."`
      if (journal) citation += ` ${journal}`
      if (volume) citation += `, vol. ${volume}`
      if (issue) citation += `, no. ${issue}`
      if (year) citation += `, ${year}`
      if (pages) citation += `, pp. ${pages}`
      return citation + '.'
    } else if (format === 'bibtex') {
      const bibKey = authors.split(',')[0].toLowerCase() + year
      return `@article{${bibKey},
  author = {${authors}},
  title = {${title}},
  journal = {${journal}},
  year = {${year}},
  volume = {${volume}},
  number = {${issue}},
  pages = {${pages}},
  doi = {${doi}}
}`
    }
    return ''
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/literature-reviews">Literature Reviews</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{literature.title.substring(0, 50)}...</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">
                  {literature.title}
                </h1>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant={getStatusBadge(literature.status)} className="capitalize">
                  {literature.status}
                </Badge>
                {renderStars(literature.relevance_rating)}
              </div>
            </div>
          </div>
          <LiteratureReviewActions literature={literature} />
        </div>

        {/* Quick Info Cards */}
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Authors
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground line-clamp-1">
                  {literature.authors ? literature.authors.split(',')[0] + ' et al.' : '—'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Journal & Year
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {literature.journal || '—'} ({literature.publication_year || '—'})
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                DOI/PMID
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {literature.doi ? `DOI: ${literature.doi.substring(0, 20)}...` : literature.pmid ? `PMID: ${literature.pmid}` : '—'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="py-2">
            <CardHeader className="pb-1 pt-2 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Added
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {formatDate(literature.created_at)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="citation">Citation</TabsTrigger>
            <TabsTrigger value="linked">Linked Research</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Citation Details */}
            <Card>
              <CardHeader>
                <CardTitle>Citation Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Authors</p>
                    <p className="text-sm text-foreground">{literature.authors || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Journal</p>
                    <p className="text-sm text-foreground">{literature.journal || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Year</p>
                    <p className="text-sm text-foreground">{literature.publication_year || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Volume/Issue</p>
                    <p className="text-sm text-foreground">
                      {literature.volume && literature.issue ? `${literature.volume}(${literature.issue})` : literature.volume || literature.issue || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Pages</p>
                    <p className="text-sm text-foreground">{literature.pages || '—'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">DOI</p>
                    {literature.doi ? (
                      <a 
                        href={`https://doi.org/${literature.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                      >
                        {literature.doi}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <p className="text-sm text-foreground">—</p>
                    )}
                  </div>
                </div>
                {literature.url && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">URL</p>
                    <a 
                      href={literature.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      {literature.url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Abstract */}
            {literature.abstract && (
              <Card>
                <CardHeader>
                  <CardTitle>Abstract</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{literature.abstract}</p>
                </CardContent>
              </Card>
            )}

            {/* Keywords */}
            {literature.keywords && literature.keywords.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Keywords</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {literature.keywords.map((keyword: string, index: number) => (
                      <Badge key={index} variant="secondary">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Personal Notes */}
            {literature.personal_notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Personal Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{literature.personal_notes}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="citation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>APA Format</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="text-sm text-foreground block bg-muted p-4 rounded">
                  {formatCitation('apa')}
                </code>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>MLA Format</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="text-sm text-foreground block bg-muted p-4 rounded">
                  {formatCitation('mla')}
                </code>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>BibTeX</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm text-foreground block bg-muted p-4 rounded overflow-x-auto">
                  {formatCitation('bibtex')}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="linked" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Linked Research</CardTitle>
                <CardDescription>
                  Projects and experiments using this reference
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {literature.project ? (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Project</p>
                    <Link
                      href={`/projects/${literature.project.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {literature.project.name}
                    </Link>
                  </div>
                ) : null}

                {literature.experiment ? (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">Experiment</p>
                    <Link
                      href={`/experiments/${literature.experiment.id}`}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      {literature.experiment.name}
                    </Link>
                  </div>
                ) : null}

                {!literature.project && !literature.experiment && (
                  <p className="text-sm text-muted-foreground">
                    This reference is not linked to any projects or experiments yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  )
}

