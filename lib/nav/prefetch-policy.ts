/**
 * ===========================================================================
 *  HOW MUCH TO FETCH AHEAD, ASKED OF THE DEVICE AND THE NETWORK
 * ===========================================================================
 * Every place that reads pages ahead (the phone's tab bar, the navigator,
 * Explore's cards, a community's links) used to decide for itself, and all
 * of them decided the same way on a new iPhone on wifi and on a three year
 * old Android on a train: everything, at once, as soon as the page went
 * idle. On the fast phone that is right. On the slow one it is a queue of
 * requests in front of the one the person actually pressed.
 *
 * So the question is put once, here, to what the browser says about itself:
 *
 *   navigator.connection   effectiveType (slow-2g, 2g, 3g, 4g), saveData,
 *                          and the change event when the network moves
 *   navigator.deviceMemory gigabytes, rounded (Chromium only)
 *   hardwareConcurrency    cores
 *
 * Safari answers none of the first two, so an iPhone is judged by its cores
 * alone, which on every iPhone that runs the app is "fast". A browser that
 * says nothing at all is taken as normal, never as rich.
 *
 * The answer is a tier, and a tier is a plan:
 *
 *   rich     everything near the person, whole pages, soon after idle
 *   normal   the likely next pages, whole, once idle
 *   lean     only the most likely one, its frame only, late; whole pages
 *            only on a press
 *   off      Save-Data or 2g: nothing ahead, a press still reads its page
 *            the moment the finger lands
 *
 * One helper does the fetching (prefetchHref, prefetchOnIdle), so the tab
 * bar, the navigator, Explore and community links all follow the same plan
 * and nobody asks for the same page twice in a few minutes.
 */

export type PrefetchTier = "rich" | "normal" | "lean" | "off"

export interface DeviceSignals {
  effectiveType?: string
  saveData?: boolean
  /** Gigabytes, as navigator.deviceMemory reports them (0.25 to 8). */
  deviceMemory?: number
  hardwareConcurrency?: number
}

export interface PrefetchPlan {
  tier: PrefetchTier
  /** How many pages may be read ahead in one idle pass. */
  idleBudget: number
  /** Whole pages (the router's "full" prefetch) on idle, rather than the frame up to the loading boundary. */
  idleFull: boolean
  /** How long after the page settles the idle pass starts. */
  idleDelayMs: number
  /** Read a page ahead when a pointer rests on its link (desktop) or it scrolls into view. */
  onHover: boolean
  onVisible: boolean
}

export type PrefetchIntent = "idle" | "visible" | "hover" | "press"

const PLANS: Record<PrefetchTier, PrefetchPlan> = {
  rich: { tier: "rich", idleBudget: 8, idleFull: true, idleDelayMs: 250, onHover: true, onVisible: true },
  normal: { tier: "normal", idleBudget: 4, idleFull: true, idleDelayMs: 700, onHover: true, onVisible: true },
  lean: { tier: "lean", idleBudget: 1, idleFull: false, idleDelayMs: 2000, onHover: false, onVisible: false },
  off: { tier: "off", idleBudget: 0, idleFull: false, idleDelayMs: 0, onHover: false, onVisible: false },
}

/** The plan for a tier, for tests and for a caller that wants to show its reasoning. */
export function planFor(tier: PrefetchTier): PrefetchPlan {
  return PLANS[tier]
}

/**
 * The website builder's work that only makes the next press faster: pages
 * read ahead, a theme page drawn out of sight, section previews drawn before
 * Add section is opened. On a small device or a slow network that work sits
 * on the same thread as the canvas, so it waits until the person asks.
 * A press still does the thing they pressed.
 */
export function editorSpares(tier: PrefetchTier = prefetchPlan().tier): boolean {
  return tier === "lean" || tier === "off"
}

/**
 * THE TIER, FROM WHAT THE DEVICE SAYS. Pure, so the suite can put every
 * phone and network through it. The network can only lower a tier and so
 * can the device: a fast phone on 3g is lean, a slow phone on wifi is lean.
 */
export function tierFor(s: DeviceSignals): PrefetchTier {
  if (s.saveData) return "off"
  const net = (s.effectiveType || "").toLowerCase()
  if (net === "slow-2g" || net === "2g") return "off"
  const memory = typeof s.deviceMemory === "number" && s.deviceMemory > 0 ? s.deviceMemory : null
  const cores = typeof s.hardwareConcurrency === "number" && s.hardwareConcurrency > 0 ? s.hardwareConcurrency : null
  const weakDevice = (memory !== null && memory <= 2) || (cores !== null && cores <= 2)
  if (net === "3g" || weakDevice) return "lean"
  const strongDevice = (memory === null || memory >= 4) && cores !== null && cores >= 6
  /* "4g" is the best effectiveType there is; a browser that does not say is not promoted on the network's account. */
  if (strongDevice && (net === "4g" || net === "")) return "rich"
  return "normal"
}

type ConnectionLike = {
  effectiveType?: string
  saveData?: boolean
  addEventListener?: (type: string, f: () => void) => void
}

function connection(): ConnectionLike | null {
  if (typeof navigator === "undefined") return null
  const c = (navigator as Navigator & { connection?: ConnectionLike }).connection
  return c ?? null
}

/** What this browser says about itself right now. */
export function readSignals(): DeviceSignals {
  if (typeof navigator === "undefined") return {}
  const c = connection()
  return {
    effectiveType: c?.effectiveType,
    saveData: c?.saveData === true,
    deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  }
}

/* One answer per page, asked again when the network changes. */
let cached: PrefetchPlan | null = null
let watching = false

export function prefetchPlan(): PrefetchPlan {
  if (typeof window === "undefined") return PLANS.normal
  if (!cached) cached = PLANS[tierFor(readSignals())]
  if (!watching) {
    watching = true
    try {
      connection()?.addEventListener?.("change", () => {
        cached = null
      })
    } catch {
      /* no change event: the first answer stands for the page */
    }
  }
  return cached
}

/** For tests: forget the answer and everything read ahead. */
export function resetPrefetchPolicy(): void {
  cached = null
  fetchedAt.clear()
}

/* ── The fetching ─────────────────────────────────────────────────────── */

type RouterLike = { prefetch: (href: string, options?: never) => void }

/**
 * NOBODY ASKS FOR THE SAME PAGE TWICE IN A FEW MINUTES. The router keeps a
 * page it read ahead for staleTimes (five minutes, next.config.mjs), so a
 * second read inside that is a request for nothing. Four minutes, so a page
 * is read again a little before the router would let it go.
 */
const KEEP_MS = 4 * 60_000
const fetchedAt = new Map<string, { at: number; full: boolean }>()

function pathOf(href: string): string | null {
  if (!href || href.startsWith("#") || /^(mailto|tel|sms|javascript):/i.test(href)) return null
  if (typeof window === "undefined") return href.startsWith("/") ? href : null
  try {
    const url = new URL(href, window.location.href)
    if (url.origin !== window.location.origin) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

/**
 * WHETHER A TAB'S PAGE IS WORTH READING BEFORE ANYBODY PRESSES IT (round 54).
 * The buyer tab bar read every other tab's whole page as soon as it was up,
 * for every visitor. For somebody not signed in that was the sign in page
 * and the library (which sends them to sign in): measured on a production
 * build, a stranger's Explore, community or product page asked the server
 * for /login and /account/library before they touched anything, each a
 * render no CDN may hold (an RSC request never is). A signed out visitor
 * from a shared link almost never opens either, and when they do the press
 * itself still reads it (prefetchHref "press" on the touch).
 */
export function worthReadingAhead(href: string, signedIn: boolean | null | undefined): boolean {
  if (signedIn) return true
  const path = href.split(/[?#]/)[0]
  return !/^\/(?:login|signup|account)(?:\/|$)/.test(path)
}

/**
 * Read one page ahead, if the plan says this intent is worth it. A press
 * always reads (it is the page the person is about to see); the other
 * intents follow the tier. Returns whether a read was asked for.
 */
export function prefetchHref(router: RouterLike | null | undefined, href: string, intent: PrefetchIntent = "idle"): boolean {
  if (!router) return false
  const path = pathOf(href)
  if (!path) return false
  if (typeof window !== "undefined" && path === `${window.location.pathname}${window.location.search}`) return false
  const plan = prefetchPlan()
  const allowed =
    intent === "press" ||
    (intent === "hover" && plan.onHover) ||
    (intent === "visible" && plan.onVisible) ||
    (intent === "idle" && plan.idleBudget > 0)
  if (!allowed) return false
  /* A press or a hover wants the whole page; idle and visible reads follow the plan. */
  const full = intent === "press" || intent === "hover" || plan.idleFull
  const seen = fetchedAt.get(path)
  const now = Date.now()
  if (seen && now - seen.at < KEEP_MS && (seen.full || !full)) return false
  fetchedAt.set(path, { at: now, full })
  try {
    if (full) router.prefetch(path, { kind: "full" } as never)
    else router.prefetch(path)
  } catch {
    /* a read ahead that fails is a press that waits, nothing worse */
    fetchedAt.delete(path)
    return false
  }
  return true
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: (d: { timeRemaining: () => number }) => void, o?: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}

/**
 * Read a list of pages ahead while the phone has nothing else to do, most
 * likely first, at most the plan's budget, one per idle slice so a press in
 * the middle is never behind a burst of them. Returns the cancel.
 */
export function prefetchOnIdle(router: RouterLike | null | undefined, hrefs: readonly string[]): () => void {
  if (typeof window === "undefined" || !router) return () => {}
  const plan = prefetchPlan()
  const queue = hrefs.slice(0, plan.idleBudget)
  if (queue.length === 0) return () => {}
  const w = window as IdleWindow
  let cancelled = false
  let idleId = 0
  let timer = 0
  const step = () => {
    if (cancelled) return
    const next = queue.shift()
    if (next === undefined) return
    prefetchHref(router, next, "idle")
    if (queue.length) schedule(0)
  }
  const schedule = (delay: number) => {
    timer = window.setTimeout(() => {
      if (cancelled) return
      if (w.requestIdleCallback) idleId = w.requestIdleCallback(step, { timeout: 2000 })
      else step()
    }, delay)
  }
  schedule(plan.idleDelayMs)
  return () => {
    cancelled = true
    window.clearTimeout(timer)
    if (idleId && w.cancelIdleCallback) w.cancelIdleCallback(idleId)
  }
}
