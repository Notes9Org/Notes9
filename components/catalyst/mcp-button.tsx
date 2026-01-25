'use client';

import { useState } from 'react';
import { Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { MCPSettingsModal } from './mcp-settings-modal';
import { useMCPServers } from '@/hooks/use-mcp-servers';

interface MCPButtonProps {
  disabled?: boolean;
}

export function MCPButton({ disabled = false }: MCPButtonProps) {
  const [open, setOpen] = useState(false);
  const { connectedCount, enabledCount } = useMCPServers();

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-lg text-muted-foreground hover:text-foreground relative"
              onClick={() => setOpen(true)}
              disabled={disabled}
            >
              <Plug className="size-4" />
              {enabledCount > 0 && (
                <Badge
                  variant={connectedCount > 0 ? 'default' : 'secondary'}
                  className="absolute -top-1 -right-1 size-4 p-0 flex items-center justify-center text-[10px]"
                >
                  {enabledCount}
                </Badge>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            MCP Connections
            {enabledCount > 0 && (
              <span className="text-muted-foreground ml-1">
                ({connectedCount}/{enabledCount} connected)
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <MCPSettingsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
