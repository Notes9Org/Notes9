/**
 * Puppeteer script to capture Notes9 screenshots for the marketing demo carousel.
 *
 * Prerequisites:
 * - App must be running (pnpm dev or pnpm start)
 * - Set CAPTURE_EMAIL and CAPTURE_PASSWORD for login
 *
 * Usage:
 *   CAPTURE_EMAIL=alphafoldmab4845v1@gmail.com CAPTURE_PASSWORD=Password@123 pnpm capture:screenshots
 *
 * PII (avatars, names, emails) are blurred/redacted in screenshots.
 *
 * Optional env:
 *   CAPTURE_BASE_URL - default http://localhost:3000
 *   CAPTURE_PROJECT_ID - specific project ID for project-report.png
 *   CAPTURE_EXPERIMENT_ID - specific experiment ID for experiment-details.png
 *   CAPTURE_LITERATURE_ID - specific literature review ID for literature-search.png
 */

import dotenv from "dotenv"
import puppeteer, { type Page } from "puppeteer"
import * as fs from "fs"
import * as path from "path"
import { addCaptureInitScripts } from "../lib/capture-sanitize"

dotenv.config({ path: path.join(process.cwd(), ".env") })

const BASE_URL = process.env.CAPTURE_BASE_URL || "http://localhost:3000"
const EMAIL = process.env.CAPTURE_EMAIL
const PASSWORD = process.env.CAPTURE_PASSWORD
const CAPTURE_OUTPUT_SUBDIR = process.env.CAPTURE_OUTPUT_SUBDIR || ""
const OUTPUT_DIR = path.join(process.cwd(), "public", "demo", CAPTURE_OUTPUT_SUBDIR)
const CAPTURE_THEME = (process.env.CAPTURE_THEME || "light").toLowerCase()

const VIEWPORT = { width: 1920, height: 1080 }

async function applyCaptureTheme(page: Page) {
  if (CAPTURE_THEME !== "dark") return
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("theme", "dark")
    document.documentElement.classList.add("dark")
    document.documentElement.style.colorScheme = "dark"
  })
}
const LITERATURE_QUERY = "cancer apoptotic protein review"

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    console.log(`Created ${OUTPUT_DIR}`)
  }
}

async function login(page: Page): Promise<boolean> {
  if (!EMAIL || !PASSWORD) {
    console.warn("CAPTURE_EMAIL and CAPTURE_PASSWORD not set. Skipping login.")
    return false
  }

  await page.goto(`${BASE_URL}/auth/login`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  })
  // Allow React to hydrate
  await new Promise((r) => setTimeout(r, 2000))
  await page.setViewport(VIEWPORT)

  // Wait for the login form to be ready (React hydration)
  await page.waitForSelector("#email", { visible: true, timeout: 10000 })
  await page.waitForSelector("#password", { visible: true, timeout: 5000 })

  // Fill form - type with delay for React controlled inputs
  await page.click("#email", { clickCount: 3 })
  await page.type("#email", EMAIL, { delay: 30 })
  await page.click("#password", { clickCount: 3 })
  await page.type("#password", PASSWORD, { delay: 30 })

  // Click Sign In and wait for client-side navigation (Next.js router.push)
  const submitBtn = await page.$('form button[type="submit"]')
  if (!submitBtn) {
    console.error("Could not find Sign In button")
    return false
  }

  await Promise.all([
    // Next.js uses client-side navigation; wait for URL to change
    page.waitForFunction(
      () => !window.location.pathname.includes("/auth/login"),
      { timeout: 30000 }
    ),
    submitBtn.click(),
  ])

  const url = page.url()
  if (url.includes("/auth/login")) {
    const errorEl = await page.$("[class*='destructive']")
    const errorText = errorEl
      ? await errorEl.evaluate((el: Element) => el.textContent)
      : null
    console.error("Login failed - still on login page.", errorText ? `Error: ${errorText}` : "")
    return false
  }

  // Wait for app shell to load after navigation
  await page.waitForSelector('a[href="/projects"]', { visible: true, timeout: 15000 }).catch(() => {})

  // Prevent the Notes9 tour from appearing in screenshots
  await page.evaluate((theme: string) => {
    localStorage.setItem("notes9_tour_completed", "true")
    localStorage.setItem("theme", theme)
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light"
  }, CAPTURE_THEME === "dark" ? "dark" : "light")
  console.log("Logged in successfully")
  return true
}

async function capture(
  page: Page,
  route: string,
  output: string,
  waitFor = "main, [role='main'], .container, body"
) {
  const fullUrl = route.startsWith("http") ? route : `${BASE_URL}${route}`
  await page.goto(fullUrl, { waitUntil: "networkidle2", timeout: 30000 })
  await page.setViewport(VIEWPORT)

  try {
    await page.waitForSelector(waitFor, { timeout: 10000 })
  } catch {
    // Continue anyway - page may have loaded
  }

  // Hide Next.js dev indicator (the 'N' letter)
  await page.addStyleTag({ content: 'nextjs-portal, #nextjs-build-indicator, [data-nextjs-toast] { display: none !important; }' })

  // Specific delays for content to settle
  if (route === "/research-map") {
    console.log("Waiting 8s for research map to fully render...")
    await new Promise((r) => setTimeout(r, 8000))
  } else {
    await new Promise((r) => setTimeout(r, 800))
  }

  const filePath = path.join(OUTPUT_DIR, output)
  await page.screenshot({ path: filePath, type: "png" })
  console.log(`Captured ${output} from ${route}`)
}

async function captureExistingLabNoteFromExperiment(page: Page, experimentPath: string): Promise<void> {
  await page.goto(`${BASE_URL}${experimentPath}?tab=notes`, { waitUntil: "networkidle2", timeout: 30000 })
  await page.setViewport(VIEWPORT)
  await new Promise((r) => setTimeout(r, 2000))

  // Click Notes tab if not already selected
  const notesTab = await page.$("#tab-trigger-notes")
  if (notesTab) {
    await notesTab.click()
    await new Promise((r) => setTimeout(r, 1500))
  }

  const selectedExistingNote = await page.evaluate(() => {
    const note = document.querySelector<HTMLElement>("[data-note-id]")
    if (!note) return false
    note.click()
    return true
  })
  if (selectedExistingNote) {
    await new Promise((r) => setTimeout(r, 2000))
  }

  const filePath = path.join(OUTPUT_DIR, "new-lab-note.png")
  await page.screenshot({ path: filePath, type: "png" })
  console.log(`Captured new-lab-note.png from existing note at ${experimentPath}?tab=notes`)
}

async function captureLiteratureSearchResults(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/literature-reviews`, { waitUntil: "networkidle2", timeout: 30000 })
  await page.setViewport(VIEWPORT)
  await new Promise((r) => setTimeout(r, 1800))

  const searchTab = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"], button'))
    const target = tabs.find((tab) => (tab.textContent || "").trim().includes("Search"))
    if (!target) return false
    target.click()
    return true
  })
  if (searchTab) {
    await new Promise((r) => setTimeout(r, 600))
  }

  await page.waitForSelector("input", { visible: true, timeout: 10000 })
  const typed = await page.evaluate((query: string) => {
    const input = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((el) => {
      const placeholder = (el.placeholder || "").toLowerCase()
      return placeholder.includes("search database") || placeholder.includes("ask a research question")
    })
    if (!input) return false
    input.focus()
    input.value = ""
    input.dispatchEvent(new Event("input", { bubbles: true }))
    return true
  }, LITERATURE_QUERY)
  if (!typed) return

  await page.keyboard.type(LITERATURE_QUERY, { delay: 25 })
  await page.keyboard.press("Enter")
  await new Promise((r) => setTimeout(r, 5000))

  const totalHeight = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight))
  await page.evaluate(async (height: number) => {
    const duration = 2200
    const start = window.scrollY
    const delta = Math.max(0, height - window.innerHeight - start)
    const startTime = performance.now()
    await new Promise<void>((resolve) => {
      function step(now: number) {
        const t = Math.min(1, (now - startTime) / duration)
        const eased = 1 - Math.pow(1 - t, 3)
        window.scrollTo(0, start + delta * eased)
        if (t < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
  }, totalHeight)
  await new Promise((r) => setTimeout(r, 700))

  const filePath = path.join(OUTPUT_DIR, "literature-search.png")
  await page.screenshot({ path: filePath, type: "png", fullPage: true })
  console.log(`Captured literature-search.png from live search for "${LITERATURE_QUERY}"`)
}

async function getFirstDetailLink(
  page: Page,
  listUrl: string,
  basePath: string
): Promise<string | null> {
  await page.goto(`${BASE_URL}${listUrl}`, { waitUntil: "networkidle2", timeout: 30000 })
  await page.setViewport(VIEWPORT)

  const pathname = await page.evaluate((base: string) => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))
    const exclude = `${base}/new`
    for (const a of links) {
      try {
        const p = new URL(a.href, window.location.origin).pathname
        if (p !== exclude && p !== base && p.startsWith(base + "/")) return p
      } catch {
        // skip invalid hrefs
      }
    }
    return null
  }, basePath)
  return pathname
}

async function captureProtocolDetails(page: Page) {
  await page.goto(`${BASE_URL}/protocols`, { waitUntil: "networkidle2", timeout: 30000 })
  await page.addStyleTag({ content: 'nextjs-portal, #nextjs-build-indicator, [data-nextjs-toast] { display: none !important; }' })
  await new Promise(r => setTimeout(r, 2000))

  const clicked = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span"))
    const target = spans.find(s => s.textContent?.trim() === "View Details")
    if (target) {
      ;(target as HTMLElement).click()
      return true
    }
    return false
  })
  
  if (clicked) {
    await new Promise(r => setTimeout(r, 3000))
    await page.addStyleTag({ content: 'nextjs-portal, #nextjs-build-indicator, [data-nextjs-toast] { display: none !important; }' })
    const filePath = path.join(OUTPUT_DIR, "protocol-details.png")
    await page.screenshot({ path: filePath, type: "png" })
    console.log("Captured protocol-details.png from /protocols")
  } else {
    console.warn("Could not find 'View Details' button in /protocols")
  }
}

async function captureResearchMapLiterature(page: Page) {
  await page.goto(`${BASE_URL}/research-map`, { waitUntil: "networkidle2", timeout: 30000 })
  await page.addStyleTag({ content: 'nextjs-portal, #nextjs-build-indicator, [data-nextjs-toast] { display: none !important; }' })
  await new Promise(r => setTimeout(r, 8000)) // map render delay

  const clicked = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("label"))
    const target = labels.find(l => l.textContent?.trim().includes("Literature"))
    if (target) {
      ;(target as HTMLElement).click()
      return true
    }
    return false
  })

  if (clicked) {
    console.log("Clicked Literature filter, waiting 4s for rerender...")
    await new Promise(r => setTimeout(r, 4000))
    const filePath = path.join(OUTPUT_DIR, "research-map-literature.png")
    await page.screenshot({ path: filePath, type: "png" })
    console.log("Captured research-map-literature.png from /research-map")
  } else {
    console.warn("Could not find 'Literature' filter in /research-map")
  }
}

async function captureWritingEditor(page: Page) {
  await page.goto(`${BASE_URL}/papers`, { waitUntil: "networkidle2", timeout: 30000 })
  await page.addStyleTag({ content: 'nextjs-portal, #nextjs-build-indicator, [data-nextjs-toast] { display: none !important; }' })
  await new Promise(r => setTimeout(r, 2000))

  const clickedOpen = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll("[class*='card'], tr"))
    let targetCard = cards.find(c => c.textContent?.toLowerCase().includes("research proposal"))
    
    if (!targetCard) {
      targetCard = cards.find(c => c.textContent?.includes("Open in editor") || c.textContent?.includes("Open full page"))
    }

    if (targetCard) {
      const btn = Array.from(targetCard.querySelectorAll("span, button, a, div")).find(b => {
        const t = b.textContent?.trim() || ""
        return t.includes("Open in editor") || t.includes("Open full page")
      })
      if (btn) {
        ;(btn as HTMLElement).click()
        return true
      }
      ;(targetCard as HTMLElement).click()
      return true
    }

    // fallback
    const els = Array.from(document.querySelectorAll("span, button, a, div"))
    const target = els.find(b => {
      const t = b.textContent?.trim() || ""
      return t === "Open in editor" || t.includes("New Paper")
    })
    if (target) {
      ;(target as HTMLElement).click()
      return true
    }
    return false
  })

  if (clickedOpen) {
    await new Promise(r => setTimeout(r, 6000)) // wait for editor

    // Open AI Sidebar
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button, span, div, a"))
      const aiBtn = buttons.find(b => {
        const text = b.textContent?.trim() || ""
        return text.includes("Write with AI")
      })
      if (aiBtn) {
        ;(aiBtn as HTMLElement).click()
      } else {
        const attrs = document.querySelectorAll("[aria-label*='AI'], [title*='AI']")
        if (attrs.length > 0) {
          ;(attrs[0] as HTMLElement).click()
        }
      }
    })

    await new Promise(r => setTimeout(r, 4000)) // wait for sidebar to open
    await page.addStyleTag({ content: 'nextjs-portal, #nextjs-build-indicator, [data-nextjs-toast] { display: none !important; }' })
    const filePath = path.join(OUTPUT_DIR, "writing-editor.png")
    await page.screenshot({ path: filePath, type: "png" })
    console.log("Captured writing-editor.png from /papers")
  } else {
    console.warn("Could not find paper to open in /papers")
  }
}

async function main() {
  console.log("Starting screenshot capture...")
  console.log(`Base URL: ${BASE_URL}`)
  await ensureOutputDir()

  const launchOpts: Parameters<typeof puppeteer.launch>[0] = {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  }
  // Use system Chrome if Puppeteer's bundled Chrome isn't installed (macOS)
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
    await applyCaptureTheme(page)

    page.setDefaultNavigationTimeout(30000)
    page.setDefaultTimeout(15000)
    await page.setViewport(VIEWPORT)

    const loggedIn = await login(page)
    if (!loggedIn) {
      console.error(
        "Cannot proceed without login. Add to your .env file:\n" +
          "  CAPTURE_EMAIL=your@email.com\n" +
          "  CAPTURE_PASSWORD=yourpassword"
      )
      process.exit(1)
    }

    // Static routes
    await capture(page, "/projects", "projects.png")
    await capture(page, "/literature-reviews", "literature-list.png")
    await capture(page, "/lab-notes", "lab-memory.png")

    await captureLiteratureSearchResults(page)

    // Experiment details
    let expPath: string | null = null
    if (process.env.CAPTURE_EXPERIMENT_ID) {
      expPath = `/experiments/${process.env.CAPTURE_EXPERIMENT_ID}`
      await capture(page, expPath, "experiment-details.png")
    } else {
      expPath = await getFirstDetailLink(page, "/experiments", "/experiments")
      if (expPath) {
        await capture(page, expPath, "experiment-details.png")
      } else {
        console.warn("No experiments found, skipping experiment-details.png")
      }
    }

    // Existing lab note view (from experiment details)
    if (expPath) {
      await captureExistingLabNoteFromExperiment(page, expPath)
    }

    // Dashboard
    await capture(page, "/dashboard", "dashboard.png")

    // Experiments list
    await capture(page, "/experiments", "experiments-list.png")

    // Additional requested pages
    await capture(page, "/research-map", "research-map.png")
    await capture(page, "/papers", "writing.png")
    await capture(page, "/samples", "samples.png")
    await capture(page, "/protocols", "protocols.png")

    // Project report
    const projectId = process.env.CAPTURE_PROJECT_ID
    if (projectId) {
      await capture(page, `/projects/${projectId}`, "project-report.png")
    } else {
      const projPath = await getFirstDetailLink(page, "/projects", "/projects")
      if (projPath) {
        await capture(page, projPath, "project-report.png")
      } else {
        console.warn("No projects found, skipping project-report.png")
      }
    }

    // Interactive custom pages
    await captureProtocolDetails(page)
    await captureResearchMapLiterature(page)
    await captureWritingEditor(page)

    console.log("Screenshot capture complete.")
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
