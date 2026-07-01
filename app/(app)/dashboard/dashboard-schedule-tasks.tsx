"use client"

import { useState, useMemo } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DashboardCalendar } from "./dashboard-calendar"
import { TodoPanel, SORT_OPTIONS, type DashboardTask, type TaskSortKey } from "./todo-panel"

type CalendarRow = {
  id: string
  user_id: string
  project_id: string | null
  experiment_id: string | null
  title: string
  meta: string | null
  start_at: string
  end_at: string | null
  tone: "ink" | "leaf" | "accent" | "warning"
  done: boolean
  created_at: string
  updated_at: string
}

export function DashboardScheduleTasks({
  initialEvents,
  initialTasks,
}: {
  initialEvents: CalendarRow[]
  initialTasks: DashboardTask[]
}) {
  const [tab, setTab] = useState("schedule")
  const [taskSort, setTaskSort] = useState<TaskSortKey>("due_date")
  const openTaskCount = useMemo(
    () => initialTasks.filter((t) => !t.completed).length,
    [initialTasks],
  )

  return (
    <article data-tour="dash-schedule" className="flex h-full min-h-0 flex-col overflow-hidden rounded-[calc(var(--radius)+4px)] border border-border bg-card">
      <Tabs value={tab} onValueChange={setTab} className="flex h-full min-h-0 flex-col">
        <header className="flex items-center justify-between gap-2 px-4 py-3">
          <TabsList className="h-8 bg-muted/60">
            <TabsTrigger value="schedule" className="text-[13px] px-3">
              Schedule
            </TabsTrigger>
            <TabsTrigger value="tasks" className="text-[13px] px-3 gap-1.5">
              Tasks
              {openTaskCount > 0 ? (
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-foreground px-1.5 py-px text-[10px] font-mono font-medium text-background tabular-nums">
                  {openTaskCount}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>
          {tab === "tasks" ? (
            <Select
              value={taskSort}
              onValueChange={(v) => setTaskSort(v as TaskSortKey)}
            >
              <SelectTrigger size="sm" className="w-[130px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </header>

        <TabsContent
          value="schedule"
          className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none focus-visible:ring-0"
        >
          <DashboardCalendar initialEvents={initialEvents} embedded />
        </TabsContent>

        <TabsContent
          value="tasks"
          className="mt-0 flex min-h-0 flex-1 flex-col focus-visible:outline-none focus-visible:ring-0"
        >
          <TodoPanel
            initialTasks={initialTasks}
            variant="embedded"
            sort={taskSort}
            onSortChange={setTaskSort}
          />
        </TabsContent>
      </Tabs>
    </article>
  )
}
