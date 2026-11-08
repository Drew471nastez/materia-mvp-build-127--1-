/**
 * ===========================================================================
 *  ONE FORM'S INSIGHTS (round 51, Contacts › Forms › a form › Insights)
 * ===========================================================================
 * Worked out from the responses the form already keeps (form_submissions),
 * nothing else: Storelib does not record who opened a form without sending
 * it, so there is no completion rate to show and none is invented. What it
 * says:
 *
 *   total, last 30 days    how many responses, and how many recently
 *   weeks                  responses per week for the last 12 weeks, oldest first
 *   sources                where they came from (OnePage, website, creator page, the form's own link)
 *   statuses               where the follow up stands (new, contacted, qualified, converted)
 *   identified             how many left an email or a phone number
 *   scores                 for a quiz: how many landed in each result's range, or
 *                          in score bands when it has no results
 *
 * Pure, so the route and the tests share it.
 */
import type { QuizResult } from "./definition"

export interface InsightRow {
  submitted_at: string
  score?: number | null
  status?: string | null
  source_kind?: string | null
  contact_email?: string | null
  contact_phone?: string | null
}

export interface FormInsights {
  total: number
  last30: number
  weeks: { start: string; count: number }[]
  sources: Record<string, number>
  statuses: Record<string, number>
  identified: number
  scores: { label: string; min: number; max: number; count: number }[] | null
  /** More responses than were read: the figures are for the newest `read`. */
  capped: boolean
}

const WEEK = 7 * 86_400_000

export function formInsights(rows: InsightRow[], opts: { now?: number; quiz?: boolean; results?: QuizResult[]; capped?: boolean } = {}): FormInsights {
  const now = opts.now ?? Date.now()
  const today = new Date(now)
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const firstWeek = startOfToday - 11 * WEEK - ((today.getUTCDay() + 6) % 7) * 86_400_000
  const weeks = Array.from({ length: 12 }, (_, i) => ({ start: new Date(firstWeek + i * WEEK).toISOString().slice(0, 10), count: 0 }))
  const sources: Record<string, number> = {}
  const statuses: Record<string, number> = {}
  let last30 = 0
  let identified = 0
  for (const r of rows) {
    const t = Date.parse(r.submitted_at)
    if (Number.isFinite(t)) {
      if (now - t <= 30 * 86_400_000) last30++
      const w = Math.floor((t - firstWeek) / WEEK)
      if (w >= 0 && w < 12) weeks[w].count++
    }
    const source = r.source_kind || "form"
    sources[source] = (sources[source] ?? 0) + 1
    const status = r.status || "new"
    statuses[status] = (statuses[status] ?? 0) + 1
    if ((r.contact_email && r.contact_email.trim()) || (r.contact_phone && r.contact_phone.trim())) identified++
  }
  let scores: FormInsights["scores"] = null
  if (opts.quiz) {
    const results = (opts.results ?? []).filter((x) => Number.isFinite(x.min) && Number.isFinite(x.max))
    if (results.length) {
      scores = results.map((x) => ({ label: x.title, min: x.min, max: x.max, count: 0 }))
    } else {
      const values = rows.map((r) => Number(r.score ?? 0)).filter(Number.isFinite)
      const top = Math.max(0, ...values)
      const step = Math.max(1, Math.ceil((top + 1) / 5))
      scores = Array.from({ length: 5 }, (_, i) => ({ label: `${i * step}–${i * step + step - 1}`, min: i * step, max: i * step + step - 1, count: 0 }))
    }
    for (const r of rows) {
      const s = Number(r.score ?? 0)
      const band = scores.find((b) => s >= b.min && s <= b.max)
      if (band) band.count++
    }
  }
  return { total: rows.length, last30, weeks, sources, statuses, identified, scores, capped: opts.capped === true }
}
