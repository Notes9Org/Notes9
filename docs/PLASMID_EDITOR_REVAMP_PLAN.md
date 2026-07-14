# Plasmid Viewer → Molecular Workbench: Revamp & Feature Plan

_Status: proposal / roadmap. Owner: TBD. Last updated: 2026-07-03._

This document is a complete "possibility space" for turning the current sample-scoped
plasmid **viewer** into a full **molecular biology workbench** competitive with SnapGene /
Benchling / Geneious, plus a phased plan to get there. It is deliberately exhaustive — treat
it as a menu, not a mandate. Each feature is tagged with effort (**S** ≤2d, **M** ~1wk,
**L** ~2–4wk, **XL** multi-month) and any external dependency.

---

## 1. Where we are today (baseline)

Everything molecular lives inside **Samples → Molecular Files tab**. There is no dedicated
plasmid route; a plasmid is a file attached to a sample.

**What works today**
- `sample-plasmid-viewer.tsx` (~1360 lines): a **SeqViz**-based circular/linear/both map.
- Parsing via `@teselagen/bio-parsers` `anyToJson`: GenBank, FASTA, SnapGene `.dna` (binary
  header sniff), JSON, text fallback (`lib/sample-molecular.ts` → `parseSequenceText`).
- Read-only feature/primer rendering from the parsed file.
- **Custom annotations** from a drag-selection (name + color), persisted to
  `sample_files.parsed_metadata.customAnnotations`.
- **Selection panel**: sub-sequence, length, GC%, copy.
- **Pairwise alignment** (Needleman-Wunsch / Smith-Waterman / semi-global) with
  reverse-complement, identity/score/gaps/frameshift — hand-rolled DP in `lib/sample-molecular.ts`,
  **main-thread**, hard-capped at 25M cells (~5kbp²).
- **CRISPR** SpCas9 NGG 20-nt guide scan with GC / poly-T / self-seed ranking.
- Search, 5 color schemes, fullscreen, FASTA export, raw-JSON edit/save.
- Data model: `sample_files` with `parsed_metadata jsonb` + `viewer_state jsonb`; files in
  Supabase Storage bucket `user`. **All compute is client-side.** No molecular API routes.

**What does NOT exist**
- True sequence **editing** (insert/delete/replace bases), undo/redo.
- **Restriction enzymes** (digest, cut map, virtual gel).
- **ORF finder / translation** UI (fields exist in the type, nothing populates/renders them).
- **Primer design** (primers only shown if already in the file).
- **BLAST** or any remote database search.
- **Cloning simulation** (restriction, Gibson, Golden Gate, Gateway).
- **Signal peptide / domain** prediction.
- Auto-annotation ("detect common features").
- No test coverage for the alignment/CRISPR logic (non-trivial pure functions, easy targets).

---

## 2. The one decision that shapes everything: viewer engine

`seqviz` is a **read-only** renderer. Almost every feature below needs an *editable*
document model (edit bases, drag features, overlay enzyme cuts, translate, digest). We have
three paths:

| Option | What it gives | Cost | Recommendation |
|---|---|---|---|
| **A. Keep SeqViz, build tools around it** | Minimal churn; tools render into side panels and re-feed annotations/primers to SeqViz | Editing must be faked via JSON round-trips; enzyme/ORF overlays are bolt-ons | Fine for P0/P1 quick wins only |
| **B. Adopt `@teselagen/open-vector-editor` (OVE)** | A batteries-included editor from the **same vendor as `bio-parsers` we already use**: base editing, feature/part/primer CRUD, restriction enzymes + digests, ORFs, 6-frame translation, cut sites, circular+linear+rows views, GenBank round-trip | ~1–2MB bundle; Redux-based; needs theming to match our shadcn/Tailwind look; migrate `parsed_metadata` shape | **Recommended core.** It collapses months of P1–P2 work into integration work |
| **C. Build a custom SVG/canvas editor** | Full control, perfect design fit, no Redux | XL+; we'd reimplement what OVE already does | Only for the circular "figure" view if OVE's isn't pretty enough |

**Recommended architecture:** adopt **OVE** as the editing core, keep **SeqViz** as the
lightweight "pretty circular map" for embeds/figures and read-only contexts, keep **Mol\***
for protein 3D. Wrap all three behind one `MolecularWorkbench` component so the sample tab,
a future standalone `/plasmids` route, and lab-note embeds share the same engine.

> If we would rather not take the OVE dependency, every P1–P2 feature below is still doable
> on top of SeqViz + our own libs; it's just materially more code. The rest of this plan is
> written so it applies either way — the feature descriptions are engine-agnostic.

---

## 3. Backend / data-model changes

Today sequence data is a denormalized JSON blob in `sample_files.parsed_metadata`. That is
fine for a single viewer but blocks search, versioning, and cross-sample tools. Proposed:

1. **Promote plasmids to first-class records** (new migration, `09x_plasmids.sql`):
   - `plasmids` (id, org_id, name, sequence, is_circular, length, topology, created_by, …).
   - `plasmid_features` (plasmid_id, name, type, start, end, strand, color, qualifiers jsonb).
   - `plasmid_primers`, `plasmid_versions` (immutable snapshots for history/diff).
   - Keep `sample_files` as the *attachment/import* path; a plasmid can be created from a
     `sample_file` or standalone. Follow the repo convention: `user_id`/`created_by`
     references `public.profiles(id)`, RLS via `auth.uid()` (see existing sample RLS).
2. **Molecular API routes** (`app/api/molecular/*`) — a server surface for things that can't
   or shouldn't run in the browser: BLAST proxy, SignalP/InterPro proxy, NCBI/Addgene fetch,
   heavy digests, enzyme DB. Avoids CORS and hides third-party keys.
3. **Web Worker layer** (`lib/molecular/workers/`) — move alignment, digest, ORF scan, and
   enzyme search off the main thread; removes the 25M-cell cap and unfreezes the UI.
4. **Server-side parsing** for large/binary files (SnapGene, AB1) via an API route so the
   client doesn't download multi-MB blobs just to read a header.

---

## 4. Feature catalog (the "possibility for everything")

### A. True sequence editing
- **A1** Edit bases: insert / delete / replace, typing over a selection. **M** (free with OVE)
- **A2** Undo/redo history stack. **S** (free with OVE)
- **A3** Cut / copy / paste (as DNA, reverse-complement, or protein). **S–M**
- **A4** Set/reset circular origin, rotate, flip strand, linear↔circular toggle. **S** (OVE)
- **A5** Reverse-complement whole molecule or selection. **S** (`reverseComplement` exists)
- **A6** Feature CRUD: edit/resize/recolor/delete existing features + qualifiers, not just add. **M**
- **A7** Multi-sequence documents (several constructs in one file/tab). **M**

### B. Import / export (round-trip)
- **B1** Export **GenBank** (`jsonToGenbank` already in bio-parsers) — currently FASTA-only. **S**
- **B2** Export **BED** (`jsonToBed`), plain sequence, reverse-complement, protein. **S**
- **B3** Import **AB1 Sanger chromatograms** (`ab1ToJson`) with trace rendering. **M**
- **B4** Import **GFF, SBOL, Geneious, JBEI, FASTQ** (all have `*ToJson` parsers already). **S–M**
- **B5** SnapGene `.dna` **export** (binary writer — bio-parsers only reads it). **L** _(3rd-party/custom)_
- **B6** Import by accession/URL: **NCBI** (efetch), **Addgene**, **iGEM registry**. **M** _(API route, no key for NCBI)_
- **B7** Drag-and-drop + paste-a-sequence to create a construct. **S**
- **B8** Publication figure export: **SVG / PNG / PDF** of the map (SeqViz renders SVG). **M**

### C. Restriction enzymes  _(explicitly requested)_
- **C1** Bundled **REBASE** enzyme set (OVE ships a default list; or bundle our own JSON). **S–M**
- **C2** Single / double / multi-enzyme **digest**; cut-site table (position, overhang, frags). **M**
- **C3** **Cut-site overlay** on circular + linear map; unique-cutter / non-cutter / N-cutter filters. **M**
- **C4** **Virtual gel**: predicted fragment sizes rendered as a lane vs a ladder (log-scale migration). **M**
- **C5** Enzyme filters: supplier, methylation sensitivity (**dam/dcm/CpG**), star activity, buffer/temp. **M**
- **C6** Isoschizomers / neoschizomers, compatible-end finder. **S**
- **C7** "Find enzymes that cut once in the MCS but not the insert" helper. **M**

### D. Cloning & assembly simulation
- **D1** **Restriction cloning**: cut vector + insert, ligate, predict product (with orientation). **L**
- **D2** **Gibson / In-Fusion / SLIC**: overlap-based assembly + auto overlap-primer design. **L**
- **D3** **Golden Gate / MoClo**: Type IIS (BsaI/BsmBI) assembly with fusion-site checking. **L**
- **D4** **Gateway** (att sites) and **TOPO** cloning. **M**
- **D5** **PCR simulation**: primer binding → amplicon prediction, mispriming warnings. **M**
- **D6** **Codon optimization** for a target organism (E. coli, yeast, CHO, human…) + rare-codon flags. **M**
- **D7** Assembly workspace: drag fragments, see junctions, export the product as a new plasmid. **L**

### E. Sequence analysis
- **E1** **ORF finder** (min length, start/stop codons, all 6 frames) + map overlay. **M** (OVE has ORFs)
- **E2** **6-frame translation**; selectable genetic code (standard + 30-odd NCBI tables). **M** (OVE)
- **E3** Protein stats: **MW, pI, extinction coeff, GRAVY, aa composition**. **S**
- **E4** **GC content sliding-window** plot + **GC skew** (ori/ter hint). **S**
- **E5** **Tm** calculators (nearest-neighbor), hairpin & primer-dimer detection. **M**
- **E6** Codon-usage table & CAI vs a reference organism. **M**
- **E7** Sequence composition / complexity, repeat finder, poly-N runs. **S**

### F. BLAST & database search  _(explicitly requested)_
- **F1** **NCBI BLAST** (blastn / blastx / tblastn / blastp) via the public **QBlast URL API**,
  proxied through `app/api/molecular/blast` (async submit + poll). Selection or whole plasmid. **L** _(NCBI, no key; rate-limited)_
- **F2** Results panel: hits with **e-value, % identity, coverage, accession links**, and a
  "map hit back onto the construct" action (reuses our alignment renderer). **M**
- **F3** **Primer-BLAST-style specificity** check for designed primers. **M**
- **F4** **Local BLAST against a user/org library** (our own sequences) — our alignment engine
  already does local; add an indexed k-mer prefilter for speed. **M**
- **F5** Optional **EBI** search (InterPro, UniProt) for protein hits. **M** _(EBI API)_

### G. Protein features: signal peptides, domains, topology  _(explicitly requested)_
- **G1** **Signal peptide** prediction. Two tiers:
  - built-in **heuristic** (n/h/c-region + cleavage-site scoring) for offline/instant. **M**
  - proxy to **SignalP 6 / DTU** or an equivalent service for accuracy. **M** _(external API)_
- **G2** **Transmembrane** topology (TMHMM/DeepTMHMM-style) and **TargetP** localization. **M** _(external)_
- **G3** **Domain scan**: Pfam / InterPro via **EBI InterProScan** REST. **L** _(EBI API, async job)_
- **G4** Motif/site prediction: **NLS**, glycosylation, phosphorylation, disulfide, cleavage sites. **M**
- **G5** Translate a CDS → hand the protein to **Mol\*** (existing) for 3D; optional structure
  prediction hook (ESMFold API) for "no PDB on file" cases. **M–L** _(external)_

### H. Auto-annotation intelligence
- **H1** **Detect common features** (SnapGene-style): match against a bundled library of
  promoters, oris, resistance genes, tags, MCS, common vectors. **M** _(bundle a feature DB, e.g. the open pLannotate/SeqViz lists)_
- **H2** **pLannotate**-style annotation via its public API for anything unmatched. **M** _(external)_
- **H3** Antibiotic-resistance / selection-marker + biosafety flagging (ties into `samples.biosafety_level`). **S**
- **H4** One-click "annotate this raw sequence" for files that came in bare. **S**

### I. Alignment & comparison (multi-sequence)
- **I1** **Multiple sequence alignment** (MSA) with consensus + identity shading. **L**
- **I2** **Sanger read assembly**: align AB1 reads to a reference, **call mutations/variants**,
  flag heterozygous positions. **L** _(builds on B3)_
- **I3** Side-by-side **plasmid diff**: compare two maps, highlight feature/sequence differences. **M**
- **I4** Promote our pairwise aligner to a worker + banded/affine-gap for long sequences. **M**

### J. Primers & oligos
- **J1** **Primer design wizard**: Tm-matched pairs, sequencing primers, qPCR, with constraints. **L**
- **J2** **Site-directed mutagenesis** primer design (point / insertion / deletion). **M**
- **J3** **Org/sample primer database** with binding-site map + reuse across constructs. **M**
- **J4** Oligo tools: Tm, hairpin, dimer, %GC, order-ready formatting (IDT-style). **S**

### K. Platform integration (leverage what Notes9 already has)
- **K1** **Embed a plasmid map** in a lab note / report via a **TipTap** node (we already use TipTap). **M**
- **K2** **Real-time collaborative editing** of the map using existing **Yjs / Hocuspocus**. **L**
- **K3** **Version history + diff** (new `plasmid_versions`), surfaced in the existing History/QC tabs. **M**
- **K4** **AI assistant** (existing `@ai-sdk`): "describe this plasmid", "suggest a cloning
  strategy", "what does this ORF do", "design primers for X". **M–L**
- **K5** Comments/mentions on features (reuse mention + comment infra). **M**
- **K6** Standalone **`/plasmids`** route + library browser, not just a per-sample tab. **M**

### L. UX, rendering, performance
- **L1** **Web Workers** for alignment/digest/ORF/BLAST-parse — remove the 25M-cell cap. **M**
- **L2** Zoom, minimap, feature legend, layer toggles (features / enzymes / ORFs / primers). **M**
- **L3** Go-to-position, bookmarks, keyboard shortcuts, ruler improvements. **S**
- **L4** Print/publication-quality **SVG/PNG/PDF** export (overlaps B8). **M**
- **L5** Large-file strategy: server parse + virtualized sequence rendering for >100kbp. **L**
- **L6** **Tests** for alignment DP, CRISPR, enzyme digest, ORF (currently zero coverage;
  `fast-check` is already a dev dep for property tests). **S–M**

---

## 5. Phased roadmap

Sequenced so each phase ships user value and de-risks the next.

**Phase 0 — Quick wins on the current viewer (≈1 sprint, no engine change)**
- GenBank + BED + protein export (B1, B2) — writers already installed.
- Auto-annotate raw sequences + common-feature detection MVP (H1, H4).
- ORF finder + 6-frame translation panel (E1, E2) — fills the empty `orfs`/`translations`.
- GC-window / GC-skew plot (E4); tests for alignment + CRISPR (L6).
- Move alignment to a Web Worker, lift the size cap (L1/I4).

**Phase 1 — Editing core (the pivotal phase)**
- Adopt **OVE** behind a `MolecularWorkbench` wrapper; migrate `parsed_metadata` shape.
- Base editing, undo/redo, feature CRUD, circular/linear editing (A1–A7).
- Restriction enzymes: digest + cut map + enzyme filters (C1–C3, C5).
- Standalone `/plasmids` route + first-class `plasmids` tables (§3).

**Phase 2 — The analysis power tools (research parity)**
- Virtual gel + isoschizomers (C4, C6, C7).
- **BLAST** (F1, F2, F4) via API route + worker.
- **Signal peptide + domain** prediction (G1, G3) via API routes.
- Primer design + mutagenesis + oligo tools (J1, J2, J4); PCR simulation (D5).
- AB1 import + Sanger variant calling (B3, I2).

**Phase 3 — Cloning & assembly (the differentiators)**
- Restriction / Gibson / Golden Gate / Gateway simulation (D1–D4, D7).
- Codon optimization (D6); MSA + plasmid diff (I1, I3).
- Import by accession/Addgene (B6).

**Phase 4 — Platform & collaboration**
- Lab-note/report **embeds** (K1), collaborative editing (K2), version history/diff (K3).
- AI cloning/annotation assistant (K4); comments (K5).
- Publication figure export polish (B8/L4); large-genome performance (L5).

---

## 6. External dependencies, risks, and licensing

- **NCBI BLAST / efetch** — free, no key, but **rate-limited** (≤3 req/s, be polite, cache).
  Must proxy server-side (CORS + shared IP etiquette). Async submit/poll pattern.
- **EBI (InterProScan, enzymes) / SignalP / TMHMM / pLannotate** — external services; some
  need email or an API key, some throttle hard, some restrict commercial use (**SignalP has a
  non-commercial academic license** — check terms before shipping the hosted version; the
  offline heuristic G1 is the safe default).
- **OVE (`@teselagen/open-vector-editor`)** — MIT-licensed, same vendor as our parsers; adds
  Redux + ~1–2MB. The main risk is **theming** to match shadcn and reconciling its document
  model with our storage.
- **REBASE enzyme data** — free for academic/redistribution with attribution; verify terms if
  bundling the full commercial supplier list.
- **Compute in the browser** — alignment/digest/ORF on multi-kbp is fine in a worker; anything
  genome-scale (>~100kbp, MSA, BLAST parsing) belongs server-side.
- **PHI/biosafety** — sequences can be sensitive/regulated; keep everything inside existing RLS
  and org isolation; don't send private sequences to third-party APIs without explicit user opt-in.

---

## 7. Suggested first PR (concrete starting point)

A low-risk, high-signal slice that proves the direction without the OVE migration:

1. `lib/molecular/` — extract & test the pure logic (alignment, CRISPR, GC, new ORF + translate
   + enzyme-digest functions), each with `fast-check` property tests.
2. Add a **Web Worker** and route alignment/ORF/digest through it.
3. Add **GenBank/BED export** and an **ORF + 6-frame translation** tab to the existing viewer.
4. Add **restriction-digest MVP** (bundled enzyme JSON) with a cut-site table + map overlay.

That ships real researcher value in the current UI and creates the `lib/molecular/` +
worker + enzyme-DB foundations that Phase 1's OVE editor builds on.
