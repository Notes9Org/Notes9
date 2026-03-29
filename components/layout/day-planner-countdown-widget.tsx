"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Hourglass, Pin, X } from "lucide-react";

import { useDayPlanner } from "@/contexts/day-planner-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function formatRemaining(totalSeconds: number) {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

export function DayPlannerCountdownWidget() {
  const { activeCountdown, clearActiveCountdown } = useDayPlanner();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeCountdown) return;

    const intervalId = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);

    return () => window.clearInterval(intervalId);
  }, [activeCountdown]);

  const countdownState = useMemo(() => {
    if (!activeCountdown) return null;

    const startTime = new Date(activeCountdown.start).getTime();
    const endTime = new Date(activeCountdown.end).getTime();

    if (Number.isNaN(startTime) || Number.isNaN(endTime)) return null;

    if (now < startTime) {
      return {
        label: "Starts in",
        value: formatRemaining(Math.max(0, Math.floor((startTime - now) / 1000))),
        detail: new Date(activeCountdown.start).toLocaleString(),
        isExpired: false,
      };
    }

    if (now < endTime) {
      return {
        label: "Ends in",
        value: formatRemaining(Math.max(0, Math.floor((endTime - now) / 1000))),
        detail: `Started ${new Date(activeCountdown.start).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}`,
        isExpired: false,
      };
    }

    return {
      label: "Completed",
      value: "Ended",
      detail: new Date(activeCountdown.end).toLocaleString(),
      isExpired: true,
    };
  }, [activeCountdown, now]);

  if (!activeCountdown || !countdownState) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-border/70 bg-background/85 px-2 py-1 shadow-sm backdrop-blur-sm sm:px-3">
      <Pin className="size-3.5 shrink-0 text-primary" />
      <div className="min-w-0 leading-none">
        <p className="truncate text-[11px] font-semibold text-foreground sm:text-xs">
          {activeCountdown.title}
        </p>
        <p className="truncate text-[10px] text-muted-foreground sm:text-[11px]">
          {countdownState.label} {countdownState.value}
        </p>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-muted-foreground"
            asChild
          >
            <Link href="/dashboard" aria-label="Open day planner">
              {countdownState.isExpired ? (
                <Hourglass className="size-3.5" />
              ) : (
                <Bell className="size-3.5" />
              )}
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {countdownState.detail}
        </TooltipContent>
      </Tooltip>

      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground"
        onClick={clearActiveCountdown}
        aria-label="Clear active countdown"
      >
        <X className="size-3.5" />
      </Button>
    </div>
  );
}
