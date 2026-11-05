/**
 * ===========================================================================
 *  A WEBSITE DRAWN WITH ITS OWN STYLESHEET LOOKS THE SAME (round 52)
 * ===========================================================================
 * app/(site)/layout.tsx loads app/site.css, Storelib's rules with only the
 * utilities a website's files use (scripts/site-css.cjs), instead of the
 * whole app's stylesheet. This proves nothing a website draws lost a style:
 * on a local production build (`next start` in DIR, the Supabase stub, the
 * websites of scripts/check-site-speed-r52.mjs), each page is opened in
 * Chromium, every element's computed style is read, then Storelib's whole
 * stylesheet (the one storelib.com's pages load) is added to the page and
 * every element is read again. An element whose style changes used a class
 * the website's stylesheet does not have. FAILS on any.
 *
 *   DIR=<built checkout> node scripts/check-site-css-r52.mjs
 */
import { spawn } from "node:child_process"
import { request as httpRequest } from "node:http"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"
import { fixtureTables, products } from "./load/local-fixture.mjs"

const DIR = process.env.DIR || "."
const PORT = Number(process.env.PORT || 3537)
/* The port the build was pointed at: NEXT_PUBLIC_SUPABASE_URL is written into the build. */
const STUB_PORT = Number(process.env.STUB_PORT || 54391)
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const at = "2026-10-01T10:00:00.000Z"

const T = fixtureTables()
const U = "11111111-1111-4111-8111-1111111111dd", C = "22222222-2222-4222-8222-2222222222dd", I = "44444444-4444-4444-8444-4444444444dd"
const sections = ["header", "hero_centered", "features_grid", "text_image", "faq_accordion", "product_grid", "newsletter", "footer"].map((type, i) => ({ id: `${type}-${i}`, type, name: type, settings: {}, blocks: [] }))
const settings = { id: "s1", install_id: I, settings: {}, draft_settings: null, created_at: at, updated_at: at }
const pages = ["home", "about", "contact"].map((key, i) => ({ id: `p${i}`, install_id: I, page_key: key, sections, draft_sections: null, created_at: at, updated_at: at }))
T.profiles.push({ id: U, username: "nova", display_name: "Nova", email_verified: true, is_creator: true, welcome_completed: true, onboarding_completed: true, created_at: at })
T.creators.push({ id: C, user_id: U, slug: "nova", username: "nova", name: "Nova", display_name: "Nova", onboarding_completed: true, store_published: true, banned_at: null, subscription_plan_id: "free", currency: "usd", created_at: at })
T.products.push(...[1, 2, 3].map((n) => ({ ...products[0], id: `33333333-3333-4333-8333-0000000000d${n}`, creator_id: C, seller_id: C, title: `Nova Pack ${n}`, slug: `nova-pack-${n}`, creators: { user_id: U } })))
T.store_theme_installs = [{ id: I, creator_id: C, theme_id: "default", name: "Nova", status: "published", is_custom: false, sort_order: 0, created_at: at, updated_at: at, published_at: at, store_theme_settings: settings, settings, pages }]
T.store_theme_settings = [settings]
T.store_theme_pages = pages
for (const t of ["store_menus", "site_releases", "store_localization", "site_access", "site_deployments", "wishlist_items", "subscribers", "team_members", "membership_plans", "product_sales_status", "community_members", "community_plans", "custom_domains"]) T[t] = T[t] ?? []
T.profiles_public = T.profiles.map(({ email: _e, ...row }) => row)
T.creators_public = T.creators.map(({ stripe_account_id: _s, ...row }) => row)

const stub = await serveSupabaseStub({ port: STUB_PORT, tables: T })
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder", STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder" }
delete env.HTTPS_PROXY
delete env.https_proxy
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { cwd: DIR, env, stdio: process.env.DEBUG ? "inherit" : "ignore" })
process.on("exit", () => { next.kill(); stub.server.close() })
const get = (host, path) => new Promise((resolve, reject) => {
  const req = httpRequest({ host: "127.0.0.1", port: PORT, path, headers: { host, accept: "text/html" } }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b })) })
  req.on("error", reject)
  req.end()
})
for (let i = 0; i < 400; i++) { try { await get("storelib.com", "/robots.txt"); break } catch { await sleep(250) } }

/* Storelib's own stylesheets, as storelib.com's pages name them. */
const platform = await get("storelib.com", "/privacy")
if (process.env.PROBE) { const r = await get("nova.storelib.com", "/"); console.log(r.status, r.body.slice(0, 600)); console.log(stub.log.slice(0, 40).join("\n")); process.exit(0) }
const appSheets = [...platform.body.matchAll(/<link rel="stylesheet" href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1])
if (!appSheets.length) throw new Error("no stylesheet on storelib.com/privacy")

const PAGES = process.env.PAGES ? process.env.PAGES.split(",") : ["/", "/about", "/contact", "/products", "/products/nova-pack-1", "/cart", "/account/login", "/search?q=pack", "/collections/all", "/no-such-page"]
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server", "--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable", `--host-resolver-rules=MAP nova.storelib.com 127.0.0.1:${PORT}, MAP * ~NOTFOUND`],
})
const STYLE = () => {
  const out = []
  const els = document.querySelectorAll("body *")
  for (const el of els) {
    if (el.closest("script,style,template,noscript,svg")) continue
    const cs = getComputedStyle(el)
    let sig = ""
    for (let i = 0; i < cs.length; i++) { const k = cs[i]; if (k.startsWith("--") || k === "transition" || k.startsWith("transition-") || k.startsWith("animation")) continue; sig += `${k}:${cs.getPropertyValue(k)};` }
    out.push(sig)
  }
  return out
}
let failed = 0
let checked = 0
try {
  for (const width of [390, 1440]) {
    for (const path of PAGES) {
      const page = await browser.newPage()
      await page.setViewport({ width, height: 900 })
      const asked = []
      page.on("request", (r) => asked.push(r.url().replace(/^https?:\/\/[^/]+/, "")))
      await page.goto(`http://nova.storelib.com${path}`, { waitUntil: "load", timeout: 60_000 })
      await sleep(2500)
      if (process.env.REQUESTS) console.log(`    ${asked.length} requests: ${asked.filter((u) => !u.startsWith("/_next/static")).join(" ").slice(0, 600)}`)
      await sleep(800)
      const sheets = await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => new URL(l.href).pathname))
      const before = await page.evaluate(STYLE)
      await page.evaluate(async (hrefs) => {
        await Promise.all(hrefs.map((href) => new Promise((resolve) => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.onload = resolve; l.onerror = resolve; document.head.appendChild(l) })))
      }, appSheets)
      await sleep(300)
      const after = await page.evaluate(STYLE)
      const diffs = []
      if (before.length !== after.length) diffs.push(`element count ${before.length} -> ${after.length}`)
      else for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) diffs.push(i)
      let detail = ""
      if (diffs.length && typeof diffs[0] === "number") {
        detail = await page.evaluate((idx) => {
          const els = [...document.querySelectorAll("body *")].filter((el) => !el.closest("script,style,template,noscript,svg"))
          return idx.slice(0, 6).map((i) => `${els[i].tagName.toLowerCase()}.${String(els[i].className).slice(0, 120)}`).join(" | ")
        }, diffs)
      }
      checked++
      const ok = diffs.length === 0
      if (!ok) failed++
      console.log(`  ${ok ? "ok  " : "FAIL"}  ${width}px ${path}: ${before.length} elements, own sheets ${sheets.join(", ")}${ok ? "" : `; ${diffs.length} change with Storelib's: ${detail}`}`)
      await page.close()
    }
  }
} finally {
  await browser.close()
}
console.log(failed ? `\n${failed} of ${checked} pages changed` : `\nall ${checked} pages the same`)
process.exit(failed ? 1 : 0)
