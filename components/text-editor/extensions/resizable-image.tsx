"use client"

import { useCallback, useRef } from "react"
import Image from "@tiptap/extension-image"
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react"
import {
  MessageSquare,
  AlignLeft,
  AlignCenter,
  AlignRight,
  WrapText,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type ImageAlign = "left" | "center" | "right"
/** "none" keeps the image as a centered/aligned block; left/right floats it so text wraps. */
export type ImageFloat = "none" | "left" | "right"
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
      setImageFloat: (float: ImageFloat) => ReturnType
      setImageWidth: (width: number) => ReturnType
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
  const floatSide = (node.attrs.floatSide as ImageFloat) || "none"
  const floated = floatSide === "left" || floatSide === "right"
  const hasComment = Boolean(node.attrs.commentId && node.attrs.commentContent)

  const applyWidthFraction = useCallback(
    (fraction: number) => {
      const maxWidth = Math.max(120, editor.view.dom.clientWidth - 48)
      updateAttributes({ width: Math.round(maxWidth * fraction) })
    },
    [editor.view.dom.clientWidth, updateAttributes],
  )

  const toolbarBtn =
    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"

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
        "resizable-image",
        floated ? "my-2" : "my-4 flex w-full",
        !floated && align === "left" && "justify-start",
        !floated && align === "right" && "justify-end",
        !floated && align === "center" && "justify-center",
      )}
      data-align={align}
      data-float={floatSide}
      style={
        floated
          ? {
              float: floatSide,
              maxWidth: "60%",
              marginRight: floatSide === "left" ? "1rem" : undefined,
              marginLeft: floatSide === "right" ? "1rem" : undefined,
            }
          : undefined
      }
    >
      <div className="relative inline-block max-w-full">
        {selected && editor.isEditable ? (
          <div
            contentEditable={false}
            className="absolute -top-11 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border border-border bg-popover/95 p-1 shadow-md backdrop-blur-sm"
          >
            <button type="button" title="Align left" data-active={!floated && align === "left"} className={toolbarBtn}
              onMouseDown={(e) => { e.preventDefault(); updateAttributes({ floatSide: "none", align: "left" }) }}>
              <AlignLeft className="h-4 w-4" />
            </button>
            <button type="button" title="Align center" data-active={!floated && align === "center"} className={toolbarBtn}
              onMouseDown={(e) => { e.preventDefault(); updateAttributes({ floatSide: "none", align: "center" }) }}>
              <AlignCenter className="h-4 w-4" />
            </button>
            <button type="button" title="Align right" data-active={!floated && align === "right"} className={toolbarBtn}
              onMouseDown={(e) => { e.preventDefault(); updateAttributes({ floatSide: "none", align: "right" }) }}>
              <AlignRight className="h-4 w-4" />
            </button>
            <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            <button type="button" title="Wrap text left" data-active={floatSide === "left"} className={toolbarBtn}
              onMouseDown={(e) => { e.preventDefault(); updateAttributes({ floatSide: "left" }) }}>
              <WrapText className="h-4 w-4" />
            </button>
            <button type="button" title="Wrap text right" data-active={floatSide === "right"} className={toolbarBtn}
              onMouseDown={(e) => { e.preventDefault(); updateAttributes({ floatSide: "right" }) }}>
              <WrapText className="h-4 w-4 -scale-x-100" />
            </button>
            <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            <button type="button" title="Small (25%)" className={cn(toolbarBtn, "w-auto px-1.5 text-xs font-semibold")}
              onMouseDown={(e) => { e.preventDefault(); applyWidthFraction(0.25) }}>S</button>
            <button type="button" title="Medium (50%)" className={cn(toolbarBtn, "w-auto px-1.5 text-xs font-semibold")}
              onMouseDown={(e) => { e.preventDefault(); applyWidthFraction(0.5) }}>M</button>
            <button type="button" title="Large (100%)" className={cn(toolbarBtn, "w-auto px-1.5 text-xs font-semibold")}
              onMouseDown={(e) => { e.preventDefault(); applyWidthFraction(1) }}>L</button>
            <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
            <button type="button" title="Delete image" className={cn(toolbarBtn, "hover:bg-destructive/10 hover:text-destructive")}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().deleteSelection().run() }}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
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
      floatSide: {
        default: "none" as ImageFloat,
        parseHTML: (element) => {
          const el = element as HTMLElement
          const fromData = (el.getAttribute("data-float") ??
            el.parentElement?.getAttribute("data-float")) as ImageFloat | null
          return fromData === "left" || fromData === "right" ? fromData : "none"
        },
        renderHTML: (attributes) => ({
          "data-float": (attributes.floatSide as ImageFloat) ?? "none",
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
    const floatSide = (HTMLAttributes["data-float"] as ImageFloat) || "none"
    const { "data-align": _dropAlign, "data-float": _dropFloat, ...imgAttrs } = HTMLAttributes
    // Inline styles so alignment/float survive export (PDF/HTML/Word) without
    // the editor stylesheet. Float wins; otherwise centre/left/right via text-align.
    const hostStyle =
      floatSide === "left"
        ? "float:left;max-width:60%;margin:0 1rem 0.5rem 0;"
        : floatSide === "right"
          ? "float:right;max-width:60%;margin:0 0 0.5rem 1rem;"
          : align === "center"
            ? "text-align:center;"
            : align === "right"
              ? "text-align:right;"
              : "text-align:left;"
    return [
      "div",
      {
        "data-type": "resizable-image",
        "data-align": align,
        "data-float": floatSide,
        class: `resizable-image-host resizable-image-host--${align}`,
        style: hostStyle,
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
          commands.updateAttributes(this.name, { align, floatSide: "none" }),
      setImageFloat:
        (float: ImageFloat) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { floatSide: float }),
      setImageWidth:
        (imgWidth: number) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { width: Math.max(40, Math.round(imgWidth)) }),
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
