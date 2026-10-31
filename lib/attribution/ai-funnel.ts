/**
 * ===========================================================================
 *  VISITS, THEN SIGN UPS, THEN PAID, BY AI ASSISTANT
 * ===========================================================================
 * Pure: the admin's Audience view (lib/admin/views/platform.ts) reads the
 * rows and this adds them up, so the suite can hold the rules.
 *
 *   visits    page views across every storefront (analytics_events), whose
 *             referrer or utm_source names an assistant. Storelib's own
 *             marketing pages are not in analytics_events.
 *   storelib.com visits
 *             (round 46) visits to Storelib's own public pages, counted by
 *             Storelib per day, assistant and landing path
 *             (platform_ai_visits, part 347, lib/attribution/ai-visits): a
 *             visitor who said yes to analytics, once per tab session. Null
 *             before part 347 runs, and the panel says so.
 *   sign ups  Storelib accounts (part 346, account_attribution) whose first
 *             or last touch names an assistant. Credited to the last touch's
 *             assistant, the first's when the last names none.
 *   paid      of those accounts, the ones whose store is on a paid plan now
 *             (subscriptions active, trialing or past due), and the ones whose
 *             store has made a sale (any product with a sale).
 *
 * Every figure is AI-referred where the source is known: most visits from an
 * assistant arrive with no referrer, and are Direct in every figure here.
 */
import { aiSourceLabel, aiSourceOf, type AiSourceKey } from "./ai-sources"

export interface AiFunnelRow {
  key: AiSourceKey
  label: string
  /** Visits to storelib.com's own pages (part 347). 0 when none, or before it runs (AiFunnel.siteVisits is null then). */
  siteVisits: number
  views: number
  visitors: number
  signups: number
  paidPlan: number
  hasSale: number
}

export interface AiLandingRow {
  key: AiSourceKey
  label: string
  path: string
  visits: number
}

export interface AiFunnel {
  rows: AiFunnelRow[]
  /** Totals over the assistants. Null when storelib.com visits are not counted yet (part 347 not run, or not read). */
  siteVisits: number | null
  /** The landing pages each assistant sent the most storelib.com visits to, LANDINGS_PER_ASSISTANT each, in the rows' order. */
  landings: AiLandingRow[]
  views: number
  visitors: number
  signups: number
  paidPlan: number
  hasSale: number
  /** Every sign up recorded in the window, any source, so the AI share can be read against it. Null when not read. */
  signupsAll: number | null
}

export interface ViewRow {
  visitor_id: string | null
  referrer_domain: string | null
  utm_source: string | null
}

/** A row of platform_ai_visits: one day's count for one assistant and landing path. */
export interface SiteVisitRow {
  ai_source: string | null
  landing_path: string | null
  visits: number | string | null
}

export const LANDINGS_PER_ASSISTANT = 3

export interface SignupRow {
  user_id: string
  first_ai_source: string | null
  last_ai_source: string | null
}

/** The assistant an account is credited to: its last touch's, else its first's. */
export function signupAiSource(r: Pick<SignupRow, "first_ai_source" | "last_ai_source">): AiSourceKey | null {
  const k = r.last_ai_source || r.first_ai_source
  return k && aiSourceLabel(k) ? (k as AiSourceKey) : null
}

export function buildAiFunnel(input: {
  views: ViewRow[] | null
  /** platform_ai_visits for the window; null when the table is not there yet. */
  siteVisits?: SiteVisitRow[] | null
  signups: SignupRow[] | null
  signupsAll: number | null
  /** Accounts on a paid plan now. */
  paidUsers: ReadonlySet<string>
  /** Accounts whose store has a sale. */
  saleUsers: ReadonlySet<string>
}): AiFunnel {
  const by = new Map<AiSourceKey, AiFunnelRow & { ids: Set<string> }>()
  const row = (key: AiSourceKey) => {
    let r = by.get(key)
    if (!r) {
      r = { key, label: aiSourceLabel(key) ?? key, siteVisits: 0, views: 0, visitors: 0, signups: 0, paidPlan: 0, hasSale: 0, ids: new Set() }
      by.set(key, r)
    }
    return r
  }
  for (const v of input.views ?? []) {
    const ai = aiSourceOf({ referrerHost: v.referrer_domain, utmSource: v.utm_source })
    if (!ai) continue
    const r = row(ai.key)
    r.views++
    if (v.visitor_id) r.ids.add(v.visitor_id)
  }
  /* bigint arrives as a number or, past 2^53, a string; a count that is not a whole positive number is not added. */
  const pages = new Map<string, AiLandingRow>()
  for (const v of input.siteVisits ?? []) {
    const key = v.ai_source && aiSourceLabel(v.ai_source) ? (v.ai_source as AiSourceKey) : null
    const n = Number(v.visits)
    if (!key || !v.landing_path || !Number.isFinite(n) || n <= 0) continue
    row(key).siteVisits += Math.floor(n)
    const id = `${key}|${v.landing_path}`
    const page = pages.get(id) ?? { key, label: aiSourceLabel(key) ?? key, path: v.landing_path, visits: 0 }
    page.visits += Math.floor(n)
    pages.set(id, page)
  }
  for (const s of input.signups ?? []) {
    const key = signupAiSource(s)
    if (!key) continue
    const r = row(key)
    r.signups++
    if (input.paidUsers.has(s.user_id)) r.paidPlan++
    if (input.saleUsers.has(s.user_id)) r.hasSale++
  }
  const rows = [...by.values()]
    .map(({ ids, ...r }) => ({ ...r, visitors: ids.size }))
    .sort((a, b) => b.signups - a.signups || b.siteVisits - a.siteVisits || b.views - a.views || a.label.localeCompare(b.label))
  const sum = (k: "siteVisits" | "views" | "visitors" | "signups" | "paidPlan" | "hasSale") => rows.reduce((n, r) => n + r[k], 0)
  const order = new Map(rows.map((r, i) => [r.key, i]))
  const shown = new Map<AiSourceKey, number>()
  const landings = [...pages.values()]
    .sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0) || b.visits - a.visits || a.path.localeCompare(b.path))
    .filter((p) => {
      const n = shown.get(p.key) ?? 0
      shown.set(p.key, n + 1)
      return n < LANDINGS_PER_ASSISTANT
    })
  return {
    rows,
    siteVisits: input.siteVisits ? sum("siteVisits") : null,
    landings,
    views: sum("views"),
    visitors: sum("visitors"),
    signups: sum("signups"),
    paidPlan: sum("paidPlan"),
    hasSale: sum("hasSale"),
    signupsAll: input.signupsAll,
  }
}
