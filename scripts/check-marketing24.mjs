/**
 * ===========================================================================
 *  KLAVIYO AND OMNISEND IN SETTINGS › INTEGRATIONS: MEASURED IN CHROMIUM
 * ===========================================================================
 * The real directory in the real settings sheet (scripts/render-integrations23.tsx).
 * Its /api/store/integrations/marketing answers come from the REAL server
 * code (lib/integrations/marketing/sync-server.ts, bundled for node here)
 * over an in-memory database (tests/fake-supabase.ts), and that code's calls
 * to Klaviyo and Omnisend go to stubs of their APIs in this process: nothing
 * real is called. At 1440x900 and at 390x844 (touch, CPU slowed 4x):
 *
 *   the page          Subscribers and orders: what flows out and in, the key
 *                     field with where to find it, the permissions to give it
 *   a wrong key       refused with Klaviyo's reason, nothing kept
 *   the right key     Check key, then the account's lists and the backfill
 *                     choice; Connect: the account, the key's last four only,
 *                     the last sync, the counts after the first sync ran
 *   the list          Installed on Klaviyo's card
 *   disconnect        asks first, then Not connected and the key field again
 *   Omnisend          the same with its API key
 *   no sideways scroll at 390, no page errors
 *
 *   node scripts/check-marketing24.mjs     (SHOTS=/dir for screenshots)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { build } from "esbuild"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || null
const SLOW = Number(process.env.CPU_SLOWDOWN || 4)
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".marketing24-probe")
mkdirSync(dir, { recursive: true })

/* ── the server side, for real: sync-server over an in-memory database ── */
writeFileSync(join(dir, "server-entry.ts"), `export { saveMarketing, loadMarketing, runMarketingJob } from "@/lib/integrations/marketing/sync-server"
export { pacer } from "@/lib/integrations/marketing/http"
export { FakeSupabase } from "@/tests/fake-supabase"
`)
await build({
  entryPoints: [join(dir, "server-entry.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(dir, "server.mjs"),
  logLevel: "error",
  alias: { "@": root },
  plugins: [{
    name: "stubs",
    setup(b) {
      /* server-only is empty outside a bundler; the queue runner and the admin client are never reached (runSoon finds no request and returns). */
      b.onResolve({ filter: /^(server-only|next\/server|@\/lib\/supabase\/admin|@\/lib\/physical\/jobs-server)$/ }, (a) => ({ path: a.path, namespace: "stub" }))
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const after = () => { throw new Error('outside a request') }; export const createAdminClient = () => null; export const runJobs = async () => ({})", loader: "js" }))
    },
  }],
})
/* Keys are sealed with the deployment's key; the probe has its own. */
process.env.COMMERCE_SECRETS_KEY = process.env.COMMERCE_SECRETS_KEY || "probe-commerce-secrets-key-0123456789abcdef"
const srv = await import(join(dir, "server.mjs"))
srv.pacer.sleep = async () => {}

const CREATOR = "11111111-1111-4111-8111-111111111111"
const KEY = "pk_probe0123456789abcdef0123456789ab"
const OKEY = "omni-probe-key-0123456789"
const calls = []
const realFetch = globalThis.fetch
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url
  if (!/^https:\/\/(a\.klaviyo\.com|api\.omnisend\.com)\//.test(url)) return realFetch(input, init)
  const u = new URL(url)
  const auth = Object.entries(init.headers ?? {}).find(([k]) => k.toLowerCase() === "authorization")?.[1]
  calls.push(`${init.method ?? "GET"} ${u.host}${u.pathname}`)
  const json = (status, body) => new Response(body === undefined ? "" : JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  if (u.host === "a.klaviyo.com") {
    if (auth !== `Klaviyo-API-Key ${KEY}`) return json(401, { errors: [{ detail: "Incorrect authentication credentials." }] })
    if (u.pathname === "/api/accounts") return json(200, { data: [{ type: "account", id: "PUB123", attributes: { contact_information: { organization_name: "Mara's Studio" } } }] })
    if (u.pathname === "/api/lists") return json(200, { data: [{ type: "list", id: "Y6nRLr", attributes: { name: "Newsletter" } }, { type: "list", id: "Zz9", attributes: { name: "VIP customers" } }], links: { next: null } })
    /* person0 unsubscribed in Klaviyo yesterday: read back, and unsubscribed on Storelib before anything is sent. */
    if (u.pathname === "/api/profiles") return json(200, { data: /list_id/.test(u.searchParams.get("filter") ?? "") ? [] : [{ type: "profile", id: "P0", attributes: { email: "person0@example.com", subscriptions: { email: { marketing: { consent: "UNSUBSCRIBED", suppression: [{ reason: "UNSUBSCRIBE", timestamp: new Date(Date.now() - 86400000).toISOString() }] } } } } }], links: { next: null } })
    if (init.method === "POST") return json(202)
  }
  if (u.host === "api.omnisend.com") {
    if (auth !== `Omnisend-API-Key ${OKEY}`) return json(401, { title: "Unauthorized", status: 401, detail: "Invalid API key" })
    if (u.pathname === "/api/brands/current") return json(200, { brandID: "5f1b", name: "Mara Omni" })
    if (u.pathname === "/api/contacts" && (init.method ?? "GET") === "GET") return json(200, { contacts: [], paging: { hasMore: false } })
    if (init.method === "POST") return json(200, {})
  }
  return json(404, { errors: [{ detail: "not stubbed" }] })
}

function freshDb() {
  const db = new srv.FakeSupabase()
  db.clock = Date.now()
  let n = 0
  const uid = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`
  db.table("commerce_integrations", { unique: [["creator_id", "provider"]], defaults: () => ({ id: uid(), config: {}, status: "disconnected", last_error: null, last_sync_at: null, account_label: null }) })
  db.table("marketing_sync_items", { unique: [["creator_id", "provider", "item_key"]], defaults: () => ({ id: ++n }) })
  db.table("commerce_jobs", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n, status: "queued", attempts: 0 }) })
  db.table("subscribers", { unique: [["creator_id", "email"]] })
  db.table("commerce_checkouts", {})
  db.table("orders", {})
  db.table("products", {})
  /* A store with a history: 37 who said yes, 12 buyers who did not, 3 who left, and 9 downloads sold this month. */
  const day = (d) => new Date(Date.now() - d * 86400000).toISOString()
  for (let i = 0; i < 52; i++) {
    const status = i < 37 ? "subscribed" : i < 49 ? "customer" : "unsubscribed"
    db.tables.subscribers.push({ id: uid(), creator_id: CREATOR, email: `person${i}@example.com`, name: `Person ${i}`, status, is_active: status !== "unsubscribed", subscribed_at: day(40 - (i % 30)), consent_timestamp: status === "subscribed" ? day(40 - (i % 30)) : null, updated_at: day(40 - (i % 30)) })
  }
  db.tables.products.push({ id: "prod-1", title: "Presets", thumbnail_url: null })
  for (let i = 0; i < 9; i++) db.tables.orders.push({ id: `dddddddd-0000-4000-8000-00000000000${i}`, creator_id: CREATOR, checkout_id: null, product_id: "prod-1", buyer_email: `person${40 + i}@example.com`, amount_cents: 1500, currency: "usd", status: "completed", created_at: day(3 + i) })
  return db
}
let db = freshDb()
const deps = { loadOrder: async () => null, orderUrl: async () => null, now: () => Date.now() }
/* As after() and the cron would: every queued marketing job, run now. */
async function runQueued() {
  for (const j of db.tables.commerce_jobs.filter((x) => x.kind === "marketing_sync" && x.status === "queued")) {
    j.status = "running"
    await srv.runMarketingJob(db, j.payload, deps)
    j.status = "done"
  }
}

/* ── the page ─────────────────────────────────────────────────────────── */
writeFileSync(join(dir, "navigation.js"), `import { useSyncExternalStore } from "react"
const sub = (cb) => { window.addEventListener("popstate", cb); window.addEventListener("__url", cb); return () => { window.removeEventListener("popstate", cb); window.removeEventListener("__url", cb) } }
export const usePathname = () => window.__path
export const useSearchParams = () => new URLSearchParams(useSyncExternalStore(sub, () => location.search, () => ""))
const router = { push(h) { window.__nav.push.push(h) }, replace(h) { window.__nav.replace.push(h) }, prefetch() {}, refresh() {}, back() { window.__nav.back++ } }
export const useRouter = () => router
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) }, from: () => q, rpc: async () => ({ data: false, error: null }), storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-integrations23.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__nav={back:0,push:[],replace:[]};window.__path="/app/settings"</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const bodies = []
async function answer(method, url, body) {
  const path = url.split("?")[0]
  if (path === "/api/store/integrations/marketing") {
    if (method === "POST") {
      bodies.push(body)
      const r = await srv.saveMarketing(db, CREATOR, body.provider, body)
      if (!r.ok) return [r.status ?? 400, { error: r.error }]
      await runQueued()
      return [200, { marketing: await srv.loadMarketing(db, CREATOR), lists: r.lists ?? null, account: r.account ?? null }]
    }
    return [200, { marketing: await srv.loadMarketing(db, CREATOR) }]
  }
  if (path === "/api/physical/integrations") return [200, { integrations: [] }]
  if (path === "/api/store/integrations") return [200, { tracking: { klaviyo: "AbC123" }, ready: true }]
  if (path === "/api/store/integrations/catalog") return [200, { overrides: [] }]
  if (path === "/api/store/reviews-app") return [200, { settings: { enabled: false } }]
  if (path === "/api/store/settings") return [200, { settings: { storeName: "Mara's", checkout: {}, ready: true }, suggested: {} }]
  if (path === "/api/physical/settings") return [200, { settings: {}, locations: [], zones: [], packages: [], ready: true }]
  if (path === "/api/billing/overview") return [200, { plans: [], subscription: null, currentPlan: null, invoices: [] }]
  if (path === "/api/domains") return [200, { domains: [] }]
  if (path === "/api/notifications/preferences") return [200, { categories: [] }]
  return [200, {}]
}
const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", async () => {
      let body = {}
      try { body = raw ? JSON.parse(raw) : {} } catch { /* none */ }
      const [status, out] = await answer(req.method, req.url, body).catch((e) => [500, { error: String(e) }])
      setTimeout(() => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(out)) }, 120)
    })
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--force-device-scale-factor=1"], headless: true })
let bad = 0
const say = (ok, line) => { if (!ok) bad++; console.log(`  ${ok ? "ok   " : "FAIL "} ${line}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const SETUP = () => {
  for (const k of ["pushState", "replaceState"]) {
    const orig = history[k].bind(history)
    history[k] = (...a) => { const r = orig(...a); window.dispatchEvent(new Event("__url")); return r }
  }
}
async function until(page, fn, ms, arg) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true
    await wait(100)
  }
  return false
}
const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel)
async function typeInto(page, sel, value) {
  await page.evaluate((s) => { const el = document.querySelector(s); el.focus(); el.select?.() }, sel)
  await page.keyboard.down("Control"); await page.keyboard.press("A"); await page.keyboard.up("Control")
  await page.keyboard.press("Backspace")
  await page.type(sel, value)
}
async function shot(page, name) {
  if (!SHOTS) return
  /* The sync card in view, then the screen as it is. */
  await page.evaluate(() => document.querySelector("[data-integration-sync]")?.scrollIntoView({ block: "start" }))
  await wait(250)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

for (const [label, width, height, touch] of [["1440", 1440, 900, false], ["390", 390, 844, true]]) {
  console.log(`\n${label}x${height}${touch ? ", touch, CPU " + SLOW + "x" : ""}`)
  db = freshDb()
  calls.length = 0
  const page = await browser.newPage()
  await page.setViewport({ width, height, isMobile: touch, hasTouch: touch })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.evaluateOnNewDocument(SETUP)
  await page.goto(`${base}/app/settings?tab=integrations&integration=klaviyo`, { waitUntil: "domcontentloaded", timeout: 120000 })
  const opened = await until(page, () => !!document.querySelector('[data-marketing-sync="klaviyo"]'), 120000)
  say(opened, "Klaviyo's page has a Subscribers and orders card")
  if (!opened) { await page.close(); continue }
  await wait(600)
  if (touch && SLOW > 1) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: SLOW })
  const flows = await text(page, "[data-marketing-flows]")
  say(/To Klaviyo/.test(flows) && /Subscribers who said yes/.test(flows) && /Buyers who did not ask, as profiles only/.test(flows) && /From Klaviyo/.test(flows) && /Unsubscribes/.test(flows), "it says what goes out and what comes back")
  say(/events:write/.test(await text(page, "[data-marketing-scopes]")), "it names the permissions the key needs")
  say(/Tracking ID|Site ID|site ID|Public/i.test(await text(page, "[data-integration-install]")) || !!(await page.$("[data-tracker-install]")), "the onsite ID stays its own card above")
  await shot(page, `k24-klaviyo-empty-${label}`)

  await typeInto(page, "#marketing-key-klaviyo", "pk_wrong0123456789abcdef0123456789")
  await page.evaluate(() => document.querySelector("[data-marketing-check]").click())
  await until(page, () => /did not accept/.test(document.querySelector('[data-marketing-sync="klaviyo"]')?.textContent ?? ""), 15000)
  say(/did not accept that key/.test(await text(page, '[data-marketing-sync="klaviyo"]')) && db.rows("commerce_integrations").length === 0, "a wrong key: Klaviyo did not accept it, nothing kept")

  await typeInto(page, "#marketing-key-klaviyo", KEY)
  await page.evaluate(() => document.querySelector("[data-marketing-check]").click())
  const checked = await until(page, () => !!document.querySelector("[data-marketing-checked]"), 15000)
  const options = await page.evaluate(() => [...document.querySelectorAll("#marketing-list-new option")].map((o) => o.textContent))
  say(checked && options.join() === "Newsletter,VIP customers" && /Key works for Mara's Studio/.test(await text(page, "[data-marketing-checked]")), `the right key: works for the account, its lists to choose (${options.join(", ")})`)
  say(db.rows("commerce_integrations").length === 0, "  nothing is saved by Check key")
  await shot(page, `k24-klaviyo-checked-${label}`)
  await page.select("#marketing-list-new", "Zz9")
  await page.evaluate(() => document.querySelector("[data-marketing-connect]").click())
  const on = await until(page, () => !!document.querySelector("[data-marketing-connected]"), 20000)
  await wait(300)
  const card = await text(page, '[data-marketing-sync="klaviyo"]')
  const counts = await page.evaluate(() => [...document.querySelectorAll("[data-marketing-counts] > div")].map((d) => [d.querySelector("dt").textContent, d.querySelector("dd").textContent]))
  if (!on) console.log(`        the card said: ${card.slice(-300)}`)
  say(on && /Mara's Studio/.test(card) && card.includes(`key ending ${KEY.slice(-4)}`), "connected: the account and the key's last four")
  say(!(await page.content()).includes(KEY), "  the key is nowhere on the page")
  say(/Last sync/.test(await text(page, "[data-marketing-last-sync]")), `  the last sync time ("${await text(page, "[data-marketing-last-sync]")}")`)
  const c = Object.fromEntries(counts)
  say(c.Subscribed === "36" && c.Customers === "12" && c.Unsubscribed === "4" && c["Order events"] === "9" && c["Left in Klaviyo"] === "1", `  the counts after the first sync: ${counts.map((x) => x.join(" ")).join(", ")}`)
  say(db.rows("subscribers").find((x) => x.email === "person0@example.com")?.status === "unsubscribed", "  the one who left in Klaviyo is unsubscribed on Storelib, and was not put on the list")
  say(/VIP customers/.test(card), "  the chosen list")
  const row = db.rows("commerce_integrations")[0]
  say(row?.config?.list_id === "Zz9" && row.config.backfill === true && row.secret_ciphertext?.startsWith("v1.") && !row.secret_ciphertext.includes(KEY), "  saved sealed, with the list and the backfill choice")
  say(calls.some((x) => x === "POST a.klaviyo.com/api/profile-subscription-bulk-create-jobs") && calls.some((x) => x === "POST a.klaviyo.com/api/events"), "  subscribers and orders went to (stubbed) Klaviyo")
  await shot(page, `k24-klaviyo-connected-${label}`)

  const standing = await text(page, "[data-integration-standing]")
  say(/Connected/.test(standing), `the header says Connected ("${standing.slice(0, 40)}")`)
  const overflow = await page.evaluate(() => { const b = document.querySelector("[data-settings-sheet-scroll]") ?? document.scrollingElement; return [b.scrollWidth, b.clientWidth] })
  say(overflow[0] <= overflow[1] + 1, `no sideways scroll (${overflow[0]} in ${overflow[1]})`)

  /* Back to the list: Klaviyo's card says Installed. */
  await page.evaluate(() => document.querySelector("[data-integration-back]").click())
  await until(page, () => !!document.querySelector('[data-integration-card="klaviyo"]'), 10000)
  await wait(300)
  say(/Installed/.test(await text(page, '[data-integration-card="klaviyo"]')), "the directory's Klaviyo card says Installed")
  await page.evaluate(() => document.querySelector('[data-integration-card="klaviyo"]').click())
  await until(page, () => !!document.querySelector("[data-marketing-connected]"), 10000)

  await page.evaluate(() => document.querySelector("[data-marketing-disconnect]").click())
  await until(page, () => !!document.querySelector("[data-marketing-disconnect-confirm]"), 5000)
  say(/Nothing already there is deleted/.test(await text(page, '[data-marketing-sync="klaviyo"]')), "Disconnect asks first, and says what it does")
  await page.evaluate(() => document.querySelector("[data-marketing-disconnect-confirm]").click())
  const off = await until(page, () => !document.querySelector("[data-marketing-connected]") && !!document.querySelector("#marketing-key-klaviyo"), 10000)
  say(off && db.rows("commerce_integrations").length === 0 && /Disconnected/.test(await text(page, '[data-marketing-sync="klaviyo"]')), "disconnected: the key is gone and the key field is back")

  /* Omnisend. */
  await page.evaluate(() => document.querySelector("[data-integration-back]").click())
  await until(page, () => !!document.querySelector('[data-integration-card="omnisend"]'), 10000)
  /* Back goes through history (lib/navigation/go-back): its popstate lands first. */
  await wait(800)
  await page.evaluate(() => document.querySelector('[data-integration-card="omnisend"]').click())
  if (!(await until(page, () => !!document.querySelector("#marketing-key-omnisend"), 10000))) console.log("        omnisend page:", await page.evaluate(() => [document.querySelector("[data-integration-page]")?.getAttribute("data-integration-page"), document.querySelector("[data-integration-sync]")?.textContent?.slice(0, 300), location.search]))
  await typeInto(page, "#marketing-key-omnisend", OKEY)
  await page.evaluate(() => document.querySelector("[data-marketing-check]").click())
  await until(page, () => !!document.querySelector("[data-marketing-checked]"), 15000)
  say(/Key works for Mara Omni/.test(await text(page, "[data-marketing-checked]")) && !(await page.$("#marketing-list-new")), "Omnisend: the key works for its brand, no list to choose")
  await page.evaluate(() => document.querySelector("[data-marketing-connect]").click())
  await until(page, () => !!document.querySelector("[data-marketing-connected]"), 20000)
  await wait(300)
  say(/Mara Omni/.test(await text(page, '[data-marketing-sync="omnisend"]')) && calls.some((x) => x === "POST api.omnisend.com/api/batches") && calls.some((x) => x === "POST api.omnisend.com/api/events"), "  connected; contacts and order events went to (stubbed) Omnisend")
  await shot(page, `k24-omnisend-connected-${label}`)

  say(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ").slice(0, 300)}` : ""}`)
  await page.close()
}

await browser.close()
server.close()
console.log(bad ? `\n${bad} failed` : "\nall passed")
process.exit(bad ? 1 : 0)
