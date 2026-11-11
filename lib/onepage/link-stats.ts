/**
 * ===========================================================================
 *  A ONEPAGE BLOCK'S FIGURES, COUNTED THE WAY ANALYTICS COUNTS THE ONEPAGE
 * ===========================================================================
 * The editor's link stats used to be their own count: every row of
 * onepage_views and onepage_clicks, robots, link previews and the creator's
 * own looks included, grouped by UTC day, and cut off at the first thousand
 * rows the database hands back. Analytics counted the same page from
 * analytics_events by its own rules. The two never agreed.
 *
 * Now both are one count (lib/onepage/link-stats-server):
 *
 *   views, visitors   the OnePage's page views and visitors, as Analytics'
 *                     OnePage property counts them (analytics_report, with
 *                     the visits from before its first event folded in
 *                     from onepage_views by foldLegacyOnePage)
 *   clicks            link_click events whose link id is this block, an
 *                     icon in it, or a block inside it (lib/onepage/
 *                     link-keys), and onepage_clicks from before the
 *                     OnePage's first event
 *   sign-ups          an email block's figure is the addresses it took
 *                     (onepage_leads), not taps on its gift link
 *   click rate        clicks out of page views, as Linktree and Beacons
 *                     give it; none at all with no views, never 0%
 *
 * Bucketed on the creator's clock by the buckets Analytics draws
 * (lib/analytics/buckets), so a day here is the same day there.
 *
 * Pure: no clock, no database.
 */
import { bucketIndex } from "@/lib/analytics/buckets"
import { isBotAgent } from "@/lib/analytics/user-agent"
import { clickBelongs } from "@/lib/onepage/link-keys"

export interface StatsPoint {
  /** The bucket's start, as an ISO instant. */
  date: string
  /** The bucket as the chart labels it: "Oct 28", "9 am". */
  label: string
  views: number
  clicks: number
  /** Clicks out of views in this bucket, in percent; 0 with no views, so the line has a point. */
  ctr: number
}

export interface BlockStats {
  total_views: number
  total_visitors: number
  total_clicks: number
  /** Clicks out of page views over the period, in percent with two places; null with no views. */
  click_rate: number | null
  /** What a click is on this block: "clicks", or "signups" for an email block. */
  counts: "clicks" | "signups"
  chart_data: StatsPoint[]
  /** True when a read hit its ceiling and the figures are a floor. */
  truncated: boolean
  /**
   * Round AS: a tips block's tips in the period, in the currency most of them were given in, with where the
   * tippers came from (lib/analytics/tip-sources blockTipSummary). Only for a tips block.
   */
  tips?: { count: number; cents: number; currency: string; from: Array<{ key: string; label: string; count: number; cents: number }> } | null
}

/** A click as read: when, and the link id it was kept under. */
export interface ClickAt {
  created_at: string
  link: string | null
}

/** Clicks out of views, in percent with two places; null when there were no views. */
export function clickRate(clicks: number, views: number): number | null {
  if (!Number.isFinite(views) || views <= 0) return null
  return Math.round((Math.max(0, clicks) / views) * 10_000) / 100
}

/**
 * The OnePage's older rows count only before its first event in
 * analytics_events (`since`), as foldLegacyOnePage reads them, and a robot's
 * row not at all. Null `since`: the older rows are the whole record.
 */
export function legacyBefore<T extends { created_at: string; user_agent?: string | null }>(rows: T[], since: number | null, { botsOut = false } = {}): T[] {
  return rows.filter((r) => {
    const at = Date.parse(r.created_at)
    if (!Number.isFinite(at)) return false
    if (since !== null && at >= since) return false
    return !botsOut || !isBotAgent(r.user_agent)
  })
}

/** Each row's bucket, counted; a row outside the period is left out. */
export function bucketCounts(rows: Array<{ created_at: string }>, starts: number[], window: { start: number; end: number }): number[] {
  const out = new Array<number>(starts.length).fill(0)
  for (const r of rows) {
    const at = Date.parse(r.created_at)
    if (!Number.isFinite(at) || at < window.start || at >= window.end) continue
    const b = bucketIndex(starts, at)
    if (b >= 0 && b < out.length) out[b]++
  }
  return out
}

const fit = (list: unknown, n: number): number[] => {
  const src = Array.isArray(list) ? list : []
  return Array.from({ length: n }, (_, i) => Number(src[i]) || 0)
}

/**
 * The block's figures from the page's own (the OnePage property's views and
 * visitors, with their buckets) and the block's clicks or sign-ups.
 */
export function blockStats(input: {
  window: { start: number; end: number }
  starts: number[]
  labels: string[]
  page: { views?: number; visitors?: number; view_buckets?: unknown }
  /** Clicks read for the period; filtered here to the block's ids. */
  clicks: ClickAt[]
  ids: Set<string>
  /** For an email block: its sign-ups, which are its figure instead of clicks. */
  signups?: Array<{ created_at: string }> | null
  truncated?: boolean
}): BlockStats {
  const n = input.starts.length
  const viewBuckets = fit(input.page.view_buckets, n)
  const own = input.signups ?? input.clicks.filter((c) => clickBelongs(c.link, input.ids))
  const clickBuckets = bucketCounts(own, input.starts, input.window)
  const totalClicks = clickBuckets.reduce((a, b) => a + b, 0)
  const totalViews = Number(input.page.views) || 0
  return {
    total_views: totalViews,
    total_visitors: Number(input.page.visitors) || 0,
    total_clicks: totalClicks,
    click_rate: clickRate(totalClicks, totalViews),
    counts: input.signups ? "signups" : "clicks",
    chart_data: input.starts.map((s, i) => ({
      date: new Date(s).toISOString(),
      label: input.labels[i] ?? "",
      views: viewBuckets[i],
      clicks: clickBuckets[i],
      ctr: clickRate(clickBuckets[i], viewBuckets[i]) ?? 0,
    })),
    truncated: !!input.truncated,
  }
}
