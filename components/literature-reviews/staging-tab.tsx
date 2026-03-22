'use client'

import { SearchPaper } from '@/types/paper-search';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GitBranch, Layers, X } from 'lucide-react';
import { PaperSearchCard } from './paper-search-card';
import { useEffect, useState } from 'react';

interface StagingTabProps {
  stagedPapers: SearchPaper[];
  onRemoveFromStage: (paperId: string) => void;
  onSavePaper: (paper: SearchPaper) => Promise<void>;
}

function normalizeAuthor(author: string) {
  return author.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function buildConnections(papers: SearchPaper[]) {
  const nodes = papers.map((paper, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(papers.length, 1);
    const radius = papers.length === 1 ? 0 : 120;
    return {
      ...paper,
      x: 180 + Math.cos(angle) * radius,
      y: 150 + Math.sin(angle) * radius,
    };
  });

  const edges: Array<{ from: string; to: string; label: string }> = [];
  for (let i = 0; i < papers.length; i += 1) {
    for (let j = i + 1; j < papers.length; j += 1) {
      const left = papers[i];
      const right = papers[j];
      const leftAuthors = new Set(left.authors.map(normalizeAuthor));
      const sharedAuthor = right.authors.find((author) => leftAuthors.has(normalizeAuthor(author)));
      const sameJournal =
        left.journal &&
        right.journal &&
        left.journal.toLowerCase() === right.journal.toLowerCase();
      const sameYear = left.year === right.year;

      if (sharedAuthor) {
        edges.push({ from: left.id, to: right.id, label: "shared author" });
      } else if (sameJournal) {
        edges.push({ from: left.id, to: right.id, label: "same journal" });
      } else if (sameYear) {
        edges.push({ from: left.id, to: right.id, label: "same year" });
      }
    }
  }

  return {
    nodes,
    edges,
  };
}

function PaperConnectionsMap({ papers }: { papers: SearchPaper[] }) {
  const { nodes, edges } = buildConnections(papers);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <GitBranch className="h-4 w-4" />
        Paper Connections
      </div>
      {papers.length <= 1 ? (
        <p className="text-sm text-muted-foreground">
          Stage at least two papers to see relationship links based on shared authors, journals, or publication year.
        </p>
      ) : (
        <div className="overflow-auto">
          <svg viewBox="0 0 360 300" className="h-[300px] w-full min-w-[360px]">
            {edges.map((edge) => {
              const from = nodeById.get(edge.from);
              const to = nodeById.get(edge.to);
              if (!from || !to) return null;
              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="1.5"
                  />
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 6}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px]"
                  >
                    {edge.label}
                  </text>
                </g>
              );
            })}
            {nodes.map((node) => (
              <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
                <circle r="30" className="fill-background stroke-border" strokeWidth="2" />
                <text textAnchor="middle" y="-2" className="fill-foreground text-[10px] font-medium">
                  {node.title.length > 18 ? `${node.title.slice(0, 18)}…` : node.title}
                </text>
                <text textAnchor="middle" y="12" className="fill-muted-foreground text-[9px]">
                  {node.year}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

export function StagingTab({ stagedPapers, onRemoveFromStage, onSavePaper }: StagingTabProps) {
  const [savingPaperId, setSavingPaperId] = useState<string | null>(null);
  const [activePaperId, setActivePaperId] = useState<string>("");

  useEffect(() => {
    if (stagedPapers.length === 0) {
      setActivePaperId("");
      return;
    }
    if (!stagedPapers.some((paper) => paper.id === activePaperId)) {
      setActivePaperId(stagedPapers[0].id);
    }
  }, [stagedPapers, activePaperId]);

  const handleSave = async (paper: SearchPaper) => {
    setSavingPaperId(paper.id);
    try {
      await onSavePaper(paper);
    } finally {
      setSavingPaperId(null);
    }
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-foreground flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Staging Area
              </CardTitle>
              <CardDescription>
                Review papers before adding to your repository
              </CardDescription>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{stagedPapers.length}</span> pending
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stagedPapers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg">
              <Layers className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">Staging area is empty</p>
              <p className="text-sm text-muted-foreground">
                Go to the Search tab and stage papers for review
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <PaperConnectionsMap papers={stagedPapers} />
              <Tabs value={activePaperId} onValueChange={setActivePaperId} className="w-full">
              <TabsList className="mb-4 w-full justify-start">
                {stagedPapers.map((paper) => (
                  <TabsTrigger key={paper.id} value={paper.id} className="gap-2">
                    <span className="max-w-[180px] truncate">{paper.title}</span>
                    <button
                      type="button"
                      className="rounded-sm p-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveFromStage(paper.id);
                      }}
                      aria-label={`Close ${paper.title}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </TabsTrigger>
                ))}
              </TabsList>

              {stagedPapers.map((paper) => (
                <TabsContent key={paper.id} value={paper.id} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                    <div>
                      <div className="font-medium text-foreground">{paper.title}</div>
                      <div className="text-sm text-muted-foreground">
                        Review this paper, add it to the repository, or close this staged tab.
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => onRemoveFromStage(paper.id)}
                      title="Close staged paper"
                      aria-label="Close staged paper"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  <PaperSearchCard
                    paper={paper}
                    onSave={handleSave}
                    onDownloadToRepository={handleSave}
                    onRemove={onRemoveFromStage}
                    isSaving={savingPaperId === paper.id}
                    compact={false}
                  />
                </TabsContent>
              ))}
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
