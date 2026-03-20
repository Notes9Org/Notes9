export const DATA_TRANSFER_VERSION = "1.0.0"
export const BACKUP_ROOT_FOLDER = "notes9-export"

export const EXPORT_TABLES = [
  "projects",
  "experiments",
  "lab_notes",
  "experiment_data",
  "samples",
  "protocols",
  "equipment",
  "literature_reviews",
  "project_members",
  "experiment_protocols",
] as const

export type ExportTable = (typeof EXPORT_TABLES)[number]

export type BackupPayload = {
  version: string
  exported_at: string
  source: "Notes9"
  summary: Partial<Record<ExportTable, number>>
  tables: Partial<Record<ExportTable, Record<string, any>[]>>
}

export const DEFAULT_EXPORT_TABLES: ExportTable[] = [
  "projects",
  "experiments",
  "lab_notes",
  "experiment_data",
  "samples",
  "protocols",
  "equipment",
  "literature_reviews",
]

export function isExportTable(value: string): value is ExportTable {
  return EXPORT_TABLES.includes(value as ExportTable)
}

export function normalizeRequestedTables(value: string | null): ExportTable[] {
  if (!value?.trim()) {
    return DEFAULT_EXPORT_TABLES
  }

  const requested = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  const filtered = requested.filter(isExportTable)
  return filtered.length > 0 ? [...new Set(filtered)] : DEFAULT_EXPORT_TABLES
}

export function buildZipFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  return `notes9-export-${stamp}.zip`
}

export function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_")
}
