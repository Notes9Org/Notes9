'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { recordRumEvent } from '@/lib/rum';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Class error boundary wrapping the Catalyst chat surface.
 * Catches render/lifecycle crashes so the rest of the app stays functional.
 * A calm "Something went wrong with the assistant" fallback is shown with a
 * Retry button that resets error state.
 */
export class CatalystErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Full detail to the LOCAL console only (not exfiltrated).
    console.error('[CatalystErrorBoundary] AI render crash:', error, info);
    // RUM goes to an external service — send only the error CLASS and the
    // innermost component name. Never the message or full stack, which can
    // carry user-authored lab-note/chat content or internal record ids.
    const component =
      (info.componentStack ?? '')
        .split('\n')
        .map((l) => l.trim())
        .find(Boolean)
        ?.slice(0, 120) ?? '';
    recordRumEvent('catalyst_render_error', {
      errorName: error.name,
      component,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-[320px] w-full flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <AlertTriangle className="size-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="max-w-xs space-y-1.5">
            <p className="text-sm font-medium text-foreground">
              Something went wrong with the assistant
            </p>
            <p className="text-xs text-muted-foreground">
              A rendering error occurred. Your conversation history is safe — click Retry to reload
              the assistant.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={this.handleReset}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
