/**
 * Records a screen workflow video of Notes9 using Puppeteer's screencast.
 *
 * Story flow: Projects → open project → Experiments → open experiment →
 * Lab Notes → write → Cite with AI → select citation → Bibliography (APA).
 *
 * Features: prominent cursor, zoom-on-click, smooth transitions, immediate PII sanitization.
 *
 * Prerequisites:
 * - App running (pnpm dev)
 * - ffmpeg installed (brew install ffmpeg)
 * - CAPTURE_EMAIL and CAPTURE_PASSWORD in .env
 *
 * Usage: pnpm record:workflow
 *
 * Output: public/demo/workflow.webm
 */

import dotenv from "dotenv"
import puppeteer, { type ElementHandle, type Page } from "puppeteer"
import * as fs from "fs"
import * as path from "path"
import {
  addRecordingOverlays,
  animateClickOnElement,
  hideCaption,
  moveCursorToMain,
  revealScene,
  showCaption,
  smoothScroll,
  transitionBetweenScenes,
  zoomIn,
  zoomOut,
} from "../lib/capture-recording"
import { addCaptureInitScripts } from "../lib/capture-sanitize"

dotenv.config({ path: path.join(process.cwd(), ".env") })

const BASE_URL = process.env.CAPTURE_BASE_URL || "http://localhost:3000"
const EMAIL = process.env.CAPTURE_EMAIL
const PASSWORD = process.env.CAPTURE_PASSWORD
const OUTPUT_DIR = path.join(process.cwd(), "public", "demo")
const OUTPUT_VIDEO = path.join(OUTPUT_DIR, "workflow.webm")
const LITERATURE_QUERY = "cancer apoptotic protein review"

const VIEWPORT = { width: 1920, height: 1080 }

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
}

async function login(page: Page): Promise<boolean> {
  if (!EMAIL || !PASSWORD) {
    console.error("Set CAPTURE_EMAIL and CAPTURE_PASSWORD in .env")
    return false
  }

  await page.goto(`${BASE_URL}/auth/login`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })
  await new Promise((r) => setTimeout(r, 2000))
  await page.setViewport(VIEWPORT)

  await page.waitForSelector("#email", { visible: true, timeout: 10000 })
  await page.waitForSelector("#password", { visible: true, timeout: 5000 })

  await page.click("#email", { clickCount: 3 })
  await page.type("#email", EMAIL, { delay: 30 })
  await page.click("#password", { clickCount: 3 })
  await page.type("#password", PASSWORD, { delay: 30 })

  const submitBtn = await page.$('form button[type="submit"]')
  if (!submitBtn) return false

  await Promise.all([
    page.waitForFunction(
      () => !window.location.pathname.includes("/auth/login"),
      { timeout: 30000 }
    ),
    submitBtn.click(),
  ])

  await page.waitForSelector('a[href="/projects"]', { visible: true, timeout: 15000 }).catch(() => {})
  return !page.url().includes("/auth/login")
}

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForStableUI(page: Page, holdMs = 900) {
  await page.setViewport(VIEWPORT)
  await page.waitForSelector("main, [role='main'], .container, body", { timeout: 8000 }).catch(() => {})
  await delay(holdMs)
}

async function gotoAndShow(page: Page, url: string, holdMs = 2200) {
  await transitionBetweenScenes(page, 420)
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
  await waitForStableUI(page, 650)
  await revealScene(page, 520)
  await zoomIn(page, 1.06, 520)
  await moveCursorToMain(page, 360)
  await delay(holdMs)
  await zoomOut(page, 340)
  await delay(260)
}

async function findButtonByText(page: Page, texts: string[]) {
  return page
    .evaluateHandle((candidates: string[]) => {
      const buttons = Array.from(document.querySelectorAll("button, [role='button']"))
      return (
        buttons.find((button) => {
          const text = (button.textContent || "").trim()
          return candidates.some((candidate) => text.includes(candidate))
        }) || null
      )
    }, texts)
    .then((handle) => handle.asElement() as ElementHandle<Element> | null)
    .catch(() => null)
}

async function findFirstLink(page: Page, prefix: string, exclude?: string) {
  return page
    .evaluateHandle(
      ({ prefix, exclude }: { prefix: string; exclude?: string }) => {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
        return (
          links.find((link) => {
            const href = link.getAttribute("href") || ""
            return href.startsWith(prefix) && href !== exclude
          }) || null
        )
      },
      { prefix, exclude }
    )
    .then((handle) => handle.asElement() as ElementHandle<Element> | null)
    .catch(() => null)
}

async function highlightSentenceInEditor(page: Page, sentence: string) {
  await page.evaluate((targetSentence: string) => {
    const editor = document.querySelector(".ProseMirror, [contenteditable='true']")
    if (!editor) return

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    let node: Text | null = null
    let foundNode: Text | null = null
    let foundOffset = -1

    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || ""
      const idx = text.indexOf(targetSentence)
      if (idx !== -1) {
        foundNode = node
        foundOffset = idx
        break
      }
    }

    if (!foundNode || foundOffset === -1) return
    const range = document.createRange()
    range.setStart(foundNode, foundOffset)
    range.setEnd(foundNode, foundOffset + targetSentence.length)
    const selection = window.getSelection()
    if (!selection) return
    selection.removeAllRanges()
    selection.addRange(range)
  }, sentence)
}

async function selectTopCitationResult(page: Page) {
  const option = await page
    .evaluateHandle(() => {
      const dialog = document.querySelector('[role="dialog"]')
      if (!dialog) return null
      const rows = Array.from(dialog.querySelectorAll("button, [role='button'], label, div"))
      return (
        rows.find((row) => {
          const text = (row.textContent || "").trim()
          return Boolean(text) && !text.includes("Cite Selected") && !text.includes("Cancel")
        }) || null
      )
    })
    .then((handle) => handle.asElement() as ElementHandle<Element> | null)
    .catch(() => null)

  if (option) {
    await animateClickOnElement(page, option, 320)
    await delay(450)
  }
}

async function findExistingNote(page: Page) {
  return page
    .evaluateHandle(() => {
      const notes = Array.from(document.querySelectorAll<HTMLElement>("[data-note-id]"))
      return notes[0] || null
    })
    .then((handle) => handle.asElement() as ElementHandle<Element> | null)
    .catch(() => null)
}

async function openExistingLabNote(page: Page): Promise<boolean> {
  const experimentNote = await findExistingNote(page)
  if (experimentNote) {
    await showCaption(page, "Existing Note", "Open an existing note rather than creating a new one, so the demo stays inside real working data.", 1800)
    await animateClickOnElement(page, experimentNote, 360)
    await waitForStableUI(page, 1000)
    await hideCaption(page)
    return true
  }

  await gotoAndShow(page, `${BASE_URL}/lab-notes`, 1200)
  await showCaption(page, "Fallback Notes View", "No experiment-local note was available, so continue from the existing lab notes workspace instead.", 1900)
  const noteCard = await page
    .evaluateHandle(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button'], .cursor-pointer, .bg-card"))
      return (
        cards.find((card) => {
          const text = (card.textContent || "").trim()
          return text.includes("View Details") || text.length > 0
        }) || null
      )
    })
    .then((handle) => handle.asElement() as ElementHandle<Element> | null)
    .catch(() => null)

  if (!noteCard) {
    await hideCaption(page)
    return false
  }

  await animateClickOnElement(page, noteCard, 360)
  await waitForStableUI(page, 1200)
  await hideCaption(page)
  return true
}

async function findSearchInput(page: Page) {
  return page
    .evaluateHandle(() => {
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"))
      return (
        inputs.find((input) => {
          const placeholder = (input.placeholder || "").toLowerCase()
          return placeholder.includes("search database") || placeholder.includes("ask a research question")
        }) || null
      )
    })
    .then((handle) => handle.asElement() as ElementHandle<Element> | null)
    .catch(() => null)
}

async function searchLiterature(page: Page, query: string) {
  await gotoAndShow(page, `${BASE_URL}/literature-reviews`, 1400)
  await showCaption(page, "Research Search", `Search literature for "${query}" and browse the evidence stack.`)
  const searchInput = await findSearchInput(page)
  if (!searchInput) {
    await hideCaption(page)
    return
  }

  await animateClickOnElement(page, searchInput, 360)
  await delay(220)
  await page.keyboard.type(query, { delay: 28 })
  await delay(260)
  await page.keyboard.press("Enter")
  await delay(5000)
  await hideCaption(page)
  await showCaption(page, "Evidence Review", "Scroll through the returned papers so the viewer sees the searchable literature workflow.", 1600)
  await smoothScroll(page, 900, 1600)
  await delay(300)
  const bottomScrollTarget = await page.evaluate(() =>
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight
  )
  await smoothScroll(page, Math.max(0, bottomScrollTarget), 2200)
  await delay(700)
  await hideCaption(page)
}

async function main() {
  console.log("Recording workflow video (story: project → experiment → lab note → Cite with AI)...")
  console.log("Requires ffmpeg. Install with: brew install ffmpeg")
  await ensureOutputDir()

  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  }
  const systemChrome =
    process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : null
  if (systemChrome && fs.existsSync(systemChrome)) {
    launchOpts.executablePath = systemChrome
  }

  const browser = await puppeteer.launch(launchOpts)

  try {
    const page = await browser.newPage()

    await addCaptureInitScripts(page)

    page.setDefaultNavigationTimeout(30000)
    page.setDefaultTimeout(20000)
    await page.setViewport(VIEWPORT)

    const loggedIn = await login(page)
    if (!loggedIn) {
      console.error("Login failed")
      process.exit(1)
    }

    await addRecordingOverlays(page)

    console.log("Starting screencast...")
    const recorder = await page.screencast({ path: OUTPUT_VIDEO as `${string}.webm` })

    await searchLiterature(page, LITERATURE_QUERY)

    await gotoAndShow(page, `${BASE_URL}/projects`, 2000)
    await showCaption(page, "Project Context", "Start in an existing project so the viewer sees a live workspace rather than a setup screen.", 1800)
    await smoothScroll(page, 180, 1100)
    await delay(500)
    await hideCaption(page)

    const projectCard = await findFirstLink(page, "/projects/", "/projects/new")
    if (!projectCard) {
      console.warn("No project found, skipping project detail")
    } else {
      await showCaption(page, "Open Project", "Drill into the project that already contains the active experiment and note trail.", 1700)
      await animateClickOnElement(page, projectCard, 420)
      await waitForStableUI(page, 1000)
      await zoomIn(page, 1.05, 520)
      await moveCursorToMain(page, 320)
      await delay(1500)
      await zoomOut(page, 340)
      await delay(320)
      await hideCaption(page)

      const expLink = await findFirstLink(page, "/experiments/", "/experiments/new")
      if (expLink) {
        await showCaption(page, "Open Experiment", "Continue into the existing experiment to show how project work flows into execution.", 1700)
        await smoothScroll(page, 260, 900)
        await delay(350)
        await animateClickOnElement(page, expLink, 420)
        await waitForStableUI(page, 1100)
        await zoomIn(page, 1.045, 480)
        await delay(1250)
        await zoomOut(page, 320)
        await delay(360)
        await hideCaption(page)

        const notesTabEl = await page.$('#tab-trigger-notes') || await page.evaluateHandle(() => {
          const tabs = Array.from(document.querySelectorAll('[role="tab"], button'))
          return tabs.find((t) => (t.textContent || "").trim().includes("Lab Notes")) || null
        }).then((h) => h.asElement() as ElementHandle<Element> | null).catch(() => null)

        if (notesTabEl) {
          await showCaption(page, "Lab Notes", "Switch to lab notes to show where experiment context turns into structured documentation.", 1800)
          await animateClickOnElement(page, notesTabEl, 360)
          await waitForStableUI(page, 1200)
          await hideCaption(page)
        }

        await smoothScroll(page, 300, 950)
        await delay(300)

        const noteOpened = await openExistingLabNote(page)
        if (!noteOpened) {
          console.warn("No existing note found, skipping note interaction")
        }

        await page.waitForSelector(".ProseMirror, [contenteditable='true']", { timeout: 5000 }).catch(() => {})

        const introLine = "Opened the project, reviewed the existing experiment, and continued documenting the workflow in the lab note."
        const citedSentence = "Cell culture performance improved when the media exchange cadence matched the protocol described in recent peer reviewed literature."
        const closingLine = "The note now captures the method, supporting evidence, and a formatted bibliography for the team."
        const editor = await page.$(".ProseMirror, [contenteditable='true']")
        if (editor) {
          await showCaption(page, "Document Findings", "Add a short research summary, then cite the strongest claim directly from the note.", 1900)
          await animateClickOnElement(page, editor, 360)
          await delay(300)
          await page.keyboard.press("End").catch(() => {})
          await page.keyboard.press("Enter")
          await delay(220)
          await page.keyboard.type(introLine, { delay: 28 })
          await page.keyboard.press("Enter")
          await delay(200)
          await page.keyboard.type(citedSentence, { delay: 28 })
          await page.keyboard.press("Enter")
          await delay(200)
          await page.keyboard.type(closingLine, { delay: 28 })
          await delay(800)

          await highlightSentenceInEditor(page, citedSentence)
          await delay(850)
          await hideCaption(page)

          const citeBtn =
            await page.$('[data-testid="cite-with-ai"]') ||
            await findButtonByText(page, ["Cite with AI", "Cite"])
          if (citeBtn) {
            await showCaption(page, "Cite With AI", "Use the selected sentence to search for supporting evidence directly from the note.", 1900)
            await zoomIn(page, 1.07, 420)
            await animateClickOnElement(page, citeBtn, 380)
            await delay(4500)
            await zoomOut(page, 320)
            await hideCaption(page)
            await showCaption(page, "Pick Evidence", "Choose the top paper from the returned results and insert it into the document.", 1800)
            await selectTopCitationResult(page)

            const citeSelectedBtn = await findButtonByText(page, ["Cite Selected"])
            if (citeSelectedBtn) {
              await animateClickOnElement(page, citeSelectedBtn, 360)
              await waitForStableUI(page, 1200)
            }
            await hideCaption(page)
          }

          const bibBtn =
            await page.$('[data-testid="generate-bibliography"]') ||
            await findButtonByText(page, ["Bibliography"])
          if (bibBtn) {
            await showCaption(page, "Bibliography", "Generate an APA bibliography and append the formatted references at the end of the note.", 2000)
            await zoomIn(page, 1.075, 420)
            await animateClickOnElement(page, bibBtn, 380)
            await delay(3400)
            await zoomOut(page, 320)

            const apaOption = await page.$('select option[value="APA"]')
            if (apaOption) {
              await page.select('select', "APA")
              await delay(550)
            }

            const insertBtn = await findButtonByText(page, ["Insert at End"])
            if (insertBtn) {
              await animateClickOnElement(page, insertBtn, 360)
              await waitForStableUI(page, 1300)
              const bottomScrollTarget = await page.evaluate(() =>
                Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
              )
              await smoothScroll(page, bottomScrollTarget, 1600)
              await zoomIn(page, 1.04, 420)
              await delay(1100)
              await zoomOut(page, 320)
            }
            await hideCaption(page)
          }
        }
      }
    }

    await zoomOut(page, 260)
    await delay(900)

    await recorder.stop()
    console.log(`Saved: ${OUTPUT_VIDEO}`)
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
