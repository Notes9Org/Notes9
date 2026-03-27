"use client";

import { useState } from "react";
import FullCalendar from "@fullcalendar/react";
import interactionPlugin from "@fullcalendar/interaction";
import timeGridPlugin from "@fullcalendar/timegrid";
import type {
  DateSelectArg,
  EventClickArg,
  EventContentArg,
  EventDropArg,
} from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import {
  CalendarClock,
  GripVertical,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type PlannerEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor: string;
  borderColor: string;
  extendedProps?: {
    description?: string;
  };
};

type EventDraft = {
  id: string | null;
  title: string;
  start: string;
  end: string;
  description: string;
};

const EVENT_COLOR = "#965034";

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function getDefaultStart() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(Math.max(7, start.getHours() + 1));
  return start;
}

function createDraftFromRange(start: Date, end: Date): EventDraft {
  return {
    id: null,
    title: "",
    start: toLocalInputValue(start),
    end: toLocalInputValue(end),
    description: "",
  };
}

function createDraftFromEvent(event: PlannerEvent): EventDraft {
  return {
    id: event.id,
    title: event.title,
    start: event.start.slice(0, 16),
    end: event.end.slice(0, 16),
    description:
      typeof event.extendedProps?.description === "string"
        ? event.extendedProps.description
        : "",
  };
}

const INITIAL_EVENTS: PlannerEvent[] = [
  {
    id: "planner-1",
    title: "Media prep",
    start: "2026-03-27T08:00",
    end: "2026-03-27T09:00",
    backgroundColor: EVENT_COLOR,
    borderColor: EVENT_COLOR,
    extendedProps: {
      description: "Prepare sterile media before the morning run.",
    },
  },
  {
    id: "planner-2",
    title: "Sampling timepoint",
    start: "2026-03-27T11:30",
    end: "2026-03-27T12:00",
    backgroundColor: EVENT_COLOR,
    borderColor: EVENT_COLOR,
    extendedProps: {
      description: "Collect sample and record observations for experiment B12.",
    },
  },
  {
    id: "planner-3",
    title: "Project sync",
    start: "2026-03-27T15:00",
    end: "2026-03-27T15:45",
    backgroundColor: EVENT_COLOR,
    borderColor: EVENT_COLOR,
    extendedProps: {
      description: "Weekly check-in with the tissue culture team.",
    },
  },
];

export function DayPlannerCalendar() {
  const { toast } = useToast();
  const [events, setEvents] = useState<PlannerEvent[]>(INITIAL_EVENTS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [draft, setDraft] = useState<EventDraft>(() => {
    const start = getDefaultStart();
    const end = new Date(start.getTime() + 60 * 60_000);
    return createDraftFromRange(start, end);
  });

  const openNewEventDialog = () => {
    const start = getDefaultStart();
    const end = new Date(start.getTime() + 60 * 60_000);
    setDraft(createDraftFromRange(start, end));
    setIsDialogOpen(true);
  };

  const handleSelect = (selection: DateSelectArg) => {
    setDraft(createDraftFromRange(selection.start, selection.end));
    setIsDialogOpen(true);
  };

  const handleEventClick = (clickInfo: EventClickArg) => {
    setDraft(
      createDraftFromEvent({
        id: clickInfo.event.id,
        title: clickInfo.event.title,
        start: toLocalInputValue(clickInfo.event.start ?? new Date()),
        end: toLocalInputValue(
          clickInfo.event.end ??
            new Date((clickInfo.event.start ?? new Date()).getTime() + 60 * 60_000),
        ),
        backgroundColor:
          clickInfo.event.backgroundColor || clickInfo.event.borderColor || EVENT_COLOR,
        borderColor:
          clickInfo.event.borderColor || clickInfo.event.backgroundColor || EVENT_COLOR,
        extendedProps: {
          description:
            typeof clickInfo.event.extendedProps.description === "string"
              ? clickInfo.event.extendedProps.description
              : "",
        },
      }),
    );
    setIsDialogOpen(true);
  };

  const updateEventTiming = (
    eventId: string,
    start: Date | null,
    end: Date | null,
    title: string,
  ) => {
    if (!start || !end) return;
    setEvents((currentEvents) =>
      currentEvents.map((event) =>
        event.id === eventId
          ? {
              ...event,
              start: start.toISOString(),
              end: end.toISOString(),
            }
          : event,
      ),
    );
    toast({
      title: "Event updated",
      description: `${title} was moved on the planner.`,
    });
  };

  const handleEventDrop = (eventDropInfo: EventDropArg) => {
    updateEventTiming(
      eventDropInfo.event.id,
      eventDropInfo.event.start,
      eventDropInfo.event.end,
      eventDropInfo.event.title,
    );
  };

  const handleEventResize = (eventResizeInfo: EventResizeDoneArg) => {
    updateEventTiming(
      eventResizeInfo.event.id,
      eventResizeInfo.event.start,
      eventResizeInfo.event.end,
      eventResizeInfo.event.title,
    );
  };

  const handleSave = () => {
    if (!draft.title.trim()) {
      toast({
        title: "Add a title",
        description: "Each planner event needs a short name.",
      });
      return;
    }

    if (!draft.start || !draft.end || draft.end <= draft.start) {
      toast({
        title: "Check the time range",
        description: "The end time needs to be after the start time.",
      });
      return;
    }

    const nextEvent: PlannerEvent = {
      id: draft.id ?? `planner-${Date.now()}`,
      title: draft.title.trim(),
      start: draft.start,
      end: draft.end,
      backgroundColor: EVENT_COLOR,
      borderColor: EVENT_COLOR,
      extendedProps: {
        description: draft.description.trim(),
      },
    };

    setEvents((currentEvents) => {
      if (!draft.id) return [...currentEvents, nextEvent];
      return currentEvents.map((event) =>
        event.id === draft.id ? nextEvent : event,
      );
    });

    toast({
      title: draft.id ? "Event saved" : "Event added",
      description: draft.id
        ? `${nextEvent.title} was updated on the planner.`
        : `${nextEvent.title} was added to the planner.`,
    });

    setIsDialogOpen(false);
  };

  const handleDelete = () => {
    if (!draft.id) return;
    const eventTitle = draft.title;
    setEvents((currentEvents) =>
      currentEvents.filter((event) => event.id !== draft.id),
    );
    setIsDialogOpen(false);
    toast({
      title: "Event removed",
      description: `${eventTitle} was removed from the planner.`,
    });
  };

  const renderEventContent = (eventContent: EventContentArg) => (
    <div className="day-planner-event-content">
      <div className="fc-event-title">{eventContent.event.title}</div>
      <div className="fc-event-time">
        {eventContent.timeText || "Timed event"}
      </div>
    </div>
  );

  const getEventClassNames = (eventContent: EventContentArg) => {
    const start = eventContent.event.start;
    const end = eventContent.event.end;

    if (!start || !end) return [];

    const durationInMinutes = (end.getTime() - start.getTime()) / 60_000;

    // Roughly the point where the current title + time typography no longer
    // has enough vertical room to breathe as a two-line card.
    if (durationInMinutes <= 35) {
      return ["day-planner-event-compact"];
    }

    return [];
  };

  return (
    <>
      <Card className="min-w-0 overflow-hidden">
        <CardHeader className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5" />
                  Day Planner
                </CardTitle>
                <Badge variant="secondary">Step 1</Badge>
              </div>
              <CardDescription className="max-w-2xl">
                A first-pass lab calendar with a vertical timeline, click-to-edit
                events, and drag-and-resize scheduling. Recurrence, reminders, and
                experiment-linked tasks can come next.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <GripVertical className="h-3.5 w-3.5" />
                Drag to move
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                <PencilLine className="h-3.5 w-3.5" />
                Click to edit
              </Badge>
              <Button onClick={openNewEventDialog}>
                <Plus className="h-4 w-4" />
                Add event
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm md:p-4">
            <div className="day-planner-calendar-scroll">
              <div className="day-planner-calendar min-w-[720px]">
                <FullCalendar
                  plugins={[timeGridPlugin, interactionPlugin]}
                  initialView="timeGridDay"
                  headerToolbar={{
                    left: "prev,next today",
                    center: "title",
                    right: "timeGridDay,timeGridWeek",
                  }}
                  nowIndicator
                  editable
                  selectable
                  selectMirror
                  dayMaxEvents={false}
                  slotMinTime="06:00:00"
                  slotMaxTime="22:00:00"
                  allDaySlot={false}
                  height="auto"
                  eventDisplay="block"
                  events={events}
                  eventClassNames={getEventClassNames}
                  eventContent={renderEventContent}
                  select={handleSelect}
                  eventClick={handleEventClick}
                  eventDrop={handleEventDrop}
                  eventResize={handleEventResize}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {draft.id ? "Edit planner event" : "Add planner event"}
            </DialogTitle>
            <DialogDescription>
              This first version stores events locally in the dashboard so we can
              shape the workflow before wiring persistence and reminders.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="planner-event-title">Title</Label>
              <Input
                id="planner-event-title"
                value={draft.title}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    title: event.target.value,
                  }))
                }
                placeholder="Sampling timepoint"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="planner-event-start">Start</Label>
                <Input
                  id="planner-event-start"
                  type="datetime-local"
                  value={draft.start}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      start: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="planner-event-end">End</Label>
                <Input
                  id="planner-event-end"
                  type="datetime-local"
                  value={draft.end}
                  onChange={(event) =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      end: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="planner-event-description">Notes</Label>
              <Textarea
                id="planner-event-description"
                value={draft.description}
                onChange={(event) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    description: event.target.value,
                  }))
                }
                placeholder="Optional context, prep notes, or reminder details."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter className="justify-between gap-2 sm:justify-between">
            <div>
              {draft.id ? (
                <Button variant="destructive-ghost" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {draft.id ? "Save changes" : "Add event"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
