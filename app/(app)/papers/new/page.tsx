"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
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
import Link from "next/link"
import { toast } from "sonner"
import { IS_PAPERS_MOCKED, createMockPaper, getMockProjects } from "@/lib/papers-mock"

export default function NewPaperPage() {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [projectId, setProjectId] = useState<string>("")
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    const fetchProjects = async () => {
      if (IS_PAPERS_MOCKED) {
        setProjects(getMockProjects())
        return
      }
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

    setIsCreating(true)
    try {
      if (IS_PAPERS_MOCKED) {
        const paper = createMockPaper(title.trim(), projectId || null)
        toast.success("Paper created")
        router.push(`/papers/${paper.id}`)
        return
      }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")

      const { data, error } = await supabase
        .from("papers")
        .insert({
          title: title.trim(),
          content: "",
          status: "draft",
          project_id: projectId || null,
          created_by: user.id,
        })
        .select("id")
        .single()

      if (error) throw error

      toast.success("Paper created")
      router.push(`/papers/${data.id}`)
    } catch (error) {
      console.error("Error creating paper:", error)
      toast.error("Failed to create paper")
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/papers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Paper</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Paper Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Enter paper title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project">Project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" asChild>
              <Link href="/papers">Cancel</Link>
            </Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create Paper"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
