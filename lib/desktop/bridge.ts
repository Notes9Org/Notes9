"use client"

/**
 * Typed wrapper around the Tauri desktop shell.
 *
 * When the hosted app runs inside the Notes9 desktop app, the shell injects
 * `window.__TAURI__` (withGlobalTauri + a remote capability) exposing invoke()
 * for the shell's commands and listen() for its events. On the web build the
 * global is simply absent, and every helper here degrades to "not desktop":
 * `isDesktop()` returns false, commands reject, subscriptions no-op.
 *
 * HYDRATION SAFETY: `isDesktop()` is safe to CALL anywhere — it guards
 * `window` — but its value differs between the server render (always false)
 * and a desktop client (true). Never branch render output on it directly;
 * read it in an effect (`useState(false)` + `useEffect(() =>
 * setDesktop(isDesktop()), [])`) so server and first client render agree.
 */

type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>
type ListenFn = (
  event: string,
  handler: (event: { payload: unknown }) => void
) => Promise<() => void>

interface TauriGlobal {
  /** Tauri v2 shape. */
  core?: { invoke?: InvokeFn }
  /** v1 / flattened shape, kept so a shell upgrade cannot silently un-desktop us. */
  invoke?: InvokeFn
  event?: { listen?: ListenFn }
}

function tauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null
  return (window as Window & { __TAURI__?: TauriGlobal }).__TAURI__ ?? null
}

function getInvoke(): InvokeFn | null {
  const t = tauri()
  return t?.core?.invoke ?? t?.invoke ?? null
}

/** True only in the browser AND inside the desktop shell. Always false on the server. */
export function isDesktop(): boolean {
  return getInvoke() !== null
}

function shellInvoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const invoke = getInvoke()
  if (!invoke) {
    return Promise.reject(
      new Error(`${command} is only available inside the Notes9 desktop app.`)
    )
  }
  return invoke(command, args)
}

/* ── Shell commands ─────────────────────────────────────────────────────────
   Command names and argument shapes are the typed surface. Results stay
   `unknown` deliberately: the shell owns those schemas, and inventing field
   names here would let the UI render a shape the shell never promised. Narrow
   at the call site when a consumer lands. */

export function authLogin(provider?: string): Promise<unknown> {
  return shellInvoke("auth_login", provider === undefined ? undefined : { provider })
}

export function authStatus(): Promise<unknown> {
  return shellInvoke("auth_status")
}

export function authLogout(): Promise<unknown> {
  return shellInvoke("auth_logout")
}

export function connectFolder(path: string): Promise<unknown> {
  return shellInvoke("connect_folder", { path })
}

export function listFolders(): Promise<unknown> {
  return shellInvoke("list_folders")
}

export function disconnectFolder(path: string): Promise<unknown> {
  return shellInvoke("disconnect_folder", { path })
}

/**
 * Run an analysis on the shell's native CPython sidecar.
 *
 * The request/response JSON contract is IDENTICAL to the Pyodide worker path
 * (`lib/data-analysis/engine/worker.ts`): in goes the resolver's payload,
 * back comes the raw engine result — pre-identity-stamping, exactly what
 * `run()` in `notes9_engine.py` returns. The engine client stamps provenance
 * on it the same way regardless of which runtime computed it.
 */
export async function runAnalysis(payload: unknown): Promise<unknown> {
  const json = JSON.stringify(payload)
  // Tauri v2 maps JS camelCase to Rust snake_case (`request_json`) automatically.
  const raw = await shellInvoke("run_analysis", { requestJson: json })
  return typeof raw === "string" ? JSON.parse(raw) : raw
}

/* ── Shell events ──────────────────────────────────────────────────────────*/

export type DesktopEventName = "auth-changed" | "folder-change" | "ingest-status"

/**
 * Subscribe to a shell event. Returns a synchronous unsubscribe: Tauri's
 * unlisten resolves asynchronously, so an unsubscribe that races the
 * subscription is remembered and applied the moment the listener registers.
 * Outside the desktop shell this is a no-op and the unsubscribe does nothing.
 */
export function onDesktopEvent(
  event: DesktopEventName,
  handler: (payload: unknown) => void
): () => void {
  const listen = tauri()?.event?.listen
  if (!listen) return () => {}
  let unlisten: (() => void) | null = null
  let cancelled = false
  listen(event, (e) => {
    if (!cancelled) handler(e.payload)
  })
    .then((fn) => {
      if (cancelled) fn()
      else unlisten = fn
    })
    .catch(() => {
      // A shell that cannot register the listener emits nothing; there is
      // nothing to tear down and nothing useful to throw at a UI subscriber.
    })
  return () => {
    cancelled = true
    unlisten?.()
    unlisten = null
  }
}
