/**
 * Recording helpers: cursor overlay, full-page camera movement, cinematic
 * transitions, and narrative callouts for polished workflow demos.
 */

import type { ElementHandle, Page } from "puppeteer"

/** Inject cursor overlay on every new document. Call before recording. */
export async function addRecordingOverlays(page: Page): Promise<void> {
  const svg = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M5 3l14 9-6 1-4 7z"/></svg>'
  )
  const escapedSvg = svg.replace(/'/g, "\\'").replace(/\\/g, "\\\\")
  const script = `(function(){
  if(document.getElementById("capture-recording-overlays"))return;
  var s=document.createElement("style");
  s.id="capture-recording-overlays";
  s.textContent="html,body{scroll-behavior:smooth!important;overflow-x:hidden!important}body{overflow-x:hidden}#capture-stage{position:fixed;inset:0;pointer-events:none;z-index:2147483644;overflow:hidden}#capture-vignette{position:absolute;inset:0;background:radial-gradient(circle at center,rgba(15,23,42,0) 46%,rgba(15,23,42,.16) 100%);opacity:.95}#capture-transition{position:absolute;inset:0;background:linear-gradient(180deg,rgba(248,250,252,.18),rgba(255,255,255,.03));backdrop-filter:blur(0px);opacity:0;transition:opacity .45s ease,backdrop-filter .45s ease}#capture-caption{position:absolute;left:44px;bottom:42px;max-width:460px;padding:14px 18px;border-radius:18px;background:rgba(15,23,42,.82);color:#f8fafc;box-shadow:0 18px 48px rgba(15,23,42,.28);font:600 15px/1.45 ui-sans-serif,system-ui,sans-serif;letter-spacing:.01em;opacity:0;transform:translateY(16px);transition:opacity .32s ease,transform .32s ease}#capture-caption.visible{opacity:1;transform:translateY(0)}#capture-caption .eyebrow{display:block;margin-bottom:4px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:rgba(191,219,254,.95)}#capture-cursor{position:absolute;width:32px;height:32px;pointer-events:none;z-index:2147483647;transition:left .24s cubic-bezier(0.22,1,0.36,1),top .24s cubic-bezier(0.22,1,0.36,1);left:-100px;top:-100px;transform:translate(-50%,-50%);background-size:contain;background-repeat:no-repeat;filter:drop-shadow(0 4px 14px rgba(0,0,0,0.28))}#capture-cursor.clicking{animation:capture-click .34s ease-out}#capture-ripple{position:absolute;width:18px;height:18px;border:2px solid rgba(59,130,246,.65);border-radius:999px;opacity:0;transform:translate(-50%,-50%) scale(.5)}#capture-ripple.active{animation:capture-ripple .6s ease-out}@keyframes capture-click{0%{transform:translate(-50%,-50%) scale(1)}38%{transform:translate(-50%,-50%) scale(.82)}100%{transform:translate(-50%,-50%) scale(1)}}@keyframes capture-ripple{0%{opacity:.85;transform:translate(-50%,-50%) scale(.5)}100%{opacity:0;transform:translate(-50%,-50%) scale(3.4)}}";
  document.head.appendChild(s);
  var stage=document.createElement("div");
  stage.id="capture-stage";
  var vignette=document.createElement("div");
  vignette.id="capture-vignette";
  var transition=document.createElement("div");
  transition.id="capture-transition";
  var c=document.createElement("div");
  c.id="capture-cursor";
  c.style.backgroundImage="url('${escapedSvg}')";
  c.style.width="32px";
  c.style.height="32px";
  var ripple=document.createElement("div");
  ripple.id="capture-ripple";
  var caption=document.createElement("div");
  caption.id="capture-caption";
  stage.appendChild(vignette);
  stage.appendChild(transition);
  stage.appendChild(caption);
  stage.appendChild(ripple);
  stage.appendChild(c);
  document.body.appendChild(stage);
  window.__captureCursor=c;
  window.__captureRipple=ripple;
  window.__captureTransition=transition;
  window.__captureCaption=caption;
})();`
  await page.evaluateOnNewDocument(script)
}

async function setPageCamera(
  page: Page,
  scale: number,
  originX: number,
  originY: number,
  durationMs: number
): Promise<void> {
  await page.evaluate(
    ({
      scale,
      originX,
      originY,
      durationMs,
    }: {
      scale: number
      originX: number
      originY: number
      durationMs: number
    }) => {
      const root = document.documentElement
      root.style.transformOrigin = `${originX}px ${originY}px`
      root.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`
      root.style.transform = `scale(${scale})`
    },
    { scale, originX, originY, durationMs }
  )
  await new Promise((r) => setTimeout(r, durationMs + 80))
}

/** Zoom in on a specific point (x, y) centered on the click target. */
export async function zoomInOnPoint(page: Page, x: number, y: number, scale = 1.07, durationMs = 420): Promise<void> {
  await setPageCamera(page, scale, x, y, durationMs)
}

/** Move cursor to (x, y) with optional animation duration in ms */
export async function moveCursorTo(page: Page, x: number, y: number, durationMs = 300): Promise<void> {
  await page.evaluate(
    ({ x, y, durationMs }: { x: number; y: number; durationMs: number }) => {
      const el = (window as unknown as { __captureCursor?: HTMLElement }).__captureCursor
      if (!el) return
      el.style.transition = `left ${durationMs}ms ease-out, top ${durationMs}ms ease-out`
      el.style.left = `${x}px`
      el.style.top = `${y}px`
    },
    { x, y, durationMs }
  )
}

/** Show click animation at current cursor position */
export async function animateCursorClick(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as {
      __captureCursor?: HTMLElement
      __captureRipple?: HTMLElement
    }
    const el = win.__captureCursor
    const ripple = win.__captureRipple
    if (!el) return
    el.classList.remove("clicking")
    void el.offsetWidth
    el.classList.add("clicking")
    if (ripple) {
      ripple.classList.remove("active")
      ripple.style.left = el.style.left
      ripple.style.top = el.style.top
      void ripple.offsetWidth
      ripple.classList.add("active")
    }
    setTimeout(() => el.classList.remove("clicking"), 200)
  })
  await new Promise((r) => setTimeout(r, 220))
}

/** Get element center in viewport coordinates */
export async function getElementCenter(
  page: Page,
  selector: string
): Promise<{ x: number; y: number } | null> {
  return page.evaluate((sel: string) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }, selector)
}

/** Animate cursor to element, show click, then perform real click */
export async function animateClickOn(
  page: Page,
  selector: string,
  moveDurationMs = 400
): Promise<void> {
  const center = await getElementCenter(page, selector)
  if (center) {
    await moveCursorTo(page, center.x, center.y, moveDurationMs)
    await new Promise((r) => setTimeout(r, moveDurationMs + 50))
    await animateCursorClick(page)
  }
  const el = await page.$(selector)
  if (el) await el.click()
}

/** Animate cursor to element handle, zoom in on target, show click, then perform real click */
export async function animateClickOnElement(
  page: Page,
  element: ElementHandle<Element>,
  moveDurationMs = 450
): Promise<void> {
  const box = await element.boundingBox()
  if (box) {
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await zoomInOnPoint(page, x, y, 1.08, 320)
    await moveCursorTo(page, x, y, moveDurationMs)
    await new Promise((r) => setTimeout(r, moveDurationMs + 80))
    await animateCursorClick(page)
  }
  await element.click()
  await new Promise((r) => setTimeout(r, 120))
  await zoomOut(page, 260)
}

/** Move cursor to center of main content (for page transitions) */
export async function moveCursorToMain(page: Page, durationMs = 350): Promise<void> {
  const center = await getElementCenter(page, "main, [role='main'], .container")
  if (center) {
    await moveCursorTo(page, center.x, center.y, durationMs)
    await new Promise((r) => setTimeout(r, durationMs + 50))
  }
}

/** Zoom in on main content area with subtle motion. */
export async function zoomIn(page: Page, scale = 1.05, durationMs = 420): Promise<void> {
  await setPageCamera(page, scale, 960, 540, durationMs)
}

/** Reset zoom */
export async function zoomOut(page: Page, durationMs = 400): Promise<void> {
  await page.evaluate((durationMs: number) => {
    const root = document.documentElement
    root.style.transition = `transform ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`
    root.style.transformOrigin = "center top"
    root.style.transform = "scale(1)"
  }, durationMs)
  await new Promise((r) => setTimeout(r, durationMs + 50))
}

export async function smoothScroll(page: Page, y: number, durationMs = 900): Promise<void> {
  await page.evaluate(
    ({ y, durationMs }: { y: number; durationMs: number }) => {
      const start = window.scrollY
      const delta = y - start
      const t0 = performance.now()
      const ease = (t: number) => 1 - Math.pow(1 - t, 3)
      function step(now: number) {
        const t = Math.min(1, (now - t0) / durationMs)
        window.scrollTo({ top: start + delta * ease(t), behavior: "auto" })
        if (t < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    },
    { y, durationMs }
  )
  await new Promise((r) => setTimeout(r, durationMs + 80))
}

export async function transitionBetweenScenes(page: Page, holdMs = 500): Promise<void> {
  await page.evaluate(() => {
    const overlay = (window as unknown as { __captureTransition?: HTMLElement }).__captureTransition
    if (!overlay) return
    overlay.style.opacity = "1"
    overlay.style.backdropFilter = "blur(10px)"
  })
  await new Promise((r) => setTimeout(r, holdMs))
}

export async function revealScene(page: Page, durationMs = 520): Promise<void> {
  await page.evaluate((durationMs: number) => {
    const overlay = (window as unknown as { __captureTransition?: HTMLElement }).__captureTransition
    if (!overlay) return
    overlay.style.transition = `opacity ${durationMs}ms ease, backdrop-filter ${durationMs}ms ease`
    overlay.style.opacity = "0"
    overlay.style.backdropFilter = "blur(0px)"
  }, durationMs)
  await new Promise((r) => setTimeout(r, durationMs + 60))
}

export async function showCaption(
  page: Page,
  eyebrow: string,
  message: string,
  holdMs = 1800
): Promise<void> {
  await page.evaluate(
    ({ eyebrow, message }: { eyebrow: string; message: string }) => {
      const caption = (window as unknown as { __captureCaption?: HTMLElement }).__captureCaption
      if (!caption) return
      caption.innerHTML = `<span class="eyebrow">${eyebrow}</span>${message}`
      caption.classList.add("visible")
    },
    { eyebrow, message }
  )
  await new Promise((r) => setTimeout(r, holdMs))
}

export async function hideCaption(page: Page): Promise<void> {
  await page.evaluate(() => {
    const caption = (window as unknown as { __captureCaption?: HTMLElement }).__captureCaption
    if (!caption) return
    caption.classList.remove("visible")
  })
  await new Promise((r) => setTimeout(r, 220))
}
