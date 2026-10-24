/**
 * ===========================================================================
 *  THE SALES REPORTS' ANSWER, KEPT AND FETCHED AHEAD
 * ===========================================================================
 * Browser only. What lib/analytics/report-cache does for the chart, for
 * app/api/analytics/commerce (the cards under it, app/app/analytics/
 * commerce-reports): the last answer to each question kept in memory and in
 * this browser's storage for KEEP_MS, shown on the first frame when the page
 * is opened again, and asked again behind it; a request already on its way
 * for the same question joined, not repeated, so the sidebar's warm of
 * Analytics (report-cache warmAnalytics) is the page's own read.
 *
 * Whose: every kept answer names who was signed in when it was counted, and
 * is only shown to them.
 */

import { isMidnightIn } from "@/lib/date-range/range"

export const COMMERCE_KEEP_MS = 30 * 60_000
export const COMMERCE_FRESH_MS = 15_000

export interface CommerceQuestion {
  start: number
  end: number
  /** What it is compared with, or null for no comparison. */
  compare: { start: number; end: number } | null
  product: string
  property: string
  timeZone: string
  currency?: string
  /** The All / Digital / Physical switch; "all" or absent is no switch. */
  kind?: string
}

/** The query string the cards ask with; the same question is always the same string. */
export function commerceKey(q: CommerceQuestion): string {
  const p = new URLSearchParams({ from: String(Math.floor(q.start)), to: String(Math.ceil(q.end)), tz: q.timeZone, product: q.product, property: q.property })
  if (q.compare) {
    p.set("cstart", String(Math.floor(q.compare.start)))
    p.set("cend", String(Math.ceil(q.compare.end)))
  } else p.set("compare", "none")
  const ccy = (q.currency || "").trim().toUpperCase()
  if (/^[A-Z]{3}$/.test(ccy)) p.set("ccy", ccy)
  if (q.kind === "digital" || q.kind === "physical") p.set("kind", q.kind)
  return p.toString()
}

/**
 * The question without the moving end of a period that runs to now, so the
 * minute's refresh is the same question. A period that has ended keeps its
 * end, so two ranges starting the same day are two questions (report-cache
 * questionOf).
 */
export function commerceQuestionOf(key: string): string {
  const p = new URLSearchParams(key)
  const tz = p.get("tz") || "UTC"
  for (const name of ["to", "cend"]) {
    const v = p.get(name)
    if (v !== null && !isMidnightIn(Number(v), tz)) p.delete(name)
  }
  return p.toString()
}

interface Kept {
  key: string
  at: number
  viewer: string | null
  answer: unknown
}

const STORE = "storelib.analytics.commerce.v1"
const MAX = 8
let memory: Map<string, Kept> | null = null

function kept(): Map<string, Kept> {
  if (memory) return memory
  memory = new Map()
  try {
    const list = JSON.parse(localStorage.getItem(STORE) || "[]") as Kept[]
    for (const k of list) if (k && typeof k.key === "string" && Date.now() - k.at < COMMERCE_KEEP_MS) memory.set(commerceQuestionOf(k.key), k)
  } catch {
    /* nothing kept */
  }
  return memory
}

function persist() {
  try {
    const list = [...kept().values()].sort((a, b) => b.at - a.at).slice(0, MAX)
    localStorage.setItem(STORE, JSON.stringify(list))
  } catch {
    /* full or refused storage: memory still has it */
  }
}

/** The kept answer to this question for this viewer, when it is young enough to show. */
export function keptCommerce<T>(key: string, viewer: string | null): { answer: T; at: number } | null {
  const k = kept().get(commerceQuestionOf(key))
  if (!k || Date.now() - k.at >= COMMERCE_KEEP_MS) return null
  if ((k.viewer ?? null) !== (viewer ?? null)) return null
  return { answer: k.answer as T, at: k.at }
}

const flying = new Map<string, Promise<unknown>>()

/** Asks the server, or joins the request already asking. Each answer is kept for its viewer. */
export function askCommerce<T>(key: string, viewer: string | null): Promise<T> {
  const running = flying.get(key)
  if (running) return running as Promise<T>
  const p = fetch(`/api/analytics/commerce?${key}`, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`commerce ${r.status}`))))
    .then((answer: T) => {
      /* The server names who it counted for; that is whose it is. */
      const counted = (answer as { viewer?: unknown } | null)?.viewer
      kept().set(commerceQuestionOf(key), { key, at: Date.now(), viewer: typeof counted === "string" ? counted : viewer, answer })
      persist()
      return answer
    })
    .finally(() => flying.delete(key))
  flying.set(key, p)
  return p
}

/** Forget everything kept, for a sign-out or a test. */
export function forgetCommerce() {
  memory = new Map()
  flying.clear()
  try {
    localStorage.removeItem(STORE)
  } catch {
    /* nothing to remove */
  }
}
