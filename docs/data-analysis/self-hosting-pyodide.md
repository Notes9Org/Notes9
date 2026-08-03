# Self-hosting the Data Analysis runtime

Data Analysis runs its statistics in the browser: a Web Worker boots Pyodide
(CPython compiled to WebAssembly) and imports numpy, scipy, pandas, statsmodels
and patsy. No server computes anything, and after boot the engine makes no
network requests at all.

The one exception is the boot itself. By default the worker fetches the runtime
and its wheels from `https://cdn.jsdelivr.net`. Everything the engine claims —
sandboxed, network-isolated, reproducible — is true only once that fetch has
succeeded.

## Why you would self-host

- **A network that blocks the CDN.** Enterprise egress filtering, an air-gapped
  install, or a lab VLAN with an allowlist. On such a network Data Analysis is
  not degraded, it is unavailable.
- **A CDN outage is your outage.** jsdelivr going down takes the feature with
  it, and nothing in your deploy can fix it while it is down.
- **Policy.** Some tenants will not accept a third-party origin in the critical
  path of a feature that touches their data, even though the payload is public
  and hash-verified.

If none of these apply to you, change nothing. The default is the CDN and it
stays the CDN.

## What it costs

The engine needs the Pyodide runtime plus ten wheels (the five packages it
imports, plus their transitive dependencies — openblas, pytz, dateutil, six,
packaging):

| | On disk |
|---|---|
| Runtime (`pyodide.js`, `.mjs`, `.asm.js`, `.asm.wasm`, `python_stdlib.zip`, lock) | 12.2 MB |
| scipy | 13.3 MB |
| statsmodels | 8.5 MB |
| pandas | 5.3 MB |
| numpy | 3.1 MB |
| openblas, pytz, dateutil, patsy, packaging, six | 2.8 MB |
| **Total (16 files)** | **45.3 MB** |

Serve it with compression and the wire cost is about 38 MB — the wasm and the
`.asm.js` compress well, the wheels are already zip archives and do not. Either
way this is the whole mirror, not a per-user download: a browser fetches the
same files from your origin that it would have fetched from the CDN, and caches
them the same way.

The mirror is **not** committed to the repository. It is 45 MB of wheels and
wasm that git cannot delta-compress, it would be added again in full on every
runtime upgrade, and it is exactly reproducible from the pinned version.
`.gitignore` excludes `/public/pyodide/`; treat fetching it as a build step.

## How to do it

1. **Fetch the runtime** into `public/pyodide/`:

   ```bash
   npx tsx scripts/utilities/fetch-pyodide.ts
   ```

   The script reads `PYODIDE_VERSION` and `ENGINE_PACKAGES.prebuilt` from
   `lib/data-analysis/engine/contract.ts`, resolves the dependency closure from
   the Pyodide lock file, and verifies every wheel against the sha256 in that
   lock before writing it. It downloads only what the engine imports — the full
   distribution is 343 packages and roughly an order of magnitude larger.

   To mirror from somewhere other than jsdelivr (an internal proxy, a GitHub
   release tarball you have already unpacked and served), set
   `PYODIDE_SOURCE_URL` to that directory.

2. **Point the worker at it** by setting the environment variable at build time:

   ```
   NEXT_PUBLIC_PYODIDE_BASE_URL=/pyodide/
   ```

   Any absolute URL works too — `https://assets.example.com/pyodide/` — if you
   serve the mirror from a CDN of your own. A trailing slash is added if you
   omit one.

   This is a `NEXT_PUBLIC_` variable, so it is inlined at build time. Changing
   it requires a rebuild and redeploy, not just a restart.

3. **Run the build.** `public/` is served as static assets, so `next build`
   picks the mirror up with no further configuration.

## Verifying it

Open a lab note, run any analysis, and watch the Network tab. Every request
under `pyodide/` should hit your origin and nothing should go to
`cdn.jsdelivr.net`. The results are unchanged: the engine version stamped on
every result already includes the Pyodide version, and the wheels are the same
bytes, verified by hash.

If the boot fails, the error names the URL it tried:

```
Could not load the statistics engine from /pyodide/ — …
```

That string is the diagnosis. A 404 means the mirror is incomplete or the base
URL is wrong; a CORS error means an absolute URL whose host is not sending
`Access-Control-Allow-Origin`; a mismatch between the mirror's version and
`PYODIDE_VERSION` shows up as a missing wheel, because the wheel filenames carry
their versions.

## Upgrading Pyodide

`PYODIDE_VERSION` in `lib/data-analysis/engine/contract.ts` is the single source
of truth — it feeds the default CDN URL, the fetch script, and the
`ENGINE_VERSION` stamped on every stored result. After bumping it, re-run
`fetch-pyodide.ts`; a self-hosted deploy that skips this will fail at boot with
the message above rather than quietly serving the old runtime.
