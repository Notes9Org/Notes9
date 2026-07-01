import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { EditorView } from "@tiptap/pm/view"

export type PaginationParams = {
  /** Pagination only runs when this is true (i.e. Page view is on). */
  enabled: boolean
  /** Usable content height per page in px (page height − top/bottom margins). */
  pageContentHeightPx: number
  /** Backdrop gap drawn between two sheets. */
  gapPx: number
  /** Top margin px — header zone of the next page. */
  marginTopPx: number
  /** Bottom margin px — footer zone of the finishing page. */
  marginBottomPx: number
  /** Callback when pagination computes new page breaks, providing DOM targets for portals. */
  onPortalsChange?: (portals: Array<{el: HTMLElement, page: number, type: 'header' | 'footer'}>) => void
}

export type PaginationOptions = {
  getParams: () => PaginationParams | null
}

const paginationKey = new PluginKey<DecorationSet>("n9Pagination")

/**
 * Decoration-based pagination. Measures each top-level block, works out where
 * page boundaries fall, and inserts a widget decoration at each boundary that
 * (a) fills the remaining space of the current page, (b) draws a page gap, and
 * (c) repeats the document header/footer so they appear on every page.
 *
 * Heights are measured from the DOM but the widgets are inserted *between*
 * blocks, so a block's own height never changes — measurements stay stable and
 * a signature check prevents the measure→decorate→measure loop.
 *
 * Only runs while Page view is enabled, so normal editing is never affected.
 */
export const Pagination = Extension.create<PaginationOptions>({
  name: "n9Pagination",

  addOptions() {
    return { getParams: () => null }
  },

  addProseMirrorPlugins() {
    const getParams = () => this.options.getParams()
    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const next = tr.getMeta(paginationKey)
            if (next) return next as DecorationSet
            return old.map(tr.mapping, tr.doc)
          },
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state)
          },
        },
        view(view) {
          let raf = 0
          let lastSig = ""

          const clear = () => {
            if (lastSig === "") return
            lastSig = ""
            view.dispatch(
              view.state.tr.setMeta(paginationKey, DecorationSet.empty).setMeta("addToHistory", false),
            )
          }

          const compute = () => {
            raf = 0
            const params = getParams()
            if (!params || !params.enabled || params.pageContentHeightPx <= 40) {
              clear()
              return
            }
            const H = params.pageContentHeightPx
            const headerHtml = ""
            const footerHtml = ""

            const breaks: { pos: number; fill: number; nextMt: number }[] = []
            let used = 0
            let lastMb = 0
            view.state.doc.forEach((node, offset) => {
              // Header/footer live in the page margins, not the content flow.
              if (node.type.name === "docHeader" || node.type.name === "docFooter") return
              const dom = view.nodeDOM(offset) as HTMLElement | null
              if (!dom || dom.nodeType !== 1 || typeof dom.getBoundingClientRect !== "function") {
                return
              }
              const cs = window.getComputedStyle(dom)
              const mt = parseFloat(cs.marginTop) || 0
              const mb = parseFloat(cs.marginBottom) || 0
              
              const marginOverlap = Math.min(lastMb, mt)
              const h = dom.getBoundingClientRect().height + mt + mb - marginOverlap

              if (used > 0 && used + h > H) {
                breaks.push({ pos: offset, fill: Math.max(0, Math.round(H - used)), nextMt: mt })
                used = h // next page begins with this block, so no overlap to subtract from it
              } else {
                used += h
              }
              lastMb = mb
            })

            const sig = `${H}|${params.gapPx}|${breaks.length}|` +
              breaks.map((b) => `${b.pos}:${b.fill}:${b.nextMt}`).join(",")
            if (sig === lastSig) return
            lastSig = sig

            const newPortals: Array<{el: HTMLElement, page: number, type: 'header' | 'footer'}> = []

            const decos = breaks.map((b, i) => {
              const { wrap, headerTarget, footerTarget } = buildSeparator(b, params)
              const pageNumber = i + 2 // Page 1 is the main document, break 0 starts page 2
              
              if (headerTarget) newPortals.push({ el: headerTarget, page: pageNumber, type: 'header' })
              if (footerTarget) newPortals.push({ el: footerTarget, page: pageNumber - 1, type: 'footer' })
              
              return Decoration.widget(b.pos, () => wrap, {
                side: -1,
                key: `n9-pb-${b.pos}-${b.fill}`,
                ignoreSelection: true,
              })
            })

            view.dispatch(
              view.state.tr
                .setMeta(paginationKey, DecorationSet.create(view.state.doc, decos))
                .setMeta("addToHistory", false),
            )

            // Notify React of the new portal targets
            if (params.onPortalsChange) {
              params.onPortalsChange(newPortals)
            }
          }

          const schedule = (v?: EditorView) => {
            void v
            if (raf) return
            raf = requestAnimationFrame(compute)
          }

          schedule()
          const onResize = () => schedule()
          window.addEventListener("resize", onResize)

          // Recompute when the editor's own DOM changes size. This is what makes
          // pagination appear on first paint: the content renders asynchronously
          // (immediatelyRender: false), so the editor grows AFTER the plugin's
          // initial pass — the observer catches that growth and re-runs compute().
          // The signature check in compute() stops the decorate→resize→decorate
          // feedback loop once breaks are stable.
          let ro: ResizeObserver | null = null
          if (typeof ResizeObserver !== "undefined") {
            ro = new ResizeObserver(() => schedule())
            ro.observe(view.dom)
          }
          // A couple of deferred passes cover late layout (web fonts, images)
          // that can land between the observer's first fire and final metrics.
          const t1 = setTimeout(schedule, 60)
          const t2 = setTimeout(schedule, 250)

          return {
            update: () => schedule(),
            destroy() {
              window.removeEventListener("resize", onResize)
              ro?.disconnect()
              clearTimeout(t1)
              clearTimeout(t2)
              if (raf) cancelAnimationFrame(raf)
            },
          }
        },
      }),
    ]
  },
})

function buildSeparator(
  b: { fill: number; nextMt: number },
  params: PaginationParams,
): { wrap: HTMLElement; headerTarget: HTMLElement; footerTarget: HTMLElement } {
  const wrap = document.createElement("div")
  wrap.className = "n9-page-sep"
  
  // 1) Fill the rest of the finishing page's content area.
  const fill = document.createElement("div")
  fill.style.height = `${b.fill}px`
  wrap.appendChild(fill)

  // 2) Bottom-margin zone of the finishing page — holds the footer.
  const footerZone = document.createElement("div")
  footerZone.className = "n9-page-sep-marginzone n9-page-sep-footerzone relative w-full"
  footerZone.style.height = `${params.marginBottomPx}px`
  
  const footerTarget = document.createElement("div")
  footerTarget.className = "absolute inset-0"
  footerTarget.addEventListener("mousedown", e => e.stopPropagation())
  footerTarget.addEventListener("keydown", e => e.stopPropagation())
  footerZone.appendChild(footerTarget)
  
  wrap.appendChild(footerZone)

  // 3) Backdrop gap between the two sheets (shows each page's end).
  const gap = document.createElement("div")
  gap.className = "n9-page-sep-gap"
  gap.style.height = `${params.gapPx}px`
  wrap.appendChild(gap)

  // 4) Top-margin zone of the next page — holds the repeated header.
  const headerZone = document.createElement("div")
  headerZone.className = "n9-page-sep-marginzone n9-page-sep-headerzone relative w-full"
  headerZone.style.height = `${params.marginTopPx}px`
  // Absorb the next block's margin-top so the text perfectly aligns with the ruler!
  if (b.nextMt > 0) {
    headerZone.style.marginBottom = `-${b.nextMt}px`
  }
  
  const headerTarget = document.createElement("div")
  headerTarget.className = "absolute inset-0"
  headerTarget.addEventListener("mousedown", e => e.stopPropagation())
  headerTarget.addEventListener("keydown", e => e.stopPropagation())
  headerZone.appendChild(headerTarget)
  
  wrap.appendChild(headerZone)

  return { wrap, headerTarget, footerTarget }
}

export default Pagination
