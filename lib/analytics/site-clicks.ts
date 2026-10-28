/**
 * ===========================================================================
 *  CLICKS BETWEEN PAGES: WHICH BUTTONS MOVE PEOPLE, FROM WHERE TO WHERE
 * ===========================================================================
 * A link or a button on a live website (a Storelib theme or an imported one)
 * that leads to another page of the same site is recorded as a nav_click
 * (lib/analytics/page-tracker watchInternalLinks, the compat tracker, judged
 * by lib/analytics/collect): the page it was on (`path`), the page it led to
 * (`link_url`) and its words (`link_label`), once per visit.
 *
 * The report lists them by button: its words, the page it was on and the
 * page it led to, with its clicks, the people who clicked, and the period
 * before. analytics_nav_clicks (supabase/sql/run-now part 331) counts them in
 * Postgres; navWireFromRows counts the same rows here by the same rules, for
 * a database without it and for the tests.
 */
import type { Span } from "./buckets"
import { counts, propertyName, type CreatorProperties, type PropertySelector } from "./properties"
import { changeOf } from "./percent"
import { navKey } from "./row-series"

/** One button's clicks: [property_type, property_id, from path, to path, words, clicks, people, clicks in the period before]. */
export type NavWireRow = [string | null, string | null, string | null, string | null, string | null, number, number, number]

/** What analytics_nav_clicks answers: the period's clicks, the period before's, and the 100 most clicked buttons. */
export interface NavWire {
  cur: number
  prev: number
  rows: NavWireRow[]
}

export const NAV_ROWS_MAX = 100

/** A nav_click as the reports read it. */
export interface NavClickRow {
  id?: string
  event_type?: string
  created_at: string
  session_id?: string | null
  visitor_id?: string | null
  property_type?: string | null
  property_id?: string | null
  path?: string | null
  link_url?: string | null
  link_label?: string | null
}

const visitorOf = (r: NavClickRow) => (r.visitor_id || "") || (r.session_id || "") || `e:${r.id ?? r.created_at}`

/** The clicks of both periods, counted from the rows (analytics_nav_clicks by the same rules). */
export function navWireFromRows(input: { rows: NavClickRow[]; window: Span; previous: Span | null; selector: PropertySelector; defaultWebsite: string | null }): NavWire {
  const { window: cur, previous: prev } = input
  const mine = input.rows.filter(
    (r) => (r.event_type ?? "nav_click") === "nav_click" && !!r.property_type && counts(input.selector, { type: r.property_type as never, id: r.property_id ?? null }, input.defaultWebsite),
  )
  const within = (r: NavClickRow, w: Span | null) => {
    if (!w) return false
    const at = Date.parse(r.created_at)
    return at >= w.start && at < w.end
  }
  const now = mine.filter((r) => within(r, cur))
  const before = mine.filter((r) => within(r, prev))
  const rows = new Map<string, { r: NavClickRow; clicks: number; people: Set<string>; prev: number }>()
  for (const r of now) {
    const k = navKey(r.property_type, r.property_id, r.path, r.link_url, r.link_label)
    const row = rows.get(k) ?? { r, clicks: 0, people: new Set<string>(), prev: 0 }
    row.clicks++
    row.people.add(visitorOf(r))
    rows.set(k, row)
  }
  for (const r of before) {
    const row = rows.get(navKey(r.property_type, r.property_id, r.path, r.link_url, r.link_label))
    if (row) row.prev++
  }
  const keyed = [...rows.entries()].sort((a, b) => b[1].clicks - a[1].clicks || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).slice(0, NAV_ROWS_MAX)
  return {
    cur: now.length,
    prev: before.length,
    rows: keyed.map(([, x]) => [x.r.property_type ?? null, x.r.property_id ?? null, x.r.path ?? null, x.r.link_url ?? null, x.r.link_label ?? null, x.clicks, x.people.size, x.prev]),
  }
}

export interface SiteClickRow {
  key: string
  /** The button's words, else the page it leads to. */
  label: string
  from: string
  to: string
  /** Which site it is on, under All with more than one; null otherwise. */
  place: string | null
  clicks: number
  visitors: number
  previous: number
  share: number
}

export interface SiteClicks {
  value: number
  previous: number
  change: number | null
  rows: SiteClickRow[]
}

/** The report from what was counted. */
export function siteClicksOf(wire: NavWire, opts: { compared: boolean; selector: PropertySelector; properties: CreatorProperties }): SiteClicks {
  const value = Number(wire.cur) || 0
  const previous = opts.compared ? Number(wire.prev) || 0 : 0
  /* The site is named only when the list holds clicks of more than one. */
  const many = opts.selector.type === "all" && new Set((wire.rows ?? []).map((r) => `${r[0]}|${r[1] ?? ""}`)).size > 1
  const rows = (wire.rows ?? []).map(([pt, pid, from, to, label, clicks, people, before]) => {
    const c = Number(clicks) || 0
    return {
      key: navKey(pt, pid, from, to, label),
      label: (label || "").trim() || to || "/",
      from: from || "/",
      to: to || "/",
      place: many && pt ? propertyName({ type: pt as never, id: pid }, opts.properties) : null,
      clicks: c,
      visitors: Number(people) || 0,
      previous: opts.compared ? Number(before) || 0 : 0,
      share: value > 0 ? c / value : 0,
    }
  })
  return { value, previous, change: opts.compared ? changeOf(value, previous) : null, rows }
}
