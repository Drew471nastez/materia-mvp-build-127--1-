/**
 * ===========================================================================
 *  A PUBLISHED WEBSITE'S FIRST LOAD, WITH A CDN IN FRONT (round 53)
 * ===========================================================================
 * A local production build (`next start` in DIR) reading the Supabase stub,
 * with the round 52 websites (scripts/site-speed-fixture.mjs): nova on a
 * Storelib theme, mara on the owner's imported Materia, and pia on the same
 * Materia with a header that reads the cart and the customer. In front of
 * it, over https, a stand in for Vercel's CDN: it keeps an answer that says
 * `Vercel-CDN-Cache-Control: public, s-maxage=N` (or a public s-maxage in
 * Cache-Control) and sets no cookie, for N seconds, and never passes the
 * Vercel header on. It keys a copy on the address THE BROWSER asked for,
 * the stricter of the two ways Vercel has been seen to key one (round 48),
 * so a copy that is somebody's would show up as served to somebody else.
 *
 * Build it pointed at the stub (the port is baked into the build):
 *
 *   node scripts/load/local-bench.mjs --stub --stub-port 54453 &
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54453 <CLAUDE.md placeholders> pnpm build
 *   DIR=<built checkout> STUB_PORT=54453 node scripts/check-site-speed-r53.mjs [--json FILE]
 *
 * Reports:
 *   server     per site: the first request after boot, a page drawn on a warm
 *              server (a new ?page= each time, so neither the hold nor the CDN
 *              has it), a held copy, with Server-Timing's read, localize, draw
 *              and post; the page's bytes as sent, gzip and brotli
 *   personas   the same page through the origin for a stranger, a buyer with a
 *              cart, a signed in customer and the owner: the bytes of each
 *              answer (sha256), its cache headers, and whether any of them
 *              holds the buyer's or the customer's own data
 *   fill       pia in a browser as the buyer and the customer: the count and
 *              the name after load, and whether the theme's own element
 *              (with a listener bound to it) is still the same element
 *   browser    per site and profile (slow4g, fast4g): TTFB, FCP, LCP, bytes,
 *              with the CDN cold (each run empties it) and warm
 */
import { spawn } from "node:child_process"
import { createServer as createHttpsServer } from "node:https"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { request as httpRequest } from "node:http"
import { createHash, createHmac } from "node:crypto"
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib"
import puppeteer from "puppeteer-core"
import { serveSupabaseStub } from "./supabase-stub-server.mjs"
import { siteSpeedFixture } from "./site-speed-fixture.mjs"

const DIR = process.env.DIR || "."
const PORT = Number(process.env.PORT || 3627)
const STUB_PORT = Number(process.env.STUB_PORT || 54453)
const RUNS = Math.max(1, Number(process.env.RUNS || 3))
const PROFILES = (process.env.PROFILES || "slow4g,fast4g").split(",")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const jsonAt = process.argv.indexOf("--json")
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SECRET = "r53-probe-site-account-secret-0123456789abcdef"
const PIA = "22222222-2222-4222-8222-2222222222aa"
const ANA = "66666666-6666-4666-8666-6666666666aa"
const SITES = (process.env.SITES || "nova.storelib.com,mara.storelib.com,pia.storelib.com").split(",")
const KIND = { "nova.storelib.com": "Storelib theme", "mara.storelib.com": "Materia (imported)", "pia.storelib.com": "Materia, header reads cart" }
const out = { server: [], personas: [], fill: [], browser: [] }

const { T } = await siteSpeedFixture({ personal: true })
const stub = await serveSupabaseStub({ port: STUB_PORT, tables: T })
const env = { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STUB_PORT}`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder", SUPABASE_SERVICE_ROLE_KEY: "placeholder", STRIPE_SECRET_KEY: "sk_test_placeholder", RESEND_API_KEY: "re_placeholder", SITE_ACCOUNT_SECRET: SECRET }
delete env.HTTPS_PROXY
delete env.https_proxy
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { cwd: DIR, env, stdio: process.env.DEBUG ? "inherit" : "ignore" })
process.on("exit", () => { next.kill(); stub.server.close() })

/** One request to the origin, straight (no CDN): status, headers, body, and the time to the first byte and the last. */
function ask(host, path, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = performance.now()
    let first = 0
    const req = httpRequest({ host: "127.0.0.1", port: PORT, path, method, headers: { host, "x-forwarded-host": host, "x-forwarded-proto": "https", accept: "text/html", "sec-fetch-dest": "document", ...headers } }, (res) => {
      const chunks = []
      res.on("data", (c) => { if (!first) first = performance.now(); chunks.push(c) })
      res.on("end", () => resolve({ status: res.statusCode, h: res.headers, body: Buffer.concat(chunks), ttfb: (first || performance.now()) - t0, total: performance.now() - t0 }))
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}
for (let i = 0; i < 600; i++) { try { await ask("storelib.com", "/robots.txt"); break } catch { await sleep(200) } }

const timing = (h) => Object.fromEntries(String(h["server-timing"] ?? "").split(/,\s*/).filter(Boolean).map((p) => { const [name, ...rest] = p.split(";"); const dur = rest.find((r) => r.startsWith("dur="))?.slice(4); return [name.trim(), dur === undefined ? (rest.find((r) => r.startsWith("desc=")) ?? "").slice(5) : Number(dur)] }))
const median = (xs) => { const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN }
const kb = (n) => `${(n / 1024).toFixed(0)} KB`
const ms = (n) => (Number.isFinite(n) ? `${Math.round(n)} ms` : "-")

/* ── Server ── */
console.log("\nSERVER (origin, no CDN)\n")
for (const host of SITES) {
  const first = await ask(host, "/")
  const drawn = []
  /* A page number never asked before (the hold keeps what it drew between runs, in .next/cache): a real draw every time. */
  const salt = 1000 + (Date.now() % 100_000) * 10
  for (let i = 0; i < 6; i++) drawn.push(await ask(host, `/?page=${salt + i}`))
  const held = []
  for (let i = 0; i < 6; i++) held.push(await ask(host, "/"))
  const html = first.body
  const row = {
    host, kind: KIND[host],
    firstTtfb: first.ttfb, firstTiming: timing(first.h),
    drawTtfb: median(drawn.map((r) => r.ttfb)), drawTiming: Object.fromEntries(["read", "localize", "draw", "post", "total"].map((k) => [k, median(drawn.map((r) => timing(r.h)[k]))])),
    heldTtfb: median(held.map((r) => r.ttfb)), held: held.at(-1).h["x-storelib-held"] ?? held.at(-1).h["x-nextjs-cache"] ?? "-",
    bytes: html.length, gzip: gzipSync(html, { level: 6 }).length, br: brotliCompressSync(html).length,
    cache: { cc: held.at(-1).h["cache-control"] ?? null, cdn: held.at(-1).h["vercel-cdn-cache-control"] ?? null, tag: held.at(-1).h["vercel-cache-tag"] ?? null, vary: held.at(-1).h.vary ?? null },
  }
  out.server.push(row)
  console.log(`${host} (${row.kind})`)
  console.log(`  first after boot   TTFB ${ms(row.firstTtfb)}   ${JSON.stringify(row.firstTiming)}`)
  console.log(`  warm, drawn        TTFB ${ms(row.drawTtfb)}   ${JSON.stringify(row.drawTiming)}`)
  console.log(`  warm, held         TTFB ${ms(row.heldTtfb)}   (${row.held})`)
  console.log(`  HTML               ${kb(row.bytes)} raw, ${kb(row.gzip)} gzip, ${kb(row.br)} brotli`)
  console.log(`  headers            ${JSON.stringify(row.cache)}`)
  /* A Storelib theme's other pages: what the CDN is told for each (ISR, a minute). */
  if (host.startsWith("nova.")) for (const path of ["/about", "/products/nova-pack-1", "/products"]) {
    await ask(host, path)
    const r = await ask(host, path)
    row[path] = { status: r.status, cc: r.h["cache-control"] ?? null, cache: r.h["x-nextjs-cache"] ?? null }
    console.log(`  ${path.padEnd(18)} ${r.status} ${r.h["cache-control"] ?? "-"}  (${r.h["x-nextjs-cache"] ?? "-"})`)
  }
}

/* ── Personas: the same page for everybody ── */
console.log("\nPERSONAS (pia, through the origin)\n")
function session(host) {
  const key = createHmac("sha256", SECRET).update("storelib:site-account:v2").digest()
  const now = Date.now()
  const body = `v2.${Buffer.from(JSON.stringify({ t: "s", u: ANA, c: PIA, h: host, i: now, e: now + 3600_000 })).toString("base64url")}`
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url")}`
}
const cookieOf = (setCookie) => (Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []).map((c) => c.split(";")[0]).join("; ")
{
  const host = "pia.storelib.com"
  const added = await ask(host, "/cart/add.js", { method: "POST", headers: { accept: "application/json", "content-type": "application/json", "sec-fetch-dest": "empty", origin: `https://${host}` }, body: JSON.stringify({ id: "33333333-3333-4333-8333-0000000000a1", quantity: 2 }) })
  const buyerCookie = cookieOf(added.h["set-cookie"])
  const people = [
    ["stranger", ""],
    ["buyer with a cart", buyerCookie],
    ["signed in customer", `__Host-sl_site_session=${session(host)}; sl_signed_in=1`],
    ["owner (Storelib session)", "sb-placeholder-auth-token=base64-eyJhY2Nlc3NfdG9rZW4iOiJ4In0; sl_owned_hint=1; materia_session=x"],
  ]
  const pages = ["/", "/?page=2", "/?utm_source=ig&fbclid=abc"]
  for (const path of pages) {
    for (const [who, cookie] of people) {
      const r = await ask(host, path, { headers: cookie ? { cookie } : {} })
      const text = r.body.toString("utf8")
      const row = {
        path, who, status: r.status, sha: createHash("sha256").update(r.body).digest("hex").slice(0, 16), bytes: r.body.length,
        cdn: r.h["vercel-cdn-cache-control"] ?? null, setsCookie: !!r.h["set-cookie"],
        count: text.match(/id="probe-cart-count" data-count="(\d+)"/)?.[1] ?? null,
        name: /Hi Ana|ana@mail\.test/.test(text), fill: text.includes("data-storelib-personal"),
      }
      out.personas.push(row)
      console.log(`  ${path.padEnd(28)} ${who.padEnd(26)} ${row.status} ${row.sha} ${kb(row.bytes).padStart(7)}  cdn=${row.cdn ?? "-"}  set-cookie=${row.setsCookie}  count=${row.count}  name=${row.name}  fill=${row.fill}`)
    }
  }
  console.log(`  buyer's cart cookie: ${buyerCookie.replace(/sl_theme_cart=[^;]+/, "sl_theme_cart=…")}`)
  for (const path of pages) {
    const rows = out.personas.filter((r) => r.path === path)
    const same = new Set(rows.map((r) => r.sha)).size === 1
    const leaks = rows.filter((r) => r.name || (r.count !== null && r.count !== "0"))
    console.log(`  ${path}: ${same ? "the same bytes for all four" : "DIFFERENT bytes"}; ${leaks.length ? `PERSONAL DATA in ${leaks.map((r) => r.who).join(", ")}` : "no personal data in any"}`)
  }
}

/* ── The CDN stand in, and the browser ── */
const cdn = new Map()
let cdnOn = true
const TLS_PORT = PORT + 1000
{
  const dir = join(tmpdir(), `site-speed-r53-tls-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=storelib.test", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" })
  createHttpsServer({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, (req, res) => {
    const key = `${req.headers.host}${req.url}|${req.headers["sec-fetch-dest"] ?? ""}`
    const now = Date.now()
    const hit = cdnOn && req.method === "GET" ? cdn.get(key) : null
    if (hit && hit.until > now && (hit.headers["content-encoding"] !== "br" || /\bbr\b/.test(String(req.headers["accept-encoding"] ?? "")))) {
      res.writeHead(hit.status, { ...hit.headers, "x-cdn": "HIT" })
      res.end(hit.body)
      return
    }
    const up = httpRequest({ host: "127.0.0.1", port: PORT, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-proto": "https" } }, (r) => {
      const chunks = []
      r.on("data", (c) => chunks.push(c))
      r.on("end", () => {
        let body = Buffer.concat(chunks)
        const headers = { ...r.headers }
        /*
          COMPRESSED AS VERCEL'S CDN COMPRESSES: `next start` sends a route
          handler's answer (an imported theme's page, its CSS and JS)
          uncompressed, and Vercel brotli-compresses text on its way out. The
          round 52 bytes were the uncompressed ones.
        */
        if (!headers["content-encoding"] && /^(?:text\/|application\/(?:javascript|json)|image\/svg)/.test(String(headers["content-type"] ?? "")) && /\bbr\b/.test(String(req.headers["accept-encoding"] ?? "")) && body.length > 1024) {
          body = brotliCompressSync(body, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } })
          headers["content-encoding"] = "br"
          delete headers["content-length"]
          delete headers["transfer-encoding"]
        }
        const rule = String(headers["vercel-cdn-cache-control"] ?? headers["cdn-cache-control"] ?? headers["cache-control"] ?? "")
        delete headers["vercel-cdn-cache-control"]
        const age = Number(rule.match(/s-maxage=(\d+)/)?.[1] ?? 0)
        if (cdnOn && req.method === "GET" && r.statusCode === 200 && age > 0 && /public/.test(rule) && !headers["set-cookie"]) cdn.set(key, { status: r.statusCode, headers, body, until: now + age * 1000 })
        res.writeHead(r.statusCode ?? 502, { ...headers, "x-cdn": "MISS" })
        res.end(body)
      })
    })
    up.on("error", () => { res.writeHead(502); res.end() })
    req.pipe(up)
  }).listen(TLS_PORT, "127.0.0.1")
}

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const NETWORK = {
  slow4g: { latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 },
  fast4g: { latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 },
}
const OBSERVE = () => {
  window.__perf = { lcp: 0, lcpEl: "", cls: 0 }
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { window.__perf.lcp = e.startTime; window.__perf.lcpEl = e.element ? e.element.nodeName.toLowerCase() + (e.url ? ` ${e.url.slice(-40)}` : "") : "" } }).observe({ type: "largest-contentful-paint", buffered: true })
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__perf.cls += e.value }).observe({ type: "layout-shift", buffered: true })
}
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server", "--ignore-certificate-errors", `--host-resolver-rules=${[...SITES, "storelib.com"].map((h) => `MAP ${h} 127.0.0.1:${TLS_PORT}`).join(", ")}, MAP * ~NOTFOUND`],
})

async function open(profile, cookies = []) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  const cdp = await page.createCDPSession()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await page.setUserAgent(IPHONE)
  await cdp.send("Network.enable")
  if (NETWORK[profile]) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETWORK[profile] })
  if (cookies.length) await page.setCookie(...cookies)
  await page.evaluateOnNewDocument(OBSERVE)
  const net = { requests: 0, bytes: 0, script: 0, style: 0, font: 0, document: 0, image: 0, docCdn: "" }
  const types = new Map()
  cdp.on("Network.responseReceived", (e) => { types.set(e.requestId, e.type); if (e.type === "Document") net.docCdn = e.response.headers["x-cdn"] ?? "" })
  cdp.on("Network.loadingFinished", (e) => {
    const t = types.get(e.requestId)
    net.requests++
    net.bytes += e.encodedDataLength
    if (t === "Script") net.script += e.encodedDataLength
    if (t === "Stylesheet") net.style += e.encodedDataLength
    if (t === "Font") net.font += e.encodedDataLength
    if (t === "Document") net.document += e.encodedDataLength
    if (t === "Image") net.image += e.encodedDataLength
  })
  return { ctx, page, net }
}

/* ── Fill: pia as the buyer and as the customer ── */
console.log("\nFILL (pia in a browser, CDN warm)\n")
{
  const host = "pia.storelib.com"
  cdnOn = true
  await ask(host, "/")
  const added = await ask(host, "/cart/add.js", { method: "POST", headers: { accept: "application/json", "content-type": "application/json", "sec-fetch-dest": "empty", origin: `https://${host}` }, body: JSON.stringify({ id: "33333333-3333-4333-8333-0000000000a1", quantity: 2 }) })
  const jar = cookieOf(added.h["set-cookie"]).split("; ").filter(Boolean).map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), domain: host, path: "/", secure: true } })
  const people = [
    ["stranger", []],
    ["buyer with a cart", jar],
    ["signed in customer", [{ name: "__Host-sl_site_session", value: session(host), domain: host, path: "/", secure: true }, { name: "sl_signed_in", value: "1", domain: host, path: "/", secure: true }]],
  ]
  for (const [who, cookies] of people) {
    const { ctx, page, net } = await open("fast4g", cookies)
    await page.evaluateOnNewDocument(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const el = document.getElementById("probe-personal")
        if (el) { el.__bound = 1; el.addEventListener("click", () => { window.__clicked = 1 }) }
      })
    })
    const asked = []
    page.on("request", (r) => { if (r.url().includes("sl_personal")) asked.push(r.url()) })
    await page.goto(`https://${host}/`, { waitUntil: "load", timeout: 90_000 })
    await sleep(3000)
    const seen = await page.evaluate(() => {
      const el = document.getElementById("probe-personal")
      el?.click()
      return { count: document.getElementById("probe-cart-count")?.textContent ?? null, attr: document.getElementById("probe-cart-count")?.getAttribute("data-count") ?? null, account: document.getElementById("probe-account")?.textContent ?? null, layout: document.getElementById("probe-layout-cart")?.textContent ?? null, same: !!el && el.__bound === 1, clicked: window.__clicked === 1, signed: window.Shopify?.storelibSignedIn === true, atDraw: window.Shopify?.storelibCartAtDraw ?? null }
    })
    const row = { who, doc: net.docCdn, asked: asked.length, ...seen }
    out.fill.push(row)
    console.log(`  ${who.padEnd(20)} page from CDN: ${row.doc || "-"}  private asks: ${row.asked}  count "${row.count}" (data-count ${row.attr})  account "${row.account}"  layout "${row.layout}"  same element, still bound: ${row.same && row.clicked}`)
    await ctx.close()
  }
}

/* ── Browser: first loads ── */
console.log("\nBROWSER (iPhone, CPU 4x slower)\n")
for (const profile of PROFILES) {
  for (const host of SITES.filter((h) => h !== "pia.storelib.com")) {
    for (const mode of ["cdn-cold", "cdn-warm"]) {
      const runs = []
      for (let i = 0; i < RUNS; i++) {
        cdnOn = true
        if (mode === "cdn-cold") cdn.clear()
        else { const { ctx, page } = await open("none"); await page.goto(`https://${host}/`, { waitUntil: "load" }).catch(() => null); await ctx.close() }
        const { ctx, page, net } = await open(profile)
        try {
          await page.goto(`https://${host}/`, { waitUntil: "load", timeout: 120_000 })
          await sleep(2500)
          const m = await page.evaluate(() => { const nav = performance.getEntriesByType("navigation")[0]; const fcp = performance.getEntriesByName("first-contentful-paint")[0]; return { ttfb: nav.responseStart, fcp: fcp?.startTime ?? NaN, lcp: window.__perf.lcp, lcpEl: window.__perf.lcpEl, cls: window.__perf.cls, load: nav.loadEventEnd } })
          runs.push({ ...m, net: { ...net } })
        } catch (e) {
          runs.push({ error: String(e.message ?? e) })
        }
        await ctx.close()
      }
      const ok = runs.filter((r) => !r.error)
      const row = { profile, host, kind: KIND[host], mode, runs: ok.length, ttfb: median(ok.map((r) => r.ttfb)), fcp: median(ok.map((r) => r.fcp)), lcp: median(ok.map((r) => r.lcp)), load: median(ok.map((r) => r.load)), cls: median(ok.map((r) => r.cls)), lcpEl: ok[0]?.lcpEl ?? "", doc: ok[0]?.net.docCdn ?? "", bytes: median(ok.map((r) => r.net.bytes)), script: median(ok.map((r) => r.net.script)), style: median(ok.map((r) => r.net.style)), font: median(ok.map((r) => r.net.font)), html: median(ok.map((r) => r.net.document)), image: median(ok.map((r) => r.net.image)), requests: median(ok.map((r) => r.net.requests)), errors: runs.filter((r) => r.error).map((r) => r.error) }
      out.browser.push(row)
      console.log(`${profile.padEnd(7)} ${host.padEnd(20)} ${mode.padEnd(9)} doc ${row.doc.padEnd(4)} TTFB ${ms(row.ttfb).padStart(8)}  FCP ${ms(row.fcp).padStart(8)}  LCP ${ms(row.lcp).padStart(8)}  load ${ms(row.load).padStart(8)}  ${kb(row.bytes)} (js ${kb(row.script)}, css ${kb(row.style)}, font ${kb(row.font)}, html ${kb(row.html)}, img ${kb(row.image)}) ${row.requests} req  LCP el ${row.lcpEl}${row.errors.length ? `  ERR ${row.errors[0]}` : ""}`)
    }
  }
}
await browser.close()
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2))
process.exit(0)
