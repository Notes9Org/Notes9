"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { resolveInitialProjectIdParam } from "@/lib/url-project-param"
import { useProjectScope } from "@/contexts/project-scope-context"
import { useMediaQuery } from "@/hooks/use-media-query"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ViewModeToggle } from "@/components/ui/view-mode-toggle"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import {
  FILTER_ALL,
  ResourceFilterRow,
  ResourceListFilter,
} from "@/components/ui/resource-list-filters"
import {
  ArrowUpRight,
  Database,
  File,
  FileImage,
  FileText,
  FileText as FileSpreadsheet,
} from "@phosphor-icons/react/ssr"
import { UploadFileDialog } from "@/app/(app)/experiments/[id]/upload-file-dialog"
import { ExperimentDataTabularDialog, isTabularExperimentFile } from "@/components/experiments/experiment-data-tabular-dialog"
import { ExperimentDataPreviewDialog, isPreviewableExperimentFile } from "@/components/experiments/experiment-data-preview-dialog"
import { createClient } from "@/lib/supabase/client"
import { createBucketSignedUrl } from "@/lib/storage-signed-url"
import { USER_STORAGE_BUCKET } from "@/lib/user-storage-bucket"

export type DataFileRow = {
  id: string
  file_name: string
  file_type: string | null
  file_size: number | null
  data_type: string | null
  created_at: string
  experiment_id: string
  project_id: string | null
  /** Storage path inside the `user` bucket (or a legacy full URL), needed to preview in place. */
  file_url: string
  tabular_format?: string | null
  experiment_name: string | null
  project_name: string | null
}

type Option = { id: string; name: string }
type ExperimentOption = Option & { project_id: string | null }

function getFileIcon(fileName: string, fileType: string | null, className = "size-4") {
  const type = fileType || ""
  const lower = fileName.toLowerCase()
  if (type.startsWith("image/")) return <FileImage className={className} />
  if (type.includes("pdf")) return <FileText className={className} />
  if (
    type.includes("spreadsheet") ||
    type.includes("csv") ||
    type.includes("excel") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls")
  ) {
    return <FileSpreadsheet className={className} />
  }
  return <File className={className} />
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "-"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i]
}

/** Same ISO short form the other resource tables print in their Created column. */
const formatDate = (dateStr: string): string => new Date(dateStr).toISOString().split("T")[0]

export function DataFilesListClient({
  files,
  projects,
  experiments,
}: {
  files: DataFileRow[]
  projects: Option[]
  experiments: ExperimentOption[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const scope = useProjectScope()

  const [projectFilter, setProjectFilter] = useState(FILTER_ALL)
  const [experimentFilter, setExperimentFilter] = useState(FILTER_ALL)

  // Grid/table switch, same contract as the other resource lists: table by
  // default on desktop, locked to cards on mobile where the columns can't
  // render readably.
  const isMobile = useMediaQuery("(max-width: 768px)")
  const [viewMode, setViewMode] = useState<"grid" | "table">("table")
  const effectiveViewMode = isMobile ? "grid" : viewMode

  useEffect(() => {
    if (isMobile) setViewMode("grid")
  }, [isMobile])

  // In-place file viewers (mirror the experiment Data tab): spreadsheets open in
  // the Univer viewer, images/PDF/text in the preview dialog, anything else in a
  // new tab via a signed URL, no navigation away from the Data files browser.
  const [tabularOpen, setTabularOpen] = useState(false)
  const [tabularFile, setTabularFile] = useState<DataFileRow | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewFile, setPreviewFile] = useState<DataFileRow | null>(null)

  // Read-only URL sync (same pattern as lab-notes): the sidebar context
  // arrives as ?project=/?experiment= and prefills the filters; changing a
  // filter here is a LOCAL viewing choice, it deliberately does not write
  // back to the URL, so browsing another project's files never flips the
  // global sidebar context.
  useEffect(() => {
    const raw = searchParams.get("project")
    const resolved = resolveInitialProjectIdParam(
      raw ?? undefined,
      projects.map((p) => p.id),
    )
    setProjectFilter(resolved ?? FILTER_ALL)
  }, [searchParams, projects])

  useEffect(() => {
    const raw = searchParams.get("experiment")
    const valid = raw && experiments.some((e) => e.id === raw)
    setExperimentFilter(valid ? raw : FILTER_ALL)
  }, [searchParams, experiments])

  // Keep the experiment filter consistent with the selected project.
  useEffect(() => {
    if (projectFilter === FILTER_ALL) return
    setExperimentFilter((current) => {
      if (current === FILTER_ALL) return current
      const exp = experiments.find((e) => e.id === current)
      if (!exp || exp.project_id !== projectFilter) return FILTER_ALL
      return current
    })
  }, [projectFilter, experiments])

  const experimentFilterOptions = useMemo(() => {
    const pool =
      projectFilter === FILTER_ALL
        ? experiments
        : experiments.filter((e) => e.project_id === projectFilter)
    return pool.map((e) => ({ value: e.id, label: e.name }))
  }, [experiments, projectFilter])

  const filteredFiles = useMemo(() => {
    return files.filter((f) => {
      if (projectFilter !== FILTER_ALL && f.project_id !== projectFilter) return false
      if (experimentFilter !== FILTER_ALL && f.experiment_id !== experimentFilter) return false
      return true
    })
  }, [files, projectFilter, experimentFilter])

  // --- Upload scoping (context-prefilled, editable, both REQUIRED) ---
  // experiment_data.experiment_id is NOT NULL, so unlike docs the target
  // experiment is mandatory. Prefill order: active filter → sidebar context.
  const [uploadProjectId, setUploadProjectId] = useState<string | null>(null)
  const [uploadExperimentId, setUploadExperimentId] = useState<string | null>(null)

  useEffect(() => {
    const fromFilter = projectFilter !== FILTER_ALL ? projectFilter : null
    setUploadProjectId(fromFilter ?? scope.projectId)
  }, [projectFilter, scope.projectId])

  useEffect(() => {
    const fromFilter = experimentFilter !== FILTER_ALL ? experimentFilter : null
    const pinned = scope.pinnedExperimentId
    const pinnedValid =
      pinned &&
      experiments.some(
        (e) => e.id === pinned && (!uploadProjectId || e.project_id === uploadProjectId),
      )
    setUploadExperimentId(fromFilter ?? (pinnedValid ? pinned : null))
  }, [experimentFilter, scope.pinnedExperimentId, experiments, uploadProjectId])

  const uploadExperimentOptions = useMemo(
    () =>
      uploadProjectId
        ? experiments.filter((e) => e.project_id === uploadProjectId)
        : experiments,
    [experiments, uploadProjectId],
  )

  const uploadPicker = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="upload-project">Project (required)</Label>
        <Select
          value={uploadProjectId ?? ""}
          onValueChange={(v) => {
            setUploadProjectId(v)
            setUploadExperimentId((current) => {
              const exp = experiments.find((e) => e.id === current)
              return exp && exp.project_id === v ? current : null
            })
          }}
        >
          <SelectTrigger id="upload-project">
            <SelectValue placeholder="Choose a project" />
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
      <div className="space-y-2">
        <Label htmlFor="upload-experiment">Experiment (required)</Label>
        <Select
          value={uploadExperimentId ?? ""}
          onValueChange={(v) => {
            setUploadExperimentId(v)
            const exp = experiments.find((e) => e.id === v)
            if (exp?.project_id) setUploadProjectId(exp.project_id)
          }}
          disabled={!uploadProjectId && uploadExperimentOptions.length === 0}
        >
          <SelectTrigger id="upload-experiment">
            <SelectValue
              placeholder={
                uploadProjectId ? "Choose an experiment" : "Choose a project first"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {uploadExperimentOptions.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Data files always live inside an experiment, both selections are required.
        </p>
      </div>
    </div>
  )

  // Open a file's own renderer in place, instead of routing to the experiment page.
  const openFileRow = (file: DataFileRow) => {
    if (isTabularExperimentFile(file)) {
      setTabularFile(file)
      setTabularOpen(true)
    } else if (isPreviewableExperimentFile(file)) {
      setPreviewFile(file)
      setPreviewOpen(true)
    } else {
      // Fallback for formats without an inline renderer (e.g. zip, raw binary):
      // view the file itself via a short-lived signed URL in a new tab.
      void (async () => {
        const href = await createBucketSignedUrl(createClient(), USER_STORAGE_BUCKET, file.file_url)
        if (href) window.open(href, "_blank", "noopener,noreferrer")
      })()
    }
  }

  return (
    <>
      {tabularFile && (
        <ExperimentDataTabularDialog
          open={tabularOpen}
          onOpenChange={(o) => {
            setTabularOpen(o)
            if (!o) setTabularFile(null)
          }}
          experimentId={tabularFile.experiment_id}
          fileId={tabularFile.id}
          fileName={tabularFile.file_name}
        />
      )}
      {previewFile && (
        <ExperimentDataPreviewDialog
          open={previewOpen}
          onOpenChange={(o) => {
            setPreviewOpen(o)
            if (!o) setPreviewFile(null)
          }}
          fileUrl={previewFile.file_url}
          fileName={previewFile.file_name}
          fileType={previewFile.file_type}
        />
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-muted-foreground">
          Every data file across your experiments. Change the filters to browse other
          projects and experiments.
        </p>
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <ViewModeToggle value={viewMode} onChange={setViewMode} tableDisabled={isMobile} />
          <UploadFileDialog
            experimentId={uploadExperimentId}
            onUploadComplete={() => router.refresh()}
            contextPicker={uploadPicker}
          />
        </div>
      </div>

      <ResourceFilterRow>
        <ResourceListFilter
          label="Project"
          value={projectFilter}
          onValueChange={setProjectFilter}
          options={projects.map((p) => ({ value: p.id, label: p.name }))}
          allLabel="All projects"
        />
        <ResourceListFilter
          label="Experiment"
          value={experimentFilter}
          onValueChange={setExperimentFilter}
          options={experimentFilterOptions}
          allLabel="All experiments"
        />
      </ResourceFilterRow>

      {files.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Database aria-hidden />
            </EmptyMedia>
            <EmptyTitle>No data files yet</EmptyTitle>
            <EmptyDescription>
              Upload raw data, spreadsheets, and images to an experiment and they'll
              show up here, browsable across every project.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : filteredFiles.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground">
          <p>No data files match the selected filters.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setProjectFilter(FILTER_ALL)
              setExperimentFilter(FILTER_ALL)
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : effectiveViewMode === "grid" ? (
        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
          {filteredFiles.map((file) => (
            <Card
              key={file.id}
              ribbon="var(--kind-experiment)"
              className="bg-card hover:border-primary hover:shadow-md transition-all duration-200 motion-safe:hover:-translate-y-0.5 animate-n9-turn-in flex flex-col min-w-0 overflow-hidden cursor-pointer"
              onClick={() => openFileRow(file)}
            >
              <CardHeader className="pb-3 min-w-0">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {getFileIcon(file.file_name, file.file_type, "h-5 w-5")}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1 overflow-hidden">
                    <CardTitle
                      className="text-base text-foreground leading-tight min-w-0 overflow-hidden text-ellipsis"
                      title={file.file_name}
                    >
                      {file.file_name}
                    </CardTitle>
                    {file.project_name && (
                      <CardDescription className="text-xs truncate">
                        {file.project_name}
                      </CardDescription>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 gap-2 min-w-0">
                  {file.data_type && (
                    <Badge variant="secondary" className="text-xs capitalize shrink-0">
                      {file.data_type}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {formatFileSize(file.file_size)}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 flex-1 flex flex-col pt-0 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                  {file.experiment_name && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden">
                      <span className="text-xs font-semibold shrink-0">Experiment:</span>
                      <span className="truncate text-xs">{file.experiment_name}</span>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Uploaded {formatDate(file.created_at)}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full mt-auto shrink-0">
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  <span className="truncate">Open file</span>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-foreground">All Data Files</CardTitle>
            <CardDescription>Complete list of experiment data files</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative w-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[260px]">File Name</TableHead>
                    <TableHead className="min-w-[120px]">Type</TableHead>
                    <TableHead className="min-w-[100px]">Size</TableHead>
                    <TableHead className="min-w-[120px]">Uploaded</TableHead>
                    <TableHead className="text-right min-w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.map((file) => (
                    <TableRow
                      key={file.id}
                      className="cursor-pointer"
                      onClick={() => openFileRow(file)}
                    >
                      <TableCell className="font-medium text-foreground">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-primary">
                            {getFileIcon(file.file_name, file.file_type)}
                          </span>
                          <span className="truncate" title={file.file_name}>
                            {file.file_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {file.data_type ? (
                          <Badge variant="secondary" className="capitalize">
                            {file.data_type}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground italic">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatFileSize(file.file_size)}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDate(file.created_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Open ${file.file_name}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            openFileRow(file)
                          }}
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
