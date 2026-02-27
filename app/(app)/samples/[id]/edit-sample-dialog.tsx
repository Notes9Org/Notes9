"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { Pencil } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

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

export function EditSampleDialog({ sample }: { sample: any }) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    sample_type: sample.sample_type,
    description: sample.description || "",
    source: sample.source || "",
    collection_date: sample.collection_date || "",
    storage_location: sample.storage_location || "",
    storage_condition: sample.storage_condition || "",
    quantity: sample.quantity || "",
    quantity_unit: sample.quantity_unit || "",
    status: sample.status,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const supabase = createClient()

      const { error } = await supabase
        .from("samples")
        .update({
          sample_type: formData.sample_type,
          description: formData.description || null,
          source: formData.source || null,
          collection_date: formData.collection_date || null,
          storage_location: formData.storage_location || null,
          storage_condition: formData.storage_condition || null,
          quantity: formData.quantity ? parseFloat(formData.quantity) : null,
          quantity_unit: formData.quantity_unit || null,
          status: formData.status,
        })
        .eq("id", sample.id)

      if (error) throw error

      toast({
        title: "Sample updated",
        description: "Sample information has been updated successfully.",
      })

      setOpen(false)
      
      // Force refresh to show updated data
      router.refresh()
      
      // Fallback: hard refresh after a moment if soft refresh doesn't work
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit sample">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Sample</DialogTitle>
          <DialogDescription>
            Update sample information (Sample Code cannot be changed)
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Sample Type */}
          <div className="space-y-2">
            <Label htmlFor="sample_type">Sample Type</Label>
            <Select
              value={formData.sample_type}
              onValueChange={(value) =>
                setFormData({ ...formData, sample_type: value })
              }
            >
              <SelectTrigger id="sample_type">
                <SelectValue />
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

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <TextareaWithWordCount
              id="description"
              rows={3}
              value={formData.description}
              onChange={(v) =>
                setFormData({ ...formData, description: v })
              }
              maxWords={1000}
            />
          </div>

          {/* Source & Collection Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="source">Source</Label>
              <Input
                id="source"
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

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

