/**
 * User-friendly messages for unique constraint violations (Postgres 23505).
 * Used for project name (per org), experiment name (per project), lab note title (per experiment).
 */

export function getUniqueNameErrorMessage(
  error: { code?: string; message?: string },
  kind: "project" | "experiment" | "lab_note"
): string {
  if (error?.code === "23505") {
    switch (kind) {
      case "project":
        return "A project with this name already exists in your organization. Please choose a different name."
      case "experiment":
        return "An experiment with this name already exists in this project. Please choose a different name."
      case "lab_note":
        return "A lab note with this title already exists in this experiment. Please choose a different title."
      default:
        return "This name is already in use. Please choose a different one."
    }
  }
  return error?.message ?? "An error occurred."
}
