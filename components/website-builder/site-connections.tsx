"use client"

/**
 * ===========================================================================
 *  WHAT THIS SITE IS CONNECTED TO, AND WHAT IT IS DOING RIGHT NOW
 * ===========================================================================
 * Three pieces, one channel.
 *
 *   useSiteActivity    reads the brief once when the editor opens (and again
 *                      when Website settings closes), then follows the
 *                      activity log while something is connected and the tab
 *                      is on screen. Nothing is connected, nothing is asked.
 *   ConnectionButton   the top bar's mark: whichever connection acted last,
 *                      with a dot when it is live and a slow pulse while it
 *                      is working. lib/agent-access/connection-mark.ts decides.
 *   LiveChangeNotice   the note that hangs under that mark while an agent or a
 *                      push is changing the site: who, a line per change, and
 *                      then "Done, 3 changes", which fades unless hovered.
 *
 * The channel is the one the editor already had for putting an agent's new
 * section on the page (app/api/.../agent-activity), made cheaper: one indexed
 * read, quick while changes arrive, backing off to one read every twenty
 * seconds, none while the tab is hidden.
 */
import { useCallback, useEffect, useRef, useState, type Ref, type RefObject } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AnchoredPanel, CHROME_POPOVER_Z } from "@/components/website-builder/anchored-panel"
import { ConnectionMarkIcon } from "@/components/website-builder/connection-marks"
import {
  POLL_BASE_MS,
  RECENT_MS,
  actedRecently,
  connectionTip,
  isGitHubName,
  kindForName,
  nextPollDelay,
  type ActivityEvent,
  type ConnectionKind,
  type ConnectionMark,
  type ConnectionsBrief,
} from "@/lib/agent-access/connection-mark"

/* ── The channel ───────────────────────────────────────────────────────── */

export function useSiteActivity({
  installId,
  recheck,
  onEvents,
  onSyncChanged,
}: {
  installId: string
  /** Any value; the brief is read again when it changes. */
  recheck?: unknown
  /** New lines from the log, oldest first. Awaited before the next read. */
  onEvents: (events: ActivityEvent[]) => void | Promise<void>
  /** The GitHub link changed since the last read (a push taken or refused, a send that failed): read the sync report again. */
  onSyncChanged?: () => void
}): { brief: ConnectionsBrief | null; following: boolean; settled: boolean } {
  const [brief, setBrief] = useState<ConnectionsBrief | null>(null)
  const [ready, setReady] = useState(false)
  /** The first read has come back, with an answer or without one. */
  const [settled, setSettled] = useState(false)
  const cursor = useRef<number | null>(null)
  const onEventsRef = useRef(onEvents)
  onEventsRef.current = onEvents
  const onSyncRef = useRef(onSyncChanged)
  onSyncRef.current = onSyncChanged
  /** When the link last changed, as last read; undefined until the first answer. */
  const syncAt = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (!installId) return
    let live = true
    fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/agent-activity`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { ready?: boolean; cursor?: number; connections?: ConnectionsBrief; sync_at?: string | null } | null) => {
        if (live) setSettled(true)
        if (!live || !d) return
        if (d.connections) setBrief(d.connections)
        if (d.sync_at !== undefined) {
          /* A re-read that finds the link changed (settings closed after a Pull) says so too. */
          if (syncAt.current !== undefined && syncAt.current !== d.sync_at) onSyncRef.current?.()
          syncAt.current = d.sync_at
        }
        /* Kept across a re-read, so a change made while settings were open
           is not skipped; only the first answer sets where to start. */
        if (cursor.current === null && typeof d.cursor === "number") cursor.current = d.cursor
        setReady(d.ready !== false)
      })
      .catch(() => {
        /* No mark and no following is the honest answer when the question could not be asked. */
        if (live) setSettled(true)
      })
    return () => {
      live = false
    }
  }, [installId, recheck])

  const connected = ready && !!brief && (brief.agents.length > 0 || !!brief.github)

  useEffect(() => {
    if (!connected) return
    let stopped = false
    let busy = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let delay = POLL_BASE_MS

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer)
      timer = stopped ? null : setTimeout(tick, ms)
    }
    async function tick() {
      timer = null
      /* Hidden: stop here. Coming back into view starts it again. */
      if (stopped || busy || document.visibilityState !== "visible") return
      if (cursor.current === null) return schedule(delay)
      busy = true
      let arrived = false
      try {
        const res = await fetch(
          `/api/website-builder/themes/${encodeURIComponent(installId)}/agent-activity?after=${cursor.current}`,
          { cache: "no-store" },
        )
        const d = (await res.json().catch(() => ({}))) as { ready?: boolean; cursor?: number; events?: ActivityEvent[]; sync_at?: string | null }
        /* Not set up on this database: stop asking until the next load. */
        if (!res.ok || d.ready === false) {
          stopped = true
          return
        }
        if (typeof d.cursor === "number") cursor.current = d.cursor
        const events = d.events ?? []
        if (events.length) {
          arrived = true
          const last = events[events.length - 1]
          setBrief((b) => (b ? { ...b, latest: { name: last.agent_name, at: last.created_at ?? new Date().toISOString() } } : b))
          await onEventsRef.current(events)
        }
        if (d.sync_at !== undefined && d.sync_at !== syncAt.current) {
          const first = syncAt.current === undefined
          syncAt.current = d.sync_at
          if (!first) {
            arrived = true
            onSyncRef.current?.()
          }
        }
      } catch {
        /* offline for a moment; the next read asks again */
      } finally {
        busy = false
      }
      delay = nextPollDelay(delay, arrived)
      schedule(delay)
    }
    const wake = () => {
      if (document.visibilityState !== "visible") return
      delay = POLL_BASE_MS
      schedule(0)
    }
    document.addEventListener("visibilitychange", wake)
    window.addEventListener("focus", wake)
    schedule(delay)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", wake)
      window.removeEventListener("focus", wake)
    }
  }, [connected, installId])

  return { brief, following: connected, settled }
}

/** Re-renders when the mark's "acted recently" runs out, and not otherwise. */
function useRecent(mark: ConnectionMark): boolean {
  const [now, setNow] = useState(() => Date.now())
  const recent = actedRecently(mark, now)
  useEffect(() => {
    if (!recent || mark.lastActiveAt === null) return
    const t = setTimeout(() => setNow(Date.now()), Math.max(1_000, mark.lastActiveAt + RECENT_MS - Date.now() + 50))
    return () => clearTimeout(t)
  }, [recent, mark.lastActiveAt])
  useEffect(() => setNow(Date.now()), [mark.lastActiveAt])
  return recent
}

/* ── The mark in the top bar ───────────────────────────────────────────── */

export function ConnectionButton({
  mark,
  working = false,
  onOpen,
  buttonRef,
}: {
  mark: ConnectionMark
  /** Changes are arriving now; the dot pulses. */
  working?: boolean
  onOpen: () => void
  buttonRef?: Ref<HTMLButtonElement>
}) {
  const recent = useRecent(mark)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={buttonRef}
          type="button"
          onClick={onOpen}
          aria-label={mark.online ? mark.label : "Connections"}
          data-connection={mark.kind}
          data-online={mark.online ? "" : undefined}
          className="relative h-8 w-8 flex items-center justify-center rounded-lg text-[var(--wb-chrome-fg-2)] hover:bg-[var(--wb-chrome-hover)] hover:text-[var(--wb-chrome-fg)] transition-colors shrink-0 active:scale-90"
        >
          <ConnectionMarkIcon kind={mark.kind} className="h-4 w-4" />
          {mark.online && <span aria-hidden className="wb-live-dot" data-pulse={working || recent ? "" : undefined} />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{connectionTip(mark)}
      </TooltipContent>
    </Tooltip>
  )
}

/* ── The notice ────────────────────────────────────────────────────────── */

export interface LiveChange {
  key: string
  text: string
  /** The section this change is to, when it is on the open page; its row selects it. */
  sectionType: string | null
}

export interface LiveBatch {
  who: string
  kind: ConnectionKind
  changes: LiveChange[]
  /** Every change counted, including repeats of one file folded into one row. */
  count: number
  /** When the last change arrived, by this browser's clock. */
  lastAt: number
}

/** Changes a batch, or starts one, with the lines just read. */
export function addToBatch(batch: LiveBatch | null, who: string, changes: LiveChange[], now: number): LiveBatch {
  const start: LiveBatch =
    batch && batch.who === who && now - batch.lastAt < QUIET_MS + DONE_SHOWN_MS
      ? batch
      : { who, kind: kindForName(who), changes: [], count: 0, lastAt: now }
  const rows = [...start.changes]
  for (const c of changes) {
    const at = rows.findIndex((r) => r.key === c.key)
    /* One row per file: "New section: Pricing" stays new however often it is saved after. */
    if (at === -1) rows.push(c)
    else if (!rows[at].text.startsWith("New section")) rows[at] = c
  }
  return { ...start, changes: rows, count: start.count + changes.length, lastAt: now }
}

/** Quiet this long after the last change, and the run is over. */
export const QUIET_MS = 12_000
/** "Done" stays this long before it fades, unless a pointer is on it. */
export const DONE_SHOWN_MS = 5_000
const MAX_ROWS = 5

export function LiveChangeNotice({
  batch,
  phone,
  anchorRef,
  onPick,
  onGone,
}: {
  batch: LiveBatch | null
  phone: boolean
  anchorRef: RefObject<HTMLElement | null>
  onPick: (sectionType: string) => void
  /** The notice has faded; the caller forgets the batch. */
  onGone: () => void
}) {
  const [phase, setPhase] = useState<"working" | "done" | "leaving">("working")
  const [held, setHeld] = useState(false)
  const lastAt = batch?.lastAt ?? 0
  const present = !!batch
  /* A pointer that was on the last one is not on this one. */
  useEffect(() => {
    if (!present) setHeld(false)
  }, [present])

  /* Every change starts the quiet period again. */
  useEffect(() => {
    if (!lastAt) return
    setPhase("working")
    const t = setTimeout(() => setPhase("done"), Math.max(0, lastAt + QUIET_MS - Date.now()))
    return () => clearTimeout(t)
  }, [lastAt])

  useEffect(() => {
    if (phase !== "done" || held) return
    const t = setTimeout(() => setPhase("leaving"), DONE_SHOWN_MS)
    return () => clearTimeout(t)
  }, [phase, held])

  const onGoneRef = useRef(onGone)
  onGoneRef.current = onGone
  useEffect(() => {
    if (phase !== "leaving") return
    const t = setTimeout(() => onGoneRef.current(), 220)
    return () => clearTimeout(t)
  }, [phase])

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const hold = useCallback((on: boolean) => {
    setHeld(on)
    /* A pointer resting on it while it leaves brings it back. */
    if (on) setPhase((p) => (p === "leaving" ? "done" : p))
  }, [])

  if (!batch || !mounted) return null

  const working = phase === "working"
  const shown = batch.changes.slice(-MAX_ROWS)
  const hidden = batch.changes.length - shown.length
  /* A push arrives whole, from a person: said as a push, by whom when GitHub says. */
  const pusher = isGitHubName(batch.who) ? batch.who.split("·")[1]?.trim() ?? "" : null
  const title = !working
    ? `Done, ${batch.count} ${batch.count === 1 ? "change" : "changes"}`
    : pusher === null
      ? `${batch.who} is editing`
      : pusher
        ? `${pusher} pushed to GitHub`
        : "A push from GitHub"

  const body = (
    <div
      role="status"
      aria-live="polite"
      data-live-notice={phase}
      onPointerEnter={() => hold(true)}
      onPointerLeave={() => hold(false)}
      onFocus={() => hold(true)}
      onBlur={() => hold(false)}
      className={cn(
        "wb-live-notice relative w-[300px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-white/10 bg-[#1f1f1f] text-white shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]",
        phase === "leaving" && "wb-live-notice-leaving",
      )}
    >
      <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2">
        <ConnectionMarkIcon kind={batch.kind} className="h-4 w-4 shrink-0 text-white/90" />
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</p>
      </div>
      <ul className="px-1.5 pb-2">
        {shown.map((c) => (
          <li key={c.key}>
            {c.sectionType ? (
              <button
                type="button"
                onClick={() => onPick(c.sectionType as string)}
                className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-[13px] text-white/75 transition-colors hover:bg-white/[0.07] hover:text-white"
              >
                {c.text}
              </button>
            ) : (
              <p className="truncate px-2 py-1.5 text-[13px] text-white/60">{c.text}</p>
            )}
          </li>
        ))}
        {hidden > 0 && <li className="px-2 py-1 text-[12px] text-white/45">and {hidden} before</li>}
      </ul>
      {/* The loading line: a highlight crossing the bottom edge while changes
          keep coming. Moved by transform alone. */}
      {working && (
        <span aria-hidden className="wb-live-progress absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
          <span className="wb-live-progress-bar block h-full w-1/3" />
        </span>
      )}
    </div>
  )

  if (phone) {
    return createPortal(
      <div
        className="pointer-events-none fixed inset-x-0 flex justify-center px-3"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 56px)", zIndex: CHROME_POPOVER_Z }}
      >
        <div className="pointer-events-auto">{body}</div>
      </div>,
      document.body,
    )
  }
  return (
    <AnchoredPanel anchorRef={anchorRef} align="right" gap={8}>
      {body}
    </AnchoredPanel>
  )
}
