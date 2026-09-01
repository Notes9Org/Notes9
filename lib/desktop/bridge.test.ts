import { afterEach, describe, expect, it, vi } from "vitest"
import {
  authLogin,
  authStatus,
  connectFolder,
  disconnectFolder,
  isDesktop,
  listFolders,
  onDesktopEvent,
  runAnalysis,
} from "./bridge"

/**
 * The bridge's whole job is to make "am I in the desktop shell?" and "talk to
 * it" safe to call from anywhere — server render included — so what is pinned
 * here is the degradation contract (absent shell ⇒ false / reject / no-op) and
 * the exact wire shapes the shell commands are invoked with.
 *
 * HYDRATION-MISMATCH CHECK: `isDesktop()` is false during SSR and true on a
 * desktop client. Any component that branches render output on it must read it
 * in an effect, never at render time — the SSR test below pins the server-side
 * value that makes render-time branching a guaranteed mismatch.
 */

type AnyWindow = Window & { __TAURI__?: unknown }

function installShell(shell: unknown) {
  ;(window as AnyWindow).__TAURI__ = shell
}

afterEach(() => {
  // Unstub first: after the SSR case, `window` is stubbed to undefined and the
  // delete below would throw before the restore ever ran.
  vi.unstubAllGlobals()
  delete (window as AnyWindow).__TAURI__
})

describe("isDesktop", () => {
  it("is false on the plain web (no __TAURI__ global)", () => {
    expect(isDesktop()).toBe(false)
  })

  it("is false during SSR, when there is no window at all", () => {
    // With `window` stubbed to undefined, `typeof window === "undefined"` holds
    // exactly as it does in a server component. This is the value a server
    // render produces — the reason render-time branching on isDesktop() is a
    // hydration mismatch on desktop.
    vi.stubGlobal("window", undefined)
    expect(isDesktop()).toBe(false)
  })

  it("is true under the Tauri v2 global (core.invoke)", () => {
    installShell({ core: { invoke: vi.fn() } })
    expect(isDesktop()).toBe(true)
  })

  it("is true under a flattened invoke shape", () => {
    installShell({ invoke: vi.fn() })
    expect(isDesktop()).toBe(true)
  })

  it("is false when the global exists but exposes no invoke", () => {
    installShell({ event: {} })
    expect(isDesktop()).toBe(false)
  })
})

describe("shell commands", () => {
  it("invokes the shell command with its declared arguments", async () => {
    const invoke = vi.fn().mockResolvedValue("ok")
    installShell({ core: { invoke } })

    await authLogin("google")
    expect(invoke).toHaveBeenLastCalledWith("auth_login", { provider: "google" })

    await authLogin()
    expect(invoke).toHaveBeenLastCalledWith("auth_login", undefined)

    await authStatus()
    expect(invoke).toHaveBeenLastCalledWith("auth_status", undefined)

    await connectFolder("/data/plates")
    expect(invoke).toHaveBeenLastCalledWith("connect_folder", { path: "/data/plates" })

    await listFolders()
    expect(invoke).toHaveBeenLastCalledWith("list_folders", undefined)

    await disconnectFolder("/data/plates")
    expect(invoke).toHaveBeenLastCalledWith("disconnect_folder", { path: "/data/plates" })
  })

  it("rejects, rather than throws or hangs, outside the desktop shell", async () => {
    await expect(authStatus()).rejects.toThrow(/desktop app/)
  })

  it("runAnalysis sends the payload as JSON and parses a JSON string reply", async () => {
    const reply = { test: { pValue: 0.03 }, warnings: [] }
    const invoke = vi.fn().mockResolvedValue(JSON.stringify(reply))
    installShell({ core: { invoke } })

    const payload = { test: "t-welch", shape: "groups", groups: { a: [1, 2] } }
    await expect(runAnalysis(payload)).resolves.toEqual(reply)

    const [command, args] = invoke.mock.calls[0] as [string, Record<string, string>]
    expect(command).toBe("run_analysis")
    // Same request JSON as the Pyodide worker hands to run(); Tauri v2 maps
    // `requestJson` to the command's `request_json` parameter automatically.
    expect(Object.keys(args)).toEqual(["requestJson"])
    expect(JSON.parse(args.requestJson)).toEqual(payload)
  })

  it("runAnalysis passes an already-decoded object reply through", async () => {
    const reply = { test: null, warnings: [] }
    installShell({ core: { invoke: vi.fn().mockResolvedValue(reply) } })
    await expect(runAnalysis({})).resolves.toBe(reply)
  })
})

describe("onDesktopEvent", () => {
  it("delivers shell event payloads and stops after unsubscribe", async () => {
    const unlisten = vi.fn()
    let emit: ((e: { payload: unknown }) => void) | undefined
    const listen = vi.fn((_: string, handler: (e: { payload: unknown }) => void) => {
      emit = handler
      return Promise.resolve(unlisten)
    })
    installShell({ core: { invoke: vi.fn() }, event: { listen } })

    const seen: unknown[] = []
    const off = onDesktopEvent("folder-change", (p) => seen.push(p))
    expect(listen).toHaveBeenCalledWith("folder-change", expect.any(Function))

    await Promise.resolve() // let the unlisten registration settle
    emit?.({ payload: { path: "/data/plates" } })
    expect(seen).toEqual([{ path: "/data/plates" }])

    off()
    expect(unlisten).toHaveBeenCalledTimes(1)
    emit?.({ payload: "late" })
    expect(seen).toHaveLength(1)
  })

  it("applies an unsubscribe that races the async listener registration", async () => {
    const unlisten = vi.fn()
    let settle: (fn: () => void) => void = () => {}
    const listen = vi.fn(
      () => new Promise<() => void>((resolve) => (settle = resolve))
    )
    installShell({ event: { listen } })

    const off = onDesktopEvent("auth-changed", () => {})
    off() // before the shell has finished registering
    settle(unlisten)
    await Promise.resolve()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it("is a no-op outside the desktop shell", () => {
    expect(() => onDesktopEvent("ingest-status", () => {})()).not.toThrow()
  })
})
