"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";
import {
  ListTodo,
  Trash2,
  Pencil,
  FlaskConical,
  FolderOpen,
  X,
  Check
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export type DashboardTask = {
  id: string;
  user_id: string;
  title: string;
  due_at: string | null;
  priority: "low" | "medium" | "high";
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MentionItem =
  | { type: "experiment"; id: string; name: string }
  | { type: "project"; id: string; name: string };

type NewTaskSegment =
  | { type: "text"; value: string }
  | {
      type: "mention";
      kind: "experiment" | "project";
      id: string;
      name: string;
    };

const ZWSP = "\u200B";
const PLACEHOLDER_REGEX = /\{\{(experiment|project)(?::([^}]+))?\}\}/g;

function segmentsToTitleWithPlaceholders(segments: NewTaskSegment[]): string {
  return segments
    .map((s) => {
      if (s.type === "text") return s.value.replace(new RegExp(ZWSP, "g"), "");
      if (s.type === "mention")
        return s.kind === "experiment"
          ? `{{experiment:${s.id}}}`
          : `{{project:${s.id}}}`;
      return "";
    })
    .join("")
    .trim();
}

type TitlePart =
  | { type: "text"; value: string }
  | { type: "mention"; kind: "experiment" | "project"; id: string | null };

function parseTitleWithPlaceholders(title: string): TitlePart[] {
  const parts: TitlePart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  PLACEHOLDER_REGEX.lastIndex = 0;
  while ((match = PLACEHOLDER_REGEX.exec(title)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: title.slice(lastIndex, match.index) });
    }
    parts.push({
      type: "mention",
      kind: match[1] as "experiment" | "project",
      id: match[2] ?? null,
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < title.length) {
    parts.push({ type: "text", value: title.slice(lastIndex) });
  }
  return parts;
}

function titleHasPlaceholders(title: string): boolean {
  return /\{\{(experiment|project)(?::[^}]+)?\}\}/.test(title);
}

const CHIP_ICON_EXPERIMENT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>';
const CHIP_ICON_PROJECT =
  '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>';

function buildEditFragment(
  parts: TitlePart[],
  experiments: { id: string; name: string }[],
  projects: { id: string; name: string }[],
): DocumentFragment {
  const frag = document.createDocumentFragment();
  const resolve = (kind: "experiment" | "project", id: string | null) => {
    if (!id) return null;
    if (kind === "experiment")
      return experiments.find((e) => e.id === id) ?? null;
    return projects.find((p) => p.id === id) ?? null;
  };
  for (const part of parts) {
    if (part.type === "text") {
      frag.appendChild(document.createTextNode(part.value));
      continue;
    }
    const resolved = resolve(part.kind, part.id);
    const name = resolved?.name ?? part.id ?? part.kind;
    const span = document.createElement("span");
    span.contentEditable = "false";
    span.setAttribute(MENTION_DATA.kind, part.kind);
    span.setAttribute(MENTION_DATA.id, part.id ?? "");
    span.setAttribute(MENTION_DATA.name, name);
    span.className =
      "inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground align-middle [&_svg]:size-3 shrink-0";
    span.style.display = "inline-flex";
    const icon = document.createElement("span");
    icon.innerHTML =
      part.kind === "experiment" ? CHIP_ICON_EXPERIMENT : CHIP_ICON_PROJECT;
    span.appendChild(icon);
    span.appendChild(document.createTextNode(" " + name));
    frag.appendChild(span);
  }
  return frag;
}

const MENTION_DATA = {
  kind: "data-mention-kind",
  id: "data-mention-id",
  name: "data-mention-name",
} as const;

function getSegmentsFromEl(el: HTMLElement): NewTaskSegment[] {
  const segments: NewTaskSegment[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent)
        segments.push({ type: "text", value: node.textContent });
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const kind = el.getAttribute(MENTION_DATA.kind) as
        | "experiment"
        | "project"
        | null;
      const id = el.getAttribute(MENTION_DATA.id);
      const name = el.getAttribute(MENTION_DATA.name);
      if (kind && id && name)
        segments.push({ type: "mention", kind, id, name });
      else el.childNodes.forEach(walk);
    }
  };
  el.childNodes.forEach(walk);
  return segments;
}

const MENTION_PLACEHOLDER = "\uFFFC";

function getTextBeforeCursorAndOffset(el: HTMLElement): {
  text: string;
  offset: number;
} {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { text: "", offset: 0 };
  const range = sel.getRangeAt(0);
  const anchorNode = range.startContainer;
  const anchorOffset = range.startOffset;
  let text = "";
  let offset = 0;
  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || "").length;
      if (node === anchorNode) {
        text += (node.textContent || "").slice(0, anchorOffset);
        offset = text.length;
        return true;
      }
      text += node.textContent || "";
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as HTMLElement;
      if (e.getAttribute(MENTION_DATA.id)) {
        if (node.contains(anchorNode) || node === anchorNode) {
          offset =
            text.length + (node === anchorNode && anchorOffset === 0 ? 0 : 1);
          text += MENTION_PLACEHOLDER;
          return true;
        }
        text += MENTION_PLACEHOLDER;
        return false;
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true;
      }
      return false;
    }
    return false;
  }
  for (let i = 0; i < el.childNodes.length; i++) {
    if (walk(el.childNodes[i])) break;
  }
  if (offset === 0) offset = text.length;
  return { text, offset };
}

function getTextBeforeCursor(el: HTMLElement): string {
  return getTextBeforeCursorAndOffset(el).text;
}

function getCursorOffset(el: HTMLElement): number {
  return getTextBeforeCursorAndOffset(el).offset;
}

function getRangeForCharRange(
  el: HTMLElement,
  start: number,
  end: number,
): Range | null {
  let count = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.textContent || "").length;
      if (count + len > start && startNode === null) {
        startNode = node;
        startOffset = start - count;
      }
      if (count + len >= end && endNode === null) {
        endNode = node;
        endOffset = Math.min(end - count, len);
        return true;
      }
      count += len;
      return false;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as HTMLElement;
      if (e.getAttribute(MENTION_DATA.id)) {
        count += 1;
        if (count > start && startNode === null) {
          startNode = node;
          startOffset = 0;
        }
        if (count >= end && endNode === null) {
          endNode = node;
          endOffset = 1;
          return true;
        }
        return false;
      }
      for (let i = 0; i < node.childNodes.length; i++) {
        if (walk(node.childNodes[i])) return true;
      }
      return false;
    }
    return false;
  }
  for (let i = 0; i < el.childNodes.length; i++) {
    if (walk(el.childNodes[i])) break;
  }
  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

function insertMentionIntoEditable(
  el: HTMLElement,
  item: MentionItem,
  startIndex: number,
  endIndex: number,
): void {
  const range = getRangeForCharRange(el, startIndex, endIndex);
  if (!range) return;
  range.deleteContents();
  const kind = item.type === "experiment" ? "experiment" : "project";
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.setAttribute(MENTION_DATA.kind, kind);
  span.setAttribute(MENTION_DATA.id, item.id);
  span.setAttribute(MENTION_DATA.name, item.name);
  span.setAttribute("tabindex", "-1");
  span.className =
    "inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground align-middle [&_svg]:size-3 shrink-0 cursor-default";
  span.style.display = "inline-flex";
  span.onclick = (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel) return;
    const after = span.nextSibling?.nextSibling ?? span.nextSibling ?? span;
    const range = document.createRange();
    if (after.nodeType === Node.TEXT_NODE) {
      range.setStart(after, after.textContent?.length ?? 0);
    } else {
      range.setStartAfter(after);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  const icon = document.createElement("span");
  icon.innerHTML =
    kind === "experiment" ? CHIP_ICON_EXPERIMENT : CHIP_ICON_PROJECT;
  span.appendChild(icon);
  span.appendChild(document.createTextNode(" " + item.name));
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className =
    "ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20 inline-flex";
  removeBtn.setAttribute("aria-label", "Remove");
  removeBtn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  removeBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    span.remove();
    el.normalize();
    el.dispatchEvent(new CustomEvent("mention-removed", { bubbles: true }));
  };
  span.appendChild(removeBtn);
  const zwsp = document.createTextNode("\u200B");
  const space = document.createTextNode(" ");
  range.insertNode(span);
  range.setStartAfter(span);
  range.setEndAfter(span);
  range.insertNode(zwsp);
  range.setStartAfter(zwsp);
  range.setEndAfter(zwsp);
  range.insertNode(space);
  el.focus();
  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStartAfter(space);
    r.collapse(true);
    sel.addRange(r);
  }
  el.normalize();
}

const PRIORITY_ORDER = { high: 3, medium: 2, low: 1 };
const TASKS_PAGE_SIZE = 50;
const SORT_OPTIONS = [
  { value: "due_date", label: "Due date" },
  { value: "priority", label: "Priority" },
  { value: "created", label: "Created" },
] as const;

function getQueryAfterAt(text: string): { query: string; startIndex: number } {
  const lastAt = text.lastIndexOf("@");
  if (lastAt === -1) return { query: "", startIndex: -1 };
  const after = text.slice(lastAt + 1);
  // If there's a space immediately after "@", treat this as no active mention.
  if (after.startsWith(" ")) {
    return { query: "", startIndex: -1 };
  }
  const space = after.indexOf(" ");
  const query = space === -1 ? after : after.slice(0, space);
  return { query, startIndex: lastAt };
}

export function TodoPanel({ initialTasks }: { initialTasks: DashboardTask[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<DashboardTask[]>(initialTasks);
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [segments, setSegments] = useState<NewTaskSegment[]>([
    { type: "text", value: "" },
  ]);
  const [dueDateStr, setDueDateStr] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [sortBy, setSortBy] = useState<"due_date" | "priority" | "created">(
    "due_date",
  );
  const [mentionOpen, setMentionOpen] = useState(false);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(-1);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [experiments, setExperiments] = useState<
    { id: string; name: string }[]
  >([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<DashboardTask | null>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const fetchTasks = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("dashboard_tasks")
      .select("*")
      .eq("user_id", user.id)
      .order("completed", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(0, TASKS_PAGE_SIZE - 1);
    if (data) {
      setTasks(data as DashboardTask[]);
      setHasMoreTasks(data.length === TASKS_PAGE_SIZE);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const loadMoreTasks = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || isLoadingMore || !hasMoreTasks) return;
    setIsLoadingMore(true);
    try {
      const from = tasks.length;
      const to = from + TASKS_PAGE_SIZE - 1;
      const { data } = await supabase
        .from("dashboard_tasks")
        .select("*")
        .eq("user_id", user.id)
        .order("completed", { ascending: true })
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(from, to);
      if (data?.length) {
        setTasks((prev) => [...prev, ...(data as DashboardTask[])]);
        setHasMoreTasks(data.length === TASKS_PAGE_SIZE);
      } else {
        setHasMoreTasks(false);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, [supabase, tasks.length, hasMoreTasks, isLoadingMore]);

  useEffect(() => {
    const loadMentionables = async () => {
      const [expRes, projRes] = await Promise.all([
        supabase.from("experiments").select("id, name").order("name"),
        supabase.from("projects").select("id, name").order("name"),
      ]);
      if (expRes.data) setExperiments(expRes.data);
      if (projRes.data) setProjects(projRes.data);
    };
    loadMentionables();
  }, [supabase]);

  const mentionItems: MentionItem[] = [
    ...experiments.map((e) => ({
      type: "experiment" as const,
      id: e.id,
      name: e.name,
    })),
    ...projects.map((p) => ({
      type: "project" as const,
      id: p.id,
      name: p.name,
    })),
  ];

  const showMention =
    mentionStartIndex !== -1 &&
    (mentionQuery.length === 0 ||
      mentionItems.some((m) =>
        m.name.toLowerCase().includes(mentionQuery.toLowerCase()),
      ));
  const filteredMentionItems = mentionQuery
    ? mentionItems.filter((m) =>
        m.name.toLowerCase().includes(mentionQuery.toLowerCase()),
      )
    : mentionItems;

  useEffect(() => {
    setMentionOpen(showMention && filteredMentionItems.length > 0);
  }, [showMention, filteredMentionItems.length]);

  useEffect(() => {
    if (mentionOpen) setSelectedMentionIndex(-1);
  }, [mentionOpen, mentionQuery]);

  const syncMentionFromEditable = useCallback(() => {
    const el = editableRef.current;
    if (!el) return;
    const textBefore = getTextBeforeCursor(el);
    const { query, startIndex } = getQueryAfterAt(textBefore);
    setMentionQuery(query);
    setMentionStartIndex(startIndex);
  }, []);

  useEffect(() => {
    const el = editableRef.current;
    if (!el) return;
    const onRemoved = () => setSegments(getSegmentsFromEl(el));
    el.addEventListener("mention-removed", onRemoved);
    return () => el.removeEventListener("mention-removed", onRemoved);
  }, []);

  useEffect(() => {
    if (!mentionOpen || !mentionListRef.current || selectedMentionIndex < 0)
      return;
    const el = mentionListRef.current.querySelector(
      `[role="option"]:nth-child(${selectedMentionIndex + 1})`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [mentionOpen, selectedMentionIndex]);

  const applyMention = (item: MentionItem) => {
    const el = editableRef.current;
    if (!el) return;
    const endIndex = getCursorOffset(el);
    const start = mentionStartIndex;
    setMentionOpen(false);
    setMentionStartIndex(-1);
    setMentionQuery("");
    insertMentionIntoEditable(el, item, start, endIndex);
    setSegments(getSegmentsFromEl(el));
    el.focus();
  };

  const addTask = async () => {
    if (isAdding) return;
    const title = segmentsToTitleWithPlaceholders(segments);
    if (!title.trim()) return;
    setIsAdding(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      let dueAt: string | null = null;
      if (dueDateStr) {
        if (dueTime) {
          dueAt = new Date(`${dueDateStr}T${dueTime}:00`).toISOString();
        } else {
          dueAt = new Date(`${dueDateStr}T00:00:00`).toISOString();
        }
      }
      const { data, error } = await supabase
        .from("dashboard_tasks")
        .insert({
          user_id: user.id,
          title,
          due_at: dueAt,
          priority,
        })
        .select("*")
        .single();
      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
        return;
      }
      setTasks((prev) => [data as DashboardTask, ...prev]);
      setSegments([{ type: "text", value: "" }]);
      if (editableRef.current) {
        editableRef.current.textContent = "";
        editableRef.current.focus();
      }
      setDueDateStr("");
      setDueTime("");
      setPriority("medium");
      toast({ title: "Task added" });
    } finally {
      setIsAdding(false);
    }
  };

  const toggleComplete = async (task: DashboardTask) => {
    const completed = !task.completed;
    const { error } = await supabase
      .from("dashboard_tasks")
      .update({
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", task.id);
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? {
              ...t,
              completed,
              completed_at: completed ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            }
          : t,
      ),
    );
  };

  const updateTask = async (
    taskId: string,
    payload: {
      title: string;
      due_at: string | null;
      priority: "low" | "medium" | "high";
    },
  ) => {
    const trimmed = payload.title.trim();
    if (!trimmed) return;
    const { error } = await supabase
      .from("dashboard_tasks")
      .update({
        title: trimmed,
        due_at: payload.due_at,
        priority: payload.priority,
        updated_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              title: trimmed,
              due_at: payload.due_at,
              priority: payload.priority,
            }
          : t,
      ),
    );
    setEditingId(null);
  };

  const deleteTask = async (taskId: string) => {
    const { error } = await supabase
      .from("dashboard_tasks")
      .delete()
      .eq("id", taskId);
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const startEdit = (task: DashboardTask) => {
    setEditingId(task.id);
  };

  const incomplete = tasks.filter((t) => !t.completed);
  const completed = tasks.filter((t) => t.completed);

  const sortedIncomplete = [...incomplete].sort((a, b) => {
    if (sortBy === "due_date") {
      const aDue = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bDue = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return aDue - bDue;
    }
    if (sortBy === "priority") {
      return (
        (PRIORITY_ORDER[b.priority] ?? 0) - (PRIORITY_ORDER[a.priority] ?? 0)
      );
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const sortedCompleted = [...completed].sort(
    (a, b) =>
      new Date(b.completed_at ?? b.updated_at ?? 0).getTime() -
      new Date(a.completed_at ?? a.updated_at ?? 0).getTime(),
  );

  const formatDue = (dueAt: string | null) => {
    if (!dueAt) return null;
    const d = new Date(dueAt);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5" />
              To-Do
            </CardTitle>
            {/* <CardDescription>
              Daily task management for your laboratory work
            </CardDescription> */}
          </div>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as typeof sortBy)}
          >
            <SelectTrigger className="w-[140px]" size="sm">
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
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new todo */}
        <div className="relative flex flex-wrap items-center gap-2">
          <Checkbox
            className="mt-0.5 invisible"
          />
          <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
            <PopoverAnchor asChild>
              <div className="flex-1 min-w-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                <div
                  ref={editableRef}
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Add a task... Use @ to link experiment or project"
                  className="outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground min-h-[1.5rem]"
                  onInput={() => {
                    if (!editableRef.current) return;
                    setSegments(getSegmentsFromEl(editableRef.current));
                    syncMentionFromEditable();
                  }}
                  onKeyDown={(e) => {
                    const el = editableRef.current;
                    if (
                      el &&
                      (e.key === "ArrowRight" || e.key === "ArrowLeft")
                    ) {
                      const sel = window.getSelection();
                      const anchor = sel?.anchorNode;
                      const mention =
                        anchor &&
                        (anchor.nodeType === Node.ELEMENT_NODE
                          ? (anchor as HTMLElement)
                          : (anchor as HTMLElement).parentElement
                        )?.closest?.("[data-mention-id]");
                      if (mention && el.contains(mention)) {
                        e.preventDefault();
                        const range = document.createRange();
                        if (e.key === "ArrowRight") {
                          const after =
                            mention.nextSibling?.nextSibling ??
                            mention.nextSibling ??
                            mention;
                          if (after.nodeType === Node.TEXT_NODE) {
                            range.setStart(
                              after,
                              after.textContent?.length ?? 0,
                            );
                          } else {
                            range.setStartAfter(after);
                          }
                        } else {
                          const before = mention.previousSibling;
                          if (before?.nodeType === Node.TEXT_NODE) {
                            range.setStart(
                              before,
                              before.textContent?.length ?? 0,
                            );
                          } else if (before) {
                            range.setStartAfter(before);
                          } else {
                            range.setStart(el, 0);
                          }
                        }
                        range.collapse(true);
                        sel?.removeAllRanges();
                        sel?.addRange(range);
                        return;
                      }
                    }
                    if (mentionOpen && filteredMentionItems.length > 0) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSelectedMentionIndex((i) =>
                          i < 0
                            ? 0
                            : Math.min(
                                i + 1,
                                filteredMentionItems.length - 1,
                              ),
                        );
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSelectedMentionIndex((i) =>
                          i <= 0 ? -1 : i - 1,
                        );
                        return;
                      }
                      if (e.key === "Enter" && selectedMentionIndex >= 0) {
                        const item =
                          filteredMentionItems[selectedMentionIndex];
                        if (item) {
                          e.preventDefault();
                          applyMention(item);
                          return;
                        }
                      }
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTask();
                    }
                    if (e.key === "Escape") setMentionOpen(false);
                  }}
                />
              </div>
            </PopoverAnchor>
            <PopoverContent
              className="w-[var(--radix-popover-trigger-width)] p-0"
              align="start"
              sideOffset={4}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div
                ref={mentionListRef}
                className="max-h-[200px] overflow-y-auto rounded-md"
                role="listbox"
                aria-label="Link experiment or project"
              >
                {filteredMentionItems.slice(0, 10).map((item, index) => (
                  <button
                    type="button"
                    key={`${item.type}-${item.id}`}
                    role="option"
                    aria-selected={
                      selectedMentionIndex >= 0 &&
                      index === selectedMentionIndex
                    }
                    className={cn(
                      "w-full text-left px-3 py-2 text-sm flex items-center gap-2 rounded-sm",
                      index === selectedMentionIndex
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50",
                    )}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyMention(item);
                    }}
                  >
                    {item.type === "experiment" ? (
                      <FlaskConical className="h-4 w-4 shrink-0" />
                    ) : (
                      <FolderOpen className="h-4 w-4 shrink-0" />
                    )}
                    <span className="truncate">{item.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground shrink-0">
                      {item.type}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        
          <Input
            type="date"
            value={dueDateStr}
            onChange={(e) => setDueDateStr(e.target.value)}
            className="w-[140px] md:text-xs"
          />
          <Input
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            className="w-[100px] md:text-xs"
          />
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as typeof priority)}
          >
            <SelectTrigger className="w-[100px] md:text-xs" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={addTask} size="sm" className="h8 w-16.5">
            Add
          </Button>
        </div>

        {/* Task list */}
        <motion.div layout className="space-y-3">
          {sortedIncomplete.map((task) => (
            <TaskRow
              key={task.id}
              layoutId={task.id}
              task={task}
              experiments={experiments}
              projects={projects}
              formatDue={formatDue}
              isEditing={editingId === task.id}
              onToggleComplete={() => toggleComplete(task)}
              onStartEdit={() => startEdit(task)}
              onSaveEdit={(payload) => updateTask(task.id, payload)}
              onCancelEdit={() => setEditingId(null)}
              onDelete={() => setTaskToDelete(task)}
            />
          ))}
          {sortedCompleted.length > 0 && (
            <>
              <div className="border-t pt-3 mt-3" />
              <p className="text-xs font-medium text-muted-foreground">
                Completed
              </p>
              {sortedCompleted.map((task) => (
                <TaskRow
                  key={task.id}
                  layoutId={task.id}
                  task={task}
                  experiments={experiments}
                  projects={projects}
                  formatDue={formatDue}
                  isEditing={editingId === task.id}
                  onToggleComplete={() => toggleComplete(task)}
                  onStartEdit={() => startEdit(task)}
                  onSaveEdit={(payload) => updateTask(task.id, payload)}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={() => setTaskToDelete(task)}
                  completed
                />
              ))}
            </>
          )}
        </motion.div>
        {hasMoreTasks && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadMoreTasks}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No tasks yet. Add one above.
          </p>
        )}
      </CardContent>
      <AlertDialog
        open={taskToDelete !== null}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              {taskToDelete ? (
                <span className="block text-muted-foreground text-sm">
                  This will permanently delete &quot;
                  <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 text-foreground">
                    {(() => {
                      const parts = parseTitleWithPlaceholders(
                        taskToDelete.title,
                      );
                      const hasMentions = parts.some((p) => p.type === "mention");
                      if (!hasMentions && parts.length <= 1) {
                        return (
                          parts[0]?.type === "text"
                            ? parts[0].value
                            : taskToDelete.title
                        );
                      }
                      return parts.map((part, i) =>
                        part.type === "text" ? (
                          <span key={i}>{part.value}</span>
                        ) : (() => {
                            const resolved =
                              part.kind === "experiment"
                                ? experiments.find((e) => e.id === part.id)
                                : projects.find((p) => p.id === part.id);
                            const name =
                              resolved?.name ?? part.id ?? part.kind;
                            return (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                              >
                                {part.kind === "experiment" ? (
                                  <FlaskConical className="h-3 w-3 shrink-0" />
                                ) : (
                                  <FolderOpen className="h-3 w-3 shrink-0" />
                                )}
                                {name}
                              </span>
                            );
                          })(),
                      );
                    })()}
                  </span>
                  &quot;. This action cannot be undone.
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (taskToDelete) {
                  await deleteTask(taskToDelete.id);
                  setTaskToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function TaskRow({
  layoutId,
  task,
  experiments,
  projects,
  formatDue,
  isEditing,
  onToggleComplete,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  completed = false,
}: {
  layoutId: string;
  task: DashboardTask;
  experiments: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  formatDue: (due: string | null) => string | null;
  isEditing: boolean;
  onToggleComplete: () => void;
  onStartEdit: () => void;
  onSaveEdit: (payload: {
    title: string;
    due_at: string | null;
    priority: "low" | "medium" | "high";
  }) => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  completed?: boolean;
}) {
  const editEditableRef = useRef<HTMLDivElement>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDateStr, setEditDueDateStr] = useState("");
  const [editTimeStr, setEditTimeStr] = useState("");
  const [editPriority, setEditPriority] = useState<
    "low" | "medium" | "high"
  >("medium");

  useEffect(() => {
    if (!isEditing) return;
    setEditTitle(task.title);
    if (task.due_at) {
      const d = new Date(task.due_at);
      setEditDueDateStr(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      );
      setEditTimeStr(
        `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      );
    } else {
      setEditDueDateStr("");
      setEditTimeStr("");
    }
    setEditPriority(task.priority);
  }, [isEditing, task.id, task.title, task.due_at, task.priority]);

  useEffect(() => {
    if (
      !isEditing ||
      !editEditableRef.current ||
      !titleHasPlaceholders(task.title)
    )
      return;
    const parts = parseTitleWithPlaceholders(task.title);
    const frag = buildEditFragment(parts, experiments, projects);
    editEditableRef.current.textContent = "";
    editEditableRef.current.appendChild(frag);
    requestAnimationFrame(() => editEditableRef.current?.focus());
  }, [isEditing, task.id, task.title, experiments, projects]);

  const getEditTitle = (): string => {
    if (titleHasPlaceholders(task.title) && editEditableRef.current) {
      const segments = getSegmentsFromEl(editEditableRef.current);
      return segmentsToTitleWithPlaceholders(segments).trim();
    }
    return editTitle.trim();
  };

  const handleSaveEdit = () => {
    const title = getEditTitle();
    if (!title) return;
    const dueAt =
      editDueDateStr.trim() !== ""
        ? editTimeStr.trim() !== ""
          ? new Date(`${editDueDateStr}T${editTimeStr}:00`).toISOString()
          : new Date(`${editDueDateStr}T00:00:00`).toISOString()
        : null;
    onSaveEdit({ title, due_at: dueAt, priority: editPriority });
  };

  const resolveMention = (
    kind: "experiment" | "project",
    id: string | null,
  ) => {
    if (!id) return null;
    if (kind === "experiment") {
      const resolved = experiments.find((e) => e.id === id);
      return resolved ? { name: resolved.name, id: resolved.id } : null;
    }
    const resolved = projects.find((p) => p.id === id);
    return resolved ? { name: resolved.name, id: resolved.id } : null;
  };
  return (
    <motion.div
      layout
      layoutId={layoutId}
      transition={{ type: "spring", stiffness: 350, damping: 30 }}
    >
      <div className="group flex flex-row items-center">
        <div className="flex-1 min-w-0 flex flex-row gap-2 items-center">
          {isEditing ? (
            <>
              <Checkbox
                checked={completed}
                onCheckedChange={onToggleComplete}
                className="mt-0.5 invisible"
              />
              <div className="relative flex flex-wrap items-center gap-2 grow">
                {titleHasPlaceholders(task.title) ? (
                  <div className="flex-1 min-w-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                    <div
                      ref={editEditableRef}
                      contentEditable
                      suppressContentEditableWarning
                      className="outline-none min-h-[1.5rem]"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveEdit();
                        }
                        if (e.key === "Escape") onCancelEdit();
                      }}
                    />
                  </div>
                ) : (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") onCancelEdit();
                    }}
                    className="h-8 text-sm flex-1 min-w-[120px]"
                    autoFocus
                  />
                )}
              </div>
              <div className="flex flex-row gap-2 items-center">
                <Input
                  type="date"
                  value={editDueDateStr}
                  onChange={(e) => setEditDueDateStr(e.target.value)}
                  className="w-[140px] md:text-xs"
                />
                <Input
                  type="time"
                  value={editTimeStr}
                  onChange={(e) => setEditTimeStr(e.target.value)}
                  className="w-[100px] md:text-xs"
                />
                <Select
                  value={editPriority}
                  onValueChange={(v) =>
                    setEditPriority(v as "low" | "medium" | "high")
                  }
                >
                  <SelectTrigger className="w-[100px] md:text-xs" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex flex-row gap-0.5 items-center">
                  <Button size="icon" className="h-8 w-8" onClick={handleSaveEdit}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <Checkbox
                checked={completed}
                onCheckedChange={onToggleComplete}
                className="mt-0.5"
              />
              {/* <div
                role="button"
                tabIndex={0}
                onClick={onStartEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onStartEdit();
                  }
                }}
                className={cn(
                  "min-h-[2.5rem] flex items-center gap-2 flex-wrap rounded-md -m-1 p-1 cursor-text text-left text-sm min-w-0 grow",
                  completed && "line-through text-muted-foreground",
                )}
                aria-label="Edit task"
              > */}
                <div className="grow">
                  <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 break-words min-w-0">
                    {titleHasPlaceholders(task.title)
                      ? parseTitleWithPlaceholders(task.title).map((part, i) =>
                          part.type === "text" ? (
                            <span key={i}>{part.value}</span>
                          ) : (
                            (() => {
                              const resolved = resolveMention(
                                part.kind,
                                part.id,
                              );
                              const href =
                                part.kind === "experiment"
                                  ? `/experiments/${resolved?.id}`
                                  : `/projects/${resolved?.id}`;
                              return resolved ? (
                                <Link
                                  key={i}
                                  href={href}
                                  className="text-primary hover:underline inline-flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground no-underline"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {part.kind === "experiment" ? (
                                    <FlaskConical className="h-3 w-3 shrink-0" />
                                  ) : (
                                    <FolderOpen className="h-3 w-3 shrink-0" />
                                  )}
                                  {resolved.name}
                                </Link>
                              ) : (
                                <span
                                  key={i}
                                  className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                                >
                                  {part.id ?? part.kind}
                                </span>
                              );
                            })()
                          ),
                        )
                      : task.title}
                  </span>
                </div>
                <div className="flex flex-row items-center gap-2">
                  {(() => {
                    const formattedDue = formatDue(task.due_at);
                    return (
                      formattedDue && (
                        <span className="text-xs text-muted-foreground">
                          {formattedDue}
                        </span>
                      )
                    );
                  })()}
                  <div className="w-[80px]">
                    <Badge
                      variant={task.priority === "high" ? "default" : "secondary"}
                      className={cn(
                        "text-xs",
                        task.priority === "low" &&
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {task.priority}
                    </Badge>
                  </div>
                </div>
              {/* </div> */}
            </>
          )}
        </div>
        {!isEditing && (
          <div className="flex items-center gap-0.5 shrink-0 opacity-100 group-hover:opacity-100 transition-opacity">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onStartEdit}
              aria-label="Edit task"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="destructive-ghost"
              className="h-8 w-8"
              onClick={onDelete}
              aria-label="Delete task"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
