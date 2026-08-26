/**
 * T0.1 — connect a local folder.
 *
 * The requirement is not "a button exists". It is that a folder the researcher
 * chose turns into openable files, and that the control is only offered where
 * the browser can actually honour it — `showDirectoryPicker` is Chromium-only,
 * and a button that silently does nothing in Safari is worse than no button.
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import {
  ConnectFolderButton,
  detectFolderSupport,
  folderFromFileList,
  isDataFileName,
  readDirectoryHandle,
} from "@/components/data-analysis/workspace/folder-connect"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
})

/** A fake File System Access directory, in the shape the walk consumes. */
function dir(name: string, entries: unknown[]): unknown {
  return {
    name,
    kind: "directory",
    async *values() {
      for (const e of entries) yield e
    },
  }
}
function file(name: string): unknown {
  return { name, kind: "file", getFile: async () => new File(["a,b\n1,2"], name) }
}

describe("isDataFileName", () => {
  it("accepts the formats the workspace can already open", () => {
    expect(["plate.csv", "run.XLSX", "export.tsv", "saved.n9a"].every(isDataFileName)).toBe(true)
  })
  it("rejects everything else, including dotfiles", () => {
    expect(isDataFileName("readme.md")).toBe(false)
    expect(isDataFileName("protocol.pdf")).toBe(false)
    // `.DS_Store` otherwise sails through on a suffix match of nothing.
    expect(isDataFileName(".DS_Store")).toBe(false)
  })
})

describe("readDirectoryHandle", () => {
  it("flattens nested run folders and keeps the path that tells them apart", async () => {
    const handle = dir("2026-08-24 run", [
      file("notes.md"),
      file("plate.csv"),
      dir("plate-2", [file("plate.csv")]),
    ])

    const folder = await readDirectoryHandle(handle as never)

    expect(folder.name).toBe("2026-08-24 run")
    expect(folder.files.map((f) => f.path)).toEqual(["plate-2/plate.csv", "plate.csv"])
    expect(folder.truncated).toBe(false)
  })

  it("stops at a depth cap rather than hanging on a home directory", async () => {
    const deep = dir("a", [dir("b", [dir("c", [dir("d", [file("buried.csv")])])])])

    const folder = await readDirectoryHandle(deep as never)

    expect(folder.files).toHaveLength(0)
    // Said out loud, so the list never quietly claims to be the whole folder.
    expect(folder.truncated).toBe(true)
  })
})

describe("folderFromFileList", () => {
  it("reads the webkitdirectory fallback's relative paths", () => {
    const make = (path: string) => {
      const f = new File(["x"], path.split("/").pop() as string)
      Object.defineProperty(f, "webkitRelativePath", { value: path })
      return f
    }
    const folder = folderFromFileList([make("run/plate.csv"), make("run/notes.md"), make("run/b/od.xlsx")])

    expect(folder.name).toBe("run")
    expect(folder.files.map((f) => f.path)).toEqual(["b/od.xlsx", "plate.csv"])
  })
})

describe("detectFolderSupport", () => {
  it("does not claim the Chromium picker when it is absent", () => {
    expect(detectFolderSupport().directoryPicker).toBe(false)
  })
  it("sees the Chromium picker when it is there", () => {
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = () => {}
    expect(detectFolderSupport().directoryPicker).toBe(true)
  })
})

describe("ConnectFolderButton", () => {
  it("offers the native picker where it exists, and hands back the folder", async () => {
    const handle = dir("run", [file("plate.csv")])
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(async () => handle)
    const onConnect = vi.fn()

    render(<ConnectFolderButton onConnect={onConnect} />)
    fireEvent.click(await screen.findByRole("button", { name: "Connect a folder" }))

    await waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1))
    expect(onConnect.mock.calls[0][0].files.map((f: { path: string }) => f.path)).toEqual(["plate.csv"])
  })

  it("treats Escape as a cancel, not a failure", async () => {
    ;(window as { showDirectoryPicker?: unknown }).showDirectoryPicker = vi.fn(async () => {
      throw new DOMException("The user aborted a request.", "AbortError")
    })
    const onError = vi.fn()

    render(<ConnectFolderButton onConnect={vi.fn()} onError={onError} />)
    fireEvent.click(await screen.findByRole("button", { name: "Connect a folder" }))

    await waitFor(() => expect(screen.getByRole("button", { name: "Connect a folder" })).toBeEnabled())
    expect(onError).not.toHaveBeenCalled()
  })

  it("falls back to webkitdirectory rather than offering a control that does nothing", async () => {
    // No `showDirectoryPicker` — Firefox and Safari — but the input attribute
    // is supported.
    Object.defineProperty(HTMLInputElement.prototype, "webkitdirectory", { value: false, configurable: true })
    try {
      const onConnect = vi.fn()
      const { container } = render(<ConnectFolderButton onConnect={onConnect} />)

      const label = await screen.findByText("Connect a folder")
      expect(label.tagName).toBe("LABEL")
      const input = container.querySelector("input[type=file]") as HTMLInputElement
      expect(input.getAttribute("webkitdirectory")).toBe("")

      const f = new File(["x"], "plate.csv")
      Object.defineProperty(f, "webkitRelativePath", { value: "run/plate.csv" })
      fireEvent.change(input, { target: { files: [f] } })
      expect(onConnect).toHaveBeenCalledTimes(1)
    } finally {
      delete (HTMLInputElement.prototype as unknown as Record<string, unknown>).webkitdirectory
    }
  })

  it("says so where neither exists, instead of a dead button", async () => {
    render(<ConnectFolderButton onConnect={vi.fn()} />)
    expect(await screen.findByText(/can.t open a whole folder/i)).toBeInTheDocument()
    expect(screen.queryByRole("button")).toBeNull()
  })
})
