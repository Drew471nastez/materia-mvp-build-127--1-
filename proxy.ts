import { MCP_HOST_LABEL, mcpHostRoute } from "@/lib/agent-access/mcp-host"
import { pageAskedAsSubresource } from "@/lib/security/subresource-guard"
import { heldListPath } from "@/lib/website-builder/held-list"
import { createServerClient } from "@supabase/ssr"
import { readSessionPresence, readVerifiedSession, shouldSendToLogin } from "@/lib/auth/current-user"
import { deadlineFetch } from "@/lib/net/deadline"
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/net/request-id"
import { logLine } from "@/lib/net/log"
import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { previewTokenFrom } from "@/lib/website-builder/preview-token"
import { isApexHost } from "@/lib/custom-domains/hostname"
import { domainAddress, sendsToDomain } from "@/lib/custom-domains/subdomain-redirect"
import { communityDomainStep, communityIdOf, communityServable } from "@/lib/custom-domains/community"
import { quietAuthRefusals } from "@/lib/auth/quiet-refusals"
import { onePageRoute } from "@/lib/onepage/host-route"
import { COMMUNITY_PATH_HEADER } from "@/lib/communities/slug-move"
import { PROFILE_PATH_HEADER, isProfilePath } from "@/lib/profile/profile-redirect"
import { oldAddressRedirect, resolveOnePageAddress, type OldAddressRedirect } from "@/lib/onepage/resolve-address"
import { supabaseOnePageLookup } from "@/lib/onepage/address-lookup"
import { createSiteGate } from "@/lib/site-password/proxy-gate"
import { passCookieName } from "@/lib/site-password/pass"
import { learnAddressFor } from "@/lib/communities/learn"
import { SITE_SEAL_HEADER, sealSite, siteHostOf } from "@/lib/storelib-theme/compat/site-seal"
import { heldLookup } from "@/lib/website-builder/held-lookup"
import { PUBLIC_PAGE_CACHE, markedThemeAddress, strangerMarker, strangerPage } from "@/lib/storelib-theme/compat/anonymous-cache"
import { forgetSharedSiteFacts, rememberCreatorOf, siteFactsFor } from "@/lib/website-builder/route-facts"
import { SITE_FRESH_PARAM } from "@/lib/website-builder/live-release-script"
import { SITE_COUNTRY_HEADER, SITE_LOCALE_HEADER, SITE_MARKET_HEADER, siteRouteInLanguage } from "@/lib/markets/site-name"
import { countryOfCurrency, resolveMarketCountries } from "@/lib/markets/market-countries"
import { COUNTRY_COOKIE, FORGET_COUNTRY_COOKIE, readCountryCookie, seenCountry, visitorCountryFrom } from "@/lib/markets/visitor-country"
import { visitorLanguageDecision } from "@/lib/markets/visitor-language"
import { siteCheckoutRouteFor } from "@/lib/checkout/site-checkout"
import { COVER_STILL_POLICY } from "@/lib/website-builder/cover-still"
import { carriesSignIn, skipsSessionRefresh } from "@/lib/auth/no-session-paths"
import { CSP_REPORT_PATH, keepsCspReport } from "@/lib/security/csp"
import { refusesSiteAction, SITE_ACTION_GUARD } from "@/lib/website-builder/site-action-guard"
import { isSiteIconPath, SITE_ICON_PATH } from "@/lib/website-builder/site-favicon"
import { PRIVATE_ROBOTS_HEADER, privatePlatformPath } from "@/lib/seo/indexing"
import { trailingSlashHop, wwwHop } from "@/lib/seo/one-hop"
import { unknownExploreCategory } from "@/lib/explore/category-pages"

/*
  THE PROXY'S OWN READS END IN 5s AT MOST (a custom domain's site, the site
  password gate, a OnePage address). They run in front of every request to a
  website, and none had a deadline: one lookup Supabase accepted and never
  answered held the request, and the function, until Vercel stopped it.
  lib/net/deadline.ts asks a read again after a blip, within the same 5s.
*/
const PROXY_READ_MS = 5_000
const proxyFetch: typeof fetch = (input, init) => {
  const own = AbortSignal.timeout(PROXY_READ_MS)
  const any = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  const signal = init?.signal && any ? any([init.signal, own]) : init?.signal ?? own
  return deadlineFetch(input, { ...init, signal })
}
const PROXY_DB = { global: { fetch: proxyFetch } }

/*
  A refused refresh ("Invalid Refresh Token: Already Used") is a person who
  is no longer signed in, which readCurrentUser below already treats as one.
  supabase-js also writes it with console.error from inside createServerClient,
  twice, and that is what the error table counted. One plain line instead.
*/
quietAuthRefusals()

// Main domain - customize this based on environment
const MAIN_DOMAIN = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

/**
 * Where AI-built sites are published: <slug>.storelib.com.
 *
 * Creator pages are PATHS (storelib.com/andrewrullz) and AI-built sites are
 * SUBDOMAINS (andrewrullz.storelib.com). One address space each, so neither
 * can claim the other's.
 *
 * A subdomain is not a security boundary on its own — cookies scoped to
 * `.storelib.com` reach every host under it. What makes this safe is that the
 * session cookie is HOST-ONLY (see lib/supabase/server.ts and the cookie
 * writer at the bottom of this file). Published pages carry model-written
 * JavaScript and the Supabase cookie is readable from JavaScript by design,
 * so a domain-scoped session would be readable by every site we host.
 */
const SITES_DOMAIN = process.env.NEXT_PUBLIC_SITES_HOST || MAIN_DOMAIN

// Domains that should NOT be treated as seller subdomains. "domains" is the
// name creators point their own domains at (domains.storelib.com), so a
// visit to it directly lands on storelib.com, never on someone's site.
const EXCLUDED_SUBDOMAINS = ["www", "app", "api", "admin", "dashboard", "localhost", "domains", "help", MCP_HOST_LABEL]

/**
 * Platform flows that belong to the apex, wherever they are asked for. These
 * need the session, and the session is host-only on storelib.com, so a
 * checkout begun on a creator's own address is sent home to finish.
 */
const PLATFORM_APEX_PATHS = ["/checkout", "/purchase", "/receipt", "/access"]

// Reserved paths that should not be rewritten on subdomains
const RESERVED_PATHS = [
  "/api",
  "/app",
  "/dashboard",
  "/login",
  "/signup",
  "/logout",
  "/onboarding",
  "/sell",
  "/checkout",
  "/feed",
  "/explore",
  "/creators",
  "/wishlist",
  "/marketplace",
  "/library",
  /* Storelib Communities stay platform pages on every host: a community is
     not a page of the creator's site, and its member area needs the
     platform's sign in. */
  "/community",
  "/native-start",
  "/receipt",
  /* A Storelib Reviews request link (app/review/[token]): the same page on every host, the website's own included. */
  "/review",
  /* A buyer's case about an order (lib/support/cases.ts): a platform page, linked from the platform's emails. */
  "/order-help",
  /* The page a website cover's screenshot is taken of. A platform surface,
     never a creator's site: on a subdomain or custom domain it must not be
     read as a page of that site. */
  "/cover-render",
  "/_next",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  /* The browser notifications worker (Settings, Privacy): Storelib's file on every host. */
  "/storelib-push-sw.js",
]

/**
 * Extract username from subdomain
 * Examples:
 * - username.storelib.com -> username
 * - www.storelib.com -> null (excluded)
 * - storelib.com -> null (main domain)
 * - localhost:3000 -> null (development)
 */
function extractUsernameFromHost(host: string): string | null {
  // Remove port if present
  const hostWithoutPort = host.split(":")[0]

  // Handle localhost for development
  if (hostWithoutPort === "localhost" || hostWithoutPort === "127.0.0.1") {
    return null
  }

  // Check if it's a subdomain of the main domain
  if (!hostWithoutPort.endsWith(`.${MAIN_DOMAIN}`) && hostWithoutPort !== MAIN_DOMAIN) {
    // Not a storelib.com domain - could be a custom domain (handled separately)
    return null
  }

  // Extract subdomain
  if (hostWithoutPort === MAIN_DOMAIN) {
    return null // Main domain, no subdomain
  }

  // Get the subdomain part (everything before .storelib.com)
  const subdomain = hostWithoutPort.replace(`.${MAIN_DOMAIN}`, "")

  // Check if it's an excluded subdomain
  if (EXCLUDED_SUBDOMAINS.includes(subdomain.toLowerCase())) {
    return null
  }

  // Only accept single-level subdomains as usernames
  if (subdomain.includes(".")) {
    return null
  }

  return subdomain.toLowerCase()
}

/**
 * Check if path should be excluded from subdomain rewriting
 */
function isReservedPath(pathname: string): boolean {
  return RESERVED_PATHS.some(
    (reserved) => pathname === reserved || pathname.startsWith(`${reserved}/`)
  )
}

/**
 * Check if a username is an old/changed username and resolve to the current one.
 * Returns the new username if found, null if not an old username.
 */
async function resolveOldUsername(oldUsername: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return null

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, PROXY_DB)

    // Check if this username exists as a current profile
    const { data: currentProfile } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", oldUsername)
      .limit(1)
      .maybeSingle()

    // If a current profile exists with this username, it's not an old one
    if (currentProfile) return null

    // Check username_history for the most recent redirect
    const { data: historyRecord } = await supabase
      .from("username_history")
      .select("new_username")
      .ilike("old_username", oldUsername)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    return historyRecord?.new_username || null
  } catch {
    return null
  }
}

/**
 * Is there a live AI-built site under this name? The same question the /site
 * handler asks before serving one, asked once here so the proxy can send a
 * page request to the right renderer. Any failure reads as "no", which sends
 * the request to /w, which in turn sends an unknown name to a 404.
 */
/**
 * A yes or no about a site, asked of the database on every visit, kept for
 * half a minute, and kept past that whenever the database does not answer:
 * a failed check read as "no" and sent an AI site to "Coming soon" or a
 * connected domain to the creator's profile.
 */
const answersHeld = new Map<string, { at: number; value: boolean }>()
/* An answer being asked is shared, so the questions a visit asks at once (startSiteQuestions) cost one read each. */
const answersAsked = new Map<string, Promise<SiteAnswer>>()
/*
  YES, NO, OR NOT KNOWN (SITE-8). A read that failed with nothing held (a
  cold server while the database is away) was "no", and on a subdomain "no"
  is itself a routing decision: an AI site or an imported theme was sent to
  the Storelib theme renderer, which drew the wrong page. The subdomain
  branch now asks the three way answer and says "One moment" (503, Retry-
  After) for "unavailable"; every other caller still reads it as "no".
*/
type SiteAnswer = boolean | "unavailable"
async function remembered(key: string, ask: () => Promise<{ value: boolean; failed: boolean }>): Promise<boolean> {
  return (await rememberedAnswer(key, ask)) === true
}
async function rememberedAnswer(key: string, ask: () => Promise<{ value: boolean; failed: boolean }>): Promise<SiteAnswer> {
  const held = answersHeld.get(key)
  if (held && Date.now() - held.at < 30_000) return held.value
  const asking = answersAsked.get(key)
  if (asking) return asking
  const answer = (async (): Promise<SiteAnswer> => {
    const fresh = await ask().catch(() => ({ value: false, failed: true }))
    if (fresh.failed) return held ? held.value : "unavailable"
    if (answersHeld.size > 10_000) answersHeld.clear()
    answersHeld.set(key, { at: Date.now(), value: fresh.value })
    return fresh.value
  })().finally(() => answersAsked.delete(key))
  answersAsked.set(key, answer)
  return answer
}

async function hasLiveAiSite(slug: string): Promise<boolean> {
  return (await liveAiSiteAnswer(slug)) === true
}

async function liveAiSiteAnswer(slug: string): Promise<SiteAnswer> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return false
  return rememberedAnswer(`ai:${slug.toLowerCase()}`, async () => {
    const supabase = createClient(supabaseUrl, supabaseKey, PROXY_DB)
    const { data, error } = await supabase
      .from("site_deployments")
      .select("storage_prefix")
      .eq("is_live", true)
      .eq("slug", slug.toLowerCase())
      .maybeSingle()
    return { value: !!(data as { storage_prefix: string | null } | null)?.storage_prefix, failed: !!error }
  })
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A WEBSITE THAT ASKS FOR A PASSWORD
 * ═══════════════════════════════════════════════════════════════════════════
 * Asked of every page of a built website, on its subdomain and on a
 * connected domain alike (lib/site-password/gate.ts says why here and not in
 * the page). While no website asks for a password it costs one small read
 * every fifteen seconds and nothing per request. Service key only: the rows
 * are server only.
 */
let gateClient: ReturnType<typeof createClient> | null = null
const siteGate = createSiteGate({
  db: () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    gateClient ??= createClient(url, key, { ...PROXY_DB, auth: { persistSession: false, autoRefreshToken: false } })
    return gateClient
  },
})

/**
 * The password page in place of the page asked for, when this request has
 * no pass. The page asked for rides along as `return`, so typing the
 * password lands there. Never cached: it is the same address as the page.
 */
async function passwordPageFor(request: NextRequest, name: string, host: string, pathname: string, search: string): Promise<{ blocked: NextResponse | null; protected: boolean }> {
  const answer = await siteGate({ name, host: host.toLowerCase(), pathname, cookie: request.cookies.get(passCookieName(host.toLowerCase()))?.value })
  if (!answer.blocked) return { blocked: null, protected: answer.protected }
  const to = request.nextUrl.clone()
  to.pathname = `/w/${name}/password`
  to.search = ""
  to.searchParams.set("return", `${pathname}${search}`)
  const r = NextResponse.rewrite(to)
  r.headers.set("Cache-Control", "private, no-store")
  r.headers.set("X-Robots-Tag", "noindex")
  return { blocked: r, protected: true }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE QUESTIONS A SITE'S PAGE ASKS, ASKED AT ONCE
 * ═══════════════════════════════════════════════════════════════════════════
 * A page of a published website asks, one after another below: is its
 * theme an imported one (compatSiteFor), is it a live AI site
 * (hasLiveAiSite), on a connected domain has a website been published
 * (hasPublishedWebsite), and does it ask for a password (passwordPageFor).
 * None needs another's answer, and each was a round trip or a chain of
 * them in series while the visitor waited, even for a page the edge
 * already held: up to twelve on a connected domain the first time in a
 * minute, which for most creators' sites is every visit.
 *
 * So they are started here, together, and the lines below await the same
 * answers in the same order (each question shares a read already in
 * flight). The rules and what each one decides are unchanged. Pages only,
 * the same paths those lines ask for; the password answer is handed back
 * so it is awaited, not asked twice.
 */
function startSiteQuestions(
  request: NextRequest,
  name: string,
  host: string,
  pathname: string,
  search: string,
  connectedDomain: boolean,
): Promise<{ blocked: NextResponse | null; protected: boolean }> | null {
  if (/\.[a-z0-9]{1,8}$/i.test(pathname) || policyAddress(pathname)) return null
  if (PLATFORM_APEX_PATHS.some((r) => pathname === r || pathname.startsWith(`${r}/`))) return null
  if (compatAnswers(pathname, request)) {
    void compatSiteFor(name, asksFresh(request)).catch(() => false)
    /* An imported theme's page asks for the website's languages and markets next (compatRewrite): asked now, beside the rest. */
    void siteLocalizationFor(name).catch(() => null)
  }
  void hasLiveAiSite(name).catch(() => false)
  if (connectedDomain) void hasPublishedWebsite(name).catch(() => false)
  return passwordPageFor(request, name, host, pathname, search)
}

/**
 * ── An old OnePage address, sent to where the page is now ──────────────────
 * {name}.storelib.com/links, storelib.com/{name}/links, /{name}.links and
 * /l/{name} all answer with a 308 to storelib.me/{name}. For most creators
 * that is their OnePage. For a renamed account or page it is a 404, and for
 * a creator who never had a OnePage it is a 404 too, which is what
 * dj-danut.storelib.com/links answered. So the name is looked up first, the
 * same way the page looks it up (lib/onepage/resolve-address), and the
 * redirect goes straight to the final address: one hop, query kept.
 *
 * Only the redirect's target can change. A page that answers, a name nobody
 * has, a database without keys, a failed read or a slow one (over
 * ONEPAGE_LOOKUP_MS) all keep the redirect exactly as it was.
 *
 * Its own client, with no cookies and no session: these addresses are
 * public, and nothing here reads or writes a visitor's session.
 */
const ONEPAGE_LOOKUP_MS = 2500

async function oldOnePageTarget(name: string, already: OldAddressRedirect, search: string): Promise<OldAddressRedirect & { answer: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return { ...already, answer: "no-database" }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const supabase = createClient(supabaseUrl, supabaseKey, { ...PROXY_DB, auth: { persistSession: false, autoRefreshToken: false } })
    const slow = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ONEPAGE_LOOKUP_MS)
    })
    const address = await Promise.race([resolveOnePageAddress(name, supabaseOnePageLookup(supabase, "id, slug")), slow])
    if (!address) return { ...already, answer: "slow" }
    return { ...oldAddressRedirect(address, already, { search, mainDomain: MAIN_DOMAIN }), answer: address.kind }
  } catch {
    return { ...already, answer: "failed" }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Has this creator published a website in the builder?
 *
 * Only a connected custom domain asks: the subdomain decides the same
 * question the other way round (anything that is not a live AI site is the
 * website, because an unpublished one already has a good answer at the
 * creator page). A domain cannot fall through like that — it has no creator
 * page of its own to fall back to unless it is told to — so it asks.
 *
 * A failed lookup reads as "no website", which lands on the profile, which
 * is where the domain pointed yesterday.
 */
async function hasPublishedWebsite(username: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return false
  const lower = username.toLowerCase()
  /* The same read the compat question makes, shared (lib/website-builder/route-facts.ts): name, creator, published install. */
  return remembered(`site:${lower}`, async () => {
    const { facts, failed } = await siteFactsFor(createClient(supabaseUrl, supabaseKey, PROXY_DB), lower)
    return { value: facts.published, failed }
  })
}

/**
 * The host a website is served at on its own domain, when it has one live:
 * its primary website domain, connected with HTTPS. Held thirty seconds a
 * name, as the proxy's other answers are; a read that fails, or a database
 * without the purpose and primary columns, is "none", so the Storelib
 * address keeps serving the site.
 */
const websiteDomainHeld = new Map<string, { at: number; host: string | null }>()
async function websiteDomainOf(name: string): Promise<string | null> {
  const lower = name.toLowerCase()
  const hit = websiteDomainHeld.get(lower)
  if (hit && Date.now() - hit.at < 30_000) return hit.host
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return null
  try {
    const db = createClient(supabaseUrl, supabaseKey, PROXY_DB)
    const { facts, failed } = await siteFactsFor(db, lower)
    if (failed) return hit?.host ?? null
    let host: string | null = null
    if (facts.creatorId && facts.published && facts.extras) {
      /* Read with the facts, in the same round trip (SQL part 257). */
      const row = facts.extras.websiteDomain
      if (row?.domain && row.ssl_status !== "failed") host = servedAt(row.domain)
    } else if (facts.creatorId && facts.published) {
      const { data, error } = await db
        .from("custom_domains")
        .select("domain, ssl_status")
        .eq("creator_id", facts.creatorId)
        .eq("purpose", "website")
        .eq("is_primary", true)
        .eq("status", "active")
        .limit(1)
        .maybeSingle()
      if (error) return hit?.host ?? null
      const row = data as { domain?: string | null; ssl_status?: string | null } | null
      if (row?.domain && row.ssl_status !== "failed") host = servedAt(row.domain)
    }
    if (websiteDomainHeld.size > 5000) websiteDomainHeld.clear()
    websiteDomainHeld.set(lower, { at: Date.now(), host })
    return host
  } catch {
    return hit?.host ?? null
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A WEBSITE IN ANOTHER LANGUAGE: /fr/about
 * ═══════════════════════════════════════════════════════════════════════════
 * A website built in the website builder with more languages published
 * (Settings › Markets and languages) answers each at its own prefix: the
 * page goes to the same route under "<name>~fr" (lib/markets/site-name.ts),
 * where its approved translations are laid over it (lib/markets/live.ts).
 * Asked only when the address starts with something shaped like a language,
 * and held for thirty seconds a name, like the questions above.
 */
const LANGUAGE_FIRST = /^\/[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*(?:\/|$)/
interface SiteLocalization {
  /** Published languages other than the website's own. */
  languages: string[]
  /** Active markets that show their own currency: which countries are in each. */
  markets: { id: string; countries: string[] }[]
  /** Active markets with a published language of their own: their visitors start in it (marketLanguageStart). */
  starts: { language: string; countries: string[] }[]
  /** The website's own language, and whether visitors are shown theirs (visitorLanguageStart, SQL part 173). */
  defaultLanguage?: string
  visitorLanguage?: boolean
}
const NO_LOCALIZATION: SiteLocalization = { languages: [], markets: [], starts: [] }
const localizationHeld = new Map<string, { at: number; value: SiteLocalization }>()
/* A read already under way is shared: the page's questions start it (startSiteQuestions) and the rewrite asks again. */
const localizationAsked = new Map<string, Promise<SiteLocalization>>()
function siteLocalizationFor(username: string): Promise<SiteLocalization> {
  const lower = username.toLowerCase()
  const hit = localizationHeld.get(lower)
  if (hit && Date.now() - hit.at < 30_000) return Promise.resolve(hit.value)
  const asking = localizationAsked.get(lower)
  if (asking) return asking
  const read = readSiteLocalization(lower, hit).finally(() => localizationAsked.delete(lower))
  localizationAsked.set(lower, read)
  return read
}
async function readSiteLocalization(lower: string, hit: { at: number; value: SiteLocalization } | undefined): Promise<SiteLocalization> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return NO_LOCALIZATION
  try {
    const db = createClient(supabaseUrl, supabaseKey, PROXY_DB)
    const { facts, failed } = await siteFactsFor(db, lower)
    if (failed) return hit?.value ?? NO_LOCALIZATION
    let value = NO_LOCALIZATION
    if (facts.creatorId) {
      /* Read with the facts, in the same round trip, when SQL part 257 has run (lib/website-builder/route-facts.ts); else on its own, as before. */
      const extras = facts.extras
      let data: unknown = extras ? extras.localization : null
      if (!extras) {
        /* With Show visitors their own language (part 173); a database without its column is read as before, with it off. */
        let { data: read, error } = await db.from("store_localization").select("default_language, languages, markets, visitor_language").eq("creator_id", facts.creatorId).maybeSingle()
        if (error && /visitor_language/.test(error.message ?? "")) ({ data: read, error } = await db.from("store_localization").select("default_language, languages, markets").eq("creator_id", facts.creatorId).maybeSingle())
        /* Part 136 not run, or no row: one language, the store's prices. Another error keeps what was known. */
        if (error && !/does not exist|schema cache|PGRST20[45]|42P01/i.test(`${error.code} ${error.message}`)) return hit?.value ?? NO_LOCALIZATION
        data = read
      }
      const row = data as { default_language?: string; visitor_language?: boolean | null; languages?: { code?: unknown; published?: unknown }[]; markets?: { id?: unknown; countries?: unknown; currency?: unknown; language?: unknown; active?: unknown; primary?: unknown; rest?: unknown }[] } | null
      const def = (row?.default_language ?? "").toLowerCase()
      const languages = (Array.isArray(row?.languages) ? row!.languages : [])
        .filter((l) => l?.published === true && typeof l.code === "string" && l.code.toLowerCase() !== def)
        .map((l) => String(l.code))
      /*
        THE STORE'S OWN COUNTRY IS NEVER IN A MARKET, and All other countries
        is worked out from the rest (lib/markets/market-countries.ts), exactly
        as the page this sends the visitor to reads them (lib/markets/live.ts).
      */
      const rawMarkets = (Array.isArray(row?.markets) ? row!.markets : []).filter((m) => m && typeof m === "object")
      /* No country set: the one whose currency the store sells in (RON: Romania), so the store's own visitors are never put in another currency. */
      const ownOf = (d: { default_country?: unknown; currency?: unknown } | null) => (typeof d?.default_country === "string" && d.default_country) || countryOfCurrency(d?.currency)
      const own = !rawMarkets.some((m) => m.primary !== true)
        ? null
        : extras
          ? ownOf(extras.store)
          : await db
              .from("store_settings")
              .select("default_country, currency")
              .eq("creator_id", facts.creatorId)
              .maybeSingle()
              .then(
                (r) => ownOf(r.data as { default_country?: unknown; currency?: unknown } | null),
                () => null,
              )
      const placed = resolveMarketCountries(
        rawMarkets.map((m) => ({ ...m, countries: (Array.isArray(m.countries) ? m.countries : []).filter((c): c is string => typeof c === "string"), primary: m.primary === true, active: m.active !== false, rest: m.rest === true, currency: typeof m.currency === "string" && m.currency ? m.currency : null })),
        typeof own === "string" ? own : null,
      )
      value = {
        languages,
        defaultLanguage: row?.default_language || "en",
        visitorLanguage: row?.visitor_language === true,
        starts: placed
          .filter((m) => !m.primary && m.active && typeof m.language === "string" && languages.some((l) => l.toLowerCase() === String(m.language).toLowerCase()))
          .map((m) => ({ language: String(m.language).toLowerCase(), countries: m.countries })),
        markets: placed
          .filter((m) => !m.primary && m.active && m.currency && typeof m.id === "string" && /^[a-z0-9-]{1,40}$/.test(m.id))
          .map((m) => ({ id: String(m.id), countries: m.countries })),
      }
    }
    if (localizationHeld.size > 10_000) localizationHeld.clear()
    localizationHeld.set(lower, { at: Date.now(), value })
    return value
  } catch {
    return hit?.value ?? NO_LOCALIZATION
  }
}
async function siteLanguagesFor(username: string): Promise<string[]> {
  return (await siteLocalizationFor(username)).languages
}

/*
  THE VISITOR'S MARKET: the country they chose on the website (sl_country,
  set by its currency picker; "home" for the store's own prices), else the
  country Vercel sees them in (lib/markets/visitor-country.ts). A market
  with its own currency is drawn with its prices converted
  (lib/markets/pricing); any other country sees the store's own. A cookie
  written before choices were marked is no choice, and is cleared on the
  way out (forgetStaleCountry): it was the "Åland Islands (BRL)" an
  imported theme had shown a visitor in Romania, posted back with a
  language change and kept for a year (the owner).
*/
function visitorCountry(request: NextRequest): string | null {
  return visitorCountryFrom(request.cookies.get(COUNTRY_COOKIE)?.value, seenCountry(request.headers))
}
/** Clears a country cookie that is not a visitor's choice (readCountryCookie `stale`) from whatever the proxy answers. */
function forgetStaleCountry<R extends Response | null | undefined>(request: NextRequest, r: R): R {
  if (!r || !readCountryCookie(request.cookies?.get(COUNTRY_COOKIE)?.value).stale) return r
  try {
    r.headers.append("Set-Cookie", FORGET_COUNTRY_COOKIE)
  } catch {
    /* An answer whose headers cannot change: the cookie is still never read, and goes on the next one. */
  }
  return r
}
async function visitorMarket(request: NextRequest, username: string): Promise<string | null> {
  const { markets } = await siteLocalizationFor(username)
  if (markets.length === 0) return null
  const country = visitorCountry(request)
  return country ? (markets.find((m) => m.countries.includes(country))?.id ?? null) : null
}

/*
  A MARKET'S OWN LANGUAGE, ON A VISITOR'S FIRST PAGE. A market can say its
  countries start in one of the website's published languages (Settings ›
  Markets and languages): a visitor from there who has never picked a
  language is sent once to the same page in it (/about to /fr/about), and
  the language is remembered (sl_lang). From then on the address and the
  language selector decide, which also set sl_lang, so nobody is sent back
  and forth. Only a person opening a page: never a crawler (search engines
  see every language at its own address, hreflang), a script, a form, the
  editor's preview, or the cart, checkout and account.
*/
const CRAWLER = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|lighthouse|headless/i
const NEVER_STARTED = /^\/(?:checkout|cart|account|api|receipt|review|wishlist|password|localization|preview|_next|media|files)(?:[/?#]|$)/
async function marketLanguageStart(request: NextRequest, username: string, pathname: string): Promise<NextResponse | null> {
  if (request.method !== "GET" || request.cookies.get("sl_lang")?.value) return null
  const dest = request.headers.get("sec-fetch-dest")
  if ((dest && dest !== "document") || !(request.headers.get("accept") ?? "").includes("text/html")) return null
  if (CRAWLER.test(request.headers.get("user-agent") ?? "") || NEVER_STARTED.test(pathname) || /\.[a-z0-9]{1,8}$/i.test(pathname) || request.nextUrl.searchParams.has("preview")) return null
  const loc = await siteLocalizationFor(username)
  if (loc.starts.length === 0) return null
  const first = pathname.split("/")[1]?.toLowerCase() ?? ""
  if (loc.languages.some((l) => l.toLowerCase() === first)) return null
  const country = visitorCountry(request)
  const start = country ? loc.starts.find((s) => s.countries.includes(country)) : undefined
  if (!start) return null
  const to = request.nextUrl.clone()
  to.pathname = `/${start.language}${pathname === "/" ? "" : pathname}`
  const r = NextResponse.redirect(to, 307)
  r.cookies.set("sl_lang", start.language, { path: "/", maxAge: 31_536_000, sameSite: "lax", secure: true })
  r.headers.set("Cache-Control", "private, no-store")
  return r
}

/*
  SHOW VISITORS THEIR OWN LANGUAGE (Settings › Markets and languages, part
  173; lib/markets/visitor-language.ts). On a visitor's first page, with no
  language of their own chosen yet (sl_lang): the first language their
  browser asks for that the website has exactly sends them there once from
  a page in the website's own language, remembered (sl_lang), like a
  market's own language above. A near match, or only their country to go
  by, is offered instead: the language is named for this visit
  (sl_suggest, a session cookie) and the page's own card offers it
  (lib/markets/suggest-script.ts). Never a crawler, a script, a form, the
  cart, checkout or account, never a preview; the address always wins.
*/
async function visitorLanguageStart(request: NextRequest, username: string, pathname: string): Promise<{ redirect: NextResponse } | { suggest: string } | null> {
  if (request.method !== "GET" || request.cookies.get("sl_lang")?.value || request.cookies.get("sl_suggest")?.value) return null
  /* A script, a picture, a theme's /cart.js: not a page, and not worth the settings read. */
  if (!(request.headers.get("accept") ?? "").includes("text/html")) return null
  const loc = await siteLocalizationFor(username)
  if (!loc.visitorLanguage || loc.languages.length === 0) return null
  const seen = request.headers.get("x-vercel-ip-country")
  const decided = visitorLanguageDecision({
    method: request.method,
    dest: request.headers.get("sec-fetch-dest"),
    accept: request.headers.get("accept"),
    userAgent: request.headers.get("user-agent"),
    pathname,
    skip: NEVER_STARTED.test(pathname) || request.nextUrl.searchParams.has("preview"),
    chosen: null,
    offered: null,
    on: true,
    defaultLanguage: loc.defaultLanguage || "en",
    others: loc.languages,
    acceptLanguage: request.headers.get("accept-language"),
    country: seen && /^[A-Za-z]{2}$/.test(seen) ? seen : null,
  })
  if (!decided) return null
  if (decided.kind === "suggest") return { suggest: decided.language }
  const to = request.nextUrl.clone()
  to.pathname = decided.to
  const r = NextResponse.redirect(to, 307)
  r.cookies.set("sl_lang", decided.language.toLowerCase(), { path: "/", maxAge: 31_536_000, sameSite: "lax", secure: true })
  r.headers.set("Cache-Control", "private, no-store")
  r.headers.set("Vary", "Accept-Language, Cookie")
  return { redirect: r }
}

/** The language a visitor's page offers (visitorLanguageStart), named for this visit only (a session cookie). */
function offerLanguage(r: NextResponse, suggest: string | null | undefined): NextResponse {
  if (suggest) r.cookies.set("sl_suggest", suggest.toLowerCase(), { path: "/", sameSite: "lax", secure: true })
  return r
}

/** The address in one of the website's other languages, or in the visitor's market's currency; null for the website's own, at the store's prices. */
async function inSiteLanguage(username: string, pathname: string, request?: NextRequest) {
  const market = request ? await visitorMarket(request, username) : null
  if (!market && !LANGUAGE_FIRST.test(pathname)) return null
  return siteRouteInLanguage(username, pathname, await siteLanguagesFor(username), market)
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A WEBSITE WHOSE THEME WAS IMPORTED FROM SHOPIFY
 * ═══════════════════════════════════════════════════════════════════════════
 * Its published install says so in its theme settings (`compat`). Such a
 * site answers every address itself, its cart's `/cart.js` and its theme's
 * section requests included, at /api/site-theme/site/<name>/…
 * (lib/storelib-theme/compat/site.ts). Held for twenty seconds a name, so a
 * page and the dozen requests its scripts make cost one read between them.
 */
const compatHeld = new Map<string, { at: number; value: boolean }>()
const compatAsked = new Map<string, Promise<SiteAnswer>>()
/*
  ASKED AGAIN WHEN A RENDERER SAYS THE ANSWER IS OLD: a Publish that
  switched between a Storelib theme and an imported one, seen by the
  renderer this server sent the visitor to by the answer it held
  (lib/website-builder/live-release-script.ts SITE_FRESH_PARAM). At most
  once a second a name, so the address cannot be used to make every request
  a read of the database.
*/
const compatForced = new Map<string, number>()
const FORCED_GAP_MS = 1_000
/** The request came back from a renderer that found the other kind of theme live. */
const asksFresh = (request: NextRequest) => request.nextUrl.searchParams.has(SITE_FRESH_PARAM)
async function compatSiteFor(username: string, fresh = false): Promise<boolean> {
  return (await compatSiteAnswer(username, fresh)) === true
}

/** compatSiteFor, with "unavailable" for a read that failed while nothing was held (SITE-8). */
async function compatSiteAnswer(username: string, fresh = false): Promise<SiteAnswer> {
  const lower = username.toLowerCase()
  let hit = compatHeld.get(lower)
  if (fresh && hit && Date.now() - (compatForced.get(lower) ?? 0) > FORCED_GAP_MS && !compatAsked.has(lower)) {
    if (compatForced.size > 5000) compatForced.clear()
    compatForced.set(lower, Date.now())
    compatHeld.delete(lower)
    forgetSharedSiteFacts(lower)
    hit = undefined
  }
  if (hit && Date.now() - hit.at < 20_000) return hit.value
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) return false
  const asking = compatAsked.get(lower)
  if (asking) return asking
  /*
    The name, its creator, the published install and its compat kind, read
    once with the published-website question (lib/website-builder/route-facts.ts).
    A read that failed is not "not imported": the answer before it stands,
    and nothing is remembered.
  */
  const answer = (async (): Promise<SiteAnswer> => {
    const { facts, failed } = await siteFactsFor(createClient(supabaseUrl, supabaseKey, PROXY_DB), lower)
    if (failed) return hit ? hit.value : "unavailable"
    if (compatHeld.size > 5000) compatHeld.clear()
    compatHeld.set(lower, { at: Date.now(), value: facts.compat })
    return facts.compat
  })().finally(() => compatAsked.delete(lower))
  compatAsked.set(lower, answer)
  return answer
}

/** The addresses of an imported theme's site that are still Storelib's own: a visitor's account, the API, the site's SEO files. */
function compatAnswers(pathname: string, request: NextRequest): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/_next/")) return false
  /* The theme's /checkout is its own (its cart posts there, and it hands the
     cart cookie's lines on); with the lines already in the address, and
     anything under it, it is the website's own checkout (siteCheckoutFor). */
  if (pathname.startsWith("/checkout/")) return false
  if (pathname === "/checkout" && (request.nextUrl.searchParams.has("items") || request.nextUrl.searchParams.has("productId"))) return false
  /* A receipt is Storelib's page on the site (siteCheckoutFor), never a theme's 404: the thank you page links to it. */
  if (pathname === "/receipt" || pathname.startsWith("/receipt/")) return false
  /* A review request link is Storelib Reviews' page on every host (app/review/[token]). */
  if (pathname.startsWith("/review/")) return false
  /* A buyer's conversation with the shop is Storelib's page on every host (app/order-help/[id]). */
  if (pathname.startsWith("/order-help/")) return false
  /*
    THE VISITOR'S ACCOUNT is drawn by the theme itself, on this host, with
    no frame (lib/storelib-theme/compat/site.ts, accountPage): sign in, the
    account, the addresses, and the theme's own account forms posted there.
    Only signing out is the website's own route, the same for every site.
  */
  if (pathname === "/account" || pathname.startsWith("/account/")) return pathname !== "/account/logout"
  /*
    The wishlist is Storelib's own page. A visit to it is drawn by the
    theme, its header and footer around the page in a frame of this same
    site (accountShell); the frame's own request goes to the page itself.
  */
  if (pathname === "/wishlist") {
    const framed = request.headers.get("sec-fetch-dest") === "iframe" || request.nextUrl.searchParams.has("sl_embed")
    const reading = request.method === "GET" || request.method === "HEAD"
    return reading && !framed
  }
  return pathname !== "/robots.txt" && pathname !== "/sitemap.xml"
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A WEBSITE'S CHECKOUT, ON THE WEBSITE'S OWN HOST
 * ═══════════════════════════════════════════════════════════════════════════
 * /checkout on a creator's published website is served there, on that host
 * (app/checkout/site), so the address, the cookies and the site's customer
 * account are the creator's: it used to be sent to storelib.com, where the
 * buyer was a stranger and the address was ours. The thank you page, the
 * receipt and the order page are served there too; the old basket links are
 * sent on to it (lib/checkout/site-checkout siteCheckoutRouteFor). The page
 * is behind the website's password like any other page of it.
 */
async function siteCheckoutFor(request: NextRequest, name: string, host: string, pathname: string, search: string): Promise<NextResponse | null> {
  const route = siteCheckoutRouteFor(pathname, search, request.method, host)
  if (!route) return null
  if (route.kind === "pass") return NextResponse.next()
  if (route.kind === "redirect") return NextResponse.redirect(new URL(route.to, request.url), { status: route.status })
  if (pathname === "/checkout" || pathname === "/checkout/") {
    const gate = await passwordPageFor(request, name, host, pathname, search)
    if (gate.blocked) return gate.blocked
  }
  const r = NextResponse.rewrite(new URL(route.path, request.url))
  r.headers.set("Cache-Control", "private, no-store")
  r.headers.set("x-seller-subdomain", name)
  return r
}

/**
 * THE WISHLIST IN AN IMPORTED THEME'S FRAME. vercel.json sends
 * `X-Frame-Options: DENY` on every path, so the frame accountShell puts the
 * wishlist in (lib/storelib-theme/compat/site.ts) was refused and drew a
 * blank rectangle. Only that request (/wishlist with ?sl_embed) may be
 * framed, and only by this same origin: `frame-ancestors 'self'`, which takes
 * precedence over X-Frame-Options where both are sent.
 */
function selfFramedWishlist(response: NextResponse, request: NextRequest): void {
  if (request.nextUrl.pathname === "/wishlist" && request.nextUrl.searchParams.has("sl_embed")) response.headers.set("Content-Security-Policy", "frame-ancestors 'self'")
}

/** /policies/refund-policy, as Shopify writes it, to /refund-policy, where a site of Storelib's own keeps it; null for any other address. */
function policyAddress(pathname: string): string | null {
  const m = pathname.match(/^\/policies\/(refund-policy|privacy-policy|terms-of-service|shipping-policy)\/?$/)
  return m ? `/${m[1]}` : null
}

/** The rewrite to the imported theme's handler, behind the site's password when it has one: a page, and the shop's product list (/products.json); not a file a page loads (a script, /cart.js). */
async function compatRewrite(request: NextRequest, name: string, host: string, pathname: string, search: string): Promise<NextResponse> {
  /*
    AN IMPORTED THEME IN ANOTHER OF THE WEBSITE'S LANGUAGES: every address
    under /fr answers as the same address in French (the cart and its
    scripts too, which the theme's routes now point under /fr). The
    language is named to the handler in a header only this proxy sets.
  */
  const started = await marketLanguageStart(request, name, pathname)
  if (started) return started
  const own = await visitorLanguageStart(request, name, pathname)
  if (own && "redirect" in own) return own.redirect
  let locale: string | null = null
  let asked = pathname
  if (LANGUAGE_FIRST.test(pathname)) {
    const m = pathname.match(/^\/([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)(\/.*)?$/)
    const hit = m ? (await siteLanguagesFor(name)).find((l) => l.toLowerCase() === m[1].toLowerCase()) : undefined
    if (m && hit) {
      locale = hit
      asked = m[2] || "/"
    }
  }
  let page = asked
  let query = search
  let gated = false
  /* Whether the website asks for a password at all: a page let in with a pass is that visitor's, never a stranger's (strangerPage below). */
  let protectedSite = false
  if ((!/\.[a-z0-9]{1,8}$/i.test(asked) && !asked.startsWith("/cart/")) || /^(?:\/collections\/[^/]+)?\/products\.json$/i.test(asked)) {
    const gate = await passwordPageFor(request, name, host, asked, search)
    protectedSite = gate.protected
    if (gate.blocked) {
      /*
        THE THEME'S OWN PASSWORD PAGE, never Storelib's builder one: that
        page draws a builder theme's sections, and an imported theme has
        none, so a protected imported website was a blank white page. Drawn
        at the address asked for, which it goes back to once the password
        is right. A script's JSON request is refused instead.
      */
      if (/\.json$/i.test(asked)) return gate.blocked
      page = "/password"
      query = `?${new URLSearchParams({ return: `${pathname}${search}` }).toString()}`
      gated = true
    }
  }
  /*
    A STRANGER'S PAGE, DRAWN ONCE A MINUTE FOR EVERY STRANGER (lib/storelib-theme/
    compat/anonymous-cache.ts): a GET for a page, with no cookie that could
    change it, on a website without a password, where no language is being
    offered. It goes to an address of its own, marked with the host, the
    country, the language and the market it is drawn for, so the copy held
    there is never handed to anybody else. Everything else is drawn per
    request and kept private, as before.
  */
  const country = visitorCountry(request)
  const market = await visitorMarket(request, name)
  const offersLanguage = !!(own && "suggest" in own && !gated)
  const marker = !gated && strangerPage({
    method: request.method,
    path: page,
    query: new URLSearchParams(query),
    cookie: request.headers.get("cookie"),
    accept: request.headers.get("accept"),
    contentType: request.headers.get("content-type"),
    requestedWith: request.headers.get("x-requested-with"),
    protectedSite,
    offersLanguage,
  })
    ? strangerMarker({ host: siteHostOf(request.headers), country, locale, market })
    : null
  const to = request.nextUrl.clone()
  to.pathname = `/api/site-theme/site/${name}${marker ? `/${marker}` : ""}${page === "/" ? "" : page}`
  to.search = query
  /* Sealed for this name on this host: the handler draws nothing it was not sent by this proxy (lib/storelib-theme/compat/site-seal.ts). */
  const headers = new Headers(request.headers)
  headers.delete(SITE_SEAL_HEADER)
  headers.delete(SITE_LOCALE_HEADER)
  headers.delete(SITE_MARKET_HEADER)
  headers.delete(SITE_COUNTRY_HEADER)
  if (locale) headers.set(SITE_LOCALE_HEADER, locale)
  /*
    THE VISITOR'S COUNTRY, SAID OUTRIGHT: the one they chose, else where
    Vercel sees them. The handler did not get x-vercel-ip-country through
    this rewrite, so the theme's country selector took the market's first
    country ("Åland Islands (BRL)" for a visitor in Romania, the owner).
  */
  if (country) headers.set(SITE_COUNTRY_HEADER, country)
  /* The visitor's market, when it shows its own currency (visitorMarket): the theme draws its prices in it. */
  if (market) headers.set(SITE_MARKET_HEADER, market)
  const seal = await sealSite(name, siteHostOf(request.headers))
  if (seal) headers.set(SITE_SEAL_HEADER, seal)
  const r = offerLanguage(NextResponse.rewrite(to, { request: { headers } }), own && "suggest" in own && !gated ? own.suggest : null)
  if (gated) r.headers.set("X-Robots-Tag", "noindex")
  /*
    THE FRONT PAGE, SAID HERE. next.config's rule for `/` (the marketing
    landing page's `public, s-maxage=3600`) matches the path the browser
    asked for, on every host, and a header set on this rewrite is the one
    that wins over it (the built website's front page does the same, above).
    So `/` says outright what the handler would: private, for a stranger
    too. A stranger's front page is drawn once a minute by the hold
    (lib/storelib-theme/compat/stranger-hold.ts), which Publish clears; a
    CDN copy it could not clear showed the previous theme after a Publish.
  */
  if (asked === "/" && page === "/") r.headers.set("Cache-Control", marker ? PUBLIC_PAGE_CACHE : "private, no-cache")
  /*
    No Cache-Control here: the handler sets its own on every answer (a page
    "private, no-cache", which keeps the browser's back/forward cache on; the
    cart, checkout, account and every other answer "private, no-store"). A
    header set on this rewrite is merged over the handler's and would turn
    the back/forward cache off again for every page.
  */
  r.headers.set("x-seller-subdomain", name)
  return r
}

/**
 * What a connected domain is: whose, and FOR WHAT.
 *
 * `purpose` is 'website' (the site built in the website builder, and the
 * creator page when none is published, which is what every domain served
 * before purposes existed) or 'creator_page' (storelib.com/<handle>, its
 * products under it and the OnePage at /links). `redirectTo` is set when the
 * domain is not the primary one of its purpose and the primary is live: it
 * answers with a redirect there, so one address collects the links.
 *
 * The purpose columns may not exist yet (supabase/sql/run-now/22): a
 * database that does not know them is asked again the old way, and every
 * domain is a website domain, exactly as before.
 *
 * Or 'community' (round 31, run-now part 179): the domain serves ONE
 * community, named by id (target_id) and read by id on every lookup, so a
 * renamed community keeps its domain. It is served only once its DNS has
 * been seen pointing here (active, or ssl_provisioning while the
 * certificate is issued), and only while the community is still the
 * domain owner's; `communitySlug` is null otherwise and the domain answers
 * "not connected" instead of anybody's pages.
 */
type ConnectedDomain = {
  username: string
  purpose: "website" | "creator_page" | "community"
  redirectTo: string | null
  /** Whose domain it is, so the site's own lookups need not find the creator by name again. */
  creatorId?: string
  /** A community domain's community, by its current address; null while it may not be served. */
  communitySlug?: string | null
}

/** A community's domain before it is verified, or after its community left: nobody's pages. */
const DOMAIN_NOT_CONNECTED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Not connected yet</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 Inter,system-ui,sans-serif;color:#1a1a2e;background:#f8f9fa}p{margin:0;color:#6b7280}</style></head><body><main><h1 style="font-size:20px;margin:0 0 6px">Not connected yet</h1><p>This domain is being set up on Storelib.</p></main></body></html>`

/** The host a stored domain is served at: www.<apex>, or a subdomain as it is. */
function servedAt(domain: string): string {
  return isApexHost(domain) ? `www.${domain}` : domain
}

/**
 * WHICH SITE A CONNECTED DOMAIN IS, REMEMBERED THROUGH A DATABASE BLINK.
 * Each host's last clean answer is kept for a minute, and kept past that
 * whenever the database does not answer: a failed lookup used to read as
 * "not connected" and bounced every visitor of the domain to storelib.com.
 * With no answer ever seen and the database away, the caller says
 * "unavailable" and the visitor is asked to try again in a moment.
 */
/*
  ONE READ PER HOST AT A TIME, AND NO VISITOR WAITS FOR A REFRESH (round 48,
  lib/website-builder/held-lookup.ts). Visitors arriving together on a cold
  server share the one lookup in flight, where each used to ask the same
  three to five questions of the database. Past its minute an answer is
  still served, for up to ten more, while one read refreshes it behind, so
  a change (a domain removed, made primary) is seen by the first request
  after the minute's refresh has come back.
*/
const domainHeld = heldLookup<ConnectedDomain | null>({ freshMs: 60_000, staleMs: 10 * 60_000, max: 5000 })

/** A page that loads again by itself, for the moment a site cannot be looked up. */
/** A site whose routing or lookup could not be read: try again in a moment, never a guess. */
function siteUnavailable(): NextResponse {
  return new NextResponse(SITE_UNAVAILABLE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" } })
}
const SITE_UNAVAILABLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>One moment</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 Inter,system-ui,sans-serif;color:#1a1a2e;background:#f8f9fa}p{margin:0;color:#6b7280}</style></head><body><main><h1 style="font-size:20px;margin:0 0 6px">One moment</h1><p>This page will load again by itself.</p></main></body></html>`

async function resolveCustomDomain(host: string): Promise<ConnectedDomain | null | "unavailable"> {
  const key = host.split(":")[0].toLowerCase()
  const answer = await domainHeld.get(key, () => resolveCustomDomainFresh(host))
  return answer.failed ? "unavailable" : answer.value
}

/* "No row" from `.single()` is an answer; anything else that comes back as an error is the database not answering. */
const failedRead = (error: { code?: string } | null | undefined) => !!error && error.code !== "PGRST116"

async function resolveCustomDomainFresh(host: string): Promise<{ value: ConnectedDomain | null; failed: boolean }> {
  const none = { value: null, failed: false }
  const hostWithoutPort = host.split(":")[0]

  // Skip known storelib domains and localhost
  if (
    hostWithoutPort === "localhost" ||
    hostWithoutPort === "127.0.0.1" ||
    hostWithoutPort === MAIN_DOMAIN ||
    hostWithoutPort.endsWith(`.${MAIN_DOMAIN}`)
  ) {
    return none
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return none

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, PROXY_DB)

    // Strip www. prefix for lookup - domains are stored without www in the database
    const lookupDomain = hostWithoutPort.replace(/^www\./, "")

    // Match active, ssl_provisioning, or pending (if request arrives, DNS is working)
    const served = ["active", "ssl_provisioning", "pending", "verifying"]
    const missingColumn = (e: { code?: string; message?: string } | null) => !!e && /column|42703|PGRST204/i.test(`${e.code} ${e.message}`)
    /* What the domain serves, a community's included (part 179); asked again without those columns, then without the purpose ones. */
    let { data: domainRecord, error } = await supabase
      .from("custom_domains")
      .select("creator_id, status, purpose, is_primary, target_type, target_id, creator:creators ( user_id )")
      .eq("domain", lookupDomain)
      .in("status", served)
      .maybeSingle()
    if (missingColumn(error)) {
      ;({ data: domainRecord, error } = (await supabase
        .from("custom_domains")
        .select("creator_id, status, purpose, is_primary, creator:creators ( user_id )")
        .eq("domain", lookupDomain)
        .in("status", served)
        .maybeSingle()) as never)
    }
    if (error && /column|42703|PGRST204/i.test(`${error.code} ${error.message}`)) {
      ;({ data: domainRecord } = (await supabase
        .from("custom_domains")
        .select("creator_id, status, creator:creators ( user_id )")
        .eq("domain", lookupDomain)
        .in("status", served)
        .maybeSingle()) as never)
    } else if (failedRead(error)) return { value: null, failed: true }

    if (!domainRecord) return none
    const row = domainRecord as { creator_id: string; status?: string | null; purpose?: string | null; is_primary?: boolean | null; target_type?: string | null; target_id?: string | null; creator?: { user_id?: string | null } | { user_id?: string | null }[] | null }

    /* A COMMUNITY'S DOMAIN: that community, by id, only once verified and only while it is the domain owner's. */
    if (row.purpose === "community") {
      const communityId = communityIdOf(row)
      const verified = row.status === "active" || row.status === "ssl_provisioning"
      let communitySlug: string | null = null
      if (communityId && verified) {
        const { data: community, error: communityErr } = await supabase
          .from("communities")
          .select("slug, creator_id, deleted_at")
          .eq("id", communityId)
          .maybeSingle()
        if (failedRead(communityErr)) return { value: null, failed: true }
        const c = community as { slug: string | null; creator_id: string | null; deleted_at: string | null } | null
        if (communityServable(row, c)) communitySlug = c!.slug
      }
      return { value: { username: "", purpose: "community", redirectTo: null, creatorId: row.creator_id, communitySlug }, failed: false }
    }

    const purpose = row.purpose === "creator_page" ? "creator_page" : "website"

    /* The creator came with the domain (an embed on custom_domains.creator_id); read on its own only when it did not. */
    const embedded = Array.isArray(row.creator) ? row.creator[0] : row.creator
    let creator: { user_id: string } | null = embedded?.user_id ? { user_id: embedded.user_id } : null
    if (!creator) {
      const { data, error: creatorErr } = await supabase
        .from("creators")
        .select("user_id")
        .eq("id", row.creator_id)
        .single()
      if (failedRead(creatorErr)) return { value: null, failed: true }
      creator = data as { user_id: string } | null
    }

    if (!creator) return none

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", creator.user_id)
      .single()
    if (failedRead(profileErr)) return { value: null, failed: true }

    if (!profile?.username) return none

    /* Not the primary: send it to the one that is, once that one is live. */
    let redirectTo: string | null = null
    if (row.is_primary === false) {
      const { data: primary } = await supabase
        .from("custom_domains")
        .select("domain")
        .eq("creator_id", row.creator_id)
        .eq("purpose", purpose)
        .eq("is_primary", true)
        .eq("status", "active")
        .maybeSingle()
      const primaryDomain = (primary as { domain?: string } | null)?.domain
      if (primaryDomain && primaryDomain !== lookupDomain) redirectTo = servedAt(primaryDomain)
    }

    return { value: { username: profile.username, purpose, redirectTo, creatorId: row.creator_id }, failed: false }
  } catch {
    return { value: null, failed: true }
  }
}

/**
 * Check if a domain has a redirect entry in domain_redirects table.
 * Used for old/removed/changed domains - redirects traffic to new domain or fallback subdomain.
 * Returns the redirect URL and HTTP code if found, null otherwise.
 */
async function checkDomainRedirect(host: string): Promise<{ redirectTo: string; httpCode: number } | null> {
  const hostWithoutPort = host.split(":")[0]

  // Skip known storelib domains and localhost
  if (
    hostWithoutPort === "localhost" ||
    hostWithoutPort === "127.0.0.1" ||
    hostWithoutPort === MAIN_DOMAIN ||
    hostWithoutPort.endsWith(`.${MAIN_DOMAIN}`)
  ) {
    return null
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return null

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, PROXY_DB)

    // Strip www. prefix for lookup
    const lookupDomain = hostWithoutPort.replace(/^www\./, "")

    const { data: redirect } = await supabase
      .from("domain_redirects")
      .select("redirect_to, http_code, keep_until")
      .eq("domain", lookupDomain)
      .gt("keep_until", new Date().toISOString())
      .single()

    if (!redirect) return null

    return {
      redirectTo: redirect.redirect_to,
      httpCode: redirect.http_code || 301,
    }
  } catch {
    return null
  }
}

/**
 * Look up the username of the creator who owns (or owned) a custom domain.
 * Checks custom_domains in ANY status so we can redirect even for removed/pending domains.
 */
async function lookupDomainOwnerUsername(host: string): Promise<string | null> {
  const hostWithoutPort = host.split(":")[0]
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return null

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, PROXY_DB)
    const lookupDomain = hostWithoutPort.replace(/^www\./, "")

    const { data: domainRecord } = await supabase
      .from("custom_domains")
      .select("creator_id")
      .eq("domain", lookupDomain)
      .limit(1)
      .maybeSingle()

    if (!domainRecord) return null

    const { data: creator } = await supabase
      .from("creators")
      .select("user_id")
      .eq("id", domainRecord.creator_id)
      .single()

    if (!creator) return null

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", creator.user_id)
      .single()

    return profile?.username || null
  } catch {
    return null
  }
}

/**
 * Retire the old `.storelib.com` session cookies — once.
 *
 * Sessions created before the cookie became host-only still carry
 * Domain=.storelib.com, which means every published site can still read
 * them. Rewriting the app is not enough on its own: the old cookie sits in
 * the browser until something expires it, so this does.
 *
 * IT MUST NOT LOG ANYBODY OUT. The value is written back host-only in the
 * same response, so the browser ends up holding exactly one cookie with the
 * same session in it. Raw `Set-Cookie` headers rather than
 * `response.cookies.set`, because that API is keyed by name and would
 * overwrite the host-only cookie we just wrote instead of adding a second
 * directive beside it.
 *
 * ONCE, and this is the reason for the marker. A request cannot tell which
 * domain an incoming cookie was set for — the browser sends name and value
 * and nothing else — so without a marker this re-issues every auth cookie on
 * every response for the rest of the deployment's life: several hundred
 * wasted bytes on every navigation, and a Set-Cookie on responses that had no
 * business carrying one. The marker is host-only, so it is written on the
 * same host whose cookies were just fixed.
 */
/**
 * A PUBLISHED SITE MAY NOT ACT AS ITS VISITOR.
 *
 * ---------------------------------------------------------------------------
 *  THE HOLE THIS CLOSES, AND WHY IT OPENED
 * ---------------------------------------------------------------------------
 * Sites are published at <slug>.storelib.com, which is the SAME SITE as
 * storelib.com in the cookie sense — same registrable domain. `SameSite=Lax`
 * only blocks requests from a different site, so it does not block these.
 *
 * That means JavaScript on any published page could do
 *
 *     fetch("https://storelib.com/api/…", { method: "POST", credentials: "include" })
 *
 * and the browser would attach the visitor's session cookie. CORS stops the
 * page READING the reply, which is worth nothing here: by then the write has
 * already happened as that person. None of this repository's 122 mutating
 * routes checks where a request came from, so every one of them was reachable
 * this way.
 *
 * While sites lived on a separate registrable domain, SameSite=Lax was the
 * thing that made this impossible. Moving them to a subdomain removed that
 * protection, so it is replaced here rather than assumed.
 *
 * ---------------------------------------------------------------------------
 *  WHY IT IS A DENY-LIST, AND WHY THAT IS THE SAFE SHAPE HERE
 * ---------------------------------------------------------------------------
 * Refusing everything but the apex would break callers that legitimately have
 * no Origin or a different one: Stripe's webhooks send none, the Capacitor
 * app sends capacitor://localhost, and a creator's custom domain sends its
 * own name while serving pages this app rendered. Guessing at that list is
 * how a payment webhook starts failing at 2am.
 *
 * The set being refused is exact and closed instead: a storelib.com
 * subdomain, which since the move is a published site and nothing else. No
 * page this application serves has such an origin.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"])

function isPublishedSiteOrigin(origin: string | null): boolean {
  if (!origin) return false
  let host: string
  try {
    host = new URL(origin).hostname.toLowerCase()
  } catch {
    // An Origin we cannot parse is not one we can clear, but it is also not
    // the specific thing this guard is for. Left to the routes.
    return false
  }
  if (!host.endsWith(`.${MAIN_DOMAIN}`)) return false

  const subdomain = host.slice(0, -(MAIN_DOMAIN.length + 1))
  // The reserved names are the platform's own surfaces, not published sites.
  return !EXCLUDED_SUBDOMAINS.includes(subdomain)
}

const HOST_ONLY_MARKER = "sb-host-only"

function retireDomainScopedCookies(response: NextResponse, request: NextRequest): void {
  if (MAIN_DOMAIN.includes("localhost")) return
  if (request.cookies.has(HOST_ONLY_MARKER)) return

  // The marker's own name begins with "sb-", so it is excluded explicitly
  // rather than by a prefix that happens to match it.
  const auth = request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-") && c.name !== HOST_ONLY_MARKER)
  if (auth.length === 0) return

  for (const cookie of auth) {
    /**
     * THE RE-ISSUE IS CONDITIONAL, and both conditions are bugs that were
     * caught by watching real response headers rather than reading this.
     *
     * Supabase's own handler runs first and mutates `request.cookies` — so by
     * the time this runs, an invalid or signed-out session reads back as an
     * EMPTY value. Writing that produced `sb-…-auth-token=` with no expiry:
     * an empty cookie sat where the response had just deleted one, which at
     * best is litter and at worst fights a sign-out.
     *
     * And when the response is already setting this cookie, it is setting it
     * host-only (see the writer below), so re-issuing it here would only
     * overwrite a fresher value with a staler one.
     */
    const alreadySet = response.cookies.get(cookie.name) !== undefined
    if (cookie.value && !alreadySet) {
      /**
       * MAX-AGE IS NOT OPTIONAL HERE.
       *
       * A Set-Cookie with no Max-Age and no Expires is a SESSION cookie. The
       * cookie being replaced is persistent, so omitting it quietly downgraded
       * every existing login to "signed out when you close the browser" —
       * once, during the migration, for everybody. Confirmed in Chromium:
       * the re-issued cookie came back with expires = -1.
       *
       * The value carries Supabase's own tokens, and their lifetime is
       * enforced server-side when they are presented — so a long cookie
       * lifetime grants no extra access, it only stops the browser throwing
       * away a session that is still good. Supabase's writer replaces this
       * with its own options on the next refresh anyway; this only has to
       * survive until then.
       *
       * 400 days because that is the ceiling browsers enforce on cookie
       * lifetime; asking for more is silently clamped to it.
       */
      response.headers.append(
        "Set-Cookie",
        `${cookie.name}=${cookie.value}; Path=/; Max-Age=34560000; Secure; SameSite=Lax`,
      )
    }

    // The expiry is UNCONDITIONAL. This is the whole point of the function:
    // the domain-scoped copy is the one every published site can read, and it
    // has to go whether or not the session is still good.
    response.headers.append(
      "Set-Cookie",
      `${cookie.name}=; Domain=.${MAIN_DOMAIN}; Path=/; Max-Age=0; Secure; SameSite=Lax`,
    )
  }

  // A year, because the migration is finished for this browser once the old
  // cookie is gone and there is nothing left to re-check.
  response.headers.append(
    "Set-Cookie",
    `${HOST_ONLY_MARKER}=1; Path=/; Max-Age=31536000; Secure; SameSite=Lax`,
  )
}

/**
 * First segments that are routes rather than creator handles.
 *
 * Mirrors app/(marketing)/[sellername]/[productSlug]. It is here so the
 * framing rule below cannot be talked into treating /app/settings as a
 * product page.
 *
 * THIS LIST HAS TO BE COMPLETE, and it was not. When the creator page moved
 * to a single segment the framing rule had to start asking "is one segment a
 * handle", which is the same question at the depth where every top level
 * route on the site lives. Nineteen of them were missing from this list —
 * /checkout, /reset-password, /downloads, /purchase, /receipt and /access
 * among them — and each would have become framable by anything on our own
 * origin, which includes the HTML a creator writes in the code editor. A
 * password reset form in a frame a creator controls is a clickjacking setup,
 * not a small stake.
 *
 * tests/creator-page.test.ts walks app/ and fails if a top level route is
 * missing from here, so adding a route is enough; nobody has to remember
 * this file exists.
 */
const FRAME_RESERVED_FIRST_SEGMENT = new Set([
  "access", "account", "account-deletion", "admin", "alternatives", "api", "app", "auth", "blog", "c",
  "checkout", "community", "cover-render", "creator-page", "dashboard", "developers", "downloads", "editions", "explore",
  "faq", "features", "help", "l", "legal", "library", "llms-full.txt", "llms.txt", "login", "member", "native-start",
  "onboarding", "onepage-preview", "order-help", "p", "pay", "payouts-sheet", "pricing", "privacy", "products", "purchase", "receipt",
  "register", "request", "reset-password", "review", "sell", "signup", "site", "sitemap", "sitemap.xml", "sites", "store",
  "store-builder", "stripe-done", "team", "terms", "theme-preview", "themes", "u", "unsubscribe", "upgrade", "verify-email",
  "w", "website-builder", "welcome", "wishlist",
])

export async function proxy(request: NextRequest) {
  /*
    ONE ID PER REQUEST (lib/net/request-id.ts): forwarded to the page or route as x-request-id, so its log lines
    carry it (lib/net/log.ts), and sent back on the response, so a person's failed load can be found in the logs.
  */
  const rid = requestIdOf(request.headers)
  try {
    request.headers.set(REQUEST_ID_HEADER, rid)
  } catch {
    /* Headers this runtime will not change: the response still carries it. */
  }
  const res = forgetStaleCountry(request, await routeRequest(request))
  try {
    res.headers.set(REQUEST_ID_HEADER, rid)
    /*
      A PRIVATE ADDRESS ON storelib.com SAYS NOINDEX IN ITS OWN ANSWER (round 45,
      lib/seo/indexing.ts privatePlatformPath): the checkout, a receipt, the app,
      logging in. Here, after the routing, so a redirect, a route handler and a
      page added under one of those routes later all carry it. An answer that
      already says something about robots keeps its own.
    */
    if (onStorelibHost(request.headers.get("host")) && privatePlatformPath(request.nextUrl.pathname) && !res.headers.has("X-Robots-Tag")) {
      res.headers.set("X-Robots-Tag", PRIVATE_ROBOTS_HEADER)
    }
  } catch {
    /* an immutable response: it goes without the id */
  }
  return res
}

/*
  A SIGN IN REDIRECT IS THIS VISITOR'S ANSWER. /app and /sell answer a
  stranger with a 307 to /login or /signup, and a signed in person with the
  page: the same address, two answers decided from the session cookie. With
  no Cache-Control of its own, Vercel sent the redirect as
  "public, max-age=0, must-revalidate", which allows a shared cache to keep
  it. Said outright now, as every other per visitor answer here says it.
*/
const SIGNED_OUT_REDIRECT_CACHE = "private, no-store"

/** storelib.com or www.storelib.com: where the private addresses are Storelib's own. */
function onStorelibHost(host: string | null): boolean {
  const bare = (host || "").split(":")[0].toLowerCase()
  return bare === MAIN_DOMAIN || bare === `www.${MAIN_DOMAIN}`
}

async function routeRequest(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  /* An Explore category that does not exist is a 404 from here (lib/explore/category-pages.ts unknownExploreCategory): /explore's loading screen would have sent a 200 first. */
  if (onStorelibHost(request.headers.get("host")) && unknownExploreCategory(pathname)) {
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 })
  }
  const host = request.headers.get("host") || ""

  /*
    A TRAILING SLASH, AND www WITH IT, IN ONE 308 (lib/seo/one-hop.ts).
    next.config sets skipTrailingSlashRedirect, so Next no longer answers
    /pricing/ before this runs; this does, first, as Next did, and on
    www.storelib.com straight to the apex rather than in two hops.
  */
  const slashHop = trailingSlashHop(host, pathname, search, MAIN_DOMAIN)
  if (slashHop) return NextResponse.redirect(new URL(slashHop.location, request.nextUrl.href), slashHop.status)

  /*
    A STRANGER'S COPY OF AN IMPORTED THEME'S PAGE is held by the CDN at a
    marked address only this proxy rewrites to (compatRewrite,
    lib/storelib-theme/compat/anonymous-cache.ts). Typed straight at the API,
    on any host, it is refused here, before any cache is asked.
  */
  if (markedThemeAddress(pathname)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })

  /* A public file at Storelib's own address (lib/storage/media-url.ts): on every host, straight to next.config's rewrite, never a page of a site. */
  if (pathname.startsWith("/media/")) return NextResponse.next()
  /*
    MOST CSP REPORTS ARE ANSWERED HERE, NOT BY A FUNCTION. The report only
    policy in vercel.json is on every page of every host, and each browser
    that sees a violation posts it to /api/csp-report: one function call per
    report, nearly all of them the same few lines. One in twenty
    (CSP_REPORT_SAMPLE_RATE, lib/security/csp.ts) goes on to the route and is
    logged; the rest get the route's own answer, 204, from here. A browser
    does nothing with the answer either way.
  */
  if (pathname === CSP_REPORT_PATH && request.method === "POST" && !keepsCspReport(Math.random())) {
    return new NextResponse(null, { status: 204 })
  }
  /*
    A PAGE ASKED FOR AS A PICTURE, A SCRIPT OR A FONT IS NOT RENDERED. A
    theme that wrote a country's code where its flag goes (src="DJ") had
    every visitor's browser ask for /DJ, /GQ, /KP... as images: 250 whole
    website renders per page view, every one reading the database, until
    the database timed out and Storelib with it. Nothing a page renders can
    be a picture, so such a request answers 404 at once, cached, without
    touching a page, whatever the cause next time.
  */
  if (pageAskedAsSubresource(request.headers.get("sec-fetch-dest"), pathname)) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, max-age=3600", "X-Storelib-Guard": "subresource" } })
  }
  /* Apple Pay's domain file (public/.well-known), which Apple fetches from every host a checkout runs on, a creator's own domain too: the file, never a page of a site. */
  if (pathname === "/.well-known/apple-developer-merchantid-domain-association") return NextResponse.next()

  /*
    THE HELP CENTER LIVES AT help.storelib.com. Its pages are app/help; on
    that host a path is the Help Center's own (help.storelib.com/orders-and-
    payouts is /help/orders-and-payouts), and a link written /help/... still
    works. Files and Next's own requests pass as they are. On storelib.com
    itself, /help answers a 308 to the same page there, the query kept.
  */
  const helpHost = `help.${MAIN_DOMAIN}`
  const bareHost = host.split(":")[0].toLowerCase()
  if (bareHost === helpHost) {
    const isFile = /\.[a-z0-9]{2,5}$/i.test(pathname)
    if (pathname.startsWith("/_next") || pathname.startsWith("/api/") || isFile) return NextResponse.next()
    /* An old help.storelib.com/help/... address: the same page without /help, so the bar never reads help.storelib.com/help. */
    if (pathname === "/help" || pathname.startsWith("/help/")) {
      return NextResponse.redirect(new URL(`https://${helpHost}${pathname.slice("/help".length) || "/"}${search}`), 308)
    }
    /* storelib.com's own pages (the dashboard, login, Explore, a buyer's library) asked for here: sent home, never a Help Center 404. */
    if (/^\/(?:app|login|signup|auth|explore|library|account|checkout|settings|admin|p|u|c|community|pricing|sell)(?:\/|$)/.test(pathname)) {
      return NextResponse.redirect(new URL(`https://${MAIN_DOMAIN}${pathname}${search}`), 307)
    }
    const url = request.nextUrl.clone()
    url.pathname = pathname === "/" ? "/help" : `/help${pathname}`
    return NextResponse.rewrite(url)
  }
  if ([MAIN_DOMAIN, `www.${MAIN_DOMAIN}`].includes(bareHost) && !MAIN_DOMAIN.startsWith("localhost") && (pathname === "/help" || pathname.startsWith("/help/")) && !/\.[a-z0-9]{2,5}$/i.test(pathname)) {
    const rest = pathname.slice("/help".length)
    return NextResponse.redirect(new URL(`https://${helpHost}${rest || "/"}${search}`), 308)
  }

  /*
    A COMMUNITY PAGE IS TOLD ITS OWN ADDRESS. A layout is not given its path,
    and the community's layout needs it to send an old address on to the new
    one with the rest of the path and the query (lib/communities/slug-move.ts).
    Written for every /community/ and /app/community/ request (the owner's
    screens send a community's old id on to its readable address the same
    way), so whatever a visitor sends under that name is replaced; no
    lookup, nothing else reads it.
  */
  /* Round 13: the Classroom is Learn. Its old addresses answer a 308 to the same place under /learn, the query kept (lib/communities/learn.ts). */
  const learn = pathname.startsWith("/community/") && pathname.includes("/classroom") ? learnAddressFor(pathname) : null
  if (learn) return NextResponse.redirect(new URL(`${learn}${search}`, request.url), 308)
  if (pathname.startsWith("/community/") || pathname.startsWith("/app/community/")) request.headers.set(COMMUNITY_PATH_HEADER, `${pathname}${search}`)
  /* And a profile, for the same reason: a creator's /@handle answers a 308 to their page with the query kept, from its layout (lib/profile/profile-redirect.ts). */
  if (isProfilePath(pathname)) request.headers.set(PROFILE_PATH_HEADER, `${pathname}${search}`)

  /* mcp.storelib.com is the MCP server, before any rule about sites or redirects. See lib/agent-access/mcp-host.ts. */
  const mcp = mcpHostRoute(bareHost, pathname, MAIN_DOMAIN)
  if (mcp?.kind === "rewrite") return NextResponse.rewrite(new URL(`${mcp.path}${search}`, request.url))
  if (mcp?.kind === "not-found") {
    return NextResponse.json({ error: "This is Storelib's MCP server. Connect to https://mcp.storelib.com" }, { status: 404 })
  }

  /**
   * ── The IndexNow key, on every host ──────────────────────────────────────
   * IndexNow (lib/seo/indexnow.ts) proves a site is ours by a text file at
   * the root of each host whose pages it announces, holding the key. The key
   * is public by design. Answered here, before any other rule, so the same
   * one line serves storelib.com, every <name>.storelib.com and every
   * connected domain. Nothing is served while INDEXNOW_KEY is unset.
   */
  const indexNowKey = process.env.INDEXNOW_KEY
  if (indexNowKey && /^[A-Za-z0-9-]{8,128}$/.test(indexNowKey) && pathname === `/${indexNowKey}.txt`) {
    return new NextResponse(indexNowKey, {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    })
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  storelib.me IS THE ONEPAGE'S HOST, AND THE OLD ONEPAGE ADDRESSES GO THERE
   * ═══════════════════════════════════════════════════════════════════════════
   * Decided by lib/onepage/host-route (pure, and pinned case by case in
   * tests/onepage-host.test.ts), and done here BEFORE anything else reads the
   * request: storelib.me is not a creator's connected domain, so the
   * custom-domain rule below would otherwise send it to www.storelib.me, a
   * host that does not exist, which is exactly what production answered.
   *
   * Nothing below this block runs for storelib.me. No Supabase client is
   * made, no session is read or renewed and no cookie is written: the host
   * serves public pages and the handful of calls they make, and a session
   * has no business on it.
   */
  const onePage = onePageRoute({
    host,
    pathname,
    search,
    method: request.method,
    userAgent: request.headers.get("user-agent"),
    mainDomain: MAIN_DOMAIN,
    sitesDomain: SITES_DOMAIN,
    platformSubdomains: EXCLUDED_SUBDOMAINS,
  })
  if (onePage) {
    switch (onePage.kind) {
      case "next":
        return NextResponse.next()
      case "rewrite":
        return NextResponse.rewrite(new URL(onePage.path, request.url))
      case "redirect": {
        /* An old address goes straight to where the page is now (oldOnePageTarget above). */
        const target = onePage.onePage ? await oldOnePageTarget(onePage.onePage, onePage, search) : null
        const { location, status } = target ?? onePage
        const to = NextResponse.redirect(location, { status })
        /* A permanent move may be held by the edge; a temporary one (the root, a creator with no OnePage yet) may not. */
        to.headers.set("Cache-Control", status === 307 ? "no-store" : "public, max-age=3600")
        /*
          What the lookup answered (page, moved, creator, missing) or why there
          was none (failed, slow, no-database), so a redirect that looks wrong
          on production can be read from its headers. Says nothing a visitor
          could not learn from following it.
        */
        if (target) to.headers.set("X-OnePage-Address", target.answer)
        return to
      }
      case "robots":
        return new NextResponse(onePage.body, {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        })
      case "not-found": {
        if (onePage.api) {
          return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } })
        }
        /* The page's own small not found (app/(marketing)/l/[slug]/not-found), answered 404, never indexed. */
        const missing = NextResponse.rewrite(new URL(onePage.path, request.url))
        missing.headers.set("X-Robots-Tag", "noindex")
        return missing
      }
    }
  }

  /*
    STORELIB'S OWN /favicon.ico, passed on as it was before the matcher let it
    in: no session, no lookup. A website's host answers its own, below.
  */
  if (pathname === SITE_ICON_PATH && (bareHost === MAIN_DOMAIN || bareHost === "www." + MAIN_DOMAIN || bareHost.startsWith("localhost"))) {
    return NextResponse.next()
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   *  AN API CALL IS NOT A PAGE VIEW, AND MUST NOT BE REDIRECTED FOR TIDINESS
   * ═══════════════════════════════════════════════════════════════════════════
   * THIS KILLED EVERY CRON JOB ON THE PLATFORM, and found by reading the logs:
   *
   *   10:00:37 GET /api/cron/process-scheduled-emails 301 [serverless-middleware]
   *   09:00:37 GET /api/cron/process-scheduled-emails 301 [serverless-middleware]
   *   08:00:37 GET /api/cron/process-scheduled-emails 301 [serverless-middleware]
   *
   * every hour, for as long as the logs go back, and never a line from the
   * route itself. The redirect below is the reason.
   *
   * Vercel invokes a cron on the PROJECT'S OWN DEPLOYMENT HOST, which for this
   * project is v0-materia-mvp-build-…vercel.app. The canonicalisation further
   * down treats any host that is not storelib.com and not a subdomain of it as
   * a creator's custom domain, and sends it to `www.` — so the cron was
   * answered with a 301 to `www.v0-materia-mvp-build-…vercel.app`, a host
   * that does not exist, and the function never ran. Scheduled flow emails,
   * payout holds, the daily analytics rollup and the attachment purge have all
   * been silently skipped.
   *
   * A host redirect is an SEO and session-hygiene device and belongs to PAGES.
   * An API call gains nothing from a canonical host and loses a great deal: a
   * 301 also rewrites a POST into a GET, so any webhook pointed at the wrong
   * spelling of the host arrives as an empty GET rather than failing loudly.
   *
   * So nothing under /api is canonicalised, on any host. The routes that care
   * who is calling check for themselves — the cron checks CRON_SECRET, the
   * admin checks its cookie, Stripe checks its signature — and none of them
   * can do that if the request is turned away at the door.
   */
  const isApiCall = pathname === "/api" || pathname.startsWith("/api/")

  /**
   * ── One host holds the session ────────────────────────────────────────────
   *
   * www is redirected to the apex before anything reads a cookie. With
   * host-only cookies, www.storelib.com and storelib.com would otherwise each
   * hold a SEPARATE session — sign in on one and you are a stranger on the
   * other, which reads as a broken login rather than a redirect somebody
   * forgot.
   */
  /* 308, like every other permanent redirect here: a 301 lets a client turn a POST into a GET. */
  if (!isApiCall && bareHost === `www.${MAIN_DOMAIN}`) {
    const hop = wwwHop(pathname, search, MAIN_DOMAIN)
    return NextResponse.redirect(new URL(hop.location), { status: hop.status })
  }

  /*
    ── The OnePage's old addresses ───────────────────────────────────────
    `/l/{slug}` and `/{handle}/links` answer with a 308 to
    storelib.me/{slug}, decided in the OnePage block above
    (lib/onepage/host-route), or to wherever the name leads now: a renamed
    page's new address, or a creator page when there is no OnePage
    (oldOnePageTarget). A slug that cannot be a name falls through to the
    /l/ route, which answers its not found.
  */

  /**
   * ── One address for a creator's page ──────────────────────────────────────
   *
   * `storelib.com/<handle>` is the creator page and `<handle>.storelib.com`
   * is the website they built. Neither carries a prefix, and `/u/<handle>` is
   * the old spelling of the first one.
   *
   * It keeps working for ever — shared links, bookmarks and everything a
   * search engine has already indexed — by redirecting here, permanently, so
   * the two spellings consolidate onto one rather than competing as duplicate
   * content. 308 rather than 301 so a POST is not silently turned into a GET.
   *
   * IT MUST BE SCOPED TO THE MAIN DOMAIN, and that is the whole subtlety. The
   * subdomain branch below REWRITES `<handle>.storelib.com` to `/u/<handle>`
   * internally when a creator has no published website. A redirect written
   * without this guard would catch that rewrite and bounce every one of those
   * visitors to the apex, so the subdomain would stop serving anything.
   * `request.nextUrl.pathname` here is still what the BROWSER asked for,
   * because this runs before any rewriting.
   */
  if (bareHost === MAIN_DOMAIN && (pathname === "/u" || pathname.startsWith("/u/"))) {
    const handle = pathname.slice(3)
    /* `/u` and `/u/` alone are not a creator; they belong to the platform. */
    if (handle) {
      const to = request.nextUrl.clone()
      to.pathname = `/${handle}`
      return NextResponse.redirect(to, { status: 308 })
    }
  }

  /**
   * ── Published sites ───────────────────────────────────────────────────────
   *
   * FIRST, before anything else touches the request. Nothing below this point
   * should ever run for a visitor to somebody's published website: not the
   * Supabase session read, not the native app gate. A stranger reading a
   * static page must not cost a session lookup, and the dashboard's cookie
   * handling must never run on a request serving generated code.
   *
   *   andrewrullz.storelib.com/      → /site/andrewrullz
   *   andrewrullz.storelib.com/about → /site/andrewrullz/about
   *
   * A subdomain that is NOT a published site is not a dead end: the route
   * looks for a creator with that username and sends them to
   * storelib.com/<name>, so links to the old creator subdomains keep working.
   */
  if (bareHost.endsWith(`.${SITES_DOMAIN}`)) {
    const subdomain = bareHost.slice(0, -(SITES_DOMAIN.length + 1))

    // Multi-level (a.b.storelib.com) is nobody's site, and the reserved
    // names below are the platform's own.
    if (!subdomain.includes(".") && !EXCLUDED_SUBDOMAINS.includes(subdomain)) {
      const url = request.nextUrl.clone()
      /* A made up server action posted at a site: refused before any lookup or render (lib/website-builder/site-action-guard.ts). */
      if (refusesSiteAction(request.method, request.headers)) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store", "X-Storelib-Guard": SITE_ACTION_GUARD } })
      /**
       * ═══════════════════════════════════════════════════════════════════════
       *  WHICH OF TWO THINGS A SUBDOMAIN IS
       * ═══════════════════════════════════════════════════════════════════════
       * `<name>.storelib.com` is either an AI-built site (files in storage,
       * served by /site) or the website a creator built in the website
       * builder (a theme install, rendered by /w). The name alone cannot say
       * which, so a page request asks: is there a live AI deployment under
       * this name? If not, this is a website-builder address and goes to
       * /w, which serves the published site from its cache — and, for a
       * creator with nothing published, sends the visitor to their creator
       * page at storelib.com/<name> rather than to a "coming soon".
       *
       * PAGES ONLY. An AI site's assets (`/_vendor/…`, its own files) ask
       * every request, and one database read per script tag is not a cost
       * the site handler should carry. A request with a file extension is an
       * asset and goes straight to /site as before; a website-builder site's
       * own assets are Next's, under reserved paths, and never come here.
       */
      /**
       * ═══════════════════════════════════════════════════════════════════════
       *  WHAT ON A SITE IS NOT THE SITE
       * ═══════════════════════════════════════════════════════════════════════
       * Everything under this host was treated as a page of the creator's
       * website, which is wrong for two kinds of path and broke both:
       *
       *   /api/…       the site's own forms post here. The newsletter
       *                section posts to /api/website-builder/subscribe, and
       *                on a published site that was rewritten to
       *                /w/<name>/api/… and answered 404 — so the form that
       *                says "you're subscribed" could not have been.
       *                Served here, on this host, like any other API call.
       *
       *   /checkout…   the Buy button goes to /checkout?productId=…, and a
       *                purchase needs the session, which is host-only and
       *                lives on the apex. Sent there rather than rendered on
       *                a host where the visitor is a stranger.
       *
       * Both lists are short and unambiguous on purpose: every other name is
       * a page a creator may make, and taking "pricing" or "library" away
       * from them to reserve it for the platform is a worse trade than the
       * collision it avoids.
       */
      if (pathname === "/api" || pathname.startsWith("/api/")) return NextResponse.next()
      /* A Storelib Reviews request link: its own page, on the website's host (app/review/[token]). */
      if (pathname.startsWith("/review/")) return NextResponse.next()
      /* A buyer's conversation with the shop about an order: its own page, on the website's host, where its emails send the buyer (app/order-help, lib/support/cases-server.ts). */
      if (pathname.startsWith("/order-help/")) return NextResponse.next()
      /*
        THE WEBSITE'S OWN ICON (round 41): /favicon.ico, /apple-touch-icon and
        /site.webmanifest are the website's (app/(site)/w/[username]), never
        Storelib's, on the subdomain as on its domain. A live AI site keeps
        its own files.
      */
      if (isSiteIconPath(pathname)) {
        const ai = await liveAiSiteAnswer(subdomain)
        if (ai === "unavailable") return siteUnavailable()
        if (ai) return NextResponse.rewrite(new URL(`/site/${subdomain}${pathname}${search}`, request.url))
        return NextResponse.rewrite(new URL(`/w/${subdomain}${pathname}${search}`, request.url))
      }
      /*
        Every question this page asks below, started together
        (startSiteQuestions), and before the domain question rather than
        after it: they need nothing it answers, and waiting for it put two
        more round trips in a row before a subdomain's page. A page sent on
        to the website's domain leaves them unread, held for its next visit.
      */
      const gateAsked = startSiteQuestions(request, subdomain, host, pathname, search, false)
      gateAsked?.catch(() => null)
      /* A website with its own domain connected is at that domain: a page opened at the Storelib address is sent there (lib/custom-domains/subdomain-redirect.ts). */
      if (sendsToDomain({ method: request.method, pathname, search, fetchDest: request.headers.get("sec-fetch-dest") })) {
        const domain = await websiteDomainOf(subdomain)
        if (domain) return NextResponse.redirect(domainAddress(domain, pathname, search), { status: 302 })
      }
      /*
        WHICH RENDERER, OR "ONE MOMENT" (SITE-8). Every line below picks the
        renderer from these two answers. A server that holds neither and
        cannot read them (a cold one while the database is away) used to
        take both as "no" and draw an AI site or an imported theme with the
        Storelib theme renderer. It says try again instead; an answer held
        from before is still used as it was.
      */
      const [aiKnown, compatKnown] = await Promise.all([
        liveAiSiteAnswer(subdomain),
        compatAnswers(pathname, request) ? compatSiteAnswer(subdomain, asksFresh(request)) : Promise.resolve<SiteAnswer>(false),
      ])
      if (aiKnown === "unavailable" || compatKnown === "unavailable") return siteUnavailable()
      /*
        AND ITS SITEMAP. It lists the domain's addresses (the canonical ones),
        which a search engine refuses in a sitemap on another host. So the
        Storelib address's /sitemap.xml goes to the domain's, the way its
        pages do; its robots.txt already names that one.
      */
      if (pathname === "/sitemap.xml" && (request.method === "GET" || request.method === "HEAD") && !(await hasLiveAiSite(subdomain))) {
        const domain = await websiteDomainOf(subdomain)
        if (domain) return NextResponse.redirect(domainAddress(domain, pathname, search), { status: 302 })
      }
      /* An imported Shopify theme answers its own addresses, its cart's /cart.js and /checkout included. */
      if (compatAnswers(pathname, request) && (await compatSiteFor(subdomain, asksFresh(request))) && !(await hasLiveAiSite(subdomain))) {
        return compatRewrite(request, subdomain, host, pathname, search)
      }
      /* Shopify's address for a policy, on a site of Storelib's own: the same policy at Storelib's. */
      const policyAt = policyAddress(pathname)
      if (policyAt) return NextResponse.redirect(new URL(`${policyAt}${search}`, request.url), { status: 308 })
      /*
        /links ON A SUBDOMAIN was the address the Share card once handed out,
        and the website answered it with a 404. It is sent to the OnePage,
        storelib.me/{name}, by the OnePage block at the top of this function
        (lib/onepage/host-route), before this branch is reached; to the
        page's new address after a rename, and to the creator page for a
        creator with no OnePage (oldOnePageTarget).
      */
      /* The website's checkout, its thank you page and its receipts, on this host (siteCheckoutFor). A live AI site keeps the platform's. */
      if ((pathname.startsWith("/checkout") || pathname.startsWith("/receipt")) && !(await hasLiveAiSite(subdomain)) && (await hasPublishedWebsite(subdomain))) {
        const checkout = await siteCheckoutFor(request, subdomain, host, pathname, search)
        if (checkout) return checkout
      }
      if (PLATFORM_APEX_PATHS.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
        const apex = new URL(`https://${MAIN_DOMAIN}`)
        apex.pathname = pathname
        apex.search = search
        // 307: the method and body survive, which a POST to checkout needs.
        return NextResponse.redirect(apex, { status: 307 })
      }

      const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(pathname)
      /**
       * A SITE'S OWN robots.txt AND sitemap.xml. They look like files, so
       * they went to the file handler and answered 404, and a creator's site
       * had no sitemap at all. The website answers them itself
       * (app/(site)/w/[username]/robots.txt, sitemap.xml); a live AI site
       * keeps serving (or generating) its own.
       */
      const seoFile = pathname === "/robots.txt" || pathname === "/sitemap.xml"
      const isWebsite = (!looksLikeFile || seoFile) && !(await hasLiveAiSite(subdomain))

      /**
       * ═══════════════════════════════════════════════════════════════════
       *  THE OLD `?preview=` LINKS, SENT ON TO THE ADDRESS PREVIEWS HAVE NOW
       * ═══════════════════════════════════════════════════════════════════
       * A preview used to be a query string on the public page, which meant
       * the public page had to read `searchParams` — and a route that reads
       * `searchParams` is rendered again for every visitor, forever. Moving
       * the token into the path is what lets the published page be held at
       * the edge at all.
       *
       * Links already sent out are still in the old shape, so they are sent
       * here rather than broken. A redirect, not a rewrite: the address bar
       * should end up showing the one that will keep working.
       */
      if (isWebsite && !pathname.startsWith("/preview/")) {
        const legacy = previewTokenFrom(url.searchParams)
        if (legacy) {
          const rest = pathname === "/" ? "" : pathname
          const to = new URL(request.url)
          to.pathname = `/preview/${legacy}${rest}`
          to.searchParams.delete("preview")
          return NextResponse.redirect(to, 308)
        }
      }

      /* A website that asks for a password shows its password page to a visitor without a pass (lib/site-password/gate.ts). */
      let guarded = false
      if (isWebsite && !looksLikeFile) {
        const gate = await (gateAsked ?? passwordPageFor(request, subdomain, host, pathname, search))
        if (gate.blocked) return gate.blocked
        guarded = gate.protected
      }

      /* A market's own language on a visitor's first page (marketLanguageStart). */
      const started = isWebsite && !seoFile && !looksLikeFile ? await marketLanguageStart(request, subdomain, pathname) : null
      if (started) return started
      /* The visitor's own language: there once, or offered (visitorLanguageStart). */
      const own = isWebsite && !seoFile && !looksLikeFile ? await visitorLanguageStart(request, subdomain, pathname) : null
      if (own && "redirect" in own) return own.redirect
      /* /fr/about: the page in French, or /fr/cart on to /cart (inSiteLanguage). */
      const inLanguage = isWebsite && !seoFile && !looksLikeFile ? await inSiteLanguage(subdomain, pathname, request) : null
      if (inLanguage?.kind === "redirect") return NextResponse.redirect(new URL(`${inLanguage.to}${search}`, request.url), { status: 307 })
      /* The shop or a collection asked for a filter, a sort or a page: its per request twin; without one, the held page (lib/website-builder/held-list.ts). */
      url.pathname = isWebsite
        ? heldListPath(inLanguage?.kind === "page" ? inLanguage.path : `/w/${subdomain}${pathname === "/" ? "" : pathname}`, url.searchParams)
        : `/site/${subdomain}${pathname === "/" ? "" : pathname}`
      const rewritten = offerLanguage(NextResponse.rewrite(url), own && "suggest" in own ? own.suggest : null)

      /**
       * THE LANDING PAGE'S CACHE RULE WAS EATING EVERY SITE HOMEPAGE.
       *
       * `headers()` in next.config matches the path the BROWSER asked for, and
       * on drew.storelib.com that path is `/` — which has a rule meant for the
       * marketing site: `public, s-maxage=3600, stale-while-revalidate=7200`.
       * Config headers win over the ones a route handler sets, so every
       * published homepage was edge-cached for an hour and served stale for two
       * more after that. Up to three hours of "I published and nothing
       * changed", and it silently defeated the ten-second window the site route
       * asks for.
       *
       * This is the same trap that already caught storefronts — see the
       * `/u/` rewrite below, which carries the same comment. The rewrite is the
       * only place that knows this request is a site, so the header belongs
       * here.
       *
       * Only the homepage needs it: `/` is the one config source a site path
       * can collide with, and matching the route's own value keeps the two
       * from drifting apart. Assets keep the route's immutable caching, which
       * is what makes a version-stamped bundle worth stamping.
       *
       * SIXTY, to match `revalidate = 60` on the route. It used to say ten,
       * which was harmless while the page was dynamic — Next's own no-store
       * overrode it and nothing here landed at all. Now that the page is
       * cacheable this header is the one the edge obeys on the homepage, so
       * the two numbers have to be the same one or the front page and every
       * page under it go stale on different clocks.
       */
      /* Not when the page is drawn in the visitor's market's currency: that answer is theirs, never a shared cache's. */
      if (pathname === "/" && !(inLanguage?.kind === "page" && /~m-/.test(inLanguage.path))) {
        rewritten.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
      }
      if (inLanguage?.kind === "page" && /~m-/.test(inLanguage.path)) rewritten.headers.set("Cache-Control", "private, no-cache")
      /* Let in with a pass: this answer is this visitor's, never one for a shared cache to hand on. */
      if (guarded) rewritten.headers.set("Cache-Control", "private, no-store")
      selfFramedWishlist(rewritten, request)

      return rewritten
    }
  }

  /**
   * Everything below serves the application. A request arriving here from a
   * published site is the forgery described above, and it is refused before
   * any session is read or any route runs.
   *
   * TWO CHECKS, BECAUSE ONE HEADER DOES NOT SEE EVERYTHING.
   *
   * `Origin` is sent on writes — fetch, form posts, sendBeacon — and names
   * the page that made them. It is NOT sent on a plain subresource GET, so a
   * published page could still reach the API with
   *
   *     <img src="https://storelib.com/api/…">
   *
   * which the browser loads with the visitor's cookies attached and which no
   * Origin check can see. That matters because a number of GET handlers in
   * this repository create or update rows — lazy initialisation, tracking
   * pixels, download counters — so "GET does not mutate" is not true here and
   * is not something to assume on somebody else's behalf.
   *
   * `Sec-Fetch-Site: same-site` is what a subdomain-to-apex request looks
   * like, and since sites moved onto subdomains there is no other kind: the
   * dashboard is `same-origin`, a creator's custom domain is `cross-site`,
   * and a typed URL is `none`. Refusing exactly `same-site` on /api therefore
   * refuses published sites and nothing else. Browsers too old to send the
   * header fall through to the Origin check, which is the same posture the
   * rest of this guard takes.
   */
  const secFetchSite = request.headers.get("sec-fetch-site")
  const isApi = pathname.startsWith("/api/")

  /**
   * Where a Site API would live if one is built — a published page calling a
   * deliberately public endpoint with no session behind it. Nothing serves
   * this prefix today; it is named here so that work does not begin by
   * fighting this guard and quietly widening it.
   */
  const isPublicApi = pathname.startsWith("/api/public/")
  /* The Help Center (help.storelib.com, a reserved name no site can take) asks who is signed in and can log out: those two only, from that origin only. */
  const fromHelpCenter = (pathname === "/api/help/me" || pathname === "/api/help/logout") && request.headers.get("origin") === `https://help.${MAIN_DOMAIN}`

  if (isApi && !isPublicApi && !fromHelpCenter && secFetchSite === "same-site") {
    return new NextResponse(
      JSON.stringify({ error: "Requests from published sites are not allowed." }),
      { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    )
  }

  if (MUTATING.has(request.method) && isPublishedSiteOrigin(request.headers.get("origin"))) {
    return new NextResponse(
      JSON.stringify({ error: "Requests from published sites are not allowed." }),
      { status: 403, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    )
  }

  // ── The native app never shows the marketing site ──────────────────────────
  //
  // Capacitor WebViews always include "Capacitor" in their User-Agent, so this
  // is decided on the SERVER, before a single byte of a marketing page is sent.
  //
  // This used to guard "/" alone, which stopped the app opening on the homepage
  // but left every other marketing page one link away — a tab bar, a footer or a
  // stray <Link> and the app is showing somebody a pricing table inside an
  // application they have already installed. The gate is the whole marketing
  // site now.
  //
  // NOT gated, deliberately:
  //   · /legal, /terms, /privacy — the App Store requires these be reachable
  //     from inside the app, and gating them is a review rejection.
  //   · /p, /u, /l, /checkout, /library, /app, /wishlist, /receipt and the auth
  //     pages — the app's actual screens.
  // Everything here lands on /native-start, which resolves the session and sends
  // a seller to /app, a buyer to /library, and a stranger to /welcome.
  const NATIVE_BLOCKED = ["/pricing", "/features", "/faq", "/blog", "/alternatives"]
  /* And the /sell/<use case> pages, which are marketing pages; never /sell itself, the seller onboarding the app opens. */
  const isCapacitor = (request.headers.get("user-agent") || "").includes("Capacitor")
  if (
    isCapacitor &&
    (pathname === "/" || NATIVE_BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`)) || pathname.startsWith("/sell/"))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/native-start"
    url.search = ""
    return NextResponse.redirect(url)
  }

  // Extract username from subdomain
  /**
   * Only custom domains name a creator now.
   *
   * <name>.storelib.com used to rewrite to a creator storefront; it is an
   * AI-built site's address today, handled above. The old links are not
   * dropped — a subdomain with no site behind it redirects to
   * storelib.com/<name>, which is where creator pages live.
   */
  let username: string | null = null
  let isCustomDomain = false
  /* What the connected domain is for: the website, or the creator page (a community's is answered where it is found). */
  let domainPurpose: "website" | "creator_page" = "website"
  /* A community's domain: the community page this request is served from (lib/custom-domains/community.ts). */
  let communityPath: string | null = null

  // If no subdomain match, check if it's a custom domain
  if (!username) {
    const hostWithoutPort = host.split(":")[0]
    /**
     * `*.vercel.app` IS THE PLATFORM'S OWN HOST, NOT A CREATOR'S DOMAIN.
     *
     * It is where Vercel invokes crons, where a preview deployment lives and
     * where the project's production alias points. Reading it as somebody's
     * connected domain sends it looking for a creator in the database, and —
     * before this line existed — sent it to `www.` first, which is what
     * stopped every cron from running. No creator can connect a vercel.app
     * host, so there is nothing to lose by naming it.
     */
    const isPlatformHost = hostWithoutPort.endsWith(".vercel.app")
    const isExternalDomain = !isPlatformHost &&
      hostWithoutPort !== "localhost" &&
      hostWithoutPort !== "127.0.0.1" &&
      hostWithoutPort !== MAIN_DOMAIN &&
      !hostWithoutPort.endsWith(`.${MAIN_DOMAIN}`)

    // Canonical redirect: apex custom-domain.com → www.custom-domain.com
    // This prevents mixed apex/www confusion that causes ERR_SSL_PROTOCOL_ERROR
    // by ensuring only ONE host (www) is canonical. Browser caches the redirect permanently (301).
    // www is chosen as canonical because Vercel provisions SSL more reliably for CNAME-based hosts.
    // Pages only: see the note at the top about what a 301 does to an API call.
    // APEX ONLY. A subdomain someone connected (links.theirname.com) is its own
    // address; www.links.theirname.com is nobody's and has no certificate.
    if (!isApiCall && isExternalDomain && !hostWithoutPort.startsWith("www.") && isApexHost(hostWithoutPort)) {
      const wwwDomain = `www.${hostWithoutPort}`
      const canonicalUrl = new URL(`https://${wwwDomain}`)
      canonicalUrl.pathname = pathname
      canonicalUrl.search = search
      return NextResponse.redirect(canonicalUrl, { status: 301 })
    }

    const resolved = await resolveCustomDomain(host)
    /* The database not answering is not "this domain is not connected": try again in a moment, never a redirect away. */
    if (resolved === "unavailable" && !isApiCall) {
      return new NextResponse(SITE_UNAVAILABLE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "5" } })
    }
    const connected = resolved === "unavailable" ? null : resolved
    /**
     * ═══════════════════════════════════════════════════════════════════════
     *  A DOMAIN CONNECTED TO A COMMUNITY SHOWS THAT COMMUNITY, AND ONLY IT
     * ═══════════════════════════════════════════════════════════════════════
     * Round 31. Decided by communityDomainStep (lib/custom-domains/community.ts, pure, pinned case by
     * case in tests/community-domains-round31.test.ts): its pages at the
     * root, its own /community/<slug>/... links sent back without the
     * prefix, and everything else of Storelib's (sign in, /app, another
     * community, a creator page) sent to storelib.com, where the session
     * lives. No session is read or written for this host: the response is
     * built further down like every page's (respond), so the security
     * headers below still apply, but there is never a Storelib cookie here
     * to read. Before it is verified, or once the community is no longer the
     * domain owner's, the domain shows nobody's pages.
     */
    if (connected?.purpose === "community") {
      isCustomDomain = true
      const slug = connected.communitySlug
      if (!slug) {
        if (isApiCall) return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } })
        return new NextResponse(DOMAIN_NOT_CONNECTED, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } })
      }
      const step = communityDomainStep({ slug, pathname, search, host: hostWithoutPort.toLowerCase(), mainDomain: MAIN_DOMAIN })
      if (step.kind === "redirect") {
        const to = step.location.startsWith("https://") ? new URL(step.location) : new URL(step.location, request.url)
        const answer = NextResponse.redirect(to, { status: step.status })
        answer.headers.set("Cache-Control", "no-store")
        return answer
      }
      if (step.kind === "text") {
        return new NextResponse(step.body, { headers: { "Content-Type": step.contentType, "Cache-Control": "public, max-age=3600" } })
      }
      if (step.kind === "rewrite") {
        communityPath = step.path
        /* The community's layouts read the page asked for from this header (lib/communities/slug-move.ts): the community's own path, never the domain's. */
        request.headers.set(COMMUNITY_PATH_HEADER, `${step.path}${search}`)
      }
    } else if (connected) {
      /**
       * NOT THE PRIMARY DOMAIN: ITS VISITORS GO TO THE ONE THAT IS.
       * A creator with two domains for one thing picks which one is the
       * address (Settings, Domains, Make primary); the other keeps working and
       * sends every page, path and query intact, so nothing shared breaks and
       * search engines see one address. Pages only, like every host redirect.
       */
      if (connected.redirectTo && !isApiCall && !isReservedPath(pathname)) {
        const to = new URL(`https://${connected.redirectTo}`)
        to.pathname = pathname
        to.search = search
        return NextResponse.redirect(to, { status: 308 })
      }
      username = connected.username
      isCustomDomain = true
      domainPurpose = connected.purpose
      /* The domain names its creator: the site's own lookups skip finding them by name (lib/website-builder/route-facts.ts). */
      if (connected.creatorId) rememberCreatorOf(connected.username, connected.creatorId)
    } else if (isExternalDomain && !isReservedPath(pathname)) {
      // Domain not actively connected — check redirect memory table
      // This handles removed/changed domains by redirecting to the new domain or fallback subdomain
      const domainRedirect = await checkDomainRedirect(host)
      if (domainRedirect) {
        const redirectUrl = new URL(domainRedirect.redirectTo)
        // Preserve path: if old domain was accessed at /links, redirect to newdomain/links.
        // Under the target's own path when it has one: a creator page domain
        // that was removed sends /prints to storelib.com/<handle>/prints.
        if (pathname && pathname !== "/") {
          redirectUrl.pathname = `${redirectUrl.pathname.replace(/\/+$/, "")}${pathname}`
        }
        if (search) {
          redirectUrl.search = search
        }
        return NextResponse.redirect(redirectUrl, { status: domainRedirect.httpCode })
      }

      // No redirect entry — try to find the creator who owned this domain and redirect to their subdomain
      const fallbackUsername = await lookupDomainOwnerUsername(host)
      if (fallbackUsername) {
        const fallbackUrl = new URL(`https://${fallbackUsername}.${MAIN_DOMAIN}`)
        fallbackUrl.pathname = pathname
        fallbackUrl.search = search
        return NextResponse.redirect(fallbackUrl, { status: 302 })
      }
      // Truly unknown domain — fallback to main site
      const fallbackUrl = new URL(`https://${MAIN_DOMAIN}`)
      fallbackUrl.pathname = pathname
      fallbackUrl.search = search
      return NextResponse.redirect(fallbackUrl, { status: 302 })
    }
  }

  /**
   * A CONNECTED DOMAIN'S robots.txt AND sitemap.xml are its own, never
   * Storelib's. Both are reserved paths below, so a creator's domain handed
   * out storelib.com's robots file and pointed Google at storelib.com's
   * sitemap. Each answers them from what it shows:
   *
   *   a website domain whose creator published a website
   *       the website's own, the same way its subdomain does (/w/...)
   *   a creator page domain, or a website domain showing the creator page
   *   because no website is published
   *       the creator page's own (/u/<name>/..., lib/seo/creator-domain.ts),
   *       which reads the Host header this read: only the creator page's
   *       live primary domain names and serves a sitemap
   */
  if (
    username &&
    isCustomDomain &&
    (pathname === "/robots.txt" || pathname === "/sitemap.xml")
  ) {
    const seoUrl = request.nextUrl.clone()
    const website = domainPurpose === "website" && !(await hasLiveAiSite(username)) && (await hasPublishedWebsite(username))
    if (website) seoUrl.pathname = `/w/${username}${pathname}`
    else seoUrl.pathname = `/u/${username}${pathname}`
    return NextResponse.rewrite(seoUrl)
  }

  /*
    A CONNECTED DOMAIN'S ICON (round 41): a published website's own, square,
    from this host (lib/website-builder/site-favicon.ts). A domain showing the
    creator page passes it on as before.
  */
  if (username && isCustomDomain && isSiteIconPath(pathname)) {
    const website = domainPurpose === "website" && !(await hasLiveAiSite(username)) && (await hasPublishedWebsite(username))
    if (website) return NextResponse.rewrite(new URL(`/w/${username}${pathname}${search}`, request.url))
    return NextResponse.next()
  }

  /*
    A CONNECTED WEBSITE'S CHECKOUT, on the domain (siteCheckoutFor). /checkout
    is a reserved path, so it used to serve storelib.com's single product
    checkout here, and an imported theme's cart at /checkout reached nothing.
    Only a domain connected for a website that is published: a domain showing
    the creator page keeps the platform's checkout as before.
  */
  if (
    username &&
    isCustomDomain &&
    domainPurpose === "website" &&
    (pathname.startsWith("/checkout") || pathname.startsWith("/receipt")) &&
    !(await hasLiveAiSite(username)) &&
    (await hasPublishedWebsite(username))
  ) {
    const checkout = await siteCheckoutFor(request, username, host, pathname, search)
    if (checkout) return checkout
  }

  /* A connected website's page: every question it asks below, started together (startSiteQuestions). */
  const domainGateAsked =
    username && isCustomDomain && domainPurpose === "website" && (!isReservedPath(pathname) || pathname === "/wishlist" || pathname === "/wishlist/")
      ? startSiteQuestions(request, username, host, pathname, search, true)
      : null

  // Handle subdomain or custom domain routing
  let supabaseResponse: NextResponse
  /**
   * ONE WAY TO BUILD THIS REQUEST'S RESPONSE, used twice.
   *
   * When the Supabase client renews the session (setAll below) the response
   * has to be built again, so that it is made from the request AFTER its
   * cookies were updated and the pages behind it read the new token rather
   * than the one Supabase has just retired. That second build used to be a
   * separate copy of the rewrite rules, and it had drifted: it dropped the
   * connected domain's website (`/w/…`), the storefront's no-cache header,
   * and it did not pass the request on at all, so a page on a connected
   * domain rendered with the old cookie on exactly the request that renewed
   * it. Now both builds are this function.
   */
  let respond: () => NextResponse = () => NextResponse.next({ request })

  /*
    A COMMUNITY'S DOMAIN: its page, rewritten (communityPath above). Per
    viewer, so never held by a shared cache: next.config.mjs caches `/` for
    the marketing page, and on this host `/` is the community.
  */
  if (communityPath) {
    const communityUrl = request.nextUrl.clone()
    communityUrl.pathname = communityPath
    const domainHost = host.split(":")[0]
    respond = () => {
      const r = NextResponse.rewrite(communityUrl, { request })
      r.headers.set("Cache-Control", "private, no-cache, must-revalidate")
      r.headers.set("x-custom-domain", domainHost)
      return r
    }
  }

  /**
   * THE WEBSITE'S WISHLIST, ON ITS OWN DOMAIN. `/wishlist` is also a
   * platform page, and reserved, so on a connected domain it served
   * storelib.com's own wishlist with Storelib's header, instead of the
   * website's Wishlist page that its header's heart links to. A domain
   * connected for a published website answers it with the website's; any
   * other domain keeps what it had. Pages only; the lookups are the same two
   * the rest of this branch makes.
   */
  const websiteOwnsPath =
    !!username &&
    isCustomDomain &&
    domainPurpose === "website" &&
    (pathname === "/wishlist" || pathname === "/wishlist/") &&
    !(await hasLiveAiSite(username)) &&
    (await hasPublishedWebsite(username))

  // If we have a username (from subdomain or custom domain) and it's not a reserved path
  if (username && (!isReservedPath(pathname) || websiteOwnsPath)) {
    // Check if this is an old username that should redirect to a new one
    if (!isCustomDomain) {
      const newUsername = await resolveOldUsername(username)
      if (newUsername && newUsername.toLowerCase() !== username.toLowerCase()) {
        // 301 redirect to the new subdomain (permanent, SEO-safe)
        const redirectUrl = new URL(`https://${newUsername}.${MAIN_DOMAIN}`)
        redirectUrl.pathname = pathname
        redirectUrl.search = search
        return NextResponse.redirect(redirectUrl, { status: 301 })
      }
    }

    // Rewrite URLs:
    // - /links -> /l/{username} (seller onepage - username is used as slug)
    // - / -> /u/{username} (seller store homepage)
    // - /p/{slug} -> /p/{slug} (product pages stay the same)

    let rewritePath: string
    /* The website asks for a password and this visitor has a pass: their answer is not for a shared cache. */
    let guardedDomain = false
    /* A language the visitor's page offers (visitorLanguageStart), on a connected domain as on the subdomain. */
    let domainSuggest: string | null = null

    /**
     * ═════════════════════════════════════════════════════════════════════════
     *  A CONNECTED DOMAIN SHOWS THE SITE THEY BUILT
     * ═════════════════════════════════════════════════════════════════════════
     * Only custom domains reach this code now; a storelib.com subdomain is
     * answered above. And every one of them landed on `/u/{username}`, the
     * creator's PROFILE — so somebody who bought a domain, pointed it at
     * Storelib and built a website got the profile page at it, and their
     * website only at the subdomain they were trying to replace. Every path
     * but `/` and `/p/…` was thrown away too, so an About page on a connected
     * domain was the home page.
     *
     * A connected domain is a replacement for the subdomain, so it answers
     * with the same thing the subdomain answers with: the published website,
     * path and all. A creator with no published website keeps the profile
     * exactly as before, so nothing changes for anybody who has not built one.
     */
    // Pages only, like the subdomain branch: an asset request must not cost
    // two database lookups, and a site's assets are Next's own anyway.
    /* An imported Shopify theme answers its own addresses on a connected domain too. */
    if (domainPurpose === "website" && compatAnswers(pathname, request) && (await compatSiteFor(username, asksFresh(request))) && !(await hasLiveAiSite(username))) {
      return compatRewrite(request, username, host, pathname, search)
    }
    if (domainPurpose === "website" && policyAddress(pathname)) return NextResponse.redirect(new URL(`${policyAddress(pathname)}${search}`, request.url), { status: 308 })
    const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(pathname)
    const builtSite = !looksLikeFile && domainPurpose === "website" && !(await hasLiveAiSite(username)) && (await hasPublishedWebsite(username))
    /* As on the subdomain: no page of a website takes a server action (lib/website-builder/site-action-guard.ts). */
    if (builtSite && refusesSiteAction(request.method, request.headers)) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store", "X-Storelib-Guard": SITE_ACTION_GUARD } })

    /**
     * ═════════════════════════════════════════════════════════════════════════
     *  A DOMAIN CONNECTED TO THE CREATOR PAGE SHOWS THE CREATOR PAGE
     * ═════════════════════════════════════════════════════════════════════════
     * The same page as storelib.com/<handle>, with the handle taken out of
     * every address, because the domain already says whose it is:
     *
     *     /                 the creator page          (/u/<handle>)
     *     /links            the OnePage               (/l/<handle>)
     *     /<product>        a product                 (/<handle>/<product>)
     *     /p/<slug>         a product, the old way
     *
     * The pages still build some links with the handle in front
     * (`/<handle>/<product>`, `/<handle>`); those are sent to the same
     * address without it, so a visitor never leaves the domain and never
     * sees the handle twice.
     */
    if (domainPurpose === "creator_page" && !looksLikeFile) {
      const parts = pathname.split("/").filter(Boolean)
      if (parts.length > 0 && parts[0].toLowerCase() === username.toLowerCase()) {
        const to = request.nextUrl.clone()
        to.pathname = `/${parts.slice(1).join("/")}`
        return NextResponse.redirect(to, { status: 308 })
      }
    }

    if (pathname === "/links" || pathname === "/links/") {
      // username.storelib.com/links -> /l/{username}
      // The username is passed as the slug parameter
      rewritePath = `/l/${username}`
    } else if (domainPurpose === "creator_page") {
      const parts = pathname.split("/").filter(Boolean)
      rewritePath =
        parts.length === 0
          ? `/u/${username}`
          : looksLikeFile || pathname.startsWith("/p/")
            ? pathname
            : `/${username}/${parts.join("/")}`
    } else if (builtSite) {
      /* A market's own language on a visitor's first page, then /fr/about on a connected domain, as on the subdomain (inSiteLanguage). */
      const started = await marketLanguageStart(request, username, pathname)
      if (started) return started
      const own = await visitorLanguageStart(request, username, pathname)
      if (own && "redirect" in own) return own.redirect
      if (own && "suggest" in own) domainSuggest = own.suggest
      const inLanguage = await inSiteLanguage(username, pathname, request)
      if (inLanguage?.kind === "redirect") return NextResponse.redirect(new URL(`${inLanguage.to}${search}`, request.url), { status: 307 })
      rewritePath = heldListPath(inLanguage?.kind === "page" ? inLanguage.path : `/w/${username}${pathname === "/" || pathname === "" ? "" : pathname}`, request.nextUrl.searchParams)
      /* The password page, as on the subdomain, for a visitor without a pass (lib/site-password/gate.ts). */
      const gate = await (domainGateAsked ?? passwordPageFor(request, username, host, pathname, search))
      if (gate.blocked) return gate.blocked
      guardedDomain = gate.protected
    } else if (pathname === "/" || pathname === "") {
      // username.storelib.com -> /u/{username}
      rewritePath = `/u/${username}`
    } else if (pathname.startsWith("/p/")) {
      // Product pages stay as-is
      rewritePath = pathname
    } else {
      // For any other paths on subdomain, redirect to main store page
      rewritePath = `/u/${username}`
    }

    // Create rewrite URL
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = rewritePath

    // Preserve query parameters
    if (search) {
      rewriteUrl.search = search
    }

    const seller = username
    respond = () => {
      const r = NextResponse.rewrite(rewriteUrl, { request })
      r.headers.set("x-seller-subdomain", seller)
      if (rewritePath.startsWith("/u/")) r.headers.set("Cache-Control", "private, no-cache, must-revalidate")
      /*
        A built website's homepage on a connected domain: the same rule as on
        its subdomain (the long comment there). Without it, `/` took the
        marketing landing page's `public, s-maxage=3600, stale-while-revalidate=7200`
        from next.config, so a creator's front page on their own domain could
        stay as it was for up to three hours after Publish.
      */
      else if (builtSite && (pathname === "/" || pathname === "")) r.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
      if (guardedDomain) r.headers.set("Cache-Control", "private, no-store")
      /* Drawn in the visitor's market's currency: theirs alone (visitorMarket). */
      else if (/~m-/.test(rewritePath)) r.headers.set("Cache-Control", "private, no-cache")
      if (isCustomDomain) r.headers.set("x-custom-domain", host.split(":")[0])
      selfFramedWishlist(r, request)
      return offerLanguage(r, guardedDomain ? null : domainSuggest)
    }
    /* Why a storefront is no-cache, set in `respond` just above: */

    /**
     * THE STOREFRONT IS PER-VIEWER, ON THIS PATH TOO.
     *
     * `next.config.mjs` sets `private, no-cache, must-revalidate` for
     * `/u/:username*`, with a comment explaining why: the page renders an Edit
     * button, owner menus and a follow state that depend on who is asking, and
     * caching it shared serves one visitor's rendering to another. It also
     * made `router.refresh()` after a save a no-op, because the refreshed RSC
     * payload came straight back from the edge unchanged.
     *
     * THAT RULE NEVER APPLIED HERE. `headers()` matches the path the browser
     * asked for, and on `andrew.storelib.com` that path is `/` — which has its
     * own rule, `public, s-maxage=3600, stale-while-revalidate=7200`, meant
     * for the marketing landing page. So every storefront reached by its own
     * subdomain — which is most of them — was edge-cached for an hour, and
     * saving a profile appeared to do nothing until the hour was up.
     *
     * The rewrite is the only place that knows this request is a storefront,
     * so the header belongs here. `/l/` keeps its own caching: a link-in-bio
     * page has no per-viewer content.
     */
  }
  supabaseResponse = respond()

  /*
    A BEACON, A REPORT, A SCHEDULED JOB OR A WEBHOOK READS NO SESSION, so
    none is read or renewed for it (lib/auth/no-session-paths.ts lists them,
    and why each is safe). Everything above, the published site guards and
    the custom domain lookup among it, has already run.
  */
  const cookieNames = request.cookies.getAll().map((c) => c.name)
  if (skipsSessionRefresh(pathname, cookieNames)) return supabaseResponse
  /*
    NO SESSION COOKIE, NO SESSION TO READ. A visitor who is not signed in
    (most of a storefront's and the marketing site's traffic) has nothing to
    verify or renew: the Supabase client would answer "no session" without
    asking anybody, but only after readVerifiedSession had fetched the signing
    keys on a cold instance (up to 2s in front of the first byte). Answered
    anonymous here instead, which is exactly what Supabase would have said, so
    /app and /sell still send this visitor to sign in below.
  */
  const signedIn = carriesSignIn(cookieNames)
  /*
    VERIFIED ONLY WHERE THE ANSWER DECIDES SOMETHING. /app, /dashboard and /sell send a signed out visitor to sign
    in from it, so there it is verified (readVerifiedSession). Everywhere else (a storefront, the marketing site,
    every /api call, which verifies the caller itself) it only renews an expired token, which getSession does
    without asking Supabase Auth (lib/auth/current-user readSessionPresence). On a project on the shared secret
    that was a getUser() round trip per page, prefetch and API call, decided on by nobody.
  */
  const decidesHere = request.nextUrl.pathname === "/sell" || request.nextUrl.pathname.startsWith("/app") || request.nextUrl.pathname.startsWith("/dashboard")

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase is not configured, return the response as-is
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  // Determine if we're on localhost for cookie domain settings
  const isLocalhost = MAIN_DOMAIN.includes("localhost")

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    /*
      A DEADLINE ON THE REQUEST ITSELF (lib/net/deadline.ts). readVerifiedSession stops waiting after 3s, but a
      race only stops the waiting: the token refresh or getUser it raced went on, holding this invocation, and a
      refresh that finished after the response had left wrote its rotated cookies to a response nobody would
      read. Now the request is aborted at its deadline instead of running on.
    */
    global: { fetch: deadlineFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        // The same response, rebuilt from the request that now carries the
        // renewed cookies (see `respond` above).
        supabaseResponse = respond()
        // Set cookies with domain for cross-subdomain support
        // This ensures PKCE code verifier cookies work across subdomains
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, {
            ...options,
            // HOST-ONLY. This used to be `.${MAIN_DOMAIN}` for subdomain
            // sharing, which now means every published site at
            // <slug>.storelib.com would be sent the session — and could read
            // it, because this cookie is readable from JavaScript by design.
            domain: undefined,
            secure: !isLocalhost,
            sameSite: "lax",
          })
        })
      },
    },
  })

  /**
   * THE LINE THAT WAS SIGNING PEOPLE OUT AT RANDOM.
   *
   * This used to be `const { data: { user } } = await supabase.auth.getUser()`
   * with the error thrown away, and then `if (!user) redirect("/login")`. That
   * makes a blip between Vercel and Supabase indistinguishable from a
   * signed-out visitor, and this code runs on EVERY matched request, so the
   * dice were rolled all day long. It matches the report exactly: rare,
   * random, correlated with nothing, impossible to reproduce on purpose.
   *
   * readCurrentUser keeps the three outcomes apart and retries a blip once.
   * Only a definite "nobody is signed in" redirects now.
   */
  /*
    THE APP'S START GATE ASKS NOBODY. /native-start draws a plain screen and
    decides where to go from what the phone holds (app/native-start/page.tsx);
    nothing on the server reads who is signed in for it, and it is never
    /sell or /app. Asking Supabase here was one auth round trip (three
    seconds and a retry on a bad day) in front of the very first byte of
    every launch of the app. The page it lands on is asked for normally, and
    that request refreshes the session cookies as every other one does. The
    headers below (the app's Stripe frame policy among them) still go on
    this response: the start now lands in this same document.
  */
  /*
    VERIFIED, WITHOUT A ROUND TRIP WHERE IT CAN BE. readVerifiedSession
    (lib/auth/current-user.ts) checks the token's signature with Supabase's
    public keys, kept per instance, instead of asking Supabase Auth on every
    page, prefetch and /api call; a project on the shared secret falls back
    to getUser() exactly as before.
  */
  const current: Awaited<ReturnType<typeof readVerifiedSession>> =
    request.nextUrl.pathname === "/native-start" ? { user: null, state: "indeterminate", reason: "start gate" } : !signedIn ? { user: null, state: "anonymous" } : decidesHere ? await readVerifiedSession(supabase, supabaseUrl) : await readSessionPresence(supabase)

  if (current.state === "indeterminate" && request.nextUrl.pathname !== "/native-start") {
    /* One JSON line (lib/net/log.ts): the path, why, and the request's id; never a cookie or a query. */
    console.warn(logLine("proxy_auth_indeterminate", { path: request.nextUrl.pathname, reason: current.reason ?? "unknown", rid: request.headers.get(REQUEST_ID_HEADER) }))
  }

  /*
    SELL ON STORELIB, SIGNED OUT, GOES STRAIGHT TO SIGN UP. /sell makes the
    same decision itself, but it has a loading screen, so its redirect came
    after the page had started streaming: a white frame, then a client hop
    (a one second refresh without scripts). Here it is a real 307 before
    anything is drawn. The `next` it carries is checked again by
    /auth/continue like any other return target.
  */
  if (request.nextUrl.pathname === "/sell" && shouldSendToLogin(current)) {
    const url = request.nextUrl.clone()
    const next = request.nextUrl.searchParams.get("next")
    url.pathname = "/signup"
    url.search = ""
    url.searchParams.set("intent", "sell")
    if (next) url.searchParams.set("next", next)
    const redirect = NextResponse.redirect(url, 307)
    for (const cookie of supabaseResponse.cookies.getAll()) redirect.cookies.set(cookie)
    retireDomainScopedCookies(redirect, request)
    /* Decided from who is asking: never a shared cache's (SIGNED_OUT_REDIRECT_CACHE). */
    redirect.headers.set("Cache-Control", SIGNED_OUT_REDIRECT_CACHE)
    return redirect
  }

  const guarded =
    request.nextUrl.pathname.startsWith("/app") || request.nextUrl.pathname.startsWith("/dashboard")

  if (guarded && shouldSendToLogin(current)) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    /*
      THE PAGE THEY WERE OPENING COMES WITH THEM. A deep link into /app
      (a product, an order from an email) used to become a bare /login and
      then the dashboard's home. `next` is followed after sign in by
      /auth/continue (lib/auth/continue.ts), which checks it like any other
      return target: a seller lands on that page, a buyer on /sell.
    */
    url.search = ""
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`)
    /**
     * THE REDIRECT HAS TO CARRY THE COOKIES.
     *
     * `NextResponse.redirect` builds a BRAND NEW response, and every
     * Set-Cookie the Supabase client just wrote landed on `supabaseResponse`.
     * Returning the new one bare threw away a rotated refresh token: Supabase
     * had already retired the old one, the browser never received its
     * replacement, and the next request had nothing that worked. A sign-out
     * that survives a restart, caused by the redirect itself.
     */
    const redirect = NextResponse.redirect(url)
    for (const cookie of supabaseResponse.cookies.getAll()) redirect.cookies.set(cookie)
    retireDomainScopedCookies(redirect, request)
    redirect.headers.set("Cache-Control", SIGNED_OUT_REDIRECT_CACHE)
    return redirect
  }


  // ── Stripe controller CSP (Capacitor WKWebView only) ────────────────────────
  // When Stripe.js initialises it creates a hidden controller iframe at
  // js.stripe.com/v3/controller-with-preconnect-*.html. That iframe sends a
  // postMessage; Stripe.js reacts by setting window.location.href = controllerUrl.
  // In WebKit, window.location.href is [LegacyUnforgeable] — no JS patch can
  // intercept it. The WebView navigates away from the checkout page.
  //
  // Fix: inject a Content-Security-Policy frame-src that only allows the Stripe
  // iframe URL patterns actually needed. The controller URL (controller-with-
  // preconnect-*.html) is intentionally absent → the browser engine blocks it
  // before any JS runs → no postMessage is ever sent → window.location.href
  // is never set → checkout stays inline.
  //
  // Allowed patterns (all live under js.stripe.com/v3/):
  //   elements-*        CardNumberElement / CardExpiryElement / CardCvcElement
  //   payment-request-* Apple Pay / Google Pay availability check iframe
  //   three-ds-*        3DS v2 bank-auth challenge iframes
  //   link-*            Stripe Link authentication iframes
  //   hooks.stripe.com  3DS redirect-return host
  //   connect-js.stripe.com
  //                     Stripe's embedded Connect forms — the three steps of
  //                     Set up payments (identity, business details, bank).
  //                     A separate script and a separate host from Stripe.js
  //                     v3: it has no controller iframe and never sets
  //                     window.location.href, so it does not reintroduce the
  //                     navigation this list exists to stop. Its absence here
  //                     was why those forms could not load in the app, and
  //                     why the app used to send creators to a browser.
  //
  // NOT allowed (intentionally blocked):
  //   controller-with-preconnect-*  ← the cause of the top-level navigation
  if ((request.headers.get("user-agent") || "").includes("Capacitor")) {
    supabaseResponse.headers.set(
      "Content-Security-Policy",
      "frame-src 'self'" +
      " https://js.stripe.com/v3/elements-*" +
      " https://js.stripe.com/v3/payment-request-*" +
      " https://js.stripe.com/v3/three-ds-*" +
      " https://js.stripe.com/v3/link-*" +
      " https://hooks.stripe.com" +
      " https://connect-js.stripe.com" +
      /* A course lesson that is a YouTube or Vimeo link plays in their player (lib/courses/external.ts); a community post's Loom link in Loom's. */
      " https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com",
    )
  }

  /**
   * THE CODE EDITOR MAY BE FRAMED, BY US, WHEN IT ASKS TO BE.
   *
   * vercel.json sends `X-Frame-Options: DENY` on every path, which is the
   * right default and is why nothing in this app can be put in an iframe by
   * anybody. The theme editor now shows /website-builder/code over its own
   * canvas, in a frame, and that page would be a blank rectangle under DENY.
   *
   * CSP `frame-ancestors` takes precedence over X-Frame-Options where both
   * are present — the site cover route relies on exactly this and is proven
   * in production. So the code page gets `frame-ancestors 'self'`, and ONLY
   * when it carries `?embedded=1`: opened at its own address it stays
   * unframeable, and nobody else's page can frame it either way.
   *
   * Appended to an existing CSP rather than replacing it, because the
   * Capacitor block above may already have set one for this response.
   */
  {
    const url = request.nextUrl
    /**
     * THE CREATOR PAGE IS FRAMED BY ITS OWN WORKSPACE.
     *
     * /creator-page holds the real /u/<handle> rather than redrawing it,
     * so the controls a creator uses are the ones a visitor's browser runs and
     * nothing can drift. Same rule as the code editor below: `frame-ancestors
     * 'self'`, and ONLY with ?embedded=1. Opened at its own address the page
     * stays unframeable by anybody, us included.
     */
    /**
     * AND THE PRODUCT PAGES THE CREATOR PAGE LINKS TO.
     *
     * Clicking a product inside the workspace loaded /{handle}/{slug} into
     * the frame and got "storelib.com refused to connect" — X-Frame-Options
     * doing its job on a page nobody had thought about. The canvas holds the
     * real page, and the real page has links out of it; a framed page whose
     * own links are dead ends is a preview, which is the thing this
     * arrangement exists not to be.
     *
     * The condition is unchanged in kind: `frame-ancestors 'self'`, and ONLY
     * with ?embedded=1. A product page at its own address stays unframeable
     * by anybody, us included, and no other site can frame it either way.
     * lib/store-builder/editor-channel adds the flag to links inside the
     * canvas, so the parameter is only ever present on a request the
     * workspace made.
     */
    const productPath = (() => {
      /** /p/{slug}, and /{handle}/{slug} where the handle is not a real route. */
      if (url.pathname.startsWith("/p/")) return true
      const parts = url.pathname.split("/").filter(Boolean)
      if (parts.length !== 2) return false
      return !FRAME_RESERVED_FIRST_SEGMENT.has(parts[0].toLowerCase())
    })()
    /**
     * AND THE CREATOR PAGE AT ITS NEW ADDRESS, WHICH IS ONE SEGMENT.
     *
     * The rule above named `/u/<handle>` because that is where the creator
     * page used to live. It moved to `/<handle>`, and `/u/<handle>` became a
     * 308 to it — so the workspace's frame asked for a framable address, was
     * redirected to an identical page at an address this list had never heard
     * of, and the browser refused it. The editor showed a broken rectangle
     * and the proxy was, correctly, doing what it was told.
     *
     * Measured before the fix, on both the redirect and its destination:
     *
     *     x-frame-options: DENY          (and no frame-ancestors)
     *
     * One segment, and not one of the reserved routes — the same guard the
     * product rule uses, so `/login` and `/app` can never be mistaken for a
     * handle. `/u/` stays in the list below because the redirect carries
     * `embedded=1` through and an old address should not start failing.
     */
    const creatorPath = (() => {
      const parts = url.pathname.split("/").filter(Boolean)
      if (parts.length !== 1) return false
      return !FRAME_RESERVED_FIRST_SEGMENT.has(parts[0].toLowerCase())
    })()
    /*
      AND THE ONEPAGE EDITOR'S PREVIEW, which is the live page's own
      component in a frame of the editor's (components/onepage/live-
      preview). It reads nothing and shows only what its parent on this
      origin posts to it, and it is framed on the same terms as the others.
    */
    /* And the page a website's cover is taken of, shown small on the owner's Website page while its photograph is on its way (a pass for one install, two minutes). */
    /* And Settings' Google Analytics check, a blank page that loads the store's tag in a hidden frame of the settings page (app/api/store/ga-check). */
    /* And the checkout text editor's preview, the website's own checkout in a frame of Settings (app/checkout/preview): it reads nothing and draws only what its parent on this origin posts to it. */
    const framableWhenEmbedded =
      url.pathname === "/onepage-preview" ||
      url.pathname === "/checkout/preview" ||
      url.pathname === "/api/store/ga-check" ||
      url.pathname.startsWith("/cover-render/") ||
      /* The theme marketplace's live preview (app/(site)/theme-preview), framed by storelib.com/themes/<slug>. */
      url.pathname.startsWith("/theme-preview/") ||
      url.pathname.startsWith("/website-builder/code/") ||
      url.pathname.startsWith("/u/") ||
      creatorPath ||
      productPath
    const framed = framableWhenEmbedded && url.searchParams.get("embedded") === "1"
    if (framed) {
      const existing = supabaseResponse.headers.get("Content-Security-Policy")
      /* The cover's page draws a creator's own sections: framed, it is also given no origin of its own, whatever the frame's tag says. */
      const rule = url.pathname.startsWith("/cover-render/") ? "sandbox allow-scripts; frame-ancestors 'self'" : "frame-ancestors 'self'"
      supabaseResponse.headers.set(
        "Content-Security-Policy",
        existing ? `${existing}; ${rule}` : rule,
      )
    }
    /* The cover's page loads no script and calls no server the picture does not need (lib/website-builder/cover-still.ts). */
    if (url.pathname.startsWith("/cover-render/")) {
      const existing = supabaseResponse.headers.get("Content-Security-Policy")
      supabaseResponse.headers.set("Content-Security-Policy", existing ? `${existing}, ${COVER_STILL_POLICY}` : COVER_STILL_POLICY)
    }
  }

  // Last thing before the response leaves: retire any `.storelib.com` session
  // cookie this browser is still carrying, re-issued host-only so nobody is
  // signed out by the change.
  retireDomainScopedCookies(supabaseResponse, request)

  return supabaseResponse
}

export const config = {
  /*
    /favicon.ico is NOT left out (round 41): on a website's host it is the
    website's own icon (lib/website-builder/site-favicon.ts), which only this
    proxy can send there. On storelib.com it is passed straight on, before
    any session is read (routeRequest).
  */
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
