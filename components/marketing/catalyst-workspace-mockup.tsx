"use client"

import Image from "next/image"
import {
  BarChart3,
  BookOpen,
  FileText,
  FlaskConical,
  Folder,
  Home,
  Microscope,
  Network,
  NotebookPen,
  ScrollText,
  Send,
  type LucideIcon,
} from "lucide-react"
import { Notes9Brand } from "@/components/brand/notes9-brand"
import { ClipboardInfoIcon } from "@/components/ui/clipboard-info-icon"
import styles from "@/components/marketing/catalyst-workspace-mockup.module.css"

/** Mirrors `navigation` in `components/layout/app-sidebar.tsx` (icons + labels). */
const NAV_ITEMS: (
  | { name: string; kind: "lucide"; Icon: LucideIcon }
  | { name: string; kind: "protocols" }
)[] = [
  { name: "Dashboard", kind: "lucide", Icon: Home },
  { name: "Projects", kind: "lucide", Icon: Folder },
  { name: "Experiments", kind: "lucide", Icon: FlaskConical },
  { name: "Lab Notes", kind: "lucide", Icon: NotebookPen },
  { name: "Protocols", kind: "protocols" },
  { name: "Literature", kind: "lucide", Icon: BookOpen },
  { name: "Research map", kind: "lucide", Icon: Network },
  { name: "Writing", kind: "lucide", Icon: ScrollText },
  { name: "Reports", kind: "lucide", Icon: BarChart3 },
]

const LITERATURE_INDEX = NAV_ITEMS.findIndex((n) => n.name === "Literature")

/** Static UI replica aligned with app shell + marketing accent theme. */
export function CatalystWorkspaceMockup() {
  return (
    <div
      className={styles.mockFrame}
      role="img"
      aria-label="Notes9 Research Lab with Catalyst AI chat answering a question about experiments with cited sources."
    >
      <aside className={styles.sidebar}>
        <div className={`${styles.brand} text-foreground`}>
          <Notes9Brand withTagline textClassName="h-5 w-auto" />
        </div>

        <nav className={styles.nav} aria-label="Primary">
          {NAV_ITEMS.map((item, i) => {
            const isLit = i === LITERATURE_INDEX
            const btnClass =
              isLit ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem

            if (item.kind === "protocols") {
              return (
                <button
                  key={item.name}
                  type="button"
                  className={btnClass}
                  aria-current={isLit ? "true" : undefined}
                >
                  <ClipboardInfoIcon className={styles.navIcoProtocols} />
                  {item.name}
                </button>
              )
            }

            const Icon = item.Icon
            return (
              <button
                key={item.name}
                type="button"
                className={btnClass}
                aria-current={isLit ? "true" : undefined}
              >
                <Icon className={styles.navIco} strokeWidth={2} aria-hidden />
                {item.name}
              </button>
            )
          })}
        </nav>
      </aside>

      <main className={styles.mainPanel}>
        <header className={styles.chatHeader}>
          <span
            aria-hidden
            className="relative mx-[0.02em] inline-flex h-[1.3rem] w-[1.3rem] shrink-0 items-center justify-center self-center translate-y-[1px]"
          >
            <Image
              src="/notes9-logo-mark-transparent.png"
              alt=""
              fill
              sizes="40px"
              className="object-contain dark:invert dark:brightness-125"
            />
          </span>
          <div className={styles.chatTitle}>Catalyst AI</div>
        </header>

        <div className={styles.thread}>
          <article className={`${styles.bubble} ${styles.bubbleUser}`}>
            <p className={styles.bubbleText}>
              What explains the prolonged terminal phase in my DEX PK experiments?
            </p>
            <span className={styles.bubbleMeta}>9:41 AM</span>
          </article>

          <article className={`${styles.bubble} ${styles.bubbleAi}`}>
            <p className={styles.bubbleText}>
              Based on your experiments, notes, and related literature, the prolonged terminal phase is likely driven by…
            </p>
            <div className={styles.sources}>
              <div className={styles.sourcesLabel}>Sources (6)</div>
              <div className={styles.sourcesRow} aria-hidden>
                <span className={styles.srcChip} style={{ background: "#f4f4f5", color: "#525252" }}>
                  <FileText width={14} height={14} strokeWidth={2} />
                </span>
                <span className={styles.srcChip} style={{ background: "#ecfdf5", color: "#059669" }}>
                  <FlaskConical width={14} height={14} strokeWidth={2} />
                </span>
                <span className={styles.srcChip} style={{ background: "#fff7ed", color: "#ea580c" }}>
                  <NotebookPen width={14} height={14} strokeWidth={2} />
                </span>
                <span className={styles.srcChip} style={{ background: "#fdf2f8", color: "#db2777" }}>
                  <BarChart3 width={14} height={14} strokeWidth={2} />
                </span>
                <span className={styles.srcChip} style={{ background: "#fef2f2", color: "#dc2626" }}>
                  <Microscope width={14} height={14} strokeWidth={2} />
                </span>
                <span className={`${styles.srcChip} ${styles.srcChipMore}`}>+2</span>
              </div>
            </div>
          </article>
        </div>

        <form className={styles.composer} onSubmit={(e) => e.preventDefault()}>
          <label className={styles.composerInputWrap}>
            <span className={styles.visuallyHidden}>Ask Catalyst AI</span>
            <input type="text" placeholder="Ask anything about your research..." readOnly tabIndex={-1} />
          </label>
          <button type="button" className={styles.send} aria-label="Send message" tabIndex={-1}>
            <Send width={18} height={18} strokeWidth={2} />
          </button>
        </form>
      </main>
    </div>
  )
}
