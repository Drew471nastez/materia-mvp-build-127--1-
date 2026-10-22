/**
 * ===========================================================================
 *  WHAT THE PROXY ASKS ABOUT A SITE'S NAME, READ ONCE
 * ===========================================================================
 * Before a published website is served, proxy.ts asks two questions about
 * the name in its address: is its published theme one imported from Shopify
 * (`compatSiteFor`), and, on a connected domain, has the creator published a
 * website at all (`hasPublishedWebsite`). Both walked the same chain on
 * their own: profile by username, creator by user, published install, and
 * the compat question the install's settings as a fourth read. On a
 * connected domain that was seven reads in a row for two answers that come
 * from the same rows, before the page (often already held at the edge) could
 * be sent.
 *
 * Here the chain is walked once for both, the settings ride along with the
 * install as an embed, and a connected domain that already knows its
 * creator (`rememberCreatorOf`) skips the name lookup altogether. Measured
 * with scripts/measure-speed18.mjs; the numbers are in lib/perf/optimizations.ts.
 *
 * Each caller keeps its own cache and its own time to keep an answer, as
 * before. This only shares the read between callers asking in the same
 * moment, so no answer is older than it was.
 */

type Db = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * What the proxy asks next about the same name, answered by the same read
 * when SQL part 257 (`site_route_facts`) has run: the website's languages and
 * markets, the store's own country and currency, and the website's primary
 * domain. Absent when the facts came from the rows one by one; the proxy then
 * reads these itself, as before.
 */
export interface SiteExtras {
  /** The store_localization row, or null: none saved, or part 136 not run. */
  localization: Record<string, unknown> | null
  /** Store details: its default country and selling currency, or null. */
  store: { default_country?: unknown; currency?: unknown } | null
  /** The primary active website domain and its certificate's state, or null. */
  websiteDomain: { domain?: string | null; ssl_status?: string | null } | null
}

export interface SiteFacts {
  creatorId: string | null
  /** A published install exists. */
  published: boolean
  /** The published install's theme was imported from Shopify. */
  compat: boolean
  extras?: SiteExtras
}

export interface SiteFactsRead {
  facts: SiteFacts
  /** The database did not answer: the callers keep what they knew. */
  failed: boolean
}

/* "No row" is an answer; any other error is the database not answering. */
const failedRead = (error: { code?: string } | null | undefined) => !!error && error.code !== "PGRST116"

/*
  ONE ROUND TRIP FOR ALL OF IT (SQL part 257, site_route_facts): the name to
  its creator, its published install, the compat kind, and the extras above.
  The rows one by one were three round trips in a row before the languages,
  and a fourth and fifth after them, on every page of a website a server had
  not seen in the last half minute. A database without the function (part
  257 not run, or the anon key, which may not call it) is asked the old way
  and not asked again for ten minutes; any other failure of the call is
  answered by the rows as well, so the function never makes a page fail.
*/
const FUNCTION_AWAY_MS = 10 * 60_000
let functionAwayUntil = 0
const functionMissing = (error: { code?: string; message?: string } | null | undefined) =>
  !!error && (error.code === "PGRST202" || error.code === "42883" || error.code === "42501" || /site_route_facts/.test(error.message ?? ""))

/** For tests: ask the function again. */
export function forgetRouteFactsFunction() {
  functionAwayUntil = 0
}

function factsOf(raw: Record<string, unknown>): SiteFacts {
  const creatorId = typeof raw.creator_id === "string" ? raw.creator_id : null
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
  return {
    creatorId,
    published: creatorId !== null && raw.published === true,
    compat: creatorId !== null && raw.compat === true,
    ...(creatorId ? { extras: { localization: obj(raw.localization), store: obj(raw.store), websiteDomain: obj(raw.website_domain) as SiteExtras["websiteDomain"] } } : {}),
  }
}

async function readByFunction(db: Db, lower: string, now: number): Promise<SiteFactsRead | null> {
  if (!db.rpc || now < functionAwayUntil) return null
  try {
    const r = await db.rpc("site_route_facts", { p_name: lower })
    if (!r?.error && r?.data && typeof r.data === "object") return { facts: factsOf(r.data as Record<string, unknown>), failed: false }
    if (functionMissing(r?.error)) functionAwayUntil = now + FUNCTION_AWAY_MS
  } catch {
    /* the rows answer */
  }
  return null
}

/**
 * The name to its creator, its published install and that install's compat
 * kind: one round trip with SQL part 257, else at most three (one when the
 * creator is known).
 */
export async function readSiteFacts(db: Db, name: string, knownCreatorId: string | null = null, now = Date.now()): Promise<SiteFactsRead> {
  const lower = name.toLowerCase()
  const byFunction = await readByFunction(db, lower, now)
  if (byFunction) return byFunction
  const none: SiteFacts = { creatorId: null, published: false, compat: false }
  let failed = false
  const read = <T,>(r: { data: T | null; error: { code?: string } | null }) => {
    if (failedRead(r.error)) failed = true
    return r.data
  }
  try {
    let creatorId = knownCreatorId
    if (!creatorId) {
      const profile = read(await db.from("profiles").select("id").eq("username", lower).maybeSingle())
      if (profile) {
        const creator = read(await db.from("creators").select("id").eq("user_id", (profile as { id: string }).id).maybeSingle())
        creatorId = (creator as { id: string } | null)?.id ?? null
      }
      if (!creatorId && !failed) {
        const creator = read(await db.from("creators").select("id").eq("slug", lower).maybeSingle())
        creatorId = (creator as { id: string } | null)?.id ?? null
      }
    }
    if (!creatorId || failed) return { facts: { ...none, creatorId }, failed }

    const install = read(
      await db
        .from("store_theme_installs")
        .select("id, store_theme_settings ( kind:settings->compat->>kind )")
        .eq("creator_id", creatorId)
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ) as { id: string; store_theme_settings?: { kind?: string | null } | { kind?: string | null }[] | null } | null
    if (failed) return { facts: { ...none, creatorId }, failed }
    if (!install) return { facts: { ...none, creatorId }, failed }
    const settings = Array.isArray(install.store_theme_settings) ? install.store_theme_settings[0] : install.store_theme_settings
    return { facts: { creatorId, published: true, compat: settings?.kind === "shopify" }, failed }
  } catch {
    return { facts: none, failed: true }
  }
}

/**
 * ONE READ FOR CALLERS ASKING TOGETHER. The proxy asks its questions at
 * once now (proxy.ts, where a site is routed), and each of them lands
 * here: the first starts the read, the rest share it. A finished read is
 * kept for a few seconds only, the life of one visit's requests, so the
 * callers' own caches decide how old an answer may be, as they did.
 */
const SHARED_MS = 3_000
const shared = new Map<string, { at: number; read: Promise<SiteFactsRead> }>()

/**
 * A connected domain knows its creator before it knows the username
 * (custom_domains.creator_id). Remembered as long as the proxy remembers
 * the domain, so the facts for that name skip the name lookup.
 */
const KNOWN_MS = 60_000
const known = new Map<string, { at: number; creatorId: string }>()

export function rememberCreatorOf(name: string, creatorId: string, now = Date.now()) {
  if (known.size > 5000) known.clear()
  known.set(name.toLowerCase(), { at: now, creatorId })
}

export function siteFactsFor(db: Db, name: string, now = Date.now()): Promise<SiteFactsRead> {
  const lower = name.toLowerCase()
  const held = shared.get(lower)
  if (held && now - held.at < SHARED_MS) return held.read
  const hint = known.get(lower)
  const read = readSiteFacts(db, lower, hint && now - hint.at < KNOWN_MS ? hint.creatorId : null, now)
  if (shared.size > 5000) shared.clear()
  shared.set(lower, { at: now, read })
  return read
}

/** The shared read for one name, forgotten: the next question about it reads again (proxy.ts, a renderer saying the answer is old). */
export function forgetSharedSiteFacts(name: string) {
  shared.delete(name.toLowerCase())
}

/** For tests: forget everything held. */
export function forgetSiteFacts() {
  shared.clear()
  known.clear()
  functionAwayUntil = 0
}
