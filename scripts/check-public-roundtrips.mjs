/**
 * ===========================================================================
 *  WHAT ONE ANONYMOUS VISITOR COSTS, ON EVERY PUBLIC PAGE
 * ===========================================================================
 * This checkout's production build (`next start`), reading the Supabase stub
 * (scripts/supabase-stub-server.mjs) with one creator: a published OnePage
 * whose blocks name two products, a creator page, the products, a public
 * community. Each public address is asked for FOUR times in a row by a
 * stranger (a browser's headers, no cookie), and for each answer it prints:
 *
 *   status     the answer's status
 *   cache      its Cache-Control, as a CDN would read it
 *   db 1st     Supabase requests the server made for the first visit
 *   db 4th     the same for the fourth, when anything held is warm
 *   writes     of those, how many wrote (POST, PATCH, DELETE)
 *
 * and then each page once more for a signed in person, flagging any answer
 * that carries a header a shared cache would keep (public, s-maxage).
 *
 * Requests are counted from the moment the page is asked for until 400ms
 * after its last byte, so work done after the answer (next/server `after`)
 * counts against the visit that caused it. The browser's own beacons are
 * asked for separately, as the page would send them.
 *
 * Build it pointed at the stub first (the placeholders from CLAUDE.md, with
 * NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321), then:
 *
 *   node scripts/check-public-roundtrips.mjs              print the table
 *   node scripts/check-public-roundtrips.mjs --json F     also write the figures to F
 *   BASE=http://127.0.0.1:3991 node scripts/check-public-roundtrips.mjs
 */
import { spawn } from "node:child_process"
import { existsSync, writeFileSync } from "node:fs"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const BASE = (process.env.BASE || "http://127.0.0.1:3991").replace(/\/$/, "")
const args = process.argv.slice(2)
const jsonAt = args.indexOf("--json")
const JSON_OUT = jsonAt >= 0 ? args[jsonAt + 1] : null
const VISITS = 4
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(".next/BUILD_ID")) { console.error("No production build. Build pointed at the stub first (see the top of this file)."); process.exit(1) }

/* ── The fixture ───────────────────────────────────────────────────────── */
const HANDLE = "satori"
const at = "2026-10-01T10:00:00.000Z"
const USER = "11111111-1111-4111-8111-111111111111"
const C = "22222222-2222-4222-8222-222222222222"
const ONEPAGE = "66666666-6666-4666-8666-000000000001"
const COMMUNITY = "44444444-4444-4444-8444-000000000001"
const product = (n) => ({
  id: `33333333-3333-4333-8333-00000000000${n}`, creator_id: C, seller_id: C, title: `Loop Pack ${n}`, slug: `loop-pack-${n}`, description: "Loops, made in Cluj.", price_cents: 2900, currency: "usd",
  status: "published", archived: false, type: "digital", product_type: "digital", thumbnail_url: null, gallery_urls: [], images: [], created_at: at, updated_at: at,
  product_categories: [], creators: { user_id: USER }, reviews_count: 0, reviews_average: 0, sales_count: 1, category: "music", pay_what_you_want: false, pwyw_min_price_cents: null, compare_at_cents: null, whats_included: [], faqs: [],
})
const products = [1, 2, 3].map(product)
const block = (i, p) => ({ id: `blk-${i}`, type: "product", enabled: true, sort_order: i, data: { product_id: p.id, product_title: p.title, product_slug: p.slug, product_price_cents: 2900, cta_text: "Get it", show_price: true, style: "preview" } })
const blocks = [block(1, products[0]), block(2, products[1]), { id: "blk-link", type: "link", enabled: true, sort_order: 3, data: { title: "My site", url: "https://example.com" } }]
const tables = {
  profiles: [{ id: USER, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Loops and kits", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at }],
  creators: [{ id: C, user_id: USER, slug: HANDLE, username: HANDLE, display_name: "Satori Studio", avatar_url: null, bio: "Loops and kits", onboarding_completed: true, store_published: true, banned_at: null, stripe_account_id: null, stripe_onboarding_status: "not_connected", payouts_enabled: false, charges_enabled: false, subscription_plan_id: "free", currency: "usd", created_at: at }],
  products,
  onepages: [{
    id: ONEPAGE, slug: HANDLE, status: "published", seller_id: C, creator_id: C, owner_id: USER, title: "Satori Studio", bio: "Loops and kits", theme: {}, settings: {}, social_links: {},
    draft_blocks: blocks, published_blocks: blocks, published_theme: {}, published_profile: { title: "Satori Studio", bio: "Loops and kits", avatar_url: null }, published_social_links: {},
    created_at: at, updated_at: at, published_at: at,
  }],
  communities: [{ id: COMMUNITY, slug: "loop-club", name: "Loop Club", description: "Producers sharing loops.", status: "published", visibility: "public", creator_id: C, owner_id: USER, created_at: at, updated_at: at, member_count: 3, price_cents: 0 }],
  store_builder_configs: [], follows: [], reviews: [], custom_domains: [], seo_overrides: [], username_history: [], store_theme_installs: [], product_variants: [], product_slug_history: [],
  onepage_slug_history: [], onepage_views: [], analytics_events: [], rate_limit_hits: [],
}

/* ── The stub, told apart: the browser sends an Origin, the server does not ── */
const person = { id: USER, aud: "authenticated", role: "authenticated", email: "hi@satori.studio", email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: { full_name: "Satori Studio" }, created_at: at, updated_at: at }
const stub = await serveSupabaseStub({ port: 54321, tables, users: [person] })
const hits = []
stub.server.on("request", (req) => {
  if (req.method === "OPTIONS" || req.headers.origin) return
  hits.push({ at: Date.now(), method: req.method, what: `${req.method} ${req.url.split("?")[0]}` })
})

const env = {
  ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder",
}
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", new URL(BASE).port, "-H", "127.0.0.1"], { env, stdio: ["ignore", "pipe", "pipe"] })
let serverOut = ""
next.stdout.on("data", (d) => { serverOut += d })
next.stderr.on("data", (d) => { serverOut += d })
let up = false
for (let i = 0; i < 150 && !up; i++) {
  try { up = (await fetch(`${BASE}/robots.txt`)).status < 500 } catch { await sleep(200) }
}
if (!up) { console.error(`next start did not come up\n${serverOut.slice(-2000)}`); process.exit(1) }
process.on("exit", () => { next.kill(); stub.server.close() })

const BROWSER = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "x-forwarded-for": "203.0.113.7",
}

/** One request, and the database requests it caused (until 400ms after its last byte). */
async function visit(path, init = {}) {
  const from = hits.length
  const t0 = Date.now()
  const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...init, headers: { ...BROWSER, ...(init.headers || {}) } })
  await res.arrayBuffer()
  const ms = Date.now() - t0
  await sleep(400)
  const caused = hits.slice(from)
  return {
    status: res.status,
    cache: res.headers.get("cache-control") || "",
    ms,
    db: caused.length,
    writes: caused.filter((h) => h.method !== "GET" && h.method !== "HEAD").length,
    what: caused.map((h) => h.what),
  }
}

const SURFACES = [
  ["OnePage /l/<slug>", `/l/${HANDLE}`],
  ["OnePage /<handle>/links", `/${HANDLE}/links`],
  ["Creator page /<handle>", `/${HANDLE}`],
  ["Product /p/<slug>", `/p/${products[0].slug}`],
  ["Product /<handle>/<slug>", `/${HANDLE}/${products[0].slug}`],
  ["Explore /explore", "/explore"],
  ["Community /community/<slug>", "/community/loop-club"],
  ["Community about", "/community/loop-club/about"],
  ["Website /w/<handle>", `/w/${HANDLE}`],
]

const BEACONS = [
  ["page view beacon /api/track-view", "/api/track-view", { creatorId: C, href: `${BASE}/l/${HANDLE}`, sessionId: "s_probe_1", visitorId: "v_probe_1" }],
  ["OnePage link click /api/onepage/track", "/api/onepage/track", { onepage_id: ONEPAGE, block_id: "blk-link", event_type: "click", url: "https://example.com", href: `${BASE}/l/${HANDLE}` }],
  ["blog view /api/blog/track", "/api/blog/track", { postId: "55555555-5555-4555-8555-000000000001" }],
]

const rows = []
for (const [label, path] of SURFACES) {
  const runs = []
  for (let i = 0; i < VISITS; i++) runs.push(await visit(path))
  rows.push({ label, path, status: runs[0].status, cache: runs[VISITS - 1].cache, first: runs[0].db, warm: runs[VISITS - 1].db, writesWarm: runs[VISITS - 1].writes, msWarm: runs[VISITS - 1].ms, warmWhat: runs[VISITS - 1].what })
}
for (const [label, path, body] of BEACONS) {
  const runs = []
  for (let i = 0; i < VISITS; i++) {
    runs.push(await visit(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", origin: BASE, "sec-fetch-site": "same-origin", "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", referer: `${BASE}/l/${HANDLE}` } }))
  }
  rows.push({ label, path, status: runs[0].status, cache: runs[VISITS - 1].cache, first: runs[0].db, warm: runs[VISITS - 1].db, writesWarm: runs[VISITS - 1].writes, msWarm: runs[VISITS - 1].ms, warmWhat: runs[VISITS - 1].what })
}

/*
  SIGNED IN: the same pages for somebody with a session. Whatever they are
  drawn with (an owner's Edit, a buyer's Download, their interests), the
  answer must never carry a header a shared cache would keep.
*/
const session = stub.sessionCookie(USER)
const signedIn = []
for (const [label, path] of SURFACES) {
  const r = await visit(path, { headers: { cookie: `${session.name}=${session.value}` } })
  signedIn.push({ label, path, status: r.status, cache: r.cache, shared: /\bpublic\b|s-maxage/.test(r.cache) })
}

const pad = (s, n) => String(s).padEnd(n)
console.log(`\n${pad("surface", 40)}${pad("status", 8)}${pad("db 1st", 8)}${pad("db 4th", 8)}${pad("writes", 8)}cache (4th)`)
for (const r of rows) console.log(`${pad(r.label, 40)}${pad(r.status, 8)}${pad(r.first, 8)}${pad(r.warm, 8)}${pad(r.writesWarm, 8)}${r.cache}`)
console.log(`\n${pad("signed in", 40)}${pad("status", 8)}cache`)
for (const r of signedIn) console.log(`${pad(r.label, 40)}${pad(r.status, 8)}${r.cache}${r.shared ? "   <- SHARED CACHE HEADER ON A SIGNED IN ANSWER" : ""}`)
if (process.env.VERBOSE) for (const r of rows) console.log(`\n${r.label} (4th visit):\n  ${r.warmWhat.join("\n  ") || "(nothing)"}`)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ measuredAt: new Date().toISOString(), rows, signedIn }, null, 2))
process.exit(0)
