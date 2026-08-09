# ADR-001: Make `data_file` a first-class taggable kind across the Notes9/Catalyst seam

- Status: accepted
- Date: 2026-08-08
- Supersedes: none

## Context

Catalyst already treats a data file as a first-class entity. `fetch_full_records`
maps `data_file` to the `experiment_data` table
(`catalyst/core/tools/retrieval/fetch_full_records.py:40`), selects the right
columns including the pre-parsed `tabular_format` text and deliberately excludes
`workbook_snapshot` and storage paths (`:74`), and `_enforce_scope` already knows
that this table's ownership column is `uploaded_by` rather than `created_by`
(`:556-561`) and admits rows via `project_id` / `experiment_id` in the user's org
sets (`:589-600`). `entity_graph.py:42` carries its field list and its
`experiment_has_data_file` edge in both directions. `citations.py` already has a
`dat` token prefix, a `Data file` display label, and `tabular_format` /
`workbook_snapshot` in its content-field list.

Everything downstream of the tag works. What does not exist is the tag.

Three places block it, and they block it independently:

1. `catalyst/core/contracts/request.py:7-15` — `ATTACHMENT_KINDS` lists
   `lab_note, literature_review, protocol, experiment, project, sample, report`.
   No `data_file`. The validator at `:34-35` raises `ValueError` on anything
   else, which pydantic turns into a 422 for the whole request.
2. `Notes9 lib/catalyst-mention-types.ts` — `CatalystMentionKind` has no
   `data_file` branch, so `catalystMentionPath` cannot route one either.
3. `Notes9 components/layout/right-sidebar.tsx:1307-1327` — the @-mention catalog
   queries exactly five tables (`literature_reviews`, `lab_notes`, `experiments`,
   `projects`, `protocols`). `experiment_data` is not among them, so a data file
   never appears as a mention candidate, and the drop-unknown-tags guard at
   `:1196` would strip it even if it did.

The user-visible consequence is the reported one. On the Data page the Catalyst
composer is mounted with `scope="lab"` and nothing else
(`components/data-analysis/data-analysis-workspace.tsx:3308`), so a researcher
looking at a loaded spreadsheet asks Catalyst about "this data" and Catalyst has
no idea which file that is, cannot be told, and therefore cannot display which
file is tagged. There is no tag to display.

The alternative on the table was to stop treating this as a tag at all and ship
the loaded table inline as file content over the existing `file_attachments`
path. That is rejected below.

## Decision

`data_file` becomes a member of the tagged-record allowlist on both sides of the
seam, using the mechanism that already carries lab notes and protocols, with no
new wire shape.

Catalyst adds `"data_file"` to `ATTACHMENT_KINDS`. That is the entire backend
change. `_preflight_focused_records`
(`catalyst/core/agent.py:976-993`) groups attachments by kind and passes
`a["kind"]` straight through as `entity_type` to `FetchFullRecordsTool`, so a
kind that is valid in `_ENTITY_TABLES` and valid in `ATTACHMENT_KINDS` is
already fully wired: preflight fetch, `tabular_format` body into
`<focused_resources>`, citations, scope enforcement, and the focused-tool gate
all apply unchanged.

Notes9 adds the `data_file` branch to `CatalystMentionKind` and
`catalystMentionPath` (route: `/data-analysis?file=<id>`), and adds
`experiment_data` as a sixth query in the mention catalog, selecting
`id, file_name` ordered by `created_at`, mapped to
`{ kind: 'data_file', id, title: file_name }`.

Ordering is a hard requirement, not a preference. Catalyst ships first. Until
`ATTACHMENT_KINDS` contains `data_file`, a Notes9 client that sends one does not
get a dropped tag, it gets a pydantic 422 that fails the entire agent request
including every other attachment on it. Notes9 must not be able to emit the kind
before the backend accepts it.

## Consequences

Buys: the tagged data file arrives in the agent's first turn as its parsed table
text with a citation token, under the same org-collaborative scope rules as
every other record, without raw rows crossing the seam and without any new
endpoint, schema, or storage read. The chat can then display which file is
tagged, because a tag exists to display (ADR-002).

Costs: one more table in the mention-catalog fan-out, which is five parallel
Supabase reads becoming six behind the same 120-row limit and the same TTL
cache. `experiment_data` is the highest-row-count table of the six, so the
`limit(120)` ordering by `created_at` means older files are not reachable by
@-mention. That is the same ceiling the other five already accept.

Forecloses: nothing. `sample_file` is the obvious next kind and lands the same
way. If the mention catalog outgrows the client-side fan-out, that is a separate
change to one function, not to this contract.

The one thing to watch: `ATTACHMENT_KINDS` and `_ENTITY_TABLES` are two lists in
two files that must agree, and today they silently do not (`data_file`,
`sample_file`, and `paper` are fetchable but not taggable). This ADR closes the
`data_file` row of that table and leaves the divergence itself in place. A test
asserting `set(ATTACHMENT_KINDS) <= set(_ENTITY_TABLES)` is the cheap guard and
is specified in the architecture's verification section.

## Alternatives rejected

**Send the workspace table inline as a file attachment.** The composer already
has a paperclip path that uploads a file and sends it as `file_attachments`, so
the loaded sheet could ride that way with no contract change at all. Rejected:
the file is already a durable row with a `tabular_format` column that Catalyst
parses and cites, so this would ship a second copy of data the backend already
has, lose the citation identity that makes the answer traceable to a record,
bypass `_enforce_scope` in favour of trusting whatever the client uploaded, and
grow the request by the size of the sheet on every turn.

**Put the dataset in the composer's `scope` string.** `CatalystSectionScope` is a
closed set of page scopes (`lab`, `project`, `experiments`, ...) that selects
prompt framing, not a record reference. Overloading it with an id would make a
routing enum carry identity, and nothing downstream would fetch the row.

**Widen `ATTACHMENT_KINDS` to accept any `_ENTITY_TABLES` key.** Tempting as a
one-liner that fixes the divergence permanently. Rejected for now because the
two lists are not meant to be equal: `sample_file` is deliberately owner-only in
`_enforce_scope` (`:584-588`) with its real access check at the SQL layer, and
promoting it to taggable in the same stroke would be a scope decision smuggled
in as a refactor. Make them equal deliberately, kind by kind.
