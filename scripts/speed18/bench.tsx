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

type Scenario = {
  name: string
  held: string
  run: () => Promise<unknown>
  /** Loads the modules without warming what is measured (the proxy keeps its answers per server). */
  warm?: () => Promise<unknown>
  cookies?: Record<string, string>
  headers?: Record<string, string>
}

/* Every clock in the process moves with the bench's, so a TTL kept with Date.now() runs out too. */
Date.now = clock.now

async function proxyVisit(url: string) {
  const { proxy } = await import("@/proxy")
  const { NextRequest } = await import("next/server")
  const res = (await proxy(new NextRequest(url, { headers: { host: new URL(url).host, "user-agent": "Mozilla/5.0 (iPhone)", accept: "text/html" } }))) as Response
  const to = res.headers.get("x-middleware-rewrite") ?? res.headers.get("location") ?? `status ${res.status}`
  return to
}

const scenarios: Scenario[] = [
  {
    name: "proxy: maya.storelib.com/",
    held: "proxy runs on every visit",
    warm: () => proxyVisit("https://leo.storelib.com/"),
    run: () => proxyVisit("https://maya.storelib.com/"),
  },
  {
    name: "proxy: www.mayastudio.com/",
    held: "proxy runs on every visit",
    warm: () => proxyVisit("https://www.leostudio.com/"),
    run: () => proxyVisit("https://www.mayastudio.com/products/maya-product-3"),
  },
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
      const m = await import("@/app/(marketing)/explore/page")
      return (m.default as (p: unknown) => Promise<unknown>)({ searchParams: Promise.resolve({}) })
    },
  },
  {
    name: "creator-page",
    held: "route",
    run: async () => {
      const layout = await import("@/app/(marketing)/u/[username]/layout")
      const page = await import("@/app/(marketing)/[sellername]/page")
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
      const page = await import("@/app/(marketing)/p/[slug]/page")
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
      const layout = await import("@/app/app/layout")
      const page = await import("@/app/app/page")
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
      const m = await import("@/app/(marketing)/explore/[category]/page")
      return (m.default as (p: unknown) => Promise<unknown>)({ params: Promise.resolve({ category: "design" }), searchParams: Promise.resolve({}) })
    },
  },
  {
    name: "community-landing",
    held: "route",
    run: async () => {
      const layout = await import("@/app/(marketing)/community/[slug]/layout")
      const page = await import("@/app/(marketing)/community/[slug]/page")
      const params = Promise.resolve({ slug: "maya-club" })
      const [, , body] = await Promise.all([
        (layout.default as (p: unknown) => Promise<unknown>)({ children: null, params }),
        page.generateMetadata({ params }),
        (page.default as (p: unknown) => Promise<unknown>)({ params, searchParams: Promise.resolve({}) }),
      ])
      return body
    },
  },
  {
    name: "onepage",
    held: "route",
    headers: { host: "storelib.me", "x-forwarded-for": "203.0.113.9", "user-agent": "Mozilla/5.0 (iPhone)" },
    run: async () => {
      const m = await import("@/app/(marketing)/l/[slug]/page")
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
    explore: () => import("@/app/(marketing)/explore/page"),
    onepage: () => import("@/app/(marketing)/l/[slug]/page"),
    "creator-page": () => import("@/app/(marketing)/[sellername]/page"),
    "marketplace-product": () => import("@/app/(marketing)/p/[slug]/page"),
    "community-landing": () => import("@/app/(marketing)/community/[slug]/page"),
    "explore-category": () => import("@/app/(marketing)/explore/[category]/page"),
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
    tables: r.trips.map((t) => `${t.background ? "~" : ""}${t.table}`),
    answer: typeof r.value === "string" ? r.value : null,
  }
}

async function measure(s: Scenario) {
  const visits = []
  const rtt = Number(process.env.RTT ?? 20)
  for (const [label, advance] of [["first", 0], ["repeat", 5_000], ["after 2 min", 120_000]] as const) {
    clock.advance(advance)
    useFixture(buildFixture())
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
    useFixture(buildFixture())
    setRtt(0)
    const r0 = await visit(rendered(s), { cookies: s.cookies, headers: s.headers })
    await Promise.allSettled(pending.splice(0))
    out.push(summary(label, visits[i].r, r0.ms))
  }
  setRtt(rtt)
  return out
}

async function main() {
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
    useFixture(buildFixture())
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
