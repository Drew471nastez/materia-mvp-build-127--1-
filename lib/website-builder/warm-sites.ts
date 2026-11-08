import "server-only"

/**
 * ===========================================================================
 *  THE SITES VISITORS USE ARE DRAWN BEFORE THEIR FIRST VISITOR, AFTER A DEPLOY
 * ===========================================================================
 * A published page is kept by Vercel for every visitor after it is drawn once
 * (revalidate 60, served stale while it is drawn again). But a new deployment
 * starts with an empty cache, and Storelib deploys many times a day, so the
 * first visitor to each page after each deploy waited for it to be drawn:
 * 0.5 to 1.6 s to the first byte, measured right after a deploy on five sites,
 * against about 0.2 s once held.
 *
 * So, once per deployment, pages are asked for through the public address
 * (the same CDN entry a visitor gets), a few sites at a time. A page already
 * held costs the CDN a cached answer and nothing else. Progress is kept in
 * platform_settings, so a run cut short by its budget carries on in the
 * next, and the same deploy is never warmed twice. Content is never changed
 * here: freshness stays with revalidate and the tags each publish clears.
 *
 * ROUND 55: ONLY THE SITES SOMEBODY VISITED. Every published site's front
 * page, products page, sitemap and four sitemap pages used to be drawn, and
 * each draw reads the database: production showed about 5,000 database
 * requests a minute right after a deploy, almost all for sites nobody opened
 * that week. Now only websites with a page view in the last VISITED_DAYS
 * (analytics_property_daily, the daily rollup of part 61) are warmed, busiest
 * first, and only their front page, plus /products where their visitors
 * opened it (part 371 `warm_visited_websites` says so in one read; without
 * it the rollup is read directly and the front page alone is drawn). When
 * the rollup cannot say who visited (no table, a failed read, no day rolled
 * up in ROLLUP_FRESH_DAYS) every published site's front page is drawn, as
 * before but without the other pages. Measured with a counting stub in
 * tests/realtime-warm-r55.test.ts.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { publishedWebsiteOrigins, publishedWebsiteOriginsOf } from "@/lib/seo/sitemaps"
import { websiteAddresses } from "@/lib/seo/announce"
import { backfillSiteCopies } from "@/lib/edge/snapshot-capture"
import { COUNTRY_COOKIE, countryCookieValue, knownCountry } from "@/lib/markets/visitor-country"

export const WARM_KEY = "website_cache_warmed"
/** The pages a site can have asked for: its front page always, its products page when its visitors open it (round 55). */
export const WARM_PATHS = ["/", "/products"] as const
/** A site is warmed when it had a page view in this many days. */
export const VISITED_DAYS = 7
/** The rollup is trusted to say who visited only when it rolled up a day this recent. */
export const ROLLUP_FRESH_DAYS = 3
/** Rows of the rollup read when part 371 is not there (a site has one a day), a thousand a read. */
const VISITED_ROWS_MAX = 20_000
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
/** A site's copies are taken in a run only with at least this long left before its budget. */
const BACKFILL_MIN_MS = 10_000

type Source = "visited" | "all"
type Progress = { deployment: string; offset: number; done: boolean; source?: Source }

/** A site to warm, and whether its visitors open its products page. */
export type WarmSite = { origin: string; products: boolean }
type Admin = Pick<ReturnType<typeof createAdminClient>, "from">

/** A request's own limit: EACH_MS, or less when the run has less left. */
function limitFor(hardStop: number): number {
  return Math.min(EACH_MS, hardStop - Date.now())
}

/** The pages drawn on one site: its front page, and its products page when its visitors open it. Exported for the tests. */
export function warmListOf(site: WarmSite): string[] {
  return site.products ? WARM_PATHS.map((p) => `${site.origin}${p}`) : [`${site.origin}/`]
}

/** A UTC day, YYYY-MM-DD, `days` before `now`. */
function dayBefore(now: number, days: number): string {
  return new Date(now - days * 86_400_000).toISOString().slice(0, 10)
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }>

/**
 * The websites with a page view in the last VISITED_DAYS, busiest first:
 * creator id, and whether the visitors opened /products. From the daily
 * rollup (part 61): part 371's `warm_visited_websites` adds it up in one
 * read; without it the rows are read and added up here, and /products is not
 * known. Null when the rollup cannot say: no table, a failed read, or no day
 * rolled up in the last ROLLUP_FRESH_DAYS (the rollup cron not running would
 * otherwise read as "nobody visited"). Exported for the tests.
 */
export async function visitedWebsites(admin: Admin, now = Date.now()): Promise<{ creatorId: string; products: boolean }[] | null> {
  try {
    const latest = await admin.from("analytics_rollup_days").select("day").order("day", { ascending: false }).limit(1).maybeSingle()
    const day = (latest.data as { day?: string } | null)?.day
    if (latest.error || typeof day !== "string" || day < dayBefore(now, ROLLUP_FRESH_DAYS)) return null
    const since = dayBefore(now, VISITED_DAYS)
    const rpc = (admin as { rpc?: Rpc }).rpc
    if (typeof rpc === "function") {
      const summed = await rpc.call(admin, "warm_visited_websites", { p_since: since })
      if (!summed.error && Array.isArray(summed.data)) {
        return (summed.data as { creator_id?: string; shop_views?: number | string | null }[])
          .filter((r) => typeof r.creator_id === "string")
          .map((r) => ({ creatorId: r.creator_id as string, products: Number(r.shop_views ?? 0) > 0 }))
      }
    }
    /* Part 371 not run: the rows themselves, a thousand at a time, added up per creator. */
    const views = new Map<string, number>()
    for (let from = 0; from < VISITED_ROWS_MAX; from += 1000) {
      const { data, error } = await admin
        .from("analytics_property_daily")
        .select("creator_id, page_views")
        .eq("property_type", "website")
        .gte("day", since)
        .gt("page_views", 0)
        .order("creator_id", { ascending: true })
        .order("day", { ascending: true })
        .range(from, from + 999)
      if (error) return null
      const rows = (data ?? []) as { creator_id: string; page_views: number }[]
      for (const r of rows) views.set(r.creator_id, (views.get(r.creator_id) ?? 0) + Number(r.page_views || 0))
      if (rows.length < 1000) break
    }
    return [...views].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).map(([creatorId]) => ({ creatorId, products: false }))
  } catch {
    return null
  }
}

type SiteSource = (offset: number, count: number) => Promise<{ sites: WarmSite[]; read: number }>

export function deploymentOf(env: Record<string, string | undefined> = process.env): string | null {
  return env.VERCEL_DEPLOYMENT_ID || env.VERCEL_URL || null
}

/** Where to start for this deployment: from the top on a new one, where it stopped on the same one. */
export function startFrom(saved: unknown, deployment: string, source?: Source): { offset: number; done: boolean } {
  const p = saved as Partial<Progress> | null
  if (!p || p.deployment !== deployment) return { offset: 0, done: false }
  /* The list changed kind between two runs (the rollup came back or went): its offsets mean something else, so from the top. */
  if (source && !p.done && p.source !== source) return { offset: 0, done: false }
  return { offset: typeof p.offset === "number" && p.offset >= 0 ? p.offset : 0, done: p.done === true }
}

/*
  ASKED AS A BROWSER OPENS A PAGE (round AM). A page opened as a page
  (Sec-Fetch-Dest: document) is drawn ready for its first paint and held
  apart from the same address fetched by a script (an imported theme's
  page: lib/storelib-theme/compat/stranger-hold.ts strangerKey, and the CDN's
  Vary). The warm asked without it, so after every Publish it drew the
  script's copy, and the first visitor still waited for the one browsers get.
*/
export const WARM_HEADERS: Record<string, string> = {
  accept: "text/html,application/xhtml+xml",
  "user-agent": "StorelibCacheWarm/1.0",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
}

/**
 * The headers a page is asked with, as a visitor from `country` would ask:
 * the country the visitor chose (sl_country), which the proxy reads before
 * where the connection is, so the page drawn is the one held for that
 * country (an imported theme's country selector, a market's prices). No
 * country: as the warm's own connection is seen. Nothing else of anybody's.
 */
export function warmHeaders(country: string | null = null): Record<string, string> {
  const value = countryCookieValue(country)
  return value && value !== countryCookieValue("home") ? { ...WARM_HEADERS, cookie: `${COUNTRY_COOKIE}=${value}` } : { ...WARM_HEADERS }
}

async function ask(url: string, fetcher: typeof fetch, hardStop = Number.POSITIVE_INFINITY, country: string | null = null): Promise<"held" | "drawn" | "failed"> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), Math.max(MIN_REQUEST_MS, limitFor(hardStop)))
  try {
    const headers = warmHeaders(country)
    let r = await fetcher(url, { headers, redirect: "manual", signal: ctl.signal, cache: "no-store" })
    /*
      One step of a redirect on the same site, as the browser takes it: a
      market's visitors are sent to the page in its language (/fr/...), and
      that page is the one they wait for. Never another host.
    */
    const to = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null
    if (to) {
      await r.arrayBuffer().catch(() => undefined)
      const next = new URL(to, url)
      if (next.origin !== new URL(url).origin) return "drawn"
      r = await fetcher(next.toString(), { headers, redirect: "manual", signal: ctl.signal, cache: "no-store" })
    }
    /* The body is read so the page is drawn to the end and kept. */
    await r.arrayBuffer().catch(() => undefined)
    /* Held by the CDN, or by the hold of an imported theme's pages (X-Storelib-Held). */
    return (r.headers.get("x-vercel-cache") ?? "").toUpperCase() === "HIT" || r.headers.get("x-storelib-held") === "hit" ? "held" : "drawn"
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

/**
 * `started`: when the request began (the cron passes it), so the budget counts from there.
 * `origins` (tests): the published sites to walk instead of the visited ones, front page only.
 */
export async function warmPublishedSites(options: { budgetMs: number; fetcher?: typeof fetch; started?: number; hardStopMs?: number; origins?: typeof publishedWebsiteOrigins; admin?: Admin; now?: number }): Promise<{
  deployment: string | null
  skipped?: "no-deployment" | "already-warmed"
  source?: Source
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
  const admin = options.admin ?? createAdminClient()
  const { data } = await admin.from("platform_settings").select("value").eq("key", WARM_KEY).maybeSingle()
  const saved = (data as { value?: unknown } | null)?.value ?? null
  if (startFrom(saved, deployment).done) return { deployment, skipped: "already-warmed", sites: 0, pages, done: true }

  /* Who to warm: the sites visited lately, or (the rollup cannot say) every published one, front page only. */
  const visited = options.origins ? null : await visitedWebsites(admin, options.now)
  const source: Source = visited ? "visited" : "all"
  const db = admin as ReturnType<typeof createAdminClient>
  const readSites: SiteSource = visited
    ? async (offset, count) => {
        const slice = visited.slice(offset, offset + count)
        const originOf = await publishedWebsiteOriginsOf(slice.map((v) => v.creatorId), db)
        const sites: WarmSite[] = []
        for (const v of slice) {
          const origin = originOf.get(v.creatorId)
          if (origin && !sites.some((x) => x.origin === origin)) sites.push({ origin, products: v.products })
        }
        return { sites, read: slice.length }
      }
    : async (offset, count) => {
        const { origins, read } = await (options.origins ?? ((o: number, c: number) => publishedWebsiteOrigins(o, c, db)))(offset, count)
        return { sites: origins.map((origin) => ({ origin, products: false })), read }
      }
  let { offset, done } = startFrom(saved, deployment, source)

  let sites = 0
  while (Date.now() < until) {
    const { sites: batch, read } = await readSites(offset, PAGE)
    if (read === 0) {
      done = true
      break
    }
    /* Each site's pages one after another, a few sites at a time; a site stops at the hard stop and is done again next run. */
    const finished = await some(batch, async (site) => {
      const o = site.origin
      const list = warmListOf(site)
      for (const u of list) {
        if (hardStop - Date.now() < MIN_REQUEST_MS) return false
        const answer = await ask(u, fetcher, hardStop)
        pages[answer]++
        /* Cut off by the hard stop: not warmed, so done again next run (a site is one or two pages now, so this is often its last). */
        if (answer === "failed" && hardStop - Date.now() < MIN_REQUEST_MS) return false
      }
      /* A site with no stored copies gets them now (lib/edge/snapshot-capture.ts backfillSiteCopies), inside the same run's time. */
      if (!options.fetcher && until - Date.now() > BACKFILL_MIN_MS) await backfillSiteCopies(o, list, until).catch(() => false)
      return true
    }, until)
    if (finished < batch.length) {
      /*
        Out of time partway: the next run starts at the first site not
        finished. It used to start this whole page of 200 again, so a page
        that could not be warmed inside one run never moved on.
      */
      if (batch.length === read) {
        sites += finished
        offset += finished
      }
      break
    }
    sites += batch.length
    offset += read
    if (read < PAGE) {
      done = true
      break
    }
  }
  await admin.from("platform_settings").upsert({ key: WARM_KEY, value: { deployment, offset, done, source }, updated_at: new Date().toISOString(), updated_by: "cron/warm-sites" })
  return { deployment, source, sites, pages, done }
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
 * publish route's `after()` straight after the caches are cleared (round AM:
 * it waited for the release to be recorded first, a few seconds of reading
 * and writing every theme file, while the visitors arriving drew the pages
 * themselves): each address on the site's own public host, as a visitor's
 * browser opens it (WARM_HEADERS), a few at a time and within
 * PUBLISH_WARM_MS. The same request any visitor could make; it changes
 * nothing and a failure is only a page left for the next visitor to draw.
 *
 * `countries`: the countries each page is drawn for, in order. An imported
 * theme's page is held per visitor country (its country selector), so the
 * page drawn from the warm's own connection was not the one the person who
 * pressed Publish got when they opened their site a moment later. The
 * publish route names the publisher's country first, then the warm's own.
 */
export async function warmAfterPublish(creatorId: string, options: { fetcher?: typeof fetch; addresses?: (id: string) => Promise<string[]>; countries?: (string | null)[] } = {}): Promise<{ held: number; drawn: number; failed: number }> {
  const pages = { held: 0, drawn: 0, failed: 0 }
  try {
    const list = publishWarmList(await (options.addresses ?? websiteAddresses)(creatorId))
    const fetcher = options.fetcher ?? fetch
    const countries = publishWarmCountries(options.countries)
    /* Each page for each country before the next page: the front page first, for whoever opens it first. */
    const asks = list.flatMap((u) => countries.map((c) => ({ u, c })))
    await some(asks, async ({ u, c }) => { pages[await ask(u, fetcher, Number.POSITIVE_INFINITY, c)]++ }, Date.now() + PUBLISH_WARM_MS, PUBLISH_AT_ONCE)
  } catch (e) {
    console.warn("[publish] the pages were not drawn ahead:", e instanceof Error ? e.message : e)
  }
  return pages
}

/** At most this many countries per page after a Publish. */
export const PUBLISH_WARM_COUNTRIES = 2

/** The countries a Publish draws its pages for: each real one once, in order, then the warm's own connection's (null), never more than PUBLISH_WARM_COUNTRIES. Exported for the tests. */
export function publishWarmCountries(asked: (string | null | undefined)[] = []): (string | null)[] {
  const out: (string | null)[] = []
  for (const c of asked) {
    const code = knownCountry(c)
    if (code && !out.includes(code)) out.push(code)
  }
  return [...out.slice(0, PUBLISH_WARM_COUNTRIES - 1), null]
}
