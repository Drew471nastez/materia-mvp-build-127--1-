/**
 * The scenarios scripts/measure-speed18.mjs times: each one is what a route
 * does for one visitor, called the way Next calls it (metadata and page in
 * the same request, so React's cache() is shared between them as it is in
 * production). Every scenario runs three visits on one warm server:
 *
 *   first          nothing cached yet (a cold server, or the first visitor)
 *   repeat         a second visitor a few seconds later
 *   after 2 min    a visitor after every short TTL has run out
 */
import "./setup"
import { visit, type VisitResult } from "./context"
import { setRtt, useFixture, missingRelations, signedInCookies } from "./fake-postgrest"
import { clock, resetCache, pending } from "./shims/next-cache"
import { buildFixture, SITE, EXPLORE, ONEPAGE } from "./fixture"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"

/*
  AN IMPORTED SHOPIFY THEME'S LIVE SITE (app/api/site-theme/site): the
  posture fixture (tests/fixtures/shopify-posture) converted by the import's
  own code and stored as Maya's published install, then asked for as the
  proxy asks for it: sealed, and for a stranger at the marked address.
*/
async function postureTheme() {
  const { convertShopifyTheme } = await import("@/lib/storelib-theme/shopify/convert")
  /* COMPAT_THEME_DIR: another unpacked theme (Dawn, say) for a page the size of a real store's. */
  const dir = process.env.COMPAT_THEME_DIR || join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n.startsWith(".")) continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  return r.theme
}
const POSTURE = await postureTheme()
function compatFixture(f: ReturnType<typeof buildFixture>) {
  const st = f.tables.store_theme_settings.find((r) => r.install_id === SITE.installId)!
  st.settings = { ...POSTURE.settings }
  st.draft_settings = { ...POSTURE.settings }
  f.tables.store_theme_custom_files = Object.entries(POSTURE.files).map(([path, content], i) => ({ id: `f${i}`, install_id: SITE.installId, path, content, draft_content: null }))
  f.tables.store_theme_pages = [
    ...f.tables.store_theme_pages.filter((r) => r.install_id !== SITE.installId),
    ...POSTURE.pages.map((p, i) => ({ id: `p${i}`, install_id: SITE.installId, page_key: p.page_key, sections: p.sections, draft_sections: null })),
  ]
}
/** One page of the imported theme's site, asked of the route as the proxy rewrites it: a stranger's at the marked address, anybody else's with their cookie. */
async function compatPage(path: string, opts: { stranger: boolean; cookie?: string } = { stranger: true }) {
  const { sealSite } = await import("@/lib/storelib-theme/compat/site-seal")
  const { strangerMarker } = await import("@/lib/storelib-theme/compat/anonymous-cache")
  const route = await import("@/app/api/site-theme/site/[username]/[[...path]]/route")
  const { NextRequest } = await import("next/server")
  const host = "maya.storelib.com"
  const marker = opts.stranger ? strangerMarker({ host, country: "US", locale: null, market: null }) : null
  const segs = [...(marker ? [marker] : []), ...path.split("/").filter(Boolean)]
  const headers: Record<string, string> = { host, "x-forwarded-host": host, accept: "text/html", "sec-fetch-dest": "document", "x-storelib-site-country": "US", "user-agent": "Mozilla/5.0 (iPhone)" }
  const seal = await sealSite(SITE.username, host)
  if (seal) headers["x-storelib-theme-site"] = seal
  if (opts.cookie) headers.cookie = opts.cookie
  const req = new NextRequest(`https://${host}/api/site-theme/site/${SITE.username}/${segs.join("/")}`, { headers })
  const res = (await route.GET(req, { params: Promise.resolve({ username: SITE.username, path: segs }) })) as Response
  const body = await res.text()
  if (process.env.DUMP_COMPAT) (await import("node:fs")).writeFileSync(`${process.env.DUMP_COMPAT}/${path.replace(/\W+/g, "_") || "home"}-${opts.stranger ? "stranger" : "cart"}.html`, body)
  return `${res.status} ${res.headers.get("cache-control")} ${res.headers.get("x-storelib-held") ?? ""} ${body.length}B`
}

type Scenario = {
  name: string
  held: string
  run: () => Promise<unknown>
  /** Loads the modules without warming what is measured (the proxy keeps its answers per server). */
  warm?: () => Promise<unknown>
  cookies?: Record<string, string>
  headers?: Record<string, string>
  /** Changes to the fixture this scenario needs (an imported theme, a password, an AI site). */
  fixture?: (f: ReturnType<typeof buildFixture>) => void
}

/* Every clock in the process moves with the bench's, so a TTL kept with Date.now() runs out too. */
Date.now = clock.now

async function proxyVisit(url: string, cookie?: string) {
  const { proxy } = await import("@/proxy")
  const { NextRequest } = await import("next/server")
  const res = (await proxy(new NextRequest(url, { headers: { host: new URL(url).host, "user-agent": "Mozilla/5.0 (iPhone)", accept: "text/html", ...(cookie ? { cookie } : {}) } }))) as Response
  const to = res.headers.get("x-middleware-rewrite") ?? res.headers.get("location") ?? `status ${res.status}`
  return to
}

/**
 * A whole page of an imported theme's site as Vercel runs it: the proxy
 * (proxy.ts), then the route it rewrote to with the headers it set, so the
 * round trips and the time are the visitor's, both halves together. What
 * comes back says where it went and how it may be kept.
 */
async function siteVisit(url: string, cookie?: string) {
  const { proxy } = await import("@/proxy")
  const { NextRequest } = await import("next/server")
  const headers: Record<string, string> = { host: new URL(url).host, "user-agent": "Mozilla/5.0 (iPhone)", accept: "text/html", "sec-fetch-dest": "document", ...(cookie ? { cookie } : {}) }
  const res = (await proxy(new NextRequest(url, { headers }))) as Response
  const to = res.headers.get("x-middleware-rewrite")
  if (!to) return `proxy ${res.status} ${res.headers.get("location") ?? ""}`
  const sent = new Headers(headers)
  for (const name of (res.headers.get("x-middleware-override-headers") ?? "").split(",").map((n) => n.trim()).filter(Boolean)) {
    const v = res.headers.get(`x-middleware-request-${name}`)
    if (v === null) sent.delete(name)
    else sent.set(name, v)
  }
  const at = new URL(to)
  const m = at.pathname.match(/^\/api\/site-theme\/site\/([^/]+)\/?(.*)$/)
  if (!m) return `rewrite ${at.pathname}`
  const route = await import("@/app/api/site-theme/site/[username]/[[...path]]/route")
  const path = m[2] ? m[2].split("/").map(decodeURIComponent) : []
  const answer = (await route.GET(new NextRequest(at, { headers: sent }), { params: Promise.resolve({ username: m[1], path }) })) as Response
  const body = await answer.text()
  return `${answer.status} ${answer.headers.get("cache-control")} ${answer.headers.get("x-storelib-held") ?? "drawn"} ${path[0]?.startsWith("~anon~") ? "marked" : "unmarked"} ${body.length}B`
}

const scenarios: Scenario[] = [
  {
    name: "proxy: maya.storelib.com/",
    held: "proxy runs on every visit",
    warm: () => proxyVisit("https://leo.storelib.com/"),
    run: () => proxyVisit("https://maya.storelib.com/"),
  },
  ...([
    ["compat", "https://maya.storelib.com/", (f: ReturnType<typeof buildFixture>) => {
      const st = f.tables.store_theme_settings.find((r) => r.install_id === SITE.installId)!
      st.settings = { ...(st.settings as object), compat: { kind: "shopify" } }
    }],
    ["ai site", "https://maya.storelib.com/", (f: ReturnType<typeof buildFixture>) => {
      f.tables.site_deployments.push({ id: "ai-1", slug: "maya", is_live: true, storage_prefix: "sites/maya/v1" })
    }],
    ["password", "https://www.mayastudio.com/about", (f: ReturnType<typeof buildFixture>) => {
      f.tables.site_access.push({ creator_id: SITE.creatorId, password_enabled: true, password_version: 1, password_hash: "x" })
    }],
    ["not published", "https://www.mayastudio.com/", (f: ReturnType<typeof buildFixture>) => {
      f.tables.store_theme_installs.find((r) => r.id === SITE.installId)!.status = "draft"
    }],
  ] as const).map(([label, url, change]) => ({
    name: `proxy check: ${label}`,
    held: "proxy",
    fixture: change,
    warm: () => proxyVisit("https://leo.storelib.com/"),
    run: () => proxyVisit(url),
  })),
  {
    name: "proxy: www.mayastudio.com/",
    held: "proxy runs on every visit",
    warm: () => proxyVisit("https://www.leostudio.com/"),
    run: () => proxyVisit("https://www.mayastudio.com/products/maya-product-3"),
  },
  {
    /* andrewrullz.storelib.com's shape: an imported theme on a storelib.com subdomain, no domain of its own. */
    name: "proxy: compat subdomain page",
    held: "proxy runs on every visit",
    fixture: (f) => {
      compatFixture(f)
      f.tables.custom_domains = f.tables.custom_domains.filter((r) => r.creator_id !== SITE.creatorId)
    },
    warm: () => proxyVisit("https://leo.storelib.com/"),
    run: () => proxyVisit("https://maya.storelib.com/products/maya-product-3"),
  },
  {
    /* A visitor's second page: Storelib's tracker ids, the consent choice, the store's analytics and a theme app's own cookie. Held (marked) or drawn for them alone. */
    name: "proxy: compat second page",
    held: "proxy runs on every visit",
    fixture: (f) => {
      compatFixture(f)
      f.tables.custom_domains = f.tables.custom_domains.filter((r) => r.creator_id !== SITE.creatorId)
    },
    warm: () => proxyVisit("https://leo.storelib.com/"),
    run: () => proxyVisit("https://maya.storelib.com/collections/maya-best", "_ga=GA1.1.5; materia_visitor=v_abc; sl_asid=s_def; storelib_consent=2.p0.a1.x; __kla_id=eyJ; recently_viewed=a,b"),
  },
  ...([
    ["site visit: first page", "https://maya.storelib.com/collections/maya-best", undefined],
    ["site visit: next page (returning visitor)", "https://maya.storelib.com/products/maya-product-3", "_ga=GA1.1.5; materia_visitor=v_abc; sl_asid=s_def; storelib_consent=2.p0.a1.x; __kla_id=eyJ; recently_viewed=a,b"],
    ["site visit: next page (cart)", "https://maya.storelib.com/products/maya-product-3", "sl_theme_cart=; materia_visitor=v_abc"],
  ] as const).map(([name, url, cookie]) => ({
    name,
    held: "proxy and route",
    fixture: (f: ReturnType<typeof buildFixture>) => {
      compatFixture(f)
      f.tables.custom_domains = f.tables.custom_domains.filter((r) => r.creator_id !== SITE.creatorId)
    },
    /* Loads the modules on another site's page (Leo has no imported theme), so the visit measured starts with nothing held. */
    warm: () => siteVisit("https://leo.storelib.com/about"),
    run: () => siteVisit(url, cookie),
  })),
  ...([
    ["compat-home (stranger)", "/", { stranger: true }],
    ["compat-product (stranger)", "/products/maya-product-3", { stranger: true }],
    ["compat-collection (stranger)", "/collections/maya-best", { stranger: true }],
    ["compat-home (cart)", "/", { stranger: false, cookie: "sl_theme_cart=" }],
    ["compat-product (cart)", "/products/maya-product-3", { stranger: false, cookie: "sl_theme_cart=" }],
  ] as const).map(([name, path, opts]) => ({
    name,
    held: "route",
    fixture: compatFixture,
    run: () => compatPage(path, opts),
  })),
  {
    name: "site-home",
    held: "route",
    run: async () => {
      const m = await import("@/app/(site)/w/[username]/render-site")
      await m.siteMetadata(SITE.username, undefined, "home")
      return m.renderSite(SITE.username, undefined, "home")
    },
  },
  {
    name: "site-about",
    held: "route",
    run: async () => {
      const m = await import("@/app/(site)/w/[username]/render-site")
      await m.siteMetadata(SITE.username, undefined, "about")
      return m.renderSite(SITE.username, undefined, "about")
    },
  },
  {
    name: "site-product",
    held: "route",
    run: async () => {
      const m = await import("@/app/(site)/w/[username]/products/[slug]/page")
      const params = Promise.resolve({ username: SITE.username, slug: SITE.productSlug })
      await m.generateMetadata({ params })
      return m.default({ params })
    },
  },
  {
    name: "site-products",
    held: "route",
    run: async () => {
      const m = await import("@/app/(site)/w/[username]/products/page")
      const params = Promise.resolve({ username: SITE.username })
      const searchParams = Promise.resolve({})
      if ("generateMetadata" in m && typeof m.generateMetadata === "function") await (m.generateMetadata as (p: unknown) => Promise<unknown>)({ params, searchParams })
      return (m.default as (p: unknown) => Promise<unknown>)({ params, searchParams })
    },
  },
  {
    name: "site-collection",
    held: "route",
    run: async () => {
      const m = await import("@/app/(site)/w/[username]/collections/[handle]/page")
      const params = Promise.resolve({ username: SITE.username, handle: SITE.collectionHandle })
      const searchParams = Promise.resolve({})
      if ("generateMetadata" in m && typeof m.generateMetadata === "function") await (m.generateMetadata as (p: unknown) => Promise<unknown>)({ params, searchParams })
      return (m.default as (p: unknown) => Promise<unknown>)({ params, searchParams })
    },
  },
  {
    name: "explore",
    held: "route",
    run: async () => {
      const m = await import("@/app/(storelib)/(marketing)/explore/page")
      return (m.default as (p: unknown) => Promise<unknown>)({ searchParams: Promise.resolve({}) })
    },
  },
  {
    name: "creator-page",
    held: "route",
    run: async () => {
      const layout = await import("@/app/(storelib)/(marketing)/u/[username]/layout")
      const page = await import("@/app/(storelib)/(marketing)/[sellername]/page")
      const params = Promise.resolve({ sellername: SITE.username })
      const searchParams = Promise.resolve({})
      const [, , body] = await Promise.all([
        (layout.default as (p: unknown) => Promise<unknown>)({ children: null, params: Promise.resolve({ username: SITE.username }) }),
        page.generateMetadata({ params, searchParams } as never),
        page.default({ params, searchParams } as never),
      ])
      return body
    },
  },
  {
    name: "marketplace-product",
    held: "route",
    run: async () => {
      const page = await import("@/app/(storelib)/(marketing)/p/[slug]/page")
      const params = Promise.resolve({ slug: SITE.productSlug })
      const searchParams = Promise.resolve({})
      const [, body] = await Promise.all([page.generateMetadata({ params } as never), (page.default as (p: unknown) => Promise<unknown>)({ params, searchParams })])
      return body
    },
  },
  {
    name: "app-home (signed in)",
    held: "per visit (private)",
    cookies: signedInCookies(SITE.userId),
    headers: { host: "storelib.com", "user-agent": "Mozilla/5.0 (iPhone)" },
    run: async () => {
      const layout = await import("@/app/(storelib)/app/layout")
      const page = await import("@/app/(storelib)/app/page")
      const [, body] = await Promise.all([
        (layout.default as (p: unknown) => Promise<unknown>)({ children: null }),
        (page.default as (p: unknown) => Promise<unknown>)({ searchParams: Promise.resolve({}) }),
      ])
      return body
    },
  },
  {
    name: "explore-category",
    held: "route",
    run: async () => {
      const m = await import("@/app/(storelib)/(marketing)/explore/[category]/page")
      return (m.default as (p: unknown) => Promise<unknown>)({ params: Promise.resolve({ category: "design" }), searchParams: Promise.resolve({}) })
    },
  },
  {
    name: "community-landing",
    held: "route",
    run: async () => {
      const layout = await import("@/app/(storelib)/(marketing)/community/[slug]/layout")
      const page = await import("@/app/(storelib)/(marketing)/community/[slug]/page")
      const params = Promise.resolve({ slug: "maya-club" })
      const [, , body] = await Promise.all([
        (layout.default as (p: unknown) => Promise<unknown>)({ children: null, params }),
        page.generateMetadata({ params }),
        (page.default as (p: unknown) => Promise<unknown>)({ params, searchParams: Promise.resolve({}) }),
      ])
      return body
    },
  },
  ...(["products", "orders", "customers"] as const).map((name) => ({
    name: `app-${name} (signed in)`,
    held: "per visit (private)",
    cookies: signedInCookies(SITE.userId),
    headers: { host: "storelib.com", "user-agent": "Mozilla/5.0 (iPhone)" },
    run: async () => {
      const pages = {
        products: () => import("@/app/(storelib)/app/products/page"),
        orders: () => import("@/app/(storelib)/app/orders/page"),
        customers: () => import("@/app/(storelib)/app/customers/page"),
      }
      const page = await pages[name]()
      return (page.default as (p: unknown) => Promise<unknown>)({ searchParams: Promise.resolve({}), params: Promise.resolve({}) })
    },
  })),
  {
    name: "view beacon (POST /api/track-view)",
    held: "per view, after the page",
    headers: { host: "maya.storelib.com", origin: "https://maya.storelib.com", "sec-fetch-site": "same-origin", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "x-forwarded-for": "203.0.113.7" },
    run: async () => {
      const route = await import("@/app/api/track-view/route")
      const { NextRequest } = await import("next/server")
      const req = new NextRequest("https://maya.storelib.com/api/track-view", {
        method: "POST",
        headers: { host: "maya.storelib.com", origin: "https://maya.storelib.com", "sec-fetch-site": "same-origin", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "x-forwarded-for": "203.0.113.7", "content-type": "text/plain" },
        body: JSON.stringify({ creatorId: SITE.creatorId, href: "https://maya.storelib.com/about" }),
      })
      const res = (await route.POST(req as never)) as Response
      return `status ${res.status}`
    },
  },
  {
    name: "onepage",
    held: "route",
    headers: { host: "storelib.me", "x-forwarded-for": "203.0.113.9", "user-agent": "Mozilla/5.0 (iPhone)" },
    run: async () => {
      const m = await import("@/app/(storelib)/(marketing)/l/[slug]/page")
      const params = Promise.resolve({ slug: ONEPAGE.slug })
      await m.generateMetadata({ params })
      return m.default({ params, searchParams: Promise.resolve({}) })
    },
  },
]

/**
 * What React does with the element a page returns, as far as the database
 * is concerned: every async server component placed in it (a tracking tag,
 * a block that reads its own rows) is called and awaited, all the way down.
 * Client components are not called: they run in the browser.
 */
async function resolveTree(node: unknown, depth = 0): Promise<void> {
  if (!node || depth > 400 || typeof node !== "object") return
  if (Array.isArray(node)) {
    await Promise.all(node.map((n) => resolveTree(n, depth + 1)))
    return
  }
  const el = node as { $$typeof?: unknown; type?: unknown; props?: Record<string, unknown> }
  if (!el.$$typeof) return
  if (typeof el.type === "function" && el.type.constructor?.name === "AsyncFunction") {
    const out = await (el.type as (p: unknown) => Promise<unknown>)(el.props ?? {})
    await resolveTree(out, depth + 1)
    return
  }
  await Promise.all(Object.values(el.props ?? {}).map((v) => resolveTree(v, depth + 1)))
}

const rendered = (s: Scenario) => async () => {
  const value = await s.run()
  await resolveTree(value)
  return value
}

/** Next's route config, read from the module: what decides whether a page is kept. */
async function heldBy(name: string): Promise<string> {
  const mods: Record<string, () => Promise<Record<string, unknown>>> = {
    "site-home": () => import("@/app/(site)/w/[username]/page"),
    "site-about": () => import("@/app/(site)/w/[username]/[page]/page"),
    "site-product": () => import("@/app/(site)/w/[username]/products/[slug]/page"),
    "site-products": () => import("@/app/(site)/w/[username]/products/page"),
    "site-collection": () => import("@/app/(site)/w/[username]/collections/[handle]/page"),
    explore: () => import("@/app/(storelib)/(marketing)/explore/page"),
    onepage: () => import("@/app/(storelib)/(marketing)/l/[slug]/page"),
    "creator-page": () => import("@/app/(storelib)/(marketing)/[sellername]/page"),
    "marketplace-product": () => import("@/app/(storelib)/(marketing)/p/[slug]/page"),
    "community-landing": () => import("@/app/(storelib)/(marketing)/community/[slug]/page"),
    "explore-category": () => import("@/app/(storelib)/(marketing)/explore/[category]/page"),
  }
  const m = await mods[name]?.()
  if (!m) return scenarios.find((s) => s.name === name)?.held ?? "?"
  if (m.dynamic === "force-dynamic") return "no (per visit)"
  if (typeof m.revalidate === "number") return `ISR ${m.revalidate}s`
  return "default"
}

function summary(label: string, r: VisitResult<unknown>, ms0: number) {
  const err = r.error as { kind?: string; message?: string } | undefined
  return {
    label,
    /* Counted after the refreshes behind the visit have finished, so they are all in. */
    trips: r.trips.filter((t) => !t.background).length,
    behind: r.trips.filter((t) => t.background).length,
    ms: r.ms,
    ms0,
    error: err ? (err.kind ? `${err.kind}${(err as { to?: string }).to ? ` ${(err as { to?: string }).to}` : ""}` : String(err.message ?? err).slice(0, 120)) : null,
    tables: r.trips.map((t) => `${t.background ? "~" : ""}${t.table}${process.env.TIMELINE ? `@${Math.round(t.at - r.started)}` : ""}`),
    answer: typeof r.value === "string" ? r.value : null,
  }
}

function withChanges(s: Scenario) {
  const f = buildFixture()
  s.fixture?.(f)
  return f
}

async function measure(s: Scenario) {
  const visits = []
  const rtt = Number(process.env.RTT ?? 20)
  for (const [label, advance] of [["first", 0], ["repeat", 5_000], ["after 2 min", 120_000]] as const) {
    clock.advance(advance)
    useFixture(withChanges(s))
    setRtt(rtt)
    const r = await visit(rendered(s), { cookies: s.cookies, headers: s.headers })
    await Promise.allSettled(pending.splice(0))
    /* The same visit with no network, for the server's own time. */
    visits.push({ r, label })
  }
  /* ms@0: a separate warm run per visit shape, with the round trip at zero. */
  const out = []
  resetCache()
  for (const [i, [label, advance]] of ([["first", 0], ["repeat", 5_000], ["after 2 min", 120_000]] as const).entries()) {
    clock.advance(advance)
    useFixture(withChanges(s))
    setRtt(0)
    const r0 = await visit(rendered(s), { cookies: s.cookies, headers: s.headers })
    await Promise.allSettled(pending.splice(0))
    out.push(summary(label, visits[i].r, r0.ms))
  }
  setRtt(rtt)
  return out
}

/*
  A PUBLISH, AS A VISITOR SEES IT (round AM). One server, the imported
  theme's front page: the first visitor after boot, the next one (held), a
  page nobody opened yet on the now warm server, then a Publish (the real
  revalidatePublishedSite, with a new published_at as Publish writes) and
  the visitors after it. CACHE_RTT is what each answer from the shared data
  cache costs (on Vercel a request to it; 0 in memory here otherwise).
  Each step says its time, its database round trips and the page's own
  Server-Timing.
*/
async function compatTimed(path: string) {
  const { sealSite } = await import("@/lib/storelib-theme/compat/site-seal")
  const { strangerMarker } = await import("@/lib/storelib-theme/compat/anonymous-cache")
  const route = await import("@/app/api/site-theme/site/[username]/[[...path]]/route")
  const { NextRequest } = await import("next/server")
  const host = "maya.storelib.com"
  const marker = strangerMarker({ host, country: "US", locale: null, market: null })!
  const segs = [marker, ...path.split("/").filter(Boolean)]
  const headers: Record<string, string> = { host, "x-forwarded-host": host, accept: "text/html", "sec-fetch-dest": "document", "x-storelib-site-country": "US", "user-agent": "Mozilla/5.0 (iPhone)" }
  const seal = await sealSite(SITE.username, host)
  if (seal) headers["x-storelib-theme-site"] = seal
  const res = (await route.GET(new NextRequest(`https://${host}/api/site-theme/site/${SITE.username}/${segs.join("/")}`, { headers }), { params: Promise.resolve({ username: SITE.username, path: segs }) })) as Response
  const body = await res.text()
  return { status: res.status, held: res.headers.get("x-storelib-held"), timing: res.headers.get("server-timing"), bytes: body.length, theme: /PUBLISHED-AGAIN/.test(body) ? "new" : "old" }
}

async function publishFlow() {
  const { revalidatePublishedSite } = await import("@/lib/website-builder/published-site")
  const f = buildFixture()
  compatFixture(f)
  f.tables.custom_domains = f.tables.custom_domains.filter((r) => r.creator_id !== SITE.creatorId)
  useFixture(f)
  await import("@/app/api/site-theme/site/[username]/[[...path]]/route")
  resetCache()
  const rtt = Number(process.env.RTT ?? 20)
  setRtt(rtt)
  const steps: { step: string; ms: number; trips: number; tables: string; held: string | null; timing: string | null; theme: string }[] = []
  const step = async (label: string, path: string) => {
    clock.advance(1_000)
    const r = await visit(() => compatTimed(path))
    await Promise.allSettled(pending.splice(0))
    const v = r.value as Awaited<ReturnType<typeof compatTimed>> | undefined
    steps.push({ step: label, ms: Math.round(r.ms), trips: r.trips.filter((t) => !t.background).length, tables: r.trips.filter((t) => !t.background).map((t) => t.table).join(" "), held: v?.held ?? null, timing: v?.timing ?? (r.error ? String((r.error as Error).message ?? r.error).slice(0, 80) : null), theme: v?.theme ?? "?" })
  }
  await step("first visitor after boot", "/")
  await step("second visitor (held)", "/")
  await step("third visitor (held)", "/")
  await step("a page nobody opened yet, warm server", "/collections/maya-best")
  /* Publish: the live rows change (a new heading on the front page), published_at moves on, the caches are told. */
  const install = f.tables.store_theme_installs.find((r) => r.id === SITE.installId) as Record<string, unknown>
  install.published_at = new Date(clock.now()).toISOString()
  const files = f.tables.store_theme_custom_files as { path: string; content: string }[]
  const layout = files.find((r) => /(^|\/)layout\/theme(\.liquid)?$/.test(r.path)) ?? files.find((r) => /layout/.test(r.path))
  if (layout) layout.content = layout.content.replace(/<\/body>/i, "<span hidden>PUBLISHED-AGAIN</span></body>")
  if (process.env.FLOW_DEBUG) console.error("layout", files.slice(0, 5).map((r) => r.path).join(" "), layout?.path, layout?.content.includes("PUBLISHED-AGAIN"), install.published_at)
  await visit(() => revalidatePublishedSite(SITE.creatorId))
  await Promise.allSettled(pending.splice(0))
  await step("first visitor after Publish", "/")
  await step("second visitor after Publish", "/")
  await step("another page after Publish", "/collections/maya-best")
  console.log(JSON.stringify({ flow: steps }))
}

async function main() {
  if (process.env.PUBLISH_FLOW) return publishFlow()
  if (process.env.SPEED18_LIST) {
    console.log(JSON.stringify({ names: scenarios.map((s) => s.name) }))
    return
  }
  const only = (process.env.ONLY ?? "").split(",").filter(Boolean)
  const rows = []
  for (const s of scenarios) {
    if (only.length && !only.includes(s.name)) continue
    resetCache()
    /* Warm the module graph so the first visit is not timing imports. */
    useFixture(withChanges(s))
    setRtt(0)
    await visit(s.warm ?? rendered(s), { cookies: s.cookies, headers: s.headers })
    await Promise.allSettled(pending.splice(0))
    resetCache()
    const visits = await measure(s)
    rows.push({ name: s.name, held: await heldBy(s.name), visits })
  }
  const missing = missingRelations()
  if (missing.length) console.error(`fixture has no relation for: ${missing.join(", ")}`)
  console.log(JSON.stringify({ rows, missing }))
}

void EXPLORE
main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
