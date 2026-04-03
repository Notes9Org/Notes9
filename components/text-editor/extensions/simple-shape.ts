import { Node, mergeAttributes } from "@tiptap/core"

export type SimpleShapeVariant = "rectangle" | "ellipse" | "line"

export const SimpleShape = Node.create({
  name: "simpleShape",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      variant: {
        default: "rectangle" as SimpleShapeVariant,
        parseHTML: (el) => (el.getAttribute("data-variant") as SimpleShapeVariant) || "rectangle",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
      width: {
        default: 200,
        parseHTML: (el) => parseInt(el.getAttribute("data-width") || "200", 10),
        renderHTML: (attrs) => ({ "data-width": String(attrs.width) }),
      },
      height: {
        default: 100,
        parseHTML: (el) => parseInt(el.getAttribute("data-height") || "100", 10),
        renderHTML: (attrs) => ({ "data-height": String(attrs.height) }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="simple-shape"]' }]
  },

  renderHTML({ node }) {
    const variant = node.attrs.variant as SimpleShapeVariant
    const w = Math.max(40, Number(node.attrs.width) || 200)
    const h = Math.max(40, Number(node.attrs.height) || 100)

    let inner: [string, Record<string, string | number>, ...unknown[]]
    if (variant === "ellipse") {
      inner = [
        "ellipse",
        {
          cx: w / 2,
          cy: h / 2,
          rx: w / 2 - 2,
          ry: h / 2 - 2,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 2,
        },
      ]
    } else if (variant === "line") {
      inner = [
        "line",
        {
          x1: 4,
          y1: h - 4,
          x2: w - 4,
          y2: 4,
          stroke: "currentColor",
          "stroke-width": 2,
        },
      ]
    } else {
      inner = [
        "rect",
        {
          x: 2,
          y: 2,
          width: w - 4,
          height: h - 4,
          fill: "none",
          stroke: "currentColor",
          "stroke-width": 2,
          rx: 4,
        },
      ]
    }

    return [
      "div",
      mergeAttributes({
        "data-type": "simple-shape",
        class: "simple-shape-node flex justify-center my-3 text-foreground",
      }),
      [
        "svg",
        {
          xmlns: "http://www.w3.org/2000/svg",
          width: w,
          height: h,
          viewBox: `0 0 ${w} ${h}`,
          "aria-hidden": "true",
        },
        inner,
      ],
    ]
  },
})
