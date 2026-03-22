'use client'

import { SearchPaper } from '@/types/paper-search';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layers, X } from 'lucide-react';
import { PaperSearchCard } from './paper-search-card';
import { useEffect, useState } from 'react';

interface StagingTabProps {
  stagedPapers: SearchPaper[];
  onRemoveFromStage: (paperId: string) => void;
  onSavePaper: (paper: SearchPaper) => Promise<void>;
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
                  <PaperSearchCard
                    paper={paper}
                    onSave={handleSave}
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
