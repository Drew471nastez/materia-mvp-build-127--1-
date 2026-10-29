"use client"

/**
 * ===========================================================================
 *  WHAT THIS SITE IS CONNECTED TO, AND WHAT IT IS DOING RIGHT NOW
 * ===========================================================================
 * Three pieces, one channel.
 *
 *   useSiteActivity    reads the brief once when the editor opens (and again
 *                      when Website settings closes), then follows the
 *                      activity log while the tab is on screen, including
 *                      writers connected after the editor was opened.
 *   ConnectionButton   the top bar's mark: whichever connection acted last,
 *                      with a dot when it is live and a slow pulse while it
 *                      is working. lib/agent-access/connection-mark.ts decides.
 *   LiveChangeNotice   the note that hangs under that mark while an agent or a
 *                      push is changing the site: who, a line per change, and
 *                      then "Done, 3 changes", which fades unless hovered.
 *
 * The channel is the one the editor already had for putting an agent's new
 * section on the page (app/api/.../agent-activity): one indexed read, about
 * once a second the whole time the tab is visible and something is connected,
 * so a push from GitHub, an external agent or Storelib AI shows without
 * refreshing the editor. A hidden tab asks nothing. A read that fails is
 * asked again. Only a database without the activity table stops.
 */
import { useCallback, useEffect, useRef, useState, type Ref, type RefObject } from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { AnchoredPanel, CHROME_POPOVER_Z } from "@/components/website-builder/anchored-panel"
import { ConnectionMarkIcon } from "@/components/website-builder/connection-marks"
import {
  POLL_ACTIVE_MS,
  POLL_BASE_MS,
  POLL_MAX_MS,
  RECENT_MS,
  actedRecently,
  activityFollowUp,
  connectionTip,
  isGitHubName,
  kindForName,
  nextPollDelay,
  type ActivityEvent,
  type ConnectionKind,
  type ConnectionMark,
  type ConnectionsBrief,
} from "@/lib/agent-access/connection-mark"
import { tt } from "@/lib/i18n/text"
import { APPLY_CEILING_MS, BRIEF_RECHECK_MS, LOOKBACK_EVERY_MS, briefDue, isPile, mergeLines, nextCursor, readMore, remember, slept, withinTime } from "@/lib/website-builder/live-follow"

/* ── The channel ───────────────────────────────────────────────────────── */

/** The least time between two reads asked for by the person coming back (focus, the pointer). */
const WAKE_GAP_MS = 3_000
/** Away longer than this, the log that piled up is taken in one pass, not one reload of the canvas per page of it. */
const CATCH_UP_AWAY_MS = 8_000
/** How many pages of the log one pass will fold together. */
const CATCH_UP_PAGES = 6
const ACTIVITY_PAGE = 20
/** The next read after an apply that had to wait (a scroll resting, a page read back): straight after, so a change made meanwhile lands with it. */
export const HELD_UP_MS = 50

/**
 * The app coming back to the front, or going to the back, in the iOS and
 * Android shells (Capacitor's App plugin). A suspended WKWebView does not
 * always say `visibilitychange` on its way back; this does. Nothing in a
 * browser.
 */
function onNativeAppState(listener: (active: boolean) => void): () => void {
  if (typeof document === "undefined" || !document.documentElement.classList.contains("capacitor")) return () => {}
  let removed = false
  let handle: { remove: () => unknown } | null = null
  import("@capacitor/app")
    .then(({ App }) => App.addListener("appStateChange", ({ isActive }) => listener(isActive)))
    .then((h) => {
      if (removed) void h.remove()
      else handle = h
    })
    .catch(() => {
      /* no plugin in this shell: visibilitychange and focus still wake it */
    })
  return () => {
    removed = true
    void handle?.remove()
  }
}

/**
 * Two frames, so a page restored from the background has painted, then a
 * moment the browser has free: coming back also reads the shop's cards and
 * measures the canvas again, and the pile landing on those same frames was
 * the stutter on the way back. A web view that runs no frames still goes on.
 */
function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(cap)
      resolve()
    }
    const cap = setTimeout(finish, 1_200)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
      if (w.requestIdleCallback) w.requestIdleCallback(finish, { timeout: 800 })
      else finish()
    }))
  })
}

export function useSiteActivity({
  installId,
  recheck,
  onEvents,
  onSyncChanged,
  onStale,
}: {
  installId: string
  /** Any value; the brief is read again when it changes. */
  recheck?: unknown
  /** New lines from the log, oldest first. Awaited before the next read. `catchUp`: the tab was away, so this is the pile, applied once. */
  onEvents: (events: ActivityEvent[], info?: { catchUp: boolean; isCurrent?: () => boolean }) => void | Promise<void>
  /** The GitHub link changed since the last read (a push taken or refused, a send that failed): read the sync report again. */
  onSyncChanged?: () => void
  /** The log moved but applying it threw: read the theme from the server, the way a refresh would, without leaving the editor. */
  onStale?: () => void | Promise<void>
}): { brief: ConnectionsBrief | null; following: boolean; settled: boolean } {
  const [brief, setBrief] = useState<ConnectionsBrief | null>(null)
  const [ready, setReady] = useState(false)
  /** The first read has come back, with an answer or without one. */
  const [settled, setSettled] = useState(false)
  const cursor = useRef<number | null>(null)
  /** Where the editor started in the log: a late line below it is what the editor loaded with. */
  const floor = useRef<number | null>(null)
  /** The lines applied, by id, so a late line looked at again is applied once (live-follow.ts mergeLines). */
  const seen = useRef(new Set<number>())
  const onEventsRef = useRef(onEvents)
  onEventsRef.current = onEvents
  const onSyncRef = useRef(onSyncChanged)
  onSyncRef.current = onSyncChanged
  const onStaleRef = useRef(onStale)
  onStaleRef.current = onStale
  /** When the link last changed, as last read; undefined until the first answer. */
  const syncAt = useRef<string | null | undefined>(undefined)
  /** The database has no activity table: nothing to follow, and nothing to ask again. */
  const [missing, setMissing] = useState(false)
  /** Raised to read the brief again while nothing is connected (a connection made in another tab or on another device). */
  const [briefAsk, setBriefAsk] = useState(0)

  useEffect(() => {
    cursor.current = null
    floor.current = null
    seen.current.clear()
    setMissing(false)
    syncAt.current = undefined
    setBrief(null)
    setReady(false)
    setSettled(false)
  }, [installId])

  useEffect(() => {
    if (!installId) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | null = null
    const ask = (attempt: number) => {
      fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/agent-activity`, { cache: "no-store", signal: AbortSignal.timeout(12_000) })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { ready?: boolean; missing?: boolean; cursor?: number; connections?: ConnectionsBrief; sync_at?: string | null } | null) => {
          if (!live) return
          setSettled(true)
          /* A blip, or a session refresh: ask again, and keep asking. Stopping here is a push that only a refresh would show. */
          if (!d || (d.ready === false && d.missing !== true)) {
            timer = setTimeout(() => ask(Math.min(attempt + 1, 5)), attempt < 4 ? POLL_ACTIVE_MS : POLL_BASE_MS)
            return
          }
          if (d.missing === true) {
            setReady(false)
            setMissing(true)
            return
          }
          if (d.connections) setBrief(d.connections)
          if (d.sync_at !== undefined) {
            /* A re-read that finds the link changed (settings closed after a Pull) says so too. */
            if (syncAt.current !== undefined && syncAt.current !== d.sync_at) onSyncRef.current?.()
            syncAt.current = d.sync_at
          }
          /* Kept across a re-read, so a change made while settings were open
             is not skipped; only the first answer sets where to start. A failed
             read must not set it: its cursor is 0 and would replay the log. */
          if (cursor.current === null && d.ready !== false && typeof d.cursor === "number") {
            cursor.current = d.cursor
            floor.current = d.cursor
          }
          setReady(d.ready !== false)
        })
        .catch(() => {
          if (!live) return
          setSettled(true)
          timer = setTimeout(() => ask(Math.min(attempt + 1, 5)), attempt < 4 ? POLL_ACTIVE_MS : POLL_BASE_MS)
        })
    }
    ask(0)
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [installId, recheck, briefAsk])

  const connected = ready && !!brief && (brief.agents.length > 0 || !!brief.github)

  /*
    NOTHING CONNECTED WHEN THE EDITOR OPENED IS NOT NOTHING FOR GOOD. A key
    made on another device, a repository linked in another tab: the brief
    was read once and the log was never followed. Asked again on a return to
    the tab, on a connection coming back, and once a minute while visible.
  */
  useEffect(() => {
    if (!installId || connected || missing || !settled) return
    let last = Date.now()
    const again = (reason: "timer" | "wake") => {
      if (document.visibilityState !== "visible" || !briefDue(last, Date.now(), reason)) return
      last = Date.now()
      setBriefAsk((n) => n + 1)
    }
    const wake = () => again("wake")
    const every = setInterval(() => again("timer"), BRIEF_RECHECK_MS)
    document.addEventListener("visibilitychange", wake)
    window.addEventListener("focus", wake)
    window.addEventListener("online", wake)
    const offNative = onNativeAppState((active) => { if (active) wake() })
    return () => {
      clearInterval(every)
      document.removeEventListener("visibilitychange", wake)
      window.removeEventListener("focus", wake)
      window.removeEventListener("online", wake)
      offNative()
    }
  }, [installId, connected, missing, settled])

  useEffect(() => {
    // Writers can connect after this editor opened, including Storelib AI.
    // The activity log remains authoritative even when the initial brief is empty.
    if (!ready) return
    let stopped = false
    let busy = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let delay = POLL_BASE_MS
    /** When a change last arrived or the person last came back or used the editor. */
    let lively = Date.now()
    /** When the tab was hidden, so a return after a while is one catch-up, not a storm. */
    let hiddenAt = 0
    let catchUpPending = false
    /** When the scheduled read was due: one that runs far later slept through it (a lid closed, the app put away). */
    let dueAt = 0
    /** When a read last looked back for a line that committed late. */
    let lookedBack = 0

    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer)
      dueAt = Date.now() + ms
      timer = stopped || busy ? null : setTimeout(tick, ms)
    }
    async function tick() {
      timer = null
      /* Hidden: stop here. Coming back into view starts it again. */
      if (stopped || busy || document.visibilityState !== "visible") return
      if (cursor.current === null) return schedule(delay)
      busy = true
      let arrived = false
      let eventsFull = false
      let retry = false
      /* Timers frozen with no visibilitychange (sleep, a suspended web view): that is an absence too. */
      const away = slept(dueAt, Date.now(), CATCH_UP_AWAY_MS)
      const pending = catchUpPending
      /* Applying waited (the canvas was being scrolled, a page was read back): the log may have grown meanwhile. */
      let heldUp = false
      catchUpPending = false
      let catchUp = pending || away
      try {
        /* Coming back after a while: let the restored page paint before the catch-up draws over it. */
        if (catchUp) await afterPaint()
        const fresh: ActivityEvent[] = []
        const late: ActivityEvent[] = []
        let after = cursor.current
        let pages = 0
        let syncSeen: string | null | undefined
        /* A full page means more is waiting: read it now and apply the lot once, however the pile came about. */
        while (after !== null && pages < CATCH_UP_PAGES) {
          /* The first page looks back every few seconds, and on a return, for a line that committed after a later one. */
          const look = pages === 0 && (catchUp || Date.now() - lookedBack >= LOOKBACK_EVERY_MS)
          if (look) lookedBack = Date.now()
          const res = await fetch(
            `/api/website-builder/themes/${encodeURIComponent(installId)}/agent-activity?after=${after}${look ? "&lookback=1" : ""}`,
            { cache: "no-store", signal: AbortSignal.timeout(12_000) },
          )
          const d = (await res.json().catch(() => null)) as { ready?: boolean; missing?: boolean; retry?: boolean; cursor?: number; events?: ActivityEvent[]; late?: ActivityEvent[]; sync_at?: string | null } | null
          if (stopped) return
          const follow = activityFollowUp(res.status, d)
          /* The table is not there: nothing to follow. Any other failure is asked again, cursor unmoved. */
          if (follow === "stop") {
            stopped = true
            return
          }
          if (follow !== "ok" || !d) {
            retry = true
            break
          }
          if (typeof d.cursor === "number") after = d.cursor
          if (d.sync_at !== undefined) syncSeen = d.sync_at
          const batch = d.events ?? []
          for (const ev of batch) fresh.push(ev)
          if (Array.isArray(d.late)) for (const ev of d.late) late.push(ev)
          pages++
          if (!readMore(batch.length, pages, CATCH_UP_PAGES, ACTIVITY_PAGE)) break
        }
        if (stopped) return
        catchUp = isPile({ pending, slept: away, pagesRead: pages })
        /* Each line once, oldest first: the new ones and any that committed late. */
        const events = mergeLines(late, fresh, seen.current, floor.current)
        /* Apply before moving the cursor. A throw used to skip the lines and never read them again. */
        if (events.length) {
          arrived = true
          eventsFull = fresh.length >= ACTIVITY_PAGE * CATCH_UP_PAGES
          const applying = Date.now()
          let applyCurrent = true
          try {
            /* One pass for the whole pile. A page of the log per poll reloaded the canvas each time: the freeze and the blank frame on the way back. */
            const run = (async () => { await onEventsRef.current(events, { catchUp, isCurrent: () => !stopped && applyCurrent }) })()
            /* An apply that never answers (a read suspended with the web view) held the loop busy for good: the theme is read again instead. */
            if ((await withinTime(run, APPLY_CEILING_MS)) === "late") {
              applyCurrent = false
              if (!onStaleRef.current || await withinTime(Promise.resolve(onStaleRef.current()), APPLY_CEILING_MS) === "late") throw new Error()
            }
          } catch {
            applyCurrent = false
            // Do not acknowledge changes until an authoritative recovery finished.
            // Otherwise one failed file read loses the push until a manual refresh.
            if (!onStaleRef.current) throw new Error()
            if (await withinTime(Promise.resolve(onStaleRef.current()), APPLY_CEILING_MS) === "late") throw new Error()
          }
          if (stopped) return
          // Late-commit deduplication must not swallow a batch whose recovery failed.
          remember(seen.current, events.map((ev) => ev.id))
          if (!connected) {
            // Discover the writer without rebasing the cursor past its next push.
            const fresh = await fetch(`/api/website-builder/themes/${encodeURIComponent(installId)}/agent-activity`, { cache: "no-store", signal: AbortSignal.timeout(12_000) })
              .then((res) => res.ok ? res.json() : null).catch(() => null)
            if (stopped) return
            if (fresh?.connections) setBrief(fresh.connections)
          }
          heldUp = Date.now() - applying >= POLL_ACTIVE_MS
          const last = events[events.length - 1]
          setBrief((b) => (b ? { ...b, latest: { name: last.agent_name, at: last.created_at ?? new Date().toISOString() } } : b))
        }
        /* A failed page is not consumed: `after` is the last page that was read.
           With no events and a failure, the cursor stays so the same read is asked again. */
        cursor.current = nextCursor(cursor.current, after, retry, fresh.length)
        if (syncSeen !== undefined && syncSeen !== syncAt.current) {
          const first = syncAt.current === undefined
          syncAt.current = syncSeen
          if (!first) {
            arrived = true
            onSyncRef.current?.()
          }
        }
      } catch {
        /* offline, or the read hung: the next one asks again from the same cursor */
        retry = true
      } finally {
        busy = false
      }
      if (stopped || document.visibilityState !== "visible") return
      if (arrived) lively = Date.now()
      const paced = nextPollDelay(delay, arrived, Date.now() - lively)
      /* Visible: about once a second, even when nothing has happened for a while.
         The thirty second idle left a push sitting until the editor was refreshed.
         A full page of the log means more is waiting, so that one is immediate. */
      delay = document.visibilityState === "visible" ? (arrived && eventsFull ? 200 : POLL_ACTIVE_MS) : (arrived && eventsFull ? 200 : paced)
      if (retry) delay = POLL_ACTIVE_MS
      /* The lines just applied waited for a scroll to rest: what came in behind them is read now, not a second after the rest. */
      else if (heldUp) delay = HELD_UP_MS
      schedule(connected ? delay : POLL_BASE_MS)
    }
    let woke = 0
    const wake = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now()
        /* A timer left running would read one page of the pile the moment the tab came back, and reload the canvas before the catch-up. */
        if (timer) clearTimeout(timer)
        timer = null
        return
      }
      if (document.visibilityState !== "visible") return
      const back = hiddenAt > 0 && Date.now() - hiddenAt >= CATCH_UP_AWAY_MS
      hiddenAt = 0
      if (back) catchUpPending = true
      /* At most once every few seconds: the pointer coming back over the editor is a moment to look, not a stream of reads. A long absence still reads. */
      // A brief tab switch cleared the timer too. Throttling that return
      // without queued work stops the channel permanently until a reload.
      if (!back && Date.now() - woke < WAKE_GAP_MS && (timer !== null || busy)) return
      woke = Date.now()
      lively = Date.now()
      delay = POLL_BASE_MS
      schedule(0)
    }
    /* A press or a key in the editor: someone is at the screen. Keeps the quick
       cadence and, if it had slowed to the idle one, reads within a few seconds.
       No read of its own while the quick cadence is already running. */
    const stir = () => {
      lively = Date.now()
      if (delay > POLL_MAX_MS && !busy && !stopped) {
        delay = POLL_BASE_MS
        schedule(delay)
      }
    }
    /* Back online after a drop, restored from the back and forward cache, or the app brought back to the front. */
    const online = () => {
      woke = 0
      wake()
    }
    const shown = (e: PageTransitionEvent) => {
      if (e.persisted) {
        catchUpPending = true
        online()
      }
    }
    const offNative = onNativeAppState((active) => {
      if (!active) {
        hiddenAt = Date.now()
        if (timer) clearTimeout(timer)
        timer = null
        return
      }
      if (hiddenAt > 0 && Date.now() - hiddenAt >= CATCH_UP_AWAY_MS) catchUpPending = true
      online()
    })
    document.addEventListener("visibilitychange", wake)
    window.addEventListener("focus", wake)
    window.addEventListener("online", online)
    window.addEventListener("pageshow", shown)
    /* Back from the terminal or GitHub in a window beside this one: no focus change, but the pointer comes back. */
    document.documentElement.addEventListener("pointerenter", wake)
    window.addEventListener("pointerdown", stir, true)
    window.addEventListener("keydown", stir, true)
    schedule(0)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      offNative()
      window.removeEventListener("online", online)
      window.removeEventListener("pageshow", shown)
      document.removeEventListener("visibilitychange", wake)
      window.removeEventListener("focus", wake)
      document.documentElement.removeEventListener("pointerenter", wake)
      window.removeEventListener("pointerdown", stir, true)
      window.removeEventListener("keydown", stir, true)
    }
  }, [ready, connected, installId])

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
          aria-label={mark.online ? mark.label : tt("Connections")}
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
    ? tt("Done, {count, plural, one {# change} other {# changes}}", { count: batch.count })
    : pusher === null
      ? tt("{who} is editing", { who: batch.who })
      : pusher
        ? tt("{pusher} pushed to GitHub", { pusher })
        : tt("A push from GitHub")

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
        {hidden > 0 && <li className="px-2 py-1 text-[12px] text-white/45">{tt("and {hidden} before", { hidden })}</li>}
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
