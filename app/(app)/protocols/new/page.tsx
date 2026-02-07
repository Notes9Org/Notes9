"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
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
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, FileText } from "lucide-react"
import Link from "next/link"
import { TiptapEditor } from "@/components/text-editor/tiptap-editor"

const PROTOCOL_CATEGORIES = [
  "Sample Preparation",
  "Analysis",
  "Safety",
  "Equipment Operation",
  "Quality Control",
  "Data Processing",
  "General SOP"
]

export default function NewProtocolPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    version: "1.0",
    content: "",
    category: "",
    is_active: true,
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

      // Validate required fields
      if (!formData.name || !formData.content) {
        throw new Error("Protocol name and content are required")
      }

      const { data, error: insertError } = await supabase
        .from("protocols")
        .insert({
          organization_id: profile?.organization_id,
          name: formData.name,
          description: formData.description || null,
          version: formData.version,
          content: formData.content,
          category: formData.category || null,
          is_active: formData.is_active,
          created_by: user.id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      router.push("/protocols")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/protocols">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Create New Protocol</h1>
            <p className="text-muted-foreground mt-1">
              Add a new Standard Operating Procedure (SOP)
            </p>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Protocol Information
            </CardTitle>
            <CardDescription>
              Fill in the details below to create a new protocol
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Protocol Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., Standard Crystallization Protocol"
                  required
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              {/* Version & Category */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    placeholder="1.0"
                    value={formData.version}
                    onChange={(e) =>
                      setFormData({ ...formData, version: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) =>
                      setFormData({ ...formData, category: value })
                    }
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROTOCOL_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Brief Description</Label>
                <TextareaWithWordCount
                  id="description"
                  placeholder="Brief overview of the protocol..."
                  rows={2}
                  value={formData.description}
                  onChange={(v) =>
                    setFormData({ ...formData, description: v })
                  }
                  maxWords={1000}
                />
              </div>

              {/* Content */}
              <div className="space-y-2">
                <Label htmlFor="content">
                  Protocol Content <span className="text-destructive">*</span>
                </Label>
                <TiptapEditor
                  content={formData.content}
                  onChange={(content) =>
                    setFormData({ ...formData, content })
                  }
                  placeholder="Write the detailed protocol steps here..."
                  title={formData.name || "protocol"}
                  minHeight="400px"
                  showAITools={true}
                />
              </div>

              {/* Active Status */}
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="is_active" className="cursor-pointer">
                    Active Protocol
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Make this protocol available for use in experiments
                  </p>
                </div>
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
              </div>

              {/* Error Message */}
              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/protocols")}
                  data-navigate
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Protocol"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    )
}
