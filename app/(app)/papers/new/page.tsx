"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useCreatePageNav } from "@/hooks/use-create-page-nav"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft } from "@phosphor-icons/react/ssr"
import { toast } from "sonner"
import { useProjectScope } from "@/contexts/project-scope-context"

function NewPaperPageInner() {
  const user = useAuthUser();
  const router = useRouter()
  const scope = useProjectScope()
  const { handleBack } = useCreatePageNav({
    pageLabel: "New Paper",
    listFallbackPath: "/papers",
  })
  const [title, setTitle] = useState("")
  const [projectId, setProjectId] = useState<string>("")
  const [experimentId, setExperimentId] = useState<string>("")
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [experiments, setExperiments] = useState<
    { id: string; name: string; project_id: string | null }[]
  >([])
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    // Prefill from the URL param first, else the sidebar context, both are
    // just prefills: project and experiment stay OPTIONAL and editable here.
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("project")
      if (p) setProjectId(p)
      else if (scope.projectId) setProjectId(scope.projectId)
    }

    const fetchOptions = async () => {
      const supabase = createClient()
      const [projectsRes, experimentsRes] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("experiments").select("id, name, project_id").order("name"),
      ])
      setProjects(projectsRes.data || [])
      setExperiments(experimentsRes.data || [])
    }
    fetchOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prefill once on mount
  }, [])

  // Prefill the experiment from the sidebar's pinned experiment when it
  // belongs to the selected project.
  useEffect(() => {
    if (experimentId || !scope.pinnedExperimentId || experiments.length === 0) return
    const pinned = experiments.find((e) => e.id === scope.pinnedExperimentId)
    if (pinned && (!projectId || pinned.project_id === projectId)) {
      setExperimentId(pinned.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot prefill once options load
  }, [experiments, scope.pinnedExperimentId])

  // Keep the experiment consistent with the selected project.
  useEffect(() => {
    if (!experimentId) return
    const exp = experiments.find((e) => e.id === experimentId)
    if (projectId && exp && exp.project_id !== projectId) setExperimentId("")
  }, [projectId, experimentId, experiments])

  const experimentOptions = projectId
    ? experiments.filter((e) => e.project_id === projectId)
    : experiments

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Please enter a paper title")
      return
    }

    setIsCreating(true)
    try {
      const supabase = createClient()
      if (!user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("papers")
        .insert({
          title: title.trim(),
          content: "",
          status: "draft",
          project_id: projectId || null,
          experiment_id: experimentId || null,
          created_by: user.id,
        })
        .select("id")
        .single()

      if (error) throw error

      toast.success("Paper created")
      router.push(`/papers/${data.id}`)
    } catch (error: unknown) {
      console.error("Error creating paper:", error)
      const msg =
        error && typeof error === "object" && "message" in error
          ? String((error as { message: string }).message)
          : "Failed to create paper"
      toast.error(msg)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 md:space-y-8 md:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">New Paper</h1>
      </div>

      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">Paper Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-base">
          <div className="space-y-2.5">
            <Label htmlFor="title" className="text-base">
              Title
            </Label>
            <Input
              id="title"
              placeholder="Enter paper title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
              className="h-11 text-base md:text-base"
            />
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="project" className="text-base">
              Project (optional)
            </Label>
            <Select
              value={projectId || "none"}
              onValueChange={(v) => setProjectId(v === "none" ? "" : v)}
            >
              <SelectTrigger className="h-11 w-full text-base md:text-base">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-base">
                  No project
                </SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-base">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="experiment" className="text-base">
              Experiment (optional)
            </Label>
            <Select
              value={experimentId || "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  setExperimentId("")
                  return
                }
                setExperimentId(v)
                const exp = experiments.find((e) => e.id === v)
                if (exp?.project_id) setProjectId(exp.project_id)
              }}
            >
              <SelectTrigger className="h-11 w-full text-base md:text-base">
                <SelectValue placeholder="Select an experiment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-base">
                  No experiment
                </SelectItem>
                {experimentOptions.map((e) => (
                  <SelectItem key={e.id} value={e.id} className="text-base">
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              size="lg"
              className="text-base"
              type="button"
              onClick={handleBack}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className="text-base"
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Create Paper"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function NewPaperPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <NewPaperPageInner />
    </Suspense>
  )
}
