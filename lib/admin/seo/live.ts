import "server-only"

import { fetchPublic, redirectTarget } from "@/lib/api/public-fetch"

import { robotsAllows, scorePage, type ScoreResult } from "./score"

/**
 * ===========================================================================
 *  THE PAGE AS A CRAWLER GETS IT
 * ===========================================================================
 * The address is fetched from the server through the public-only fetch
 * (lib/api/public-fetch), with a time limit and a size limit, and without
 * following a redirect: an address in the sitemap that redirects is a
 * finding, not a page. Its host's robots.txt is read once per run.
 */

const PAGE_LIMIT = { maxBytes: 3 * 1024 * 1024, timeoutMs: 10_000, maxRedirects: 0 }
const ROBOTS_LIMIT = { maxBytes: 512 * 1024, timeoutMs: 5_000, maxRedirects: 2 }

export type RobotsCache = Map<string, Promise<string | null>>

/** robots.txt for an origin: its text, "" when there is none (4xx, which Google reads as allow all), null when it could not be read. */
function robotsFor(origin: string, cache: RobotsCache): Promise<string | null> {
  let held = cache.get(origin)
  if (!held) {
    held = fetchPublic(`${origin}/robots.txt`, ROBOTS_LIMIT)
      .then(async (res) => (res.ok ? await res.text() : res.status >= 400 && res.status < 500 ? "" : null))
      .catch(() => null)
    cache.set(origin, held)
  }
  return held
}

export interface LiveResult extends ScoreResult {
  httpStatus: number
  error: string | null
}

export async function checkLive(
  url: string,
  context: { inSitemap: boolean; google: "indexed" | "not_indexed" | null; robots?: RobotsCache },
): Promise<LiveResult> {
  const robots = context.robots ?? new Map()
  let status = 0
  let html = ""
  let error: string | null = null
  const headers: Record<string, string> = {}
  try {
    const res = await fetchPublic(url, PAGE_LIMIT)
    status = res.status
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value
    })
    const type = headers["content-type"] ?? ""
    html = type.includes("html") || !type ? await res.text() : ""
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e)
    if (/Too many redirects/.test(said)) {
      const to = await redirectTarget(url, { timeoutMs: 5000 }).catch(() => null)
      error = to ? `Redirects to ${to}` : "Redirects"
    } else error = /timed out/.test(said) ? "Took longer than 10 seconds" : /larger than allowed/.test(said) ? "Larger than 3 MB" : `Did not load (${said.slice(0, 80)})`
  }
  let robotsAllowed: boolean | null = null
  try {
    const u = new URL(url)
    const txt = await robotsFor(u.origin, robots)
    robotsAllowed = txt === null ? null : robotsAllows(txt, `${u.pathname}${u.search}`)
  } catch {
    robotsAllowed = null
  }
  const scored = scorePage({ url, status, headers, html, inSitemap: context.inSitemap, robotsAllowed, google: context.google, fetchError: error })
  return { ...scored, httpStatus: status, error }
}
