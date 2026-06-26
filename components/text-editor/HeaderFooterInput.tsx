import { cn } from "@/lib/utils"

interface Props {
  type: "header" | "footer"
  value: string
  onChange: (val: string) => void
  align: "left" | "center" | "right"
  page: number
  showPageNumbers: "header" | "footer" | "none"
}

export function HeaderFooterInput({ type, value, onChange, align, page, showPageNumbers }: Props) {
  const showPageNum = showPageNumbers === type

  return (
    <div 
      className={cn(
        "w-full h-full flex items-center px-8 text-sm text-slate-400 opacity-70 hover:opacity-100 focus-within:opacity-100 transition-opacity",
        align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start"
      )}
      onMouseDown={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <div className={cn(
        "flex items-center gap-4 w-full max-w-full",
        align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start",
        align === "right" && "flex-row-reverse"
      )}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`Enter ${type}...`}
          className={cn(
            "bg-transparent border-none outline-none focus:ring-0 shadow-none min-w-[50px] w-full max-w-[50%] placeholder:text-slate-300",
            align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left"
          )}
        />
        {showPageNum && (
          <span className="shrink-0 tabular-nums">{page}</span>
        )}
      </div>
    </div>
  )
}
