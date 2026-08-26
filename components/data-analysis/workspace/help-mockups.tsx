"use client"

/**
 * Diagrams of the interface and the pipeline.
 *
 * Hand-authored SVG using `currentColor` for every stroke and label, so both
 * themes are served by one drawing; the accent hue is reserved for the one
 * element each diagram is actually about. No external images, no chart library
 * — these are mechanisms, not data.
 */

const ACCENT = "var(--n9-accent, #965034)"
const AMBER = "#B87A2E"

function Frame({
  viewBox,
  label,
  children,
  height = 150,
}: {
  viewBox: string
  label: string
  height?: number
  children: React.ReactNode
}) {
  return (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label={label}
      style={{ height, width: "100%" }}
      className="text-foreground"
      preserveAspectRatio="xMidYMid meet"
    >
      {children}
    </svg>
  )
}

/** The sheet, with the region detection shaded the way the dialog shades it. */
function RegionMockup() {
  const cols = ["A", "B", "C", "D", "E"]
  const rows = [
    ["Plate 3 — run 14 Aug", "", "", "", ""],
    ["", "", "", "", ""],
    ["", "", "Conc", "OD450", "Note"],
    ["", "", "pg/mL", "", ""],
    ["", "", "1.56", "0.089", ""],
    ["", "", "3.13", "0.171", ""],
    ["", "", "6.25", "0.402", ""],
  ]
  const x0 = 30
  const y0 = 20
  const cw = 76
  const rh = 17
  return (
    <Frame viewBox="0 0 420 160" height={165} label="A sheet with a title, a unit row and two empty leading columns; the detected header, units and data are shaded.">
      {cols.map((c, i) => (
        <text key={c} x={x0 + i * cw + cw / 2} y={y0 - 6} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.5" fontFamily="ui-monospace, monospace">
          {c}
        </text>
      ))}
      {rows.map((row, r) => (
        <g key={r}>
          <text x={x0 - 8} y={y0 + r * rh + 12} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.5" fontFamily="ui-monospace, monospace">
            {r + 1}
          </text>
          {row.map((cell, c) => {
            const inHeader = r === 2 && c >= 2
            const inUnits = r === 3 && c >= 2
            const inData = r >= 4 && c >= 2 && c <= 3
            const ignored = !inHeader && !inUnits && !inData
            return (
              <g key={c}>
                <rect
                  x={x0 + c * cw}
                  y={y0 + r * rh}
                  width={cw}
                  height={rh}
                  fill={inHeader ? ACCENT : inUnits ? AMBER : "transparent"}
                  fillOpacity={inHeader ? 0.2 : inUnits ? 0.18 : 0}
                  stroke="currentColor"
                  strokeOpacity="0.16"
                />
                <text
                  x={x0 + c * cw + 5}
                  y={y0 + r * rh + 12}
                  fontSize="9"
                  fill="currentColor"
                  opacity={ignored ? 0.32 : 0.95}
                  fontFamily="ui-monospace, monospace"
                >
                  {cell.length > 12 ? `${cell.slice(0, 12)}…` : cell}
                </text>
              </g>
            )
          })}
        </g>
      ))}
      {/* The read region */}
      <rect x={x0 + 2 * cw} y={y0 + 2 * rh} width={cw * 2} height={rh * 5} fill="none" stroke={ACCENT} strokeWidth="1.6" />
      <text x={x0 + 2 * cw} y={y0 + 7 * rh + 12} fontSize="9.5" fill={ACCENT} fontFamily="ui-monospace, monospace">
        C3:D7
      </text>
      <text x={x0} y={y0 + 7 * rh + 12} fontSize="9.5" fill="currentColor" opacity="0.5">
        A, B skipped · row 1 title · row 4 units
      </text>
    </Frame>
  )
}

/** The two severities, and what each one is allowed to do. */
function SeverityMockup() {
  return (
    <Frame viewBox="0 0 420 128" height={135} label="Structural findings apply automatically with undo; decision findings wait for you.">
      <rect x="8" y="10" width="196" height="104" rx="8" fill="currentColor" fillOpacity="0.04" stroke="currentColor" strokeOpacity="0.2" />
      <text x="20" y="30" fontSize="10.5" fill={ACCENT} fontWeight="600">STRUCTURAL</text>
      <text x="20" y="46" fontSize="10" fill="currentColor" opacity="0.85">“12.3 ng/mL” is not a number</text>
      <text x="20" y="60" fontSize="10" fill="currentColor" opacity="0.85">“&lt;LOD” is not a measurement</text>
      <rect x="20" y="70" width="172" height="1" fill="currentColor" fillOpacity="0.15" />
      <text x="20" y="88" fontSize="10" fill="currentColor" opacity="0.7">Applied for you</text>
      <text x="20" y="102" fontSize="10" fill="currentColor" opacity="0.7">Undo on every line</text>

      <rect x="216" y="10" width="196" height="104" rx="8" fill={AMBER} fillOpacity="0.07" stroke={AMBER} strokeOpacity="0.45" />
      <text x="228" y="30" fontSize="10.5" fill={AMBER} fontWeight="600">DECISION</text>
      <text x="228" y="46" fontSize="10" fill="currentColor" opacity="0.85">Outliers · duplicates</text>
      <text x="228" y="60" fontSize="10" fill="currentColor" opacity="0.85">Missing values · replicates</text>
      <rect x="228" y="70" width="172" height="1" fill="currentColor" fillOpacity="0.15" />
      <text x="228" y="88" fontSize="10" fill="currentColor" opacity="0.7">Never automatic</text>
      <text x="228" y="102" fontSize="10" fill="currentColor" opacity="0.7">“Leave as is” always offered</text>

      <text x="210" y="124" textAnchor="middle" fontSize="9.5" fill="currentColor" opacity="0.55">
        the line: could it change a result you wanted?
      </text>
    </Frame>
  )
}

/** The five stages, as a flow. */
function JourneyMockup() {
  const steps = ["Read", "Locate", "Profile", "Repair", "Check"]
  const detail = ["workbook", "the table", "columns", "misreads", "outliers"]
  const w = 74
  const gap = 10
  return (
    <Frame viewBox="0 0 420 96" height={100} label="Five stages: read the workbook, locate the table, profile the columns, repair misreads, check for decisions.">
      {steps.map((s, i) => {
        const x = 6 + i * (w + gap)
        const last = i === steps.length - 1
        return (
          <g key={s}>
            <rect x={x} y={20} width={w} height={40} rx={7} fill={last ? AMBER : ACCENT} fillOpacity={last ? 0.1 : 0.09} stroke={last ? AMBER : ACCENT} strokeOpacity="0.4" />
            <text x={x + w / 2} y={38} textAnchor="middle" fontSize="11" fill="currentColor" fontWeight="600">{s}</text>
            <text x={x + w / 2} y={51} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.6">{detail[i]}</text>
            {!last && (
              <path d={`M ${x + w + 1} 40 L ${x + w + gap - 3} 40`} stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" markerEnd="url(#hm-arrow)" />
            )}
          </g>
        )
      })}
      <defs>
        <marker id="hm-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="currentColor" fillOpacity="0.4" />
        </marker>
      </defs>
      <text x="6" y="80" fontSize="9.5" fill="currentColor" opacity="0.6">automatic, shown as it happens</text>
      <text x="414" y="80" textAnchor="end" fontSize="9.5" fill={AMBER}>then you decide</text>
    </Frame>
  )
}

/** Chart tab versus figure layout: why one draws and the other waits. */
function EngineMockup() {
  return (
    <Frame viewBox="0 0 420 116" height={124} label="The Chart tab draws from the sheet; the figure layout draws from the computed engine result.">
      <rect x="8" y="44" width="72" height="34" rx="6" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity="0.25" />
      <text x="44" y="65" textAnchor="middle" fontSize="10.5" fill="currentColor">Sheet</text>

      <path d="M 82 54 L 150 34" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" markerEnd="url(#hm-arrow2)" />
      <path d="M 82 68 L 150 82" stroke={ACCENT} strokeOpacity="0.7" strokeWidth="1.2" markerEnd="url(#hm-arrow3)" />

      <rect x="152" y="16" width="110" height="34" rx="6" fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity="0.25" />
      <text x="207" y="37" textAnchor="middle" fontSize="10.5" fill="currentColor">Chart tab</text>

      <rect x="152" y="66" width="110" height="34" rx="6" fill={ACCENT} fillOpacity="0.09" stroke={ACCENT} strokeOpacity="0.45" />
      <text x="207" y="87" textAnchor="middle" fontSize="10.5" fill="currentColor">Engine</text>

      <path d="M 264 83 L 330 83" stroke={ACCENT} strokeOpacity="0.7" strokeWidth="1.2" markerEnd="url(#hm-arrow3)" />
      <rect x="332" y="66" width="80" height="34" rx="6" fill={ACCENT} fillOpacity="0.09" stroke={ACCENT} strokeOpacity="0.45" />
      <text x="372" y="87" textAnchor="middle" fontSize="10.5" fill="currentColor">Layout</text>

      <text x="152" y="60" fontSize="9" fill="currentColor" opacity="0.55">draws immediately</text>
      <text x="332" y="112" fontSize="9" fill={ACCENT}>needs a computed result</text>

      <defs>
        <marker id="hm-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill="currentColor" fillOpacity="0.4" />
        </marker>
        <marker id="hm-arrow3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 1 L 10 5 L 0 9 z" fill={ACCENT} />
        </marker>
      </defs>
    </Frame>
  )
}

const MOCKUPS: Record<string, () => React.ReactElement> = {
  region: RegionMockup,
  severity: SeverityMockup,
  journey: JourneyMockup,
  engine: EngineMockup,
}

export const HELP_MOCKUP_KINDS = Object.keys(MOCKUPS)

export function HelpMockupView({ kind }: { kind: string }) {
  const Component = MOCKUPS[kind]
  if (!Component) return null
  return <Component />
}
