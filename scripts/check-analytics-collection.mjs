/**
 * ===========================================================================
 *  WHAT A WEBSITE PAGE ACTUALLY SENDS, MEASURED IN CHROMIUM
 * ===========================================================================
 * The real website renderer (ThemePage, header and footer) with the real
 * <TrackView>, served from a local server that records every tracking
 * request: when it was made relative to the page's load and to the browser's
 * first idle moment, how it was sent, and what it carried. Then the recorded
 * requests are handed to the real server pipeline (lib/analytics/collect) to
 * see the rows they become.
 *
 *   a full load                    one view, sent in an idle callback, never before
 *   a Next style route change      one view for the new path, the page kept mounted
 *   back to a page just seen       nothing
 *   a Next prefetch, <link rel=prefetch>   nothing
 *   a link out (Instagram)         one link_click, by beacon, without its query
 *   a full load to another page    one view; a reload of it, nothing
 *   navigator.webdriver, a frame   nothing at all
 *
 * The browser is told it is not automated (navigator.webdriver false) and
 * given an ordinary Chrome signature, because the tracker rightly sends
 * nothing for a headless, scripted browser; the last section checks that too.
 *
 *   node scripts/check-analytics-collection.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const out = mkdtempSync(join(tmpdir(), "storelib-analytics-collection-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })

/* The theme compiler hashes section sources with node:crypto on the server; in the page a stand-in does. */
writeFileSync(join(out, "crypto-stub.js"), `export function createHash() { let s = ""; return { update(x) { s += String(x); return this }, digest() { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(16).padStart(8, "0").repeat(8) } } }
export const createHmac = () => createHash()
export default { createHash, createHmac }
`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-analytics-collection.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`, `--alias:node:crypto=${join(out, "crypto-stub.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"], { cwd: root, stdio: "inherit" })
/* PROBE_SERVER_HALF=0 measures the browser alone: how the tracker of an older tree behaves, before there was a pipeline to hand its requests to. */
const SERVER_HALF = process.env.PROBE_SERVER_HALF !== "0"
if (SERVER_HALF) execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-analytics-collection-server.ts"), "--bundle", "--format=esm", "--platform=node", "--log-level=error",
  "--conditions=react-server", `--outfile=${join(out, "server.mjs")}`, `--alias:@=${root}`], { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(out, "probe.js"))

/* Every tracking request, as the server saw it, with its time on the page's clock (set by the page). */
let sent = []
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ana's shop</title></head><body style="margin:0"><div id="app"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (url.pathname === "/slow-hero.png") { setTimeout(() => { res.writeHead(200, { "content-type": "image/png" }); res.end(PNG) }, 1200); return }
  if (url.pathname === "/api/track-view" || url.pathname === "/api/track-event") {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      let parsed = null
      try { parsed = JSON.parse(body) } catch { parsed = { unreadable: body.slice(0, 80) } }
      sent.push({ path: url.pathname, body: parsed, bytes: Buffer.byteLength(body), headers: { "user-agent": req.headers["user-agent"] || "", "sec-fetch-site": req.headers["sec-fetch-site"] || "", "content-type": req.headers["content-type"] || "", origin: req.headers.origin || "" }, at: Date.now() })
      res.writeHead(204); res.end()
    })
    return
  }
  if (url.pathname === "/frame") { res.writeHead(200, { "content-type": "text/html" }); return res.end(`<!doctype html><iframe src="/about" width="800" height="600"></iframe>`) }
  /* Every other address is a page of the site: the same document, which draws the page for its path. */
  if (req.headers["next-router-prefetch"] || req.headers.purpose === "prefetch" || req.headers["sec-purpose"]) res.setHeader("x-was", "prefetch")
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`); if (!ok) broken++ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/* The page a view was for. An older tracker sent only pageUrl, which without consent is the page itself. */
const pathOf = (s) => { try { return new URL(s.body.href ?? s.body.pageUrl).pathname } catch { return "?" } }
const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

/* On the page, before any of its script: when the browser was first idle, and when each tracking request was made, and whether from inside an idle callback. */
const INSTRUMENT = () => {
  window.__marks = { idleRuns: [], calls: [] }
  const ric = window.requestIdleCallback
  if (ric) {
    window.requestIdleCallback = (cb, opts) => ric((deadline) => {
      window.__marks.idleRuns.push(performance.now())
      window.__inIdle = true
      try { cb(deadline) } finally { window.__inIdle = false }
    }, opts)
  }
  const note = (how, url) => { if (/\/api\/track-/.test(String(url))) window.__marks.calls.push({ how, url: String(url), at: performance.now(), inIdle: !!window.__inIdle, readyState: document.readyState }) }
  const f = window.fetch
  window.fetch = (u, i) => { note("fetch", u); return f(u, i) }
  const b = navigator.sendBeacon.bind(navigator)
  navigator.sendBeacon = (u, d) => { note("beacon", u); return b(u, d) }
  window.addEventListener("load", () => { window.__marks.load = performance.now() })
  document.addEventListener("DOMContentLoaded", () => { window.__marks.dcl = performance.now() })
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
try {
  for (const [name, vp] of [["phone, 390 wide", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["desktop, 1280 wide", { width: 1280, height: 900 }]]) {
    console.log(`\n${name}`)
    sent = []
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    await page.setViewport(vp)
    await page.setUserAgent(CHROME)
    await page.evaluateOnNewDocument(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }))
    await page.evaluateOnNewDocument(INSTRUMENT)

    /* 1. A full load of the front page. */
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" })
    await sleep(200)
    expect(sent.length === 0, "nothing is sent while the page is still loading its picture", sent.length)
    await page.waitForFunction(() => window.__marks.calls.length > 0, { timeout: 5000 }).catch(() => {})
    await sleep(300)
    const first = await page.evaluate(() => window.__marks)
    expect(sent.length === 1 && sent[0].path === "/api/track-view" && pathOf(sent[0]) === "/", "a full load sends one view, for /", sent.map(pathOf))
    expect(first.calls.length === 1 && first.calls[0].inIdle && first.idleRuns.length > 0 && first.calls[0].at >= first.idleRuns[0], "  from inside the browser's idle callback, never before it", { call: first.calls[0], firstIdle: first.idleRuns[0], dcl: first.dcl, load: first.load })
    expect(first.load > 0 && first.calls[0].at >= first.load, "  after the page's load event, so never while its hero picture (1.2 s) is downloading", { dcl: Math.round(first.dcl), load: Math.round(first.load), call: Math.round(first.calls[0].at) })
    expect(sent[0].bytes < 1500, "  a small payload", `${sent[0].bytes} bytes`)
    await page.screenshot({ path: join(shots, `analytics-collection-${vp.width}.png`) })

    /* 2. A Next prefetch of /about, and a browser prefetch: neither is a view. */
    await page.evaluate(async () => {
      await fetch("/about", { headers: { "Next-Router-Prefetch": "1", RSC: "1" } })
      const l = document.createElement("link"); l.rel = "prefetch"; l.href = "/products/zine"; document.head.appendChild(l)
    })
    await sleep(2500)
    expect(sent.length === 1, "a Next prefetch and a <link rel=prefetch> send nothing", sent.length)

    /* 3. A route change inside the page, as a Next <Link> makes one. */
    await page.click("#to-about")
    await page.waitForFunction(() => document.getElementById("title")?.textContent === "About")
    await page.waitForFunction(() => window.__marks.calls.length >= 2, { timeout: 5000 }).catch(() => {})
    await sleep(300)
    const route = await page.evaluate(() => ({ marks: window.__marks, mounted: !!document.getElementById("app").firstChild }))
    expect(sent.length === 2 && pathOf(sent[1]) === "/about", "a route change to /about sends one view, for /about", sent.map(pathOf))
    expect(route.marks.calls[1]?.inIdle === true, "  also from an idle callback", route.marks.calls[1])

    /* 4. On to the product, then back to /: the product is new, / was sent a moment ago. */
    await page.click("#to-zine")
    await page.waitForFunction(() => document.getElementById("title")?.textContent === "Zine")
    await sleep(2500)
    await page.goBack()
    await page.waitForFunction(() => document.getElementById("title")?.textContent === "About")
    await sleep(2500)
    const paths = sent.filter((s) => s.path === "/api/track-view").map(pathOf)
    expect(paths.join(" ") === "/ /about /products/zine", "the product page is one view with its product; back to /about sends nothing", paths)
    expect(sent[2]?.body.productId === "aaaaaaaa-1111-4000-8000-000000000001", "  the product view carries the product", sent[2]?.body.productId)

    /* 5. A link out. */
    /* The click is real; only the trip to Instagram is stopped, after the tracker has seen it (a sandbox has no internet, and a new tab would take the focus). */
    await page.evaluate(() => {
      document.getElementById("to-instagram").removeAttribute("target")
      window.addEventListener("click", (e) => { if (e.target.closest?.("#to-instagram")) e.preventDefault() })
    })
    await page.click("#to-instagram")
    await sleep(800)
    const clicks = sent.filter((s) => s.path === "/api/track-event")
    expect(clicks.length === 1 && clicks[0].body.eventType === "link_click" && clicks[0].body.linkUrl === "https://instagram.com/ana.draws", "a link to Instagram is one link_click, without its query", clicks.map((c) => c.body))
    expect(clicks[0]?.headers["content-type"].startsWith("text/plain") && clicks[0]?.headers["sec-fetch-site"] === "same-origin", "  sent by beacon, same origin", clicks[0]?.headers)

    /* 6. A full load to /contact, then a reload of it. */
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click("#to-contact")])
    await page.waitForFunction(() => document.getElementById("title")?.textContent === "Contact")
    await page.waitForFunction(() => window.__marks.calls.length > 0, { timeout: 5000 }).catch(() => {})
    await sleep(300)
    await page.reload({ waitUntil: "load" })
    await sleep(2800)
    const views = sent.filter((s) => s.path === "/api/track-view").map(pathOf)
    expect(views.join(" ") === "/ /about /products/zine /contact", "a full load to /contact is one view; reloading it sends nothing", views)

    /* The server's half: what these requests become. */
    console.log(`        sent: ${sent.length} requests, ${sent.reduce((n, s) => n + s.bytes, 0)} bytes`)
    if (!SERVER_HALF) { await ctx.close(); continue }
    const file = join(out, `sent-${vp.width}.json`)
    writeFileSync(file, JSON.stringify(sent.map((s) => ({ path: s.path, body: s.body, headers: s.headers, at: s.at }))))
    const result = JSON.parse(execFileSync(process.execPath, [join(out, "server.mjs"), file], { cwd: root, encoding: "utf8" }))
    const rows = result.rows
    const viewRows = rows.filter((r) => r.event_type === "view")
    expect(viewRows.length === 4 && viewRows.map((r) => r.path).join(" ") === "/ /about /products/zine /contact", "the server writes four views with their paths", { outcomes: result.outcomes, paths: viewRows.map((r) => r.path) })
    expect(viewRows.every((r) => r.property_type === "website" && r.property_id === "aaaaaaaa-5555-4000-8000-000000000001"), "  each on the website, by its install id", viewRows.map((r) => [r.property_type, r.property_id]))
    expect(new Set(viewRows.map((r) => r.session_id)).size === 1, "  in one visit", viewRows.map((r) => r.session_id))
    const linkRow = rows.find((r) => r.event_type === "link_click")
    expect(linkRow?.path === "/about" && linkRow?.link_url === "https://instagram.com/ana.draws", "  and one link_click, on /about", linkRow)
    console.log(`        rows: ${rows.length}`)
    await ctx.close()
  }

  console.log("\nA scripted browser and a frame send nothing")
  {
    sent = []
    const ctx = await browser.createBrowserContext()
    const page = await ctx.newPage()
    await page.setUserAgent(CHROME)
    /* No webdriver override: puppeteer's browser says it is automated, as a scraper's does. */
    await page.goto(`${origin}/about`, { waitUntil: "load" })
    await sleep(3000)
    expect(sent.length === 0, "navigator.webdriver: no request at all", sent.length)
    await ctx.close()

    const ctx2 = await browser.createBrowserContext()
    const framed = await ctx2.newPage()
    await framed.setUserAgent(CHROME)
    await framed.evaluateOnNewDocument(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }))
    await framed.goto(`${origin}/frame`, { waitUntil: "load" })
    await sleep(3000)
    expect(sent.length === 0, "a page inside a frame (the builder canvas, the workspace): no request", sent.length)
    await ctx2.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
