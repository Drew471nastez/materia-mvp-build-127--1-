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

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SiteFacts {
  creatorId: string | null
  /** A published install exists. */
  published: boolean
  /** The published install's theme was imported from Shopify. */
  compat: boolean
}

export interface SiteFactsRead {
  facts: SiteFacts
  /** The database did not answer: the callers keep what they knew. */
  failed: boolean
}

/* "No row" is an answer; any other error is the database not answering. */
const failedRead = (error: { code?: string } | null | undefined) => !!error && error.code !== "PGRST116"

/**
 * The name to its creator, its published install and that install's compat
 * kind, in at most three round trips (one when the creator is known).
 */
export async function readSiteFacts(db: Db, name: string, knownCreatorId: string | null = null): Promise<SiteFactsRead> {
  const lower = name.toLowerCase()
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
  const read = readSiteFacts(db, lower, hint && now - hint.at < KNOWN_MS ? hint.creatorId : null)
  if (shared.size > 5000) shared.clear()
  shared.set(lower, { at: now, read })
  return read
}

/** For tests: forget everything held. */
export function forgetSiteFacts() {
  shared.clear()
  known.clear()
}
