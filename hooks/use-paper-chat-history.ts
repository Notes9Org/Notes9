"use client"

import { useState, useCallback, useEffect } from "react"

export interface PaperChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
}

export interface PaperChatSession {
  id: string
  paperId: string
  title: string
  messages: PaperChatMessage[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = "paper-chat-sessions"
const MAX_SESSIONS_PER_PAPER = 20

function loadAllSessions(): PaperChatSession[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAllSessions(sessions: PaperChatSession[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // localStorage full — prune old sessions
    const pruned = sessions.slice(0, 50)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned))
  }
}

export function usePaperChatHistory(paperId: string) {
  const [sessions, setSessions] = useState<PaperChatSession[]>([])
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Load sessions for this paper on mount
  useEffect(() => {
    const all = loadAllSessions()
    const paperSessions = all
      .filter(s => s.paperId === paperId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    setSessions(paperSessions)
    setLoaded(true)
  }, [paperId])

  const currentSession = sessions.find(s => s.id === currentSessionId) || null

  const createSession = useCallback((title?: string): string => {
    const id = `ps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const session: PaperChatSession = {
      id,
      paperId,
      title: title || "New conversation",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const all = loadAllSessions()
    all.unshift(session)
    // Prune old sessions for this paper
    const paperCount = all.filter(s => s.paperId === paperId).length
    const pruned = paperCount > MAX_SESSIONS_PER_PAPER
      ? all.filter((s, i) => s.paperId !== paperId || i < MAX_SESSIONS_PER_PAPER)
      : all
    saveAllSessions(pruned)
    setSessions(prev => [session, ...prev])
    setCurrentSessionId(id)
    return id
  }, [paperId])

  const addMessage = useCallback((sessionId: string, msg: PaperChatMessage) => {
    const all = loadAllSessions()
    const idx = all.findIndex(s => s.id === sessionId)
    if (idx === -1) return

    all[idx].messages.push(msg)
    all[idx].updatedAt = Date.now()
    // Auto-title from first user message
    if (all[idx].messages.filter(m => m.role === "user").length === 1 && msg.role === "user") {
      all[idx].title = msg.content.slice(0, 60) || "New conversation"
    }
    saveAllSessions(all)
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...all[idx] } : s))
  }, [])

  const deleteSession = useCallback((sessionId: string) => {
    const all = loadAllSessions().filter(s => s.id !== sessionId)
    saveAllSessions(all)
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    if (currentSessionId === sessionId) setCurrentSessionId(null)
  }, [currentSessionId])

  /** Revert session to a specific message — removes all messages after it */
  const revertToMessage = useCallback((sessionId: string, messageId: string) => {
    const all = loadAllSessions()
    const idx = all.findIndex(s => s.id === sessionId)
    if (idx === -1) return

    const msgIdx = all[idx].messages.findIndex(m => m.id === messageId)
    if (msgIdx === -1) return

    all[idx].messages = all[idx].messages.slice(0, msgIdx + 1)
    all[idx].updatedAt = Date.now()
    saveAllSessions(all)
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...all[idx] } : s))
  }, [])

  const getMessages = useCallback((sessionId: string): PaperChatMessage[] => {
    return sessions.find(s => s.id === sessionId)?.messages || []
  }, [sessions])

  return {
    sessions,
    currentSessionId,
    currentSession,
    loaded,
    setCurrentSessionId,
    createSession,
    addMessage,
    deleteSession,
    revertToMessage,
    getMessages,
  }
}
