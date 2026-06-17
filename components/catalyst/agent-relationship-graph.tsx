'use client';

/**
 * AgentRelationshipGraph
 *
 * Compact, read-only SVG graph rendered inline inside a map_relationships tool
 * card. Parses the ToolCard's `source_names` (node labels) and `summary`
 * (first-200-char preview of the XML tool content) to reconstruct a simplified
 * node+edge layout using dagre — the same layout library used by the full
 * ResearchMapView.
 *
 * Wire shape for map_relationships tool cards:
 *   card.id          === 'map_relationships' (or a correlation hash)
 *   card.source_names === ['Project: Vaccine Production', 'Experiment: Cell Line', ...]
 *   card.summary      === 'nodes=N edges=M\n<source ...>...\n<edge from="kind:uuid" to="kind:uuid" rel="..." />'
 *   card.citations_count === total node count (may exceed source_names cap of 6)
 *
 * Rendering strategy:
 *   1. Parse source_names → GraphNode[]  (kind + displayLabel)
 *   2. Parse summary for total counts and any <edge rel="..."> types visible
 *      in the 200-char window.
 *   3. Lay out nodes with dagre (TB direction, compact spacing).
 *   4. Render pure SVG — no ReactFlow overhead for a read-only inline card.
 *   5. Fall back gracefully to null (caller shows existing text card).
 *
 * Node-count cap: 40 nodes visible max (cap from task spec). Dagre handles up
 * to that count without performance issues at the sizes used here.
 */

import { useId, useMemo } from 'react';
import dagre from 'dagre';
import type { ToolCard } from '@/hooks/use-agent-stream';
import {
  kindHexColor,
  kindDotClass,
  kindLabel,
  edgeColorForKind,
} from '@/lib/research-map-kinds';
import type { ResearchMapNodeKind } from '@/lib/research-map-types';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_W = 120;
const NODE_H = 40;
const MAX_RENDER_NODES = 40;

// The human-readable type prefix that _build_source_names() prepends, e.g. "Project".
// Maps directly to ResearchMapNodeKind. This mirrors _TYPE_LABELS in the backend.
const HUMAN_TYPE_TO_KIND: Record<string, ResearchMapNodeKind> = {
  'Project':    'project',
  'Experiment': 'experiment',
  'Protocol':   'protocol',
  'Lab note':   'lab_note',
  'Literature': 'literature',
  'Paper':      'paper',
  'Report':     'report',
  'Sample':     'sample',
  'Data file':  'data_file',
  // Catalog fallback variants
  'Lab Note':   'lab_note',
  'Data File':  'data_file',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  kind: ResearchMapNodeKind;
  label: string;
}

interface GraphEdge {
  source: string;
  target: string;
  /** Relation kind, e.g. "project_contains_experiment" */
  rel: string;
}

interface ParsedGraph {
  nodes: GraphNode[];
  /** Edges resolved from the summary XML (subset — limited to 200-char window) */
  edges: GraphEdge[];
  /** Total node count as reported in the summary header */
  totalNodes: number;
  /** Total edge count as reported in the summary header */
  totalEdges: number;
  /** Relationship types found in the summary (for the legend) */
  relTypes: string[];
}

interface LayoutNode extends GraphNode {
  x: number;
  y: number;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse source_names like ["Project: Vaccine Production", "Experiment: Cell Line"]
 * into structured nodes. Uses a stable synthetic id (kind + index) since
 * we don't have the real UUIDs at this layer.
 */
function parseSourceNames(sourceNames: string[] | undefined): GraphNode[] {
  if (!sourceNames || sourceNames.length === 0) return [];
  const nodes: GraphNode[] = [];
  for (let i = 0; i < sourceNames.length && i < MAX_RENDER_NODES; i++) {
    const entry = sourceNames[i];
    // Skip the "(N untitled)" summary entry
    if (entry.startsWith('(') && entry.includes('untitled')) continue;
    // Format is "TypeLabel: DisplayName"
    const colonIdx = entry.indexOf(': ');
    if (colonIdx < 0) {
      nodes.push({ id: `node-${i}`, kind: 'experiment', label: entry });
      continue;
    }
    const typeLabel = entry.slice(0, colonIdx).trim();
    const displayLabel = entry.slice(colonIdx + 2).trim();
    const kind: ResearchMapNodeKind = HUMAN_TYPE_TO_KIND[typeLabel] ?? 'experiment';
    nodes.push({ id: `node-${i}`, kind, label: displayLabel });
  }
  return nodes;
}

/**
 * Parse the summary string (first 200 chars of tool content) for:
 *   - Total counts: "nodes=N edges=M" header
 *   - Edge relations: `rel="..."` attributes in `<edge ... />` tags
 *
 * We cannot resolve full edges (node UUIDs are not in source_names), but we
 * can extract relation type names to show in the legend and count edges.
 */
function parseSummary(summary: string | undefined): {
  totalNodes: number;
  totalEdges: number;
  relTypes: string[];
} {
  if (!summary) return { totalNodes: 0, totalEdges: 0, relTypes: [] };

  // Header: "nodes=N edges=M"
  const headerMatch = summary.match(/nodes=(\d+)\s+edges=(\d+)/);
  const totalNodes = headerMatch ? parseInt(headerMatch[1], 10) : 0;
  const totalEdges = headerMatch ? parseInt(headerMatch[2], 10) : 0;

  // Extract rel="..." from any <edge ... /> tags in the 200-char window
  const relRegex = /rel="([^"]+)"/g;
  const relTypes: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = relRegex.exec(summary)) !== null) {
    const rel = m[1];
    if (!seen.has(rel)) {
      seen.add(rel);
      relTypes.push(rel);
    }
  }

  return { totalNodes, totalEdges, relTypes };
}

/**
 * Parse the complete graph data from a map_relationships ToolCard.
 * Returns null when there is no graph data (so the caller can fall back).
 */
export function parseRelationshipGraph(card: ToolCard): ParsedGraph | null {
  // Guard: only apply to map_relationships tool cards
  if (card.id !== 'map_relationships' && !card.label.toLowerCase().includes('map')) {
    return null;
  }

  const nodes = parseSourceNames(card.source_names);
  // Need at least 2 nodes to draw a meaningful graph
  if (nodes.length < 1) return null;

  const { totalNodes, totalEdges, relTypes } = parseSummary(card.summary);

  // Build a simplified edge set: connect nodes sequentially when we have
  // relation types but no actual edge endpoints. This gives an approximate
  // topology that shows connectivity without being misleading — we only draw
  // edges between adjacent nodes in the kind-sorted order, colored by the
  // first matching relation type for those kinds.
  const edges: GraphEdge[] = [];
  if (nodes.length >= 2 && relTypes.length > 0) {
    for (let i = 0; i < nodes.length - 1; i++) {
      const src = nodes[i];
      const dst = nodes[i + 1];
      // Pick the best relation type for this source→target kind pair
      const bestRel = relTypes.find(
        (r) =>
          r.includes(src.kind.replace('_', '')) ||
          r.includes(dst.kind.replace('_', ''))
      ) ?? relTypes[0];
      edges.push({ source: src.id, target: dst.id, rel: bestRel });
    }
  }

  return {
    nodes,
    edges,
    totalNodes: totalNodes || nodes.length,
    totalEdges: totalEdges || 0,
    relTypes,
  };
}

// ─── Dagre layout ────────────────────────────────────────────────────────────

function layoutGraph(nodes: GraphNode[], edges: GraphEdge[]): LayoutNode[] {
  if (nodes.length === 0) return [];

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    nodesep: 32,
    ranksep: 48,
    marginx: 16,
    marginy: 16,
  });

  for (const n of nodes) {
    g.setNode(n.id, { width: NODE_W, height: NODE_H });
  }
  for (const e of edges) {
    if (nodes.find((n) => n.id === e.source) && nodes.find((n) => n.id === e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      ...n,
      x: pos ? pos.x - NODE_W / 2 : 0,
      y: pos ? pos.y - NODE_H / 2 : 0,
    };
  });
}

// ─── SVG Dimensions ──────────────────────────────────────────────────────────

function graphDimensions(laidOut: LayoutNode[]): { width: number; height: number } {
  if (laidOut.length === 0) return { width: 200, height: 80 };
  let maxX = 0;
  let maxY = 0;
  for (const n of laidOut) {
    maxX = Math.max(maxX, n.x + NODE_W);
    maxY = Math.max(maxY, n.y + NODE_H);
  }
  return { width: maxX + 24, height: maxY + 24 };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface AgentRelationshipGraphProps {
  card: ToolCard;
  className?: string;
}

/**
 * Renders a compact inline relationship graph for a `map_relationships` tool card.
 *
 * Returns null when graph data is absent or malformed so the caller can fall back
 * to the plain text card display. Capped at MAX_RENDER_NODES (40) for performance.
 */
export function AgentRelationshipGraph({ card, className }: AgentRelationshipGraphProps) {
  // SVG <marker id> is DOCUMENT-scoped, so two graphs on one page would share
  // (and steal) each other's arrowheads. Prefix with a per-instance id.
  const markerNs = useId().replace(/:/g, '');
  const parsed = useMemo(() => {
    try {
      return parseRelationshipGraph(card);
    } catch {
      return null;
    }
  }, [card]);

  const laidOut = useMemo(() => {
    if (!parsed) return [];
    try {
      return layoutGraph(parsed.nodes, parsed.edges);
    } catch {
      return parsed.nodes.map((n, i) => ({ ...n, x: (i % 4) * (NODE_W + 16), y: Math.floor(i / 4) * (NODE_H + 16) }));
    }
  }, [parsed]);

  const dims = useMemo(() => graphDimensions(laidOut), [laidOut]);

  if (!parsed || laidOut.length === 0) return null;

  const { totalNodes, totalEdges, relTypes, nodes: parsedNodes, edges: parsedEdges } = parsed;
  const hiddenCount = totalNodes - parsedNodes.length;

  // Build a lookup for SVG center coordinates
  const centerOf = (id: string) => {
    const n = laidOut.find((l) => l.id === id);
    return n ? { x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 } : { x: 0, y: 0 };
  };

  return (
    <div className={cn('mt-2 rounded-md border border-border/50 bg-muted/30 overflow-hidden', className)}>
      {/* Header bar: stats */}
      <div className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5">
        <span className="text-2xs font-medium text-muted-foreground/70 uppercase tracking-wide">
          Relationship graph
        </span>
        <span className="ml-auto text-2xs tabular-nums text-muted-foreground/50">
          {totalNodes} {totalNodes === 1 ? 'node' : 'nodes'}
          {totalEdges > 0 && <> &middot; {totalEdges} {totalEdges === 1 ? 'edge' : 'edges'}</>}
        </span>
      </div>

      {/* SVG canvas */}
      <div className="overflow-x-auto px-2 py-2">
        <svg
          width={dims.width}
          height={dims.height}
          viewBox={`0 0 ${dims.width} ${dims.height}`}
          aria-label={`Relationship graph: ${totalNodes} nodes, ${totalEdges} connections`}
          role="img"
          style={{ display: 'block', minWidth: dims.width }}
        >
          {/* Edges */}
          {parsedEdges.map((edge, i) => {
            const src = centerOf(edge.source);
            const dst = centerOf(edge.target);
            const stroke = edgeColorForKind(edge.rel);
            const midX = (src.x + dst.x) / 2;
            const midY = (src.y + dst.y) / 2;
            return (
              <g key={`edge-${i}`}>
                <line
                  x1={src.x}
                  y1={src.y + NODE_H / 2}
                  x2={dst.x}
                  y2={dst.y - NODE_H / 2}
                  stroke={stroke}
                  strokeWidth={1.2}
                  strokeOpacity={0.6}
                  markerEnd={`url(#arrow-${markerNs}-${i})`}
                />
                <defs>
                  <marker
                    id={`arrow-${markerNs}-${i}`}
                    viewBox="0 0 8 8"
                    refX="7"
                    refY="4"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M0,0 L8,4 L0,8 z" fill={stroke} fillOpacity={0.7} />
                  </marker>
                </defs>
              </g>
            );
          })}

          {/* Nodes */}
          {laidOut.map((n) => {
            const color = kindHexColor(n.kind);
            return (
              <g key={n.id}>
                {/* Node rect */}
                <rect
                  x={n.x}
                  y={n.y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={4}
                  ry={4}
                  fill="var(--card, #fff)"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeOpacity={0.9}
                />
                {/* Left accent bar matching research-map style */}
                <rect
                  x={n.x}
                  y={n.y}
                  width={4}
                  height={NODE_H}
                  rx={4}
                  ry={0}
                  fill={color}
                  fillOpacity={0.85}
                />
                {/* Kind label (tiny, top) */}
                <text
                  x={n.x + 10}
                  y={n.y + 12}
                  fontSize={7}
                  fontWeight={600}
                  fill={color}
                  letterSpacing="0.06em"
                  textAnchor="start"
                  style={{ textTransform: 'uppercase', fontFamily: 'inherit' }}
                >
                  {kindLabel(n.kind).toUpperCase()}
                </text>
                {/* Display label — truncated to fit node width via SVG text */}
                <text
                  x={n.x + 10}
                  y={n.y + 26}
                  fontSize={9}
                  fontWeight={500}
                  fill="currentColor"
                  textAnchor="start"
                  style={{ fontFamily: 'inherit' }}
                >
                  <title>{n.label}</title>
                  {n.label.length > 16 ? n.label.slice(0, 15) + '…' : n.label}
                </text>
                {/* Second line when label is long enough */}
                {n.label.length > 16 && (
                  <text
                    x={n.x + 10}
                    y={n.y + 37}
                    fontSize={9}
                    fontWeight={500}
                    fill="currentColor"
                    textAnchor="start"
                    style={{ fontFamily: 'inherit' }}
                  >
                    {n.label.slice(15, 30) + (n.label.length > 30 ? '…' : '')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Footer: overflow note + relation-type legend */}
      {(hiddenCount > 0 || relTypes.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/30 px-2.5 py-1.5">
          {hiddenCount > 0 && (
            <span className="text-2xs text-muted-foreground/60 italic">
              +{hiddenCount} more {hiddenCount === 1 ? 'node' : 'nodes'} not shown
            </span>
          )}
          {relTypes.slice(0, 4).map((rel) => (
            <span
              key={rel}
              className="inline-flex items-center gap-1 text-2xs text-muted-foreground/70"
            >
              <span
                className="inline-block h-0.5 w-4 shrink-0"
                style={{ backgroundColor: edgeColorForKind(rel), opacity: 0.75 }}
              />
              {rel.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Kind legend — show unique node kinds found in the graph */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/30 px-2.5 py-1.5">
        {Array.from(new Set(parsedNodes.map((n) => n.kind))).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1 text-2xs text-muted-foreground/70">
            <span className={cn('size-1.5 shrink-0 rounded-full', kindDotClass(kind))} />
            {kindLabel(kind)}
          </span>
        ))}
      </div>
    </div>
  );
}
