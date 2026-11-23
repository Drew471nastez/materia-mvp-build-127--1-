/**
 * ===========================================================================
 *  THE BROWSER'S SIDE: A QUEUE, ONE SEND A MINUTE, NOTHING WHILE HIDDEN
 * ===========================================================================
 * components/app/activity-beacon.tsx holds one of these for as long as /app
 * is open. Pages and named actions go into a queue in memory (never into
 * storage on the device), and the queue goes to /api/activity:
 *
 *   - every SEND_EVERY_MS (a minute) while the tab is visible, with whatever
 *     is in it; an empty send is the presence heartbeat, so a visible tab is
 *     "online" and a hidden one stops being so after two minutes;
 *   - once when the tab is hidden or the page goes away (sendBeacon, which
 *     the browser delivers after the page has gone);
 *   - early, when MAX_BATCH events are waiting.
 *
 * Nothing at all is sent while the tab is hidden. Clicks are not recorded:
 * only an element that carries `data-activity="<name>"`, or a call to
 * noteActivity("<name>") where something happens, and only for a name in
 * ACTIONS (lib/activity/creator-activity.ts).
 *
 * Pure enough to test: the clock, the timer and the two ways of sending are
 * passed in (tests/creator-activity-r59.test.ts).
 */
import { MAX_BATCH, RESUME_AFTER_MS, SEND_EVERY_MS, isActionName, normalisePath, type WireBatch, type WireEvent } from "./creator-activity"

export const ACTIVITY_EVENT = "storelib:activity"

/** Note a named action from anywhere in /app: picked up by the beacon if one is running, ignored otherwise. */
export function noteActivity(name: string): void {
  if (typeof window === "undefined" || !isActionName(name)) return
  try {
    window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: name }))
  } catch {
    /* An old browser without CustomEvent: the action is not noted. */
  }
}

export type QueueDeps = {
  now: () => number
  /** A send while the page stays: fetch with keepalive. */
  send: (body: string) => void
  /** A send as the page goes: navigator.sendBeacon, falling back to send. */
  beacon: (body: string) => void
}

export type ActivityQueue = {
  page: (path: string) => void
  action: (name: string) => void
  /** Called by the minute timer while the tab is visible. */
  tick: () => void
  /** The tab was hidden or the page is going. */
  hide: () => void
  /** The tab is visible again. */
  show: () => void
  /** What is waiting, for the tests. */
  pending: () => number
}

export function createActivityQueue(deps: QueueDeps): ActivityQueue {
  let queue: { at: number; k: "p" | "a"; name: string }[] = []
  let lastPath: string | null = null
  let lastSend = deps.now()
  let hiddenAt: number | null = null
  let lastTick = deps.now()

  const body = (): string | null => {
    const now = deps.now()
    const e: WireEvent[] = queue.slice(0, MAX_BATCH).map((q) => [Math.max(0, Math.round((now - q.at) / 1000)), q.k, q.name])
    queue = queue.slice(MAX_BATCH)
    const batch: WireBatch = { v: 1, e }
    return JSON.stringify(batch)
  }

  const flush = (how: "send" | "beacon") => {
    const b = body()
    if (!b) return
    lastSend = deps.now()
    if (how === "beacon") deps.beacon(b)
    else deps.send(b)
  }

  const push = (k: "p" | "a", name: string) => {
    queue.push({ at: deps.now(), k, name })
    if (queue.length >= MAX_BATCH && hiddenAt === null) flush("send")
  }

  return {
    page(raw) {
      const path = normalisePath(raw)
      if (!path || path === lastPath) return
      lastPath = path
      push("p", path)
    },
    action(name) {
      if (!isActionName(name)) return
      push("a", name)
    },
    tick() {
      const now = deps.now()
      if (hiddenAt !== null) return
      /* A machine that slept with the tab open: the page again, so the session that starts now has one. */
      if (now - lastTick > RESUME_AFTER_MS && lastPath) push("p", lastPath)
      lastTick = now
      if (now - lastSend >= SEND_EVERY_MS - 1_000) flush("send")
    },
    hide() {
      if (hiddenAt !== null) return
      hiddenAt = deps.now()
      /* Only when there is something to say: a hidden tab needs no heartbeat, it is about to stop being online. */
      if (queue.length) flush("beacon")
    },
    show() {
      const was = hiddenAt
      hiddenAt = null
      const now = deps.now()
      lastTick = now
      if (was !== null && now - was > RESUME_AFTER_MS && lastPath) push("p", lastPath)
      /* Back on screen after a minute or more: say so now rather than at the next tick. */
      if (was !== null && now - lastSend >= SEND_EVERY_MS) flush("send")
    },
    pending: () => queue.length,
  }
}

/** The element a click names, if any: the nearest `data-activity`, or a link to the editor or the storefront. */
export function actionOfClick(target: EventTarget | null): string | null {
  const el = target && typeof (target as Element).closest === "function" ? (target as Element) : null
  if (!el) return null
  const named = el.closest("[data-activity]")
  const name = named?.getAttribute("data-activity")
  if (name && isActionName(name)) return name
  const link = el.closest("a[href]") as HTMLAnchorElement | null
  const href = link?.getAttribute("href") ?? ""
  if (/^\/website-builder\/editor\//.test(href)) return "editor.open"
  if (/^\/app\/products\/new(?:[/?#]|$)/.test(href)) return "product.new"
  return null
}
