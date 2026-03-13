"use client"

import { useState, useEffect } from "react"
import { useRouter } from 'next/navigation'
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft, Star } from 'lucide-react'
import Link from 'next/link'
import { toast } from "sonner"

export default function NewLiteratureReviewPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [projects, setProjects] = useState<any[]>([])
  const [experiments, setExperiments] = useState<any[]>([])
  const [filteredExperiments, setFilteredExperiments] = useState<any[]>([])
  
  const [formData, setFormData] = useState({
    title: "",
    authors: "",
    journal: "",
    publication_year: "",
    volume: "",
    issue: "",
    pages: "",
    doi: "",
    pmid: "",
    url: "",
    abstract: "",
    keywords: "",
    personal_notes: "",
    relevance_rating: 0,
    project_id: undefined as string | undefined,
    experiment_id: undefined as string | undefined,
    status: "saved",
  })

  useEffect(() => {
    fetchProjects()
    fetchExperiments()
  }, [])

  useEffect(() => {
    if (formData.project_id) {
      const filtered = experiments.filter(exp => exp.project_id === formData.project_id)
      setFilteredExperiments(filtered)
      if (formData.experiment_id && !filtered.find(e => e.id === formData.experiment_id)) {
        setFormData({ ...formData, experiment_id: undefined })
      }
    } else {
      setFilteredExperiments([])
      if (formData.experiment_id) {
        setFormData({ ...formData, experiment_id: undefined })
      }
    }
  }, [formData.project_id, experiments])

  const fetchProjects = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .order("name")
    if (data) setProjects(data)
  }

  const fetchExperiments = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from("experiments")
      .select("id, name, project_id")
      .order("name")
    if (data) setExperiments(data)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) throw new Error("Not authenticated")

      // Get user's organization
      const { data: profile } = await supabase
        .from("profiles")
        .select("organization_id")
        .eq("id", user.id)
        .single()

      const keywordsArray = formData.keywords
        ? formData.keywords.split(',').map(k => k.trim()).filter(k => k)
        : null

      const { data, error: insertError } = await supabase
        .from("literature_reviews")
        .insert({
          title: formData.title,
          authors: formData.authors || null,
          journal: formData.journal || null,
          publication_year: formData.publication_year ? parseInt(formData.publication_year) : null,
          volume: formData.volume || null,
          issue: formData.issue || null,
          pages: formData.pages || null,
          doi: formData.doi || null,
          pmid: formData.pmid || null,
          url: formData.url || null,
          abstract: formData.abstract || null,
          keywords: keywordsArray,
          personal_notes: formData.personal_notes || null,
          relevance_rating: formData.relevance_rating || null,
          project_id: formData.project_id || null,
          experiment_id: formData.experiment_id || null,
          status: formData.status,
          created_by: user.id,
          organization_id: profile?.organization_id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      toast.success("Literature reference added successfully")
      router.push(`/literature-reviews/${data.id}`)
    } catch (err: any) {
      toast.error(err.message || "Failed to add reference")
    } finally {
      setIsLoading(false)
    }
  }

  return (
      <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild className="shrink-0">
            <Link href="/literature-reviews">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Add Literature Reference</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Save a research paper or citation to your library
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Citation Details */}
          <Card>
            <CardHeader>
              <CardTitle>Citation Details</CardTitle>
              <CardDescription>
                Enter the bibliographic information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g., Novel Beta-Lactamase Inhibitors for Drug-Resistant Bacteria"
                  required
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="authors">Authors</Label>
                <Input
                  id="authors"
                  placeholder="e.g., Smith J, Johnson M, Williams K"
                  value={formData.authors}
                  onChange={(e) =>
                    setFormData({ ...formData, authors: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="journal">Journal</Label>
                  <Input
                    id="journal"
                    placeholder="e.g., Nature Medicine"
                    value={formData.journal}
                    onChange={(e) =>
                      setFormData({ ...formData, journal: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="publication_year">Year</Label>
                  <Input
                    id="publication_year"
                    type="number"
                    placeholder="2024"
                    value={formData.publication_year}
                    onChange={(e) =>
                      setFormData({ ...formData, publication_year: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="volume">Volume</Label>
                  <Input
                    id="volume"
                    placeholder="25"
                    value={formData.volume}
                    onChange={(e) =>
                      setFormData({ ...formData, volume: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="issue">Issue</Label>
                  <Input
                    id="issue"
                    placeholder="4"
                    value={formData.issue}
                    onChange={(e) =>
                      setFormData({ ...formData, issue: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pages">Pages</Label>
                  <Input
                    id="pages"
                    placeholder="123-145"
                    value={formData.pages}
                    onChange={(e) =>
                      setFormData({ ...formData, pages: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="doi">DOI</Label>
                  <Input
                    id="doi"
                    placeholder="10.1234/example.2024.123456"
                    value={formData.doi}
                    onChange={(e) =>
                      setFormData({ ...formData, doi: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pmid">PubMed ID</Label>
                  <Input
                    id="pmid"
                    placeholder="12345678"
                    value={formData.pmid}
                    onChange={(e) =>
                      setFormData({ ...formData, pmid: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="url">URL</Label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://..."
                  value={formData.url}
                  onChange={(e) =>
                    setFormData({ ...formData, url: e.target.value })
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Content & Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Content & Notes</CardTitle>
              <CardDescription>
                Add abstract, keywords, and personal notes
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="abstract">Abstract</Label>
                <Textarea
                  id="abstract"
                  placeholder="Paste or type the paper abstract..."
                  rows={4}
                  value={formData.abstract}
                  onChange={(e) =>
                    setFormData({ ...formData, abstract: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywords">Keywords (comma-separated)</Label>
                <Input
                  id="keywords"
                  placeholder="e.g., beta-lactamase, antibiotic resistance, inhibitors"
                  value={formData.keywords}
                  onChange={(e) =>
                    setFormData({ ...formData, keywords: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="personal_notes">Personal Notes</Label>
                <Textarea
                  id="personal_notes"
                  placeholder="Your thoughts, key findings, relevance to your research..."
                  rows={4}
                  value={formData.personal_notes}
                  onChange={(e) =>
                    setFormData({ ...formData, personal_notes: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Relevance Rating</Label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setFormData({ ...formData, relevance_rating: rating })}
                      className="focus:outline-none"
                    >
                      <Star
                        className={`h-6 w-6 ${
                          rating <= formData.relevance_rating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground"
                        } hover:scale-110 transition-transform`}
                      />
                    </button>
                  ))}
                  {formData.relevance_rating > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormData({ ...formData, relevance_rating: 0 })}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Link to Research */}
          <Card>
            <CardHeader>
              <CardTitle>Link to Research</CardTitle>
              <CardDescription>
                Associate this reference with your projects or experiments
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="project_id">Project (Optional)</Label>
                  <Select
                    value={formData.project_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, project_id: value })
                    }
                  >
                    <SelectTrigger id="project_id">
                      <SelectValue placeholder="Select project (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="experiment_id">Experiment (Optional)</Label>
                  <Select
                    value={formData.experiment_id}
                    onValueChange={(value) =>
                      setFormData({ ...formData, experiment_id: value })
                    }
                    disabled={!formData.project_id}
                  >
                    <SelectTrigger id="experiment_id">
                      <SelectValue placeholder={formData.project_id ? "Select experiment (optional)" : "Select project first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredExperiments.map((experiment) => (
                        <SelectItem key={experiment.id} value={experiment.id}>
                          {experiment.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Reading Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="saved">Saved</SelectItem>
                    <SelectItem value="reading">Reading</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" asChild>
              <Link href="/literature-reviews">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
              {isLoading ? "Adding..." : "Add Reference"}
            </Button>
          </div>
        </form>
      </div>
    )
}

