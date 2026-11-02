/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE ON A LOCAL PRODUCTION BUILD, FOR A LOAD TEST (round 48)
 * ===========================================================================
 * Starts the Supabase stub (scripts/supabase-stub-server.mjs) with one
 * creator, "lena", whose Storelib theme website is published (header, hero,
 * features, text and picture, FAQ, footer), and `next start` of the build in
 * this directory, then stays up until stopped. Then, for example:
 *
 *   node scripts/load/storefront.mjs --base http://127.0.0.1:3948 \
 *     --paths /w/lena,/w/lena/products --concurrency 25 --seconds 20
 *
 * and `curl http://127.0.0.1:54322/` for the database requests the
 * server made, by table.
 *
 * Build pointed at the stub first (the placeholders from CLAUDE.md, with
 * NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321).
 *
 *   PORT=3948          where next start listens
 *   STUB_DELAY_MS=20   every database answer that late, as across a network
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { createServer } from "node:http"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const PORT = Number(process.env.PORT || 3948)
const SUPA_PORT = 54321
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build here. Build pointed at the stub first (see the top of this file).")
  process.exit(1)
}

const U = "11111111-1111-4111-8111-1111111111cc"
const C = "22222222-2222-4222-8222-2222222222cc"
const I = "44444444-4444-4444-8444-4444444444cc"
const at = "2026-10-01T10:00:00.000Z"
const sections = ["header", "hero_centered", "features_grid", "text_image", "faq_accordion", "footer"].map((type, i) => ({ id: `${type}-${i}`, type, name: type, settings: {}, blocks: [] }))
const product = (n) => ({
  id: `33333333-3333-4333-8333-0000000000c${n}`, creator_id: C, seller_id: C, title: `Loop Pack ${n}`, slug: `loop-pack-${n}`, description: "Loops, made in Cluj.", price_cents: 2900, currency: "usd",
  status: "published", archived: false, type: "digital", product_type: "digital", thumbnail_url: null, gallery_urls: [], images: [], created_at: at, updated_at: at,
  product_categories: [], reviews_count: 0, reviews_average: 0, sales_count: 1, category: "music", pay_what_you_want: false, compare_at_cents: null, whats_included: [], faqs: [],
})
const settings = { id: "s1", install_id: I, settings: {}, draft_settings: null, created_at: at, updated_at: at }
const page = { id: "p1", install_id: I, page_key: "home", sections, draft_sections: null, created_at: at, updated_at: at }
const tables = {
  profiles: [{ id: U, username: "lena", display_name: "Lena", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at }],
  creators: [{ id: C, user_id: U, slug: "lena", username: "lena", name: "Lena", display_name: "Lena", onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", currency: "usd", created_at: at }],
  store_theme_installs: [{ id: I, creator_id: C, theme_id: "default", name: "Lena's site", status: "published", is_custom: false, sort_order: 0, created_at: at, updated_at: at, store_theme_settings: settings, settings, pages: [page] }],
  store_theme_settings: [settings],
  store_theme_pages: [page],
  products: [1, 2, 3].map(product),
  /* Lena's own domain, for a spike through the proxy's connected domain lookup (Host: www.lenashop.test). */
  custom_domains: [{ id: "d1", domain: "lenashop.test", creator_id: C, status: "active", purpose: "website", is_primary: true, ssl_status: "active", created_at: at, creator: { user_id: U } }],
  username_history: [], product_variants: [], reviews: [], store_menus: [], site_releases: [], store_localization: [],
}
tables.profiles_public = tables.profiles
tables.creators_public = tables.creators

const stub = await serveSupabaseStub({ port: SUPA_PORT, tables, delayMs: Number(process.env.STUB_DELAY_MS || 0) })
/* Database requests the server made, by table, at http://127.0.0.1:54322/ (a load test reads it beside its own numbers). */
const reads = {}
stub.server.on("request", (req) => {
  if (req.headers.origin || req.method === "OPTIONS") return
  const table = (req.url.split("?")[0].match(/^\/rest\/v1\/(?:rpc\/)?([^/]+)/) || [])[1] || req.url.split("?")[0]
  reads[table] = (reads[table] || 0) + 1
})
const counter = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" })
  res.end(JSON.stringify(reads))
}).listen(SUPA_PORT + 1, "127.0.0.1")

const env = {
  ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${SUPA_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder",
  STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder",
}
delete env.HTTPS_PROXY
delete env.https_proxy
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "127.0.0.1"], { env, stdio: ["ignore", "pipe", "pipe"] })
let log = ""
next.stdout.on("data", (d) => { log += d })
next.stderr.on("data", (d) => { log += d; if (process.env.VERBOSE) process.stderr.write(d) })
const stop = () => { try { next.kill() } catch {} ; stub.server.close(); counter.close() }
process.on("exit", stop)
process.on("SIGINT", () => process.exit(130))
process.on("SIGTERM", () => process.exit(143))
let up = false
for (let i = 0; i < 240 && !up; i++) {
  try { up = (await fetch(`http://127.0.0.1:${PORT}/robots.txt`)).status < 500 } catch { await sleep(250) }
}
if (!up) { console.error(`next start did not come up\n${log.slice(-3000)}`); process.exit(1) }
console.log(`up: http://127.0.0.1:${PORT}/w/lena`)
