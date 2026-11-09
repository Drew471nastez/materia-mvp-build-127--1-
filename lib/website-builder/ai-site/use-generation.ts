"use client"

/**
 * ===========================================================================
 *  START WITH AI IN THE EDITOR: FOLLOWING THE JOB, FILLING THE CANVAS
 * ===========================================================================
 * The editor opens on the new website while the server builds it. This hook
 * follows the build and hands every operation it made to the editor's own
 * AI path (the burst queue and applyAiOp in the editor page), so the canvas
 * fills in section by section, the changes are marked unsaved like any AI
 * change, and the whole generation is ONE undo step: `onStart` takes the
 * snapshot before the first operation, `onFinish` closes the step.
 *
 *   JOB     GET /api/website-builder/ai-jobs/<id>?after=<seq> every 1.5 s
 *           (slower while the tab is hidden), operations after the cursor.
 *   INLINE  without SQL part 380: POST themes/<id>/generate and read its
 *           NDJSON lines; Continue sends the checkpoint back.
 *
 * Operations are for a page ("home", "about") or for every page ("*": theme
 * settings, the header and footer); only the open page's and the shared ones
 * are applied here, the other pages are in their drafts already.
 */
import * as React from "react"
import type { ThemeOp } from "../agent/operations"
import type { JobView } from "./job"

export type GenerationSource = { kind: "job"; jobId: string } | { kind: "inline"; prompt: string }

export const POLL_MS = 1_500
export const POLL_HIDDEN_MS = 6_000
/** The most operations one poll answers with (lib/website-builder/ai-site/job.ts publicView). */
export const OPS_PAGE = 400

/** Whether the view is finished (nothing more will come without Continue). */
export function settled(view: Pick<JobView, "status" | "step" | "error"> | null): boolean {
  if (!view) return false
  return view.step === "done" || view.status === "failed" || (view.status === "partial" && !!view.error)
}

/** The operations of a view to apply on `page`, in order. Pure. */
export function opsFor(view: Pick<JobView, "ops">, page: string): ThemeOp[] {
  return view.ops.filter((o) => o.page === "*" || o.page === page).map((o) => o.op)
}

export function useSiteGeneration(input: {
  installId: string
  source: GenerationSource | null
  /** The editor has loaded the website (operations land on what it holds). */
  ready: boolean
  page: string
  onStart: () => void
  onOp: (op: ThemeOp) => void
  onFinish: () => void
  onPages: (pages: { key: string; title: string }[]) => void
}): { view: JobView | null; continuing: boolean; resume: () => void } {
  const { installId, source, ready } = input
  const [view, setView] = React.useState<JobView | null>(null)
  const [continuing, setContinuing] = React.useState(false)
  const cursor = React.useRef(0)
  const started = React.useRef(false)
  const finished = React.useRef(false)
  const checkpoint = React.useRef<unknown>(null)
  const pagesSeen = React.useRef("")
  const latest = React.useRef(input)
  latest.current = input
  const [round, setRound] = React.useState(0)

  /* One view in: its operations onto the canvas, its pages into the switcher, its ending closing the undo step. */
  const take = React.useCallback((next: JobView) => {
    const cb = latest.current
    if (next.ops.length) {
      if (!started.current) {
        started.current = true
        cb.onStart()
      }
      for (const op of opsFor(next, cb.page)) cb.onOp(op)
    }
    /* A long backlog comes a page at a time: the cursor moves to the last operation taken until the job is caught up. */
    const caught = next.ops.length < OPS_PAGE
    cursor.current = caught ? Math.max(cursor.current, next.seq) : next.ops[next.ops.length - 1].seq
    const pages = JSON.stringify(next.pages)
    if (pages !== pagesSeen.current) {
      pagesSeen.current = pages
      cb.onPages(next.pages)
    }
    setView((was) => ({ ...next, ops: [], notes: next.notes.length ? next.notes : was?.notes ?? [] }))
    if (settled(next) && caught && !finished.current) {
      finished.current = true
      if (started.current) cb.onFinish()
    }
  }, [])

  /* ── a job on the server: poll ── */
  React.useEffect(() => {
    if (!source || source.kind !== "job" || !ready) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (stop) return
      try {
        const res = await fetch(`/api/website-builder/ai-jobs/${source.jobId}?after=${cursor.current}`, { cache: "no-store" })
        if (res.ok) {
          const next = (await res.json()) as JobView
          take(next)
          if (settled(next) && next.ops.length < OPS_PAGE) return
        } else if (res.status === 404) return
      } catch {
        /* offline for a moment: the next tick asks again */
      }
      if (!stop) timer = setTimeout(tick, document.visibilityState === "hidden" ? POLL_HIDDEN_MS : POLL_MS)
    }
    void tick()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
    }
  }, [source, ready, take, round])

  /* ── no job table: the build runs inside this request ── */
  React.useEffect(() => {
    if (!source || source.kind !== "inline" || !ready) return
    const controller = new AbortController()
    void (async () => {
      try {
        const res = await fetch(`/api/website-builder/themes/${installId}/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ prompt: source.prompt, checkpoint: checkpoint.current }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) throw new Error(String(res.status))
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let nl: number
          while ((nl = buffer.indexOf("\n")) >= 0) {
            const lineText = buffer.slice(0, nl).trim()
            buffer = buffer.slice(nl + 1)
            if (!lineText) continue
            const line = JSON.parse(lineText) as { type: string; job: JobView; checkpoint?: unknown }
            if (line.type === "end") {
              checkpoint.current = line.checkpoint ?? null
              /* Out of time with work left: stopped, with Continue. */
              take(line.job.step !== "done" && line.job.status === "running" ? { ...line.job, status: "partial", error: "The time for one request ran out." } : line.job)
            } else take(line.job)
          }
        }
      } catch {
        if (controller.signal.aborted) return
        setView((was) => ({ ...(was ?? { id: "", installId, step: "plan", progress: 0, seq: 0, ops: [], pages: [], notes: [], findings: [], credits: 0 }), status: "failed", error: "The connection was lost." }) as JobView)
      } finally {
        setContinuing(false)
      }
    })()
    return () => controller.abort()
  }, [source, ready, installId, take, round])

  const resume = React.useCallback(() => {
    if (!source) return
    setContinuing(true)
    finished.current = false
    if (source.kind === "job") {
      void fetch(`/api/website-builder/ai-jobs/${source.jobId}/continue`, { method: "POST" })
        .catch(() => undefined)
        .finally(() => {
          setContinuing(false)
          setView((was) => (was ? { ...was, status: "running", error: null } : was))
          setRound((n) => n + 1)
        })
    } else setRound((n) => n + 1)
  }, [source])

  return { view, continuing, resume }
}
