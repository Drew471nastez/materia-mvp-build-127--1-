/**
 * ===========================================================================
 *  THE ANALYTICS ANSWER, KEPT AND FETCHED AHEAD
 * ===========================================================================
 * Browser only. Shared by the Analytics page (app/app/analytics/
 * analytics-reports.tsx useAnalyticsReports) and the places that warm it
 * before it is opened (lib/ui/app-navigation prefetchAppPage, the sidebar and
 * the phone's pill; components/shared/prefetch-links, Home when it is idle).
 *
 * THE LAST NUMBERS AT ONCE. Every complete answer is kept, per question, in
 * memory and in this browser's storage. Coming back to Analytics shows the
 * last numbers for the period on the first frame, sharp, and the page asks
 * again behind them; when the new ones land they move to it as any refresh
 * does. An answer older than KEEP_MS is not shown: numbers from this morning
 * would be a wrong page, not a quick one.
 *
 * ASKED ONCE. A request already on its way for the same question is joined,
 * not repeated: the pointer on the sidebar's Analytics row starts it, and the
 * page the click opens picks it up where it is.
 *
 * FIGURES FIRST. The answer comes as lines (app/api/analytics/reports,
 * `stream=1`): the figures when they are counted, then everything. Whoever
 * is waiting hears both.
 *
 * WHOSE. Each answer names who it was counted for (`viewer`), and the page
 * only shows one counted for the person signed in: a browser shared by two
 * accounts never shows one the other's numbers, even for a frame.
 */
import { boundsOf, compareBounds, resolveValue, todayIn, type CompareValue } from "@/lib/date-range/range"
import { viewerTimeZone } from "@/lib/orders/time-zone"

/** How long a kept answer may be shown while the page asks again. */
export const KEEP_MS = 30 * 60_000
/** How long a kept answer is simply the answer: nothing is asked again. */
export const FRESH_MS = 15_000
/**
 * A running period ends "now", and a new "now" is a new question to the
 * server's short cache. Rounded up to the next ten seconds, a prefetch and
 * the page it warmed ask the very same question, and the server answers the
 * second from memory. Rounding up only ever reaches a moment with nothing in
 * it yet, so no view or order is left out.
 */
export const NOW_STEP_MS = 10_000
export function reportNow(ms = Date.now()): number {
  return Math.ceil(ms / NOW_STEP_MS) * NOW_STEP_MS
}

/** Analytics opens on the last 7 days, compared with the 7 before (analytics-client). */
export const DEFAULT_PRESET = "last_7_days" as const
const PREVIOUS_PERIOD: CompareValue = { mode: "previous_period" }

export interface ReportQuestion {
  start: number
  end: number
  compare: { start: number; end: number } | null
  product: string
  /** Which of the creator's places: "all", "creator_page", "onepage" or "website:<id>" (lib/analytics/properties). */
  property: string
  timeZone: string
  /**
   * The store's selling currency when the caller knows it. Money in the
   * answer is converted into it, so a change of currency is a different
   * question: the numbers kept for the old one are not shown as the new one.
   */
  currency?: string
}

/** The query string the page asks with. The same question is always the same string. */
export function reportKey(q: ReportQuestion): string {
  const p = new URLSearchParams({
    start: new Date(q.start).toISOString(),
    end: new Date(q.end).toISOString(),
    tz: q.timeZone,
    product: q.product,
    property: q.property,
  })
  const currency = (q.currency || "").trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(currency)) p.set("ccy", currency)
  if (q.compare) {
    p.set("cstart", new Date(q.compare.start).toISOString())
    p.set("cend", new Date(q.compare.end).toISOString())
  } else {
    p.set("compare", "none")
  }
  return p.toString()
}

/** What was asked, without the moving end of a period that runs to now. */
export function questionOf(key: string | undefined): string {
  const p = new URLSearchParams(key || "")
  p.delete("end")
  p.delete("cend")
  return p.toString()
}

/* ─── Kept answers ─────────────────────────────────────────────────────── */

export interface Kept {
  key: string
  at: number
  /** The answer as the server sent it: reports, allTime, truncated, and whose it is. */
  answer: { viewer?: string; [k: string]: unknown }
}

/* v2: the answer counts visitors and every place (lib/analytics/reports); a v1 answer is another shape and is not shown. */
const STORE = "storelib.analytics.answers.v2"
const MAX_KEPT = 8
let memory: Map<string, Kept> | null = null

/*
  KEPT ACROSS A RESTART OF THE APP. sessionStorage ends with the tab, and the
  phone app's web view is a new tab every time it is opened, so Home and
  Analytics opened soft every time, waiting on the server. The answers are
  kept in localStorage as well; the KEEP_MS rule is the same either way.
*/
function readStore(storage: Storage | undefined): Kept[] {
  try {
    return storage ? (JSON.parse(storage.getItem(STORE) || "[]") as Kept[]) : []
  } catch {
    return []
  }
}

function kept(): Map<string, Kept> {
  if (memory) return memory
  memory = new Map()
  const local = typeof localStorage === "undefined" ? undefined : localStorage
  const session = typeof sessionStorage === "undefined" ? undefined : sessionStorage
  for (const k of [...readStore(local), ...readStore(session)].sort((a, b) => (a?.at ?? 0) - (b?.at ?? 0))) {
    /* nothing kept, or storage closed: the page asks as it always did */
    if (k && typeof k.key === "string" && Date.now() - k.at < KEEP_MS) memory.set(questionOf(k.key), k)
  }
  return memory
}

/** The last complete answer to this question for this person, if it is recent enough to show. */
export function keptAnswer(question: string, viewer: string | null): Kept | null {
  const k = kept().get(question)
  if (!k || Date.now() - k.at > KEEP_MS) return null
  if (!viewer || k.answer.viewer !== viewer) return null
  return k
}

export function keepAnswer(key: string, answer: Kept["answer"]) {
  const all = kept()
  const question = questionOf(key)
  all.delete(question)
  all.set(question, { key, at: Date.now(), answer })
  while (all.size > MAX_KEPT) all.delete(all.keys().next().value as string)
  const saved = JSON.stringify([...all.values()])
  try {
    sessionStorage.setItem(STORE, saved)
  } catch {
    /* full or closed: memory still has it for this visit */
  }
  try {
    localStorage.setItem(STORE, saved)
  } catch {
    /* the same */
  }
}

/* ─── Asking ───────────────────────────────────────────────────────────── */

type Line = { part?: string; [k: string]: unknown }

interface Flight {
  promise: Promise<Kept["answer"]>
  figures: Line | null
  listeners: Set<(figures: Line) => void>
  holders: number
  done: boolean
  ctrl: AbortController
}
const flights = new Map<string, Flight>()

/**
 * The answer to `key`, joining one already on its way. `onFigures` hears the
 * quick first answer, at once if it is already here. `release` says the
 * caller no longer wants it: when nobody does, the request is dropped.
 */
export function askReport(key: string, onFigures?: (figures: Line) => void): { promise: Promise<Kept["answer"]>; release: () => void } {
  let f = flights.get(key)
  if (!f) {
    const ctrl = new AbortController()
    const flight: Flight = { promise: Promise.resolve({}), figures: null, listeners: new Set(), holders: 0, done: false, ctrl }
    flight.promise = hedged(key, ctrl.signal, (figures) => {
      if (flight.figures) return
      flight.figures = figures
      for (const l of flight.listeners) l(figures)
    })
      .then((answer) => {
        keepAnswer(key, answer)
        return answer
      })
      .finally(() => {
        flight.done = true
        flights.delete(key)
      })
    flights.set(key, flight)
    f = flight
  }
  const flight = f
  flight.holders++
  if (onFigures) {
    flight.listeners.add(onFigures)
    if (flight.figures) onFigures(flight.figures)
  }
  let released = false
  return {
    promise: flight.promise,
    release: () => {
      if (released) return
      released = true
      if (onFigures) flight.listeners.delete(onFigures)
      flight.holders--
      if (flight.holders <= 0 && !flight.done) {
        flight.ctrl.abort()
        flights.delete(key)
      }
    },
  }
}

/**
 * HEDGED, SO A STUCK REQUEST IS NOT A 15 SECOND BLUR. A phone coming back
 * from the background often sends the first request down a connection that
 * is already dead, and a server waking from cold can sit on one: the page's
 * figures stayed soft until the page's own safety net gave up. If no figures
 * have come by HEDGE_MS a second request is sent beside the first (the first
 * is not dropped: it may still be the quicker), and a request that fails
 * early is asked once more at once. The first complete answer wins and the
 * other is cancelled. Never more than two.
 */
const HEDGE_MS = 4_000
function hedged(key: string, signal: AbortSignal, onFigures: (figures: Line) => void): Promise<Kept["answer"]> {
  return new Promise((resolve, reject) => {
    const tries: AbortController[] = []
    let failed = 0
    let settled = false
    let gotFigures = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = () => {
      settled = true
      clearTimeout(timer)
      for (const t of tries) t.abort()
    }
    const start = () => {
      const ctrl = new AbortController()
      tries.push(ctrl)
      read(key, ctrl.signal, (figures) => {
        gotFigures = true
        onFigures(figures)
      }).then(
        (answer) => {
          if (settled) return
          finish()
          resolve(answer)
        },
        (error) => {
          if (settled) return
          failed++
          if (tries.length < 2 && !signal.aborted) return start()
          if (failed >= tries.length) {
            finish()
            reject(error)
          }
        },
      )
    }
    signal.addEventListener("abort", () => {
      if (settled) return
      finish()
      reject(new DOMException("Aborted", "AbortError"))
    }, { once: true })
    start()
    timer = setTimeout(() => {
      if (!settled && !gotFigures && tries.length < 2) start()
    }, HEDGE_MS)
  })
}

/** One request, read line by line as it arrives. */
async function read(key: string, signal: AbortSignal, onFigures: (figures: Line) => void): Promise<Kept["answer"]> {
  const res = await fetch(`/api/analytics/reports?${key}&stream=1`, { signal })
  if (!res.ok) throw new Error(String(res.status))
  if (!res.body || !(res.headers.get("content-type") || "").includes("ndjson")) return (await res.json()) as Kept["answer"]
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { value, done } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    let nl = buffer.indexOf("\n")
    while (nl >= 0) {
      const text = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      nl = buffer.indexOf("\n")
      if (!text) continue
      const line = JSON.parse(text) as Line
      if (line.part === "figures") onFigures(line)
      else if (line.part === "error") throw new Error(String(line.error || "Could not read analytics"))
      else if (line.part === "all") {
        const { part: _part, ...answer } = line
        return answer
      }
    }
    if (done) break
  }
  throw new Error("The answer ended early")
}

/* ─── The store currency the open app is showing ──────────────────────── */

let notedCurrency = ""

/** Settings told the app the store's currency (lib/store/currency-context). The prefetch uses it so its question matches the page. */
export function noteStoreCurrency(code: string) {
  const currency = code.trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(currency)) notedCurrency = currency
}

export function notedStoreCurrency(): string {
  return notedCurrency
}

/* ─── Warming ──────────────────────────────────────────────────────────── */

let warmedAt = 0

/**
 * THE PAGE AS IT WILL OPEN: the last 7 days against the 7 before, every
 * place, every product, in the viewer's zone, fetched ahead and kept. At most
 * once a minute, and not at all while a recent answer is kept or one is on
 * its way, so a pointer resting on the sidebar asks nothing more.
 */
export function warmAnalytics() {
  try {
    if (Date.now() - warmedAt < 60_000) return
    const timeZone = viewerTimeZone()
    const now = reportNow()
    const period = resolveValue({ preset: DEFAULT_PRESET }, todayIn(timeZone, now), DEFAULT_PRESET)
    const span = boundsOf(period, timeZone, now)
    const key = reportKey({
      start: span.start,
      end: Math.max(span.end, span.start + 1),
      compare: compareBounds(period, PREVIOUS_PERIOD, timeZone, now),
      product: "all",
      property: "all",
      timeZone,
      currency: notedCurrency || undefined,
    })
    const k = kept().get(questionOf(key))
    if (k && Date.now() - k.at < FRESH_MS) return
    warmedAt = Date.now()
    const { promise, release } = askReport(key)
    promise.catch(() => {}).finally(release)
  } catch {
    /* a warm that fails is a page that asks for itself, nothing worse */
  }
}
