/**
 * ===========================================================================
 *  PUBLIC PAGES WITH THE DATABASE TAKEN AWAY, ON A LOCAL BUILD (round 49)
 * ===========================================================================
 * Starts, in front of `next start` of the build in this directory:
 *
 *   :54321  what the app calls "Supabase". /storage/v1/* is answered here
 *           from memory (the stored copies' bucket, lib/edge/snapshot-store.ts);
 *           everything else (PostgREST, Auth) is passed to the database stub
 *           on :54331 (scripts/supabase-stub-server.mjs), until it is killed.
 *   :54322  GET  /            database requests by table, and the objects kept
 *           POST /kill-db     every connection to the database stub is dropped,
 *                             as when Postgres is away. Storage
 *                             stays up (see EDGE_FAILOVER.md for when it does not)
 *           POST /revive-db   back again
 *           POST /install-status?to=unpublished   lena's site as Unpublish leaves it
 *                             (the stub forgets writes, so the route's own cannot)
 *           POST /restart-app `next start` stopped and started again: a cold
 *                             server that holds nothing in memory
 *
 * The fixture: lena's published Storelib theme website (as round 48's,
 * scripts/serve-site-stub-r48.mjs) with a connected domain www.lenashop.test,
 * satori's OnePage and the Loop Club community (scripts/check-public-roundtrips.mjs).
 * A signed in lena for the publish route: the cookie is printed.
 *
 * Build pointed at :54321 first (the placeholders from CLAUDE.md with
 * NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321). PORT=3949 by default.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { createServer, request as httpRequest } from "node:http"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const PORT = Number(process.env.PORT || 3949)
const FRONT = 54321
const DB = 54331
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build here. Build pointed at the stub first (see the top of this file).")
  process.exit(1)
}

/* ── The fixture ───────────────────────────────────────────────────────── */
const at = "2026-10-01T10:00:00.000Z"
const U = "11111111-1111-4111-8111-1111111111cc"
const C = "22222222-2222-4222-8222-2222222222cc"
const I = "44444444-4444-4444-8444-4444444444cc"
const U2 = "11111111-1111-4111-8111-111111111111"
const C2 = "22222222-2222-4222-8222-222222222222"
const ONEPAGE = "66666666-6666-4666-8666-000000000001"
const COMMUNITY = "44444444-4444-4444-8444-000000000001"
const sections = ["header", "hero_centered", "features_grid", "text_image", "faq_accordion", "footer"].map((type, i) => ({ id: `${type}-${i}`, type, name: type, settings: {}, blocks: [] }))
const product = (n, creator, user) => ({
  id: `33333333-3333-4333-8333-0000000000${creator === C ? "c" : "0"}${n}`, creator_id: creator, seller_id: creator, title: `Loop Pack ${n}`, slug: `loop-pack-${n}`, description: "Loops, made in Cluj.", price_cents: 2900, currency: "usd",
  status: "published", archived: false, type: "digital", product_type: "digital", thumbnail_url: null, gallery_urls: [], images: [], created_at: at, updated_at: at,
  product_categories: [], creators: { user_id: user }, reviews_count: 0, reviews_average: 0, sales_count: 1, category: "music", pay_what_you_want: false, pwyw_min_price_cents: null, compare_at_cents: null, whats_included: [], faqs: [],
})
const settings = { id: "s1", install_id: I, settings: {}, draft_settings: null, created_at: at, updated_at: at }
const page = { id: "p1", install_id: I, page_key: "home", sections, draft_sections: null, created_at: at, updated_at: at }
const satoriProducts = [1, 2].map((n) => product(n, C2, U2))
const block = (i, p) => ({ id: `blk-${i}`, type: "product", enabled: true, sort_order: i, data: { product_id: p.id, product_title: p.title, product_slug: p.slug, product_price_cents: 2900, cta_text: "Get it", show_price: true, style: "preview" } })
const blocks = [block(1, satoriProducts[0]), { id: "blk-link", type: "link", enabled: true, sort_order: 3, data: { title: "My site", url: "https://example.com" } }]
const tables = {
  profiles: [
    { id: U, username: "lena", display_name: "Lena", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at },
    { id: U2, username: "satori", display_name: "Satori Studio", avatar_url: null, bio: "Loops and kits", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at },
  ],
  creators: [
    { id: C, user_id: U, slug: "lena", username: "lena", name: "Lena", display_name: "Lena", onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", currency: "usd", created_at: at },
    { id: C2, user_id: U2, slug: "satori", username: "satori", display_name: "Satori Studio", avatar_url: null, bio: "Loops and kits", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", currency: "usd", created_at: at },
  ],
  store_theme_installs: [{ id: I, creator_id: C, theme_id: "default", name: "Lena's site", status: "published", is_custom: false, sort_order: 0, created_at: at, updated_at: at, store_theme_settings: settings, settings, pages: [page] }],
  store_theme_settings: [settings],
  store_theme_pages: [page],
  products: [...[1, 2, 3].map((n) => product(n, C, U)), ...satoriProducts],
  custom_domains: [{ id: "d1", domain: "lenashop.test", creator_id: C, status: "active", purpose: "website", is_primary: true, ssl_status: "active", created_at: at, creator: { user_id: U } }],
  onepages: [{
    id: ONEPAGE, slug: "satori", status: "published", seller_id: C2, creator_id: C2, owner_id: U2, title: "Satori Studio", bio: "Loops and kits", theme: {}, settings: {}, social_links: {},
    draft_blocks: blocks, published_blocks: blocks, published_theme: {}, published_profile: { title: "Satori Studio", bio: "Loops and kits", avatar_url: null }, published_social_links: {},
    created_at: at, updated_at: at, published_at: at,
  }],
  communities: [{ id: COMMUNITY, slug: "loop-club", name: "Loop Club", description: "Producers sharing loops.", status: "published", visibility: "public", creator_id: C2, owner_id: U2, created_at: at, updated_at: at, member_count: 3, price_cents: 0 }],
  platform_flags: [{ key: "communities", enabled: true }],
  platform_settings: [{ key: "explore_marketplace", value: true }],
  username_history: [], product_variants: [], reviews: [], store_menus: [], site_releases: [], store_localization: [], store_builder_configs: [], follows: [], seo_overrides: [],
  product_slug_history: [], onepage_slug_history: [], onepage_views: [], analytics_events: [], rate_limit_hits: [], site_access: [], site_deployments: [],
}
tables.profiles_public = tables.profiles
tables.creators_public = tables.creators
const lena = { id: U, aud: "authenticated", role: "authenticated", email: "lena@example.test", email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: {}, created_at: at, updated_at: at }

/* ── The database stub, and the front that can lose it ─────────────────── */
const stub = await serveSupabaseStub({ port: DB, tables, user: lena, delayMs: Number(process.env.STUB_DELAY_MS || 0) })
let dbUp = true
const reads = {}
const objects = new Map()

function storage(req, res, path) {
  const send = (status, body) => {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(body))
  }
  let body = ""
  req.on("data", (d) => { body += d })
  req.on("end", () => {
    let m
    if (req.method === "POST" && (m = path.match(/^\/storage\/v1\/object\/list\/public-snapshots$/))) {
      const { prefix = "" } = JSON.parse(body || "{}")
      return send(200, [...objects.keys()].filter((k) => k.startsWith(`${prefix}/`) && !k.slice(prefix.length + 1).includes("/")).map((k) => ({ name: k.slice(prefix.length + 1) })))
    }
    if (req.method === "POST" && (m = path.match(/^\/storage\/v1\/object\/public-snapshots\/(.+)$/))) {
      objects.set(m[1], body)
      return send(200, { Key: `public-snapshots/${m[1]}` })
    }
    if (req.method === "GET" && (m = path.match(/^\/storage\/v1\/object\/(?:authenticated\/)?public-snapshots\/(.+)$/))) {
      if (!objects.has(m[1])) return send(400, { statusCode: "404", error: "not_found", message: "Object not found" })
      res.writeHead(200, { "content-type": "application/json" })
      return res.end(objects.get(m[1]))
    }
    if (req.method === "DELETE" && path === "/storage/v1/object/public-snapshots") {
      const { prefixes = [] } = JSON.parse(body || "{}")
      for (const k of prefixes) objects.delete(k)
      return send(200, [])
    }
    return send(404, { error: "not found" })
  })
}

const front = createServer((req, res) => {
  const path = req.url.split("?")[0]
  if (path.startsWith("/storage/v1/")) return storage(req, res, path)
  if (!req.headers.origin && req.method !== "OPTIONS") {
    const table = (path.match(/^\/rest\/v1\/(?:rpc\/)?([^/]+)/) || [])[1] || path
    reads[table] = (reads[table] || 0) + 1
  }
  if (!dbUp) {
    /* Postgres away: the connection is dropped, as a refused or reset connection is. */
    req.socket.destroy()
    return
  }
  const up = httpRequest({ hostname: "127.0.0.1", port: DB, path: req.url, method: req.method, headers: req.headers }, (r) => {
    res.writeHead(r.statusCode, r.headers)
    r.pipe(res)
  })
  up.on("error", () => req.socket.destroy())
  req.pipe(up)
}).listen(FRONT, "127.0.0.1")

const control = createServer((req, res) => {
  const done = (body) => {
    res.writeHead(200, { "content-type": "application/json" })
    res.end(JSON.stringify(body))
  }
  /* The front stops passing anything on: every connection to "Postgres" is dropped. The stub itself keeps running, so a revived database has the same signed in session. */
  if (req.method === "POST" && req.url === "/kill-db") {
    dbUp = false
    return done({ db: "down" })
  }
  if (req.method === "POST" && req.url === "/revive-db") {
    dbUp = true
    return done({ db: "up" })
  }
  if (req.method === "POST" && req.url.startsWith("/install-status")) {
    const to = new URL(req.url, "http://x").searchParams.get("to") || "published"
    for (const row of tables.store_theme_installs) row.status = to
    return done({ install: to })
  }
  if (req.method === "POST" && req.url === "/restart-app") {
    next.once("exit", () => {
      startApp()
      appUp().then((ok) => done({ app: ok ? "up" : "failed" }))
    })
    next.kill()
    return
  }
    if (req.method === "POST" && req.url === "/reset-reads") {
    for (const k of Object.keys(reads)) delete reads[k]
    return done({ ok: true })
  }
  done({ db: dbUp ? "up" : "down", reads, objects: [...objects.keys()] })
}).listen(FRONT + 1, "127.0.0.1")

const env = {
  ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${FRONT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder",
  /* A stored copy is asked for at this build, the host in the Host header (lib/edge/snapshot-capture.ts strangerFetch). */
  SNAPSHOT_FETCH_ORIGIN: `http://127.0.0.1:${PORT}`,
}
delete env.HTTPS_PROXY
delete env.https_proxy
let log = ""
let next = null
function startApp() {
  next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: ["ignore", "pipe", "pipe"] })
  next.stdout.on("data", (d) => { log += d; if (process.env.VERBOSE) process.stdout.write(d) })
  next.stderr.on("data", (d) => { log += d; if (process.env.VERBOSE) process.stderr.write(d) })
}
async function appUp() {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/robots.txt`)).status < 500) return true
    } catch {}
    await sleep(250)
  }
  return false
}
startApp()
const stop = () => { try { next.kill() } catch {} ; try { stub.server.close() } catch {} ; front.close(); control.close() }
process.on("exit", stop)
process.on("SIGINT", () => process.exit(130))
process.on("SIGTERM", () => process.exit(143))
const up = await appUp()
if (!up) { console.error(`next start did not come up\n${log.slice(-3000)}`); process.exit(1) }
const cookie = stub.sessionCookie()
console.log(`up: http://127.0.0.1:${PORT} (Host: lena.storelib.com, www.lenashop.test, storelib.me /satori, storelib.com /community/loop-club)`)
console.log(`lena's session cookie: ${cookie.name}=${cookie.value.slice(0, 24)}… (full value in /tmp file)`)
await import("node:fs").then((fs) => fs.writeFileSync(process.env.COOKIE_FILE || ".edge-stub-cookie", `${cookie.name}=${cookie.value}`))
