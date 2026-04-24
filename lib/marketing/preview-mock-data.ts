import type { ResearchMapResponse } from "@/lib/research-map-types"

/** Aligns with preview workflow + research-map static graph node ids. */
export const PREVIEW_HERO_PROJECT = "Cardiac fibrosis — compound screen"
export const PREVIEW_HERO_EXPERIMENT = "Dose-response run #3"
export const PREVIEW_LITERATURE_TITLE = "Smith et al. — TGF-β fibrosis (2022)"

export type PreviewProjectRow = {
  id: string
  name: string
  description: string | null
  status: string
  priority: string | null
  created_at: string
  no_of_members: number
  no_of_experiments: number
}

export const PREVIEW_PROJECTS: PreviewProjectRow[] = [
  {
    id: "prev-proj-1",
    name: PREVIEW_HERO_PROJECT,
    description: "Screen compounds for anti-fibrotic signal in primary cardiac cells; compare to reference inhibitor.",
    status: "active",
    priority: "high",
    created_at: "2026-01-12T12:00:00.000Z",
    no_of_members: 3,
    no_of_experiments: 2,
  },
  {
    id: "prev-proj-2",
    name: "Metabolic stress — pilot",
    description: "Exploratory stress pathway profiling (sample project).",
    status: "planning",
    priority: "medium",
    created_at: "2026-02-03T09:00:00.000Z",
    no_of_members: 2,
    no_of_experiments: 1,
  },
  {
    id: "prev-proj-3",
    name: "Neuroinflammation biomarker review",
    description: "Literature-driven target list for a future collaboration (sample).",
    status: "on_hold",
    priority: "low",
    created_at: "2025-11-20T16:00:00.000Z",
    no_of_members: 4,
    no_of_experiments: 0,
  },
]

/** Subgraph scoped to the hero project (node id p1) for the project filter. */
const PREVIEW_RESEARCH_SUBGRAPHS: Record<string, ResearchMapResponse> = {
  all: {
    truncated: false,
    nodes: [
      { id: "p1", kind: "project", label: PREVIEW_HERO_PROJECT },
      { id: "p2", kind: "project", label: "Metabolic stress — pilot" },
      { id: "e1", kind: "experiment", label: PREVIEW_HERO_EXPERIMENT },
      { id: "e2", kind: "experiment", label: "Hit confirmation (week 2)" },
      { id: "e3", kind: "experiment", label: "Metabolic pilot run" },
      { id: "pr1", kind: "protocol", label: "Cardiac cell assay v2.1" },
      { id: "l1", kind: "literature", label: PREVIEW_LITERATURE_TITLE },
      { id: "n1", kind: "lab_note", label: "Bench observation — Dose run #3" },
      { id: "pub1", kind: "paper", label: "Draft: compound screen summary" },
    ],
    edges: [
      { id: "p1e1", source: "p1", target: "e1", kind: "scope", label: "RUNS" },
      { id: "p1e2", source: "p1", target: "e2", kind: "scope", label: "RUNS" },
      { id: "e1pr1", source: "e1", target: "pr1", kind: "uses", label: "USES" },
      { id: "e1n1", source: "e1", target: "n1", kind: "log", label: "NOTES" },
      { id: "l1e1", source: "l1", target: "e1", kind: "cites", label: "CITES" },
      { id: "pub1p1", source: "pub1", target: "p1", kind: "for", label: "FOR" },
      { id: "p2e3", source: "p2", target: "e3", kind: "scope", label: "RUNS" },
    ],
  },
  "prev-proj-1": {
    truncated: false,
    nodes: [
      { id: "p1", kind: "project", label: PREVIEW_HERO_PROJECT },
      { id: "e1", kind: "experiment", label: PREVIEW_HERO_EXPERIMENT },
      { id: "e2", kind: "experiment", label: "Hit confirmation (week 2)" },
      { id: "pr1", kind: "protocol", label: "Cardiac cell assay v2.1" },
      { id: "l1", kind: "literature", label: PREVIEW_LITERATURE_TITLE },
      { id: "n1", kind: "lab_note", label: "Bench observation — Dose run #3" },
      { id: "pub1", kind: "paper", label: "Draft: compound screen summary" },
    ],
    edges: [
      { id: "p1e1", source: "p1", target: "e1", kind: "scope", label: "RUNS" },
      { id: "p1e2", source: "p1", target: "e2", kind: "scope", label: "RUNS" },
      { id: "e1pr1", source: "e1", target: "pr1", kind: "uses", label: "USES" },
      { id: "e1n1", source: "e1", target: "n1", kind: "log", label: "NOTES" },
      { id: "l1e1", source: "l1", target: "e1", kind: "cites", label: "CITES" },
      { id: "pub1p1", source: "pub1", target: "p1", kind: "for", label: "FOR" },
    ],
  },
  "prev-proj-2": {
    truncated: false,
    nodes: [
      { id: "p2", kind: "project", label: "Metabolic stress — pilot" },
      { id: "e3", kind: "experiment", label: "Metabolic pilot run" },
    ],
    edges: [{ id: "p2e3", source: "p2", target: "e3", kind: "scope", label: "RUNS" }],
  },
  "prev-proj-3": {
    truncated: false,
    nodes: [{ id: "p3", kind: "project", label: "Neuroinflammation biomarker review" }],
    edges: [],
  },
}

export function getPreviewResearchMapPayload(
  projectFilterId: "all" | string,
): ResearchMapResponse {
  if (projectFilterId === "all" || !PREVIEW_RESEARCH_SUBGRAPHS[projectFilterId]) {
    return PREVIEW_RESEARCH_SUBGRAPHS.all
  }
  return PREVIEW_RESEARCH_SUBGRAPHS[projectFilterId]
}
