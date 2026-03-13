"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from "@/lib/supabase/client"
import { useSmartBack } from "@/hooks/use-smart-back"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RichTextEditor } from "@/components/rich-text-editor"
import { countWordsFromHtml } from "@/components/ui/textarea-with-word-count"
import { cn } from "@/lib/utils"
import { ArrowLeft } from 'lucide-react'
import { getUniqueNameErrorMessage } from "@/lib/unique-name-error"

function NewExperimentForm() {
  const router = useRouter()
  const handleBack = useSmartBack("/experiments")
  const searchParams = useSearchParams()
  const projectId = searchParams.get('project')
  
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [protocols, setProtocols] = useState<any[]>([])
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    project_id: projectId || "",
    protocol_id: "",
    status: "planned",
    start_date: "",
    completion_date: "",
  })

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      
      // Fetch projects - remove status filter to show all projects
      const { data: projectsData, error: projectsError } = await supabase
        .from("projects")
        .select("id, name, status")
        .order("name")
      
      // Fetch protocols
      const { data: protocolsData, error: protocolsError } = await supabase
        .from("protocols")
        .select("id, name")
        .eq("is_active", true)
        .order("name")
      
      if (projectsError) console.error("Error fetching projects:", projectsError)
      if (protocolsError) console.error("Error fetching protocols:", protocolsError)
      
      if (projectsData) setProjects(projectsData)
      if (protocolsData) setProtocols(protocolsData)
    }
    
    fetchData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const descWords = countWordsFromHtml(formData.description)
    if (descWords > 1000) {
      setError(`Description must be 1000 words or fewer (currently ${descWords} words).`)
      return
    }
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) throw new Error("Not authenticated")

      const { data, error: insertError } = await supabase
        .from("experiments")
        .insert({
          name: formData.name,
          description: formData.description,
          project_id: formData.project_id,
          status: formData.status,
          start_date: formData.start_date || null,
          completion_date: formData.completion_date || null,
          assigned_to: user.id,
          created_by: user.id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // If a protocol was selected, link it through experiment_protocols table
      if (formData.protocol_id) {
        const { error: protocolError } = await supabase
          .from("experiment_protocols")
          .insert({
            experiment_id: data.id,
            protocol_id: formData.protocol_id,
          })
        
        if (protocolError) console.error("Error linking protocol:", protocolError)
      }

      router.push(`/experiments/${data.id}`)
    } catch (err: any) {
      setError(getUniqueNameErrorMessage(err, "experiment"))
    } finally {
      setIsLoading(false)
    }
  }

  return (
      <div className="max-w-3xl mx-auto space-y-4 md:space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground md:text-3xl">Create New Experiment</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Design and configure your experimental procedure
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">Experiment Details</CardTitle>
            <CardDescription>
              Enter the information about your experiment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-foreground">Experiment Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Protein Crystallization - Batch #47"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="text-foreground"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="project_id" className="text-foreground">Project *</Label>
                <Select
                  value={formData.project_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, project_id: value })
                  }
                  required
                >
                  <SelectTrigger id="project_id">
                    <SelectValue placeholder="Select a project" />
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
                <Label htmlFor="description" className="text-foreground">Description</Label>
                <RichTextEditor
                  content={formData.description}
                  onChange={(content) => setFormData({ ...formData, description: content })}
                  placeholder="Describe the experiment methodology, objectives, and expected outcomes..."
                  className="text-foreground"
                />
                <p
                  className={cn(
                    "text-right text-xs tabular-nums",
                    countWordsFromHtml(formData.description) > 1000
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {countWordsFromHtml(formData.description)} / 1000 words
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="protocol_id" className="text-foreground">Protocol (Optional)</Label>
                <Select
                  value={formData.protocol_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, protocol_id: value })
                  }
                >
                  <SelectTrigger id="protocol_id">
                    <SelectValue placeholder="Select a protocol" />
                  </SelectTrigger>
                  <SelectContent>
                    {protocols.map((protocol) => (
                      <SelectItem key={protocol.id} value={protocol.id}>
                        {protocol.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status" className="text-foreground">Status</Label>
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
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="data_ready">Data Ready</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="start_date" className="text-foreground">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) =>
                      setFormData({ ...formData, start_date: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="completion_date" className="text-foreground">Expected End Date</Label>
                <Input
                  id="completion_date"
                  type="date"
                  value={formData.completion_date}
                  onChange={(e) =>
                    setFormData({ ...formData, completion_date: e.target.value })
                  }
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                  {isLoading ? "Creating..." : "Create Experiment"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
}

export default function NewExperimentPage() {
  return (
    <Suspense fallback={
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-md bg-muted animate-pulse" />
          <div className="space-y-2 flex-1">
            <div className="h-8 w-64 bg-muted animate-pulse rounded" />
            <div className="h-4 w-96 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-72 bg-muted animate-pulse rounded mt-2" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="h-20 w-full bg-muted animate-pulse rounded" />
            <div className="h-20 w-full bg-muted animate-pulse rounded" />
            <div className="h-32 w-full bg-muted animate-pulse rounded" />
          </CardContent>
        </Card>
      </div>
    }>
      <NewExperimentForm />
    </Suspense>
  )
}
