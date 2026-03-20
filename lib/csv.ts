export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  const header = columns.map(escapeCell).join(",")
  const body = rows
    .map((row) => columns.map((column) => escapeCell(row[column])).join(","))
    .join("\n")
  return `${header}\n${body}\n`
}

function escapeCell(value: unknown) {
  const raw =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value)
  const escaped = raw.replace(/"/g, "\"\"")
  return `"${escaped}"`
}
