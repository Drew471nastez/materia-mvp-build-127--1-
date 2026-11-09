"use client"

/**
 * ===========================================================================
 *  START WITH AI IN THE EDITOR: THE PROGRESS VIEW
 * ===========================================================================
 * The editor opens on the new website at once and this card says what the
 * server is doing ("Planning your design…", "Writing pages…", "Adding
 * photos…", "Checking…") while the canvas fills in under it, section by
 * section, editable as it lands (lib/website-builder/ai-site/use-generation.ts
 * replays the job's operations through the editor's own AI path).
 *
 * Then one of three endings, said plainly:
 *   READY        the website is made; Done, or ask the AI for a change.
 *   WITH GAPS    made, and what was left out is listed; Ask AI to fix.
 *   STOPPED      a step failed part way; what was made is kept; Continue
 *                picks up where it stopped, or Ask AI to fix.
 *
 * Pure view: the hook owns the polling. The editor's own colours (a light
 * card in the Storelib UI), one column at a phone's width.
 */
import * as React from "react"
import { Check, Loader2, RotateCw, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import type { JobView } from "@/lib/website-builder/ai-site/job"

export type GenerationMode = "job" | "inline"
export type GenerationPhase = "working" | "complete" | "partial" | "stopped"

type View = Pick<JobView, "status" | "step" | "progress" | "error" | "notes" | "findings">

/** Which ending, if any, the view is in. */
export function generationPhase(view: View): GenerationPhase {
  if (view.step === "done") return view.status === "complete" ? "complete" : "partial"
  if (view.status === "failed" || (view.status === "partial" && view.error)) return "stopped"
  return "working"
}

/** The four steps the creator sees. Building the pages is part of planning the design. */
function stages(): { key: string; steps: JobView["step"][]; label: string; doing: string }[] {
  return [
    { key: "plan", steps: ["plan", "build"], label: tt("Design"), doing: tt("Planning your design…") },
    { key: "write", steps: ["write"], label: tt("Pages"), doing: tt("Writing pages…") },
    { key: "photos", steps: ["photos"], label: tt("Photos"), doing: tt("Adding photos…") },
    { key: "check", steps: ["check"], label: tt("Check"), doing: tt("Checking…") },
  ]
}

const BUTTON = "inline-flex h-11 items-center justify-center gap-1.5 rounded-[10px] px-4 text-[14px] font-semibold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:rounded-lg sm:px-3.5 sm:text-[13px] [-webkit-tap-highlight-color:transparent]"
const PRIMARY = `${BUTTON} bg-[#1a1a2e] text-white hover:bg-[#2d2d44]`
const SECONDARY = `${BUTTON} border border-[#e5e7eb] bg-white text-[#1a1a2e] hover:bg-[#f8f9fa]`

export function GenerationPanel({
  view,
  mode,
  onContinue,
  onAskFix,
  onClose,
  continuing = false,
}: {
  view: View
  mode: GenerationMode
  onContinue: () => void
  onAskFix: () => void
  onClose: () => void
  continuing?: boolean
}) {
  const phase = generationPhase(view)
  const list = stages()
  const at = list.findIndex((s) => s.steps.includes(view.step))
  const current = list[Math.max(0, at)]
  const progress = Math.max(2, Math.min(100, Math.round(view.progress)))
  const gaps = [...view.notes, ...view.findings].slice(0, 4)

  const title =
    phase === "complete" ? tt("Your website is ready") : phase === "partial" ? tt("Your website is ready, with a few gaps") : phase === "stopped" ? tt("Building stopped part way") : current.doing
  const line =
    phase === "complete"
      ? tt("Every section is yours to edit. Publish when you are happy with it.")
      : phase === "partial"
        ? tt("Some parts were left out rather than made up. Ask AI to fix them, or edit them yourself.")
        : phase === "stopped"
          ? tt("Everything made so far is kept. Continue picks up where it stopped.")
          : mode === "inline"
            ? tt("Keep this tab open while your website is built.")
            : tt("You can keep editing, or close this tab: it keeps going.")

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={tt("Start with AI")}
      data-generation={phase}
      className="pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white text-[#1a1a2e] shadow-[0_8px_30px_rgba(16,24,40,0.12)]"
    >
      <div className="flex items-start gap-3 px-4 pt-4">
        <span aria-hidden className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", phase === "working" ? "bg-[#f3f4f6] text-[#1a1a2e]" : phase === "stopped" ? "bg-[#fef3f2] text-[#b42318]" : "bg-[#1a1a2e] text-white")}>
          {phase === "working" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : phase === "stopped" ? <RotateCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" strokeWidth={2.2} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold leading-snug">{title}</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-[#6b7280]">{line}</p>
        </div>
        {phase !== "working" && (
          <button type="button" onClick={onClose} aria-label={tt("Close")} className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#6b7280] outline-none hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {(phase === "working" || phase === "stopped") && (
        <div className="px-4 pt-3">
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={tt("Progress")} className="h-1.5 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
            <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none", phase === "stopped" ? "bg-[#9ca3af]" : "bg-[#1a1a2e]")} style={{ width: `${progress}%` }} />
          </div>
          <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label={tt("Steps")}>
            {list.map((s, i) => {
              const done = at > i
              const now = at === i && phase === "working"
              return (
                <li key={s.key} className="flex min-w-0 items-center gap-1.5 text-[12px]" aria-current={now ? "step" : undefined}>
                  <span aria-hidden className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full", done ? "bg-[#1a1a2e] text-white" : now ? "border-2 border-[#1a1a2e]" : "border border-[#d1d5db]")}>
                    {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                  </span>
                  <span className={cn("truncate", done || now ? "font-medium text-[#1a1a2e]" : "text-[#9ca3af]")}>{s.label}</span>
                </li>
              )
            })}
          </ol>
        </div>
      )}

      {(phase === "partial" || phase === "stopped") && gaps.length > 0 && (
        <ul className="mx-4 mt-3 space-y-1 rounded-lg bg-[#f8f9fa] px-3 py-2 text-[12.5px] leading-snug text-[#4b5563]">
          {gaps.map((g, i) => (
            <li key={i} className="flex gap-1.5">
              <span aria-hidden>•</span>
              <span className="min-w-0">{g}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 px-4 pb-4 pt-3">
        {phase === "stopped" && (
          <>
            <button type="button" className={SECONDARY} onClick={onAskFix}>
              {tt("Ask AI to fix")}
            </button>
            <button type="button" className={PRIMARY} onClick={onContinue} disabled={continuing} data-generation-continue="">
              {continuing ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RotateCw className="h-4 w-4" />}
              {tt("Continue")}
            </button>
          </>
        )}
        {phase === "partial" && (
          <>
            <button type="button" className={SECONDARY} onClick={onClose}>
              {tt("Done")}
            </button>
            <button type="button" className={PRIMARY} onClick={onAskFix}>
              {tt("Ask AI to fix")}
            </button>
          </>
        )}
        {phase === "complete" && (
          <>
            <button type="button" className={SECONDARY} onClick={onAskFix}>
              {tt("Ask AI for a change")}
            </button>
            <button type="button" className={PRIMARY} onClick={onClose}>
              {tt("Done")}
            </button>
          </>
        )}
      </div>
    </section>
  )
}
