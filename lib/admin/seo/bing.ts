import "server-only"

/**
 * ===========================================================================
 *  BING WEBMASTER TOOLS: CLICKS AND IMPRESSIONS, WHEN AN API KEY IS SET
 * ===========================================================================
 * BING_WEBMASTER_API_KEY is the key from Bing Webmaster Tools (Settings,
 * API access). With it, GetRankAndTrafficStats
 * (learn.microsoft.com/dotnet/api/microsoft.bing.webmaster.api.interfaces.
 * iwebmasterapi.getrankandtrafficstats) answers clicks and impressions per
 * day for the site, BING_WEBMASTER_SITE_URL (https://storelib.com/ when
 * unset). Microsoft documents those as counting every Bing vertical,
 * chat included, since March 2023.
 *
 * COPILOT CITATIONS. Bing's AI Performance report (public preview since
 * February 2026) is in the Bing Webmaster Tools dashboard only; no API for
 * it was documented when this was written (October 2026). The console links
 * to it rather than showing a figure.
 *
 * The key is sent to Bing and nowhere else, never logged and never shown.
 * Kept in memory for an hour per server.
 */

export const BING_API = "https://ssl.bing.com/webmaster/api.svc/json/GetRankAndTrafficStats"
export const BING_AI_PERFORMANCE_URL = "https://www.bing.com/webmasters/aiperformance"

export interface BingStats {
  siteUrl: string
  days: number
  clicks: number
  impressions: number
  from: string | null
  to: string | null
  readAt: string
  error: string | null
}

export function bingFromEnv(env: Record<string, string | undefined> = process.env): { key: string; siteUrl: string } | null {
  const key = env.BING_WEBMASTER_API_KEY?.trim()
  if (!key) return null
  const site = env.BING_WEBMASTER_SITE_URL?.trim()
  return { key, siteUrl: site && /^https?:\/\/[^\s]+$/.test(site) ? site : "https://storelib.com/" }
}

/** "/Date(1316156400000-0700)/", the API's date, as milliseconds. */
export function bingDate(value: unknown): number | null {
  const m = /\/Date\((-?\d+)([+-]\d{4})?\)\//.exec(String(value ?? ""))
  return m ? Number(m[1]) : null
}

/** The last 28 days of what the API answered, added up. */
export function sumBingStats(json: unknown, siteUrl: string, now = Date.now()): Omit<BingStats, "readAt" | "error"> {
  const rows = (json as { d?: unknown[] })?.d
  const since = now - 28 * 86_400_000
  let clicks = 0
  let impressions = 0
  let from: number | null = null
  let to: number | null = null
  let days = 0
  for (const r of Array.isArray(rows) ? rows : []) {
    const x = r as { Date?: unknown; Clicks?: unknown; Impressions?: unknown }
    const at = bingDate(x.Date)
    if (at === null || at < since) continue
    days++
    clicks += Number(x.Clicks) || 0
    impressions += Number(x.Impressions) || 0
    from = from === null ? at : Math.min(from, at)
    to = to === null ? at : Math.max(to, at)
  }
  const day = (t: number | null) => (t === null ? null : new Date(t).toISOString().slice(0, 10))
  return { siteUrl, days, clicks, impressions, from: day(from), to: day(to) }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>

let held: { until: number; value: BingStats } | null = null

export async function bingStats(config: { key: string; siteUrl: string }, fetchImpl: Fetch = fetch): Promise<BingStats> {
  if (held && held.until > Date.now() && held.value.siteUrl === config.siteUrl) return held.value
  const readAt = new Date().toISOString()
  try {
    const url = `${BING_API}?siteUrl=${encodeURIComponent(config.siteUrl)}&apikey=${encodeURIComponent(config.key)}`
    const res = await fetchImpl(url, { headers: { "Content-Type": "application/json; charset=utf-8" }, signal: AbortSignal.timeout(10_000) })
    if (!res.ok) {
      return { siteUrl: config.siteUrl, days: 0, clicks: 0, impressions: 0, from: null, to: null, readAt, error: res.status === 401 || res.status === 403 ? "Bing did not accept the API key, or the site is not verified for it." : `Bing answered ${res.status}.` }
    }
    const value: BingStats = { ...sumBingStats(await res.json(), config.siteUrl), readAt, error: null }
    held = { until: Date.now() + 60 * 60 * 1000, value }
    return value
  } catch {
    return { siteUrl: config.siteUrl, days: 0, clicks: 0, impressions: 0, from: null, to: null, readAt, error: "Bing did not answer in time." }
  }
}
