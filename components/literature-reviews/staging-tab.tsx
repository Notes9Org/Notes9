'use client'

import { SearchPaper } from '@/types/paper-search';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Layers } from 'lucide-react';
import { PaperSearchCard } from './paper-search-card';
import { useState } from 'react';

interface StagingTabProps {
  stagedPapers: SearchPaper[];
  onRemoveFromStage: (paperId: string) => void;
  onSavePaper: (paper: SearchPaper) => Promise<void>;
}

export function StagingTab({ stagedPapers, onRemoveFromStage, onSavePaper }: StagingTabProps) {
  const [savingPaperId, setSavingPaperId] = useState<string | null>(null);

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
              {stagedPapers.map((paper) => (
                <PaperSearchCard
                  key={paper.id}
                  paper={paper}
                  onSave={handleSave}
                  onRemove={onRemoveFromStage}
                  isSaving={savingPaperId === paper.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
