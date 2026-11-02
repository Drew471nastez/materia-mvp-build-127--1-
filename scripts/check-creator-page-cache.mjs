/**
 * ===========================================================================
 *  A CREATOR PAGE AND A PRODUCT PAGE: WHAT A SHARED CACHE MAY HOLD (round 48)
 * ===========================================================================
 * Against this checkout's production build (`next start`), reading a Supabase
 * that answers from a fixture (scripts/supabase-stub-server.mjs), with one
 * creator, its products and a signed in owner. Build it pointed there first:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 (and the other
 *   placeholders from CLAUDE.md) pnpm build
 *   node scripts/check-creator-page-cache.mjs            (DIR=. PORT=3311)
 *
 * Checks, on /<handle> and /<handle>/<product>:
 *   - a stranger (no cookie, no Referer from Storelib) is answered
 *     `public, s-maxage=60, stale-while-revalidate=300`,
 *     with no Set-Cookie and nothing of the owner's in the page;
 *   - the owner (a session cookie) is answered `private, no-store`, with
 *     the owner's controls in the page;
 *   - a guest buyer's cookie (sl_owned), a chosen language (sl_lang) and a
 *     Referer from Storelib are answered `private, no-store`;
 *   - the personal address (?_pv=1) asked for by a stranger is still the
 *     stranger's page, publicly cacheable (the proxy takes it off).
 * BROWSER=1 also opens the owner's page in Chromium (Playwright) and checks
 * the address bar still says /<handle>: the personal address is the proxy's,
 * never the visitor's.
 * Exits 1 on any failure.
 */
import { spawn } from "node:child_process"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"

const DIR = process.env.DIR || "."
const PORT = Number(process.env.PORT || 3311)
/* localhost, not 127.0.0.1: Next names this machine localhost in the proxy's URLs, and a rewrite to another origin is proxied, not served. */
const BASE = `http://localhost:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const U = "11111111-1111-4111-8111-111111111111", C = "22222222-2222-4222-8222-222222222222", at = "2026-08-01T10:00:00.000Z"
const product = (n, title, price) => ({
  id: `33333333-3333-4333-8333-00000000000${n}`, creator_id: C, seller_id: C, user_id: U, title, slug: title.toLowerCase().replace(/\W+/g, "-"),
  description: `<p>${title}.</p>`, price, price_cents: Math.round(price * 100), currency: "usd", status: "published", archived: false, is_published: true,
  type: "digital", product_type: "digital", thumbnail_url: null, cover_image_url: null, images: [], created_at: `2026-08-0${n}T10:00:00.000Z`, updated_at: at,
  product_categories: [], reviews_count: 0, reviews_average: 0,
})
const user = { id: U, aud: "authenticated", role: "authenticated", email: "hi@satori.studio", email_confirmed_at: at, app_metadata: { provider: "email" }, user_metadata: {}, created_at: at, updated_at: at }
const T = {
  profiles: [{ id: U, username: "satori", display_name: "Satori Studio", avatar_url: null, bio: "Prints.", email_verified: true, is_creator: true, welcome_completed: true, created_at: at }],
  creators: [{ id: C, user_id: U, slug: "satori", username: "satori", display_name: "Satori Studio", avatar_url: null, bio: "Prints", onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", created_at: at }],
  products: [product(1, "A3 print", 24), product(2, "Poster pack", 48)],
  reviews: [], store_builder_configs: [], onepages: [], follows: [], entitlements: [], custom_domains: [], seo_overrides: [], username_history: [], orders: [], store_theme_installs: [],
}
for (const t of ["profiles", "creators", "products"]) T[`${t}_public`] = T[t]
const stub = await serveSupabaseStub({ port: 54321, tables: T, user })
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder", STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder" }
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT), "-H", "localhost"], { cwd: DIR, env, stdio: process.env.DEBUG ? "inherit" : "ignore" })
process.on("exit", () => { next.kill(); stub.server.close() })
for (let i = 0; i < 150; i++) { try { await fetch(`${BASE}/robots.txt`); break } catch { await sleep(200) } }

let failed = 0
const check = (name, ok, detail) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 300)}`}`); if (!ok) failed++ }
const owner = stub.sessionCookie()
const get = async (path, headers = {}) => {
  const r = await fetch(`${BASE}${path}`, { headers: { accept: "text/html", "accept-language": "en-US,en;q=0.9", ...headers }, redirect: "manual" })
  return { status: r.status, cc: r.headers.get("cache-control") || "", vary: r.headers.get("vary") || "", setCookie: r.headers.get("set-cookie"), html: await r.text() }
}
const SHARED = "public, s-maxage=60, stale-while-revalidate=300"
/* The owner's own controls: drawn only for the owner (components/storefront/owner-controls-lazy, the card owner menu). */
const OWNER_MARK = /Edit profile|data-owner-menu|data-product-owner-menu|aria-label="Product options"/
for (const path of ["/satori", "/satori/a3-print"]) {
  console.log(`\n${path}`)
  await get(path)
  const stranger = await get(path)
  check("a stranger: 200, held a minute by a shared cache", stranger.status === 200 && stranger.cc === SHARED, stranger.cc)
  check("  Next's own Vary on the RSC headers kept", /rsc/i.test(stranger.vary), stranger.vary)
  check("  no Set-Cookie", !stranger.setCookie, stranger.setCookie)
  check("  nothing of the owner's in it", !OWNER_MARK.test(stranger.html))
  const mine = await get(path, { cookie: `${owner.name}=${owner.value}` })
  check("the owner: private, no-store", mine.status === 200 && mine.cc === "private, no-store", { status: mine.status, cc: mine.cc })
  if (path === "/satori") check("  with the owner's controls in the page", OWNER_MARK.test(mine.html))
  for (const [what, headers] of [["a guest buyer (sl_owned)", { cookie: "sl_owned=x" }], ["a chosen language (sl_lang)", { cookie: "sl_lang=fr" }], ["a Referer from Storelib", { referer: "https://storelib.com/explore" }]]) {
    const r = await get(path, headers)
    check(`${what}: private, no-store`, r.cc === "private, no-store", r.cc)
  }
  const planted = await get(`${path}?_pv=1`)
  check("the personal address asked for by a stranger: still the stranger's page, shared", planted.status === 200 && planted.cc === SHARED && !OWNER_MARK.test(planted.html), planted.cc)
}
if (process.env.BROWSER) {
  const { createRequire } = await import("node:module")
  const { chromium } = createRequire(import.meta.url)("playwright")
  const b = await chromium.launch({ args: ["--no-sandbox", "--no-proxy-server"] })
  const ctx = await b.newContext()
  await ctx.addCookies([{ name: owner.name, value: owner.value, url: BASE }])
  const page = await ctx.newPage()
  await page.goto(`${BASE}/satori`, { waitUntil: "load" })
  await page.waitForTimeout(2500)
  check("in a browser, the owner's address bar keeps /satori", page.url() === `${BASE}/satori`, page.url())
  await b.close()
}
console.log(failed ? `\n${failed} failed` : "\nall passed")
process.exit(failed ? 1 : 0)
