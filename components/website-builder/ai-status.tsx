"use client"

/**
 * ===========================================================================
 *  WHAT STORELIB AI IS DOING, IN ONE LINE THAT MOVES
 * ===========================================================================
 * "Working" beside a spinner said the same thing for the whole of a run
 * that can take a minute, so a creator could not tell a slow answer from a
 * stuck one. This is one line that says what stage it is at, "Starting",
 * "Thinking", "Checking it", with a slow sweep of light across the words so
 * it is plainly alive, and a short fade each time the words change.
 *
 * The words come from the run itself wherever the server says: the section
 * writer streams each stage, and the page agent's plan, steps and notes are
 * what move it on. Between two reports the line says only what is true of
 * the whole wait ("Thinking"), never a made-up percentage.
 *
 * Still, under reduced motion: the sweep and the fade are the decoration,
 * and the words are the information.
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export function AiStatus({ label, className }: { label: string; className?: string }) {
  return (
    <p role="status" aria-live="polite" className={cn("flex items-center gap-2 text-[12.5px] leading-5", className)}>
      <span aria-hidden className="ai-status-dot" />
      {/* Keyed on the words, so a new stage fades in rather than snapping. */}
      <span key={label} className="ai-status-text">
        {label}
      </span>
    </p>
  )
}

/**
 * A stage that has lasted a while says so in its own terms: "Thinking" on a
 * section becomes "Writing the section" once the model has had long enough
 * to be writing it. `after` is in milliseconds from when `stage` began.
 */
export function useStageLabel(stage: string | null, labels: Record<string, string>, later: Record<string, { after: number; label: string }> = {}): string | null {
  const [since, setSince] = React.useState(0)
  const [now, setNow] = React.useState(0)
  React.useEffect(() => {
    if (!stage) return
    const start = Date.now()
    setSince(start)
    setNow(start)
    const next = later[stage]
    if (!next) return
    const timer = window.setTimeout(() => setNow(Date.now()), next.after + 20)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])
  if (!stage) return null
  const next = later[stage]
  if (next && now - since >= next.after) return next.label
  return labels[stage] ?? null
}
