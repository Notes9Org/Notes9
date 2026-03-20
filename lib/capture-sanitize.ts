/**
 * Shared PII sanitization for capture scripts (screenshots, screen recording).
 * Blurs avatars, redacts emails, replaces dates/names with generic values.
 */

import type { Page } from "puppeteer"

export const GENERIC_PROJECT_NAMES = [
  "Research Project Alpha",
  "Drug Discovery Initiative",
  "Protein Structure Study",
  "Gene Expression Analysis",
  "Compound Screening Program",
  "Cell Line Characterization",
]
export const GENERIC_NOTE_NAMES = [
  "Protocol: Cell Culture Setup",
  "Observation Log - Day 1",
  "Experiment Notes",
  "Results Summary",
  "Methodology Documentation",
  "Daily Progress Entry",
]
export const GENERIC_EXPERIMENT_NAMES = [
  "Phase 1 Screening",
  "Dose-Response Study",
  "Validation Run",
]
export const GENERIC_DATE = "Jan 15, 2024"

/** Inject init scripts: tour completion + __name polyfill for tsx/esbuild */
export async function addCaptureInitScripts(page: Page): Promise<void> {
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("notes9_tour_completed", "true")
  })
  await page.evaluateOnNewDocument("typeof __name === 'undefined' && (window.__name = function(fn){return fn})")
}

/** Hide tour overlay and sanitize content for demo (blur PII, redact emails, replace dates/names) */
export async function sanitizeForDemo(page: Page): Promise<void> {
  await page.evaluate(
    ({
      projectNames,
      noteNames,
      experimentNames,
      genericDate,
    }: {
      projectNames: string[]
      noteNames: string[]
      experimentNames: string[]
      genericDate: string
    }) => {
      // 1. Remove/hide Notes9 tour (driver.js overlay)
      document.querySelectorAll(".driver-overlay, .driver-popover, [class*='driver']").forEach((el) => el.remove())
      const style = document.createElement("style")
      style.id = "capture-sanitize"
      style.textContent = `
        .driver-overlay, .driver-popover, [class*="driver-overlay"], [class*="driver-popover"] { display: none !important; }
        .pii-blur { filter: blur(10px) !important; }
      `
      const existing = document.getElementById("capture-sanitize")
      if (existing) existing.remove()
      document.head.appendChild(style)

      // 2. Blur avatars and sidebar user section
      document.querySelectorAll('[data-slot="avatar"], [data-sidebar="footer"]').forEach((el) => {
        ;(el as HTMLElement).classList.add("pii-blur")
      })

      // 3. Redact emails
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
      const toReplace: { node: Text; replacement: string }[] = []
      let node: Text | null
      while ((node = walker.nextNode() as Text | null)) {
        const text = node.textContent || ""
        const replacement = text.replace(emailRegex, "•••@•••.•••")
        if (replacement !== text) toReplace.push({ node, replacement })
      }
      toReplace.forEach(({ node, replacement }) => {
        node.textContent = replacement
      })

      // 4. Blur creator/assignee blocks
      const labels = ["Lead:", "Assigned to", "Created by", "Researcher:"]
      document.querySelectorAll("div, span").forEach((el) => {
        const text = (el as HTMLElement).innerText || (el as HTMLElement).textContent || ""
        if (labels.some((l) => text.includes(l)) && text.length < 80) {
          ;(el as HTMLElement).classList.add("pii-blur")
        }
      })

      // 5. Replace dates with generic date (common formats)
      const dateRegex = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}\b|\b\d{4}-\d{2}-\d{2}\b/g
      const walker2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)
      const dateReplace: { node: Text; replacement: string }[] = []
      let n: Text | null
      while ((n = walker2.nextNode() as Text | null)) {
        const text = n.textContent || ""
        const replacement = text.replace(dateRegex, genericDate)
        if (replacement !== text) dateReplace.push({ node: n, replacement })
      }
      dateReplace.forEach(({ node: nd, replacement }) => {
        nd.textContent = replacement
      })

      // 6. Replace names - CAREFUL: sidebar = projects only; main = exclude lab notes area
      const excludeTitles = [
        "All Projects", "Projects", "All Experiments", "Experiments", "All Lab Notes", "Lab Notes",
        "Literature", "Complete list", "View Project", "View Details", "Untitled", "New Lab Note",
        "members", "experiments", "Manage your", "Research Lab", "Active Projects", "Notes9", "LIMS",
        "Workspace", "Dashboard", "Settings", "Search", "Create", "Add", "Edit", "Delete", "Cancel",
        "Save", "Submit", "Loading", "—", "Copy", "Duplicate", "Export", "Import", "Unassigned",
        "New note", "Rename", "Delete note", "Notes", "Markdown", "HTML", "PDF", "Word", "Download as",
        "Create your first lab notebook", "Create Note", "Select a note", "Protocol", "Overview",
        "Samples", "Data & Files", "Protocol & Assays", "Lab Notes"
      ]
      const genericNames = [...projectNames, ...experimentNames, ...noteNames]
      const nameMap = new Map<string, string>()

      const isExcluded = (text: string) =>
        excludeTitles.some((e) => text === e || text.includes(e)) ||
        text.startsWith("View") || text.length < 3 || text.length > 80 ||
        /^\d+$/.test(text) || /^(member|experiment)s?$/i.test(text)

      const isInLabNotesArea = (el: Element) => {
        const htmlEl = el as HTMLElement
        const inEditor = htmlEl.closest && htmlEl.closest("[contenteditable='true'], .ProseMirror, .tiptap")
        const cardWithEditor = htmlEl.closest && htmlEl.closest("[class*='card']")
        if (cardWithEditor && cardWithEditor.querySelector && cardWithEditor.querySelector("[contenteditable='true'], .ProseMirror")) return true
        return !!inEditor
      }

      // First pass: collect unique names (sidebar project names + main content, exclude lab notes area)
      const uniqueNames = new Set<string>()
      document.querySelectorAll("[data-sidebar] a[href*='/projects/'] span").forEach((el) => {
        const text = ((el as HTMLElement).innerText || "").trim()
        if (text && !isExcluded(text)) uniqueNames.add(text)
      })
      const mainSelectors = [
        "main h1", "main h2", "main h3",
        "main [class*='CardTitle']", "main [class*='font-semibold']", "main [class*='font-medium']",
        "main [class*='truncate']", "main td", "main a[href*='/projects/']", "main a[href*='/experiments/']",
        "[class*='breadcrumb'] a", "[class*='breadcrumb'] span"
      ]
      mainSelectors.forEach((sel) => {
        try {
          document.querySelectorAll(sel).forEach((el) => {
            if (isInLabNotesArea(el)) return
            const text = ((el as HTMLElement).innerText || "").trim()
            if (text && !isExcluded(text)) uniqueNames.add(text)
          })
        } catch (_) {}
      })

      let idx = 0
      uniqueNames.forEach((item) => {
        if (idx < genericNames.length) {
          nameMap.set(item, genericNames[idx])
          idx++
        }
      })

      // Second pass: replace - SIDEBAR: only project name spans (not experiments, not lab notes)
      document.querySelectorAll("[data-sidebar] a[href*='/projects/'] span").forEach((el) => {
        const text = ((el as HTMLElement).innerText || "").trim()
        const replacement = nameMap.get(text)
        if (replacement) (el as HTMLElement).innerText = replacement
      })

      // Second pass: replace - MAIN CONTENT (exclude lab notes area)
      const replaceInMain = (el: Element) => {
        if (isInLabNotesArea(el)) return
        const text = ((el as HTMLElement).innerText || "").trim()
        const replacement = nameMap.get(text)
        if (replacement) (el as HTMLElement).innerText = replacement
      }
      mainSelectors.forEach((sel) => {
        try {
          document.querySelectorAll(sel).forEach(replaceInMain)
        } catch (_) {}
      })
    },
    {
      projectNames: GENERIC_PROJECT_NAMES,
      noteNames: GENERIC_NOTE_NAMES,
      experimentNames: GENERIC_EXPERIMENT_NAMES,
      genericDate: GENERIC_DATE,
    }
  )
  await new Promise((r) => setTimeout(r, 150))
}
