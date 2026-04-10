/** Single pickable font stack for the Tiptap font-family menu. */
export interface FontMenuVariant {
  label: string
  /** Pass to setFontFamily; empty string = unset (inherit). */
  value: string
}

/** Named typeface with one or more CSS stacks (sub-families / related faces). */
export interface FontMenuFamily {
  id: string
  label: string
  variants: FontMenuVariant[]
}

export interface FontMenuGroup {
  id: string
  /** Category heading in the “more typefaces” list */
  label: string
  families: FontMenuFamily[]
}

/** Default font shown in the toolbar when the document uses body/inherit styling. */
export const DEFAULT_TEXT_STYLE_FONT_STACK = "Calibri, 'Segoe UI', sans-serif"
export const DEFAULT_TEXT_STYLE_FONT_LABEL = "Calibri"

/** Common system / office fonts at the top of the Text menu. */
export const FONT_QUICK_VARIANTS: FontMenuVariant[] = [
  { label: "Default (inherit)", value: "" },
  { label: "Calibri", value: "Calibri, 'Segoe UI', sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Comic Sans MS", value: "'Comic Sans MS', 'Comic Sans', cursive" },
]

export const FONT_MENU_GROUPS: FontMenuGroup[] = [
  {
    id: "sans",
    label: "Sans serif",
    families: [
      {
        id: "arial-helvetica",
        label: "Arial & Helvetica",
        variants: [
          { label: "Arial Black", value: "'Arial Black', Gadget, sans-serif" },
          { label: "Arial Narrow", value: "'Arial Narrow', Arial, sans-serif" },
          { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
          { label: "Helvetica Neue", value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
        ],
      },
      {
        id: "humanist-ui",
        label: "Verdana & Tahoma",
        variants: [
          { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
          { label: "Tahoma", value: "Tahoma, Geneva, Verdana, sans-serif" },
          { label: "Trebuchet MS", value: "'Trebuchet MS', Helvetica, sans-serif" },
        ],
      },
      {
        id: "lucida",
        label: "Lucida",
        variants: [
          { label: "Lucida Sans Unicode", value: "'Lucida Sans Unicode', 'Lucida Grande', sans-serif" },
          { label: "Lucida Grande", value: "'Lucida Grande', 'Lucida Sans Unicode', sans-serif" },
        ],
      },
      {
        id: "microsoft-office",
        label: "Segoe & Office sans",
        variants: [
          { label: "Candara", value: "Candara, Verdana, sans-serif" },
          { label: "Corbel", value: "Corbel, Verdana, sans-serif" },
          { label: "Segoe UI", value: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif" },
          { label: "Segoe UI Light", value: "'Segoe UI Light', 'Segoe UI', Tahoma, sans-serif" },
          { label: "Segoe UI Semibold", value: "'Segoe UI Semibold', 'Segoe UI', Tahoma, sans-serif" },
        ],
      },
      {
        id: "grotesque-display-sans",
        label: "Grotesque & display sans",
        variants: [
          { label: "Century Gothic", value: "'Century Gothic', CenturyGothic, AppleGothic, sans-serif" },
          {
            label: "Franklin Gothic Medium",
            value: "'Franklin Gothic Medium', 'Franklin Gothic', Arial, sans-serif",
          },
          { label: "Gill Sans", value: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
          { label: "Impact", value: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif" },
          { label: "Optima", value: "Optima, 'Segoe UI', Candara, sans-serif" },
          { label: "Futura", value: "Futura, 'Trebuchet MS', Arial, sans-serif" },
        ],
      },
      {
        id: "inter-ibm-sans",
        label: "Inter & IBM Plex Sans",
        variants: [
          { label: "Inter", value: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif" },
          { label: "IBM Plex Sans", value: "'IBM Plex Sans', 'Segoe UI', sans-serif" },
        ],
      },
      {
        id: "roboto",
        label: "Roboto",
        variants: [
          { label: "Roboto", value: "Roboto, 'Helvetica Neue', Arial, sans-serif" },
          {
            label: "Roboto Condensed",
            value: "'Roboto Condensed', Roboto, 'Helvetica Neue', Arial, sans-serif",
          },
        ],
      },
      {
        id: "open-lato-source",
        label: "Open Sans, Lato & Source",
        variants: [
          { label: "Open Sans", value: "'Open Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif" },
          { label: "Lato", value: "Lato, 'Helvetica Neue', Helvetica, Arial, sans-serif" },
          { label: "Source Sans 3", value: "'Source Sans 3', 'Source Sans Pro', 'Segoe UI', sans-serif" },
        ],
      },
      {
        id: "noto-ubuntu-fira",
        label: "Noto, Ubuntu & Fira",
        variants: [
          { label: "Noto Sans", value: "'Noto Sans', 'Helvetica Neue', Arial, sans-serif" },
          { label: "Ubuntu", value: "Ubuntu, Cantarell, 'Segoe UI', sans-serif" },
          { label: "Fira Sans", value: "'Fira Sans', 'Segoe UI', sans-serif" },
        ],
      },
      {
        id: "geometric-web",
        label: "Montserrat, Nunito & co.",
        variants: [
          { label: "Montserrat", value: "Montserrat, 'Segoe UI', sans-serif" },
          { label: "Nunito", value: "Nunito, 'Segoe UI', sans-serif" },
          { label: "PT Sans", value: "'PT Sans', 'Segoe UI', sans-serif" },
          { label: "Raleway", value: "Raleway, 'Segoe UI', sans-serif" },
          { label: "Rubik", value: "Rubik, 'Segoe UI', sans-serif" },
        ],
      },
    ],
  },
  {
    id: "serif",
    label: "Serif",
    families: [
      {
        id: "times",
        label: "Times",
        variants: [{ label: "Times", value: "Times, 'Times New Roman', serif" }],
      },
      {
        id: "georgia-cambria",
        label: "Georgia & Cambria",
        variants: [
          { label: "Georgia", value: "Georgia, 'Times New Roman', Times, serif" },
          { label: "Cambria", value: "Cambria, Georgia, serif" },
          { label: "Constantia", value: "Constantia, Cambria, Georgia, serif" },
        ],
      },
      {
        id: "palatino",
        label: "Palatino",
        variants: [
          { label: "Palatino Linotype", value: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
          { label: "Palatino", value: "Palatino, 'Palatino Linotype', serif" },
          { label: "Book Antiqua", value: "'Book Antiqua', Palatino, serif" },
        ],
      },
      {
        id: "literary-serif",
        label: "Literary serif",
        variants: [
          { label: "Garamond", value: "Garamond, 'Times New Roman', serif" },
          { label: "Baskerville", value: "Baskerville, 'Times New Roman', Times, serif" },
          { label: "Didot", value: "Didot, 'Bodoni MT', 'Times New Roman', serif" },
          { label: "Hoefler Text", value: "'Hoefler Text', 'Times New Roman', serif" },
        ],
      },
      {
        id: "book-schoolbook",
        label: "Bookman & schoolbook",
        variants: [
          { label: "New Century Schoolbook", value: "'New Century Schoolbook', Times, serif" },
          { label: "Bookman", value: "Bookman, 'Bookman Old Style', Georgia, serif" },
          { label: "Charter", value: "Charter, 'Bitstream Charter', Georgia, serif" },
        ],
      },
      {
        id: "display-serif",
        label: "Display serif",
        variants: [
          { label: "Big Caslon", value: "'Big Caslon', 'Times New Roman', serif" },
          { label: "Copperplate", value: "Copperplate, 'Copperplate Gothic', serif" },
          { label: "Rockwell", value: "Rockwell, 'Courier New', serif" },
        ],
      },
      {
        id: "roboto-slab",
        label: "Roboto Slab",
        variants: [
          { label: "Roboto Slab", value: "'Roboto Slab', Rockwell, Georgia, serif" },
        ],
      },
      {
        id: "web-serif",
        label: "Web serif",
        variants: [
          { label: "Merriweather", value: "Merriweather, Georgia, serif" },
          { label: "Noto Serif", value: "'Noto Serif', Georgia, 'Times New Roman', serif" },
          { label: "Source Serif 4", value: "'Source Serif 4', 'Source Serif Pro', Georgia, serif" },
          { label: "Libre Baskerville", value: "'Libre Baskerville', Georgia, serif" },
          { label: "PT Serif", value: "'PT Serif', Georgia, serif" },
          { label: "Crimson Text", value: "'Crimson Text', Georgia, serif" },
          { label: "Lora", value: "Lora, Georgia, serif" },
        ],
      },
      {
        id: "ibm-plex-serif",
        label: "IBM Plex Serif",
        variants: [
          { label: "IBM Plex Serif", value: "'IBM Plex Serif', Georgia, 'Times New Roman', serif" },
        ],
      },
    ],
  },
  {
    id: "mono",
    label: "Monospace",
    families: [
      {
        id: "courier",
        label: "Courier",
        variants: [
          { label: "Courier New", value: "'Courier New', Courier, monospace" },
          { label: "Courier", value: "Courier, 'Courier New', monospace" },
        ],
      },
      {
        id: "code-ui",
        label: "Consolas & system mono",
        variants: [
          { label: "Consolas", value: "Consolas, 'Courier New', monospace" },
          { label: "Monaco", value: "Monaco, Menlo, 'Courier New', monospace" },
          { label: "Menlo", value: "Menlo, Monaco, 'Courier New', monospace" },
          { label: "Lucida Console", value: "'Lucida Console', Monaco, monospace" },
          { label: "Andale Mono", value: "'Andale Mono', Monaco, monospace" },
          { label: "SF Mono", value: "'SF Mono', Menlo, Monaco, Consolas, monospace" },
        ],
      },
      {
        id: "roboto-ibm-mono",
        label: "Roboto & IBM Plex Mono",
        variants: [
          { label: "Roboto Mono", value: "'Roboto Mono', Consolas, 'Courier New', monospace" },
          { label: "IBM Plex Mono", value: "'IBM Plex Mono', Consolas, monospace" },
        ],
      },
      {
        id: "dev-mono",
        label: "Developer mono",
        variants: [
          { label: "Fira Code", value: "'Fira Code', Consolas, monospace" },
          { label: "Source Code Pro", value: "'Source Code Pro', Consolas, monospace" },
          { label: "Inconsolata", value: "Inconsolata, Consolas, monospace" },
          { label: "Ubuntu Mono", value: "'Ubuntu Mono', Consolas, monospace" },
        ],
      },
    ],
  },
  {
    id: "display",
    label: "Display & script",
    families: [
      {
        id: "casual-script",
        label: "Casual & script",
        variants: [
          { label: "Brush Script MT", value: "'Brush Script MT', cursive" },
          { label: "Bradley Hand", value: "'Bradley Hand', cursive" },
          { label: "Lucida Handwriting", value: "'Lucida Handwriting', cursive" },
          { label: "Marker Felt", value: "'Marker Felt', fantasy" },
          { label: "Chalkboard", value: "Chalkboard, 'Comic Sans MS', cursive" },
        ],
      },
      {
        id: "formal-script",
        label: "Formal script",
        variants: [
          { label: "Snell Roundhand", value: "'Snell Roundhand', cursive" },
          { label: "Zapfino", value: "Zapfino, cursive" },
        ],
      },
      {
        id: "fantasy-typewriter",
        label: "Fantasy & typewriter",
        variants: [
          { label: "Trattatello", value: "Trattatello, fantasy" },
          { label: "Papyrus", value: "Papyrus, fantasy" },
          { label: "American Typewriter", value: "'American Typewriter', 'Courier New', monospace" },
        ],
      },
    ],
  },
]

/** Filter quick picks and grouped fonts by name (category / family / variant labels). */
export function filterFontMenuByQuery(raw: string): {
  quick: FontMenuVariant[]
  groups: FontMenuGroup[]
} {
  const q = raw.trim().toLowerCase()
  if (!q) {
    return { quick: FONT_QUICK_VARIANTS, groups: FONT_MENU_GROUPS }
  }
  const quick = FONT_QUICK_VARIANTS.filter((v) => v.label.toLowerCase().includes(q))
  const groups: FontMenuGroup[] = []
  for (const group of FONT_MENU_GROUPS) {
    if (group.label.toLowerCase().includes(q)) {
      groups.push(group)
      continue
    }
    const families: FontMenuFamily[] = []
    for (const family of group.families) {
      if (family.label.toLowerCase().includes(q)) {
        families.push(family)
        continue
      }
      const variants = family.variants.filter((v) => v.label.toLowerCase().includes(q))
      if (variants.length > 0) {
        families.push({ ...family, variants })
      }
    }
    if (families.length > 0) {
      groups.push({ ...group, families })
    }
  }
  return { quick, groups }
}

export const ALL_FONT_MENU_VARIANTS: FontMenuVariant[] = [
  ...FONT_QUICK_VARIANTS,
  ...FONT_MENU_GROUPS.flatMap((g) => g.families.flatMap((f) => f.variants)),
]

export function fontLabelForAttr(fontAttr: string | undefined): string | null {
  if (fontAttr === undefined) return null
  const t = fontAttr.replace(/\s+/g, " ").trim()
  for (const v of ALL_FONT_MENU_VARIANTS) {
    if (v.value === "" && !t) return v.label
    if (v.value && v.value.replace(/\s+/g, " ").trim() === t) return v.label
  }
  return null
}
