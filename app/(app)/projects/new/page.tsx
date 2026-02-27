"use client"

import { useState } from "react"
import { useRouter } from 'next/navigation'
import { createClient } from "@/lib/supabase/client"
import { useSmartBack } from "@/hooks/use-smart-back"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TextareaWithWordCount } from "@/components/ui/textarea-with-word-count"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArrowLeft } from 'lucide-react'
import { getUniqueNameErrorMessage } from "@/lib/unique-name-error"

export default function NewProjectPage() {
  const router = useRouter()
  const handleBack = useSmartBack("/projects")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    priority: "medium",
    start_date: "",
    end_date: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

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

      const { data, error: insertError } = await supabase
        .from("projects")
        .insert({
          name: formData.name,
          description: formData.description,
          status: "planning",
          priority: formData.priority,
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          created_by: user.id,
          organization_id: profile?.organization_id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Add creator as project member
      await supabase.from("project_members").insert({
        project_id: data.id,
        user_id: user.id,
        role: "lead",
      })

      router.push(`/projects/${data.id}`)
    } catch (err: any) {
      setError(getUniqueNameErrorMessage(err, "project"))
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
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Create New Project</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Set up a new research initiative
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
            <CardDescription>
              Enter the basic information about your research project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Cancer Drug Discovery Initiative"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <TextareaWithWordCount
                  id="description"
                  placeholder="Describe the project goals, scope, and expected outcomes..."
                  rows={4}
                  value={formData.description}
                  onChange={(v) =>
                    setFormData({ ...formData, description: v })
                  }
                  maxWords={1000}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value) =>
                      setFormData({ ...formData, priority: value })
                    }
                  >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) =>
                      setFormData({ ...formData, start_date: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end_date">Target End Date</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) =>
                      setFormData({ ...formData, end_date: e.target.value })
                    }
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button type="submit" disabled={isLoading} className="w-full sm:w-auto">
                  {isLoading ? "Creating..." : "Create Project"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
}
