'use client';

import { Globe, FileText, Dna } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { chatSources, type ChatSource } from '@/lib/ai/models';

interface SourceSelectorProps {
  selectedSource: ChatSource;
  onSourceChange: (source: ChatSource) => void;
  disabled?: boolean;
}

const sourceIcons: Record<ChatSource, React.ElementType> = {
  internet: Globe,
  notes9: FileText,
  biomni: Dna,
};

export function SourceSelector({
  selectedSource,
  onSourceChange,
  disabled = false,
}: SourceSelectorProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {chatSources.map((source) => {
        const Icon = sourceIcons[source.id];
        const isSelected = selectedSource === source.id;

        return (
          <Button
            key={source.id}
            variant="ghost"
            size="sm"
            onClick={() => onSourceChange(source.id)}
            disabled={disabled}
            className={cn(
              'h-7 px-3 text-xs gap-1.5 transition-all',
              isSelected
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title={source.description}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{source.name}</span>
          </Button>
        );
      })}
    </div>
  );
}
