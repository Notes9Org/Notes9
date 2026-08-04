/**
 * Mirror the Pyodide distribution the compute engine needs into `public/pyodide/`.
 *
 *   npx tsx scripts/utilities/fetch-pyodide.ts
 *
 * Only for deploys that cannot reach the public CDN, or that will not accept a
 * third-party fetch in the critical path of a feature. See
 * `docs/data-analysis/self-hosting-pyodide.md`.
 *
 * It downloads the runtime plus the closure of ENGINE_PACKAGES.prebuilt and
 * nothing else: the full distribution is 343 packages, the engine uses ten of
 * them, and mirroring the rest would cost an operator an order of magnitude
 * more bytes for files no analysis will ever request.
 *
 * The version and the package list are imported from the engine contract rather
 * than restated here, so a bump to PYODIDE_VERSION cannot leave a mirror quietly
 * serving the previous runtime.
 */

import { createHash } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { ENGINE_PACKAGES, PYODIDE_VERSION } from "@/lib/data-analysis/engine/contract"

/**
 * What `loadPyodide` fetches before it can run anything. `pyodide.js` is the
 * classic-script entry the worker calls `importScripts` on; `pyodide.mjs` is the
 * ESM build, mirrored because it costs 7 KB and its absence would show up as a
 * 404 in a bundler change nobody connected to this script.
 */
const RUNTIME_FILES = [
  "pyodide.js",
  "pyodide.mjs",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
]

type LockPackage = { file_name: string; sha256: string; depends: string[] }
type Lock = { packages: Record<string, LockPackage> }

const SOURCE = (
  process.env.PYODIDE_SOURCE_URL || `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
).replace(/\/?$/, "/")

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "pyodide")

async function download(file: string): Promise<Buffer> {
  const response = await fetch(`${SOURCE}${file}`)
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status} from ${SOURCE}`)
  return Buffer.from(await response.arrayBuffer())
}

/**
 * Resolve the wheels to mirror. `depends` is transitive, so numpy's openblas
 * and pandas' pytz have to come along or the mirror boots and then fails at the
 * first import — the worst possible failure, because it looks like a bug in the
 * engine rather than a gap in the mirror.
 */
function closure(lock: Lock, roots: readonly string[]): LockPackage[] {
  const resolved = new Map<string, LockPackage>()
  const queue = [...roots]
  while (queue.length > 0) {
    const name = queue.pop()!.toLowerCase()
    if (resolved.has(name)) continue
    const pkg = lock.packages[name]
    if (!pkg) throw new Error(`${name} is not in the Pyodide ${PYODIDE_VERSION} lock file`)
    resolved.set(name, pkg)
    queue.push(...pkg.depends)
  }
  return [...resolved.values()]
}

async function main() {
  console.log(`Mirroring Pyodide ${PYODIDE_VERSION} from ${SOURCE}`)
  await mkdir(OUT_DIR, { recursive: true })

  let bytes = 0
  const write = async (file: string, body: Buffer) => {
    await writeFile(join(OUT_DIR, file), body)
    bytes += body.byteLength
    console.log(`  ${(body.byteLength / 1048576).toFixed(2)} MB  ${file}`)
  }

  const lockBody = await download("pyodide-lock.json")
  const lock = JSON.parse(lockBody.toString("utf8")) as Lock

  for (const file of RUNTIME_FILES) {
    await write(file, file === "pyodide-lock.json" ? lockBody : await download(file))
  }

  for (const pkg of closure(lock, ENGINE_PACKAGES.prebuilt)) {
    const body = await download(pkg.file_name)
    // The lock ships the hashes, so verifying is nearly free — and a mirror is
    // exactly the place a silently truncated download would go unnoticed until
    // it produced a wrong number rather than an error.
    const digest = createHash("sha256").update(body).digest("hex")
    if (digest !== pkg.sha256) {
      throw new Error(`${pkg.file_name}: sha256 ${digest} does not match the lock file`)
    }
    await write(pkg.file_name, body)
  }

  console.log(
    `\n${(bytes / 1048576).toFixed(1)} MB written to public/pyodide/\n` +
      `Set NEXT_PUBLIC_PYODIDE_BASE_URL=/pyodide/ and rebuild.`
  )
}

main().catch((err: unknown) => {
  console.error(`\nfetch-pyodide failed: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
