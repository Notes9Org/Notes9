"use client"

import { useCallback, useRef } from "react"
import Image from "@tiptap/extension-image"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"
import { MessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"

export type ImageAlign = "left" | "center" | "right"
type ResizeCorner = "nw" | "ne" | "sw" | "se"

export type ImageCommentAttrs = {
  commentId: string | null
  commentAuthor: string | null
  commentContent: string | null
  commentCreatedAt: number | null
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    resizableImage: {
      setImageAlign: (align: ImageAlign) => ReturnType
      setImageComment: (attrs: {
        author: string
        content: string
        id?: string
        createdAt?: number
      }) => ReturnType
      clearImageComment: () => ReturnType
      deleteImageCommentById: (id: string) => ReturnType
    }
  }
}

const RESIZE_HANDLES: { corner: ResizeCorner; className: string }[] = [
  { corner: "nw", className: "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize" },
  { corner: "ne", className: "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-ne-resize" },
  { corner: "sw", className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-sw-resize" },
  { corner: "se", className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-se-resize" },
]

const COMMENT_ATTR_DEFAULTS: ImageCommentAttrs = {
  commentId: null,
  commentAuthor: null,
  commentContent: null,
  commentCreatedAt: null,
}

function parseWidth(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number.parseInt(String(value).replace(/px$/, ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function commentAttrField(
  name: keyof ImageCommentAttrs,
  dataName: string,
) {
  return {
    default: COMMENT_ATTR_DEFAULTS[name],
    parseHTML: (element: HTMLElement) => {
      const el = element as HTMLElement
      const fromImg = el.getAttribute(dataName)
      if (fromImg != null && fromImg !== "") {
        if (name === "commentCreatedAt") {
          const n = Number(fromImg)
          return Number.isFinite(n) ? n : null
        }
        return fromImg
      }
      const parent = el.parentElement
      const fromParent = parent?.getAttribute(dataName)
      if (fromParent == null || fromParent === "") return COMMENT_ATTR_DEFAULTS[name]
      if (name === "commentCreatedAt") {
        const n = Number(fromParent)
        return Number.isFinite(n) ? n : null
      }
      return fromParent
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = attributes[name]
      if (value == null || value === "") return {}
      return { [dataName]: String(value) }
    },
  }
}

function ResizableImageView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const width = typeof node.attrs.width === "number" ? node.attrs.width : null
  const align = (node.attrs.align as ImageAlign) || "center"
  const hasComment = Boolean(node.attrs.commentId && node.attrs.commentContent)

  const onResizeStart = useCallback(
    (corner: ResizeCorner) => (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const img = imgRef.current
      if (!img) return

      const startX = event.clientX
      const startY = event.clientY
      const startWidth = img.offsetWidth
      const maxWidth = Math.max(120, editor.view.dom.clientWidth - 48)
      const growsFromLeft = corner === "nw" || corner === "sw"
      const growsFromTop = corner === "nw" || corner === "ne"

      const onMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX
        const deltaY = moveEvent.clientY - startY
        const horizontalDelta = growsFromLeft ? -deltaX : deltaX
        const verticalDelta = growsFromTop ? -deltaY : deltaY
        const delta = Math.abs(horizontalDelta) > Math.abs(verticalDelta) ? horizontalDelta : verticalDelta
        const next = Math.round(Math.min(maxWidth, Math.max(80, startWidth + delta)))
        updateAttributes({ width: next })
      }

      const onUp = () => {
        document.removeEventListener("mousemove", onMove)
        document.removeEventListener("mouseup", onUp)
        document.body.style.removeProperty("cursor")
        document.body.style.removeProperty("user-select")
      }

      document.body.style.cursor = getComputedStyle(event.currentTarget as Element).cursor
      document.body.style.userSelect = "none"
      document.addEventListener("mousemove", onMove)
      document.addEventListener("mouseup", onUp)
    },
    [editor.view.dom.clientWidth, updateAttributes],
  )

  const onImageLoad = useCallback(() => {
    if (width != null) return
    const img = imgRef.current
    if (!img?.naturalWidth) return
    const maxWidth = Math.max(120, editor.view.dom.clientWidth - 48)
    const next = Math.min(img.naturalWidth, maxWidth)
    updateAttributes({ width: next })
  }, [editor.view.dom.clientWidth, updateAttributes, width])

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        "resizable-image my-4 flex w-full",
        align === "left" && "justify-start",
        align === "right" && "justify-end",
        align === "center" && "justify-center",
      )}
      data-align={align}
    >
      <div className="relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={node.attrs.src}
          alt={node.attrs.alt ?? ""}
          draggable={false}
          onLoad={onImageLoad}
          className={cn(
            "block h-auto max-w-full rounded-lg",
            selected && "resizable-image__img--selected",
            hasComment && "ring-2 ring-amber-400/70 ring-offset-2 ring-offset-background",
          )}
          data-image-comment={hasComment ? "" : undefined}
          data-id={node.attrs.commentId ?? undefined}
          data-author={node.attrs.commentAuthor ?? undefined}
          data-content={node.attrs.commentContent ?? undefined}
          data-created-at={
            node.attrs.commentCreatedAt != null
              ? String(node.attrs.commentCreatedAt)
              : undefined
          }
          style={{
            width: width != null ? `${width}px` : undefined,
            height: "auto",
          }}
        />
        {hasComment ? (
          <span
            className="pointer-events-none absolute top-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm"
            aria-hidden
          >
            <MessageSquare className="size-3" />
          </span>
        ) : null}
        {selected
          ? RESIZE_HANDLES.map(({ corner, className }) => (
              <span
                key={corner}
                role="presentation"
                aria-hidden
                onMouseDown={onResizeStart(corner)}
                className={cn(
                  "absolute z-10 size-2.5 rounded-full border border-background bg-primary shadow-sm",
                  className,
                )}
              />
            ))
          : null}
      </div>
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as number | null,
        parseHTML: (element) => {
          const el = element as HTMLElement
          return (
            parseWidth(el.getAttribute("width")) ??
            parseWidth(el.style.width) ??
            null
          )
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return {
            width: attributes.width,
            style: `width: ${attributes.width}px; height: auto; max-width: 100%;`,
          }
        },
      },
      align: {
        default: "center" as ImageAlign,
        parseHTML: (element) => {
          const el = element as HTMLElement
          const fromData = el.getAttribute("data-align") as ImageAlign | null
          if (fromData === "left" || fromData === "center" || fromData === "right") {
            return fromData
          }
          const parent = el.parentElement
          const parentAlign = parent?.getAttribute("data-align") as ImageAlign | null
          if (
            parentAlign === "left" ||
            parentAlign === "center" ||
            parentAlign === "right"
          ) {
            return parentAlign
          }
          return "center"
        },
        renderHTML: (attributes) => ({
          "data-align": attributes.align ?? "center",
        }),
      },
      commentId: commentAttrField("commentId", "data-comment-id"),
      commentAuthor: commentAttrField("commentAuthor", "data-comment-author"),
      commentContent: commentAttrField("commentContent", "data-comment-content"),
      commentCreatedAt: commentAttrField("commentCreatedAt", "data-comment-created-at"),
    }
  },

  parseHTML() {
    return [
      {
        tag: "img[src]",
      },
      {
        tag: 'div[data-type="resizable-image"] img',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const align = (HTMLAttributes["data-align"] as ImageAlign) || "center"
    const { "data-align": _drop, ...imgAttrs } = HTMLAttributes
    return [
      "div",
      {
        "data-type": "resizable-image",
        "data-align": align,
        class: `resizable-image-host resizable-image-host--${align}`,
      },
      ["img", imgAttrs],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setImageAlign:
        (align: ImageAlign) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { align }),
      setImageComment:
        ({ author, content, id, createdAt }) =>
        ({ commands }) => {
          const commentId = id ?? `comment-${Date.now()}-${Math.floor(Math.random() * 1000)}`
          return commands.updateAttributes(this.name, {
            commentId,
            commentAuthor: author,
            commentContent: content,
            commentCreatedAt: createdAt ?? Date.now(),
          })
        },
      clearImageComment:
        () =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { ...COMMENT_ATTR_DEFAULTS }),
      deleteImageCommentById:
        (commentId: string) =>
        ({ tr, state, dispatch }) => {
          const { doc } = state
          let changed = false
          doc.descendants((node, pos) => {
            if (node.type.name === this.name && node.attrs.commentId === commentId) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                ...COMMENT_ATTR_DEFAULTS,
              })
              changed = true
            }
          })
          if (changed && dispatch) {
            dispatch(tr)
            return true
          }
          return changed
        },
    }
  },
})
