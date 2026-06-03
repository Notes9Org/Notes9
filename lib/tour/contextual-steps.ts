import type { TourStep } from "@/components/tour/product-tour"
import { TOUR, tourSel } from "@/lib/tour/anchors"

/** Open the Catalyst AI sidebar (handled in components/layout/app-layout.tsx). */
function openAiSidebar() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("notes9:tour-open-ai-sidebar"))
  }
}

function normalizeAppPath(pathname: string): string {
  const raw = (pathname || "/dashboard").trim()
  const noQuery = raw.split("?")[0] || "/dashboard"
  const trimmed = noQuery.length > 1 ? noQuery.replace(/\/$/, "") : noQuery
  return trimmed || "/dashboard"
}

// ---------------------------------------------------------------------------
// Reusable steps for the always-present chrome buttons. These stay on the
// current page (no navigation) — they just point out the obvious controls the
// user can reach from anywhere.
// ---------------------------------------------------------------------------

/** Highlight a page's primary "New X" / action button. */
function actionStep(
  target: string,
  title: string,
  body: string,
  cta = "Click to create",
): TourStep {
  return { target, side: "bottom", title, body, interactive: true, cta }
}

const viewModeStep: TourStep = {
  target: tourSel(TOUR.viewMode),
  side: "bottom",
  title: "Switch your view",
  body: "Flip between a **card** layout for browsing and a **table** layout for scanning lots of rows at once.",
}

/** Highlight the shared filter row, with page-specific copy for the fields. */
function filtersStep(body: string): TourStep {
  return {
    target: tourSel(TOUR.resourceFilters),
    side: "bottom",
    title: "Filter & narrow the list",
    body,
  }
}

const createNewStep: TourStep = {
  target: tourSel(TOUR.createNew),
  side: "right",
  title: "Create anything, anywhere",
  body: "The **Create new** button spins up a project, experiment, lab note, sample, protocol, and more — from any screen, without losing your place.",
}

const searchStep: TourStep = {
  target: tourSel(TOUR.sidebarSearch),
  side: "right",
  title: "Find anything in seconds",
  body: "Search across every project, experiment, note, paper, and sample from this one box.",
  interactive: true,
  cta: "Try a search",
}

const themeStep: TourStep = {
  target: tourSel(TOUR.themeToggle),
  side: "bottom",
  title: "Light or dark",
  body: "Flip the whole workspace between light and dark with this toggle — whatever's easier on your eyes.",
}

const navStep: TourStep = {
  target: tourSel(TOUR.sidebarNav),
  side: "right",
  title: "Your workspace, at a glance",
  body: "Everything lives in this sidebar — **Dashboard**, **Projects**, **Literature**, **Catalyst**, and the **research map** are always one click away.",
}

const helpStep: TourStep = {
  target: tourSel(TOUR.help),
  side: "bottom",
  title: "Help, on every page",
  body: "Tap the **?** button anytime and you'll get this short, guided walkthrough for whatever page you're looking at.",
}

/** Catalyst step: opens the AI panel and highlights the toggle button, with a
 *  page-specific prompt suggestion in the body. */
function catalystStep(body: string): TourStep {
  return {
    target: tourSel(TOUR.aiToggle),
    side: "bottom",
    title: "Catalyst, your AI partner",
    body,
    onBeforeStep: openAiSidebar,
    interactive: true,
    cta: "Click to open Catalyst",
  }
}

// ---------------------------------------------------------------------------
// Shared TipTap editor walkthrough (lab notes + protocol editor). These anchors
// only exist while an editor is actually open, so any step whose target is
// missing is skipped by the tour engine — the tour never hangs on them.
// ---------------------------------------------------------------------------

const editorToolbarStep: TourStep = {
  target: tourSel(TOUR.editorToolbar),
  side: "bottom",
  title: "A full scientific editor",
  body: "Format text and add headings, lists, tables, images, voice dictation, math equations, and chemistry formulas — all from this toolbar.",
}

const editorLinkStep: TourStep = {
  target: tourSel(TOUR.editorContent),
  side: "left",
  title: "Link your work inline",
  body: "Type **@** to link a **sample or protocol**, **#** to reference another **lab note**, and **[[** to cite a **paper** from your library. The link stays live, so everything you write stays connected.",
}

const editorCalculatorStep: TourStep = {
  target: tourSel(TOUR.editorCalculator),
  side: "bottom",
  title: "Scientific calculator",
  body: "Open a built-in calculator for molarity, dilutions, and more — right beside your writing, no app-switching.",
}

const editorCiteStep: TourStep = {
  target: tourSel(TOUR.editorCite),
  side: "bottom",
  title: "Cite with AI",
  body: "Select a sentence and hit **Cite** — Catalyst finds peer-reviewed papers that support it and inserts the citation for you.",
}

const editorBibliographyStep: TourStep = {
  target: tourSel(TOUR.editorBibliography),
  side: "bottom",
  title: "Build a bibliography",
  body: "Gather every citation in the document into a formatted **bibliography** — pick the style (APA, IEEE, Chicago, Harvard…) from the dropdown right beside this button.",
}

const versionHistoryStep: TourStep = {
  target: tourSel(TOUR.versionHistory),
  side: "bottom",
  title: "Version history",
  body: "Every save is kept. Open **version history** to compare any two versions side by side and **restore** an earlier one — nothing is ever lost.",
}

const acceptSaveStep: TourStep = {
  target: tourSel(TOUR.acceptSave),
  side: "top",
  title: "Accept & Save",
  body: "Your edits start as a **draft**. Review the diff, then hit **Accept & Save** to commit them — or **Discard** to roll back. For a **protocol** this publishes a **new version** (older runs keep the version they used); for a **lab note** it saves straight to the server.",
}

/** The shared editor feature steps, reused by lab notes and the protocol editor.
 *  The version-history and Accept & Save anchors only exist while an editor is
 *  open (and Accept & Save only when there's a pending draft), so missing ones
 *  are skipped by the engine. */
function editorFeatureSteps(): TourStep[] {
  return [
    editorToolbarStep,
    editorLinkStep,
    editorCalculatorStep,
    editorCiteStep,
    editorBibliographyStep,
    versionHistoryStep,
    acceptSaveStep,
  ]
}

/** Read the `?tab=` value the header help button forwards. The experiment
 *  detail page keeps its active tab in the URL query, so this tells us which
 *  tab's tour to show. */
function getTabParam(pathname: string): string | null {
  const q = (pathname || "").split("?")[1]
  if (!q) return null
  return new URLSearchParams(q).get("tab")
}

const experimentTabsStep: TourStep = {
  target: tourSel(TOUR.experimentTabs),
  side: "bottom",
  title: "Everything about this experiment",
  body: "These tabs hold the whole experiment — **Overview, Steps, Protocol & Assays, Samples, Data & Files, and Lab Notes**. Switch between them anytime; press **?** on any tab for a tour of it.",
}

/** Per-tab tours for the experiment detail page (/experiments/<id>). */
function buildExperimentTabSteps(tab: string): TourStep[] {
  switch (tab) {
    case "overview":
      return [
        {
          title: "Experiment overview",
          body: "This is a single experiment — one run of your research. The **Overview** tab is its snapshot.",
        },
        experimentTabsStep,
        {
          target: "#tab-content-overview",
          side: "top",
          title: "The snapshot",
          body: "Status, owner, timeline, and a summary of the run live here — so anyone can see where this experiment stands at a glance.",
        },
        catalystStep(
          "Ask Catalyst to summarize this experiment, draft its aims, or suggest next steps — it has the run's context.",
        ),
        helpStep,
      ]
    case "steps":
      return [
        {
          title: "Experiment steps",
          body: "The **Steps** tab is the procedure for this run, laid out in order.",
        },
        experimentTabsStep,
        {
          target: "#tab-content-steps",
          side: "top",
          title: "Lay out the procedure",
          body: "Capture the experiment's procedure as ordered steps, so the method is reproducible and anyone can follow exactly what was done.",
        },
        helpStep,
      ]
    case "protocol":
      return [
        {
          title: "Protocol & assays",
          body: "The **Protocol & Assays** tab connects this run to the methods it follows.",
        },
        experimentTabsStep,
        {
          target: "#tab-content-protocol",
          side: "top",
          title: "Linked methods",
          body: "The protocols and assays this experiment uses are linked here — pinned to the exact **version** they followed, so the method stays accurate even as protocols evolve.",
        },
        catalystStep(
          "Ask Catalyst to explain a protocol, adapt it for this run, or flag steps that need attention.",
        ),
        helpStep,
      ]
    case "samples":
      return [
        {
          title: "Samples used",
          body: "The **Samples** tab lists every material that went into this run.",
        },
        experimentTabsStep,
        {
          target: "#tab-content-samples",
          side: "top",
          title: "Materials, connected",
          body: "Each sample used here shows its **code, type, and status**, linked back to your inventory — so you always know what went into the result.",
        },
        helpStep,
      ]
    case "data":
      return [
        {
          title: "Data & files",
          body: "The **Data & Files** tab is where this experiment's results, spreadsheets, and attachments live.",
        },
        experimentTabsStep,
        {
          target: tourSel(TOUR.dataFiles),
          side: "top",
          title: "All your results in one place",
          body: "Every data file and result for this run is collected here, with type, size, and who uploaded it.",
        },
        {
          target: tourSel(TOUR.dataActions),
          side: "bottom",
          title: "Add data your way",
          body: "**Upload** existing files, or spin up a **New spreadsheet** to enter data directly in Notes9 — no need to leave the app.",
        },
        {
          title: "Preview, edit & tidy up",
          body: "Open a CSV or spreadsheet to **view and edit it in-app**; images and PDFs **preview in place**. Tick the checkboxes to **delete files in bulk**.",
        },
        catalystStep(
          "Ask Catalyst to analyze a dataset, spot trends, or summarize what your results show. Type **@** to point it at a file.",
        ),
        helpStep,
      ]
    case "notes":
    default:
      return [
        {
          title: "Lab notes",
          body: "The **Lab Notes** tab is your daily record for this experiment — every observation, method, and result, written in a full scientific editor.",
        },
        experimentTabsStep,
        {
          title: "Your notes for this run",
          body: "Notes linked to this experiment are listed on the side — pick one to open it, or start a new note. Everything you write here stays tied to this experiment.",
        },
        ...editorFeatureSteps(),
        catalystStep(
          "Ask Catalyst to draft a note from your results, clean up rough notes, or pull out the key findings. Type **@** to reference a note.",
        ),
        helpStep,
      ]
  }
}

const sampleTabsStep: TourStep = {
  target: tourSel(TOUR.sampleTabs),
  side: "bottom",
  title: "Everything about this sample",
  body: "These tabs hold the full record — **Overview, Molecular Files, Links, Storage, History, and QC**. Switch between them anytime; press **?** on any tab for a tour of it.",
}

/** Per-tab tours for the sample detail page (/samples/<id>). */
function buildSampleTabSteps(tab: string): TourStep[] {
  switch (tab) {
    case "molecular":
      return [
        {
          title: "Molecular files",
          body: "The **Molecular Files** tab is where this sample's sequences and structures come to life.",
        },
        sampleTabsStep,
        {
          target: tourSel(TOUR.molecularUpload),
          side: "bottom",
          title: "Upload sequences & structures",
          body: "Add **plasmids, sequence files, and PDB/CIF protein structures** for this sample — Notes9 recognizes the format automatically.",
        },
        {
          target: tourSel(TOUR.molecularViewer),
          side: "left",
          title: "Visualize in-app",
          body: "Pick a file and it renders right here — **plasmid maps** (circular & linear) for DNA and sequences, and an interactive **3D viewer** for protein structures. No external tools needed.",
        },
        helpStep,
      ]
    case "links":
      return [
        {
          title: "Where this sample is used",
          body: "The **Links** tab traces this sample across your work.",
        },
        sampleTabsStep,
        {
          title: "Connected context",
          body: "See every **project, experiment, and lab note** this sample is tied to — so you can follow exactly where it's been used.",
        },
        helpStep,
      ]
    case "storage":
      return [
        {
          title: "Storage & inventory",
          body: "The **Storage** tab is the full physical record for this sample.",
        },
        sampleTabsStep,
        {
          title: "Know exactly where it is",
          body: "Location, condition, container type, box position, **quantity and concentration**, collection and expiry dates, plus safety notes — all in one place.",
        },
        helpStep,
      ]
    case "history":
      return [
        {
          title: "Transfer history",
          body: "The **History** tab is this sample's chain of custody.",
        },
        sampleTabsStep,
        {
          title: "Every movement, logged",
          body: "A complete **transfer log** — each move, quantity change, who did it, and when. Add a transfer to keep the record accurate as the sample is used up or relocated.",
        },
        helpStep,
      ]
    case "qc":
      return [
        {
          title: "Quality control",
          body: "The **QC** tab tracks how this sample has been checked.",
        },
        sampleTabsStep,
        {
          title: "QC records",
          body: "Log **quality-control checks** — QC type, pass/fail result, measured value, who ran it, and the date. Add a record each time the sample is verified.",
        },
        helpStep,
      ]
    case "overview":
    default:
      return [
        {
          title: "Sample overview",
          body: "This is one sample — a single material in your inventory. Let's walk through its record.",
        },
        {
          target: tourSel(TOUR.sampleQuickInfo),
          side: "bottom",
          title: "The vitals, up top",
          body: "Location, storage condition, quantity, and collection date sit right here — the at-a-glance status of this material.",
        },
        {
          target: tourSel(TOUR.sampleActions),
          side: "bottom",
          title: "Edit, restatus, or remove",
          body: "**Edit** the sample's details or change its **status** (available, in use, depleted, disposed) here — or delete it if it's no longer needed.",
        },
        sampleTabsStep,
        {
          title: "The full identity",
          body: "The Overview tab holds the complete record — **code, type, status, barcode, organism, strain, genotype** — and the **experiments** that use this sample.",
        },
        helpStep,
      ]
  }
}

/**
 * Short, page-specific help tours triggered by the header "?" button.
 *
 * Each page walks through its own obvious buttons in order — the primary action
 * first, then the shared controls (view toggle, create, search, Catalyst, help).
 * Tours stay on the current page; nothing here navigates the user away. Targets
 * only use anchors known to exist on that page, and anything missing (e.g. a
 * button hidden behind an empty state) is skipped by the tour engine.
 */
export function buildContextualSteps(pathname: string): TourStep[] {
  const path = normalizeAppPath(pathname)

  // Experiment detail page (/experiments/<id>) — a separate tour per tab. Tabs
  // live in the URL as ?tab=<value>, forwarded by the header help button.
  const expDetail = path.match(/^\/experiments\/([^/]+)$/)
  if (expDetail && expDetail[1] !== "new") {
    return buildExperimentTabSteps(getTabParam(pathname) ?? "notes")
  }

  // Sample detail page (/samples/<id>) — a separate tour per tab. Tabs live in
  // the URL as ?tab=<value> (default "overview"), forwarded by the help button.
  const sampleDetail = path.match(/^\/samples\/([^/]+)$/)
  if (sampleDetail && sampleDetail[1] !== "new") {
    return buildSampleTabSteps(getTabParam(pathname) ?? "overview")
  }

  // Protocol editor (/protocols/new and /protocols/<id>) — the TipTap editor
  // walkthrough, distinct from the /protocols list tour below.
  if (/^\/protocols\/[^/]+$/.test(path)) {
    return [
      {
        title: "Protocol editor",
        body: "This is where you write a **repeatable, versioned procedure**. Lay out the steps once and reuse them across experiments.",
      },
      ...editorFeatureSteps(),
      helpStep,
    ]
  }

  // Writing editor (/papers/new and /papers/<id>) — a custom tour for the paper
  // editor. Reuses the shared TipTap toolbar/cite/bibliography anchors plus
  // paper-specific import/export/status controls. (No scientific calculator and
  // no draft-approval bar here — papers autosave and support live collaboration.)
  if (/^\/papers\/[^/]+$/.test(path)) {
    return [
      {
        title: "The writing editor",
        body: "This is a full word processor tuned for **scientific papers** — write your manuscript, cite as you go, and export it ready to submit.",
      },
      {
        target: tourSel(TOUR.paperTitle),
        side: "bottom",
        title: "Name your paper",
        body: "Set the title here — it saves automatically as you type, just like everything else in the document.",
      },
      editorToolbarStep,
      editorCiteStep,
      editorBibliographyStep,
      {
        target: tourSel(TOUR.paperImport),
        side: "bottom",
        title: "Import existing work",
        body: "Bring in a manuscript from **LaTeX (.tex)**, or pull a reference list in from **BibTeX (.bib)** — you can also just drag a .tex or .bib file onto the page.",
      },
      {
        target: tourSel(TOUR.paperExport),
        side: "bottom",
        title: "Export anywhere",
        body: "Download your paper as **PDF, Word, Markdown, or HTML**, drop it into a **journal LaTeX template** (Nature, Science, and more), or export your citations as **BibTeX**.",
      },
      {
        target: tourSel(TOUR.paperStatus),
        side: "bottom",
        title: "Track its status",
        body: "Move the paper through **Draft → In Review → Published** as it progresses — or delete it — from this menu.",
      },
      {
        title: "Write together",
        body: "Papers support **real-time collaboration** — invite co-authors and you'll see each other's cursors and edits live, with everyone's avatar up top.",
      },
      catalystStep(
        "Ask Catalyst to draft a section, outline the paper, summarize your results, or polish a paragraph — your work is already in context.",
      ),
      helpStep,
    ]
  }

  if (path.startsWith("/projects")) {
    return [
      {
        title: "Projects",
        body: "Projects are home base — each one groups the experiments, lab notes, protocols, samples, and literature for a single line of research.",
      },
      actionStep(
        "#tour-create-project, " + tourSel(TOUR.createProject),
        "Start a project",
        "This **New project** button is where every research effort begins. Name it, and you can start adding experiments and notes inside.",
        "Click to create a project",
      ),
      {
        title: "What's inside a project",
        body: "Open any project to find its workspace — **experiments, protocols, samples, lab notes, and literature** all grouped together, with status, priority, and team members at a glance.",
      },
      filtersStep(
        "Got a lot of projects? Filter by **status** (planning, active, on hold, completed) and **priority** to surface just the ones you care about.",
      ),
      viewModeStep,
      searchStep,
      catalystStep(
        "Ask Catalyst to outline a new project, suggest experiments to run, or summarize where a project stands. It already has your work in context.",
      ),
      helpStep,
    ]
  }

  if (path.startsWith("/experiments")) {
    return [
      {
        title: "Experiments",
        body: "Experiments are the individual runs inside a project — each ties together the protocol you followed, the samples you used, and the results you recorded.",
      },
      actionStep(
        "#tour-create-experiment, " + tourSel(TOUR.createExperiment),
        "Start a run",
        "The **New experiment** button creates a run. Link it to a protocol and samples so its method and materials are captured automatically.",
        "Click to add an experiment",
      ),
      {
        title: "What an experiment holds",
        body: "Each experiment carries a **status**, an assigned owner, and start date — and links out to the **protocols, samples, and lab notes** it used, so the full story of a run stays connected.",
      },
      filtersStep(
        "Filter experiments by **project** and **status** (planned, in progress, completed, failed, paused) to focus on what's active right now.",
      ),
      viewModeStep,
      catalystStep(
        "Ask Catalyst to draft an experiment's method from a protocol, or to summarize today's results into a lab note. Type **@** to pull in a specific run.",
      ),
      helpStep,
    ]
  }

  if (path.startsWith("/lab-notes")) {
    return [
      {
        title: "Lab notes",
        body: "Lab notes are your daily record — observations, methods, and results, with comments and linked materials right alongside.",
      },
      actionStep(
        tourSel(TOUR.createLabNote),
        "Write a lab note",
        "The **New lab note** button opens a fresh entry. You'll pick the project and experiment it belongs to so it's filed in the right place.",
        "Click to add a note",
      ),
      {
        title: "Open a note to edit it",
        body: "This page lists every note across your experiments. **Open one** and it lands in its experiment's **Lab Notes** tab — that's the full editor, with the scientific calculator, @-linking, AI citations, **version history**, and **Accept & Save**.",
      },
      filtersStep(
        "Filter by **project**, then by **experiment** within it, to jump straight to the notes for the run you're working on.",
      ),
      viewModeStep,
      catalystStep(
        "Ask Catalyst to draft a note from your results, clean up rough notes, or pull the key findings out of a long entry. Type **@** to reference a note.",
      ),
      helpStep,
    ]
  }

  if (path.startsWith("/protocols")) {
    return [
      {
        title: "Protocols",
        body: "Protocols store your repeatable, versioned procedures — so experiments stay consistent instead of rewriting the same steps each time.",
      },
      actionStep(
        tourSel(TOUR.createProtocol),
        "Write a protocol",
        "The **New protocol** button creates a procedure you can reuse and version. Attach it to any experiment to capture exactly how it was run.",
        "Click to add a protocol",
      ),
      {
        title: "Versioned & reusable",
        body: "Each protocol tracks its **version** and shows how many experiments use it — so when you refine a method, every run still points to the exact version it followed.",
      },
      filtersStep(
        "Filter by **category**, **version**, or **usage** (used in experiments vs. not linked yet) to find the right procedure fast.",
      ),
      viewModeStep,
      catalystStep(
        "Ask Catalyst to draft a protocol, tighten the steps, or adapt an existing one for a new experiment.",
      ),
      helpStep,
    ]
  }

  // Writing list (/papers) — the manuscripts workspace. The editor at
  // /papers/<id> is handled separately above.
  if (path.startsWith("/papers")) {
    return [
      {
        title: "Writing",
        body: "This is where you draft and export **research papers** — manuscripts, reports, anything you're writing up to publish.",
      },
      actionStep(
        tourSel(TOUR.createPaper),
        "Start a paper",
        "The **New Paper** button opens a fresh manuscript in the writing editor — title it and start drafting.",
        "Click to start writing",
      ),
      filtersStep(
        "Filter by **project** to see just the papers tied to a specific line of work.",
      ),
      viewModeStep,
      {
        title: "Open a paper to write",
        body: "Click any paper to open it in the **writing editor** — a full word processor with citations, math, import/export, and live collaboration.",
      },
      catalystStep(
        "Ask Catalyst to outline a new paper, draft a section, or turn your experiment results into prose.",
      ),
      helpStep,
    ]
  }

  if (path.startsWith("/literature-reviews")) {
    return [
      {
        title: "Literature",
        body: "This is your reading room — search for papers, read and annotate them in Notes9, and ask Catalyst about anything you've saved. Let's go through it.",
      },
      actionStep(
        tourSel(TOUR.addLiterature) + ", " + tourSel(TOUR.createPaper),
        "Search & save papers",
        "Search **PubMed, Europe PMC, and OpenAlex** for papers right here, then save the ones worth keeping into your library — or add a reference manually.",
        "Click to add a reference",
      ),
      {
        target: tourSel(TOUR.litTabs),
        side: "bottom",
        title: "Stage papers as tabs",
        body: "Your search results, saved papers, and every open PDF stack up as **tabs** here — line several papers up side by side and switch between them without losing your place.",
      },
      {
        target: tourSel(TOUR.uploadPdf),
        side: "bottom",
        title: "Read PDFs in-app",
        body: "Open-access papers render as a **readable PDF right inside Notes9** — no downloads. When a paper isn't freely available, use **Upload** to add your own copy and read it here too.",
      },
      {
        title: "Annotate & comment",
        body: "While you read, **highlight** key passages and drop **sticky notes or comments** straight onto the PDF. Your annotations stay attached to the paper for next time.",
      },
      {
        title: "Drag a paper into Catalyst",
        body: "**Drag any saved paper** from your library into the Catalyst AI sidebar to ask questions about it — summaries, methods, or comparisons, grounded in that exact paper.",
      },
      catalystStep(
        "Ask Catalyst to summarize a paper, extract its methods, or compare studies side by side. Type **@** to reference a specific paper.",
      ),
      helpStep,
    ]
  }

  if (path.startsWith("/samples")) {
    return [
      {
        title: "Samples",
        body: "Track reagents, cells, constructs, and other materials — with codes, storage locations, and links to the experiments that use them.",
      },
      actionStep(
        tourSel(TOUR.createSample),
        "Register a sample",
        "The **New sample** button adds a material with its code, location, and details, so you always know what you have and where it is.",
        "Click to add a sample",
      ),
      {
        target: tourSel(TOUR.sampleStats),
        side: "bottom",
        title: "Stock at a glance",
        body: "These cards tally your inventory by status — **Available, In use, Depleted, Disposed** — so low stock and used-up materials are obvious immediately.",
      },
      {
        title: "More than a label",
        body: "Each sample tracks **quantity, concentration, and storage location** — and for DNA or proteins you can attach files to view **plasmid maps and 3D structures**.",
      },
      filtersStep(
        "Filter by **project**, **experiment**, **status**, or **type** to pin down exactly the materials you need.",
      ),
      viewModeStep,
      helpStep,
    ]
  }

  if (path.startsWith("/equipment")) {
    return [
      {
        title: "Equipment",
        body: "Register instruments, maintenance dates, and locations so the lab always knows what's available and where.",
      },
      actionStep(
        tourSel(TOUR.createEquipment),
        "Add equipment",
        "This **＋** button registers an instrument — record its location and maintenance so the whole lab can find and rely on it.",
        "Click to add equipment",
      ),
      {
        target: tourSel(TOUR.equipmentStats),
        side: "bottom",
        title: "Availability at a glance",
        body: "These cards summarize the lab's instruments by status — **Available, In use, Maintenance, Offline** — so you can see what's free before you walk over.",
      },
      {
        title: "What each instrument tracks",
        body: "Equipment records hold the **model, manufacturer, location, and next maintenance date** — keeping servicing on schedule and downtime visible to everyone.",
      },
      filtersStep(
        "Filter by **status**, **category**, or **location** to find an available instrument or everything due for maintenance.",
      ),
      viewModeStep,
      helpStep,
    ]
  }

  if (path.startsWith("/research-map")) {
    return [
      {
        title: "Research map",
        body: "This map visualizes how everything in your lab connects — projects, experiments, protocols, samples, lab notes, literature, papers, and reports — so the big picture stays clear as the work grows.",
      },
      {
        target: tourSel(TOUR.mapControls),
        side: "bottom",
        title: "Scope & filter the map",
        body: "Use this control bar to **scope to a project or experiment**, toggle which **entity types** appear, and **filter nodes by name** — so you can zoom in on exactly the slice you care about.",
      },
      {
        title: "Follow the connections",
        body: "**Click any node** to light up its full chain — everything it came from and everything that depends on it. Colors encode the type of item and the kind of relationship between them.",
      },
      {
        title: "Pan, zoom & overview",
        body: "Drag to **pan**, scroll to **zoom**, and use the **mini-map** in the corner to keep your bearings on a large map.",
      },
      catalystStep(
        "Ask Catalyst to explain a cluster on the map, find gaps between projects, or suggest what to connect next.",
      ),
      helpStep,
    ]
  }

  if (path.startsWith("/reports")) {
    return [
      {
        title: "Reports",
        body: "Reports pull straight from your projects, experiments, and data into a shareable summary.",
      },
      actionStep(
        tourSel(TOUR.generateReport),
        "Generate a report",
        "The **Generate AI report** button opens a dialog where you pick a **project, experiment, and the data files** to analyze, then describe what you want — Catalyst assembles the report from there.",
        "Click to generate one",
      ),
      {
        title: "Review, edit, export",
        body: "Each report is built from your **experiment data, lab notes, and files** — open one to review and refine it, then export when it's ready to share.",
      },
      filtersStep(
        "Filter the list by **project** and **experiment** to find a past report. Select rows with the checkboxes to **delete in bulk**.",
      ),
      catalystStep(
        "Beyond full reports, ask Catalyst for a quick status update, a results recap, or a draft section you can drop in.",
      ),
      helpStep,
    ]
  }

  if (path.startsWith("/catalyst")) {
    return [
      {
        title: "Catalyst",
        body: "Catalyst is your AI research partner — built for the lab. Ask questions, draft notes, and reason over your own data with full context.",
      },
      {
        target: "#tour-ai-chat",
        side: "top",
        title: "Ask anything",
        body: "Type a question here — draft a lab note, summarize a paper, or plan an experiment. Type **@** to tag a specific note, experiment, or paper.",
        interactive: true,
        cta: "Try asking something",
      },
      {
        title: "Biology-first by design",
        body: "Catalyst is tuned for the life sciences. **Biology questions get biology-specific answers** — that's our priority, and it's where Catalyst's accuracy is strongest.",
      },
      {
        title: "Sources you can check",
        body: "Every answer lists its **citations at the bottom** — both your internal documents and any web results. So you can verify where each claim came from in one click, and trust the answer isn't hallucinated.",
      },
      {
        title: "Bring your papers in",
        body: "**Drag a saved paper** from your literature library into Catalyst to ask questions grounded in that exact paper.",
      },
      helpStep,
    ]
  }

  if (path.startsWith("/settings")) {
    return [
      {
        title: "Settings",
        body: "Manage your profile, security, and preferences — each grouped under its own tab.",
      },
      {
        target: tourSel(TOUR.settingsTabs),
        side: "bottom",
        title: "Three tabs to know",
        body: "**Profile** holds your name, role, and avatar. **Account** covers your password, security, and sign-out. **Preferences** is where you set the theme and notifications.",
      },
      {
        title: "Make it yours",
        body: "Upload an **avatar**, set your **role** (admin, researcher, technician, analyst, viewer), and pick a **theme** — Light, Dark, or System — to match how you like to work.",
      },
      themeStep,
      helpStep,
    ]
  }

  if (path === "/dashboard" || path === "/") {
    return [
      {
        title: "Your dashboard",
        body: "This is mission control — everything you need to pick up where you left off lives on this one screen. Let's walk through it.",
      },
      {
        target: tourSel(TOUR.dashSchedule),
        side: "right",
        title: "Schedule & tasks",
        body: "Your **Schedule** and **Tasks** sit here — see what's planned for today and tick off to-dos without leaving the dashboard. Switch between them with the tabs up top.",
      },
      {
        target: tourSel(TOUR.dashRecentWork),
        side: "left",
        title: "Recent projects & experiments",
        body: "Jump straight back into the **projects and experiments** you've touched most recently — no digging through menus.",
      },
      {
        target: tourSel(TOUR.dashWhiteboard),
        side: "top",
        title: "Whiteboard",
        body: "A free-form **whiteboard** for quick sketches, plans, and ideas. Open it fullscreen when you need room to think.",
      },
      {
        target: tourSel(TOUR.dashRecentlyEdited),
        side: "left",
        title: "Recently edited",
        body: "A running list of the **notes, papers, and items** you edited last — one click takes you right back to them.",
      },
      {
        target: tourSel(TOUR.dashMyLab),
        side: "top",
        title: "About my lab",
        body: "This is your **lab space** — members, invites, and shared settings. It's still in development, so expect more lab collaboration features to land here soon.",
      },
      catalystStep(
        "Open Catalyst anytime to ask questions, draft notes, or reason over your lab data. It already knows your projects and experiments.",
      ),
      helpStep,
    ]
  }

  return [
    {
      title: "Your workspace",
      body: "Notes9 groups your work into projects and experiments, with lab notes, protocols, samples, and literature alongside.",
    },
    navStep,
    createNewStep,
    searchStep,
    catalystStep(
      "Catalyst is your AI partner — ask it questions and let it work over your lab data, from any page.",
    ),
    helpStep,
  ]
}
