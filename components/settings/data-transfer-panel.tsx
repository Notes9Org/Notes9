"use client"

import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentType,
} from "react"
import {
  Beaker,
  BookOpen,
  Download,
  FileArchive,
  FlaskConical,
  FolderInput,
  FolderKanban,
  GripVertical,
  Image as ImageIcon,
  Layers3,
  Link2,
  Loader2,
  Microscope,
  TestTube,
  Upload,
  Users,
  FileText,
  Database,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  DEFAULT_EXPORT_TABLES,
  EXPORT_TABLES,
  type ExportTable,
} from "@/lib/data-transfer"
import { cn } from "@/lib/utils"
import { FileDropzone } from "@/components/ui/file-dropzone"

type TableOption = {
  table: ExportTable
  title: string
  subtitle: string
  icon: ComponentType<{ className?: string }>
}

type ImportCategory =
  | "data_file"
  | "lab_note_document"
  | "protocol_document"
  | "literature_document"

type ProjectMapping = {
  key: string
  name: string
  sourcePath: string
}

type ExperimentMapping = {
  key: string
  name: string
  sourcePath: string
  projectKey: string
}

type FileMapping = {
  key: string
  file: File
  relativePath: string
  projectKey: string
  experimentKey: string
  category: ImportCategory
}

type ImportReport = {
  inserted?: Partial<Record<ExportTable | "files", number>>
  skipped?: Partial<Record<ExportTable | "files", number>>
  failed?: Array<{ table: ExportTable | "files"; reason: string; row_id?: string }>
}

const TABLE_OPTIONS: TableOption[] = [
  { table: "projects", title: "Projects", subtitle: "Project folders and metadata", icon: FolderKanban },
  { table: "experiments", title: "Experiments", subtitle: "Experiment records and status", icon: FlaskConical },
  { table: "lab_notes", title: "Lab Notes", subtitle: "Notebook entries as PDF docs", icon: FileText },
  { table: "experiment_data", title: "Data Files", subtitle: "Original uploaded file formats", icon: Database },
  { table: "samples", title: "Samples", subtitle: "Sample inventory metadata", icon: TestTube },
  { table: "protocols", title: "Protocols", subtitle: "SOP exports as PDF docs", icon: Beaker },
  { table: "equipment", title: "Equipment", subtitle: "Instrument metadata", icon: Microscope },
  { table: "literature_reviews", title: "Literature", subtitle: "Reference records and PDFs", icon: BookOpen },
  { table: "project_members", title: "Project Members", subtitle: "Project role mappings", icon: Users },
  { table: "experiment_protocols", title: "Protocol Links", subtitle: "Experiment-protocol links", icon: Link2 },
]

const CATEGORY_OPTIONS: Array<{
  value: ImportCategory
  label: string
  description: string
}> = [
  {
    value: "data_file",
    label: "Data File",
    description: "Upload as experiment data (preserve original format).",
  },
  {
    value: "lab_note_document",
    label: "Lab Note Doc",
    description: "Create a lab note with reference to uploaded file.",
  },
  {
    value: "protocol_document",
    label: "Protocol Doc",
    description: "Create a protocol and link file as source.",
  },
  {
    value: "literature_document",
    label: "Literature Doc",
    description: "Create literature record linked to uploaded file.",
  },
]

export function DataTransferPanel() {
  const { toast } = useToast()
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [selectedTables, setSelectedTables] =
    useState<ExportTable[]>(DEFAULT_EXPORT_TABLES)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [projects, setProjects] = useState<ProjectMapping[]>([])
  const [experiments, setExperiments] = useState<ExperimentMapping[]>([])
  const [files, setFiles] = useState<FileMapping[]>([])
  const [selectedFolderName, setSelectedFolderName] = useState<string>("")
  const [draggedFileKey, setDraggedFileKey] = useState<string | null>(null)
  const [importReport, setImportReport] = useState<ImportReport | null>(null)

  const selectedSet = useMemo(() => new Set(selectedTables), [selectedTables])
  const selectedCount = selectedTables.length

  const fileStats = useMemo(() => {
    const byCategory = files.reduce<Record<string, number>>((acc, file) => {
      acc[file.category] = (acc[file.category] ?? 0) + 1
      return acc
    }, {})
    return {
      files: files.length,
      projects: projects.length,
      experiments: experiments.length,
      byCategory,
    }
  }, [experiments.length, files, projects.length])

  const experimentsByProject = useMemo(() => {
    const map = new Map<string, ExperimentMapping[]>()
    for (const experiment of experiments) {
      const current = map.get(experiment.projectKey) ?? []
      current.push(experiment)
      map.set(experiment.projectKey, current)
    }
    return map
  }, [experiments])

  const handleExportZip = async () => {
    if (selectedTables.length === 0) {
      toast({
        title: "Select at least one dataset",
        description: "Choose what you want to export first.",
        variant: "destructive",
      })
      return
    }

    setIsExporting(true)
    try {
      const params = new URLSearchParams({
        tables: selectedTables.join(","),
      })
      const res = await fetch(`/api/data-transfer/export?${params.toString()}`)
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || "Export failed")
      }

      const blob = await res.blob()
      const header = res.headers.get("content-disposition") ?? ""
      const match = header.match(/filename="([^"]+)"/)
      const fileName = match?.[1] || `notes9-export-${Date.now()}.zip`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)

      toast({
        title: "Export complete",
        description: "ZIP includes project/experiment folders, PDF docs, and original uploaded files.",
      })
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "Unable to export ZIP",
        variant: "destructive",
      })
    } finally {
      setIsExporting(false)
    }
  }

  const handleFolderSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.target.files ?? [])
    event.target.value = ""
    if (pickedFiles.length === 0) return

    const parsed = parseResearchFolder(pickedFiles)
    if (!parsed) {
      toast({
        title: "Unable to parse folder",
        description: "Select a folder containing project and experiment subfolders.",
        variant: "destructive",
      })
      return
    }

    setProjects(parsed.projects)
    setExperiments(parsed.experiments)
    setFiles(parsed.files)
    setSelectedFolderName(parsed.root)
    setImportReport(null)

    toast({
      title: "Folder loaded",
      description: `Detected ${parsed.projects.length} projects, ${parsed.experiments.length} experiments, ${parsed.files.length} files.`,
    })
  }

  const updateProjectName = (projectKey: string, nextName: string) => {
    setProjects((current) =>
      current.map((project) =>
        project.key === projectKey
          ? { ...project, name: nextName }
          : project,
      ),
    )
  }

  const updateExperimentName = (experimentKey: string, nextName: string) => {
    setExperiments((current) =>
      current.map((experiment) =>
        experiment.key === experimentKey
          ? { ...experiment, name: nextName }
          : experiment,
      ),
    )
  }

  const updateFileAssignment = (
    fileKey: string,
    updates: Partial<Pick<FileMapping, "category" | "projectKey" | "experimentKey">>,
  ) => {
    setFiles((current) =>
      current.map((file) => {
        if (file.key !== fileKey) return file
        let next = { ...file, ...updates }
        if (updates.projectKey) {
          const projectExperiments =
            experimentsByProject.get(updates.projectKey) ?? []
          if (!projectExperiments.some((experiment) => experiment.key === next.experimentKey)) {
            next.experimentKey = projectExperiments[0]?.key ?? next.experimentKey
          }
        }
        return next
      }),
    )
  }

  const handleDropOnExperiment = (experimentKey: string, projectKey: string) => {
    if (!draggedFileKey) return
    updateFileAssignment(draggedFileKey, {
      projectKey,
      experimentKey,
    })
    setDraggedFileKey(null)
  }

  const handleImport = async () => {
    if (files.length === 0 || projects.length === 0 || experiments.length === 0) {
      toast({
        title: "Import setup incomplete",
        description: "Load a folder and confirm mapping first.",
        variant: "destructive",
      })
      return
    }

    setIsImporting(true)
    try {
      const formData = new FormData()
      formData.append("mode", "research-folder")

      const mapping = {
        projects: projects.map((project) => ({
          key: project.key,
          name: project.name.trim() || project.sourcePath,
        })),
        experiments: experiments.map((experiment) => ({
          key: experiment.key,
          name: experiment.name.trim() || experiment.sourcePath,
          projectKey: experiment.projectKey,
        })),
        files: files.map((file, index) => {
          const field = `file_${index}`
          formData.append(field, file.file)
          return {
            key: file.key,
            field,
            relativePath: file.relativePath,
            category: file.category,
            projectKey: file.projectKey,
            experimentKey: file.experimentKey,
          }
        }),
      }
      formData.append("mapping", JSON.stringify(mapping))

      const res = await fetch("/api/data-transfer/import", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || "Import failed")
      }

      const report = (data?.report ?? null) as ImportReport | null
      setImportReport(report)
      const inserted = report?.inserted?.files ?? 0
      toast({
        title: "Import completed",
        description: `${inserted} files processed into Notes9 structure.`,
      })
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message || "Unable to import mapped folder.",
        variant: "destructive",
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-gradient-to-r from-primary/10 via-background to-secondary/10">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Layers3 className="h-5 w-5 text-primary" />
                Research Data Transfer
              </CardTitle>
              <CardDescription className="mt-1">
                Professional import/export for research workflows: preserve raw file formats, export docs as PDFs, and map hierarchy into projects and experiments.
              </CardDescription>
            </div>
            <Badge variant="outline" className="border-primary/30 bg-primary/5">
              Notes9 Themed
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Export Workspace ZIP</CardTitle>
            <CardDescription>
              Choose datasets and export as structured folders in a single ZIP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedTables([...EXPORT_TABLES])}
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedTables([...DEFAULT_EXPORT_TABLES])}
              >
                Reset Core
              </Button>
              <Badge variant="secondary">{selectedCount} selected</Badge>
            </div>

            <div className="grid gap-2">
              {TABLE_OPTIONS.map((option) => {
                const Icon = option.icon
                const checked = selectedSet.has(option.table)
                return (
                  <label
                    key={option.table}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                      checked ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        const nextChecked = value === true
                        setSelectedTables((current) =>
                          nextChecked
                            ? [...new Set([...current, option.table])]
                            : current.filter((table) => table !== option.table),
                        )
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{option.title}</p>
                        <p className="text-xs text-muted-foreground">{option.subtitle}</p>
                      </div>
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </label>
                )
              })}
            </div>

            <Button className="w-full" onClick={handleExportZip} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting ZIP...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export Structured ZIP
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import Research Folder</CardTitle>
            <CardDescription>
              Load real research files (`pdf`, `docx`, `xlsx`, `csv`, `jpeg`, `png`, `svg`, `tiff`, etc.) and map them to Notes9 entities.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileDropzone
              onFilesDrop={(files) => {
                if (files.length === 0) return
                const parsed = parseResearchFolder(files)
                if (!parsed) {
                  toast({
                    title: "Unable to parse folder",
                    description: "Select a folder containing project and experiment subfolders.",
                    variant: "destructive",
                  })
                  return
                }
                setProjects(parsed.projects)
                setExperiments(parsed.experiments)
                setFiles(parsed.files)
                setSelectedFolderName(parsed.root)
                setImportReport(null)
                toast({
                  title: "Folder loaded",
                  description: `Detected ${parsed.projects.length} projects, ${parsed.experiments.length} experiments, ${parsed.files.length} files.`,
                })
              }}
              description="Drop research folder here"
              className="rounded-lg border border-dashed p-4"
              activeClassName="ring-2 ring-primary border-primary bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {selectedFolderName || "No folder selected"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select or drop a root folder. You can edit mapping and categories before import.
                  </p>
                </div>
                <FileArchive className="h-5 w-5 text-primary shrink-0" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full"
                onClick={() => folderInputRef.current?.click()}
              >
                <FolderInput className="mr-2 h-4 w-4" />
                Choose Folder
              </Button>
              <input
                ref={folderInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={handleFolderSelection}
                {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
              />
            </FileDropzone>

            {files.length > 0 && (
              <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{fileStats.projects} projects</Badge>
                  <Badge variant="secondary">{fileStats.experiments} experiments</Badge>
                  <Badge variant="secondary">{fileStats.files} files</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Category split: data {fileStats.byCategory.data_file ?? 0}, lab notes{" "}
                  {fileStats.byCategory.lab_note_document ?? 0}, protocols{" "}
                  {fileStats.byCategory.protocol_document ?? 0}, literature{" "}
                  {fileStats.byCategory.literature_document ?? 0}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hierarchy & Categorization Mapper</CardTitle>
            <CardDescription>
              Edit names, categorize files, and assign files by dropdown or drag-and-drop onto experiment targets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Projects</h4>
                {projects.map((project) => (
                  <div key={project.key} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      Source: {project.sourcePath}
                    </p>
                    <Input
                      value={project.name}
                      onChange={(event) =>
                        updateProjectName(project.key, event.target.value)
                      }
                      placeholder="Project name"
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Experiments</h4>
                {experiments.map((experiment) => {
                  const projectName =
                    projects.find((project) => project.key === experiment.projectKey)?.name ??
                    "Unassigned"
                  return (
                    <div
                      key={experiment.key}
                      className={cn(
                        "rounded-md border p-3 transition-colors",
                        draggedFileKey && "border-dashed",
                      )}
                      onDragOver={(event) => {
                        if (!draggedFileKey) return
                        event.preventDefault()
                      }}
                      onDrop={(event) => {
                        if (!draggedFileKey) return
                        event.preventDefault()
                        handleDropOnExperiment(experiment.key, experiment.projectKey)
                      }}
                    >
                      <p className="text-xs text-muted-foreground mb-2">
                        Project: {projectName}
                      </p>
                      <Input
                        value={experiment.name}
                        onChange={(event) =>
                          updateExperimentName(experiment.key, event.target.value)
                        }
                        placeholder="Experiment name"
                      />
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Drop a file row here to assign quickly.
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border">
              <div className="grid grid-cols-12 gap-2 border-b bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">
                <div className="col-span-4">File</div>
                <div className="col-span-3">Category</div>
                <div className="col-span-2">Project</div>
                <div className="col-span-3">Experiment</div>
              </div>
              <div className="max-h-[420px] overflow-auto divide-y">
                {files.map((file) => {
                  const projectExperiments =
                    experimentsByProject.get(file.projectKey) ?? []
                  return (
                    <div
                      key={file.key}
                      className="grid grid-cols-12 gap-2 px-3 py-2"
                      draggable
                      onDragStart={() => setDraggedFileKey(file.key)}
                      onDragEnd={() => setDraggedFileKey(null)}
                    >
                      <div className="col-span-4 min-w-0">
                        <div className="flex items-center gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                          {file.file.type.startsWith("image/") ? (
                            <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate text-sm">{file.file.name}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground truncate mt-1 pl-6">
                          {file.relativePath}
                        </p>
                      </div>

                      <div className="col-span-3">
                        <Select
                          value={file.category}
                          onValueChange={(value) =>
                            updateFileAssignment(file.key, {
                              category: value as ImportCategory,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Select
                          value={file.projectKey}
                          onValueChange={(value) =>
                            updateFileAssignment(file.key, { projectKey: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {projects.map((project) => (
                              <SelectItem key={project.key} value={project.key}>
                                {project.name || project.sourcePath}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-3">
                        <Select
                          value={file.experimentKey}
                          onValueChange={(value) =>
                            updateFileAssignment(file.key, { experimentKey: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {projectExperiments.map((experiment) => (
                              <SelectItem key={experiment.key} value={experiment.key}>
                                {experiment.name || experiment.sourcePath}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {CATEGORY_OPTIONS.length > 0 && (
              <div className="grid gap-2 md:grid-cols-2">
                {CATEGORY_OPTIONS.map((option) => (
                  <div key={option.value} className="rounded-md border px-3 py-2 text-xs">
                    <p className="font-semibold">{option.label}</p>
                    <p className="text-muted-foreground mt-0.5">{option.description}</p>
                  </div>
                ))}
              </div>
            )}

            <Button className="w-full" onClick={handleImport} disabled={isImporting}>
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing & Categorizing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import Mapped Folder
                </>
              )}
            </Button>

            {isImporting && <Progress value={72} />}

            {importReport && (
              <div className="rounded-lg border p-3 text-xs space-y-2">
                <p className="text-sm font-semibold">Last Import Result</p>
                <p className="text-muted-foreground">
                  files inserted {importReport.inserted?.files ?? 0} · skipped{" "}
                  {importReport.skipped?.files ?? 0}
                </p>
                {(importReport.failed?.length ?? 0) > 0 && (
                  <p className="text-destructive">
                    {importReport.failed?.length} item{importReport.failed?.length === 1 ? "" : "s"} failed.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function parseResearchFolder(files: File[]) {
  if (files.length === 0) return null

  const root = detectRoot(files)
  const projectMap = new Map<string, ProjectMapping>()
  const experimentMap = new Map<string, ExperimentMapping>()
  const mappedFiles: FileMapping[] = []

  let projectIndex = 0
  let experimentIndex = 0
  let fileIndex = 0

  for (const file of files) {
    const fullPath = getRelativePath(file)
    const relativePath = trimRoot(fullPath, root)
    const segments = relativePath.split("/").filter(Boolean)
    if (segments.length === 0) continue

    const projectSegment = segments[0] || "Imported Project"
    const experimentSegment = segments[1] || "Imported Files"

    if (!projectMap.has(projectSegment)) {
      projectMap.set(projectSegment, {
        key: `project_${projectIndex}`,
        name: humanizeName(projectSegment),
        sourcePath: projectSegment,
      })
      projectIndex += 1
    }

    const projectKey = projectMap.get(projectSegment)!.key
    const experimentSourcePath = `${projectSegment}/${experimentSegment}`
    const experimentComposite = `${projectKey}::${experimentSegment}`
    if (!experimentMap.has(experimentComposite)) {
      experimentMap.set(experimentComposite, {
        key: `experiment_${experimentIndex}`,
        name: humanizeName(experimentSegment),
        sourcePath: experimentSourcePath,
        projectKey,
      })
      experimentIndex += 1
    }

    const experimentKey = experimentMap.get(experimentComposite)!.key

    mappedFiles.push({
      key: `file_${fileIndex}`,
      file,
      relativePath,
      projectKey,
      experimentKey,
      category: detectCategory(file, relativePath),
    })
    fileIndex += 1
  }

  if (projectMap.size === 0 || experimentMap.size === 0 || mappedFiles.length === 0) {
    return null
  }

  return {
    root,
    projects: [...projectMap.values()],
    experiments: [...experimentMap.values()],
    files: mappedFiles,
  }
}

function detectCategory(file: File, relativePath: string): ImportCategory {
  const path = relativePath.toLowerCase()
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()

  if (path.includes("lab-notes") || path.includes("lab_notes")) {
    return "lab_note_document"
  }
  if (path.includes("protocol")) {
    return "protocol_document"
  }
  if (path.includes("literature") || path.includes("paper")) {
    return "literature_document"
  }

  if (name.endsWith(".pdf")) return "lab_note_document"
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "protocol_document"
  if (name.endsWith(".bib")) return "literature_document"

  if (
    type.startsWith("image/") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv") ||
    name.endsWith(".tsv") ||
    name.endsWith(".json") ||
    name.endsWith(".xml") ||
    name.endsWith(".fasta")
  ) {
    return "data_file"
  }

  return "data_file"
}

function detectRoot(files: File[]) {
  const first = getRelativePath(files[0]).split("/")[0]
  return first || "selected-folder"
}

function trimRoot(path: string, root: string) {
  if (path.startsWith(`${root}/`)) {
    return path.slice(root.length + 1)
  }
  return path
}

function getRelativePath(file: File) {
  const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  return path && path.length > 0 ? path : file.name
}

function humanizeName(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}
