import { cn } from "@/lib/utils"

interface Props {
  type: "header" | "footer"
  value: string
  onChange: (val: string) => void
  align: "left" | "center" | "right"
  page: number
  showPageNumbers: "header" | "footer" | "none"
  pageNumberAlign?: "left" | "center" | "right"
}

export function HeaderFooterInput({ type, value, onChange, align, page, showPageNumbers, pageNumberAlign }: Props) {
  const showPageNum = showPageNumbers === type
  // Resolve where the page number should go. If it collides with the text
  // alignment, nudge it to the opposite side automatically.
  const numAlign: "left" | "center" | "right" = (() => {
    if (!showPageNum) return "right" // irrelevant
    const preferred = pageNumberAlign ?? "right"
    if (preferred !== align) return preferred
    // collision — pick the best alternative
    if (preferred === "center") return "right"
    if (preferred === "left") return "right"
    return "left" // preferred was "right" and collides
  })()

  // When text and page number share the same row (same alignment = collision
  // fallback handled above), we use a 3-slot grid so both can coexist at
  // independent positions without overlapping.
  return (
    <div
      className="w-full h-full grid items-center px-8 text-sm text-slate-400 opacity-70 hover:opacity-100 focus-within:opacity-100 transition-opacity"
      style={{ gridTemplateColumns: "1fr auto 1fr" }}
      onMouseDown={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      {/* Left slot */}
      <div className="flex items-center justify-start min-w-0">
        {align === "left" && (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={`Enter ${type}...`}
            className="bg-transparent border-none outline-none focus:ring-0 shadow-none min-w-[50px] w-full max-w-full placeholder:text-slate-300 text-left"
          />
        )}
        {showPageNum && numAlign === "left" && (
          <span className="shrink-0 tabular-nums">{page}</span>
        )}
      </div>

      {/* Center slot */}
      <div className="flex items-center justify-center min-w-0">
        {align === "center" && (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={`Enter ${type}...`}
            className="bg-transparent border-none outline-none focus:ring-0 shadow-none min-w-[50px] w-full max-w-full placeholder:text-slate-300 text-center"
          />
        )}
        {showPageNum && numAlign === "center" && (
          <span className="shrink-0 tabular-nums">{page}</span>
        )}
      </div>

      {/* Right slot */}
      <div className="flex items-center justify-end min-w-0">
        {showPageNum && numAlign === "right" && (
          <span className="shrink-0 tabular-nums">{page}</span>
        )}
        {align === "right" && (
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={`Enter ${type}...`}
            className="bg-transparent border-none outline-none focus:ring-0 shadow-none min-w-[50px] w-full max-w-full placeholder:text-slate-300 text-right"
          />
        )}
      </div>
    </div>
  )
}
