"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowLeft, Package, ListChecks, CheckCircle2, Loader2, Sparkles, Grid3x3 } from "lucide-react"
import { useSmartBack } from "@/hooks/use-smart-back"
import { parseTagInput } from "@/lib/sample-molecular"
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
  "Plasmid",
  "PDB Structure",
  "Other",
]

const QUANTITY_UNITS = ["μL", "mL", "L", "μg", "mg", "g", "kg", "units", "items"]
const CONCENTRATION_UNITS = ["ng/μL", "μg/mL", "mg/mL", "nM", "μM", "mM", "M", "OD600", "cells/mL"]
const STORAGE_CONDITIONS = ["Room Temperature", "4°C", "-20°C", "-80°C", "Liquid Nitrogen", "Desiccated", "Other"]

const SCHEMES = [
  { value: "sequential", label: "Sequential Numeric (e.g. SMP-0001)" },
  { value: "grid_96", label: "96-Well Plate (A1 - H12)" },
  { value: "grid_384", label: "384-Well Plate (A1 - P24)" },
  { value: "grid_81", label: "81-Well Cryobox (A1 - I9)" },
  { value: "grid_100", label: "100-Well Cryobox (A1 - J10)" },
]

export default function BulkSamplePage() {
  const router = useRouter()
  const { toast } = useToast()
  const handleBack = useSmartBack("/samples")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Naming & scheme parameters
  const [scheme, setScheme] = useState("sequential")
  const [totalCount, setTotalCount] = useState<number>(500)
  const [prefix, setPrefix] = useState("SMP-2026-")
  const [startSeq, setStartSeq] = useState<number>(1)
  const [paddingLen, setPaddingLen] = useState<number>(4)

  // Template Form Fields
  const [sampleType, setSampleType] = useState("Chemical")
  const [description, setDescription] = useState("")
  const [source, setSource] = useState("")
  const [storageLocation, setStorageLocation] = useState("")
  const [storageCondition, setStorageCondition] = useState("4°C")
  const [quantity, setQuantity] = useState("")
  const [quantityUnit, setQuantityUnit] = useState("μL")
  const [status, setStatus] = useState("available")
  const [concentration, setConcentration] = useState("")
  const [concentrationUnit, setConcentrationUnit] = useState("ng/μL")
  const [containerType, setContainerType] = useState("Tube")
  const [tagText, setTagText] = useState("")

  // Scientific metadata template
  const [organism, setOrganism] = useState("")
  const [strain, setStrain] = useState("")
  const [genotype, setGenotype] = useState("")
  const [supplier, setSupplier] = useState("")
  const [catalogNumber, setCatalogNumber] = useState("")
  const [lotNumber, setLotNumber] = useState("")

  // Preview Pagination
  const [previewPage, setPreviewPage] = useState(0)
  const PREVIEW_LIMIT = 10

  // Auto-update totalCount when grid changes
  useEffect(() => {
    if (scheme === "grid_96") setTotalCount(96)
    else if (scheme === "grid_384") setTotalCount(384)
    else if (scheme === "grid_81") setTotalCount(81)
    else if (scheme === "grid_100") setTotalCount(100)
  }, [scheme])

  // Generator logic
  const generatedRecords = useMemo(() => {
    const records = []
    const startNum = Number(startSeq) || 1

    if (scheme === "sequential") {
      const count = Math.min(1000, Math.max(1, Number(totalCount) || 1))
      for (let i = 0; i < count; i++) {
        const seqStr = String(startNum + i).padStart(Number(paddingLen) || 1, "0")
        const code = `${prefix}${seqStr}`
        records.push({
          sample_code: code,
          box_position: seqStr,
        })
      }
    } else if (scheme === "grid_96") {
      const rows = ["A", "B", "C", "D", "E", "F", "G", "H"]
      const cols = 12
      rows.forEach((r) => {
        for (let c = 1; c <= cols; c++) {
          const coord = `${r}${c}`
          records.push({
            sample_code: `${prefix}${coord}`,
            box_position: coord,
          })
        }
      })
    } else if (scheme === "grid_384") {
      const rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P"]
      const cols = 24
      rows.forEach((r) => {
        for (let c = 1; c <= cols; c++) {
          const coord = `${r}${c}`
          records.push({
            sample_code: `${prefix}${coord}`,
            box_position: coord,
          })
        }
      })
    } else if (scheme === "grid_81") {
      const rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
      const cols = 9
      rows.forEach((r) => {
        for (let c = 1; c <= cols; c++) {
          const coord = `${r}${c}`
          records.push({
            sample_code: `${prefix}${coord}`,
            box_position: coord,
          })
        }
      })
    } else if (scheme === "grid_100") {
      const rows = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
      const cols = 10
      rows.forEach((r) => {
        for (let c = 1; c <= cols; c++) {
          const coord = `${r}${c}`
          records.push({
            sample_code: `${prefix}${coord}`,
            box_position: coord,
          })
        }
      })
    }

    return records
  }, [scheme, totalCount, prefix, startSeq, paddingLen])

  const paginatedPreview = useMemo(() => {
    const start = previewPage * PREVIEW_LIMIT
    return generatedRecords.slice(start, start + PREVIEW_LIMIT)
  }, [generatedRecords, previewPage])

  const totalPreviewPages = Math.ceil(generatedRecords.length / PREVIEW_LIMIT)

  // Submit bulk insert
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error("Not authenticated")

      const parsedTags = parseTagInput(tagText)
      const numericQty = quantity ? parseFloat(quantity) : null
      const numericConcentration = concentration ? parseFloat(concentration) : null

      // Build records payload
      const payload = generatedRecords.map((rec) => ({
        sample_code: rec.sample_code,
        box_position: rec.box_position,
        sample_type: sampleType,
        description: description || null,
        source: source || null,
        storage_location: storageLocation || null,
        storage_condition: storageCondition || null,
        quantity: numericQty,
        quantity_unit: quantityUnit || null,
        status: status,
        concentration: numericConcentration,
        concentration_unit: concentrationUnit || null,
        container_type: containerType || null,
        organism: organism || null,
        strain: strain || null,
        genotype: genotype || null,
        supplier: supplier || null,
        catalog_number: catalogNumber || null,
        lot_number: lotNumber || null,
        tags: parsedTags,
        created_by: user.id,
      }))

      // Supabase Bulk Insert
      const { error: insertError } = await supabase.from("samples").insert(payload)
      if (insertError) throw insertError

      toast({
        title: "Samples Generated Successfully",
        description: `Successfully registered ${generatedRecords.length} new samples in bulk.`,
      })
      router.push("/samples")
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Failed to generate samples. Please check for duplicate Sample Codes.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4 md:space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack} className="shrink-0" aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Bulk Sample Generator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate and register hundreds of laboratory samples in a single high-performance operation.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid gap-6 md:grid-cols-3">
          {/* Section 1: ID Scheme Generator Configuration */}
          <Card className="md:col-span-2">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-5 w-5 text-primary" />
                ID Naming Scheme Configuration
              </CardTitle>
              <CardDescription>Configure how sample codes and unique IDs are generated.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="scheme">Naming Scheme</Label>
                  <Select value={scheme} onValueChange={setScheme}>
                    <SelectTrigger id="scheme">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEMES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prefix">Sample Code Prefix</Label>
                  <Input
                    id="prefix"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                    placeholder="e.g. SMP-2026-"
                  />
                </div>
              </div>

              {scheme === "sequential" && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="total-count">Total Samples to Generate</Label>
                    <Input
                      id="total-count"
                      type="number"
                      min={1}
                      max={1000}
                      value={totalCount}
                      onChange={(e) => setTotalCount(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="start-seq">Starting Number</Label>
                    <Input
                      id="start-seq"
                      type="number"
                      min={1}
                      value={startSeq}
                      onChange={(e) => setStartSeq(Number(e.target.value))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="padding">Digits Padding</Label>
                    <Input
                      id="padding"
                      type="number"
                      min={1}
                      max={10}
                      value={paddingLen}
                      onChange={(e) => setPaddingLen(Number(e.target.value))}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Shared Identity */}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-5 w-5 text-primary" />
                Common Identity
              </CardTitle>
              <CardDescription>Values shared across all generated samples.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sample_type">Sample Type *</Label>
                <Select value={sampleType} onValueChange={setSampleType}>
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

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="in_use">In Use</SelectItem>
                    <SelectItem value="depleted">Depleted</SelectItem>
                    <SelectItem value="disposed">Disposed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (comma-separated)</Label>
                <Input
                  id="tags"
                  value={tagText}
                  onChange={(e) => setTagText(e.target.value)}
                  placeholder="e.g. bulk, construct, plate-1"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Section 3: Quantity, Storage, and Scientific Details Template */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">Scientific & Storage Templates</CardTitle>
            <CardDescription>Configure pre-filled stock levels, freezer placements, and scientific catalog details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity per Sample</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  placeholder="e.g. 50"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="quantity_unit">Unit</Label>
                <Select value={quantityUnit} onValueChange={setQuantityUnit}>
                  <SelectTrigger id="quantity_unit">
                    <SelectValue />
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

              <div className="space-y-2">
                <Label htmlFor="concentration">Concentration</Label>
                <Input
                  id="concentration"
                  type="number"
                  step="any"
                  placeholder="Optional"
                  value={concentration}
                  onChange={(e) => setConcentration(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="concentration_unit">Conc. Unit</Label>
                <Select value={concentrationUnit} onValueChange={setConcentrationUnit}>
                  <SelectTrigger id="concentration_unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONCENTRATION_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="storage_location">Storage Location</Label>
                <Input
                  id="storage_location"
                  placeholder="e.g. Freezer -80 B, Shelf 3"
                  value={storageLocation}
                  onChange={(e) => setStorageLocation(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="storage_condition">Storage Condition</Label>
                <Select value={storageCondition} onValueChange={setStorageCondition}>
                  <SelectTrigger id="storage_condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STORAGE_CONDITIONS.map((cond) => (
                      <SelectItem key={cond} value={cond}>
                        {cond}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="container_type">Container Type</Label>
                <Input
                  id="container_type"
                  placeholder="e.g. 96-well plate, vial"
                  value={containerType}
                  onChange={(e) => setContainerType(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="source">Source</Label>
                <Input
                  id="source"
                  placeholder="e.g. Cell culture, supplier"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="organism">Organism</Label>
                <Input id="organism" value={organism} onChange={(e) => setOrganism(e.target.value)} placeholder="e.g. E. coli" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="strain">Strain</Label>
                <Input id="strain" value={strain} onChange={(e) => setStrain(e.target.value)} placeholder="e.g. DH5a" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="genotype">Genotype</Label>
                <Input id="genotype" value={genotype} onChange={(e) => setGenotype(e.target.value)} placeholder="e.g. fhuA2 lacIq" />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="supplier">Supplier</Label>
                <Input id="supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Sigma-Aldrich" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog">Catalog Number</Label>
                <Input id="catalog" value={catalogNumber} onChange={(e) => setCatalogNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lot">Lot Number</Label>
                <Input id="lot" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Common Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description applied to all samples..."
              />
            </div>
          </CardContent>
        </Card>

        {/* Section 4: Paginated Preview Grid */}
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Grid3x3 className="h-5 w-5 text-primary" />
                Live Preview Table ({generatedRecords.length} samples)
              </CardTitle>
              <CardDescription>Confirm generated codes and placements before inserting into the database.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="border rounded-md overflow-hidden bg-background">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="font-semibold text-xs">Sample Code</TableHead>
                    <TableHead className="font-semibold text-xs">Sample Type</TableHead>
                    <TableHead className="font-semibold text-xs">Quantity</TableHead>
                    <TableHead className="font-semibold text-xs">Storage Location</TableHead>
                    <TableHead className="font-semibold text-xs">Box / Plate Coordinate</TableHead>
                    <TableHead className="font-semibold text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPreview.map((rec, i) => (
                    <TableRow key={i} className="hover:bg-muted/10">
                      <TableCell className="font-medium font-mono text-xs">{rec.sample_code}</TableCell>
                      <TableCell className="text-xs">{sampleType}</TableCell>
                      <TableCell className="text-xs">
                        {quantity ? `${quantity} ${quantityUnit}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{storageLocation || "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{rec.box_position}</TableCell>
                      <TableCell className="text-xs capitalize">
                        <Badge variant={status === "available" ? "success" : "secondary"}>
                          {status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPreviewPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Showing {previewPage * PREVIEW_LIMIT + 1} - {Math.min((previewPage + 1) * PREVIEW_LIMIT, generatedRecords.length)} of {generatedRecords.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={previewPage === 0}
                    onClick={() => setPreviewPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={previewPage >= totalPreviewPages - 1}
                    onClick={() => setPreviewPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={handleBack} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading} className="gap-2">
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating {generatedRecords.length} Samples...
              </>
            ) : (
              <>
                <ListChecks className="h-4 w-4" />
                Generate {generatedRecords.length} Samples
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
