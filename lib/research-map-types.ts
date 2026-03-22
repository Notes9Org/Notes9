export type ResearchMapNodeKind =
  | "project"
  | "experiment"
  | "protocol"
  | "literature"
  | "lab_note"

export interface ResearchMapNode {
  id: string
  kind: ResearchMapNodeKind
  label: string
  href?: string
  meta?: Record<string, string | number | null | undefined>
}

export interface ResearchMapEdge {
  id: string
  source: string
  target: string
  kind: string
  label: string
}

export interface ResearchMapResponse {
  nodes: ResearchMapNode[]
  edges: ResearchMapEdge[]
  truncated: boolean
  truncatedReason?: string
}
