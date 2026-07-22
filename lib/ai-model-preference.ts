/**
 * The user's AI model choice (Settings → Preferences → AI model).
 *
 * Stores an ABSTRACT key — "haiku" | "sonnet" | "opus" — never a concrete model
 * id. The AI service resolves the key against the active provider's manifest
 * (GET /notes9/models is the catalog), so the same stored choice keeps working
 * if the backend switches providers. No stored value = the server default
 * (Sonnet). Every agent request includes the key via
 * `buildNotes9AgentRequestBody`, so the one chosen model runs the entire task
 * and usage/credits are priced against it.
 */

export type AiModelKey = "haiku" | "sonnet" | "opus";

export const AI_MODEL_OPTIONS: Array<{
  key: AiModelKey;
  label: string;
  description: string;
}> = [
  { key: "haiku", label: "Haiku", description: "Fastest · lowest credit use" },
  { key: "sonnet", label: "Sonnet", description: "Balanced · recommended" },
  { key: "opus", label: "Opus", description: "Most capable · ~5× Sonnet credits" },
];

const STORAGE_KEY = "notes9.aiModel";
const VALID = new Set<string>(["haiku", "sonnet", "opus"]);

/** The server default when nothing is stored (mirrors the backend catalog). */
export const DEFAULT_AI_MODEL: AiModelKey = "sonnet";

export function getPreferredAiModel(): AiModelKey | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && VALID.has(v) ? (v as AiModelKey) : null;
  } catch {
    return null;
  }
}

export function setPreferredAiModel(key: AiModelKey | null): void {
  if (typeof window === "undefined") return;
  try {
    if (key === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // storage unavailable (private mode) — the choice just won't persist
  }
}
