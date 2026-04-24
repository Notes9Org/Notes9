import { driver, type DriveStep, type Driver } from "driver.js"
import "driver.js/dist/driver.css"
import { PREVIEW_STEP_COUNT, STEP_HINTS } from "@/lib/marketing/preview-workflow"

export const START_TOUR_EVENT = "notes9:preview-start-tour"

function stepTitle(n: number): string {
  return `Notes9 preview — step ${n} of ${PREVIEW_STEP_COUNT}`
}

/** Build 15 steps: 1 center, 2–6 highlight app chrome, 7–15 center modals. */
function buildPreviewTourSteps(): DriveStep[] {
  const steps: DriveStep[] = [
    {
      popover: {
        title: stepTitle(1),
        description: STEP_HINTS[1],
        side: "over",
        align: "center",
        nextBtnText: "Next",
      },
    },
  ]

  const chrome: { el: string; side: "right" | "bottom" | "left"; step: number }[] = [
    { el: '[data-tour="preview-app-sidebar"]', side: "right", step: 2 },
    { el: '[data-tour="preview-app-search"]', side: "bottom", step: 3 },
    { el: '[data-tour="preview-app-nav"]', side: "right", step: 4 },
    { el: '[data-tour="preview-app-header"]', side: "bottom", step: 5 },
    { el: '[data-tour="preview-app-main"]', side: "left", step: 6 },
  ]

  for (const { el, side, step } of chrome) {
    steps.push({
      element: el,
      popover: {
        title: stepTitle(step),
        description: STEP_HINTS[step],
        side,
        align: "start",
        nextBtnText: "Next",
        prevBtnText: "Back",
      },
    })
  }

  for (let i = 7; i <= PREVIEW_STEP_COUNT; i++) {
    steps.push({
      popover: {
        title: stepTitle(i),
        description: STEP_HINTS[i],
        side: "over",
        align: "center",
        nextBtnText: i === PREVIEW_STEP_COUNT ? "Done" : "Next",
        prevBtnText: "Back",
      },
    })
  }

  return steps
}

let singleton: Driver | null = null

export function getOrCreatePreviewTourDriver(): Driver {
  if (singleton) {
    try {
      singleton.destroy()
    } catch {
      // ignore
    }
  }
  singleton = driver({
    showProgress: true,
    showButtons: ["next", "previous", "close"],
    allowClose: true,
    allowKeyboardControl: true,
    smoothScroll: true,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    progressText: `Step {{current}} of ${PREVIEW_STEP_COUNT}`,
    stagePadding: 6,
    steps: buildPreviewTourSteps(),
  })
  return singleton
}

export function destroyPreviewTourDriver(): void {
  if (singleton) {
    try {
      singleton.destroy()
    } catch {
      // ignore
    }
    singleton = null
  }
}

export function startMarketingPreviewTour(fromStep = 0): void {
  const d = getOrCreatePreviewTourDriver()
  d.drive(fromStep)
}

export function subscribePreviewTourStart(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {}
  const fn = () => handler()
  window.addEventListener(START_TOUR_EVENT, fn)
  return () => window.removeEventListener(START_TOUR_EVENT, fn)
}
