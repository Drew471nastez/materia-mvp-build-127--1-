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
 *
 * AN AGENT JOB (round L, engine "agent") answers events, not operations: the
 * agent writes the drafts itself, so the editor reads them again when files
 * or pages change (`onAgentChange`) and when it ends. Followed by:
 *
 *   LIVE    the owner's own realtime topic (lib/realtime/own-topic.ts, SQL
 *           part 370): a batch of events written says { job_id, seq }, and
 *           the view asks for what is after its cursor at once.
 *   POLL    the fallback, cheap: 2 s, backing off to 10 s while nothing new
 *           comes (to 20 s when realtime is up, as a check), paused while the
 *           tab is hidden, stopped when the job ends. A reload or reconnect
 *           carries on from the last seq it holds.
 *   ACT     Cancel (the runner stops at its next safe point, drafts kept),
 *           Continue / Try again (idempotent), Start over (a new job, its own
 *           key, on the same website).
 *
 * ROUND N (N1, "I cannot see it"): the job is followed from the editor's
 * first frame, not once the website has loaded. Before, the classic poll
 * waited for `ready`, and only its first answer said "this is an agent job",
 * so the progress view appeared seconds after the editor did. Now one probe
 * goes out at once: an agent job's events are read straight away and the
 * progress view shows while the editor is still opening; a classic job's
 * operations still wait for `ready` (they land on what the editor holds).
 * The editor is told about draft changes only once it is ready, with the
 * events that made them (`onAgentChange(finished, events)`), so it can read
 * the page the agent is on and follow it (./live-build.ts).
 */
import * as React from "react"
import type { ThemeOp } from "../agent/operations"
import type { JobView } from "./job"
import type { AgentEvent } from "@/lib/ai-builder/types"
import { agentSettled, type AgentJobView } from "./agent-progress"
import { listenOwn } from "@/lib/realtime/own-topic"
import { browserSupabase } from "@/lib/supabase/browser-lazy"
import { newStartKey } from "../start-handoff"

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

/* ── agent jobs: pure pieces, tested ─────────────────────────────────────── */

/*
  Round N (N1): someone is watching the canvas fill in, so the fallback poll is quicker than it was (2 s backing off to
  10 s): 1.5 s, backing off to 5 s while nothing new comes. One light read (the events after a cursor) per open editor,
  only while a build runs, and realtime makes it a 20 s check anyway.
*/
export const AGENT_POLL_MIN_MS = 1_500
export const AGENT_POLL_MAX_MS = 5_000
/** With realtime up, the poll is only a check that nothing was missed. */
export const AGENT_POLL_LIVE_MS = 20_000
/** Events the view keeps in memory (the newest). */
export const AGENT_EVENTS_KEPT = 300

/** How long to wait before the next poll. Null: do not poll (ended, or the tab is hidden). */
export function agentPollDelay(o: { settled: boolean; hidden: boolean; realtime: boolean; idle: number }): number | null {
  if (o.settled || o.hidden) return null
  if (o.realtime) return AGENT_POLL_LIVE_MS
  return Math.min(AGENT_POLL_MAX_MS, Math.round(AGENT_POLL_MIN_MS * Math.pow(1.6, Math.max(0, o.idle))))
}

/** Adds events to a list once each, in seq order, keeping the newest `cap`. Pure. */
export function mergeEvents(list: AgentEvent[], incoming: AgentEvent[], cap = AGENT_EVENTS_KEPT): AgentEvent[] {
  if (!incoming.length) return list
  const seen = new Set(list.map((e) => e.seq))
  const added = incoming.filter((e) => Number.isFinite(e.seq) && !seen.has(e.seq))
  if (!added.length) return list
  const all = [...list, ...added].sort((a, b) => a.seq - b.seq)
  return all.length > cap ? all.slice(all.length - cap) : all
}

/** Whether new events changed the website's drafts (the canvas reads them again). */
export function changesDrafts(events: AgentEvent[]): boolean {
  return events.some((e) => e.kind === "file" || e.kind === "page" || e.kind === "tokens")
}

export interface AgentGeneration {
  view: AgentJobView | null
  /** Every event so far (the newest AGENT_EVENTS_KEPT). */
  events: AgentEvent[]
  busy: null | "cancel" | "continue" | "start_over" | "undo"
  /** A press that was refused, in plain words. */
  problem: string | null
  cancel: () => void
  resume: () => void
  startOver: () => void
  /** Redesign with AI (round M): restores the backup taken before the job ran (POST ai-jobs/<id>/undo). True when it was undone. */
  undo: () => Promise<boolean>
}

/** What Undo this AI job answered: what was removed with it, and what was kept because the person made it. */
export interface UndoAnswer {
  removed: { kind: "page" | "file"; key: string }[]
  kept: { kind: "page" | "file"; key: string; reason: string }[]
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
  /**
   * FREE DESIGN: the job coded new section files (its header, its footer, its own sections). The editor reads them
   * before any operation that places one is replayed, so the canvas draws the section the moment it lands. Resolves
   * once the new files are in the editor.
   */
  onFiles?: (paths: string[]) => Promise<void>
  /**
   * An agent job changed drafts (files, pages, tokens): read them again. `finished` once it ended. `events` are the
   * new events that changed them (a page event says which page the agent is on). Only called once the editor is ready.
   */
  onAgentChange?: (finished: boolean, events: AgentEvent[]) => void
  /** An agent job was started over: the new job's id (the editor remembers it for a reload). */
  onJobChange?: (jobId: string) => void
  /** A Redesign with AI job was undone: the draft is the backup again (the editor reads the website again). */
  onUndone?: (answer: UndoAnswer) => void
}): { view: JobView | null; continuing: boolean; resume: () => void; agent: AgentGeneration } {
  const { installId, source, ready } = input
  const [view, setView] = React.useState<JobView | null>(null)
  /* Set when the job answers as an agent job: the classic poll stops and the agent follower takes over. */
  const [agentJob, setAgentJob] = React.useState<string | null>(null)
  const [continuing, setContinuing] = React.useState(false)
  const cursor = React.useRef(0)
  const started = React.useRef(false)
  const finished = React.useRef(false)
  const checkpoint = React.useRef<unknown>(null)
  const pagesSeen = React.useRef("")
  const filesSeen = React.useRef("")
  const latest = React.useRef(input)
  latest.current = input
  const [round, setRound] = React.useState(0)

  /* One view in: its operations onto the canvas, its pages into the switcher, its ending closing the undo step. */
  const take = React.useCallback(async (next: JobView) => {
    const cb = latest.current
    /* New files first: an operation that places a coded section waits for its file to be in the editor. */
    const files = JSON.stringify(next.files ?? [])
    if (files !== filesSeen.current && (next.files ?? []).length) {
      filesSeen.current = files
      try {
        await cb.onFiles?.(next.files)
      } catch {
        /* the section is placed with the copy the operation carries; the next save reads its file */
      }
    }
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
    if (!source || source.kind !== "job") return
    if (agentJob === source.jobId) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (stop) return
      try {
        const res = await fetch(`/api/website-builder/ai-jobs/${source.jobId}?after=${cursor.current}`, { cache: "no-store" })
        if (res.ok) {
          const answer = (await res.json()) as JobView | AgentJobView
          if ((answer as AgentJobView).engine === "agent") {
            setAgentJob(source.jobId)
            return
          }
          /* Round N: the probe sent before the editor is ready only asks which engine; a classic job's operations wait for it (this runs again then). */
          if (!ready) return
          const next = answer as JobView
          await take(next)
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
  }, [source, ready, take, round, agentJob])

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
              await take(line.job.step !== "done" && line.job.status === "running" ? { ...line.job, status: "partial", error: "The time for one request ran out." } : line.job)
            } else await take(line.job)
          }
        }
      } catch {
        if (controller.signal.aborted) return
        setView((was) => ({ ...(was ?? { id: "", installId, step: "plan", progress: 0, seq: 0, ops: [], pages: [], notes: [], findings: [], credits: 0, files: [], activity: [] }), status: "failed", error: "The connection was lost." }) as JobView)
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

  const agent = useAgentJob(agentJob, ready, input)
  return { view, continuing, resume, agent }
}

/* ── an agent job: realtime first, a backing off poll under it ──────────── */

function useAgentJob(
  firstJobId: string | null,
  ready: boolean,
  input: { onAgentChange?: (finished: boolean, events: AgentEvent[]) => void; onJobChange?: (jobId: string) => void; onUndone?: (answer: UndoAnswer) => void; onPages: (pages: { key: string; title: string }[]) => void },
): AgentGeneration {
  const [jobId, setJobId] = React.useState<string | null>(firstJobId)
  React.useEffect(() => setJobId(firstJobId), [firstJobId])
  const [view, setView] = React.useState<AgentJobView | null>(null)
  const [events, setEvents] = React.useState<AgentEvent[]>([])
  const [busy, setBusy] = React.useState<AgentGeneration["busy"]>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [round, setRound] = React.useState(0)
  const latest = React.useRef(input)
  latest.current = input
  const poke = React.useRef<() => void>(() => {})
  /*
    Round N: the events are read from the editor's first frame (the progress view shows while it opens); what they
    changed is handed to the editor once it is ready. Until then they wait here, and go over in one call.
  */
  const readyRef = React.useRef(ready)
  readyRef.current = ready
  const waiting = React.useRef<{ events: AgentEvent[]; finished: boolean } | null>(null)
  const tell = React.useCallback((finished: boolean, fresh: AgentEvent[]) => {
    if (readyRef.current) {
      latest.current.onAgentChange?.(finished, fresh)
      return
    }
    const was = waiting.current
    waiting.current = { events: [...(was?.events ?? []), ...fresh], finished: finished || !!was?.finished }
  }, [])
  React.useEffect(() => {
    if (!ready || !waiting.current) return
    const held = waiting.current
    waiting.current = null
    latest.current.onAgentChange?.(held.finished, held.events)
  }, [ready])

  React.useEffect(() => {
    if (!jobId) return
    let stop = false
    let cursor = 0
    let idle = 0
    let realtime = false
    let ended = false
    let inflight = false
    let again = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let unlisten: (() => void) | null = null
    const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden"
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = null
      const delay = agentPollDelay({ settled: ended, hidden: hidden(), realtime, idle })
      if (delay !== null && !stop) timer = setTimeout(() => void fetchNow(), delay)
    }
    const fetchNow = async (): Promise<void> => {
      if (stop) return
      if (inflight) {
        again = true
        return
      }
      inflight = true
      try {
        const res = await fetch(`/api/website-builder/ai-jobs/${jobId}?after=${cursor}`, { cache: "no-store" })
        if (res.status === 404) {
          ended = true
          return
        }
        if (res.ok) {
          const next = (await res.json()) as AgentJobView
          if (stop) return
          const fresh = next.events ?? []
          idle = fresh.length ? 0 : idle + 1
          if (fresh.length) cursor = Math.max(cursor, fresh[fresh.length - 1].seq)
          setEvents((was) => mergeEvents(was, fresh))
          const pages = fresh.flatMap((e) => (e.kind === "page" && e.action !== "removed" ? [{ key: e.page, title: e.title }] : []))
          if (pages.length) latest.current.onPages(pages)
          setView({ ...next, events: [] })
          const done = agentSettled(next) && !next.more
          if (changesDrafts(fresh) && !done) tell(false, fresh)
          if (done && !ended) {
            ended = true
            tell(true, fresh)
          }
          if (next.more) again = true
        } else idle++
      } catch {
        idle++ /* offline for a moment: the next one asks again */
      } finally {
        inflight = false
      }
      if (again && !stop) {
        again = false
        return fetchNow()
      }
      schedule()
    }
    poke.current = () => {
      idle = 0
      void fetchNow()
    }
    const onVisible = () => {
      if (!hidden()) void fetchNow()
    }
    document.addEventListener("visibilitychange", onVisible)
    void fetchNow()
    /* Told on the owner's own topic when a batch of events lands. */
    void (async () => {
      try {
        const supabase = await browserSupabase()
        const { data } = await supabase.auth.getSession()
        const userId = data.session?.user?.id
        if (stop || !userId) return
        realtime = true
        unlisten = listenOwn(
          supabase,
          userId,
          "ai_job",
          (p) => {
            if (p.job_id === jobId && (Number(p.seq) || 0) > cursor) {
              idle = 0
              void fetchNow()
            }
          },
          () => {
            /* The topic was refused (part 370 not run): the poll is the only way. */
            realtime = false
            schedule()
          },
        )
        if (stop) unlisten()
        else schedule()
      } catch {
        realtime = false
      }
    })()
    return () => {
      stop = true
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
      if (unlisten) unlisten()
    }
  }, [jobId, round, tell])

  const post = React.useCallback(
    async (path: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
      try {
        const res = await fetch(`/api/website-builder/ai-jobs/${jobId}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
        return { ok: res.ok, data }
      } catch {
        return { ok: false, data: { error: "You seem to be offline. Try again in a moment." } }
      }
    },
    [jobId],
  )

  const cancel = React.useCallback(() => {
    if (!jobId || busy) return
    setBusy("cancel")
    setProblem(null)
    setView((v) => (v ? { ...v, cancelRequested: true } : v))
    void post("cancel").then((r) => {
      setBusy(null)
      if (!r.ok) {
        setProblem(String(r.data.error ?? "Could not cancel. Try again."))
        setView((v) => (v ? { ...v, cancelRequested: false } : v))
      }
      poke.current()
    })
  }, [jobId, busy, post])

  const resume = React.useCallback(() => {
    if (!jobId || busy) return
    setBusy("continue")
    setProblem(null)
    void post("continue", { action: "continue" }).then((r) => {
      setBusy(null)
      if (!r.ok) {
        setProblem(String(r.data.error ?? "Could not continue. Try again."))
        return
      }
      setView((v) => (v ? { ...v, status: "queued", error: null, cancelRequested: false } : v))
      setRound((n) => n + 1)
    })
  }, [jobId, busy, post])

  /* One key per press of Start over, kept until it is answered, so a retry of the same press is the same job. */
  const startKey = React.useRef<string | null>(null)
  const startOver = React.useCallback(() => {
    if (!jobId || busy) return
    setBusy("start_over")
    setProblem(null)
    startKey.current = startKey.current ?? newStartKey()
    void post("continue", { action: "start_over", key: startKey.current }).then((r) => {
      setBusy(null)
      const next = (r.data.job as { id?: string } | undefined)?.id
      if (!r.ok || !next) {
        setProblem(String(r.data.error ?? "Could not start again. Try again."))
        return
      }
      startKey.current = null
      setEvents([])
      setView(null)
      setJobId(next)
      latest.current.onJobChange?.(next)
    })
  }, [jobId, busy, post])

  const undo = React.useCallback(async (): Promise<boolean> => {
    if (!jobId || busy) return false
    setBusy("undo")
    setProblem(null)
    const r = await post("undo")
    setBusy(null)
    if (!r.ok) {
      setProblem(String(r.data.error ?? "Could not undo. Try again."))
      return false
    }
    setView((v) => (v && v.redesign ? { ...v, redesign: { ...v.redesign, undo: "done" } } : v))
    const added = (r.data.added ?? {}) as Partial<UndoAnswer>
    latest.current.onUndone?.({ removed: Array.isArray(added.removed) ? added.removed : [], kept: Array.isArray(added.kept) ? added.kept : [] })
    return true
  }, [jobId, busy, post])

  return { view, events, busy, problem, cancel, resume, startOver, undo }
}
