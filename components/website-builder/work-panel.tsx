"use client"

/**
 * ===========================================================================
 *  WHAT IT IS DOING, WHILE IT IS DOING IT
 * ===========================================================================
 * A run used to show one line of commentary that the next line replaced. You
 * could watch it for twenty seconds and learn nothing except that it was
 * still going — and afterwards there was no record of how a page had got the
 * way it was beyond a count of changes.
 *
 * This is the run, in three parts, in the order they arrive:
 *
 *   THE PLAN      what it said it was going to do, before it did any of it.
 *   THE STEPS     one line per tool call it actually made, ticking off as
 *                 each finishes.
 *   THE CODE      the source of any section it wrote, as it was written.
 *
 * NOTHING HERE IS A PROGRESS BAR. Every step is a real call, named against
 * the page it was made on. A list that is timed to look busy tells you
 * nothing you could act on, and the first time it disagrees with what
 * actually happened nobody believes any of it again.
 */

import * as React from "react"
import { Check, ChevronRight, Loader2, X } from "lucide-react"

import { cn } from "@/lib/utils"

export interface WorkStep {
  id: string
  label: string
  state: "running" | "done" | "failed"
}

export interface WorkCode {
  path: string
  source: string
}

export function WorkPanel({
  plan,
  steps,
  code,
  running,
  onOpenCode,
}: {
  plan?: string
  steps: WorkStep[]
  code: WorkCode[]
  running: boolean
  /** Opens a written file in the code editor, where it can be read properly. */
  onOpenCode?: (path: string) => void
}) {
  /**
   * OPEN WHILE IT IS WORKING, SHUT ONCE IT IS DONE.
   *
   * The list is worth watching live and worth keeping afterwards, but it is
   * not worth re-reading every time you scroll past an old exchange. It
   * collapses itself when the run ends, and `touched` means a panel somebody
   * opened by hand stays the way they left it.
   */
  const [open, setOpen] = React.useState(true)
  const touched = React.useRef(false)
  React.useEffect(() => {
    if (!running && !touched.current) setOpen(false)
  }, [running])

  if (!plan && steps.length === 0 && code.length === 0) return null

  const done = steps.filter((s) => s.state === "done").length
  const failed = steps.filter((s) => s.state === "failed").length

  return (
    <div
      /**
       * Hooks for scripts/check-work-panel.mjs. Selecting these by their text
       * matched whichever ancestor came first in document order, which is how
       * the last probe measured the wrong element's pointer-events.
       */
      data-work-panel=""
      data-open={open ? "true" : "false"}
      data-running={running ? "true" : "false"}
      className="mb-2 overflow-hidden rounded-lg border border-border bg-muted/30"
    >
      <button
        data-toggle=""
        type="button"
        onClick={() => { touched.current = true; setOpen((was) => !was) }}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <ChevronRight
          className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          strokeWidth={2.5}
        />
        {running ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" strokeWidth={2} />
        ) : failed > 0 ? (
          <X className="h-3 w-3 shrink-0 text-amber-600" strokeWidth={2.5} />
        ) : (
          <Check className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2.5} />
        )}
        <span data-summary="" className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
          {running
            ? steps.find((s) => s.state === "running")?.label ?? "Working"
            : `${steps.length} step${steps.length === 1 ? "" : "s"}${failed > 0 ? `, ${failed} did not land` : ""}`}
        </span>
        {steps.length > 0 && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
            {done}/{steps.length}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-border/60 px-2.5 py-2">
          {plan && (
            <p data-plan="" className="mb-2 whitespace-pre-wrap text-[12.5px] leading-snug text-foreground/80">{plan}</p>
          )}

          {steps.length > 0 && (
            <ul className="space-y-1">
              {steps.map((step) => (
                <li key={step.id} data-step={step.state} className="flex items-start gap-1.5 text-[12px] leading-snug">
                  <span className="mt-[3px] flex h-3 w-3 shrink-0 items-center justify-center">
                    {step.state === "running" ? (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" strokeWidth={2} />
                    ) : step.state === "failed" ? (
                      <X className="h-3 w-3 text-amber-600" strokeWidth={2.5} />
                    ) : (
                      <Check className="h-3 w-3 text-foreground/50" strokeWidth={2.5} />
                    )}
                  </span>
                  <span
                    className={cn(
                      "min-w-0",
                      step.state === "running" ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {step.label}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {code.map((file) => (
            <CodeBlock key={file.path} file={file} onOpenCode={onOpenCode} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A file it wrote. Capped in height rather than shown whole: a section is
 * two hundred lines and this is a chat panel, not the code editor — which is
 * one click away and is where you would actually read it.
 */
function CodeBlock({ file, onOpenCode }: { file: WorkCode; onOpenCode?: (path: string) => void }) {
  const lines = file.source.split("\n").length
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5">
        <span data-code-path="" className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{file.path}</span>
        <span className="shrink-0 text-[10.5px] tabular-nums text-muted-foreground/60">{lines} lines</span>
        {onOpenCode && (
          <button
            type="button"
            onClick={() => onOpenCode(file.path)}
            className="shrink-0 text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
          >
            Open
          </button>
        )}
      </div>
      {/* The one thing in a thread that scrolls sideways, inside itself: a
          line of code is not broken, and the thread around it never moves. */}
      <pre data-code-scroll="" className="max-h-56 overflow-auto max-w-full overscroll-contain px-2 py-1.5 text-[11px] leading-[1.45] [overflow-wrap:normal] [touch-action:pan-x_pan-y]">
        <code className="font-mono text-foreground/80">{file.source}</code>
      </pre>
    </div>
  )
}
