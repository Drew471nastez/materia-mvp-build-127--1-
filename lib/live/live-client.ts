/**
 * ===========================================================================
 *  THE BROWSER'S SIDE OF "LIVE": A QUEUE, ONE SEND A MINUTE, NOTHING HIDDEN
 * ===========================================================================
 * components/platform/live-beacon.tsx holds one of these on every Storelib
 * page outside /app (round 59 has /app) and on every creator website. Same
 * rules as round 59's queue (lib/activity/creator-activity-client):
 *
 *   - every LIVE_SEND_EVERY_MS (a minute) while the tab is visible, with
 *     whatever is waiting; an empty send is the heartbeat that keeps the
 *     session "online now"
 *   - once when the tab hides or the page goes (sendBeacon), and only when
 *     something is waiting
 *   - nothing at all while hidden
 *
 * The session id is made here, sixteen random letters and digits, and kept
 * in sessionStorage: one per tab, gone when the tab closes, never a cookie,
 * never sent anywhere but /api/live. With storage blocked it lives in memory
 * for the page.
 *
 * Nothing typed is read. Actions come from the page's path (a product page,
 * the checkout, a course, a receipt) or from noteLive("<name>") where the
 * thing happens (added to cart, joined, signed in).
 */
import { LIVE_MAX_BATCH, LIVE_SEND_EVERY_MS, cleanSource, isLiveAction, placePath, type HostKind, type LiveWireBatch, type LiveWireEvent } from "./live"

export const LIVE_EVENT = "storelib:live"
export const LIVE_SID_KEY = "sl_live"
/** Back on a tab hidden this long: the page is noted again, so a new session has one. */
const RESUME_AFTER_MS = 5 * 60_000

/** Note an action from anywhere: picked up by the beacon when one runs, ignored otherwise. */
export function noteLive(name: string): void {
  if (typeof window === "undefined" || !isLiveAction(name)) return
  try {
    window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: name }))
  } catch {
    /* An old browser: the action is not noted. */
  }
}

/** Sixteen of [a-z0-9] from the browser's random source. */
export function newSid(random: (n: number) => Uint8Array): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789"
  const bytes = random(16)
  let s = ""
  for (let i = 0; i < 16; i++) s += alphabet[bytes[i] % 36]
  return s
}

/** The tab's session id: read from sessionStorage, made once, in memory when storage is blocked. */
export function tabSid(store: { getItem(k: string): string | null; setItem(k: string, v: string): void } | null, random: (n: number) => Uint8Array): string {
  try {
    const kept = store?.getItem(LIVE_SID_KEY)
    if (kept && /^[a-z0-9]{16}$/.test(kept)) return kept
  } catch {
    /* blocked */
  }
  const sid = newSid(random)
  try {
    store?.setItem(LIVE_SID_KEY, sid)
  } catch {
    /* in memory only */
  }
  return sid
}

/**
 * Where this visit came from, said once per session on its first send: the
 * referrer's host unless it is this site or Storelib, or the address's
 * utm_source. Nothing else from either.
 */
export function sourceOf(referrer: string, href: string, ownHosts: string[]): string | null {
  try {
    const u = new URL(href)
    const utm = u.searchParams.get("utm_source")
    if (utm) return cleanSource(utm)
  } catch {
    /* no address */
  }
  if (!referrer) return null
  try {
    const host = new URL(referrer).hostname.toLowerCase()
    if (ownHosts.some((h) => host === h || host.endsWith(`.${h}`))) return null
    return cleanSource(host)
  } catch {
    return null
  }
}

export type LiveQueueDeps = {
  now: () => number
  sid: string
  host: HostKind
  /** Said on the first send only. */
  source: string | null
  app: boolean
  send: (body: string) => void
  beacon: (body: string) => void
  /** The receipt's token, read from the address when the page is a receipt. */
  receiptToken?: (path: string) => string | null
}

export type LiveQueue = {
  page: (path: string) => void
  action: (name: string) => void
  tick: () => void
  hide: () => void
  show: () => void
  pending: () => number
}

export function createLiveQueue(deps: LiveQueueDeps): LiveQueue {
  let queue: { at: number; e: LiveWireEvent }[] = []
  let lastPath: string | null = null
  let lastSend = deps.now()
  let hiddenAt: number | null = null
  let lastTick = deps.now()
  let sourceSaid = false
  /* On a page this does not record (/app, /admin): no heartbeat, so a creator in /app is round 59's alone. */
  let off = false
  /* Each action at most once per page it happened on: a second press of Add to cart is a second one, a re-render of a product page is not. */
  const derivedOn = new Set<string>()

  const body = (): string => {
    const now = deps.now()
    const e = queue.slice(0, LIVE_MAX_BATCH).map(({ at, e }) => [Math.max(0, Math.round((now - at) / 1000)), ...e.slice(1)] as LiveWireEvent)
    queue = queue.slice(LIVE_MAX_BATCH)
    const batch: LiveWireBatch = { v: 1, s: deps.sid, e }
    if (!sourceSaid && deps.source) batch.src = deps.source
    sourceSaid = true
    if (deps.app) batch.app = 1
    return JSON.stringify(batch)
  }

  const flush = (how: "send" | "beacon") => {
    const b = body()
    lastSend = deps.now()
    if (how === "beacon") deps.beacon(b)
    else deps.send(b)
  }

  const push = (e: LiveWireEvent) => {
    queue.push({ at: deps.now(), e })
    if (queue.length >= LIVE_MAX_BATCH && hiddenAt === null) flush("send")
  }

  const derived = (name: string, key: string, extra?: string) => {
    const k = `${name}|${key}`
    if (derivedOn.has(k)) return
    derivedOn.add(k)
    push(extra ? [0, "a", name, extra] : [0, "a", name])
  }

  return {
    page(raw) {
      const placed = placePath(raw, deps.host)
      if (!placed) {
        off = true
        lastPath = null
        return
      }
      off = false
      if (placed.path === lastPath) return
      lastPath = placed.path
      push([0, "p", placed.path])
      if (placed.product) derived("product.view", placed.path)
      if (placed.checkout) derived("checkout.start", "checkout")
      if (placed.course) derived("course.open", raw)
      if (placed.receipt && deps.receiptToken) {
        const token = deps.receiptToken(raw)
        if (token) derived("order.paid", token, token)
      }
    },
    action(name) {
      if (!isLiveAction(name) || name === "order.paid") return
      push([0, "a", name])
    },
    tick() {
      const now = deps.now()
      if (hiddenAt !== null) return
      if (now - lastTick > RESUME_AFTER_MS && lastPath) push([0, "p", lastPath])
      lastTick = now
      if (off && !queue.length) return
      if (now - lastSend >= LIVE_SEND_EVERY_MS - 1_000) flush("send")
    },
    hide() {
      if (hiddenAt !== null) return
      hiddenAt = deps.now()
      if (queue.length) flush("beacon")
    },
    show() {
      const was = hiddenAt
      hiddenAt = null
      const now = deps.now()
      lastTick = now
      if (was !== null && now - was > RESUME_AFTER_MS && lastPath) push([0, "p", lastPath])
      if (was !== null && now - lastSend >= LIVE_SEND_EVERY_MS && (!off || queue.length)) flush("send")
    },
    pending: () => queue.length,
  }
}

/** The receipt's token from /receipt/<token>, for the server to check against the order. */
export function receiptTokenOf(path: string): string | null {
  const m = /^\/receipt\/([A-Za-z0-9_-]{16,128})\/?$/.exec(path.split(/[?#]/)[0] ?? "")
  return m ? m[1] : null
}

/** A theme site's own Add to cart (/cart/add), heard by its address in Resource Timing: never its body. Builder sites say it with noteLive. */
export function actionOfRequest(url: string): string | null {
  let path: string
  try {
    path = new URL(url, "https://x.invalid").pathname
  } catch {
    return null
  }
  if (/^\/cart\/add(\.js)?$/.test(path)) return "cart.add"
  return null
}
