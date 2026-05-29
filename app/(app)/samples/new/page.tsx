"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useAuthUser } from "@/components/auth/auth-provider"
import { useCreatePageNav } from "@/hooks/use-create-page-nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { PageHeading } from "@/components/ui/page-heading"
import { ArrowLeft, FlaskConical, Link2, Package, TestTube } from "lucide-react"
import { SampleContextPicker, type SampleLinkOption } from "../sample-context-picker"
import { parseTagInput } from "@/lib/sample-molecular"
import { replaceSampleContextLinks } from "@/lib/sample-context"

const SAMPLE_TYPES = [
  "Chemical",
  "Biological",
  "Tissue",
  "Blood",
  "DNA",
  "RNA",
  "Protein",
  "Cell Culture",
  "Plasmid",
  "PDB Structure",
  "Other",
]

const QUANTITY_UNITS = ["μL", "mL", "L", "μg", "mg", "g", "kg", "units", "items"]
const CONCENTRATION_UNITS = ["ng/μL", "μg/mL", "mg/mL", "nM", "μM", "mM", "M", "OD600", "cells/mL"]
const STORAGE_CONDITIONS = ["Room Temperature", "4°C", "-20°C", "-80°C", "Liquid Nitrogen", "Desiccated", "Other"]
const STATUS_OPTIONS = [
  { value: "available", label: "Available" },
  { value: "in_use", label: "In Use" },
  { value: "depleted", label: "Depleted" },
  { value: "disposed", label: "Disposed" },
]

function isSchemaMissingError(error: unknown) {
  if (!error || typeof error !== "object") return false
  const message = "message" in error && typeof error.message === "string" ? error.message : ""
  const code = "code" in error && typeof error.code === "string" ? error.code : ""
  return code === "PGRST204" || code === "42P01" || /column .* does not exist|schema cache|relation .* does not exist/i.test(message)
}

function NewSamplePageInner() {
  const user = useAuthUser();
  const router = useRouter()
  const searchParams = useSearchParams()
  const { handleBack } = useCreatePageNav({
    pageLabel: "New Sample",
    listFallbackPath: "/samples",
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<SampleLinkOption[]>([])
  const [experiments, setExperiments] = useState<SampleLinkOption[]>([])
  const [labNotes, setLabNotes] = useState<SampleLinkOption[]>([])

  const [projectIds, setProjectIds] = useState<string[]>([])
  const [experimentIds, setExperimentIds] = useState<string[]>([])
  const [labNoteIds, setLabNoteIds] = useState<string[]>([])
  const [customMetadataText, setCustomMetadataText] = useState("")
  const [tagText, setTagText] = useState("")

  const [formData, setFormData] = useState({
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
    barcode: "",
    external_id: "",
    organism: "",
    strain: "",
    genotype: "",
    supplier: "",
    catalog_number: "",
    lot_number: "",
    concentration: "",
    concentration_unit: "",
    purity: "",
    container_type: "",
    box_position: "",
    expiry_date: "",
    hazard_class: "",
    biosafety_level: "",
  })

  useEffect(() => {
    async function fetchContext() {
      const supabase = createClient()
      const [{ data: projectRows }, { data: experimentRows }, { data: labNoteRows }] = await Promise.all([
        supabase.from("projects").select("id, name").order("name"),
        supabase.from("experiments").select("id, name, project_id, project:projects(name)").order("created_at", { ascending: false }),
        supabase.from("lab_notes").select("id, title, experiment_id, project_id").order("created_at", { ascending: false }).limit(200),
      ])

      setProjects((projectRows ?? []).map((p: any) => ({ id: p.id, label: p.name })))
      setExperiments(
        (experimentRows ?? []).map((e: any) => ({
          id: e.id,
          label: e.name,
          detail: e.project?.name ?? null,
          project_id: e.project_id,
        }))
      )
      setLabNotes(
        (labNoteRows ?? []).map((n: any) => ({
          id: n.id,
          label: n.title,
          detail: n.experiment_id ? "Experiment note" : n.project_id ? "Project note" : "Lab note",
        }))
      )
    }

    fetchContext()
  }, [])

  useEffect(() => {
    const experimentId = searchParams.get("experiment")
    if (!experimentId) return
    setExperimentIds((current) => (current.includes(experimentId) ? current : [...current, experimentId]))
  }, [searchParams])

  useEffect(() => {
    const selectedProjectIds = experiments
      .filter((experiment) => experimentIds.includes(experiment.id) && experiment.project_id)
      .map((experiment) => experiment.project_id as string)
    if (selectedProjectIds.length === 0) return
    setProjectIds((current) => Array.from(new Set([...current, ...selectedProjectIds])))
  }, [experimentIds, experiments])

  const filteredExperiments = useMemo(() => {
    if (projectIds.length === 0) return experiments
    return experiments.filter((experiment) => !experiment.project_id || projectIds.includes(experiment.project_id))
  }, [experiments, projectIds])

  const generateSampleCode = () => {
    const year = new Date().getFullYear()
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
    return `SMP-${year}-${random}`
  }

  const parseCustomMetadata = () => {
    if (!customMetadataText.trim()) return {}
    const parsed = JSON.parse(customMetadataText)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Custom metadata must be a JSON object.")
    }
    return parsed
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      if (!formData.sample_code || !formData.sample_type) {
        throw new Error("Sample code and sample type are required.")
      }

      const supabase = createClient()
      if (!user) throw new Error("Not authenticated")

      const custom_metadata = parseCustomMetadata()
      const primaryExperimentId = experimentIds[0] ?? null

      const basePayload = {
        experiment_id: primaryExperimentId,
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
      }

      const richPayload = {
        ...basePayload,
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
      }

      let insertResult = await supabase
        .from("samples")
        .insert(richPayload)
        .select()
        .single()

      if (insertResult.error && isSchemaMissingError(insertResult.error)) {
        insertResult = await supabase.from("samples").insert(basePayload).select().single()
      }

      if (insertResult.error) throw insertResult.error
      const data = insertResult.data

      try {
        await replaceSampleContextLinks(supabase, {
          sampleId: data.id,
          userId: user.id,
          projectIds,
          experimentIds,
          labNoteIds,
        })
      } catch (linkError) {
        if (!isSchemaMissingError(linkError)) throw linkError
      }

      router.push(`/samples/${data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create sample.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <PageHeading>Add New Sample</PageHeading>
          <p className="mt-1 text-sm text-muted-foreground">
            Register sample metadata, storage, provenance, and linked research context.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TestTube className="h-5 w-5" />
              Identity
            </CardTitle>
            <CardDescription>Required sample identity and scientific descriptors.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 min-w-0">
                <Label htmlFor="sample_code">Sample Code *</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="sample_code"
                    required
                    value={formData.sample_code}
                    onChange={(e) => setFormData({ ...formData, sample_code: e.target.value })}
                    placeholder="SMP-2026-0001"
                  />
                  <Button type="button" variant="outline" onClick={() => setFormData({ ...formData, sample_code: generateSampleCode() })}>
                    Generate
                  </Button>
                </div>
              </div>
              <div className="space-y-2 min-w-0">
                <Label htmlFor="sample_type">Sample Type *</Label>
                <Select value={formData.sample_type} onValueChange={(value) => setFormData({ ...formData, sample_type: value })}>
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

            <div className="grid gap-4 md:grid-cols-3">
              <Field id="barcode" label="Barcode" value={formData.barcode} onChange={(value) => setFormData({ ...formData, barcode: value })} />
              <Field id="external_id" label="External ID" value={formData.external_id} onChange={(value) => setFormData({ ...formData, external_id: value })} />
              <Field id="source" label="Source" value={formData.source} onChange={(value) => setFormData({ ...formData, source: value })} placeholder="Patient, supplier, culture, etc." />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <TextareaWithWordCount
                id="description"
                rows={3}
                value={formData.description}
                onChange={(value) => setFormData({ ...formData, description: value })}
                maxWords={1000}
                placeholder="Brief description of the sample..."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-5 w-5" />
              Scientific Details
            </CardTitle>
            <CardDescription>Optional biological, reagent, and safety metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Field id="organism" label="Organism" value={formData.organism} onChange={(value) => setFormData({ ...formData, organism: value })} />
              <Field id="strain" label="Strain" value={formData.strain} onChange={(value) => setFormData({ ...formData, strain: value })} />
              <Field id="genotype" label="Genotype" value={formData.genotype} onChange={(value) => setFormData({ ...formData, genotype: value })} />
              <Field id="supplier" label="Supplier" value={formData.supplier} onChange={(value) => setFormData({ ...formData, supplier: value })} />
              <Field id="catalog_number" label="Catalog Number" value={formData.catalog_number} onChange={(value) => setFormData({ ...formData, catalog_number: value })} />
              <Field id="lot_number" label="Lot Number" value={formData.lot_number} onChange={(value) => setFormData({ ...formData, lot_number: value })} />
              <Field id="purity" label="Purity" value={formData.purity} onChange={(value) => setFormData({ ...formData, purity: value })} />
              <Field id="hazard_class" label="Hazard Class" value={formData.hazard_class} onChange={(value) => setFormData({ ...formData, hazard_class: value })} />
              <Field id="biosafety_level" label="Biosafety Level" value={formData.biosafety_level} onChange={(value) => setFormData({ ...formData, biosafety_level: value })} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="h-5 w-5" />
              Quantity & Storage
            </CardTitle>
            <CardDescription>Inventory amount, concentration, container, and storage conditions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <Field id="quantity" label="Quantity" type="number" step="0.01" value={formData.quantity} onChange={(value) => setFormData({ ...formData, quantity: value })} />
              <SelectField id="quantity_unit" label="Unit" value={formData.quantity_unit} options={QUANTITY_UNITS} onChange={(value) => setFormData({ ...formData, quantity_unit: value })} />
              <Field id="concentration" label="Concentration" type="number" step="0.01" value={formData.concentration} onChange={(value) => setFormData({ ...formData, concentration: value })} />
              <SelectField id="concentration_unit" label="Concentration Unit" value={formData.concentration_unit} options={CONCENTRATION_UNITS} onChange={(value) => setFormData({ ...formData, concentration_unit: value })} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field id="storage_location" label="Storage Location" value={formData.storage_location} onChange={(value) => setFormData({ ...formData, storage_location: value })} placeholder="Freezer B-12, Shelf A3" />
              <SelectField id="storage_condition" label="Storage Condition" value={formData.storage_condition} options={STORAGE_CONDITIONS} onChange={(value) => setFormData({ ...formData, storage_condition: value })} />
              <Field id="container_type" label="Container Type" value={formData.container_type} onChange={(value) => setFormData({ ...formData, container_type: value })} />
              <Field id="box_position" label="Box Position" value={formData.box_position} onChange={(value) => setFormData({ ...formData, box_position: value })} />
              <Field id="collection_date" label="Collection Date" type="date" value={formData.collection_date} onChange={(value) => setFormData({ ...formData, collection_date: value })} />
              <Field id="expiry_date" label="Expiry Date" type="date" value={formData.expiry_date} onChange={(value) => setFormData({ ...formData, expiry_date: value })} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField id="status" label="Status" value={formData.status} options={STATUS_OPTIONS.map((s) => s.value)} optionLabels={STATUS_OPTIONS.reduce<Record<string, string>>((acc, s) => ({ ...acc, [s.value]: s.label }), {})} onChange={(value) => setFormData({ ...formData, status: value })} />
              <Field id="tags" label="Tags" value={tagText} onChange={setTagText} placeholder="plasmid, glycerol stock, qc pending" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-5 w-5" />
              Links
            </CardTitle>
            <CardDescription>Connect this sample to projects, experiments, and lab notes.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-3">
            <SampleContextPicker label="Projects" options={projects} selectedIds={projectIds} onChange={setProjectIds} emptyLabel="No projects available." />
            <SampleContextPicker label="Experiments" options={filteredExperiments} selectedIds={experimentIds} onChange={setExperimentIds} emptyLabel="No experiments available." />
            <SampleContextPicker label="Lab Notes" options={labNotes} selectedIds={labNoteIds} onChange={setLabNoteIds} emptyLabel="No lab notes available." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custom Metadata</CardTitle>
            <CardDescription>Optional JSON object for details that do not yet have a dedicated field.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={customMetadataText}
              onChange={(event) => setCustomMetadataText(event.target.value)}
              placeholder='{"antibiotic": "ampicillin", "insert": "GFP"}'
              className="min-h-28 font-mono text-sm"
              spellCheck={false}
            />
          </CardContent>
        </Card>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Sample"}
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  step,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  step?: string
}) {
  return (
    <div className="space-y-2 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function SelectField({
  id,
  label,
  value,
  options,
  optionLabels,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  optionLabels?: Record<string, string>
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-2 min-w-0">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {optionLabels?.[option] ?? option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function NewSamplePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
      <NewSamplePageInner />
    </Suspense>
  )
}
