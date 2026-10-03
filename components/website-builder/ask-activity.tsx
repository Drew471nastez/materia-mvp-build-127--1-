"use client"

/**
 * ===========================================================================
 *  WHAT A RUN IS DOING, AND WHAT IT DID
 * ===========================================================================
 * "When it's thinking it should not show just 'thinking'. It should show
 * multiple states of what it's doing and update in real time." And: "I don't
 * like the tab with 'working'... the checks and that loading 'working' thing."
 *
 * So a run is drawn as three things, in the order they matter:
 *
 *   THE LINE       one line, what it is doing now, in its own words where it
 *                  has said any ("Reading the FAQ", "Adding Testimonials").
 *                  It changes as the run moves: the old words rise out, the
 *                  new ones rise in, and a band of light passes over them.
 *   THE STEPS      open under the line while it works, each in plain words
 *                  ("Reading the Hero section", "Writing pricing.storelib",
 *                  "Checking it compiles"), a check settling in as each is
 *                  done; folded under "4 steps" once it is over.
 *   THE ANSWER     what it said it did, then how much changed, with Undo,
 *                  Copy and Report beside it.
 *
 * The words come from lib/website-builder/ask-activity.ts, which reads the
 * stream. This file only draws them. CSS: `.ask-line` and `.ask-shine` in
 * app/globals.css, transform and opacity only.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { Check, ChevronRight, Copy, Flag } from "lucide-react"

import type { ActivityCode, TimelineRow } from "@/lib/website-builder/ask-activity"
import { cn } from "@/lib/utils"

/* ── the line ──────────────────────────────────────────────────────────── */

/** How long the old words take to leave: `ask-line-out` in app/globals.css. */
const LINE_OUT_MS = 200

export function ActivityLine({ label, className }: { label: string; className?: string }) {
  const [line, setLine] = React.useState<{ now: string; was: string | null; turn: number }>({ now: label, was: null, turn: 0 })
  React.useEffect(() => {
    setLine((current) => (current.now === label ? current : { now: label, was: current.now, turn: current.turn + 1 }))
  }, [label])
  React.useEffect(() => {
    if (!line.was) return
    const gone = window.setTimeout(() => setLine((current) => ({ ...current, was: null })), LINE_OUT_MS + 20)
    return () => window.clearTimeout(gone)
  }, [line.turn, line.was])

  return (
    <div data-ask-activity="" className={cn("flex min-w-0 items-center gap-2.5 text-[13px] leading-5", className)}>
      <span aria-hidden className="ai-status-dot" />
      <span role="status" aria-live="polite" className="ask-line min-w-0 flex-1">
        {line.was && (
          <span key={`out-${line.turn}`} data-line="out" aria-hidden>
            <span className="ask-shine">{line.was}</span>
          </span>
        )}
        <span key={`in-${line.turn}`} data-line="in">
          <span className="ask-shine" data-ask-line-text="">
            {line.now}
            <span aria-hidden className="ask-shine-window">
              <span className="ask-shine-copy">{line.now}</span>
            </span>
          </span>
        </span>
      </span>
    </div>
  )
}

/* ── the steps ─────────────────────────────────────────────────────────── */

/** "4 steps", or "Details" when all there is to show is the plan or a file. */
export function stepsLabel(steps: number, extra: boolean): string | null {
  if (steps > 0) return `${steps} step${steps === 1 ? "" : "s"}`
  return extra ? "Details" : null
}

export function StepsToggle({
  label,
  open,
  onToggle,
  phone,
}: {
  label: string
  open: boolean
  onToggle: () => void
  phone: boolean
}) {
  return (
    <button
      type="button"
      data-ask-steps-toggle=""
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        "relative inline-flex items-center gap-1 rounded-full text-[12px] text-[#6b7280] transition-colors hover:text-[#1a1a2e]",
        phone ? "h-8 after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']" : "h-6",
      )}
    >
      {label}
      <ChevronRight className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-90")} strokeWidth={2.25} />
    </button>
  )
}

/**
 * ===========================================================================
 *  THE STEPS, WHILE IT WORKS AND AFTER
 * ===========================================================================
 * One list for the whole life of a run (rows from timelineRows in
 * lib/website-builder/ask-activity.ts). While the run works it is open under
 * the one line: each step fades and rises into place as it starts, a calm
 * violet dot breathes beside the one running, and a check settles in when it
 * is done. A thin rail joins the marks, violet where the work is done. When
 * the run ends the same list folds away under "4 steps", and opens again
 * from there.
 *
 * NOTHING ALREADY ON SCREEN MOVES. Rows are only ever appended, every row is
 * one line tall whatever it says (a long label is cut, not wrapped), and a
 * repeat counts up on its own row. The fold animates the list's own height
 * from where it is; nothing above it changes. Measured by
 * scripts/check-ask-states.mjs.
 *
 * CSS: `.ask-steps`, `.ask-step` in app/globals.css. Transform and opacity
 * for every motion; under reduced motion the rows, marks and fold are still.
 */
export function StepsTimeline({
  rows,
  open,
  onOpenCode,
}: {
  rows: TimelineRow[]
  /** Open while the run works, and when asked for after. */
  open: boolean
  onOpenCode?: (path: string) => void
}) {
  if (rows.length === 0) return null
  return (
    <div data-ask-steps-fold="" data-open={open ? "" : undefined} className="ask-steps-fold" aria-hidden={!open} inert={!open}>
      <div className="min-h-0 overflow-hidden">
        <ol data-ask-steps="" className="ask-steps">
          {rows.map((row) => {
            if (row.kind === "plan") {
              return (
                <li key={row.key} data-row={row.key} data-plan="" className="ask-plan">
                  {row.text}
                </li>
              )
            }
            if (row.kind === "code") {
              return (
                <li key={row.key} data-row={row.key} data-ask-code-row="" className="ask-code">
                  <CodePreview file={row.file} onOpenCode={onOpenCode} />
                </li>
              )
            }
            return (
              <li key={row.key} data-row={row.key} data-step={row.state} className="ask-step">
                <span aria-hidden className="ask-step-mark" data-state={row.state}>
                  {row.state === "done" ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <span className="ask-step-dot" />}
                </span>
                <span className="ask-step-label">{row.label}</span>
                {row.count > 1 && <span className="ask-step-count">{row.count}</span>}
                {row.state === "failed" && <span className="ask-step-note">did not work</span>}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

/**
 * A section file it wrote, the way it was written. Capped in height: a
 * section is two hundred lines and the code editor, one press away, is where
 * it is read properly.
 */
export function CodePreview({ file, onOpenCode }: { file: ActivityCode; onOpenCode?: (path: string) => void }) {
  const lines = file.source.split("\n").length
  return (
    <div data-ask-code="" className="min-w-0 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
      <div className="flex items-center gap-2 border-b border-[#e5e7eb]/70 px-2.5 py-1.5">
        <span data-code-path="" className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#6b7280]">
          {file.path}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-[#6b7280]/70">{lines} lines</span>
        {onOpenCode && (
          <button
            type="button"
            onClick={() => onOpenCode(file.path)}
            className="relative shrink-0 text-[11.5px] font-medium text-[#1a1a2e] underline-offset-2 after:absolute after:-inset-2 after:content-[''] hover:underline"
          >
            Open
          </button>
        )}
      </div>
      {/* The one thing in a thread that scrolls sideways, inside itself. */}
      <pre
        data-code-scroll=""
        className="max-h-44 max-w-full overflow-auto overscroll-contain px-2.5 py-2 text-[11px] leading-[1.45] [overflow-wrap:normal] [touch-action:pan-x_pan-y]"
      >
        <code className="font-mono text-[#1a1a2e]/80">{file.source}</code>
      </pre>
    </div>
  )
}

/* ── under an answer ───────────────────────────────────────────────────── */

/**
 * COPY THAT COPIES. The clipboard API first; where it is refused (a page
 * without clipboard permission, an older web view, a document that has lost
 * focus) the old way, a selected field and the copy command, which still
 * works in all of them. True when the words are on the clipboard.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* refused: try the old way */
  }
  try {
    const area = document.createElement("textarea")
    area.value = text
    area.setAttribute("readonly", "")
    area.setAttribute("aria-hidden", "true")
    area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none"
    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, text.length)
    const done = document.execCommand("copy")
    area.remove()
    return done
  } catch {
    return false
  }
}

export type ReportState =
  | { stage: "closed" }
  | { stage: "open"; reason: string }
  | { stage: "sending"; reason: string }
  | { stage: "sent" }
  | { stage: "problem"; message: string; reason: string }

export function AnswerMeta({
  count,
  steps,
  stepsOpen,
  onToggleSteps,
  undo,
  onUndo,
  copyText,
  canReport,
  report,
  onReport,
  phone,
  reportRef,
}: {
  /** "1 section changed", or null when nothing did. */
  count: string | null
  /** The toggle for what it did on the way ("4 steps"), or null for none. */
  steps: string | null
  stepsOpen: boolean
  onToggleSteps: () => void
  /** "available" draws Undo, "done" says it was undone, null draws neither. */
  undo: "available" | "done" | null
  onUndo: () => void
  copyText: string
  canReport: boolean
  report: ReportState
  onReport: (next: ReportState) => void
  phone: boolean
  /** The flag button, which the report popover is placed against. */
  reportRef?: React.Ref<HTMLButtonElement>
}) {
  /** What the last Copy did, said beside the button for a moment: "Copied", or that it could not. */
  const [copied, setCopied] = React.useState<null | "copied" | "failed">(null)
  React.useEffect(() => {
    if (!copied) return
    const off = window.setTimeout(() => setCopied(null), copied === "copied" ? 1600 : 2600)
    return () => window.clearTimeout(off)
  }, [copied])

  const copy = React.useCallback(async () => {
    setCopied((await writeClipboard(copyText)) ? "copied" : "failed")
  }, [copyText])

  const icon = cn(
    "relative flex shrink-0 items-center justify-center rounded-full text-[#6b7280] transition-colors hover:bg-black/[0.05] hover:text-[#1a1a2e]",
    phone ? "h-9 w-9 after:absolute after:-inset-1 after:content-['']" : "h-7 w-7",
  )

  return (
    <div data-ask-meta="" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#6b7280]">
      {count && <span data-ask-count="" className="min-w-0">{count}</span>}
      {undo === "available" && (
        <button
          type="button"
          data-ask-undo=""
          onClick={onUndo}
          className={cn(
            "relative rounded-full font-medium text-[#1a1a2e] underline-offset-2 hover:underline",
            phone && "after:absolute after:-inset-3 after:content-['']",
          )}
        >
          Undo
        </button>
      )}
      {undo === "done" && <span data-ask-undone="">Undone</span>}
      {steps && <StepsToggle label={steps} open={stepsOpen} onToggle={onToggleSteps} phone={phone} />}
      <span className="min-w-0 flex-1" />
      {copied && (
        <span data-ask-copied={copied} role="status" className={cn("text-[12px]", copied === "copied" ? "text-[#1a1a2e]" : "text-[#b45309]")}>
          {copied === "copied" ? "Copied" : "Could not copy. Select the text instead."}
        </span>
      )}
      {copyText && (
        <button
          type="button"
          data-ask-copy=""
          onClick={() => void copy()}
          aria-label={copied === "copied" ? "Copied" : "Copy the answer"}
          title={copied === "copied" ? "Copied" : "Copy"}
          className={icon}
        >
          {copied === "copied" ? <Check className="h-3.5 w-3.5" strokeWidth={2.25} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.9} />}
        </button>
      )}
      {canReport && report.stage !== "sent" && (
        <button
          ref={reportRef}
          type="button"
          data-ask-report=""
          onClick={() => onReport(report.stage === "closed" ? { stage: "open", reason: "" } : { stage: "closed" })}
          aria-label="Report this answer"
          aria-expanded={report.stage !== "closed"}
          title="Report"
          className={cn(icon, report.stage !== "closed" && "bg-black/[0.05] text-[#1a1a2e]")}
        >
          <Flag className="h-3.5 w-3.5" strokeWidth={1.9} />
        </button>
      )}
      {report.stage === "sent" && (
        <span data-ask-reported="" role="status" className="text-[#1a1a2e]">
          Reported. Thank you.
        </span>
      )}
    </div>
  )
}

/** The reasons offered as one tap each. Any of them can be written over. */
export const REPORT_REASONS = ["Changed the wrong thing", "Did not do what I asked", "Broke the page", "Wrong answer"] as const

/** The popover's width on a computer, and the gap between it and the flag. */
const REPORT_WIDTH = 264
const REPORT_GAP = 6

/**
 * "What went wrong?", in a small popover by the flag. The reason is optional:
 * a tap on one of the chips or a few words, then Send.
 *
 * On a computer it is drawn in the body, fixed next to the flag: the dock
 * moves on a transform and the thread scrolls with its edges clipped, and a
 * fixed element inside either is placed against that instead of the window.
 * Above the flag when there is room, below it when there is not, and kept
 * inside the window. It closes on Escape, on a press anywhere else, and when
 * the report has gone. `data-ask-keep` so a press inside it does not fold
 * the conversation away. On a phone it sits in the thread under the flag.
 */
export function ReportForm({
  report,
  onChange,
  onSend,
  phone,
  anchor,
}: {
  report: ReportState
  onChange: (next: ReportState) => void
  onSend: (reason: string) => void
  phone: boolean
  /** The flag it opens from. Without one it is drawn in place. */
  anchor?: React.RefObject<HTMLElement | null>
}) {
  const field = React.useRef<HTMLInputElement>(null)
  const box = React.useRef<HTMLFormElement>(null)
  /* One per answer: two reports open at once each keep their own label. */
  const fieldId = `ask-report-${React.useId()}`
  const shown = report.stage !== "closed" && report.stage !== "sent"
  const floating = !phone && !!anchor
  const [place, setPlace] = React.useState<React.CSSProperties | null>(null)

  React.useEffect(() => {
    if (report.stage === "open") field.current?.focus({ preventScroll: true })
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.stage === "open", place === null])

  /* Placed against the flag, and again whenever anything under it scrolls or the window changes size. */
  React.useLayoutEffect(() => {
    if (!shown || !floating) return
    let frame = 0
    const measure = () => {
      frame = 0
      const flag = anchor?.current
      if (!flag || !flag.isConnected) return
      const r = flag.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const width = Math.min(REPORT_WIDTH, vw - 16)
      const left = Math.max(8, Math.min(r.right - width, vw - width - 8))
      const height = box.current?.offsetHeight ?? 150
      const above = r.top - REPORT_GAP - height >= 8
      setPlace(
        above
          ? { position: "fixed", left, width, bottom: vh - r.top + REPORT_GAP, transformOrigin: "100% 100%" }
          : { position: "fixed", left, width, top: r.bottom + REPORT_GAP, transformOrigin: "100% 0" },
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    document.addEventListener("scroll", schedule, { capture: true, passive: true })
    window.addEventListener("resize", schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener("scroll", schedule, { capture: true })
      window.removeEventListener("resize", schedule)
    }
  }, [shown, floating, anchor, report.stage])

  /* A press anywhere but the popover or its flag closes it. The flag toggles it itself. */
  React.useEffect(() => {
    if (!shown || !floating) return
    const away = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target || box.current?.contains(target) || anchor?.current?.contains(target)) return
      onChange({ stage: "closed" })
    }
    document.addEventListener("pointerdown", away, true)
    return () => document.removeEventListener("pointerdown", away, true)
  }, [shown, floating, anchor, onChange])

  if (!shown) return null
  const reason = "reason" in report ? report.reason : ""
  const sending = report.stage === "sending"
  const form = (
    <form
      ref={box}
      data-ask-report-form=""
      data-ask-keep=""
      role="dialog"
      aria-label="Report this answer"
      onSubmit={(event) => {
        event.preventDefault()
        if (!sending) onSend(reason)
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        /* Handled here, so the conversation behind it stays open. */
        event.preventDefault()
        event.stopPropagation()
        onChange({ stage: "closed" })
        anchor?.current?.focus({ preventScroll: true })
      }}
      style={floating ? (place ?? { position: "fixed", left: -9999, top: 0, width: REPORT_WIDTH }) : undefined}
      className={cn(
        "min-w-0 rounded-2xl border border-[#1a1a2e]/[0.08] bg-white p-2.5",
        floating
          ? "z-[300] shadow-[0_2px_6px_rgba(15,23,42,0.06),0_12px_28px_-8px_rgba(15,23,42,0.22)] motion-safe:animate-[ask-report-in_160ms_cubic-bezier(0.32,0.72,0,1)]"
          : "ml-auto mt-1.5 max-w-[288px] shadow-[0_1px_3px_rgba(15,23,42,0.06)]",
      )}
    >
      {floating && (
        <style>{"@keyframes ask-report-in{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:none}}"}</style>
      )}
      <label className="block text-[12.5px] font-medium text-[#1a1a2e]" htmlFor={fieldId}>
        What went wrong?
      </label>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {REPORT_REASONS.map((chip) => (
          <button
            key={chip}
            type="button"
            data-ask-report-reason=""
            aria-pressed={reason === chip}
            onClick={() => onChange({ stage: "open", reason: reason === chip ? "" : chip })}
            className={cn(
              "rounded-full border px-2 text-[11.5px] transition-colors",
              phone ? "h-8" : "h-6",
              reason === chip
                ? "border-[#1a1a2e] bg-[#1a1a2e] text-white"
                : "border-[#e5e7eb] text-[#1a1a2e]/75 hover:border-[#1a1a2e]/25 hover:text-[#1a1a2e]",
            )}
          >
            {chip}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          ref={field}
          id={fieldId}
          value={reason}
          maxLength={500}
          onChange={(event) => onChange({ stage: "open", reason: event.target.value })}
          placeholder="Or say it in a few words"
          className={cn(
            "block min-w-0 flex-1 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[#1a1a2e] outline-none placeholder:text-[#6b7280]/70 focus:border-[#1a1a2e]/30",
            /* 16px on a phone: smaller, and iOS zooms the page to the field when it is focused. */
            phone ? "h-10 text-[16px]" : "h-8 text-[12.5px]",
          )}
        />
        <button
          type="submit"
          disabled={sending}
          className={cn("shrink-0 rounded-full bg-[#1a1a2e] px-3 text-[12.5px] font-medium text-white disabled:opacity-60", phone ? "h-10" : "h-8")}
        >
          {sending ? "Sending" : "Send"}
        </button>
      </div>
      {report.stage === "problem" && (
        <p role="alert" className="mt-1.5 text-[12px] text-[#b45309]">
          {report.message}
        </p>
      )}
    </form>
  )
  return floating && typeof document !== "undefined" ? createPortal(form, document.body) : form
}
