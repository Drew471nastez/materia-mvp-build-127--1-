/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE IN A REAL BROWSER, ON A SLOW PHONE (round 52)
 * ===========================================================================
 * A local production build (`next start` in DIR) reading the Supabase stub,
 * with four websites: nova's Storelib theme on its subdomain, lena's on her
 * connected domain www.lenashop.test, and mara and iris on the imported theme (the owner's
 * Materia, tests/fixtures/materia-live, through the real converter) on its
 * subdomain and on www.irisshop.test. Every host is mapped to the server, so
 * proxy.ts routes each as it does on Vercel; any other host fails at once.
 * The browser reaches them over https (a self signed certificate in front of
 * `next start`), so Speculation Rules run as they do for a visitor.
 *
 * Build it pointed at the stub first (scripts/check-public-delivery-r51.mjs):
 *
 *   node scripts/load/local-bench.mjs --stub &
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54391 <CLAUDE.md placeholders> pnpm build
 *   DIR=<built checkout> node scripts/check-site-speed-r52.mjs [--json FILE]
 *
 * For each site and profile, RUNS cold loads (a new browser context each):
 *   first load   requests, bytes on the wire (all, scripts, styles, fonts),
 *                TTFB, FCP, LCP, CLS, blocking time, JS errors
 *   navigation   a tap on a link to another page of the site, from the tap to
 *                the new address with its page drawn; frames drawn with an
 *                empty page in between (a flash); layout shift after it
 *
 * Profiles (PROFILES, default slow4g,fast4g):
 *   slow4g   390x844 phone, CPU 4x slower, DevTools "Slow 4G" (562 ms, 1.44 Mbps)
 *   fast4g   390x844 phone, CPU 4x slower, 60 ms, 9 Mbps
 *   desktop  1440x900, no throttling
 * UA=capacitor sends the iOS app's user agent instead of Safari's.
 */
import { execFileSync, spawn } from "node:child_process"
import { createServer as createHttpsServer } from "node:https"
import { tmpdir } from "node:os"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { request as httpRequest } from "node:http"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"
import { siteSpeedFixture } from "./site-speed-fixture.mjs"

const DIR = process.env.DIR || "."
const PORT = Number(process.env.PORT || 3527)
const STUB_PORT = Number(process.env.STUB_PORT || 54391)
const RUNS = Math.max(1, Number(process.env.RUNS || 2))
const PROFILES = (process.env.PROFILES || "slow4g,fast4g").split(",")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const jsonAt = process.argv.indexOf("--json")
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const { T, NOVA, novaId } = await siteSpeedFixture()

const SITES = (process.env.SITES || "nova.storelib.com,www.lenashop.test,mara.storelib.com,www.irisshop.test").split(",")
const KIND = { "nova.storelib.com": "Storelib theme, subdomain", "www.lenashop.test": "Storelib theme, custom domain", "mara.storelib.com": "imported theme, subdomain", "www.irisshop.test": "imported theme, custom domain" }

const stub = await serveSupabaseStub({ port: STUB_PORT, tables: T })
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder", STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder" }
delete env.HTTPS_PROXY
delete env.https_proxy
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { cwd: DIR, env, stdio: process.env.DEBUG ? "inherit" : "ignore" })
process.on("exit", () => { next.kill(); stub.server.close() })
const ping = (host, path) => new Promise((resolve, reject) => {
  const req = httpRequest({ host: "127.0.0.1", port: PORT, path, headers: { host, accept: "text/html" } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)) })
  req.on("error", reject)
  req.end()
})
for (let i = 0; i < 400; i++) { try { await ping("storelib.com", "/robots.txt"); break } catch { await sleep(250) } }
/* Warm every page the runs open, so a cold browser meets a warm server, as a visitor after the first does. */
if (process.env.PROBE) { const [h, p] = process.env.PROBE.split(" "); const body = await new Promise((resolve) => { const req = httpRequest({ host: "127.0.0.1", port: PORT, path: p, headers: { host: h, "x-forwarded-host": h, accept: "text/html" } }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve(`${res.statusCode} ${JSON.stringify(res.headers).slice(0, 600)}\n${b.slice(0, 1500)}`)) }); req.end() }); console.log(body); console.log(stub.log.slice(-40).join("\n")); process.exit(0) }
/*
  DATA=1: what a published website's own host answers for its commerce: the
  product's offers, bundles and upsells (the switched off and the ended one
  left out), the cart's offers, the shop and product pages, the cart page and
  the press on Buy now, on the subdomain and on a custom domain. Then an offer
  changed in the database, and asked again: a website must not keep it.
*/
if (process.env.DATA) {
  const ask = (host, path, { method = "GET", body = null, accept = "application/json" } = {}) => new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port: PORT, path, method, headers: { host, accept, ...(body ? { "content-type": "application/json" } : {}) } }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, h: res.headers, body: b })) })
    req.on("error", reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
  let bad = 0
  const ok = (what, cond, got) => { console.log(`  ${cond ? "ok  " : "FAIL"}  ${what}${cond ? "" : `   ${JSON.stringify(got).slice(0, 300)}`}`); if (!cond) bad++ }
  const json = (r) => { try { return JSON.parse(r.body) } catch { return null } }
  const p1 = novaId(0)
  for (const host of ["nova.storelib.com"]) {
    console.log(`\n${host}`)
    const all = await ask(host, `/api/offers?product=${p1}`)
    const o = json(all)
    ok("GET /api/offers answers on the website's host", all.status === 200 && !!o, all.status)
    ok("  the live bundle, with both products, priced", o?.bundles?.length === 1 && o.bundles[0].title === "Both packs" && o.bundles[0].items.length === 2 && o.bundles[0].priceCents < o.bundles[0].fullCents, o?.bundles)
    ok("  the upsell for this product", o?.checkoutOffers?.length === 1 && o.checkoutOffers[0].title === "Add pack 2" && o.checkoutOffers[0].offerPriceCents < o.checkoutOffers[0].product.priceCents, o?.checkoutOffers)
    ok("  never the switched off or the ended one", !JSON.stringify(o).includes("Switched off") && !JSON.stringify(o).includes("Ended"))
    ok("  held a minute at most", /max-age=60\b/.test(String(all.h["cache-control"])) && !all.h["set-cookie"], all.h["cache-control"])
    const b = json(await ask(host, `/api/offers/bundles?product=${p1}`))
    ok("GET /api/offers/bundles: the same bundle and upsell", b?.bundles?.length === 1 && b?.upsells?.length === 1, b)
    const other = json(await ask(host, `/api/offers?product=${novaId(1)}`))
    ok("  a product with no upsell of its own has the bundle only", other?.bundles?.length === 1 && (other?.checkoutOffers ?? []).length === 0, other)
    const cart = await ask(host, "/api/offers/cart", { method: "POST", body: { shopId: NOVA, items: [{ productId: p1, quantity: 1 }] } })
    ok("POST /api/offers/cart answers for the cart", cart.status === 200, { status: cart.status, body: cart.body.slice(0, 200) })
    const page = await ask(host, "/products/nova-pack-1", { accept: "text/html" })
    ok("the product page is this website's product", page.status === 200 && page.body.includes("nova pack 1"), page.status)
    const shop = await ask(host, "/products", { accept: "text/html" })
    ok("the shop lists this website's products and no other's", shop.status === 200 && shop.body.includes("nova pack 2") && !shop.body.includes("lena pack"), shop.status)
    const cartPage = await ask(host, "/cart", { accept: "text/html" })
    ok("the cart page answers and is never held", cartPage.status === 200 && !/s-maxage=(?!0\b)\d+/.test(String(cartPage.h["cache-control"]) + String(cartPage.h["vercel-cdn-cache-control"] ?? "")), cartPage.h["cache-control"])
    const buy = await ask(host, `/checkout?productId=${p1}`, { accept: "text/html" })
    ok("Buy now on the website's host opens checkout", [200, 302, 303, 307, 308].includes(buy.status), { status: buy.status, location: buy.h.location })
    console.log(`    checkout: ${buy.status} ${buy.h.location ?? ""}`)
    T.store_offers[0].title = "Both packs, renamed"
    T.store_offers[1].active = false
    const again = json(await ask(host, `/api/offers?product=${p1}`))
    ok("an offer changed in the database is what the next ask gets", again?.bundles?.[0]?.title === "Both packs, renamed" && (again?.checkoutOffers ?? []).length === 0, again)
    T.store_offers[0].title = "Both packs"
    T.store_offers[1].active = true
  }
  console.log(bad ? `\n${bad} failed` : "\nall passed")
  process.exit(bad ? 1 : 0)
}
for (const host of SITES) for (const path of ["/", "/about", "/products", "/products/nova-pack-1", "/products/lena-pack-1", "/products/pants-down", "/products/black-sleeves", "/collections/all", "/pages/about"]) { await ping(host, path).catch(() => 0); await ping(host, path).catch(() => 0) }

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const UA = process.env.UA === "capacitor" ? `${IPHONE} StorelibApp Capacitor` : IPHONE
const NETWORK = {
  slow4g: { latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 },
  fast4g: { latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
}

const OBSERVE = () => {
  window.__perf = { lcp: 0, cls: 0, tbt: 0, lcpEl: "", shifts: [], errors: [] }
  addEventListener("error", (e) => window.__perf.errors.push(String(e.message || e.type)))
  addEventListener("unhandledrejection", (e) => window.__perf.errors.push(`rejection: ${String(e.reason?.message ?? e.reason)}`))
  const name = (n) => (n && n.nodeName ? `${n.nodeName.toLowerCase()}${n.id ? `#${n.id}` : ""}${typeof n.className === "string" && n.className ? `.${n.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}` : "?")
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.lcp = e.startTime; window.__perf.lcpEl = name(e.element) } }).observe({ type: "largest-contentful-paint", buffered: true })
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue
      window.__perf.cls += e.value
      if (e.value > 0.005) window.__perf.shifts.push({ at: Math.round(e.startTime), value: Number(e.value.toFixed(3)), moved: e.sources.map((s) => name(s.node)) })
    }
  }).observe({ type: "layout-shift", buffered: true })
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.tbt += Math.max(0, e.duration - 50) }).observe({ type: "longtask", buffered: true })
}

async function openPage(browser, profile) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const cdp = await page.createCDPSession()
  if (profile === "desktop") await page.setViewport({ width: 1440, height: 900 })
  else {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await page.setUserAgent(UA)
  await cdp.send("Network.enable")
  if (NETWORK[profile]) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETWORK[profile] })
  await page.evaluateOnNewDocument(OBSERVE)
  const net = { requests: 0, bytes: 0, script: 0, style: 0, font: 0, document: 0, failed: [], external: 0, scripts: [] }
  const urls = new Map()
  const types = new Map()
  cdp.on("Network.responseReceived", (e) => {
    types.set(e.requestId, e.type)
    urls.set(e.requestId, e.response.url.replace(/^https?:\/\/[^/]+/, ""))
    if (e.response.status >= 400 && !/favicon/.test(e.response.url)) net.failed.push(`${e.response.status} ${e.response.url.slice(0, 120)}`)
  })
  cdp.on("Network.loadingFinished", (e) => {
    const t = types.get(e.requestId)
    net.requests++
    net.bytes += e.encodedDataLength
    if (t === "Script") { net.script += e.encodedDataLength; net.scripts.push([e.encodedDataLength, urls.get(e.requestId)]) }
    if (t === "Stylesheet") net.style += e.encodedDataLength
    if (t === "Font") net.font += e.encodedDataLength
    if (t === "Document") net.document += e.encodedDataLength
  })
  cdp.on("Network.loadingFailed", (e) => { if (/NAME_NOT_RESOLVED/.test(e.errorText)) net.external++ ; else if (!e.canceled) net.failed.push(`${e.errorText} ${types.get(e.requestId) ?? ""}`) })
  const consoleErrors = []
  page.on("console", (m) => { if (m.type() === "error" && !/ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(m.text())) consoleErrors.push(m.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e.message).slice(0, 200)}`))
  return { ctx, page, cdp, net, consoleErrors }
}

/** A link to another page of this site that the site itself draws, preferring a product. */
async function pickLink(page, avoid) {
  return page.evaluate((avoid, compat) => {
    const here = location.href.split("#")[0]
    const links = [...document.querySelectorAll("a[href]")].filter((a) => {
      const u = new URL(a.href, location.href)
      const r = a.getBoundingClientRect()
      return u.origin === location.origin && u.href.split("#")[0] !== here && !avoid.includes(u.pathname) && !/\/(checkout|cart|account|api|search)\b/.test(u.pathname) && r.width > 0 && r.height > 0 && !a.target
    })
    const reachable = (a) => {
      a.scrollIntoView({ block: "center" })
      const r = a.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && (hit === a || a.contains(hit)) && getComputedStyle(a).visibility !== "hidden"
    }
    const ok = links.filter(reachable)
    /* An imported theme here has no product template of its own (the fixture is its home page): its pages that answer 200 are /pages/... and the front page, and a prerender is only shown for a 200. */
    const order = compat ? [/^\/pages\//, /^\/$/] : [/\/products\/[^/]+$/, /\/(about|pages\/)/]
    const prefer = order.map((re) => ok.find((a) => re.test(new URL(a.href).pathname))).find(Boolean) ?? ok[0]
    document.querySelectorAll("[data-perf-target]").forEach((n) => n.removeAttribute("data-perf-target"))
    if (!prefer) return null
    prefer.setAttribute("data-perf-target", "1")
    prefer.scrollIntoView({ block: "center" })
    return new URL(prefer.href).pathname
  }, avoid, /mara|iris/.test(new URL(page.url()).hostname))
}

async function navigate(page, profile, avoid) {
  const to = await pickLink(page, avoid)
  if (!to) return { to: null, ms: NaN, mode: "-", blankFrames: 0, cls: 0 }
  await sleep(1500)
  const from = await page.evaluate(() => {
    window.__stay = 1
    window.__blank = 0
    window.__navCls = 0
    window.__navShifts = []
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (!e.hadRecentInput) window.__navCls += e.value; window.__navShifts.push(`${e.value.toFixed(3)}${e.hadRecentInput ? " (input)" : ""}: ${e.sources.map((s) => `${s.node?.nodeName?.toLowerCase() ?? "?"}.${String(s.node?.className ?? "").slice(0, 60)} ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)}`).join(", ")}`) } }).observe({ type: "layout-shift" })
    const watch = () => {
      const text = (document.body?.innerText || "").trim().length
      if (text < 40) window.__blank++
      if (window.__stay === 1) requestAnimationFrame(watch)
    }
    requestAnimationFrame(watch)
    return location.pathname
  })
  const box = await (await page.$("[data-perf-target]")).boundingBox()
  const t0 = Date.now()
  if (profile === "desktop") await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  else await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForFunction((start) => location.pathname !== start && document.readyState !== "loading" && (document.body?.innerText || "").trim().length > 40, { timeout: 30_000, polling: 16 }, from).catch(() => null)
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => null)
  const ms = Date.now() - t0
  await sleep(1500)
  const after = await page.evaluate(() => ({ mode: window.__stay === 1 ? "in-place" : (performance.getEntriesByType("navigation")[0]?.activationStart ?? 0) > 0 ? "prerendered" : "document", blank: window.__blank ?? 0, cls: window.__navCls ?? 0, shifts: window.__navShifts ?? [], at: location.pathname })).catch(() => ({ mode: "?", blank: 0, cls: 0, at: "?" }))
  await page.evaluate(() => { window.__stay = 0 }).catch(() => null)
  if (process.env.SHIFTS) for (const s of after.shifts ?? []) console.log(`    shift after the move to ${after.at}: ${s}`)
  return { to: after.at, ms, mode: after.mode, blankFrames: after.blank, cls: Number(after.cls.toFixed(3)) }
}

const median = (xs) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : NaN
}

/*
  OVER HTTPS, as a visitor gets it: Chrome's Speculation Rules (an imported
  theme's prefetch and prerender) and navigator.deviceMemory only exist in a
  secure context, so over plain http they never run. A self signed
  certificate for every host, in front of `next start`, with the Host and
  x-forwarded-proto a CDN passes on.
*/
const TLS_PORT = PORT + 1000
{
  const dir = join(tmpdir(), `site-speed-tls-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=storelib.test", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" })
  const tls = createHttpsServer({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, (req, res) => {
    const up = httpRequest({ host: "127.0.0.1", port: PORT, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-proto": "https" } }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res) })
    up.on("error", () => { res.writeHead(502); res.end() })
    req.pipe(up)
  }).listen(TLS_PORT, "127.0.0.1")
  process.on("exit", () => tls.close())
}
/* HOLD=1: the server and the stub stay up, for a look by hand (Ctrl-C ends it). */
if (process.env.HOLD) { console.log(`holding on ${PORT}, https on ${TLS_PORT}`); await new Promise(() => {}) }
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server", "--ignore-certificate-errors", `--host-resolver-rules=${[...SITES, "storelib.com", "www.storelib.com"].map((h) => `MAP ${h} 127.0.0.1:${TLS_PORT}`).join(", ")}, MAP * ~NOTFOUND`],
})
const rows = []
const samples = []
try {
  for (const profile of PROFILES) {
    for (const host of SITES) {
      const runs = []
      for (let i = 0; i < RUNS; i++) {
        const { ctx, page, net, consoleErrors } = await openPage(browser, profile)
        let load = {}
        try {
          const res = await page.goto(`https://${host}/`, { waitUntil: "load", timeout: 90_000 })
          await sleep(2500)
          load = await page.evaluate(() => {
            const nav = performance.getEntriesByType("navigation")[0]
            const fcp = performance.getEntriesByName("first-contentful-paint")[0]
            return { ttfb: nav.responseStart, fcp: fcp?.startTime ?? NaN, load: nav.loadEventEnd, ...window.__perf }
          })
          load.status = res?.status()
          load.net = { ...net, failed: [...net.failed] }
          const n1 = await navigate(page, profile, [])
          const n2 = await navigate(page, profile, [n1.to ?? ""])
          load.navs = [n1, n2]
          load.errors = [...load.errors, ...consoleErrors]
        } catch (e) {
          load.error = String(e.message ?? e)
        }
        runs.push(load)
        await ctx.close()
      }
      samples.push({ profile, host, runs })
      const ok = runs.filter((r) => !r.error)
      const row = {
        profile,
        site: KIND[host] ?? host,
        status: ok[0]?.status ?? runs[0]?.error?.slice(0, 40),
        reqs: median(ok.map((r) => r.net.requests)),
        KB: Math.round(median(ok.map((r) => r.net.bytes)) / 1024),
        jsKB: Math.round(median(ok.map((r) => r.net.script)) / 1024),
        cssKB: Math.round(median(ok.map((r) => r.net.style)) / 1024),
        fontKB: Math.round(median(ok.map((r) => r.net.font)) / 1024),
        ttfb: Math.round(median(ok.map((r) => r.ttfb))),
        fcp: Math.round(median(ok.map((r) => r.fcp))),
        lcp: Math.round(median(ok.map((r) => r.lcp))),
        cls: Number(median(ok.map((r) => r.cls)).toFixed(3)),
        tbt: Math.round(median(ok.map((r) => r.tbt))),
        nav1: Math.round(median(ok.map((r) => r.navs[0].ms))),
        nav2: Math.round(median(ok.map((r) => r.navs[1].ms))),
        navTo: ok[0]?.navs.map((n) => `${n.to}(${n.mode})`).join(" "),
        blank: Math.max(0, ...ok.flatMap((r) => r.navs.map((n) => n.blankFrames))),
        navCls: Math.max(0, ...ok.flatMap((r) => r.navs.map((n) => n.cls))),
        errors: [...new Set(ok.flatMap((r) => r.errors))].length,
        failed: [...new Set(ok.flatMap((r) => r.net.failed))].length,
        external: median(ok.map((r) => r.net.external)),
      }
      rows.push(row)
      console.log(JSON.stringify(row))
      for (const r of ok) for (const e of new Set([...r.errors, ...r.net.failed])) console.log(`    ${e}`)
      if (process.env.TOP && ok[0]) for (const [b, u] of ok[0].net.scripts.sort((x, y) => y[0] - x[0]).slice(0, Number(process.env.TOP))) console.log(`    ${String(Math.round(b / 1024)).padStart(5)} KB  ${u}`)
    }
  }
} finally {
  await browser.close()
}
console.table(rows.map(({ navTo: _n, ...r }) => r))
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ rows, samples }, null, 2))
process.exit(0)
