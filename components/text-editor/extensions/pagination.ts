import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import type { EditorView } from "@tiptap/pm/view"

export type PaginationParams = {
  /** Pagination only runs when this is true (i.e. Page view is on). */
  enabled: boolean
  /** Usable content height per page in px (page height − top/bottom margins). */
  pageContentHeightPx: number
  /** Visual gap drawn between consecutive pages (≈ bottom + top margins + sheet edge). */
  gapPx: number
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
            const headerEl = view.dom.querySelector(".n9-doc-header") as HTMLElement | null
            const footerEl = view.dom.querySelector(".n9-doc-footer") as HTMLElement | null
            const headerHtml = headerEl?.innerHTML ?? ""
            const footerHtml = footerEl?.innerHTML ?? ""

            const breaks: { pos: number; fill: number }[] = []
            let used = 0
            view.state.doc.forEach((node, offset) => {
              const dom = view.nodeDOM(offset) as HTMLElement | null
              if (!dom || dom.nodeType !== 1 || typeof dom.getBoundingClientRect !== "function") {
                return
              }
              const cs = window.getComputedStyle(dom)
              const mt = parseFloat(cs.marginTop) || 0
              const mb = parseFloat(cs.marginBottom) || 0
              const h = dom.getBoundingClientRect().height + mt + mb
              if (used > 0 && used + h > H) {
                breaks.push({ pos: offset, fill: Math.max(0, Math.round(H - used)) })
                used = h // next page begins with this block
              } else {
                used += h
              }
            })

            const sig = `${H}|${params.gapPx}|${headerHtml.length}|${footerHtml.length}|` +
              breaks.map((b) => `${b.pos}:${b.fill}`).join(",")
            if (sig === lastSig) return
            lastSig = sig

            const decos = breaks.map((b) =>
              Decoration.widget(b.pos, () => buildSeparator(b.fill, params.gapPx, headerHtml, footerHtml), {
                side: -1,
                key: `n9-pb-${b.pos}-${b.fill}-${headerHtml.length}-${footerHtml.length}`,
                ignoreSelection: true,
              }),
            )
            view.dispatch(
              view.state.tr
                .setMeta(paginationKey, DecorationSet.create(view.state.doc, decos))
                .setMeta("addToHistory", false),
            )
          }

          const schedule = (v?: EditorView) => {
            void v
            if (raf) return
            raf = requestAnimationFrame(compute)
          }

          schedule()
          const onResize = () => schedule()
          window.addEventListener("resize", onResize)

          return {
            update: () => schedule(),
            destroy() {
              window.removeEventListener("resize", onResize)
              if (raf) cancelAnimationFrame(raf)
            },
          }
        },
      }),
    ]
  },
})

function buildSeparator(fillPx: number, gapPx: number, headerHtml: string, footerHtml: string): HTMLElement {
  const wrap = document.createElement("div")
  wrap.className = "n9-page-sep"
  wrap.setAttribute("contenteditable", "false")

  // Footer pinned to the bottom of the page just before the break.
  if (footerHtml) {
    const footer = document.createElement("div")
    footer.className = "n9-page-sep-footer n9-doc-footer"
    footer.style.marginTop = `${Math.max(0, fillPx - 28)}px`
    footer.innerHTML = footerHtml
    wrap.appendChild(footer)
  } else {
    const spacer = document.createElement("div")
    spacer.style.height = `${fillPx}px`
    wrap.appendChild(spacer)
  }

  // Inter-page gap (the dark edge between two sheets).
  const gap = document.createElement("div")
  gap.className = "n9-page-sep-gap"
  gap.style.height = `${gapPx}px`
  wrap.appendChild(gap)

  // Header repeated at the top of the next page.
  if (headerHtml) {
    const header = document.createElement("div")
    header.className = "n9-page-sep-header n9-doc-header"
    header.innerHTML = headerHtml
    wrap.appendChild(header)
  }

  return wrap
}

export default Pagination
