"use client"

import { useMemo, useState } from "react"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Pencil } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { formatSampleTags, parseTagInput } from "@/lib/sample-molecular"
import { replaceSampleContextLinks } from "@/lib/sample-context"
import { SampleContextPicker, type SampleLinkOption } from "../sample-context-picker"

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

type EditSampleDialogProps = {
  sample: any
  allProjects?: SampleLinkOption[]
  allExperiments?: SampleLinkOption[]
  allLabNotes?: SampleLinkOption[]
  linkedProjectIds?: string[]
  linkedExperimentIds?: string[]
  linkedLabNoteIds?: string[]
}

export function EditSampleDialog({
  sample,
  allProjects = [],
  allExperiments = [],
  allLabNotes = [],
  linkedProjectIds = [],
  linkedExperimentIds = [],
  linkedLabNoteIds = [],
}: EditSampleDialogProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [projectIds, setProjectIds] = useState<string[]>(linkedProjectIds)
  const [experimentIds, setExperimentIds] = useState<string[]>(linkedExperimentIds)
  const [labNoteIds, setLabNoteIds] = useState<string[]>(linkedLabNoteIds)
  const [jsonError, setJsonError] = useState<string | null>(null)

  const filteredExperiments = useMemo(() => {
    if (projectIds.length === 0) return allExperiments
    return allExperiments.filter((e) => !e.project_id || projectIds.includes(e.project_id))
  }, [allExperiments, projectIds])
  
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
    barcode: sample.barcode || "",
    external_id: sample.external_id || "",
    organism: sample.organism || "",
    strain: sample.strain || "",
    genotype: sample.genotype || "",
    supplier: sample.supplier || "",
    catalog_number: sample.catalog_number || "",
    lot_number: sample.lot_number || "",
    concentration: sample.concentration || "",
    concentration_unit: sample.concentration_unit || "",
    purity: sample.purity || "",
    container_type: sample.container_type || "",
    box_position: sample.box_position || "",
    expiry_date: sample.expiry_date || "",
    hazard_class: sample.hazard_class || "",
    biosafety_level: sample.biosafety_level || "",
  })
  const [tagText, setTagText] = useState(formatSampleTags(sample.tags))
  const [customMetadataText, setCustomMetadataText] = useState(
    sample.custom_metadata && Object.keys(sample.custom_metadata).length > 0
      ? JSON.stringify(sample.custom_metadata, null, 2)
      : ""
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setJsonError(null)

    try {
      const supabase = createClient()
      let custom_metadata: Record<string, any> = {}
      if (customMetadataText.trim()) {
        try {
          const parsed = JSON.parse(customMetadataText)
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Custom metadata must be a JSON object.")
          }
          custom_metadata = parsed
        } catch (err) {
          const message = err instanceof Error ? err.message : "Invalid JSON"
          setJsonError(message)
          throw new Error(`Custom metadata: ${message}`)
        }
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()

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
          barcode: formData.barcode || null,
          external_id: formData.external_id || null,
          organism: formData.organism || null,
          strain: formData.strain || null,
          genotype: formData.genotype || null,
          supplier: formData.supplier || null,
          catalog_number: formData.catalog_number || null,
          lot_number: formData.lot_number || null,
          concentration: formData.concentration ? parseFloat(formData.concentration) : null,
          concentration_unit: formData.concentration_unit || null,
          purity: formData.purity || null,
          container_type: formData.container_type || null,
          box_position: formData.box_position || null,
          expiry_date: formData.expiry_date || null,
          hazard_class: formData.hazard_class || null,
          biosafety_level: formData.biosafety_level || null,
          tags: parseTagInput(tagText),
          custom_metadata,
        })
        .eq("id", sample.id)

      if (error) throw error

      if (user) {
        try {
          await replaceSampleContextLinks(supabase, {
            sampleId: sample.id,
            userId: user.id,
            projectIds,
            experimentIds,
            labNoteIds,
          })
        } catch (linkError) {
          console.warn("Could not update sample context links", linkError)
        }
      }

      toast({
        title: "Sample updated",
        description: "Sample information has been updated successfully.",
      })

      setOpen(false)
      router.refresh()
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
        <Button variant="ghost" size="icon-sm" aria-label="Edit sample">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Sample</DialogTitle>
          <DialogDescription>
            Update sample information (Sample Code cannot be changed)
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <EditField id="barcode" label="Barcode" value={formData.barcode} onChange={(value) => setFormData({ ...formData, barcode: value })} />
            <EditField id="external_id" label="External ID" value={formData.external_id} onChange={(value) => setFormData({ ...formData, external_id: value })} />
            <EditField id="organism" label="Organism" value={formData.organism} onChange={(value) => setFormData({ ...formData, organism: value })} />
            <EditField id="strain" label="Strain" value={formData.strain} onChange={(value) => setFormData({ ...formData, strain: value })} />
            <EditField id="genotype" label="Genotype" value={formData.genotype} onChange={(value) => setFormData({ ...formData, genotype: value })} />
            <EditField id="supplier" label="Supplier" value={formData.supplier} onChange={(value) => setFormData({ ...formData, supplier: value })} />
            <EditField id="catalog_number" label="Catalog Number" value={formData.catalog_number} onChange={(value) => setFormData({ ...formData, catalog_number: value })} />
            <EditField id="lot_number" label="Lot Number" value={formData.lot_number} onChange={(value) => setFormData({ ...formData, lot_number: value })} />
            <EditField id="purity" label="Purity" value={formData.purity} onChange={(value) => setFormData({ ...formData, purity: value })} />
            <EditField id="hazard_class" label="Hazard Class" value={formData.hazard_class} onChange={(value) => setFormData({ ...formData, hazard_class: value })} />
            <EditField id="biosafety_level" label="Biosafety Level" value={formData.biosafety_level} onChange={(value) => setFormData({ ...formData, biosafety_level: value })} />
            <EditField id="expiry_date" label="Expiry Date" type="date" value={formData.expiry_date} onChange={(value) => setFormData({ ...formData, expiry_date: value })} />
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <EditField id="concentration" label="Concentration" type="number" step="0.01" value={formData.concentration} onChange={(value) => setFormData({ ...formData, concentration: value })} />
            <EditField id="concentration_unit" label="Concentration Unit" value={formData.concentration_unit} onChange={(value) => setFormData({ ...formData, concentration_unit: value })} />
            <EditField id="container_type" label="Container Type" value={formData.container_type} onChange={(value) => setFormData({ ...formData, container_type: value })} />
            <EditField id="box_position" label="Box Position" value={formData.box_position} onChange={(value) => setFormData({ ...formData, box_position: value })} />
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

          <div className="space-y-2">
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" value={tagText} onChange={(event) => setTagText(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom_metadata">Custom Metadata JSON</Label>
            <Textarea
              id="custom_metadata"
              value={customMetadataText}
              onChange={(event) => {
                setCustomMetadataText(event.target.value)
                setJsonError(null)
              }}
              className="min-h-28 font-mono text-xs"
              spellCheck={false}
              aria-invalid={Boolean(jsonError)}
            />
            {jsonError ? (
              <p className="text-xs text-destructive">{jsonError}</p>
            ) : null}
          </div>

          {(allProjects.length > 0 || allExperiments.length > 0 || allLabNotes.length > 0) && (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Linked context</h3>
                <p className="text-xs text-muted-foreground">
                  Update which projects, experiments, and lab notes this sample is linked to.
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">
                <SampleContextPicker
                  label="Projects"
                  options={allProjects}
                  selectedIds={projectIds}
                  onChange={setProjectIds}
                  emptyLabel="No projects available"
                />
                <SampleContextPicker
                  label="Experiments"
                  options={filteredExperiments}
                  selectedIds={experimentIds}
                  onChange={setExperimentIds}
                  emptyLabel="No experiments available"
                />
                <SampleContextPicker
                  label="Lab Notes"
                  options={allLabNotes}
                  selectedIds={labNoteIds}
                  onChange={setLabNoteIds}
                  emptyLabel="No lab notes available"
                />
              </div>
            </div>
          )}

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

function EditField({
  id,
  label,
  value,
  onChange,
  type = "text",
  step,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  step?: string
}) {
  return (
    <div className="space-y-2 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} step={step} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
