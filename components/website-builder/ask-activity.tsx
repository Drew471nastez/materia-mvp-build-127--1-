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
 *   THE STEPS      what it finished, folded under "4 steps" until asked
 *                  for. A plain list: no ticks, no spinner, no counter.
 *   THE ANSWER     what it said it did, then how much changed, with Undo,
 *                  Copy and Report beside it.
 *
 * The words come from lib/website-builder/ask-activity.ts, which reads the
 * stream. This file only draws them. CSS: `.ask-line` and `.ask-shine` in
 * app/globals.css, transform and opacity only.
 */

import * as React from "react"
import { Check, ChevronRight, Copy, Flag } from "lucide-react"

import type { ActivityCode, ActivityStep } from "@/lib/website-builder/ask-activity"
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

export function StepsList({
  plan,
  steps,
  code,
  onOpenCode,
}: {
  plan?: string
  steps: ActivityStep[]
  code: ActivityCode[]
  onOpenCode?: (path: string) => void
}) {
  return (
    <div data-ask-steps="" className="mt-1.5 min-w-0 border-l border-[#e5e7eb] pl-3">
      {plan && <p data-plan="" className="mb-1.5 whitespace-pre-wrap text-[12.5px] leading-snug text-[#1a1a2e]/75">{plan}</p>}
      {steps.length > 0 && (
        <ol className="space-y-1 text-[12.5px] leading-snug text-[#6b7280]">
          {steps.map((step) => (
            <li key={step.id} data-step={step.state} className={cn("min-w-0", step.state === "failed" && "text-[#b45309]")}>
              {step.label}
              {step.state === "failed" && <span className="text-[#b45309]/80">, did not land</span>}
            </li>
          ))}
        </ol>
      )}
      {code.map((file) => (
        <CodePreview key={file.path} file={file} onOpenCode={onOpenCode} />
      ))}
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
    <div data-ask-code="" className="mt-2 min-w-0 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
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
}) {
  const [copied, setCopied] = React.useState(false)
  React.useEffect(() => {
    if (!copied) return
    const off = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(off)
  }, [copied])

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
    } catch {
      /* A browser that refuses the clipboard: select-and-copy still works on the words above. */
    }
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
      {copyText && (
        <button type="button" data-ask-copy="" onClick={() => void copy()} aria-label={copied ? "Copied" : "Copy the answer"} title={copied ? "Copied" : "Copy"} className={icon}>
          {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2.25} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.9} />}
        </button>
      )}
      {canReport && report.stage !== "sent" && (
        <button
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
      {report.stage === "sent" && <span data-ask-reported="">Reported</span>}
    </div>
  )
}

/** "What went wrong?", in place under the answer. The reason is optional. */
export function ReportForm({
  report,
  onChange,
  onSend,
  phone,
}: {
  report: ReportState
  onChange: (next: ReportState) => void
  onSend: (reason: string) => void
  phone: boolean
}) {
  const field = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (report.stage === "open") field.current?.focus({ preventScroll: true })
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.stage === "open"])
  if (report.stage === "closed" || report.stage === "sent") return null
  const reason = "reason" in report ? report.reason : ""
  const sending = report.stage === "sending"
  return (
    <form
      data-ask-report-form=""
      onSubmit={(event) => {
        event.preventDefault()
        if (!sending) onSend(reason)
      }}
      className="mt-1.5 min-w-0 rounded-xl border border-[#e5e7eb] bg-white p-2.5"
    >
      <label className="block text-[12.5px] font-medium text-[#1a1a2e]" htmlFor="ask-report-reason">
        What went wrong?
      </label>
      <input
        ref={field}
        id="ask-report-reason"
        value={reason}
        maxLength={500}
        onChange={(event) => onChange({ stage: "open", reason: event.target.value })}
        placeholder="Optional"
        className={cn(
          "mt-1.5 block w-full rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[#1a1a2e] outline-none placeholder:text-[#6b7280]/70 focus:border-[#1a1a2e]/30",
          /* 16px on a phone: smaller, and iOS zooms the page to the field when it is focused. */
          phone ? "h-11 text-[16px]" : "h-8 text-[13px]",
        )}
      />
      {report.stage === "problem" && (
        <p role="alert" className="mt-1.5 text-[12px] text-[#b45309]">
          {report.message}
        </p>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={sending}
          className={cn("rounded-full bg-[#1a1a2e] px-3 text-[12.5px] font-medium text-white disabled:opacity-60", phone ? "h-10" : "h-8")}
        >
          {sending ? "Sending" : "Send report"}
        </button>
        <button
          type="button"
          onClick={() => onChange({ stage: "closed" })}
          className={cn("rounded-full px-3 text-[12.5px] text-[#6b7280] hover:text-[#1a1a2e]", phone ? "h-10" : "h-8")}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
