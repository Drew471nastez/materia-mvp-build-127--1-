"use client"

/**
 * ===========================================================================
 *  START WITH AI, AGENT BUILD: THE PROGRESS VIEW (round L)
 * ===========================================================================
 * What the agent is really doing, from its events (ai_site_job_events):
 * the phase it is in, then one line per thing done ("Writing the hero
 * section", "Made the About page", "Found 2 problems", "Fixing the menu
 * section"), newest at the bottom. Counts only when the job knows them
 * ("2 of 5 pages done"); no percentage bar, because there is no honest
 * percentage for a build that decides its own steps.
 *
 * Endings, said plainly, each with what can be done next:
 *   READY       made; Done shows it.
 *   WITH GAPS   made, the gaps listed; Continue when the build stopped on
 *               a limit, Done.
 *   STOPPED     failed; the reason in plain words; Try again / Continue /
 *               Start over as the reason allows.
 *   CANCELLED   stopped by you; drafts kept; Continue or Start over.
 *
 * Pure view: lib/website-builder/ai-site/use-generation.ts follows the job.
 * The editor's own look (a white card, #1a1a2e actions), one column, the
 * list scrolls inside the card on a phone.
 *
 * ROUND N (N1). It was a 440 px card in the middle of the canvas, up to
 * 560 px tall: over the very place the new sections land, so the build
 * could not be seen. Now the editor docks it in a corner (top right on a
 * computer, a one line bar under the editor's bar on a phone, opened with a
 * tap), and the line under the title is what the agent is on, in plain
 * words ("Designing the header", "Writing the product page",
 * lib/website-builder/ai-site/live-build.ts). The tool's own words
 * ("write file sections/ai_x.storelib") are never shown; a step a file or
 * page line already says is not said twice.
 */
import * as React from "react"
import { Check, ChevronDown, Loader2, RotateCw, Sparkles, Undo2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { AgentErrorCode } from "@/lib/ai-builder/agent-step"
import type { AgentEvent, AgentPhase } from "@/lib/ai-builder/types"
import { componentName, type AgentJobView, type RecoveryAction } from "@/lib/website-builder/ai-site/agent-progress"
import { currentStep, toolStep } from "@/lib/website-builder/ai-site/live-build"

export type AgentPanelState = "waiting" | "working" | "stopping" | "complete" | "partial" | "failed" | "cancelled"

export function agentPanelState(view: Pick<AgentJobView, "status" | "cancelRequested">): AgentPanelState {
  switch (view.status) {
    case "queued":
      return view.cancelRequested ? "stopping" : "waiting"
    case "running":
      return view.cancelRequested ? "stopping" : "working"
    default:
      return view.status
  }
}

function phaseWords(phase: AgentPhase | null): string {
  switch (phase) {
    case "brief":
      return tt("Reading your description")
    case "plan":
      return tt("Planning pages")
    case "verify":
      return tt("Checking for errors")
    case "repair":
      return tt("Fixing problems")
    case "finish":
      return tt("Finishing up")
    case "build":
    default:
      return tt("Building your website")
  }
}

function reasonWords(code: AgentErrorCode | undefined): { title: string; message: string } {
  switch (code) {
    case "budget_time":
      return { title: tt("Out of time"), message: tt("This build used all the time it had. What it made is saved as a draft.") }
    case "budget_iterations":
      return { title: tt("Reached its step limit"), message: tt("This build took as many steps as one build may. What it made is saved as a draft.") }
    case "budget_spend":
      return { title: tt("Reached its AI spending limit"), message: tt("This build used the AI spend one build may. What it made is saved as a draft.") }
    case "budget_repairs":
      return { title: tt("Some problems could not be fixed"), message: tt("It tried a few times and stopped. What it made is saved as a draft.") }
    case "model_busy":
      return { title: tt("The AI is busy"), message: tt("The AI did not answer after a few tries. Nothing was lost.") }
    case "model_key":
      return { title: tt("Your AI key was refused"), message: tt("Check the key in Settings, then try again.") }
    case "too_long":
      return { title: tt("This build stalled"), message: tt("It stopped making progress. What it made is saved as a draft.") }
    case "not_available":
      return { title: tt("AI building is not on yet"), message: tt("This kind of build is not available right now.") }
    default:
      return { title: tt("Something went wrong"), message: tt("What was made so far is saved as a draft.") }
  }
}

/** Tools whose result has its own line (a file written, a page laid out, colours set). */
const SAID_BY_RESULT = new Set<string>(["write_file", "edit_file", "delete_file", "set_page_sections", "add_page", "set_tokens"])

/** One event as a line of the list, or null for the ones the list does not show. */
export function eventLine(e: AgentEvent): { text: string; tone: "phase" | "done" | "plain" | "problem" | "muted" } | null {
  switch (e.kind) {
    case "phase":
      /* Round O (O4): the design review is its own step in the list, said plainly. */
      if (e.phase === "verify" && /^Reviewing the design/.test(e.label ?? "")) return { text: tt("Reviewing the design"), tone: "phase" }
      return { text: phaseWords(e.phase), tone: "phase" }
    case "tool": {
      /* A file, page or colours line says these already, done: the tool line would say it twice. */
      if (e.ok !== false && SAID_BY_RESULT.has(e.tool)) return null
      const step = toolStep(e)
      return step ? { text: step, tone: e.ok === false ? "problem" : "plain" } : null
    }
    case "file": {
      const name = componentName(e.path)
      if (e.action === "created") return { text: tt("Wrote the {name} section", { name }), tone: "done" }
      if (e.action === "deleted") return { text: tt("Removed the {name} section", { name }), tone: "done" }
      return { text: tt("Changed the {name} section", { name }), tone: "done" }
    }
    case "page": {
      const title = e.title || e.page
      if (e.action === "created") return { text: tt("Made the {title} page", { title }), tone: "done" }
      if (e.action === "removed") return { text: tt("Removed the {title} page", { title }), tone: "done" }
      return { text: tt("Updated the {title} page", { title }), tone: "done" }
    }
    case "tokens":
      return { text: tt("Set colors and fonts"), tone: "done" }
    case "validation":
      return e.errors > 0 ? { text: tt("{count, plural, one {Found # problem} other {Found # problems}}", { count: e.errors }), tone: "problem" } : { text: tt("No errors found"), tone: "done" }
    case "repair":
      return { text: tt("Fixing the {name} section", { name: componentName(e.path) }), tone: "plain" }
    case "note":
      return { text: e.text, tone: "muted" }
    case "error": {
      /* The editor's canvas reported it (lib/ai-builder/preview-errors.ts): said by section, not as a script's own words. */
      const from = e as unknown as { source?: string; type?: string }
      if (from.source === "preview") return { text: tt("The {name} section showed an error on the page", { name: componentName(from.type || "section") }), tone: "problem" }
      return { text: e.message, tone: "problem" }
    }
    default:
      return null
  }
}

const BUTTON = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] px-4 text-[14px] font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:rounded-lg sm:px-3.5 sm:text-[13px] [-webkit-tap-highlight-color:transparent]"
const PRIMARY = `${BUTTON} bg-[#1a1a2e] text-white hover:bg-[#2d2d44]`
const SECONDARY = `${BUTTON} border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa]`

/** The newest lines the list draws. */
const LINES = 60

export function AgentProgressPanel({
  view,
  events,
  busy,
  problem,
  onCancel,
  onContinue,
  onStartOver,
  onClose,
  onUndo,
  startCollapsed = false,
}: {
  view: AgentJobView
  events: AgentEvent[]
  busy: null | "cancel" | "continue" | "start_over" | "undo"
  problem: string | null
  onCancel: () => void
  onContinue: () => void
  onStartOver: () => void
  onClose: () => void
  /** Redesign with AI (round M): puts back the backup taken before the job ran. */
  onUndo?: () => void
  /** On a phone: the list of steps starts closed, so the canvas stays in view (round N). */
  startCollapsed?: boolean
}) {
  const [collapsed, setCollapsed] = React.useState(startCollapsed)
  const state = agentPanelState(view)
  /* A Redesign with AI job: a change to a website that exists, with a way back. */
  const redesign = view.redesign ?? null
  const undone = redesign?.undo === "done"
  const live = state === "waiting" || state === "working" || state === "stopping"
  const lines = React.useMemo(() => {
    const out: { seq: number; text: string; tone: NonNullable<ReturnType<typeof eventLine>>["tone"] }[] = []
    for (const e of events) {
      const l = eventLine(e)
      if (l) out.push({ seq: e.seq, ...l })
    }
    return out.slice(-LINES)
  }, [events])

  /* The list follows the newest line, unless the person scrolled up to read. */
  const list = React.useRef<HTMLOListElement>(null)
  const pinned = React.useRef(true)
  React.useLayoutEffect(() => {
    const el = list.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [lines.length, collapsed])

  const reason = view.error ? reasonWords(view.error.code) : null
  const actions: RecoveryAction[] = undone ? [] : state === "cancelled" ? (view.continues.used < view.continues.max ? ["continue", "start_over"] : ["start_over"]) : view.error?.actions ?? []

  const title = undone
    ? tt("AI changes undone")
    : redesign && state === "complete"
      ? tt("Your changes are ready")
      : redesign && state === "partial"
        ? tt("Your changes are ready, with a few gaps")
        : state === "complete"
      ? tt("Your website is ready")
      : state === "partial"
        ? tt("Your website is ready, with a few gaps")
        : state === "failed"
          ? reason?.title ?? tt("Building stopped")
          : state === "cancelled"
            ? tt("Building cancelled")
            : state === "stopping"
              ? tt("Stopping…")
              : state === "waiting"
                ? tt("Waiting to start")
                : phaseWords(view.phase)

  /* What it is on now, in plain words (round N). */
  const step = live && state !== "stopping" ? currentStep(events) : null
  const counts: string[] = []
  if (view.counts.pagesPlanned && view.counts.pagesDone !== undefined) counts.push(tt("{done} of {total} pages done", { done: view.counts.pagesDone, total: view.counts.pagesPlanned }))
  if (view.counts.componentsWritten) counts.push(tt("{count, plural, one {# section written} other {# sections written}}", { count: view.counts.componentsWritten }))

  const line = undone
    ? tt("Your website is back as it was before this AI job. Nothing went live.")
    : redesign && state === "complete" && !view.summary
      ? tt("A backup was saved before the AI started. Undo puts it back.")
      : state === "complete"
      ? view.summary || tt("Every section is yours to edit. Publish when you are happy with it.")
      : state === "partial"
        ? reason?.message ?? view.summary ?? tt("Some parts were left out rather than made up. Ask AI to fix them, or edit them yourself.")
        : state === "failed"
          ? reason?.message ?? tt("What was made so far is saved as a draft.")
          : state === "cancelled"
            ? tt("What was made so far is saved as a draft.")
            : state === "stopping"
              ? tt("It stops after the step it is on. What it made stays as a draft.")
              : step || counts.length
                ? [step, ...counts].filter(Boolean).join(" · ")
                : tt("You can close this tab: it keeps going.")

  const gaps = state === "partial" || state === "complete" ? view.notes.slice(0, 4) : []
  /* Round O (O4): the first screen the design review last looked at, when it kept one (a private file, signed by the route). */
  const reviewShot = React.useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e.kind === "note" && e.shot) return e.seq
    }
    return null
  }, [events])
  const icon = live ? (
    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
  ) : state === "failed" || state === "cancelled" ? (
    <RotateCw className="h-4 w-4" />
  ) : (
    <Sparkles className="h-4 w-4" strokeWidth={2.2} />
  )

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={redesign ? tt("Redesign with AI") : tt("Start with AI")}
      data-agent-generation={state}
      data-collapsed={collapsed ? "" : undefined}
      className="pointer-events-auto flex max-h-[min(52vh,480px)] w-full flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white text-[#1a1a2e] shadow-[0_8px_30px_rgba(16,24,40,0.12)]"
    >
      <div className={cn("flex items-start gap-3 px-4", collapsed ? "pt-3" : "pt-4")}>
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            live ? "bg-[#f3f4f6] text-[#1a1a2e]" : state === "failed" ? "bg-[#fef3f2] text-[#b42318]" : state === "cancelled" ? "bg-[#f3f4f6] text-[#4b5563]" : "bg-[#1a1a2e] text-white",
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-snug" data-agent-title="">
            {title}
          </h2>
          <p className={cn("mt-0.5 text-[13px] leading-snug text-[#6b7280]", collapsed && "truncate")} data-agent-line="">
            {line}
          </p>
        </div>
        {lines.length > 0 && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? tt("Show steps") : tt("Hide steps")}
            data-agent-toggle=""
            className="-mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
          >
            <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform duration-150 motion-reduce:transition-none", !collapsed && "rotate-180")} />
          </button>
        )}
        {live ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={state === "stopping" || busy === "cancel"}
            data-agent-cancel=""
            className="-mr-1 -mt-1 h-9 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#6b7280] outline-none hover:bg-[#f3f4f6] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {tt("Cancel")}
          </button>
        ) : (
          <button type="button" onClick={onClose} aria-label={tt("Close")} className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {lines.length > 0 && !collapsed && (
        <ol
          ref={list}
          onScroll={(e) => {
            const el = e.currentTarget
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
          }}
          aria-label={tt("What it did")}
          data-agent-events=""
          className="mx-4 mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain border-t border-[#f3f4f6] pt-2.5 text-[13px] leading-snug [scrollbar-width:thin]"
        >
          {lines.map((l, i) => {
            const newest = live && i === lines.length - 1 && l.tone !== "phase"
            return (
              <li key={l.seq} data-tone={l.tone} className={cn("flex min-w-0 items-start gap-2", l.tone === "phase" && i > 0 && "pt-1.5")}>
                <span aria-hidden className="mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                  {l.tone === "done" ? (
                    <Check className="h-3.5 w-3.5 text-[#1a1a2e]" strokeWidth={2.6} />
                  ) : newest ? (
                    <Loader2 className="h-3 w-3 animate-spin text-[#6b7280] motion-reduce:animate-none" />
                  ) : (
                    <span className={cn("h-1.5 w-1.5 rounded-full", l.tone === "problem" ? "bg-[#b42318]" : l.tone === "phase" ? "bg-[#1a1a2e]" : "bg-[#d1d5db]")} />
                  )}
                </span>
                <span className={cn("min-w-0 break-words", l.tone === "phase" ? "font-semibold text-[#1a1a2e]" : l.tone === "problem" ? "text-[#b42318]" : l.tone === "muted" ? "text-[#9ca3af]" : "text-[#4b5563]")}>{l.text}</span>
              </li>
            )
          })}
        </ol>
      )}

      {reviewShot !== null && !collapsed && (
        <figure className="mx-4 mt-3" data-agent-review-shot="">
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed address, not an optimisable asset */}
          <img
            src={`/api/website-builder/ai-jobs/${encodeURIComponent(view.id)}/review-shot?v=${reviewShot}`}
            alt={tt("The first screen of your website, as the design review saw it")}
            loading="lazy"
            className="block h-28 w-full rounded-lg border border-[#e5e7eb] bg-[#f8f9fa] object-cover object-top"
          />
          <figcaption className="mt-1 text-[12px] text-[#9ca3af]">{tt("What the design review looked at")}</figcaption>
        </figure>
      )}

      {gaps.length > 0 && (
        <ul className="mx-4 mt-3 space-y-1 rounded-lg bg-[#f8f9fa] px-3 py-2 text-[12.5px] leading-snug text-[#4b5563]">
          {gaps.map((g, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden>•</span>
              <span className="min-w-0">{g}</span>
            </li>
          ))}
        </ul>
      )}

      {problem && (
        <p role="alert" className="mx-4 mt-3 text-[12.5px] leading-snug text-[#b42318]">
          {problem}
        </p>
      )}

      {!live && (
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-4 pt-3">
          {redesign?.undo === "available" && onUndo && (
            <button type="button" className={cn(SECONDARY, "mr-auto")} onClick={onUndo} disabled={!!busy} data-agent-undo="">
              {busy === "undo" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Undo2 className="h-4 w-4" />}
              {tt("Undo this AI job")}
            </button>
          )}
          {actions.includes("start_over") && (
            <button type="button" className={SECONDARY} onClick={onStartOver} disabled={!!busy} data-agent-start-over="">
              {busy === "start_over" && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
              {tt("Start over")}
            </button>
          )}
          {(actions.includes("continue") || actions.includes("retry")) && (
            <button type="button" className={state === "partial" ? SECONDARY : PRIMARY} onClick={onContinue} disabled={!!busy} data-agent-continue="">
              {busy === "continue" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RotateCw className="h-4 w-4" />}
              {actions.includes("continue") ? tt("Continue") : tt("Try again")}
            </button>
          )}
          {(state === "complete" || state === "partial" || undone) && (
            <button type="button" className={PRIMARY} onClick={onClose} data-agent-done="">
              {undone || redesign ? tt("Done") : tt("See your website")}
            </button>
          )}
        </div>
      )}
      {live && <div className={collapsed ? "pb-3" : "pb-4"} />}
    </section>
  )
}
