import { Extension } from "@tiptap/core"
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"

/**
 * Block drag handle — a Notion/Word-style grip that appears in the left gutter
 * when hovering a top-level block (paragraph, heading, table, image, list,
 * equation…) and lets the user drag the whole block to a new position.
 *
 * This is the single mechanism behind "move table position" and "move image
 * position" from the bug report: grab the handle, drag, drop. It works by
 * selecting the hovered block as a NodeSelection and handing ProseMirror's own
 * drop machinery a moving slice (`view.dragging = { slice, move: true }`), so
 * the drop position and document transaction are computed by ProseMirror.
 */

const blockDragHandleKey = new PluginKey("blockDragHandle")

const HANDLE_GAP = 6 // px between the handle and the block's left edge

function gripSvg(): string {
  // 6-dot grip, matching lucide's GripVertical visual language.
  return (
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/>' +
    '<circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>' +
    "</svg>"
  )
}

/** Walk up from an arbitrary DOM node to the direct child of the editor root. */
function topLevelBlockEl(view: EditorView, target: Node | null): HTMLElement | null {
  let el = target instanceof HTMLElement ? target : target?.parentElement ?? null
  while (el && el.parentElement && el.parentElement !== view.dom) {
    el = el.parentElement
  }
  return el && el.parentElement === view.dom ? el : null
}

export const BlockDragHandle = Extension.create({
  name: "blockDragHandle",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockDragHandleKey,
        view(view) {
          const handle = document.createElement("div")
          handle.className = "n9-block-drag-handle"
          handle.draggable = true
          handle.setAttribute("contenteditable", "false")
          handle.setAttribute("role", "button")
          handle.setAttribute("aria-label", "Drag to move block")
          handle.title = "Drag to move"
          handle.innerHTML = gripSvg()
          handle.style.display = "none"
          document.body.appendChild(handle)

          // Start position (in the doc) of the block the handle currently targets.
          let hoveredPos: number | null = null

          const hide = () => {
            handle.style.display = "none"
            hoveredPos = null
          }

          // Leaving the editor hides the handle — unless the pointer is moving
          // onto the handle itself (otherwise you could never grab it).
          const onEditorLeave = (event: MouseEvent) => {
            if (event.relatedTarget === handle) return
            hide()
          }

          const positionFor = (blockEl: HTMLElement) => {
            const rect = blockEl.getBoundingClientRect()
            const handleRect = handle.getBoundingClientRect()
            const h = handleRect.height || 22
            handle.style.display = "flex"
            handle.style.left = `${rect.left - handle.offsetWidth - HANDLE_GAP}px`
            // Align to the first line of the block, not its vertical centre.
            handle.style.top = `${rect.top + Math.min(6, Math.max(0, (rect.height - h) / 2))}px`
          }

          const onMouseMove = (event: MouseEvent) => {
            if (!view.editable) return
            const blockEl = topLevelBlockEl(view, event.target as Node)
            if (!blockEl) {
              if (event.target !== handle) hide()
              return
            }
            try {
              const pos = view.posAtDOM(blockEl, 0)
              const $pos = view.state.doc.resolve(pos)
              hoveredPos = $pos.depth >= 1 ? $pos.before(1) : pos
              positionFor(blockEl)
            } catch {
              hide()
            }
          }

          const onDragStart = (event: DragEvent) => {
            if (hoveredPos == null || !event.dataTransfer) return
            const { state } = view
            const node = state.doc.nodeAt(hoveredPos)
            if (!node) return
            // Select the whole block, then hand ProseMirror a moving slice.
            const selection = NodeSelection.create(state.doc, hoveredPos)
            view.dispatch(state.tr.setSelection(selection))
            const slice = view.state.selection.content()
            event.dataTransfer.effectAllowed = "move"
            event.dataTransfer.clearData()
            // A non-empty payload is required for the drag to start in some browsers.
            event.dataTransfer.setData("text/plain", node.textContent ?? " ")
            const dom = view.nodeDOM(hoveredPos)
            if (dom instanceof HTMLElement) {
              event.dataTransfer.setDragImage(dom, 0, 0)
            }
            ;(view as unknown as { dragging: { slice: typeof slice; move: boolean } }).dragging = {
              slice,
              move: true,
            }
            handle.classList.add("is-dragging")
          }

          const onDragEnd = () => {
            handle.classList.remove("is-dragging")
            hide()
          }

          handle.addEventListener("dragstart", onDragStart)
          handle.addEventListener("dragend", onDragEnd)
          view.dom.addEventListener("mousemove", onMouseMove)
          view.dom.addEventListener("mouseleave", onEditorLeave)
          const onScroll = () => hide()
          window.addEventListener("scroll", onScroll, true)

          return {
            destroy() {
              handle.removeEventListener("dragstart", onDragStart)
              handle.removeEventListener("dragend", onDragEnd)
              view.dom.removeEventListener("mousemove", onMouseMove)
              view.dom.removeEventListener("mouseleave", onEditorLeave)
              window.removeEventListener("scroll", onScroll, true)
              handle.remove()
            },
          }
        },
      }),
    ]
  },
})

export default BlockDragHandle
