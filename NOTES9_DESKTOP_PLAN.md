# Notes9 Desktop (Mac + Windows) — Feasibility & Migration Plan

**Status:** Planning / assessment only — no build work started.
**Date:** 2026-07-01
**Goal:** Ship Notes9 as a native desktop app for macOS + Windows, with data stored **locally on the device** instead of Supabase cloud.

> TL;DR — This is a **major-version fork, not a feature.** It's really four migrations at once (database, file storage, auth, and the AI/collaboration services). The good news: almost all Supabase access funnels through ~5 helper files, so a compatibility shim makes it tractable. Realistic effort: **~4–6 weeks for a lean local-only MVP; ~2–4 months for a distributable v1.**

---

## 1. Current architecture (the starting point)

Notes9 is a cloud, multi-service, multi-tenant platform — not a static web page. This is the decisive fact for the port.

| Layer | What it is | Cloud coupling |
|---|---|---|
| **Frontend** | Next.js App Router, ~152k LOC TS/TSX, **59 API routes** | SSR + server-side auth |
| **Database** | Supabase **Postgres, 58 tables**, RLS-heavy (org-collaborative), **89 SQL scripts** | Heavy |
| **Vector/AI search** | **pgvector** `vector(1536)`, **HNSW indexes**, cosine-similarity RPCs, Postgres FTS (`to_tsvector`) | Heavy — this is the RAG engine |
| **File storage** | Supabase Storage `user` bucket (private, **signed URLs**) — PDFs, molecular files (~25 MB), chat attachments — **27 files** | Heavy |
| **Auth** | Supabase Auth (Google OAuth + email/pw) — **27 files** call `auth.getUser` | Heavy |
| **Realtime** | Supabase Realtime (research map, presence) — 2 files | Medium |
| **Collaboration** | Separate **Hocuspocus/Yjs WebSocket server** (`collaboration-server/`) | Network-inherent |
| **AI (Catalyst)** | Separate **Python backend on AWS Bedrock** + web search (OpenAlex/PubMed/Perplexity) | Cloud LLM |

---

## 2. Requirements to build the desktop version

### Shell / framework
- **Recommendation: Electron** (not Tauri). The 59 API routes + SSR need a Node runtime; Electron runs the Next.js app as an embedded local server in the main process. Tauri (Rust) fights Next.js SSR.
- Add: Electron `main` + `preload`, `electron-builder` (`.dmg`/`.pkg` for Mac, NSIS `.exe`/optional MSI for Windows), `electron-updater` for auto-update.

### Local data layer ("internal storage")
- **Database → PGlite (WASM Postgres) with pgvector.** Key insight: PGlite runs Postgres **in-process**, supports **pgvector + full-text search**, and persists to a local file. This preserves **~90% of the existing schema, RPCs, HNSW/vector search, and FTS** instead of rewriting into SQLite + sqlite-vec.
  - Drop all **RLS** (single-user local = no multi-tenant boundary). Enforce any needed checks in the app layer.
  - Rewrite every `auth.uid()` reference across the 89 SQL scripts.
- **File storage → local filesystem** under `app.getPath('userData')`. Replace the signed-URL flow (`/api/files/sign`, `/api/files/register`, 27 storage files) with a local file-serving route + `file://`/custom protocol.
- **Auth → local**, via OS keychain (Electron `safeStorage`/keytar). Optionally keep a separate lightweight *online licensing* check.
- **Encryption at rest** — local DB + file store are user-writable; encrypt (SQLCipher-equivalent). Device-level FileVault/BitLocker alone is insufficient for compliance.

### AI & collaboration trade-offs
- **AI (Catalyst/Bedrock): cloud-optional.** Core ELN works offline; AI generation needs internet (Bedrock endpoint or user API key). **Embeddings can run locally** (small on-device model via `transformers.js`/ONNX) so RAG indexing stays offline.
- **Real-time collaboration:** disappears in a local-only build. Yjs still provides local undo/history, but no remote peers.

### Distribution (non-optional to ship)
- **macOS:** Apple Developer account ($99/yr), Developer ID cert, **hardened runtime + Apple notarization** (else Gatekeeper: "app is damaged").
- **Windows:** **Authenticode cert** — OV (~$200–400/yr) or **EV (~$300–600/yr, usually HSM/hardware token)** to avoid SmartScreen warnings.

---

## 3. Rules & regulations

This is an **ELN for biotech/research** — going local *shifts* the compliance burden onto the endpoint; it doesn't remove it.

- **FDA 21 CFR Part 11** (regulated pharma/biotech/clinical customers): immutable **audit trails**, **electronic signatures**, access control, retention, **system validation (IQ/OQ/PQ)**. Existing audit-diff infra (lab-note draft/commit) is a start; local storage additionally requires **append-only, tamper-evident audit logs + checksums** because a local DB file is user-editable.
- **ALCOA+ data-integrity principles** (Attributable, Legible, Contemporaneous, Original, Accurate + Complete, Consistent, Enduring, Available).
- **GxP / GLP** if used in regulated labs.
- **HIPAA** — only if PHI flows through: encryption at rest + access control (local + device encryption can satisfy this cleanly).
- **GDPR/CCPA** — generally *easier* local (no cloud processor/DPA), but must still provide **export + delete**.
- **Third-party license compliance** — bundling deps into a distributed binary triggers obligations. MIT/Apache/PostgreSQL-license deps are fine; **audit for any GPL/AGPL** dependency before distributing.
- **Code signing/notarization** (above) functions as a distribution "regulation."

**Net:** local storage is a genuine selling point for IP-sensitive labs (aligns with the "your research stays private" positioning) — but only with audit-trail hardening + encryption. Don't ship a plain local DB file to a Part-11 customer.

---

## 4. Impact

**Gains**
- Works **offline**; data sovereignty (strong biotech wedge).
- No Supabase per-seat cost; eliminates recurring **connection-exhaustion / RLS-recursion** problems.
- Faster local reads; simpler infra.

**Losses / risks**
- **Real-time collaboration + cross-device sync disappear** in a pure local build.
- **Cloud AI needs internet** (or degraded local models).
- **Backups become the user's responsibility**; can't inspect their DB to debug.
- **Slower fixes** — push app updates, not a server deploy.
- **Larger install** (~150–300 MB) + per-OS signing overhead.
- Regulatory responsibility moves to the endpoint.

---

## 5. Strategic fork (decide first — it roughly doubles data-layer effort)

- **A) Local-only, single-user** — offline, no collaboration. Fastest.
- **B) Local-first + optional cloud sync** — local default, optional sync keeps collaboration/multi-device.

**Recommendation:** architect for **B** (put a swappable data-access/repository layer behind the Supabase helpers) but **ship local-only v1 (A)** first. Avoid hard-coding PGlite everywhere or you'll rewrite twice.

---

## 6. Concrete file/script changes (data off Supabase → local)

Work concentrates in a few chokepoints — everything funnels through ~5 helper files.

| Area | Files | Change |
|---|---|---|
| **DB client** | `lib/supabase/client.ts`, `server.ts`, `middleware.ts`, `lib/supabase-service-role.ts`, `lib/protocol-context-supabase.ts` | Replace with a **PGlite-backed client exposing the same `.from().select()...` surface** (shim) so the 21 direct importers + 59 routes mostly don't change. |
| **Schema** | `scripts/*.sql` (**89 files**) | Consolidate into a **local migration runner** PGlite executes on first launch. Neutralize RLS files (e.g. `053_supabase_rls_migration.sql`), rewrite `auth.uid()`. Keep pgvector/HNSW/FTS. |
| **Auth** | `middleware.ts` + 27 `auth.getUser`/`getClaims` sites | Local session (OS keychain). |
| **Storage** | 27 files (`.upload`, signed URLs), `/api/files/sign`, `/api/files/register` | Local FS + local file-serving route. |
| **Realtime** | 2 files (`.channel`/`postgres_changes`) | Drop or local-only. |
| **Build** | `next.config.mjs` + new `electron/` main+preload + `electron-builder` config | Package the app. |
| **AI/collab** | Catalyst frontend calls + `collaboration-server/` | AI cloud-optional; collab disabled/omitted in local-only mode. |

---

## 7. Time estimate (solo developer)

| Workstream | Estimate |
|---|---|
| Electron shell + Next.js embedding + Mac/Win packaging | 1–2 weeks |
| Local data layer (PGlite+pgvector, schema/RPC port, RLS removal, storage→FS, auth→local) | 3–5 weeks |
| AI cloud-optional + local embeddings | 1–3 weeks |
| Code signing + notarization + auto-update | ~1 week |
| Audit-trail/encryption hardening (**only if Part 11 needed**) | 2–4 weeks |
| Cross-OS QA + offline edge cases | 1–2 weeks |

- **Lean local-only MVP** (cut offline-AI + Part-11 hardening): **~4–6 weeks.**
- **Solid, distributable v1:** **~2–4 months.**

---

## 8. Recommended first steps

1. **Introduce a data-access/repository layer** behind the 5 Supabase helper files. De-risks everything; useful even without desktop.
2. **Electron + PGlite proof-of-concept** booting the app against a local DB — validates the pgvector-local assumption (the load-bearing technical risk).
3. Then decide fork A vs B before scaling out the port.
