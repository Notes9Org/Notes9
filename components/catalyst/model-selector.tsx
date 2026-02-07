'use client';

import { useState } from 'react';
import { Check, ChevronDown, Sparkles, Zap, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  chatModels,
  modelsByProvider,
  providerNames,
  getModelById,
  DEFAULT_MODEL_ID,
  type ChatModel,
} from '@/lib/ai/models';

interface ModelSelectorProps {
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
  compact?: boolean;
  disabled?: boolean;
}

// Provider icons (Google/Gemini uses Sparkles as before)
function ProviderIcon({ provider, className }: { provider: string; className?: string }) {
  switch (provider) {
    case 'google':
      return <Sparkles className={cn('text-blue-500', className)} />;
    case 'openai':
      return <Zap className={cn('text-green-500', className)} />;
    case 'anthropic':
      return <Brain className={cn('text-orange-500', className)} />;
    default:
      return <Sparkles className={className} />;
  }
}

export function ModelSelector({
  selectedModelId,
  onModelChange,
  compact = false,
  disabled = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);

  const selectedModel = getModelById(selectedModelId) || getModelById(DEFAULT_MODEL_ID)!;

  const handleSelect = (modelId: string) => {
    onModelChange(modelId);
    setOpen(false);

    // Persist to cookie
    document.cookie = `catalyst-model=${modelId}; path=/; max-age=${60 * 60 * 24 * 365}`;
  };

  if (compact) {
    return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 sm:h-6 px-1.5 sm:px-2 text-[10px] sm:text-xs text-muted-foreground hover:text-foreground gap-1.5"
            disabled={disabled}
          >
            <ProviderIcon provider={selectedModel.provider} className="size-2.5 sm:size-3 shrink-0" />
            <span className="hidden sm:inline max-w-[60px] truncate min-w-0">{selectedModel.name}</span>
            <ChevronDown className="size-2.5 sm:size-3 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {Object.entries(modelsByProvider).map(([provider, models]) => (
            <div key={provider}>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {providerNames[provider] || provider}
              </DropdownMenuLabel>
              {models.map((model) => (
                <DropdownMenuItem
                  key={model.id}
                  onClick={() => handleSelect(model.id)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <ProviderIcon provider={model.provider} className="size-3" />
                    <span className="text-sm">{model.name}</span>
                  </div>
                  {model.id === selectedModelId && (
                    <Check className="size-4 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs gap-2 justify-between min-w-[140px]"
          disabled={disabled}
        >
          <div className="flex items-center gap-2">
            <ProviderIcon provider={selectedModel.provider} className="size-3.5" />
            <span className="truncate">{selectedModel.name}</span>
          </div>
          <ChevronDown className="size-3.5 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {Object.entries(modelsByProvider).map(([provider, models]) => (
          <div key={provider}>
            <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center gap-2">
              <ProviderIcon provider={provider} className="size-3" />
              {providerNames[provider] || provider}
            </DropdownMenuLabel>
            {models.map((model) => (
              <DropdownMenuItem
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className="flex flex-col items-start gap-0.5 py-2"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-medium">{model.name}</span>
                  {model.id === selectedModelId && (
                    <Check className="size-4 text-primary" />
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {model.description}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

