'use client';

/**
 * AgentGraphView
 *
 * Renders a real relationship graph from the `graph` SSE event (full node+edge
 * lists from map_relationships) as an interactive-feeling dagre/SVG layout —
 * the high-fidelity replacement for the model hand-drawing an overlapping PNG.
 *
 * Distinct from AgentRelationshipGraph (which reconstructs an APPROXIMATE
 * topology from a truncated tool-card preview): this one receives the actual
 * edges, so the layout is exact. Pure SVG, read-only, no ReactFlow overhead.
 */

import { useId, useMemo } from 'react';
import dagre from 'dagre';
import type { AgentGraph } from '@/hooks/use-agent-stream';
import {
  kindHexColor,
  kindDotClass,
  kindLabel,
  edgeColorForKind,
} from '@/lib/research-map-kinds';
import type { ResearchMapNodeKind } from '@/lib/research-map-types';
import { cn } from '@/lib/utils';

const NODE_W = 132;
const NODE_H = 42;
// Cap rendered nodes for SVG performance; the rest are summarized as "+N more".
const MAX_RENDER_NODES = 80;

const KNOWN_KINDS: ReadonlySet<string> = new Set([
  'project', 'experiment', 'protocol', 'lab_note', 'literature', 'paper',
  'report', 'sample', 'data_file', 'sample_file',
]);

function asKind(raw: string): ResearchMapNodeKind {
  const k = (raw || '').toLowerCase();
  return (KNOWN_KINDS.has(k) ? k : 'experiment') as ResearchMapNodeKind;
}

interface LayoutNode {
  id: string;
  kind: ResearchMapNodeKind;
  label: string;
  x: number;
  y: number;
}

interface Laid {
  nodes: LayoutNode[];
  edges: { source: string; target: string; relation: string }[];
  width: number;
  height: number;
}

function layout(graph: AgentGraph): Laid {
  // Keep only the first MAX_RENDER_NODES nodes, then the edges between them.
  const kept = graph.nodes.slice(0, MAX_RENDER_NODES);
  const keptIds = new Set(kept.map((n) => n.id));
  const edges = graph.edges.filter((e) => keptIds.has(e.source) && keptIds.has(e.target));

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 56, marginx: 16, marginy: 16 });
  for (const n of kept) g.setNode(n.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);

  let width = 200;
  let height = 80;
  const nodes: LayoutNode[] = kept.map((n) => {
    const pos = g.node(n.id);
    const x = pos ? pos.x - NODE_W / 2 : 0;
    const y = pos ? pos.y - NODE_H / 2 : 0;
    width = Math.max(width, x + NODE_W);
    height = Math.max(height, y + NODE_H);
    return { id: n.id, kind: asKind(n.kind), label: n.label || '(untitled)', x, y };
  });
  return { nodes, edges, width: width + 24, height: height + 24 };
}

export function AgentGraphView({ graph, className }: { graph: AgentGraph; className?: string }) {
  // <marker id> is document-scoped — namespace per instance so two graphs on a
  // page don't steal each other's arrowheads.
  const ns = useId().replace(/:/g, '');
  const laid = useMemo(() => {
    try {
      return layout(graph);
    } catch {
      return null;
    }
  }, [graph]);

  if (!laid || laid.nodes.length === 0) return null;

  const totalNodes = graph.nodes.length;
  const totalEdges = graph.edges.length;
  const hidden = totalNodes - laid.nodes.length;
  const relTypes = Array.from(new Set(graph.edges.map((e) => e.relation).filter(Boolean))).slice(0, 4);
  const kinds = Array.from(new Set(laid.nodes.map((n) => n.kind)));
  const centerOf = (id: string) => {
    const n = laid.nodes.find((l) => l.id === id);
    return n ? { x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 } : { x: 0, y: 0 };
  };

  return (
    <div className={cn('mt-2 rounded-md border border-border/50 bg-muted/30 overflow-hidden', className)}>
      <div className="flex items-center gap-2 border-b border-border/40 px-2.5 py-1.5">
        <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
          Relationship graph
        </span>
        <span className="ml-auto text-2xs tabular-nums text-muted-foreground/50">
          {totalNodes} {totalNodes === 1 ? 'node' : 'nodes'}
          {totalEdges > 0 && <> &middot; {totalEdges} {totalEdges === 1 ? 'edge' : 'edges'}</>}
          {graph.truncated && <> &middot; truncated</>}
        </span>
      </div>

      <div className="overflow-auto px-2 py-2" style={{ maxHeight: 420 }}>
        <svg
          width={laid.width}
          height={laid.height}
          viewBox={`0 0 ${laid.width} ${laid.height}`}
          role="img"
          aria-label={`Relationship graph: ${totalNodes} nodes, ${totalEdges} connections`}
          style={{ display: 'block', minWidth: laid.width }}
        >
          {laid.edges.map((edge, i) => {
            const src = centerOf(edge.source);
            const dst = centerOf(edge.target);
            const stroke = edgeColorForKind(edge.relation);
            return (
              <g key={`e-${i}`}>
                <defs>
                  <marker
                    id={`arr-${ns}-${i}`}
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
                <line
                  x1={src.x}
                  y1={src.y + NODE_H / 2}
                  x2={dst.x}
                  y2={dst.y - NODE_H / 2}
                  stroke={stroke}
                  strokeWidth={1.2}
                  strokeOpacity={0.6}
                  markerEnd={`url(#arr-${ns}-${i})`}
                />
              </g>
            );
          })}

          {laid.nodes.map((n) => {
            const color = kindHexColor(n.kind);
            const line1 = n.label.length > 18 ? n.label.slice(0, 17) + '…' : n.label;
            return (
              <g key={n.id}>
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
                <rect x={n.x} y={n.y} width={4} height={NODE_H} fill={color} fillOpacity={0.85} />
                <text
                  x={n.x + 10}
                  y={n.y + 13}
                  fontSize={7}
                  fontWeight={600}
                  fill={color}
                  letterSpacing="0.06em"
                  style={{ textTransform: 'uppercase', fontFamily: 'inherit' }}
                >
                  {kindLabel(n.kind).toUpperCase()}
                </text>
                <text x={n.x + 10} y={n.y + 28} fontSize={9} fontWeight={500} fill="currentColor" style={{ fontFamily: 'inherit' }}>
                  <title>{n.label}</title>
                  {line1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {(hidden > 0 || relTypes.length > 0) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/30 px-2.5 py-1.5">
          {hidden > 0 && (
            <span className="text-2xs italic text-muted-foreground/60">
              +{hidden} more {hidden === 1 ? 'node' : 'nodes'} not shown
            </span>
          )}
          {relTypes.map((rel) => (
            <span key={rel} className="inline-flex items-center gap-1 text-2xs text-muted-foreground/70">
              <span className="inline-block h-0.5 w-4 shrink-0" style={{ backgroundColor: edgeColorForKind(rel), opacity: 0.75 }} />
              {rel.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border/30 px-2.5 py-1.5">
        {kinds.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1 text-2xs text-muted-foreground/70">
            <span className={cn('size-1.5 shrink-0 rounded-full', kindDotClass(kind))} />
            {kindLabel(kind)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Render a list of agent graphs (one card each). Returns null when empty. */
export function AgentGraphList({ graphs, className }: { graphs: AgentGraph[]; className?: string }) {
  if (!graphs || graphs.length === 0) return null;
  return (
    <div className={className}>
      {graphs.map((g, i) => (
        <AgentGraphView key={i} graph={g} />
      ))}
    </div>
  );
}
