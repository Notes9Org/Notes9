import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { normalizeRequestedTables, type BackupPayload, type ExportTable } from "@/lib/data-transfer"
import {
  USER_STORAGE_BUCKET,
  createExperimentDataStoragePath,
  createUserDataTransferStagingPath,
} from "@/lib/user-storage-bucket"

type DbRow = Record<string, any>
type ImportCategory =
  | "data_file"
  | "lab_note_document"
  | "protocol_document"
  | "literature_document"

type ImportReport = {
  inserted: Partial<Record<ExportTable | "files", number>>
  skipped: Partial<Record<ExportTable | "files", number>>
  failed: Array<{ table: ExportTable | "files"; reason: string; row_id?: string }>
  warnings: string[]
}

type FolderImportMapping = {
  projects: Array<{ key: string; name: string }>
  experiments: Array<{ key: string; name: string; projectKey: string }>
  files: Array<{
    key: string
    field: string
    relativePath: string
    category: ImportCategory
    projectKey?: string | null
    experimentKey?: string | null
  }>
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const profileResult = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .single()

  if (profileResult.error || !profileResult.data?.organization_id) {
    return NextResponse.json(
      { error: "Unable to resolve your organization context." },
      { status: 400 },
    )
  }
  const organizationId = profileResult.data.organization_id

  const contentType = req.headers.get("content-type") ?? ""
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData()
    const mode = asString(formData.get("mode")) || "research-folder"
    if (mode === "research-folder") {
      return importResearchFolder({ supabase, formData, userId: user.id, organizationId })
    }
    return NextResponse.json({ error: "Unsupported multipart import mode." }, { status: 400 })
  }

  const parsed = await parseJsonImport(req)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const result = await importFromBackup({
    supabase,
    backup: parsed.backup,
    tables: parsed.tables,
    userId: user.id,
    organizationId,
  })
  return NextResponse.json(result)
}

async function importResearchFolder({
  supabase,
  formData,
  userId,
  organizationId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  formData: FormData
  userId: string
  organizationId: string
}) {
  const mappingRaw = formData.get("mapping")
  if (typeof mappingRaw !== "string") {
    return NextResponse.json({ error: "Missing import mapping." }, { status: 400 })
  }

  let mapping: FolderImportMapping
  try {
    mapping = JSON.parse(mappingRaw) as FolderImportMapping
  } catch {
    return NextResponse.json({ error: "Invalid mapping JSON." }, { status: 400 })
  }

  if (!Array.isArray(mapping.projects) || !Array.isArray(mapping.experiments) || !Array.isArray(mapping.files)) {
    return NextResponse.json({ error: "Invalid mapping payload." }, { status: 400 })
  }

  const report: ImportReport = {
    inserted: {},
    skipped: {},
    failed: [],
    warnings: [],
  }
  const projectIdByKey = new Map<string, string>()
  const experimentIdByKey = new Map<string, string>()
  const defaultExperimentByProjectId = new Map<string, string>()

  for (const project of mapping.projects) {
    if (!project.key || !project.name?.trim()) continue
    const projectId = await ensureProjectId({
      supabase,
      name: project.name.trim(),
      organizationId,
      userId,
    })
    if (!projectId) {
      report.failed.push({
        table: "projects",
        reason: `Unable to create/find project "${project.name}"`,
      })
      continue
    }
    projectIdByKey.set(project.key, projectId)
  }

  for (const experiment of mapping.experiments) {
    const projectId = projectIdByKey.get(experiment.projectKey)
    if (!projectId || !experiment.name?.trim() || !experiment.key) continue
    const experimentId = await ensureExperimentId({
      supabase,
      name: experiment.name.trim(),
      projectId,
      userId,
    })
    if (!experimentId) {
      report.failed.push({
        table: "experiments",
        reason: `Unable to create/find experiment "${experiment.name}"`,
      })
      continue
    }
    experimentIdByKey.set(experiment.key, experimentId)
  }

  for (const fileEntry of mapping.files) {
    const file = formData.get(fileEntry.field)
    if (!(file instanceof File)) {
      report.skipped.files = (report.skipped.files ?? 0) + 1
      report.warnings.push(`Missing file for path ${fileEntry.relativePath}`)
      continue
    }

    let projectId = fileEntry.projectKey ? projectIdByKey.get(fileEntry.projectKey) ?? null : null
    let experimentId = fileEntry.experimentKey
      ? experimentIdByKey.get(fileEntry.experimentKey) ?? null
      : null

    if (!projectId && experimentId) {
      const experiment = await supabase
        .from("experiments")
        .select("project_id")
        .eq("id", experimentId)
        .maybeSingle()
      projectId = experiment.data?.project_id ?? null
    }

    if (!projectId) {
      projectId = await ensureProjectId({
        supabase,
        name: "Imported Workspace",
        organizationId,
        userId,
      })
      if (!projectId) {
        report.failed.push({
          table: "files",
          reason: `Could not resolve project for ${file.name}`,
          row_id: fileEntry.key,
        })
        continue
      }
    }

    if (!experimentId && shouldAttachToExperiment(fileEntry.category)) {
      experimentId = await ensureDefaultExperiment({
        supabase,
        projectId,
        userId,
        cache: defaultExperimentByProjectId,
      })
    }

    const dataFileId = crypto.randomUUID()
    const storagePath =
      experimentId != null
        ? createExperimentDataStoragePath(organizationId, experimentId, dataFileId, sanitizeFileName(file.name))
        : createUserDataTransferStagingPath(userId, dataFileId, sanitizeFileName(file.name))

    const upload = await supabase.storage
      .from(USER_STORAGE_BUCKET)
      .upload(storagePath, file, { cacheControl: "3600", upsert: false })

    if (upload.error) {
      report.failed.push({
        table: "files",
        reason: `Upload failed for ${file.name}: ${upload.error.message}`,
        row_id: fileEntry.key,
      })
      continue
    }

    const { data: publicUrlData } = supabase.storage.from(USER_STORAGE_BUCKET).getPublicUrl(storagePath)
    const fileUrl = publicUrlData.publicUrl

    try {
      await persistImportedFile({
        supabase,
        file,
        fileUrl,
        storagePath,
        dataFileId,
        projectId,
        experimentId,
        category: fileEntry.category,
        organizationId,
        userId,
      })
      report.inserted.files = (report.inserted.files ?? 0) + 1
    } catch (error: any) {
      report.failed.push({
        table: "files",
        reason: error.message || `Failed to persist metadata for ${file.name}`,
        row_id: fileEntry.key,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "research-folder",
    report,
  })
}

async function persistImportedFile({
  supabase,
  file,
  fileUrl,
  storagePath,
  dataFileId,
  projectId,
  experimentId,
  category,
  organizationId,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  file: File
  fileUrl: string
  storagePath: string
  dataFileId: string
  projectId: string
  experimentId: string | null
  category: ImportCategory
  organizationId: string
  userId: string
}) {
  const baseName = stripExtension(file.name)

  if (category === "lab_note_document") {
    const { error } = await supabase.from("lab_notes").insert({
      title: baseName || "Imported Lab Note",
      content: `Imported file: <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">${file.name}</a>`,
      note_type: "general",
      experiment_id: experimentId,
      project_id: projectId,
      created_by: userId,
    })
    if (error) throw error
    return
  }

  if (category === "protocol_document") {
    const protocol = await supabase
      .from("protocols")
      .insert({
        organization_id: organizationId,
        name: baseName || "Imported Protocol",
        description: `Imported from file ${file.name}`,
        content: `Imported file: <a href="${fileUrl}" target="_blank" rel="noopener noreferrer">${file.name}</a>`,
        category: "Imported",
        is_active: true,
        created_by: userId,
      })
      .select("id")
      .single()
    if (protocol.error) throw protocol.error

    if (experimentId && protocol.data?.id) {
      await supabase.from("experiment_protocols").insert({
        experiment_id: experimentId,
        protocol_id: protocol.data.id,
      })
    }
    return
  }

  if (category === "literature_document") {
    const { error } = await supabase.from("literature_reviews").insert({
      organization_id: organizationId,
      title: baseName || "Imported Literature",
      url: fileUrl,
      status: "saved",
      catalog_placement: "repository",
      project_id: projectId,
      experiment_id: experimentId,
      created_by: userId,
      personal_notes: `Imported file: ${file.name}`,
    })
    if (error) throw error
    return
  }

  if (!experimentId) {
    throw new Error(`No experiment target for data file "${file.name}"`)
  }

  const { error } = await supabase.from("experiment_data").insert({
    id: dataFileId,
    experiment_id: experimentId,
    data_type: inferDataType(file),
    file_name: file.name,
    file_url: fileUrl,
    file_size: file.size,
    file_type: file.type || null,
    uploaded_by: userId,
    metadata: {
      source: "data-transfer-import",
      storage_path: storagePath,
    },
  })
  if (error) throw error
}

function shouldAttachToExperiment(category: ImportCategory) {
  return (
    category === "data_file" ||
    category === "lab_note_document" ||
    category === "protocol_document"
  )
}

function inferDataType(file: File) {
  const type = file.type.toLowerCase()
  const name = file.name.toLowerCase()
  if (type.startsWith("image/")) return "visualization"
  if (type.includes("spreadsheet") || type.includes("csv") || name.endsWith(".csv") || name.endsWith(".xlsx")) {
    return "processed"
  }
  if (name.endsWith(".json") || name.endsWith(".xml")) return "analysis"
  return "raw"
}

async function ensureProjectId({
  supabase,
  name,
  organizationId,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  name: string
  organizationId: string
  userId: string
}) {
  const inserted = await supabase
    .from("projects")
    .insert({
      name,
      organization_id: organizationId,
      created_by: userId,
      status: "planning",
      priority: "medium",
    })
    .select("id")
    .single()

  if (!inserted.error && inserted.data?.id) {
    await supabase.from("project_members").insert({
      project_id: inserted.data.id,
      user_id: userId,
      role: "lead",
    })
    return inserted.data.id
  }

  const existing = await supabase
    .from("projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", name)
    .maybeSingle()

  return existing.data?.id ?? null
}

async function ensureExperimentId({
  supabase,
  name,
  projectId,
  userId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  name: string
  projectId: string
  userId: string
}) {
  const inserted = await supabase
    .from("experiments")
    .insert({
      name,
      project_id: projectId,
      status: "planned",
      created_by: userId,
      assigned_to: userId,
    })
    .select("id")
    .single()

  if (!inserted.error && inserted.data?.id) {
    return inserted.data.id
  }

  const existing = await supabase
    .from("experiments")
    .select("id")
    .eq("project_id", projectId)
    .eq("name", name)
    .maybeSingle()

  return existing.data?.id ?? null
}

async function ensureDefaultExperiment({
  supabase,
  projectId,
  userId,
  cache,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  projectId: string
  userId: string
  cache: Map<string, string>
}) {
  const cached = cache.get(projectId)
  if (cached) return cached
  const name = "Imported Files"
  const experimentId = await ensureExperimentId({
    supabase,
    name,
    projectId,
    userId,
  })
  if (experimentId) cache.set(projectId, experimentId)
  return experimentId
}

async function importFromBackup({
  supabase,
  backup,
  tables,
  userId,
  organizationId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>
  backup: BackupPayload
  tables: string | null
  userId: string
  organizationId: string
}) {
  const requestedTables = normalizeRequestedTables(tables)
  const payloadTables = backup.tables ?? {}

  const report: ImportReport = {
    inserted: {},
    skipped: {},
    failed: [],
    warnings: [],
  }
  const projectIdMap = new Map<string, string>()
  const experimentIdMap = new Map<string, string>()
  const protocolIdMap = new Map<string, string>()

  const projectRows = getRows(payloadTables.projects)
  const protocolRows = getRows(payloadTables.protocols)
  const experimentRows = getRows(payloadTables.experiments)
  const labNoteRows = getRows(payloadTables.lab_notes)
  const experimentDataRows = getRows(payloadTables.experiment_data)
  const sampleRows = getRows(payloadTables.samples)
  const equipmentRows = getRows(payloadTables.equipment)
  const literatureRows = getRows(payloadTables.literature_reviews)
  const projectMemberRows = getRows(payloadTables.project_members)
  const experimentProtocolRows = getRows(payloadTables.experiment_protocols)

  const hasProjectPayload = projectRows.length > 0
  const hasExperimentPayload = experimentRows.length > 0
  const hasProtocolPayload = protocolRows.length > 0

  const shouldImport = (table: ExportTable) =>
    requestedTables.includes(table) && Array.isArray(payloadTables[table])

  if (shouldImport("projects")) {
    await importRows("projects", projectRows, async (row) => {
      const normalized = cleanRow(row)
      normalized.organization_id = organizationId
      if ("created_by" in normalized) normalized.created_by = userId
      return { action: "insert", row: normalized }
    })
  }

  if (shouldImport("protocols")) {
    await importRows("protocols", protocolRows, async (row) => {
      const normalized = cleanRow(row)
      normalized.organization_id = organizationId
      if ("created_by" in normalized) normalized.created_by = userId
      return { action: "insert", row: normalized }
    })
  }

  if (shouldImport("experiments")) {
    await importRows("experiments", experimentRows, async (row) => {
      const normalized = cleanRow(row)
      if (row.project_id) {
        const mappedProject = projectIdMap.get(row.project_id)
        if (mappedProject) normalized.project_id = mappedProject
        else if (hasProjectPayload) {
          return { action: "skip", reason: "Missing mapped project for experiment." }
        }
      }
      if ("created_by" in normalized) normalized.created_by = userId
      if ("assigned_to" in normalized) normalized.assigned_to = userId
      return { action: "insert", row: normalized }
    })
  }

  if (shouldImport("lab_notes")) {
    await importRows("lab_notes", labNoteRows, async (row) => {
      const normalized = cleanRow(row)
      if (row.experiment_id) {
        const mappedExperiment = experimentIdMap.get(row.experiment_id)
        if (mappedExperiment) normalized.experiment_id = mappedExperiment
        else if (hasExperimentPayload) {
          return { action: "skip", reason: "Missing mapped experiment for lab note." }
        }
      }
      if ("created_by" in normalized) normalized.created_by = userId
      return { action: "insert", row: normalized }
    })
  }

  if (shouldImport("experiment_data")) {
    await importRows("experiment_data", experimentDataRows, async (row) => {
      const normalized = cleanRow(row)
      if (row.experiment_id) {
        const mappedExperiment = experimentIdMap.get(row.experiment_id)
        if (mappedExperiment) {
          normalized.experiment_id = mappedExperiment
        } else if (hasExperimentPayload) {
          return { action: "skip", reason: "Missing mapped experiment for data file." }
        }
      }
      if ("uploaded_by" in normalized) normalized.uploaded_by = userId
      return { action: "insert", row: normalized }
    })
  }

  if (shouldImport("samples")) {
    await importRows("samples", sampleRows, async (row) => {
      const normalized = cleanRow(row)
      if (row.experiment_id) {
        const mappedExperiment = experimentIdMap.get(row.experiment_id)
        if (mappedExperiment) normalized.experiment_id = mappedExperiment
        else if (hasExperimentPayload) {
          return { action: "skip", reason: "Missing mapped experiment for sample." }
        }
      }
      if ("created_by" in normalized) normalized.created_by = userId
      return { action: "insert", row: normalized }
    })
  }

  if (shouldImport("equipment")) {
    await importRows("equipment", equipmentRows, async (row) => {
      const normalized = cleanRow(row)
      normalized.organization_id = organizationId
      return { action: "insert", row: normalized }
    })
  }

  if (shouldImport("literature_reviews")) {
    await importRows("literature_reviews", literatureRows, async (row) => {
      const normalized = cleanRow(row)
      normalized.organization_id = organizationId
      if ("created_by" in normalized) normalized.created_by = userId
      if (row.project_id && projectIdMap.has(row.project_id)) {
        normalized.project_id = projectIdMap.get(row.project_id)
      }
      if (row.experiment_id && experimentIdMap.has(row.experiment_id)) {
        normalized.experiment_id = experimentIdMap.get(row.experiment_id)
      }
      return { action: "insert", row: normalized }
    })
  }

  if (shouldImport("project_members")) {
    await importRows("project_members", projectMemberRows, async (row) => {
      const normalized = cleanRow(row)
      if (row.project_id) {
        const mappedProject = projectIdMap.get(row.project_id)
        if (!mappedProject && hasProjectPayload) {
          return { action: "skip", reason: "Missing mapped project for project member row." }
        }
        if (mappedProject) normalized.project_id = mappedProject
      }
      normalized.user_id = userId
      return { action: "insert", row: normalized }
    })
  }

  if (shouldImport("experiment_protocols")) {
    await importRows("experiment_protocols", experimentProtocolRows, async (row) => {
      const normalized = cleanRow(row)
      if (row.experiment_id) {
        const mappedExperiment = experimentIdMap.get(row.experiment_id)
        if (!mappedExperiment && hasExperimentPayload) {
          return { action: "skip", reason: "Missing mapped experiment for protocol link." }
        }
        if (mappedExperiment) normalized.experiment_id = mappedExperiment
      }
      if (row.protocol_id) {
        const mappedProtocol = protocolIdMap.get(row.protocol_id)
        if (!mappedProtocol && hasProtocolPayload) {
          return { action: "skip", reason: "Missing mapped protocol for experiment link." }
        }
        if (mappedProtocol) normalized.protocol_id = mappedProtocol
      }
      return { action: "insert", row: normalized }
    })
  }

  return { ok: true, mode: "json-backup", report, imported_tables: requestedTables }

  async function importRows(
    table: ExportTable,
    rows: DbRow[],
    transform: (row: DbRow) => Promise<
      | { action: "skip"; reason: string }
      | { action: "insert"; row: DbRow }
    >,
  ) {
    report.inserted[table] = report.inserted[table] ?? 0
    report.skipped[table] = report.skipped[table] ?? 0

    for (const rawRow of rows) {
      const oldId = typeof rawRow.id === "string" && rawRow.id.length > 0 ? rawRow.id : undefined

      const transformed = await transform(rawRow)
      if (transformed.action === "skip") {
        report.skipped[table] = (report.skipped[table] ?? 0) + 1
        report.warnings.push(`${table}: ${transformed.reason}`)
        continue
      }

      const hasIdColumn = table !== "project_members" && table !== "experiment_protocols"
      const { data, error } = hasIdColumn
        ? await supabase.from(table).insert(transformed.row).select("id").single()
        : await supabase.from(table).insert(transformed.row).select().maybeSingle()

      if (error) {
        if (isDuplicateError(error.message, error.code)) {
          report.skipped[table] = (report.skipped[table] ?? 0) + 1
          if (oldId) {
            const resolvedId = await resolveExistingId(table, transformed.row)
            if (resolvedId) setMap(table, oldId, resolvedId)
          }
          continue
        }
        report.failed.push({ table, reason: error.message, row_id: oldId })
        continue
      }

      const newId = data?.id
      if (oldId && typeof newId === "string") {
        setMap(table, oldId, newId)
      }
      report.inserted[table] = (report.inserted[table] ?? 0) + 1
    }
  }

  function setMap(table: ExportTable, oldId: string, newId: string) {
    if (table === "projects") projectIdMap.set(oldId, newId)
    if (table === "experiments") experimentIdMap.set(oldId, newId)
    if (table === "protocols") protocolIdMap.set(oldId, newId)
  }

  async function resolveExistingId(table: ExportTable, row: DbRow) {
    if (table === "projects" && row.name) {
      const { data } = await supabase
        .from("projects")
        .select("id")
        .eq("name", row.name)
        .eq("organization_id", organizationId)
        .maybeSingle()
      return data?.id ?? null
    }

    if (table === "experiments" && row.name) {
      let query = supabase.from("experiments").select("id").eq("name", row.name)
      if (row.project_id) query = query.eq("project_id", row.project_id)
      const { data } = await query.maybeSingle()
      return data?.id ?? null
    }

    if (table === "protocols" && row.name) {
      const { data } = await supabase
        .from("protocols")
        .select("id")
        .eq("name", row.name)
        .maybeSingle()
      return data?.id ?? null
    }

    if (table === "samples" && row.sample_code) {
      const { data } = await supabase
        .from("samples")
        .select("id")
        .eq("sample_code", row.sample_code)
        .maybeSingle()
      return data?.id ?? null
    }

    return null
  }
}

function cleanRow(row: DbRow) {
  const next = { ...row }
  delete next.id
  delete next.created_at
  delete next.updated_at
  return next
}

function getRows(value: unknown): DbRow[] {
  return Array.isArray(value)
    ? value.filter((item): item is DbRow => item && typeof item === "object")
    : []
}

function isDuplicateError(message?: string, code?: string) {
  return code === "23505" || /duplicate key/i.test(message ?? "")
}

function stripExtension(name: string) {
  const index = name.lastIndexOf(".")
  return index > 0 ? name.slice(0, index) : name
}

function sanitizeFileName(value: string) {
  return value.replace(/[^\w.\-]/g, "_")
}

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : null
}

async function parseJsonImport(
  req: NextRequest,
): Promise<{ ok: true; backup: BackupPayload; tables: string | null } | { ok: false; error: string }> {
  try {
    const body = (await req.json()) as unknown
    const parsed =
      body && typeof body === "object"
        ? (body as { backup?: unknown; tables?: unknown })
        : {}
    const candidate = parsed.backup ?? body
    if (!isBackupPayload(candidate)) {
      return { ok: false, error: "Invalid backup payload." }
    }
    return {
      ok: true,
      backup: candidate,
      tables: typeof parsed.tables === "string" ? parsed.tables : null,
    }
  } catch {
    return { ok: false, error: "Unable to parse import request body." }
  }
}

function isBackupPayload(value: unknown): value is BackupPayload {
  if (!value || typeof value !== "object") return false
  const candidate = value as BackupPayload
  return !!candidate.tables && typeof candidate.tables === "object"
}
