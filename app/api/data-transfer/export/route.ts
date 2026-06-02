import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/current-user"
import { toCsv } from "@/lib/csv"
import {
  BACKUP_ROOT_FOLDER,
  buildZipFilename,
  DATA_TRANSFER_VERSION,
  normalizeRequestedTables,
  sanitizeFileSegment,
  type ExportTable,
} from "@/lib/data-transfer"
import { textToPdf } from "@/lib/simple-pdf"
import { createZip } from "@/lib/zip"
import { USER_STORAGE_BUCKET, resolveExperimentDataStoragePath } from "@/lib/user-storage-bucket"

type ProjectRow = Record<string, any>
type ExperimentRow = Record<string, any>

export async function GET(req: NextRequest) {
  const supabase = await createClient()

  const user = await getCurrentUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const selectedTables = normalizeRequestedTables(
    new URL(req.url).searchParams.get("tables"),
  )
  const selectedSet = new Set(selectedTables)
  const warnings: string[] = []
  const summary: Partial<Record<ExportTable, number>> = {}

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  if (profileError || !profile?.organization_id) {
    return NextResponse.json(
      { error: "Unable to resolve your organization context." },
      { status: 400 },
    )
  }

  const { data: projectsData, error: projectsError } = await supabase
    .from("projects")
    .select("*")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: true })

  if (projectsError) {
    return NextResponse.json({ error: projectsError.message }, { status: 500 })
  }

  const projects = projectsData ?? []
  summary.projects = projects.length

  const projectIds = projects.map((project) => project.id)
  const experiments = await fetchExperiments(supabase, projectIds, warnings)
  summary.experiments = experiments.length

  const experimentIds = experiments.map((experiment) => experiment.id)

  // Every remaining table read depends only on already-known ids (projectIds,
  // experimentIds, organization_id) — issue them concurrently instead of as
  // eight sequential round-trips.
  const [
    labNotes,
    protocols,
    experimentProtocols,
    experimentFiles,
    samples,
    equipment,
    literature,
    projectMembers,
  ] = await Promise.all([
    fetchRows(
      supabase,
      "lab_notes",
      projectIds.length > 0
        ? supabase.from("lab_notes").select("*").in("project_id", projectIds)
        : supabase.from("lab_notes").select("*").eq("created_by", user.id),
      warnings,
    ),
    fetchRows(
      supabase,
      "protocols",
      supabase
        .from("protocols")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: true }),
      warnings,
    ),
    fetchRows(
      supabase,
      "experiment_protocols",
      experimentIds.length > 0
        ? supabase.from("experiment_protocols").select("*").in("experiment_id", experimentIds)
        : supabase.from("experiment_protocols").select("*").limit(0),
      warnings,
    ),
    fetchRows(
      supabase,
      "experiment_data",
      experimentIds.length > 0
        ? supabase.from("experiment_data").select("*").in("experiment_id", experimentIds)
        : supabase.from("experiment_data").select("*").limit(0),
      warnings,
    ),
    fetchRows(
      supabase,
      "samples",
      experimentIds.length > 0
        ? supabase.from("samples").select("*").in("experiment_id", experimentIds)
        : supabase.from("samples").select("*").limit(0),
      warnings,
    ),
    fetchRows(
      supabase,
      "equipment",
      supabase
        .from("equipment")
        .select("*")
        .eq("organization_id", profile.organization_id),
      warnings,
    ),
    fetchRows(
      supabase,
      "literature_reviews",
      supabase
        .from("literature_reviews")
        .select("*")
        .eq("organization_id", profile.organization_id),
      warnings,
    ),
    fetchRows(
      supabase,
      "project_members",
      projectIds.length > 0
        ? supabase.from("project_members").select("*").in("project_id", projectIds)
        : supabase.from("project_members").select("*").limit(0),
      warnings,
    ),
  ])
  summary.lab_notes = labNotes.length
  summary.protocols = protocols.length
  summary.experiment_protocols = experimentProtocols.length
  summary.experiment_data = experimentFiles.length
  summary.samples = samples.length
  summary.equipment = equipment.length
  summary.literature_reviews = literature.length
  summary.project_members = projectMembers.length

  const projectById = new Map<string, ProjectRow>()
  for (const project of projects) projectById.set(project.id, project)
  const experimentById = new Map<string, ExperimentRow>()
  for (const experiment of experiments) experimentById.set(experiment.id, experiment)

  const zipEntries: Array<{ name: string; data: string | Uint8Array }> = []
  const manifest = {
    version: DATA_TRANSFER_VERSION,
    exported_at: new Date().toISOString(),
    source: "Notes9",
    selected_tables: selectedTables,
    summary,
    warnings,
  }

  zipEntries.push({
    name: `${BACKUP_ROOT_FOLDER}/manifest.json`,
    data: JSON.stringify(manifest, null, 2),
  })

  if (selectedSet.has("projects")) {
    for (const project of projects) {
      const projectPath = projectFolderPath(project)
      zipEntries.push({
        name: `${projectPath}/project.json`,
        data: JSON.stringify(project, null, 2),
      })
    }
  }

  if (selectedSet.has("experiments")) {
    for (const experiment of experiments) {
      const experimentPath = experimentFolderPath(experiment, projectById.get(experiment.project_id))
      zipEntries.push({
        name: `${experimentPath}/experiment.json`,
        data: JSON.stringify(experiment, null, 2),
      })
    }
  }

  if (selectedSet.has("lab_notes")) {
    for (const note of labNotes) {
      const experiment = note.experiment_id ? experimentById.get(note.experiment_id) : null
      const project = note.project_id
        ? projectById.get(note.project_id)
        : experiment
          ? projectById.get(experiment.project_id)
          : null
      const basePath = experiment
        ? experimentFolderPath(experiment, project)
        : project
          ? `${projectFolderPath(project)}/lab-notes`
          : `${BACKUP_ROOT_FOLDER}/unassigned/lab-notes`
      const pdfName = `${sanitizeFileSegment(note.title || note.id || "note")}-${note.id}.pdf`

      zipEntries.push({
        name: `${basePath}/lab-notes/${pdfName}`,
        data: textToPdf(
          `${note.title || "Lab Note"}\n\n${stripHtml(note.content || "")}`,
          note.title || "Lab Note",
        ),
      })

      zipEntries.push({
        name: `${basePath}/lab-notes/${sanitizeFileSegment(note.title || note.id || "note")}-${note.id}.json`,
        data: JSON.stringify(note, null, 2),
      })
    }
  }

  if (selectedSet.has("protocols")) {
    // Build a reverse index protocol_id -> experiment_protocol links once, so the
    // per-protocol loop is O(protocols + experimentProtocols) instead of
    // O(protocols * experimentProtocols).
    const protocolToExperiments = new Map<string, ExperimentRow[]>()
    for (const row of experimentProtocols) {
      const key = row.protocol_id
      const existing = protocolToExperiments.get(key)
      if (existing) existing.push(row)
      else protocolToExperiments.set(key, [row])
    }
    for (const protocol of protocols) {
      const protocolPdf = textToPdf(
        `${protocol.name}\n\nVersion: ${protocol.version || "1.0"}\nCategory: ${protocol.category || "N/A"}\n\n${stripHtml(protocol.content || "")}`,
        protocol.name || "Protocol",
      )
      const protocolFileName = `${sanitizeFileSegment(protocol.name || protocol.id)}-${protocol.id}.pdf`
      zipEntries.push({
        name: `${BACKUP_ROOT_FOLDER}/protocols/${protocolFileName}`,
        data: protocolPdf,
      })
      zipEntries.push({
        name: `${BACKUP_ROOT_FOLDER}/protocols/${sanitizeFileSegment(protocol.name || protocol.id)}-${protocol.id}.json`,
        data: JSON.stringify(protocol, null, 2),
      })

      const protocolLinks = protocolToExperiments.get(protocol.id)
      if (protocolLinks) {
        for (const link of protocolLinks) {
          const experiment = experimentById.get(link.experiment_id)
          if (!experiment) continue
          const project = projectById.get(experiment.project_id)
          zipEntries.push({
            name: `${experimentFolderPath(experiment, project)}/protocols/${protocolFileName}`,
            data: protocolPdf,
          })
        }
      }
    }
  }

  if (selectedSet.has("experiment_data")) {
    for (const row of experimentFiles) {
      const experiment = experimentById.get(row.experiment_id)
      if (!experiment) continue
      const project = projectById.get(experiment.project_id)
      const fileBytes = await downloadExperimentFile(supabase, row, warnings)
      if (!fileBytes) continue

      const filePath = `${experimentFolderPath(experiment, project)}/data-files/${sanitizeFileSegment(
        row.data_type || "raw",
      )}/${sanitizeFileSegment(row.file_name || row.id || "file")}`

      zipEntries.push({
        name: filePath,
        data: fileBytes,
      })
      zipEntries.push({
        name: `${experimentFolderPath(experiment, project)}/data-files/_metadata/${row.id}.json`,
        data: JSON.stringify(row, null, 2),
      })
    }
  }

  if (selectedSet.has("samples")) {
    zipEntries.push({
      name: `${BACKUP_ROOT_FOLDER}/datasets/samples.csv`,
      data: toCsv(samples, [
        "id",
        "experiment_id",
        "sample_code",
        "sample_type",
        "description",
        "source",
        "collection_date",
        "storage_location",
        "storage_condition",
        "quantity",
        "quantity_unit",
        "status",
        "created_at",
      ]),
    })
  }

  if (selectedSet.has("equipment")) {
    zipEntries.push({
      name: `${BACKUP_ROOT_FOLDER}/datasets/equipment.csv`,
      data: toCsv(equipment, [
        "id",
        "name",
        "equipment_code",
        "category",
        "manufacturer",
        "model",
        "serial_number",
        "location",
        "status",
        "next_maintenance_date",
        "purchase_date",
        "notes",
        "created_at",
      ]),
    })
  }

  if (selectedSet.has("literature_reviews")) {
    zipEntries.push({
      name: `${BACKUP_ROOT_FOLDER}/datasets/literature_reviews.csv`,
      data: toCsv(literature, [
        "id",
        "title",
        "authors",
        "journal",
        "publication_year",
        "doi",
        "pmid",
        "url",
        "status",
        "project_id",
        "experiment_id",
        "created_at",
      ]),
    })
    for (const row of literature) {
      const pdfBytes = textToPdf(
        `${row.title}\n\nAuthors: ${row.authors || "N/A"}\nJournal: ${row.journal || "N/A"}\nDOI: ${row.doi || "N/A"}\nURL: ${row.url || "N/A"}\n\nAbstract:\n${stripHtml(row.abstract || "")}\n\nNotes:\n${stripHtml(row.personal_notes || "")}`,
        row.title || "Literature",
      )
      zipEntries.push({
        name: `${BACKUP_ROOT_FOLDER}/literature/${sanitizeFileSegment(row.title || row.id)}-${row.id}.pdf`,
        data: pdfBytes,
      })
    }
  }

  if (selectedSet.has("project_members")) {
    zipEntries.push({
      name: `${BACKUP_ROOT_FOLDER}/datasets/project_members.csv`,
      data: toCsv(projectMembers, ["id", "project_id", "user_id", "role", "added_at"]),
    })
  }

  if (selectedSet.has("experiment_protocols")) {
    zipEntries.push({
      name: `${BACKUP_ROOT_FOLDER}/datasets/experiment_protocols.csv`,
      data: toCsv(experimentProtocols, ["id", "experiment_id", "protocol_id", "added_at"]),
    })
  }

  const zipBytes = createZip(zipEntries)
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength)
  new Uint8Array(zipBuffer).set(zipBytes)
  const zipBlob = new Blob([zipBuffer], { type: "application/zip" })

  return new NextResponse(zipBlob, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${buildZipFilename()}"`,
      "Cache-Control": "no-store",
    },
  })
}

async function fetchExperiments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectIds: string[],
  warnings: string[],
) {
  if (projectIds.length === 0) return []
  return fetchRows(
    supabase,
    "experiments",
    supabase
      .from("experiments")
      .select("*")
      .in("project_id", projectIds)
      .order("created_at", { ascending: true }),
    warnings,
  )
}

async function fetchRows(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  label: string,
  query: PromiseLike<{ data: any[] | null; error: { message: string } | null }>,
  warnings: string[],
) {
  const { data, error } = await query
  if (error) {
    warnings.push(`Failed to fetch "${label}": ${error.message}`)
    return []
  }
  return data ?? []
}

function projectFolderPath(project: ProjectRow) {
  const projectName = sanitizeFileSegment(project.name || `project-${project.id}`)
  return `${BACKUP_ROOT_FOLDER}/projects/${projectName}-${project.id}`
}

function experimentFolderPath(experiment: ExperimentRow, project?: ProjectRow | null) {
  const experimentName = sanitizeFileSegment(experiment.name || `experiment-${experiment.id}`)
  if (!project) {
    return `${BACKUP_ROOT_FOLDER}/projects/_unassigned/experiments/${experimentName}-${experiment.id}`
  }
  return `${projectFolderPath(project)}/experiments/${experimentName}-${experiment.id}`
}

async function downloadExperimentFile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: Record<string, any>,
  warnings: string[],
) {
  const storagePath = resolveExperimentDataStoragePath({
    file_url: typeof row.file_url === "string" ? row.file_url : "",
    metadata: row.metadata,
  })

  if (!storagePath) {
    warnings.push(`Missing storage path for experiment_data row ${row.id}`)
    return null
  }

  const { data, error } = await supabase.storage.from(USER_STORAGE_BUCKET).download(storagePath)

  if (error || !data) {
    warnings.push(`Failed to download file ${row.file_name || row.id}: ${error?.message || "unknown error"}`)
    return null
  }

  const buffer = await data.arrayBuffer()
  return new Uint8Array(buffer)
}

function stripHtml(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
