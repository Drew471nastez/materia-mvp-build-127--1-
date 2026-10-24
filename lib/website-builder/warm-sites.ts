import "server-only"

/**
 * ===========================================================================
 *  EVERY PUBLISHED WEBSITE IS DRAWN BEFORE ITS FIRST VISITOR, AFTER A DEPLOY
 * ===========================================================================
 * A published page is kept by Vercel for every visitor after it is drawn once
 * (revalidate 60, served stale while it is drawn again). But a new deployment
 * starts with an empty cache, and Storelib deploys many times a day, so the
 * first visitor to each page after each deploy waited for it to be drawn:
 * 0.5 to 1.6 s to the first byte, measured right after a deploy on five sites,
 * against about 0.2 s once held.
 *
 * So, once per deployment, each published website's front page and its
 * products page are asked for through the public address (the same CDN entry
 * a visitor gets), a few at a time. A page already held costs the CDN a
 * cached answer and nothing else. Progress is kept in platform_settings, so a
 * run cut short by its budget carries on in the next, and the same deploy is
 * never warmed twice. Content is never changed here: freshness stays with
 * revalidate and the tags each publish clears.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { publishedWebsiteOrigins } from "@/lib/seo/sitemaps"

export const WARM_KEY = "website_cache_warmed"
/** The pages asked for on each site: what a visitor lands on and goes to first. */
export const WARM_PATHS = ["/", "/products"] as const
const PAGE = 200
const AT_ONCE = 6
const EACH_MS = 15_000

type Progress = { deployment: string; offset: number; done: boolean }

export function deploymentOf(env: Record<string, string | undefined> = process.env): string | null {
  return env.VERCEL_DEPLOYMENT_ID || env.VERCEL_URL || null
}

/** Where to start for this deployment: from the top on a new one, where it stopped on the same one. */
export function startFrom(saved: unknown, deployment: string): { offset: number; done: boolean } {
  const p = saved as Partial<Progress> | null
  if (!p || p.deployment !== deployment) return { offset: 0, done: false }
  return { offset: typeof p.offset === "number" && p.offset >= 0 ? p.offset : 0, done: p.done === true }
}

async function ask(url: string, fetcher: typeof fetch): Promise<"held" | "drawn" | "failed"> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), EACH_MS)
  try {
    const r = await fetcher(url, { headers: { accept: "text/html", "user-agent": "StorelibCacheWarm/1.0" }, redirect: "manual", signal: ctl.signal, cache: "no-store" })
    /* The body is read so the page is drawn to the end and kept. */
    await r.arrayBuffer().catch(() => undefined)
    return (r.headers.get("x-vercel-cache") ?? "").toUpperCase() === "HIT" ? "held" : "drawn"
  } catch {
    return "failed"
  } finally {
    clearTimeout(timer)
  }
}

/** Runs a list a few at a time, stopping when the budget is spent. */
async function some<T>(items: T[], work: (item: T) => Promise<void>, until: number): Promise<number> {
  let next = 0
  let finished = 0
  const lane = async () => {
    while (next < items.length && Date.now() < until) {
      const item = items[next++]
      await work(item)
      finished++
    }
  }
  await Promise.all(Array.from({ length: AT_ONCE }, lane))
  return finished
}

export async function warmPublishedSites(options: { budgetMs: number; fetcher?: typeof fetch }): Promise<{
  deployment: string | null
  skipped?: "no-deployment" | "already-warmed"
  sites: number
  pages: { held: number; drawn: number; failed: number }
  done: boolean
}> {
  const deployment = deploymentOf()
  const pages = { held: 0, drawn: 0, failed: 0 }
  if (!deployment) return { deployment, skipped: "no-deployment", sites: 0, pages, done: false }
  const until = Date.now() + options.budgetMs
  const fetcher = options.fetcher ?? fetch
  const admin = createAdminClient()
  const { data } = await admin.from("platform_settings").select("value").eq("key", WARM_KEY).maybeSingle()
  let { offset, done } = startFrom((data as { value?: unknown } | null)?.value ?? null, deployment)
  if (done) return { deployment, skipped: "already-warmed", sites: 0, pages, done: true }

  let sites = 0
  while (Date.now() < until) {
    const { origins, read } = await publishedWebsiteOrigins(offset, PAGE)
    if (read === 0) {
      done = true
      break
    }
    const urls = origins.flatMap((o) => WARM_PATHS.map((p) => `${o}${p}`))
    const finished = await some(urls, async (u) => { pages[await ask(u, fetcher)]++ }, until)
    if (finished < urls.length) break /* Out of time mid-page: this page again next run. */
    sites += origins.length
    offset += read
    if (read < PAGE) {
      done = true
      break
    }
  }
  await admin.from("platform_settings").upsert({ key: WARM_KEY, value: { deployment, offset, done }, updated_at: new Date().toISOString(), updated_by: "cron/warm-sites" })
  return { deployment, sites, pages, done }
}
