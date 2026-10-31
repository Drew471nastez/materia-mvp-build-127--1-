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
 * So, once per deployment, each published website's front page, its
 * products page and the first few other pages its sitemap lists are asked
 * for through the public address (the same CDN entry a visitor gets), a few
 * sites at a time. A page already held costs the CDN a
 * cached answer and nothing else. Progress is kept in platform_settings, so a
 * run cut short by its budget carries on in the next, and the same deploy is
 * never warmed twice. Content is never changed here: freshness stays with
 * revalidate and the tags each publish clears.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { publishedWebsiteOrigins } from "@/lib/seo/sitemaps"
import { websiteAddresses } from "@/lib/seo/announce"

export const WARM_KEY = "website_cache_warmed"
/** The pages asked for on each site: what a visitor lands on and goes to first. */
export const WARM_PATHS = ["/", "/products"] as const
/**
 * Sites read per page. A page is finished inside one run or (when its sites
 * cannot be matched one to one to its rows) done again from its start next
 * run, so it is small enough to fit: 6 at a time, a few seconds each. It was
 * 200, which a cold deploy could never finish inside one run.
 */
const PAGE = 36
const AT_ONCE = 6
const EACH_MS = 15_000
/** No request is started with less than this left before the run's hard stop. */
const MIN_REQUEST_MS = 1_000
/**
 * How long past its budget a run may still be finishing the sites it started.
 * A site used to be started up to the budget's last moment and then take a
 * sitemap and six pages, each up to 15 s, one after another: well past the
 * function's 60 s. Now each request takes at most what is left before this.
 */
export const WARM_HARD_STOP_MS = 7_000

/** And this many more of a site's own pages, from its sitemap, so the menu's About or FAQ is drawn too. */
export const SITEMAP_PAGES = 4

type Progress = { deployment: string; offset: number; done: boolean }

/**
 * The pages warmed on one site: WARM_PATHS, then its first few other pages
 * from its own /sitemap.xml (a held answer, read through the public address
 * as any crawler does). Product pages are left to their visitors. A sitemap
 * that cannot be read leaves WARM_PATHS. Exported for the tests.
 */
export function pagesFromSitemap(origin: string, xml: string): string[] {
  const out: string[] = []
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    let u: URL
    try {
      u = new URL(m[1].trim())
    } catch {
      continue
    }
    if (u.origin !== origin) continue
    const path = u.pathname.replace(/\/$/, "") || "/"
    if ((WARM_PATHS as readonly string[]).includes(path) || /^\/products\//.test(path) || out.includes(`${origin}${path}`)) continue
    out.push(`${origin}${path}`)
    if (out.length >= SITEMAP_PAGES) break
  }
  return out
}

/** A request's own limit: EACH_MS, or less when the run has less left. */
function limitFor(hardStop: number): number {
  return Math.min(EACH_MS, hardStop - Date.now())
}

async function warmListOf(origin: string, fetcher: typeof fetch, hardStop = Number.POSITIVE_INFINITY): Promise<string[]> {
  const first = WARM_PATHS.map((p) => `${origin}${p}`)
  const ms = limitFor(hardStop)
  if (ms < MIN_REQUEST_MS) return first
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetcher(`${origin}/sitemap.xml`, { headers: { "user-agent": "StorelibCacheWarm/1.0" }, redirect: "manual", signal: ctl.signal, cache: "no-store" })
    return r.ok ? [...first, ...pagesFromSitemap(origin, await r.text())] : first
  } catch {
    return first
  } finally {
    clearTimeout(timer)
  }
}

export function deploymentOf(env: Record<string, string | undefined> = process.env): string | null {
  return env.VERCEL_DEPLOYMENT_ID || env.VERCEL_URL || null
}

/** Where to start for this deployment: from the top on a new one, where it stopped on the same one. */
export function startFrom(saved: unknown, deployment: string): { offset: number; done: boolean } {
  const p = saved as Partial<Progress> | null
  if (!p || p.deployment !== deployment) return { offset: 0, done: false }
  return { offset: typeof p.offset === "number" && p.offset >= 0 ? p.offset : 0, done: p.done === true }
}

async function ask(url: string, fetcher: typeof fetch, hardStop = Number.POSITIVE_INFINITY): Promise<"held" | "drawn" | "failed"> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), Math.max(MIN_REQUEST_MS, limitFor(hardStop)))
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

/**
 * Runs a list a few at a time, starting nothing once the budget is spent.
 * `work` answers false when it stopped before the end of its item. Answers
 * how many items from the START of the list are finished, so a run that
 * stopped partway carries on from there next time instead of from the top
 * of the list (items finish out of order across lanes).
 */
async function some<T>(items: T[], work: (item: T) => Promise<boolean | void>, until: number, lanes = AT_ONCE): Promise<number> {
  let next = 0
  const finished = new Array<boolean>(items.length).fill(false)
  const lane = async () => {
    while (next < items.length && Date.now() < until) {
      const i = next++
      finished[i] = (await work(items[i])) !== false
    }
  }
  await Promise.all(Array.from({ length: lanes }, lane))
  const firstUnfinished = finished.indexOf(false)
  return firstUnfinished === -1 ? items.length : firstUnfinished
}

/** `started`: when the request began (the cron passes it), so the budget counts from there. */
export async function warmPublishedSites(options: { budgetMs: number; fetcher?: typeof fetch; started?: number; hardStopMs?: number; origins?: typeof publishedWebsiteOrigins; admin?: Pick<ReturnType<typeof createAdminClient>, "from"> }): Promise<{
  deployment: string | null
  skipped?: "no-deployment" | "already-warmed"
  sites: number
  pages: { held: number; drawn: number; failed: number }
  done: boolean
}> {
  const deployment = deploymentOf()
  const pages = { held: 0, drawn: 0, failed: 0 }
  if (!deployment) return { deployment, skipped: "no-deployment", sites: 0, pages, done: false }
  const until = (options.started ?? Date.now()) + options.budgetMs
  const hardStop = until + (options.hardStopMs ?? WARM_HARD_STOP_MS)
  const fetcher = options.fetcher ?? fetch
  const readOrigins = options.origins ?? publishedWebsiteOrigins
  const admin = options.admin ?? createAdminClient()
  const { data } = await admin.from("platform_settings").select("value").eq("key", WARM_KEY).maybeSingle()
  let { offset, done } = startFrom((data as { value?: unknown } | null)?.value ?? null, deployment)
  if (done) return { deployment, skipped: "already-warmed", sites: 0, pages, done: true }

  let sites = 0
  while (Date.now() < until) {
    const { origins, read } = await readOrigins(offset, PAGE)
    if (read === 0) {
      done = true
      break
    }
    /* Each site's pages one after another, a few sites at a time; a site stops at the hard stop and is done again next run. */
    const finished = await some(origins, async (o) => {
      for (const u of await warmListOf(o, fetcher, hardStop)) {
        if (hardStop - Date.now() < MIN_REQUEST_MS) return false
        pages[await ask(u, fetcher, hardStop)]++
      }
      return true
    }, until)
    if (finished < origins.length) {
      /*
        Out of time partway: the next run starts at the first site not
        finished. It used to start this whole page of 200 again, so a page
        that could not be warmed inside one run never moved on.
      */
      if (origins.length === read) {
        sites += finished
        offset += finished
      }
      break
    }
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

/* ─────────────────── after a Publish: the pages a visitor opens next ─────────────────── */

/** At most this many addresses after a Publish: every page of the site first, then its first products. */
export const PUBLISH_WARM_PAGES = 24
const PUBLISH_WARM_PRODUCTS = 8
const PUBLISH_WARM_MS = 20_000
const PUBLISH_AT_ONCE = 3

/**
 * Which of a site's addresses (its sitemap, in its order) are drawn after a
 * Publish: the front page, the shop and every page of the site, then a few
 * products, never more than PUBLISH_WARM_PAGES. Exported for the tests.
 */
export function publishWarmList(addresses: string[]): string[] {
  const pages: string[] = []
  const products: string[] = []
  for (const a of addresses) {
    let path: string
    try {
      path = new URL(a).pathname
    } catch {
      continue
    }
    if (/\/products\/[^/]+\/?$/.test(path)) {
      if (products.length < PUBLISH_WARM_PRODUCTS) products.push(a)
    } else if (!pages.includes(a)) pages.push(a)
  }
  const shop = addresses[0] ? `${new URL(addresses[0]).origin}/products` : null
  if (shop && !pages.some((p) => new URL(p).pathname.replace(/\/$/, "") === "/products")) pages.splice(1, 0, shop)
  return [...pages, ...products].slice(0, PUBLISH_WARM_PAGES)
}

/**
 * ===========================================================================
 *  A PUBLISH IS FOLLOWED BY ITS OWN PAGES BEING DRAWN, NOT BY A VISITOR
 * ===========================================================================
 * Publish expires every held page of the site at once (revalidatePublishedSite,
 * `expire: 0`), so whoever opened a page next waited for it to be drawn: the
 * front page, the shop and each page the menu links to, 0.5 to 1.6 s each,
 * and the page a link fetched ahead too (an /about fetched ahead after a
 * Publish answered MISS in 1.1 s on asgardshop.storelib.com). Run from the
 * publish route's `after()`, once the release is recorded, so the pages drawn
 * here are drawn from it: each address on the site's own public host, as a
 * visitor's browser asks, a few at a time and within PUBLISH_WARM_MS. The
 * same request any visitor could make; it changes nothing and a failure is
 * only a page left for the next visitor to draw.
 */
export async function warmAfterPublish(creatorId: string, options: { fetcher?: typeof fetch; addresses?: (id: string) => Promise<string[]> } = {}): Promise<{ held: number; drawn: number; failed: number }> {
  const pages = { held: 0, drawn: 0, failed: 0 }
  try {
    const list = publishWarmList(await (options.addresses ?? websiteAddresses)(creatorId))
    const fetcher = options.fetcher ?? fetch
    await some(list, async (u) => { pages[await ask(u, fetcher)]++ }, Date.now() + PUBLISH_WARM_MS, PUBLISH_AT_ONCE)
  } catch (e) {
    console.warn("[publish] the pages were not drawn ahead:", e instanceof Error ? e.message : e)
  }
  return pages
}
