/**
 * ===========================================================================
 *  VISITS, THEN SIGN UPS, THEN PAID, BY AI ASSISTANT
 * ===========================================================================
 * Pure: the admin's Audience view (lib/admin/views/platform.ts) reads the
 * rows and this adds them up, so the suite can hold the rules.
 *
 *   visits    page views across every storefront (analytics_events), whose
 *             referrer or utm_source names an assistant. Storelib's own
 *             marketing pages are not in analytics_events: Vercel Web
 *             Analytics counts those, with consent.
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
  views: number
  visitors: number
  signups: number
  paidPlan: number
  hasSale: number
}

export interface AiFunnel {
  rows: AiFunnelRow[]
  /** Totals over the assistants. */
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
      r = { key, label: aiSourceLabel(key) ?? key, views: 0, visitors: 0, signups: 0, paidPlan: 0, hasSale: 0, ids: new Set() }
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
    .sort((a, b) => b.signups - a.signups || b.views - a.views || a.label.localeCompare(b.label))
  const sum = (k: "views" | "visitors" | "signups" | "paidPlan" | "hasSale") => rows.reduce((n, r) => n + r[k], 0)
  return { rows, views: sum("views"), visitors: sum("visitors"), signups: sum("signups"), paidPlan: sum("paidPlan"), hasSale: sum("hasSale"), signupsAll: input.signupsAll }
}
