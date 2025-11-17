"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AppLayout } from "@/components/layout/app-layout"
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
import { ArrowLeft, TestTube } from "lucide-react"
import Link from "next/link"

const SAMPLE_TYPES = [
  "Chemical",
  "Biological",
  "Tissue",
  "Blood",
  "DNA",
  "RNA",
  "Protein",
  "Cell Culture",
  "Other"
]

const QUANTITY_UNITS = ["μL", "mL", "L", "μg", "mg", "g", "kg", "units", "items"]

const STORAGE_CONDITIONS = [
  "Room Temperature",
  "4°C",
  "-20°C",
  "-80°C",
  "Liquid Nitrogen",
  "Desiccated",
  "Other"
]

const STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "in_use", label: "In Use" },
  { value: "depleted", label: "Depleted" },
  { value: "disposed", label: "Disposed" }
]

export default function NewSamplePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [experiments, setExperiments] = useState<any[]>([])
  
  const [formData, setFormData] = useState({
    experiment_id: "",
    sample_code: "",
    sample_type: "",
    description: "",
    source: "",
    collection_date: "",
    storage_location: "",
    storage_condition: "",
    quantity: "",
    quantity_unit: "",
    status: "available",
  })

  useEffect(() => {
    fetchExperiments()
  }, [])

  const fetchExperiments = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("experiments")
        .select("id, name, project:projects(name)")
        .order("created_at", { ascending: false })
      
      if (error) throw error
      setExperiments(data || [])
    } catch (err: any) {
      console.error("Error fetching experiments:", err)
    }
  }

  const generateSampleCode = () => {
    const year = new Date().getFullYear()
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
    return `SMP-${year}-${random}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) throw new Error("Not authenticated")

      // Validate required fields
      if (!formData.sample_code || !formData.sample_type) {
        throw new Error("Sample code and type are required")
      }

      const { data, error: insertError } = await supabase
        .from("samples")
        .insert({
          experiment_id: formData.experiment_id || null,
          sample_code: formData.sample_code,
          sample_type: formData.sample_type,
          description: formData.description || null,
          source: formData.source || null,
          collection_date: formData.collection_date || null,
          storage_location: formData.storage_location || null,
          storage_condition: formData.storage_condition || null,
          quantity: formData.quantity ? parseFloat(formData.quantity) : null,
          quantity_unit: formData.quantity_unit || null,
          status: formData.status,
          created_by: user.id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      router.push("/samples")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/samples">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Add New Sample</h1>
            <p className="text-muted-foreground mt-1">
              Register a new sample in the inventory
            </p>
          </div>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Sample Information
            </CardTitle>
            <CardDescription>
              Fill in the details below to register a new sample
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Sample Code & Type */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sample_code">
                    Sample Code <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="sample_code"
                      placeholder="SMP-2025-0001"
                      required
                      value={formData.sample_code}
                      onChange={(e) =>
                        setFormData({ ...formData, sample_code: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setFormData({ ...formData, sample_code: generateSampleCode() })
                      }
                    >
                      Generate
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sample_type">
                    Sample Type <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.sample_type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, sample_type: value })
                    }
                  >
                    <SelectTrigger id="sample_type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {SAMPLE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Experiment */}
              <div className="space-y-2">
                <Label htmlFor="experiment_id">Associated Experiment</Label>
                <Select
                  value={formData.experiment_id}
                  onValueChange={(value) =>
                    setFormData({ ...formData, experiment_id: value })
                  }
                >
                  <SelectTrigger id="experiment_id">
                    <SelectValue placeholder="Select experiment (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {experiments.map((exp) => (
                      <SelectItem key={exp.id} value={exp.id}>
                        {exp.name}
                        {exp.project && ` - ${exp.project.name}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of the sample..."
                  rows={3}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </div>

              {/* Source & Collection Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="source">Source</Label>
                  <Input
                    id="source"
                    placeholder="e.g., Patient ID, Supplier, etc."
                    value={formData.source}
                    onChange={(e) =>
                      setFormData({ ...formData, source: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="collection_date">Collection Date</Label>
                  <Input
                    id="collection_date"
                    type="date"
                    value={formData.collection_date}
                    onChange={(e) =>
                      setFormData({ ...formData, collection_date: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Storage Location & Condition */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="storage_location">Storage Location</Label>
                  <Input
                    id="storage_location"
                    placeholder="e.g., Freezer B-12, Shelf A3"
                    value={formData.storage_location}
                    onChange={(e) =>
                      setFormData({ ...formData, storage_location: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="storage_condition">Storage Condition</Label>
                  <Select
                    value={formData.storage_condition}
                    onValueChange={(value) =>
                      setFormData({ ...formData, storage_condition: value })
                    }
                  >
                    <SelectTrigger id="storage_condition">
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      {STORAGE_CONDITIONS.map((condition) => (
                        <SelectItem key={condition} value={condition}>
                          {condition}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quantity & Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 250"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity: e.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity_unit">Unit</Label>
                  <Select
                    value={formData.quantity_unit}
                    onValueChange={(value) =>
                      setFormData({ ...formData, quantity_unit: value })
                    }
                  >
                    <SelectTrigger id="quantity_unit">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {QUANTITY_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
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
                    {STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  onClick={() => router.push("/samples")}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Sample"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
