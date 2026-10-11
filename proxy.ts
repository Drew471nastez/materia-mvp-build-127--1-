import { MCP_HOST_LABEL, mcpHostRoute } from "@/lib/agent-access/mcp-host"
import { createServerClient } from "@supabase/ssr"
import { readCurrentUser, shouldSendToLogin } from "@/lib/auth/current-user"
import { createClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"
import { previewTokenFrom } from "@/lib/website-builder/preview-token"
import { isApexHost } from "@/lib/custom-domains/hostname"
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
import { rememberCreatorOf, siteFactsFor } from "@/lib/website-builder/route-facts"

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
const EXCLUDED_SUBDOMAINS = ["www", "app", "api", "admin", "dashboard", "localhost", "domains", MCP_HOST_LABEL]

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
    const supabase = createClient(supabaseUrl, supabaseKey)

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
const answersAsked = new Map<string, Promise<boolean>>()
async function remembered(key: string, ask: () => Promise<{ value: boolean; failed: boolean }>): Promise<boolean> {
  const held = answersHeld.get(key)
  if (held && Date.now() - held.at < 30_000) return held.value
  const asking = answersAsked.get(key)
  if (asking) return asking
  const answer = (async () => {
    const fresh = await ask().catch(() => ({ value: false, failed: true }))
    if (fresh.failed) return held?.value ?? false
    if (answersHeld.size > 10_000) answersHeld.clear()
    answersHeld.set(key, { at: Date.now(), value: fresh.value })
    return fresh.value
  })().finally(() => answersAsked.delete(key))
  answersAsked.set(key, answer)
  return answer
}

async function hasLiveAiSite(slug: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) return false
  return remembered(`ai:${slug.toLowerCase()}`, async () => {
    const supabase = createClient(supabaseUrl, supabaseKey)
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
    gateClient ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
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
  if (compatAnswers(pathname, request)) void compatSiteFor(name).catch(() => false)
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
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
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
    const { facts, failed } = await siteFactsFor(createClient(supabaseUrl, supabaseKey), lower)
    return { value: facts.published, failed }
  })
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
const compatAsked = new Map<string, Promise<boolean>>()
async function compatSiteFor(username: string): Promise<boolean> {
  const lower = username.toLowerCase()
  const hit = compatHeld.get(lower)
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
  const answer = (async () => {
    const { facts, failed } = await siteFactsFor(createClient(supabaseUrl, supabaseKey), lower)
    if (failed) return hit?.value ?? false
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
  /* The theme's /checkout is its own (its cart posts there); anything under
     it, /checkout/physical a cart that ships is sent on to, is Storelib's
     and goes to the apex like any other site's (PLATFORM_APEX_PATHS). */
  if (pathname.startsWith("/checkout/")) return false
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

/** The rewrite to the imported theme's handler, behind the site's password when it has one. */
async function compatRewrite(request: NextRequest, name: string, host: string, pathname: string, search: string): Promise<NextResponse> {
  if (!/\.[a-z0-9]{1,8}$/i.test(pathname) && !pathname.startsWith("/cart/")) {
    const gate = await passwordPageFor(request, name, host, pathname, search)
    if (gate.blocked) return gate.blocked
  }
  const to = request.nextUrl.clone()
  to.pathname = `/api/site-theme/site/${name}${pathname === "/" ? "" : pathname}`
  to.search = search
  /* Sealed for this name on this host: the handler draws nothing it was not sent by this proxy (lib/storelib-theme/compat/site-seal.ts). */
  const headers = new Headers(request.headers)
  headers.delete(SITE_SEAL_HEADER)
  const seal = await sealSite(name, siteHostOf(request.headers))
  if (seal) headers.set(SITE_SEAL_HEADER, seal)
  const r = NextResponse.rewrite(to, { request: { headers } })
  r.headers.set("Cache-Control", "private, no-store")
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
 */
type ConnectedDomain = {
  username: string
  purpose: "website" | "creator_page"
  redirectTo: string | null
  /** Whose domain it is, so the site's own lookups need not find the creator by name again. */
  creatorId?: string
}

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
const domainHeld = new Map<string, { at: number; value: ConnectedDomain | null }>()
const DOMAIN_HELD_MS = 60_000

/** A page that loads again by itself, for the moment a site cannot be looked up. */
const SITE_UNAVAILABLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5"><title>One moment</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 Inter,system-ui,sans-serif;color:#1a1a2e;background:#f8f9fa}p{margin:0;color:#6b7280}</style></head><body><main><h1 style="font-size:20px;margin:0 0 6px">One moment</h1><p>This page will load again by itself.</p></main></body></html>`

async function resolveCustomDomain(host: string): Promise<ConnectedDomain | null | "unavailable"> {
  const key = host.split(":")[0].toLowerCase()
  const held = domainHeld.get(key)
  if (held && Date.now() - held.at < DOMAIN_HELD_MS) return held.value
  const fresh = await resolveCustomDomainFresh(host)
  if (fresh.failed) return held ? held.value : "unavailable"
  if (domainHeld.size > 5000) domainHeld.clear()
  domainHeld.set(key, { at: Date.now(), value: fresh.value })
  return fresh.value
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
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Strip www. prefix for lookup - domains are stored without www in the database
    const lookupDomain = hostWithoutPort.replace(/^www\./, "")

    // Match active, ssl_provisioning, or pending (if request arrives, DNS is working)
    const served = ["active", "ssl_provisioning", "pending", "verifying"]
    let { data: domainRecord, error } = await supabase
      .from("custom_domains")
      .select("creator_id, status, purpose, is_primary, creator:creators ( user_id )")
      .eq("domain", lookupDomain)
      .in("status", served)
      .maybeSingle()
    if (error && /column|42703|PGRST204/i.test(`${error.code} ${error.message}`)) {
      ;({ data: domainRecord } = (await supabase
        .from("custom_domains")
        .select("creator_id, status, creator:creators ( user_id )")
        .eq("domain", lookupDomain)
        .in("status", served)
        .maybeSingle()) as never)
    } else if (failedRead(error)) return { value: null, failed: true }

    if (!domainRecord) return none
    const row = domainRecord as { creator_id: string; purpose?: string | null; is_primary?: boolean | null; creator?: { user_id?: string | null } | { user_id?: string | null }[] | null }
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
    const supabase = createClient(supabaseUrl, supabaseKey)

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
    const supabase = createClient(supabaseUrl, supabaseKey)
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
  "access", "account", "account-deletion", "admin", "api", "app", "auth", "blog", "c",
  "checkout", "community", "cover-render", "creator-page", "dashboard", "developers", "downloads", "editions", "explore",
  "faq", "features", "help", "l", "legal", "library", "llms-full.txt", "llms.txt", "login", "member", "native-start",
  "onboarding", "onepage-preview", "order-help", "p", "pay", "payouts-sheet", "pricing", "privacy", "products", "purchase", "receipt",
  "register", "request", "reset-password", "sell", "signup", "site", "sitemap", "sitemap.xml", "sites", "store",
  "store-builder", "stripe-done", "terms", "u", "unsubscribe", "upgrade", "verify-email",
  "w", "website-builder", "welcome", "wishlist",
])

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const host = request.headers.get("host") || ""

  /* A public file at Storelib's own address (lib/storage/media-url.ts): on every host, straight to next.config's rewrite, never a page of a site. */
  if (pathname.startsWith("/media/")) return NextResponse.next()

  /*
    A COMMUNITY PAGE IS TOLD ITS OWN ADDRESS. A layout is not given its path,
    and the community's layout needs it to send an old address on to the new
    one with the rest of the path and the query (lib/communities/slug-move.ts).
    Written for every /community/ request, so whatever a visitor sends under
    that name is replaced; no lookup, nothing else reads it.
  */
  /* Round 13: the Classroom is Learn. Its old addresses answer a 308 to the same place under /learn, the query kept (lib/communities/learn.ts). */
  const learn = pathname.startsWith("/community/") && pathname.includes("/classroom") ? learnAddressFor(pathname) : null
  if (learn) return NextResponse.redirect(new URL(`${learn}${search}`, request.url), 308)
  if (pathname.startsWith("/community/")) request.headers.set(COMMUNITY_PATH_HEADER, `${pathname}${search}`)
  /* And a profile, for the same reason: a creator's /@handle answers a 308 to their page with the query kept, from its layout (lib/profile/profile-redirect.ts). */
  if (isProfilePath(pathname)) request.headers.set(PROFILE_PATH_HEADER, `${pathname}${search}`)

  const bareHost = host.split(":")[0].toLowerCase()

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
  if (!isApiCall && bareHost === `www.${MAIN_DOMAIN}`) {
    const canonical = new URL(`https://${MAIN_DOMAIN}`)
    canonical.pathname = pathname
    canonical.search = search
    return NextResponse.redirect(canonical, { status: 301 })
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
      /* Every question this page asks below, started together (startSiteQuestions). */
      const gateAsked = startSiteQuestions(request, subdomain, host, pathname, search, false)
      /* An imported Shopify theme answers its own addresses, its cart's /cart.js and /checkout included. */
      if (compatAnswers(pathname, request) && (await compatSiteFor(subdomain)) && !(await hasLiveAiSite(subdomain))) {
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

      url.pathname = isWebsite
        ? `/w/${subdomain}${pathname === "/" ? "" : pathname}`
        : `/site/${subdomain}${pathname === "/" ? "" : pathname}`
      const rewritten = NextResponse.rewrite(url)

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
      if (pathname === "/") {
        rewritten.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300")
      }
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

  if (isApi && !isPublicApi && secFetchSite === "same-site") {
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
  const NATIVE_BLOCKED = ["/pricing", "/features", "/faq", "/blog"]
  const isCapacitor = (request.headers.get("user-agent") || "").includes("Capacitor")
  if (
    isCapacitor &&
    (pathname === "/" || NATIVE_BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`)))
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
  /* What the connected domain is for: the website, or the creator page. */
  let domainPurpose: "website" | "creator_page" = "website"

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
    if (connected) {
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
    if (domainPurpose === "website" && compatAnswers(pathname, request) && (await compatSiteFor(username)) && !(await hasLiveAiSite(username))) {
      return compatRewrite(request, username, host, pathname, search)
    }
    if (domainPurpose === "website" && policyAddress(pathname)) return NextResponse.redirect(new URL(`${policyAddress(pathname)}${search}`, request.url), { status: 308 })
    const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(pathname)
    const builtSite = !looksLikeFile && domainPurpose === "website" && !(await hasLiveAiSite(username)) && (await hasPublishedWebsite(username))

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
      rewritePath = `/w/${username}${pathname === "/" || pathname === "" ? "" : pathname}`
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
      if (guardedDomain) r.headers.set("Cache-Control", "private, no-store")
      if (isCustomDomain) r.headers.set("x-custom-domain", host.split(":")[0])
      selfFramedWishlist(r, request)
      return r
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // If Supabase is not configured, return the response as-is
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  // Determine if we're on localhost for cookie domain settings
  const isLocalhost = MAIN_DOMAIN.includes("localhost")

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
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
  const current: Awaited<ReturnType<typeof readCurrentUser>> =
    request.nextUrl.pathname === "/native-start" ? { user: null, state: "indeterminate", reason: "start gate" } : await readCurrentUser(supabase)

  if (current.state === "indeterminate" && request.nextUrl.pathname !== "/native-start") {
    console.warn(`[proxy] auth undetermined on ${request.nextUrl.pathname}: ${current.reason}`)
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
    const framableWhenEmbedded =
      url.pathname === "/onepage-preview" ||
      url.pathname.startsWith("/website-builder/code/") ||
      url.pathname.startsWith("/u/") ||
      creatorPath ||
      productPath
    const framed = framableWhenEmbedded && url.searchParams.get("embedded") === "1"
    if (framed) {
      const existing = supabaseResponse.headers.get("Content-Security-Policy")
      supabaseResponse.headers.set(
        "Content-Security-Policy",
        existing ? `${existing}; frame-ancestors 'self'` : "frame-ancestors 'self'",
      )
    }
  }

  // Last thing before the response leaves: retire any `.storelib.com` session
  // cookie this browser is still carrying, re-issued host-only so nobody is
  // signed out by the change.
  retireDomainScopedCookies(supabaseResponse, request)

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
