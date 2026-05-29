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
import { ArrowLeft } from "lucide-react"
import { toast } from "sonner"

function NewPaperPageInner() {
  const user = useAuthUser();
  const router = useRouter()
  const { handleBack } = useCreatePageNav({
    pageLabel: "New Paper",
    listFallbackPath: "/papers",
  })
  const [title, setTitle] = useState("")
  const [projectId, setProjectId] = useState<string>("")
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search).get("project")
      if (p) setProjectId(p)
    }

    const fetchProjects = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("projects")
        .select("id, name")
        .order("name")
      setProjects(data || [])
    }
    fetchProjects()
  }, [])

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error("Please enter a paper title")
      return
    }
    if (!projectId) {
      toast.error("Please select a project")
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
          project_id: projectId,
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
              Project <span className="text-destructive">*</span>
            </Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="h-11 w-full text-base md:text-base">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id} className="text-base">
                    {p.name}
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
              disabled={isCreating || !projectId}
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
