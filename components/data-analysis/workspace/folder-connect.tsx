"use client"

/**
 * Connect a local folder.
 *
 * T0.1: uploading one file worked and the library dialog listed files already
 * in an experiment, but there was no way to point the workspace at a folder on
 * the researcher's own machine — no `webkitdirectory`, no `showDirectoryPicker`
 * and no `FileSystemDirectoryHandle` anywhere in data-analysis. A plate reader
 * writes a folder per run; opening it a file at a time through a file dialog is
 * the whole friction.
 *
 * `showDirectoryPicker` is Chromium-only. Rather than offer a button that does
 * nothing in Firefox and Safari, this feature-detects and falls back to
 * `<input webkitdirectory>` (which those browsers DO support), and renders no
 * control at all where neither exists — the caller is told, so it can say why
 * instead of showing dead UI.
 *
 * ponytail: the folder is read once, into a list of `File`s. No
 * `FileSystemDirectoryHandle` is persisted and nothing watches for changes on
 * disk, because persisting a handle needs IndexedDB plus a re-permission
 * prompt on every reload, and neither is what "connect a folder" has to mean
 * to be useful. Re-connect re-reads. Store the handle when someone actually
 * asks for the folder to stay connected across sessions.
 */

import { useEffect, useId, useState } from "react"

/** The formats the workspace can already open — the upload control's own list. */
export const DATA_FILE_EXTENSIONS = [".csv", ".tsv", ".txt", ".xlsx", ".xls", ".n9a", ".json"] as const

export function isDataFileName(name: string): boolean {
  const lower = name.toLowerCase()
  // A leading dot is a dotfile, not an extension; `.DS_Store` and friends
  // otherwise sail through on a `.txt`-shaped match of nothing.
  if (lower.startsWith(".")) return false
  return DATA_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * A directory the researcher chose, flattened to the files worth opening.
 * `path` is relative to the chosen folder, so two `plate.csv`s in different
 * run directories are still distinguishable in the list.
 */
export interface ConnectedFolder {
  name: string
  files: { path: string; file: File }[]
  /** True when the walk stopped at a cap rather than at the end of the folder. */
  truncated: boolean
}

/**
 * Caps on the walk.
 *
 * A researcher who points this at their home directory should get a list, not
 * a hung tab. Three levels covers "run folder / plate / export"; 2000 files is
 * far past any real run and still cheap.
 */
const MAX_DEPTH = 3
const MAX_FILES = 2000

/** The slice of the File System Access API this uses, typed here because
 *  `showDirectoryPicker` is not in every TypeScript DOM lib. */
interface DirectoryHandleLike {
  name: string
  values(): AsyncIterableIterator<DirectoryHandleLike | FileHandleLike>
  kind: "directory" | "file"
}
interface FileHandleLike {
  name: string
  kind: "directory" | "file"
  getFile(): Promise<File>
}

export interface FolderSupport {
  /** Chromium's `window.showDirectoryPicker`. */
  directoryPicker: boolean
  /** `<input webkitdirectory>`, which Firefox and Safari do support. */
  webkitDirectory: boolean
}

/**
 * What this browser can actually do.
 *
 * Never called during render: both reads touch `window`, and a server render
 * that guessed differently from the client would be a hydration mismatch on a
 * control whose whole job is to be present or absent.
 */
export function detectFolderSupport(): FolderSupport {
  if (typeof window === "undefined") return { directoryPicker: false, webkitDirectory: false }
  return {
    directoryPicker: typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function",
    webkitDirectory:
      typeof HTMLInputElement !== "undefined" && "webkitdirectory" in HTMLInputElement.prototype,
  }
}

/** Depth-first walk of a chosen directory handle, capped. */
export async function readDirectoryHandle(handle: DirectoryHandleLike): Promise<ConnectedFolder> {
  const files: { path: string; file: File }[] = []
  let truncated = false

  const walk = async (dir: DirectoryHandleLike, prefix: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) {
      truncated = true
      return
    }
    for await (const entry of dir.values()) {
      if (files.length >= MAX_FILES) {
        truncated = true
        return
      }
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.kind === "directory") {
        await walk(entry as DirectoryHandleLike, path, depth + 1)
      } else if (isDataFileName(entry.name)) {
        files.push({ path, file: await (entry as FileHandleLike).getFile() })
      }
    }
  }

  await walk(handle, "", 1)
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { name: handle.name, files, truncated }
}

/** The `webkitdirectory` fallback's FileList, in the same shape. */
export function folderFromFileList(list: FileList | File[]): ConnectedFolder {
  const all = Array.from(list)
  const relative = (f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
  const root = relative(all[0] ?? new File([], ""))?.split("/")[0] ?? "Folder"
  const files = all
    .filter((f) => isDataFileName(f.name))
    .slice(0, MAX_FILES)
    .map((f) => ({ path: relative(f).split("/").slice(1).join("/") || f.name, file: f }))
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { name: root, files, truncated: all.length > MAX_FILES }
}

/**
 * One class list for both variants.
 *
 * The two branches below render a `<button>` and a `<label>` that must look
 * identical -- which browser you are in is not something the control should
 * advertise -- and they had drifted: only one centred its text, and neither
 * carried `shrink-0`. Inside the caller's `flex items-center justify-between`
 * row the button was free to be squeezed by a long folder name beside it, so
 * the label wrapped inside a fixed `h-9` and was clipped.
 *
 * `shrink-0` and `whitespace-nowrap` are the fix; `inline-flex items-center
 * justify-center` is what makes the `<label>` centre its text the way the
 * `<button>` does for free.
 */
const CONNECT_BUTTON_CLASS =
  "inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border px-3 text-sm font-medium transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"

export function ConnectFolderButton({
  onConnect,
  onError,
}: {
  onConnect: (folder: ConnectedFolder) => void
  /** Told when the browser cannot do this at all, so the caller can say why. */
  onError?: (message: string) => void
}) {
  const inputId = useId()
  const [support, setSupport] = useState<FolderSupport | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => setSupport(detectFolderSupport()), [])

  // Until the effect has run, server and client agree on "nothing here" — which
  // is also the honest state, since nothing is known about the browser yet.
  if (!support) return null

  if (support.directoryPicker) {
    return (
      <button
        type="button"
        disabled={busy}
        className={CONNECT_BUTTON_CLASS}
        onClick={async () => {
          setBusy(true)
          try {
            const picker = (window as unknown as { showDirectoryPicker: () => Promise<DirectoryHandleLike> })
              .showDirectoryPicker
            onConnect(await readDirectoryHandle(await picker.call(window)))
          } catch (e) {
            // An abort is the researcher pressing Escape, not a failure.
            if (!(e instanceof DOMException && e.name === "AbortError")) {
              onError?.("Couldn't read that folder.")
            }
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? "Reading folder…" : "Connect a folder"}
      </button>
    )
  }

  if (support.webkitDirectory) {
    return (
      <>
        <label htmlFor={inputId} className={CONNECT_BUTTON_CLASS}>
          Connect a folder
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          /* Set through a ref because these are not React DOM props; typing
             them onto the element would be a lie about the DOM interface. */
          ref={(el) => {
            if (!el) return
            el.setAttribute("webkitdirectory", "")
            el.setAttribute("directory", "")
          }}
          onChange={(e) => {
            const list = e.target.files
            if (list && list.length > 0) onConnect(folderFromFileList(list))
            // Reset so re-picking the SAME folder still fires a change event.
            e.target.value = ""
          }}
        />
      </>
    )
  }

  return (
    <p className="text-xs text-muted-foreground">
      This browser can&rsquo;t open a whole folder. Use Import file for one file at a time.
    </p>
  )
}
