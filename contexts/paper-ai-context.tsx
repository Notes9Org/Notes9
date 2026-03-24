"use client"

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react"

interface PaperAIContextValue {
  /** Whether a paper editor is currently active and providing context */
  isActive: boolean
  paperTitle: string
  paperContent: string
  /** Register the paper editor — called by paper detail page */
  register: (opts: {
    title: string
    getContent: () => string
    onInsert: (html: string) => void
    getEditorContext: () => { before: string; after: string }
  }) => void
  /** Unregister when paper page unmounts */
  unregister: () => void
  /** Insert HTML into the editor */
  onInsert: (html: string) => void
  /** Get cursor context from the editor */
  getEditorContext: () => { before: string; after: string }
}

const PaperAIContext = createContext<PaperAIContextValue | null>(null)

export function PaperAIProvider({ children }: { children: ReactNode }) {
  const [isActive, setIsActive] = useState(false)
  const [paperTitle, setPaperTitle] = useState("")
  const getContentRef = useRef<() => string>(() => "")
  const onInsertRef = useRef<(html: string) => void>(() => {})
  const getEditorContextRef = useRef<() => { before: string; after: string }>(() => ({ before: "", after: "" }))

  const register = useCallback((opts: {
    title: string
    getContent: () => string
    onInsert: (html: string) => void
    getEditorContext: () => { before: string; after: string }
  }) => {
    setPaperTitle(opts.title)
    getContentRef.current = opts.getContent
    onInsertRef.current = opts.onInsert
    getEditorContextRef.current = opts.getEditorContext
    setIsActive(true)
  }, [])

  const unregister = useCallback(() => {
    setIsActive(false)
    setPaperTitle("")
    getContentRef.current = () => ""
    onInsertRef.current = () => {}
    getEditorContextRef.current = () => ({ before: "", after: "" })
  }, [])

  const onInsert = useCallback((html: string) => {
    onInsertRef.current(html)
  }, [])

  const getEditorContext = useCallback(() => {
    return getEditorContextRef.current()
  }, [])

  return (
    <PaperAIContext.Provider
      value={{
        isActive,
        paperTitle,
        paperContent: isActive ? getContentRef.current() : "",
        register,
        unregister,
        onInsert,
        getEditorContext,
      }}
    >
      {children}
    </PaperAIContext.Provider>
  )
}

export function usePaperAI() {
  return useContext(PaperAIContext)
}
