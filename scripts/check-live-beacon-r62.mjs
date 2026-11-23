/**
 * ===========================================================================
 *  THE LIVE BEACON IN CHROMIUM, AND WHAT THE SERVER MAKES OF IT (round 62)
 * ===========================================================================
 * The real components/platform/live-beacon.tsx (scripts/render-live-beacon-r62.tsx,
 * the clock sixty times fast) on four kinds of page, each three ways: before
 * any consent, with a yes to analytics and a sign in, and with that yes but
 * Global Privacy Control on. Every request the browser sends to /api/live is
 * caught with its real headers and cookies, measured (count, bytes), and then
 * handed to the real ingest (lib/live/live-server.ts, bundled for Node) with
 * a stand-in database, so what would be written is asserted too:
 *
 *   a marketing page   /, /pricing, a blog post; typing in a search and an
 *                      email field; 3 minutes shown, 5 hidden, back, closed
 *   a creator page     /<handle>/<product>, Add to cart, 2 minutes
 *   checkout           /checkout, an email typed, then the receipt
 *   /app               3 minutes: round 59's, so nothing at all here
 *
 *   OUT_DIR=… node scripts/check-live-beacon-r62.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) throw new Error(`No browser at ${CHROMIUM}`)
const out = mkdtempSync(join(tmpdir(), "storelib-live-beacon-"))
const esbuild = (args) => execFileSync("npx", ["--no-install", "esbuild", ...args], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
esbuild([
  join(root, "scripts/render-live-beacon-r62.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`, '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', `--alias:@=${root}`,
  `--alias:next/navigation=${join(root, "scripts/render-live-beacon-r62-navigation.ts")}`,
])
writeFileSync(join(out, "empty.mjs"), "export {}\n")
esbuild([join(root, "scripts/live-ingest-node-entry.ts"), "--bundle", "--platform=node", "--format=esm", "--log-level=error", `--outfile=${join(out, "ingest.mjs")}`, `--alias:@=${root}`, `--alias:server-only=${join(out, "empty.mjs")}`])
const { ingestLive, forgetLiveMemory } = await import(pathToFileURL(join(out, "ingest.mjs")).href)
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/probe.js"></script></body></html>`)

let got = []
let phase = "load"
const server = createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/live") {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      got.push({ phase, body, headers: { ...req.headers } })
      res.writeHead(204).end()
    })
    return
  }
  if (req.url === "/probe.js") return res.writeHead(200, { "Content-Type": "text/javascript" }).end(readFileSync(join(out, "probe.js")))
  res.writeHead(200, { "Content-Type": "text/html" }).end(readFileSync(join(out, "index.html")))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const port = server.address().port
const origin = `http://127.0.0.1:${port}`
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const USER = "aaaaaaaa-0000-4000-8000-000000000001"
const TOKEN = "AbCdEf0123456789xyzQ"
const ORDER = "0b6f7f2a-1c1b-4e7e-9a55-2f0e5f1c3a10"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const hide = (page) => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
  document.dispatchEvent(new Event("visibilitychange"))
})
const show = (page) => page.evaluate(() => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
  document.dispatchEvent(new Event("visibilitychange"))
})
const go = (page, p) => page.evaluate((x) => window.__go(x), p)

const SCENARIOS = {
  async marketing(page) {
    await page.goto(`${origin}/`, { waitUntil: "load" })
    phase = "visible"
    await wait(200)
    await go(page, "/pricing")
    await page.type("#search", "my secret search")
    await page.type("#email", "ana@gmail.com")
    await go(page, "/blog/how-to-sell-presets")
    await wait(3_300) // three minutes shown
    phase = "hidden"
    await hide(page)
    await wait(5_200) // five minutes hidden
    phase = "back"
    await show(page)
    await wait(300)
    phase = "close"
    await go(page, "/explore")
    await page.close({ runBeforeUnload: true })
  },
  async creator(page) {
    await page.goto(`${origin}/ana.pop/blue-brushes`, { waitUntil: "load" })
    phase = "visible"
    await wait(200)
    await page.click("#add")
    await wait(2_200)
    phase = "close"
    await page.close({ runBeforeUnload: true })
  },
  async checkout(page) {
    await page.goto(`${origin}/checkout`, { waitUntil: "load" })
    phase = "visible"
    await page.type("#email", "buyer@example.com")
    await wait(1_500)
    await go(page, `/receipt/${TOKEN}`)
    await wait(1_100)
    phase = "close"
    await page.close({ runBeforeUnload: true })
  },
  async app(page) {
    await page.goto(`${origin}/app/products`, { waitUntil: "load" })
    phase = "visible"
    await go(page, "/app/orders")
    await wait(3_300)
    phase = "close"
    await page.close({ runBeforeUnload: true })
  },
}

const MODES = {
  none: { cookies: [], headers: {} },
  consent: { cookies: [{ name: "storelib_consent", value: `2.p1.a1.m0.${Math.floor(Date.now() / 1000)}` }, { name: "sb-x-auth-token", value: "signed" }], headers: {} },
  gpc: { cookies: [{ name: "storelib_consent", value: `2.p1.a1.m0.${Math.floor(Date.now() / 1000)}` }, { name: "sb-x-auth-token", value: "signed" }], headers: { "Sec-GPC": "1" } },
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu"] })
const results = {}
for (const [mode, m] of Object.entries(MODES)) {
  for (const [name, run] of Object.entries(SCENARIOS)) {
    got = []
    phase = "load"
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    await page.setUserAgent(UA)
    if (Object.keys(m.headers).length) await page.setExtraHTTPHeaders(m.headers)
    for (const c of m.cookies) await page.setCookie({ ...c, url: origin })
    await run(page)
    await wait(500)
    await ctx.close()

    /* What the server makes of each request, with the request's own headers and cookies. */
    forgetLiveMemory()
    const writes = []
    const db = {
      from: () => {
        const q = { select: () => q, eq: () => q, maybeSingle: () => Promise.resolve({ data: { id: ORDER, status: "completed", created_at: new Date().toISOString() }, error: null }) }
        return q
      },
      rpc: (fn, args) => {
        writes.push(args)
        return Promise.resolve({ data: { events: 0, session: true }, error: null })
      },
    }
    const outcomes = []
    for (const g of got) {
      const cookieHeader = g.headers.cookie || ""
      const jar = Object.fromEntries(cookieHeader.split(/;\s*/).filter(Boolean).map((p) => [p.slice(0, p.indexOf("=")), decodeURIComponent(p.slice(p.indexOf("=") + 1))]))
      const o = await ingestLive(db, {
        body: JSON.parse(g.body),
        headers: new Headers(Object.entries(g.headers).filter(([, v]) => typeof v === "string")),
        cookie: (n) => jar[n],
        cookieNames: Object.keys(jar),
        now: Date.now(),
        mainDomain: "storelib.com",
        account: async () => USER,
        sample: 1,
      })
      outcomes.push(o.outcome)
    }
    results[`${name}/${mode}`] = { got, writes, outcomes }
  }
}
await browser.close()
server.close()

const problems = []
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== undefined ? `  (${detail})` : ""}`)
  if (!ok) problems.push(label)
}
const bytes = (b) => Buffer.byteLength(b)
for (const [key, r] of Object.entries(results)) {
  console.log(`\n${key}: ${r.got.length} requests, ${r.got.map((g) => bytes(g.body)).join(" + ") || 0} B body; server: ${r.outcomes.join(", ") || "nothing"}`)
  for (const g of r.got) console.log(`    [${g.phase}] ${bytes(g.body)} B ${g.body}`)
}
console.log("")
for (const mode of Object.keys(MODES)) {
  const mk = results[`marketing/${mode}`]
  const n = (p) => mk.got.filter((g) => g.phase === p).length
  check(`${mode}: marketing, three minutes shown: three requests`, n("visible") === 3, n("visible"))
  check(`${mode}: marketing, five minutes hidden with nothing waiting: no request at all`, n("hidden") === 0, n("hidden"))
  check(`${mode}: back after five minutes: one request at once`, n("back") === 1, n("back"))
  check(`${mode}: closing sends what was waiting`, n("close") === 1, n("close"))
  const all = Object.entries(results).filter(([k]) => k.endsWith(`/${mode}`)).flatMap(([, r]) => r.got)
  const text = all.map((g) => g.body).join("\n")
  check(`${mode}: nothing typed, no email, no token in a path`, !/secret|ana@gmail|buyer@example/.test(text) && !text.includes(`/receipt/${TOKEN}`))
  check(`${mode}: no cookie set by any answer, and the tab id is not a cookie`, all.every((g) => !/sl_live/.test(g.headers.cookie || "")))
  const app = results[`app/${mode}`]
  check(`${mode}: /app sends nothing (round 59's)`, app.got.length === 0, app.got.length)
  const cr = results[`creator/${mode}`]
  const crEvents = cr.got.flatMap((g) => JSON.parse(g.body).e.map((e) => e[2]))
  check(`${mode}: a creator page: the product view and Add to cart`, crEvents.includes("product.view") && crEvents.includes("cart.add"), crEvents.join(" "))
  const co = results[`checkout/${mode}`]
  const coWrites = JSON.stringify(co.writes)
  check(`${mode}: checkout: started, then paid as the order found on the server, the token never written`, coWrites.includes("checkout.start") && coWrites.includes(ORDER) && !coWrites.includes(TOKEN))
  const writes = Object.entries(results).filter(([k]) => k.endsWith(`/${mode}`)).flatMap(([, r]) => r.writes)
  const linked = writes.filter((w) => w.p_user)
  if (mode === "consent") check("with a yes and a sign in: written with the account", linked.length === writes.length && writes.length > 0, `${linked.length} of ${writes.length}`)
  else check(`${mode}: written with no account at all`, linked.length === 0 && writes.length > 0, `${linked.length} of ${writes.length}`)
  check(`${mode}: no IP in what is written`, !/127\.0\.0\.1|x-forwarded/.test(JSON.stringify(writes)))
}

/* Cost, from the marketing case before consent: one tab shown for an hour sends one request a minute. */
const mk = results["marketing/none"].got
const sizes = mk.map((g) => bytes(g.body))
const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)
const heartbeat = Math.min(...sizes)
const perHour = 60
console.log(`\nper visitor shown for an hour: ${perHour} requests, body ${avg} B average (${heartbeat} B for a heartbeat), about ${Math.round((perHour * (heartbeat + 700)) / 1024)} KB with request headers`)
writeFileSync(join(process.env.OUT_DIR || out, "live-beacon-requests-r62.json"), JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { requests: r.got.map((g) => ({ phase: g.phase, bytes: bytes(g.body), body: g.body, gpc: g.headers["sec-gpc"] ?? null })), server: r.outcomes, written: r.writes }])), null, 2))
if (problems.length) {
  console.error(`\n${problems.length} failed`)
  process.exit(1)
}
