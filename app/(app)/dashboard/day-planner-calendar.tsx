"use client";

import { useEffect, useRef, useState } from "react";
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
  Bell,
  BellRing,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDayPlanner } from "@/contexts/day-planner-context";
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
    reminderMinutes?: number | null;
  };
};

type EventDraft = {
  id: string | null;
  title: string;
  start: string;
  end: string;
  description: string;
  reminderMinutes: string;
};

const EVENT_COLOR = "#965034";
const REMINDER_OPTIONS = ["none", "5", "10", "15", "30", "60"] as const;

function getReminderLabel(reminderMinutes: number | null | undefined) {
  if (!reminderMinutes) return "No reminder";
  return `Remind ${reminderMinutes} min before`;
}

function getReminderMinutesValue(reminderMinutes: number | null | undefined) {
  return typeof reminderMinutes === "number" ? String(reminderMinutes) : "none";
}

function createPlannerEventFromDraft(draft: EventDraft): PlannerEvent {
  return {
    id: draft.id ?? `planner-${Date.now()}`,
    title: draft.title.trim(),
    start: draft.start,
    end: draft.end,
    backgroundColor: EVENT_COLOR,
    borderColor: EVENT_COLOR,
    extendedProps: {
      description: draft.description.trim(),
      reminderMinutes:
        draft.reminderMinutes === "none" ? null : Number(draft.reminderMinutes),
    },
  };
}

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
    reminderMinutes: "15",
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
    reminderMinutes: getReminderMinutesValue(event.extendedProps?.reminderMinutes),
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
      reminderMinutes: 15,
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
      reminderMinutes: 10,
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
      reminderMinutes: null,
    },
  },
];

export function DayPlannerCalendar() {
  const { toast } = useToast();
  const {
    activeCountdown,
    setActiveCountdown,
    clearActiveCountdown,
    reminderSoundEnabled,
    enableReminderSound,
    disableReminderSound,
    playReminderSound,
  } = useDayPlanner();
  const [events, setEvents] = useState<PlannerEvent[]>(INITIAL_EVENTS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const firedReminderKeysRef = useRef<Set<string>>(new Set());
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [draft, setDraft] = useState<EventDraft>(() => {
    const start = getDefaultStart();
    const end = new Date(start.getTime() + 60 * 60_000);
    return createDraftFromRange(start, end);
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }

    setNotificationPermission(Notification.permission);
  }, []);

  const showReminderNotification = (
    title: string,
    description: string,
    options?: {
      skipToast?: boolean;
    },
  ) => {
    const shouldSkipToast = options?.skipToast === true;

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(title, {
          body: description,
        });
        if (!shouldSkipToast) {
          toast({
            title,
            description,
          });
        }
        return;
      } catch {
        // Fall through to the toast fallback if the browser refuses to show it.
      }
    }

    toast({
      title,
      description,
    });
  };

  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      const activeKeys = new Set<string>();

      for (const event of events) {
        const reminderMinutes = event.extendedProps?.reminderMinutes;
        if (!reminderMinutes) continue;

        const startTime = new Date(event.start).getTime();
        const reminderTime = startTime - reminderMinutes * 60_000;
        const reminderKey = `${event.id}:${event.start}:${reminderMinutes}`;
        activeKeys.add(reminderKey);

        if (now < reminderTime || now >= startTime) continue;
        if (firedReminderKeysRef.current.has(reminderKey)) continue;

        firedReminderKeysRef.current.add(reminderKey);

        const reminderMessage = `${event.title} starts in ${reminderMinutes} minute${
          reminderMinutes === 1 ? "" : "s"
        }.`;

        showReminderNotification("Planner reminder", reminderMessage, {
          skipToast: false,
        });

        if (reminderSoundEnabled) {
          void playReminderSound();
        }
      }

      firedReminderKeysRef.current = new Set(
        [...firedReminderKeysRef.current].filter((key) => activeKeys.has(key)),
      );
    };

    checkReminders();
    const intervalId = window.setInterval(checkReminders, 15_000);
    return () => window.clearInterval(intervalId);
  }, [events, toast, reminderSoundEnabled, playReminderSound]);

  const enableBrowserReminders = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast({
        title: "Browser notifications unavailable",
        description: "This browser does not support the Notification API.",
      });
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    toast({
      title:
        permission === "granted"
          ? "Browser reminders enabled"
          : "Browser reminders not enabled",
      description:
        permission === "granted"
          ? "Upcoming event reminders can now appear as browser notifications while the app is open."
          : "You can still rely on in-app reminder toasts while the planner is open.",
    });
  };

  const sendTestNotification = () => {
    showReminderNotification(
      "Planner reminder test",
      "Browser reminders are enabled while this dashboard stays open.",
    );
  };

  const enableReminderSoundPreference = async () => {
    const didEnable = await enableReminderSound();

    toast({
      title: didEnable ? "Reminder sound enabled" : "Could not enable sound",
      description: didEnable
        ? "A short chime will play when planner reminders fire in this browser."
        : "This browser blocked audio until it receives a direct user interaction it can use to unlock sound.",
    });
  };

  const sendTestSound = async () => {
    const played = await playReminderSound();

    toast({
      title: played ? "Reminder sound test played" : "Sound test blocked",
      description: played
        ? "You should have heard the planner reminder chime."
        : "The browser did not allow audio playback yet. Try enabling sound again from a direct click.",
    });
  };

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
          reminderMinutes:
            typeof clickInfo.event.extendedProps.reminderMinutes === "number"
              ? clickInfo.event.extendedProps.reminderMinutes
              : null,
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
    if (activeCountdown?.eventId === eventId) {
      setActiveCountdown({
        ...activeCountdown,
        start: start.toISOString(),
        end: end.toISOString(),
      });
    }
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

    const nextEvent = createPlannerEventFromDraft(draft);

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

    if (activeCountdown?.eventId === nextEvent.id) {
      setActiveCountdown({
        eventId: nextEvent.id,
        title: nextEvent.title,
        start: nextEvent.start,
        end: nextEvent.end,
      });
    }

    setIsDialogOpen(false);
  };

  const handlePinCountdown = () => {
    if (!draft.title.trim()) {
      toast({
        title: "Add a title first",
        description: "The countdown widget needs an event title before it can be pinned.",
      });
      return;
    }

    if (!draft.start || !draft.end || draft.end <= draft.start) {
      toast({
        title: "Check the event timing",
        description: "The countdown widget needs a valid start and end time.",
      });
      return;
    }

    const nextEvent = createPlannerEventFromDraft(draft);

    setEvents((currentEvents) => {
      const existingIndex = currentEvents.findIndex((event) => event.id === nextEvent.id);

      if (existingIndex === -1) {
        return [...currentEvents, nextEvent];
      }

      return currentEvents.map((event) =>
        event.id === nextEvent.id ? nextEvent : event,
      );
    });

    setActiveCountdown({
      eventId: nextEvent.id,
      title: nextEvent.title,
      start: nextEvent.start,
      end: nextEvent.end,
    });

    setDraft((currentDraft) => ({
      ...currentDraft,
      id: nextEvent.id,
    }));

    toast({
      title: "Countdown pinned",
      description: `${nextEvent.title} will now stay visible from other pages.`,
    });

    setIsDialogOpen(false);
  };

  const handleDelete = () => {
    if (!draft.id) return;
    const eventTitle = draft.title;
    setEvents((currentEvents) =>
      currentEvents.filter((event) => event.id !== draft.id),
    );
    if (activeCountdown?.eventId === draft.id) {
      clearActiveCountdown();
    }
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
      {typeof eventContent.event.extendedProps.reminderMinutes === "number" ? (
        <div className="fc-event-reminder">
          {eventContent.event.extendedProps.reminderMinutes}m reminder
        </div>
      ) : null}
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
                events, drag-and-resize scheduling, and browser reminders while
                the app is open. Recurrence and experiment-linked tasks can come
                next.
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
              <Badge variant="outline" className="gap-1.5">
                <BellRing className="h-3.5 w-3.5" />
                Reminder support
              </Badge>
              {reminderSoundEnabled ? (
                <>
                  <Badge variant="secondary" className="gap-1.5">
                    <Bell className="h-3.5 w-3.5" />
                    Reminder sound on
                  </Badge>
                  <Button variant="outline" onClick={sendTestSound}>
                    <Bell className="h-4 w-4" />
                    Test sound
                  </Button>
                  <Button variant="outline" onClick={disableReminderSound}>
                    <Bell className="h-4 w-4" />
                    Turn sound off
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={enableReminderSoundPreference}>
                  <Bell className="h-4 w-4" />
                  Enable reminder sound
                </Button>
              )}
              {notificationPermission !== "granted" ? (
                <Button variant="outline" onClick={enableBrowserReminders}>
                  <Bell className="h-4 w-4" />
                  Enable browser reminders
                </Button>
              ) : (
                <>
                  <Badge variant="secondary" className="gap-1.5">
                    <BellRing className="h-3.5 w-3.5" />
                    Browser reminders on
                  </Badge>
                  <Button variant="outline" onClick={sendTestNotification}>
                    <Bell className="h-4 w-4" />
                    Test notification
                  </Button>
                </>
              )}
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
                  slotMinTime="00:00:00"
                  slotMaxTime="24:00:00"
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
              Reminders can trigger in the browser when permission is enabled and
              the dashboard is open. They are still local to this browser session
              for now, and browser or OS settings can still suppress popups.
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

            <div className="grid gap-2">
              <Label htmlFor="planner-event-reminder">Reminder</Label>
              <Select
                value={draft.reminderMinutes}
                onValueChange={(value) =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    reminderMinutes: value,
                  }))
                }
              >
                <SelectTrigger id="planner-event-reminder">
                  <SelectValue placeholder="Choose reminder timing" />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "none"
                        ? "No reminder"
                        : `Remind ${option} minutes before`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                {getReminderLabel(
                  draft.reminderMinutes === "none"
                    ? null
                    : Number(draft.reminderMinutes),
                )}
              </p>
            </div>
          </div>

          <DialogFooter className="justify-between gap-2 sm:justify-between">
            <div>
              {draft.id ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handlePinCountdown}>
                    <BellRing className="h-4 w-4" />
                    {activeCountdown?.eventId === draft.id
                      ? "Update pinned countdown"
                      : "Pin countdown"}
                  </Button>
                  <Button variant="destructive-ghost" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              ) : (
                <Button variant="outline" onClick={handlePinCountdown}>
                  <BellRing className="h-4 w-4" />
                  Save and pin countdown
                </Button>
              )}
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
