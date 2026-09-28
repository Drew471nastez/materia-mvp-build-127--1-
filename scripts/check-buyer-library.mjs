/**
 * ===========================================================================
 *  THE BUYER'S LIBRARY AND ITS DOWNLOADS, MEASURED
 * ===========================================================================
 * The real library screens (scripts/render-buyer-library.tsx) at 390 and
 * 1280, over http, with /api/download and storage stood in by this script's
 * two servers (a different port is a different origin, as Supabase is):
 *
 *   LAYOUT     Library heading, the six tabs with Products underlined, one
 *              row per purchase, nothing wider than the screen, every
 *              control at least 36px tall, and the row's actions inside it.
 *              On a phone the sellers are a row of chips and the column is
 *              gone; on a computer the column is there and the chips are not.
 *   FILTERS    a seller's chip shows only their products and their Email or
 *              Message and store; search finds a product by a file's name;
 *              "3 files" opens the list in place.
 *   BANNER     on a phone's browser at 360, 390 and 430, a 60px strip at
 *              the top with the Storelib icon at its 7px corner and Open
 *              (the app's scheme carrying this page), whose room is in the
 *              first paint so nothing under it moves; closing folds it away
 *              and a cookie keeps it closed. Not on a computer, not in the app.
 *   WISHLIST   rows at 360 to 430 and a grid at 1280, each price, "/month",
 *              the saving, the right button, a 44px heart; remove glides the
 *              rest into place and Undo puts it back and saves it again.
 *   MOVES      a tab (warm, cold, slow) and a product in and back, every
 *              frame at 4x CPU: the old screen only fades, a whole screen is
 *              always under it, the pills never move, the list's scroll is
 *              kept on the way back, and the browser's own back is not faded.
 *   BROWSER    Download asks /api/download once, the file saves where the
 *              button is (no tab) and the library's address never changes.
 *   TABS       at 4x CPU, the pressed pill's fill only grows and takes
 *              settings' 150ms, timed on the animation clock from the frame
 *              it starts, with one frame's tolerance each way.
 *   IPHONE APP (bridge stood in, no native downloader): the file is read with
 *              a bar that only grows, measured frame by frame at 4x CPU
 *              throttle, then Save to Files hands the whole file to the
 *              share sheet. A 600 MB file is never read by the page.
 *   ANDROID APP (StorelibNative stood in): DownloadManager is handed the
 *              address, the bar follows its status, the tray says Saved to
 *              Downloads with Open.
 *
 *   PROBE_CSS=source node scripts/check-buyer-library.mjs     (SHOTS_DIR=dir for pictures)
 */
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const faces = interFaces(root)
const fontDir = (faces.match(/url\(file:\/\/([^)]*\/static\/media)\//) ?? [])[1]
const inter = fontDir ? faces.split(`file://${fontDir}/`).join("/font/") : ""
const stubs = join(root, ".buyer-library-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-buyer-library-")), "shots")
mkdirSync(shots, { recursive: true })

/* ONLY=layout|nav|banner|wishlist|reviews|creator|download|app runs one part, for working on it. */
const ONLY = process.env.ONLY || ""
const part = (name) => !ONLY || ONLY === name
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/* components/library/library-panel.tsx OUT_MS: the old screen's fade. */
const OUT_MS = 180

writeFileSync(join(stubs, "navigation.js"), `import { createContext, useContext, useSyncExternalStore } from "react"
/* The routed probe (mode "nav") provides the path through a context updated in a transition, as Next's router does. */
const PathContext = (window.__PathContext ||= createContext(null))
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch: (h, o) => (window.__prefetch ||= []).push([h, o && o.kind]), back: () => log("back"), refresh: () => log("refresh") }
const store = () => (window.__navStore ||= { path: window.__path || "/library", listeners: new Set() })
const subscribe = (l) => { store().listeners.add(l); return () => store().listeners.delete(l) }
export const usePathname = () => {
  const routed = useContext(PathContext)
  const stored = useSyncExternalStore(subscribe, () => store().path, () => store().path)
  return routed ?? stored
}
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); if (window.__navigate) window.__navigate(href) } } }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
/* The Browser plugin, as an app built without it answers. */
writeFileSync(join(stubs, "browser.js"), `export const Browser = { async open() { throw Object.assign(new Error("not implemented"), { code: "UNIMPLEMENTED" }) }, async close() {} }\n`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-buyer-library.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": join(stubs, "navigation.js"), "next/link": join(stubs, "link.jsx"), "next/image": join(stubs, "image.jsx") },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
  plugins: [{ name: "stubs", setup(b) { b.onResolve({ filter: /^@capacitor\/browser$/ }, () => ({ path: join(stubs, "browser.js") })) } }],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`

/* Storage, on its own port: streams the file in slices so a bar has something to follow. */
const state = { api: [], storage: 0, reviews: [], apiDelay: 0, fileHits: 0, wishlist: [] }
const SIZES = { a1: 48_300_000, b1: 3_000_000, c1: 612_000_000, e1: 31_000_000, a2: 12_900_000, a3: 820_000 }
const fileServer = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  const id = url.pathname.split("/").pop()
  /* Only the page's own reads count: a navigation is the system browser standing in. */
  if (req.headers["sec-fetch-mode"] !== "navigate") state.storage++
  else state.fileHits++
  const size = id === "b1" ? 3_000_000 : 2048
  res.writeHead(200, { "content-type": "application/pdf", "content-length": String(size), "access-control-allow-origin": "*", "content-disposition": `attachment; filename=${id}.pdf` })
  let sent = 0
  const slice = 150_000
  const tick = () => {
    if (sent >= size) return res.end()
    const n = Math.min(slice, size - sent)
    sent += n
    res.write(Buffer.alloc(n, 7))
    setTimeout(tick, 45)
  }
  tick()
})
await new Promise((r) => fileServer.listen(0, "127.0.0.1", r))
const storageOrigin = `http://127.0.0.1:${fileServer.address().port}`

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  /* The site's own pictures (the Storelib icon on the app banner), from public/. */
  if (url.pathname.startsWith("/images/")) {
    try {
      const body = readFileSync(join(root, "public", decodeURIComponent(url.pathname)))
      res.writeHead(200, { "content-type": url.pathname.endsWith(".webp") ? "image/webp" : url.pathname.endsWith(".png") ? "image/png" : "application/octet-stream" })
      return res.end(body)
    } catch {
      res.writeHead(404)
      return res.end()
    }
  }
  if (fontDir && url.pathname.startsWith("/font/")) {
    try {
      const body = readFileSync(join(fontDir, decodeURIComponent(url.pathname.slice(6))))
      res.writeHead(200, { "content-type": "font/woff2" })
      return res.end(body)
    } catch {
      res.writeHead(404)
      return res.end()
    }
  }
  const api = url.pathname.match(/^\/api\/download\/([^/]+)$/)
  if (api) {
    const id = decodeURIComponent(api[1])
    state.api.push(id)
    const answer = () => {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    res.end(JSON.stringify({ success: true, downloadUrl: `${storageOrigin}/storage/v1/object/sign/digital-products/${id}`, fileName: `${id}.pdf`, fileSize: SIZES[id] ?? null, mimeType: "application/pdf" }))
    }
    return state.apiDelay ? void setTimeout(answer, state.apiDelay) : answer()
  }
  if (url.pathname === "/api/reviews" && req.method === "POST") {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      const b = JSON.parse(body || "{}")
      state.reviews.push(["POST", b])
      setTimeout(() => {
        if (/FAIL/.test(b.content || "")) {
          res.writeHead(403, { "content-type": "application/json" })
          return res.end(JSON.stringify({ error: "Only a completed purchase can be reviewed." }))
        }
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ review: { id: "r-" + b.productId, created_at: "2026-09-28T10:00:00Z" } }))
      }, 700)
    })
    return
  }
  const one = url.pathname.match(/^\/api\/reviews\/([^/]+)$/)
  if (one && (req.method === "PATCH" || req.method === "DELETE")) {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      state.reviews.push([req.method, decodeURIComponent(one[1]), body ? JSON.parse(body) : null])
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ success: true, review: { id: one[1], edited_at: "2026-09-28T10:00:00Z" } }))
      }, 500)
    })
    return
  }
  if (url.pathname === "/api/wishlist" && (req.method === "DELETE" || req.method === "POST")) {
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      const id = req.method === "DELETE" ? url.searchParams.get("productId") : JSON.parse(body || "{}").productId
      state.wishlist.push([req.method, id])
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ success: true, count: req.method === "DELETE" ? 4 : 5 }))
      }, 150)
    })
    return
  }
  if (url.pathname === "/api/reviews/check") {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify({ isLoggedIn: true, hasPurchased: true, hasReviewed: false, existingReview: null }))
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1280, height: 900 }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

async function open(mode, vp, { path = "/library", ua, init, focus: focusId } = {}) {
  const page = await browser.newPage()
  await page.setViewport(vp)
  if (ua) await page.setUserAgent(ua)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  if (process.env.DEBUG_SHIFTS) page.on("console", (m) => /^shift/.test(m.text()) && console.log("    " + m.text()))
  await page.evaluateOnNewDocument(
    (m, p, initSrc, focus, debugShifts) => {
      window.__mode = m
      window.__path = p
      window.__debugShifts = debugShifts
      window.addEventListener("wishlist-updated", (e) => { if (typeof e.detail?.count === "number") window.__wishCount = e.detail.count })
      if (focus) window.__focus = focus
      if (initSrc) (0, eval)(initSrc)
    },
    mode,
    path,
    init ? `(${init.toString()})()` : "",
    focusId || "",
    !!process.env.DEBUG_SHIFTS,
  )
  await page.goto(`${origin}${path}`, { waitUntil: "networkidle0" })
  await page.evaluate(() => document.fonts.ready)
  page.errors = errors
  return page
}

const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

try {
  /* ─── LAYOUT ───────────────────────────────────────────────────────── */
  for (const [label, vp] of part("layout") ? [["390", PHONE], ["1280", DESK]] : []) {
    console.log(`\nhome at ${label}`)
    const page = await open("home", vp)
    await page.screenshot({ path: join(shots, `home-${label}.png`), fullPage: true })
    const m = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll("[data-library-tab]")].map((a) => [a.textContent, a.getAttribute("aria-current")])
      const rows = [...document.querySelectorAll("[data-library-item]")]
      const small = [...document.querySelectorAll("[data-row-actions] button, [data-row-actions] a, [data-library-toolbar] input, [data-library-toolbar] select")]
        .filter((el) => el.getBoundingClientRect().height > 0)
        .map((el) => Math.round(el.getBoundingClientRect().height))
      const escaped = rows.filter((r) => {
        const box = r.getBoundingClientRect()
        const acts = r.querySelector("[data-row-actions]").getBoundingClientRect()
        return acts.right > box.right + 0.5 || acts.left < box.left - 0.5
      }).length
      const visible = (sel) => {
        const el = document.querySelector(sel)
        return !!el && el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== "none"
      }
      return {
        h1: document.querySelector("h1")?.textContent,
        tabs,
        rows: rows.length,
        minControl: Math.min(...small),
        escaped,
        chips: visible("[data-creator-chips]"),
        aside: visible("[data-library-aside]"),
        stars: document.querySelectorAll("[data-library-item] svg.lucide-star, [data-library-item] [data-review-state]").length,
        rateIt: [...document.querySelectorAll("[data-library-item]")].filter((r) => /Rate it|Your review/.test(r.textContent)).length,
        pills: [...document.querySelectorAll("[data-library-tab]")].map((a) => { const r = a.getBoundingClientRect(); const cs = getComputedStyle(a); return { h: Math.round(r.height), radius: parseFloat(cs.borderTopLeftRadius), border: cs.borderTopWidth } }),
        underline: [...document.querySelectorAll("[data-library-tab]")].some((a) => getComputedStyle(a).borderBottomWidth === "2px"),
        activeFill: getComputedStyle(document.querySelector('[data-library-tab="Products"] [data-library-tab-fill]')).opacity,
        idleFill: getComputedStyle(document.querySelector('[data-library-tab="Courses"] [data-library-tab-fill]')).opacity,
        fade: document.querySelector("[data-library-tabs]")?.getAttribute("data-fade"),
        refunded: [...document.querySelectorAll("[data-library-item]")].filter((r) => /Refunded/.test(r.textContent)).length,
        /* A row's own actions are SMALL: 36px, not the 40px a concatenated class string drew. */
        rowActions: [...new Set([...document.querySelectorAll("[data-row-actions] a, [data-row-actions] button[data-row-download]")].filter((el) => el.getBoundingClientRect().height > 0).map((el) => Math.round(el.getBoundingClientRect().height)))],
      }
    })
    expect(m.rowActions.length > 0 && m.rowActions.every((h) => h === 36), "a row's own buttons are the small size, 36px", m.rowActions)
    expect(m.h1 === "Library", "the heading is Library", m.h1)
    expect(m.tabs.map((t) => t[0]).join() === "Products,Courses,Memberships,Reviews,Receipts,Wishlist" && m.tabs[0][1] === "page", "six tabs, Products current", m.tabs)
    expect(m.pills.every((p) => p.h === 36 && p.radius >= 18 && p.border === "1px") && !m.underline, "the tabs are separate pills, 36px, fully round, no underline", m.pills[0])
    expect(m.activeFill === "1" && m.idleFill === "0", "the chosen pill is filled, the others are not", { active: m.activeFill, idle: m.idleFill })
    expect(label === "390" ? m.fade === "right" : m.fade === "none", label === "390" ? "on a phone the row scrolls and fades at its right edge" : "on a computer every pill fits, no fade", m.fade)
    expect(m.rows === 5, "one row per purchase", m.rows)
    const over = await overflowOf(page)
    expect(over <= 0, "nothing wider than the screen", over)
    expect(m.minControl >= 36, "every control at least 36px tall", m.minControl)
    expect(m.escaped === 0, "every row's actions stay inside the row", m.escaped)
    expect(label === "390" ? m.chips && !m.aside : !m.chips && m.aside, label === "390" ? "sellers are chips, no column" : "sellers are a column, no chips", { chips: m.chips, aside: m.aside })
    expect(m.stars === 0 && m.rateIt === 0 && m.refunded === 1, "no stars and no Rate it on any product row, Refunded on one", { stars: m.stars, rateIt: m.rateIt, refunded: m.refunded })
    expect(page.errors.length === 0, "no page errors", page.errors)

    /* FILTERS */
    if (label === "390") {
      await page.evaluate(() => [...document.querySelectorAll("[data-creator-chips] button")].find((b) => /Luca/.test(b.textContent)).click())
      await sleep(150)
      const f = await page.evaluate(() => ({
        rows: [...document.querySelectorAll("[data-library-item]")].map((r) => r.getAttribute("data-library-item")),
        strip: !!document.querySelector("[data-creator-strip]"),
        contact: document.querySelector("[data-creator-strip] [data-creator-contact]")?.getAttribute("href"),
        store: document.querySelector("[data-creator-strip] [data-creator-store]")?.getAttribute("href"),
      }))
      expect(f.rows.join() === "p2,p4", "a seller's chip shows only their products", f.rows)
      expect(f.strip && /^\/receipt\/tok_p2_/.test(f.contact || "") && /#receipt-contact$/.test(f.contact || "") && f.store === "/lucadragoste", "with Message (the receipt's contact form) and their store", f)
      await page.screenshot({ path: join(shots, `home-${label}-creator.png`), fullPage: true })
      await page.evaluate(() => [...document.querySelectorAll("[data-creator-chips] button")].find((b) => /Maya/.test(b.textContent)).click())
      await sleep(100)
      const mail = await page.evaluate(() => document.querySelector("[data-creator-strip] [data-creator-contact]")?.getAttribute("href"))
      expect(/^mailto:hello@mayachen\.co/.test(mail || ""), "a seller with a support address is emailed", mail)
      await page.evaluate(() => [...document.querySelectorAll("[data-creator-chips] button")][0].click())
      await page.type("[data-library-toolbar] input", "Mobile.dng")
      await sleep(100)
      const s = await page.evaluate(() => [...document.querySelectorAll("[data-library-item]")].map((r) => r.getAttribute("data-library-item")))
      expect(s.join() === "p1", "search finds a product by a file's name", s)
      await page.evaluate(() => document.querySelector('[data-library-item="p1"] [data-row-files]').click())
      await sleep(150)
      const files = await page.evaluate(() => document.querySelectorAll('[data-library-item="p1"] [data-library-file]').length)
      expect(files === 3, "3 files opens the list in place", files)
      await page.screenshot({ path: join(shots, `home-${label}-files.png`), fullPage: true })
    }
    await page.close()
  }

  for (const [mode, label, vp] of !part("layout") ? [] : [["reviews", "390", PHONE], ["reviews", "1280", DESK], ["receipts", "390", PHONE], ["receipts", "1280", DESK], ["product", "390", PHONE], ["product", "1280", DESK], ["empty", "390", PHONE], ["empty", "1280", DESK]]) {
    console.log(`\n${mode} at ${label}`)
    const path = mode === "product" ? "/library/products/p1" : mode === "empty" ? "/library" : `/library/${mode}`
    const page = await open(mode, vp, { path })
    await sleep(250)
    await page.screenshot({ path: join(shots, `${mode}-${label}.png`), fullPage: true })
    const over = await overflowOf(page)
    expect(over <= 0, "nothing wider than the screen", over)
    const m = await page.evaluate(() => ({
      tabs: document.querySelectorAll("[data-library-tab]").length,
      waiting: document.querySelectorAll("[data-review-waiting]").length,
      done: document.querySelectorAll("[data-review-done]").length,
      receipts: document.querySelectorAll("[data-receipt-row]").length,
      invoices: document.querySelectorAll("[data-receipt-invoice]").length,
      files: document.querySelectorAll("[data-library-file]").length,
      review: document.querySelector("[data-product-review]")?.getAttribute("href"),
      contact: document.querySelector("[data-product-creator] [data-creator-contact]")?.getAttribute("href"),
      empty: !!document.querySelector("[data-library-empty]"),
      text: document.body.innerText,
    }))
    if (mode === "reviews") expect(m.waiting === 3 && m.done === 1, "three to review, one reviewed, the refund in neither", { waiting: m.waiting, done: m.done })
    if (mode === "receipts") expect(m.receipts === 5 && m.invoices === 3 && /Refunded/.test(m.text) && /Free/.test(m.text), "five receipts, invoices for the three paid ones that stand, a refund and a free one said so", { r: m.receipts, i: m.invoices })
    if (mode === "product") {
      expect(m.tabs === 0, "a product has its back link, not the tabs", m.tabs)
      expect(m.files === 3 && /Added after you bought it/.test(m.text), "every file with its size, and the one added later marked", m.files)
      expect(m.review === "/library/reviews?product=p1", "the review is one line that goes to the Reviews tab", m.review)
      expect(/^mailto:hello@mayachen\.co/.test(m.contact || ""), "and the creator block writes to the seller", m.contact)
    }
    if (mode === "empty") expect(m.empty && /Your wishlist \(3\)/.test(m.text), "an empty library says what it is for and points at the wishlist", m.empty)
    expect(page.errors.length === 0, "no page errors", page.errors)
    await page.close()
  }

  /* ─── ONLY=profile: where a press's own time goes, at 4x CPU (not part of the normal run) ─── */
  if (ONLY === "profile") {
    const page = await open("nav", PHONE)
    await sleep(2500)
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await cdp.send("Profiler.enable")
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
    await cdp.send("Profiler.start")
    const r = await page.evaluate(() => new Promise((resolve) => {
      const t0 = performance.now()
      const long = []
      new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push([Math.round(e.startTime - t0), Math.round(e.duration)]))).observe({ type: "longtask" })
      document.querySelector(window.__profileSel || '[data-library-tab-href="/library/reviews"]').click()
      const t1 = performance.now()
      const frames = []
      const step = () => { frames.push(Math.round(performance.now() - t0)); if (frames.length < 12) requestAnimationFrame(step); else setTimeout(() => resolve({ click: Math.round(t1 - t0), frames, long }), 800) }
      requestAnimationFrame(step)
    }))
    const { profile } = await cdp.send("Profiler.stop")
    console.log(JSON.stringify(r))
    const self = new Map()
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    profile.samples.forEach((s, i) => { const n = byId.get(s); const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (profile.timeDeltas[i] || 0)) })
    console.log([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / 1000).toFixed(1)}ms ${k}`).join("\n"))
    await page.close()
  }

  /* ─── MOVING BETWEEN SCREENS, frame by frame at 4x CPU throttle ──────
     Every animation frame after the press: each pill's fill, the leaving
     copy's opacity, the incoming shape's, the live screen's (and whether it
     is shown), what covers the screen, where the pill row sits, the scroll,
     and every layout shift Chromium reports. */
  /*
    PRESSED WITH A REAL CLICK (puppeteer's mouse, through the browser's own
    input), so the layout shift numbers mean what Chromium's CLS means: a
    shift in the half second after a press is the press's answer, not an
    unexpected jump. The sampler starts in the click's own task.
  */
  const sampleMove = async (page, press, ms = 1100) => {
    await page.evaluate(
      (press, ms) => {
        window.__sample = new Promise((resolve) => {
          const out = []
          const shifts = []
          const po = new PerformanceObserver((l) =>
            l.getEntries().forEach((e) => {
              if (e.hadRecentInput) return
              shifts.push(e.value)
              if (window.__debugShifts) console.log("shift", Math.round(performance.now() - t0), e.value.toFixed(4), (e.sources || []).map((s) => `${s.node?.nodeName}.${String(s.node?.className || "").slice(0, 60)} ${JSON.stringify(s.previousRect)}->${JSON.stringify(s.currentRect)}`).join(" | "))
            }),
          )
          po.observe({ type: "layout-shift" })
          let t0 = 0
          /* The animation clock: what a transition's progress is computed from, one value per frame. */
          let c0 = 0
          const fill = (href) => {
            const el = document.querySelector(`[data-library-tab-href="${href}"] [data-library-tab-fill]`)
            return el ? parseFloat(getComputedStyle(el).opacity) : null
          }
          const live = document.querySelector("[data-library-live]")
          const now = document.querySelector("[data-library-now]")
          const row = () => document.querySelector("[data-library-tabs]")
          const fromPath = location.pathname
          const step = () => {
            const t = performance.now()
            const leaving = [...document.querySelectorAll("[data-library-leaving]")].map((l) => parseFloat(getComputedStyle(l).opacity))
            const inc = document.querySelector("[data-library-incoming]")
            const incOp = inc && getComputedStyle(inc).display !== "none" ? parseFloat(getComputedStyle(inc).opacity) : 0
            const liveShown = getComputedStyle(live).visibility !== "hidden" && getComputedStyle(now).visibility !== "hidden"
            const liveOp = liveShown ? parseFloat(getComputedStyle(live).opacity) * parseFloat(getComputedStyle(now).opacity) : 0
            const liveBox = live.getBoundingClientRect()
            const livePath = live.querySelector("[data-probe-path]")?.getAttribute("data-probe-path") ?? null
            const inView = liveBox.height > 80 && liveBox.top < innerHeight && liveBox.bottom > 0
            const isNew = livePath === press.to && !live.querySelector("[data-library-skeleton]")
            const old = Math.max(0, ...leaving, livePath === fromPath && inView ? liveOp : 0)
            const fresh = isNew && inView ? liveOp : 0
            const r = row()
            out.push({
              t: Math.round(t - t0),
              clock: Math.round(document.timeline.currentTime - c0),
              lead: Math.round(old * 1000) / 1000,
              inc: Math.round(incOp * 1000) / 1000,
              live: Math.round(fresh * 1000) / 1000,
              cover: Math.round(Math.min(1, old + incOp + fresh) * 1000) / 1000,
              copies: leaving.length,
              dbg: window.__dbgAnims ? [...document.querySelectorAll("[data-library-leaving]")].map((l) => l.getAnimations().map((a) => `${a.playState} st=${a.startTime && Math.round(a.startTime - t0)} ct=${a.currentTime && Math.round(a.currentTime)} tl=${Math.round(document.timeline.currentTime - t0)}`).join()).join("|") : undefined,
              active: document.querySelector('[data-library-tab][data-active="true"]')?.getAttribute("data-library-tab-href") ?? null,
              fills: press.fills ? press.fills.map(fill) : null,
              rowTop: r ? Math.round(r.getBoundingClientRect().top * 10) / 10 : null,
              scrollY: Math.round(window.scrollY),
              path: location.pathname,
            })
            if (t - t0 > ms) {
              po.disconnect()
              return resolve({ f: out, cls: shifts.reduce((a, b) => a + b, 0) })
            }
            requestAnimationFrame(step)
          }
          document.addEventListener(
            "click",
            () => {
              t0 = performance.now()
              c0 = document.timeline.currentTime
              step()
            },
            { capture: true, once: true },
          )
        })
      },
      press,
      ms,
    )
    await page.click(press.selector)
    return page.evaluate(() => window.__sample)
  }

  const summary = (f) => {
    const gaps = f.slice(1).map((x, i) => x.t - f[i].t).sort((a, b) => a - b)
    return `${f.length} frames over ${f.at(-1).t}ms; median frame ${gaps[Math.floor(gaps.length / 2)]}ms, worst ${gaps.at(-1)}ms`
  }
  const rises = (xs) => xs.filter((v, i) => i > 0 && v > xs[i - 1] + 0.002).length
  const falls = (xs) => xs.filter((v, i) => i > 0 && v < xs[i - 1] - 0.002).length
  const trace = (f, n = 14) => f.slice(0, n).map((x) => `${x.t}:${x.lead.toFixed(2)}/${x.inc.toFixed(2)}/${x.live.toFixed(2)}`).join(" ")

  for (const [label, vp] of part("nav") ? [["390", PHONE], ["1280", DESK]] : []) {
    for (const mode of ["warm", "cold", "slow"]) {
      console.log(`\ntab switch at ${label}, ${mode === "cold" ? "cold (the route's skeleton, then the screen 500ms later)" : mode === "slow" ? "slow (the answer 400ms late, no route skeleton)" : "warm"}, 4x CPU`)
      const page = await open("nav", vp, { init: mode === "cold" ? () => { window.__cold = true } : mode === "slow" ? () => { window.__delay = 400 } : undefined })
      await sleep(2600)
      const prefetched = await page.evaluate(() => (window.__prefetch || []).filter(([, k]) => k === "full").map(([h]) => h))
      if (mode === "warm") expect(["/library/courses", "/library/memberships", "/library/reviews", "/library/receipts", "/library/wishlist"].every((h) => prefetched.includes(h)), "every other tab is fetched whole while the page is idle", [...new Set(prefetched)])
      await page.evaluate(() => window.scrollTo(0, 60))
      await sleep(100)
      const cdp = await page.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      const { f, cls } = await sampleMove(page, { selector: '[data-library-tab-href="/library/reviews"]', to: "/library/reviews", fills: ["/library/reviews", "/library"] }, mode === "warm" ? 1200 : 1600)
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      console.log(`    ${summary(f)}; layout shift ${cls.toFixed(4)}`)
      console.log(`    t:leaving/shape/screen ${trace(f)}`)
      if (process.env.DEBUG_FRAMES) console.log(f.map((x) => JSON.stringify(x)).join("\n"))
      /* f[0] is read in the same task as the click; f[1] is the first frame painted after the press. */
      expect(f[1].active === "/library/reviews", "the pressed pill is chosen in the first frame after the press, ahead of the route", { t: f[1].t, active: f[1].active })
      const fills = f.map((x) => x.fills[0])
      const drops = fills.filter((v, i) => i > 0 && v < fills[i - 1] - 0.001).length
      const full = f.find((x) => x.fills[0] >= 0.999)
      /*
        TIMED FROM THE FRAME THE FILL STARTS, NOT FROM THE PRESS. It was timed
        from the press's frame, and under 4x throttle the commit that starts
        the transition can land a frame or two after that frame, so the fill
        reached 1 at 156 to 195ms after the press while still taking 150ms
        itself: a flake that said nothing about the animation.

        The transition really began somewhere between the last sample that
        read 0 (lastZero) and the first that read more (begun). It really
        ended somewhere between the sample before `full` and `full`. So:
          full - begun    <= 150 + the gap at the end   (never longer than 150ms)
          full - lastZero >= 150 - one frame            (never shorter: really animated)
        A frame's worth of tolerance on each side, and nothing else. It still
        fails a 300ms fade, an instant jump to 1, and any dip on the way.
      */
      const begunAt = fills.findIndex((v) => v > 0.001)
      const begun = begunAt > 0 ? f[begunAt] : null
      const lastZero = begunAt > 0 ? f[begunAt - 1] : null
      const fullAt = full ? f.indexOf(full) : -1
      /* On the animation clock (document.timeline), which is what the fill's progress is read from; performance.now() inside a throttled frame runs ahead of it by however long the frame took. */
      const clockGaps = f.slice(1).map((x, i) => x.clock - f[i].clock).filter((g) => g > 0).sort((a, b) => a - b)
      const medianGap = clockGaps[Math.floor(clockGaps.length / 2)] ?? 17
      const gapAtFull = fullAt > 0 ? full.clock - f[fullAt - 1].clock : 0
      const took = full && begun ? full.clock - begun.clock : null
      const atLeast = full && lastZero ? full.clock - lastZero.clock : null
      expect(
        drops === 0 && fills[0] < 1 && !!begun && !!full && took <= 150 + gapAtFull + 2 && atLeast >= 150 - medianGap - 2 && fullAt > begunAt,
        "its fill only grows, 0 to 1 in settings' 150ms from the frame the fill starts (one frame's tolerance)",
        { first: fills[0], lastZeroAt: lastZero?.clock, begunAt: begun?.clock, fullAt: full?.clock, took, atLeast, gapAtFull, medianGap, drops },
      )
      /* And the start itself follows the press closely: within a few frames of the pill being chosen. */
      expect(!!begun && begunAt - 1 <= 4, "the fill starts within a few frames of the press", { chosenAt: f[1].t, begunAt: begun?.t, frames: begunAt - 1 })
      const outs = f.map((x) => x.fills[1])
      expect(outs.at(-1) === 0 && rises(outs) === 0, "the old pill's fill only fades out", outs.slice(0, 6))
      expect(f[1].lead > 0.9 && f[1].inc === 1, "the press's own frame starts the dissolve: the old screen over the new one's whole shape", { old: f[1].lead, shape: f[1].inc })
      expect(f.slice(1, 3).every((x) => x.copies === 0) || mode !== "slow", "a slow answer copies nothing at the press: the live screen fades by itself", f.slice(1, 3).map((x) => x.copies))
      /* Cold, the route's own skeleton commits in the press's first frames and the old screen is copied then, which at a quarter speed can hold the first frames: its start is reported, not held to three frames. */
      const moving = f.find((x, i) => i > 0 && x.lead < 0.999)
      console.log(`    the old screen's fade was moving ${moving?.t}ms after the press`)
      if (mode !== "cold") expect(f.slice(1, 4).some((x) => x.lead < 0.999), "and the fade is moving within three frames of the press", f.slice(1, 4).map((x) => `${x.t}:${x.lead}`))
      const shapeUntil = f.findIndex((x) => x.live > 0)
      expect(f.slice(1, shapeUntil < 0 ? f.length : shapeUntil).every((x) => x.inc === 1), "the shape is whole under the fade until the screen takes its place", f.slice(1, shapeUntil).map((x) => x.inc))
      /* Before the screen lands: the old screen. From then: the copies over it (the old screen's rest, and the shape's). Each only fades. */
      const pre = f.slice(1, shapeUntil < 0 ? f.length : shapeUntil).map((x) => x.lead)
      const post = shapeUntil < 0 ? [] : f.slice(shapeUntil).map((x) => x.lead)
      const between = f.filter((x) => x.lead > 0.05 && x.lead < 0.95).length
      expect(rises(pre) === 0 && rises(post) === 0 && between >= 2, "the old screen only fades out, over several frames (no hard cut)", { between, pre: pre.slice(0, 8).map((v) => v.toFixed(2)), post: post.slice(0, 6).map((v) => v.toFixed(2)) })
      expect(shapeUntil > 0 && f.slice(shapeUntil).every((x) => x.live === 1), "the real screen comes in whole, under what is still fading", { from: shapeUntil, lives: f.slice(shapeUntil, shapeUntil + 6).map((x) => x.live) })
      const minCover = Math.min(...f.map((x) => x.cover))
      expect(minCover >= 0.99, "no blank frame and no dip: a whole screen is under the fade in every frame", { minCover, at: f.find((x) => x.cover === minCover)?.t })
      expect(f.at(-1).lead === 0 && f.at(-1).inc === 0, "and nothing is left over the screen at the end", { lead: f.at(-1).lead, inc: f.at(-1).inc })
      const tops = [...new Set(f.map((x) => x.rowTop))]
      expect(tops.length === 1, "the pill row never moves", tops)
      expect(new Set(f.map((x) => x.scrollY)).size === 1, "the scroll stays where the finger left it", [...new Set(f.map((x) => x.scrollY))])
      /*
        A screen that lands late (cold or slow, over half a second after the
        press at a quarter speed) can move the footer under it by however much
        taller or shorter it is than its shape: that is the one shift left,
        and it is below the screen's own top. Warm, nothing shifts at all.
      */
      if (mode === "warm") expect(cls < 0.001, "no layout shift", cls)
      else expect(cls < 0.1, "only the footer's move when the late screen's height differs from its shape (well under CLS's 0.1)", cls)
      const arrivedAt = f[shapeUntil]?.t
      console.log(`    the real screen landed ${arrivedAt}ms after the press (a quarter speed: the harness renders the whole screen in that time)`)
      if (mode === "cold") expect(arrivedAt !== undefined && arrivedAt >= 450, "cold: the shape holds through the route's skeleton, which is never seen", arrivedAt)
      await page.screenshot({ path: join(shots, `nav-${mode}-${label}.png`) })
      expect(page.errors.length === 0, "no page errors", page.errors)
      await page.close()
    }
  }

  /* At full speed a prefetched tab's screen lands while the old one is still fading, so the shape is never really seen. */
  for (const [label, vp] of part("nav") ? [["390", PHONE], ["1280", DESK]] : []) {
    console.log(`\ntab switch at ${label}, warm, full speed`)
    const page = await open("nav", vp, { init: process.env.DEBUG_FRAMES ? () => { window.__dbgAnims = true } : undefined })
    await sleep(1500)
    const { f } = await sampleMove(page, { selector: '[data-library-tab-href="/library/wishlist"]', to: "/library/wishlist", fills: ["/library/wishlist", "/library"] }, 500)
    const at = f.find((x) => x.live > 0)
    console.log(`    the wishlist landed ${at?.t}ms after the press; the old screen's fade is ${OUT_MS}ms`)
    if (process.env.DEBUG_FRAMES) console.log(f.slice(0, 10).map((x) => `${x.t} ${x.lead} ${x.dbg}`).join("\n"))
    expect(!!at && at.t <= OUT_MS + 100 && Math.min(...f.map((x) => x.cover)) >= 0.99 && f.at(-1).lead === 0, `the wishlist lands about as the ${OUT_MS}ms fade ends, with nothing blank`, { landedAt: at?.t, trace: f.slice(0, 8).map((x) => `${x.t}:${x.lead.toFixed(2)}/${x.inc}/${x.live}`) })
    await page.screenshot({ path: join(shots, `nav-wishlist-${label}.png`) })
    expect(page.errors.length === 0, "no page errors", page.errors)
    await page.close()
  }

  /* ─── INTO A PRODUCT AND BACK, at 4x CPU ───────────────────────────── */
  for (const [label, vp] of part("nav") ? [["390", PHONE], ["1280", DESK]] : []) {
    console.log(`\nproducts list to a product and back at ${label}, 4x CPU`)
    const page = await open("nav", vp)
    await sleep(800)
    await page.evaluate(() => document.querySelector('[data-library-item="p3"]').scrollIntoView({ block: "center" }))
    await sleep(150)
    const listScroll = await page.evaluate(() => Math.round(window.scrollY))
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const into = await sampleMove(page, { selector: '[data-library-item="p3"] a[href="/library/products/p3"]:not([aria-hidden])', to: "/library/products/p3" }, 1300)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    console.log(`    in:   ${summary(into.f)}; layout shift ${into.cls.toFixed(4)}`)
    console.log(`          ${trace(into.f)}`)
    expect(into.f.at(-1).path === "/library/products/p3", "the product opens", into.f.at(-1).path)
    expect(Math.min(...into.f.map((x) => x.cover)) >= 0.99, "no blank frame on the way in", Math.min(...into.f.map((x) => x.cover)))
    const splitAt = (f) => f.findIndex((x) => x.live > 0)
    const fades = (f) => {
      const at = splitAt(f)
      /* At a quarter speed a frame can last 400ms while the compositor goes on fading, so one sample part way is the proof there was a fade and not a cut. */
      return at > 0 && rises(f.slice(1, at).map((x) => x.lead)) === 0 && rises(f.slice(at).map((x) => x.lead)) === 0 && f.filter((x) => x.lead > 0.05 && x.lead < 0.95).length >= 1
    }
    expect(fades(into.f) && into.f.at(-1).live === 1 && into.f.at(-1).lead === 0, "the list dissolves into the product (no hard cut)", into.f.map((x) => x.lead.toFixed(2)).slice(0, 12))
    expect(into.f.slice(2).every((x) => x.scrollY === 0), "and it starts at the top", [...new Set(into.f.map((x) => x.scrollY))])
    await page.screenshot({ path: join(shots, `product-open-${label}.png`) })

    /* The back control: 44px to press, a pill in it, pressed on the finger. */
    const back = await page.evaluate(() => {
      const a = document.querySelector("[data-library-back]")
      const pill = a?.querySelector("span")
      const r = a?.getBoundingClientRect()
      const p = pill?.getBoundingClientRect()
      return { text: a?.textContent.trim(), h: r ? Math.round(r.height) : 0, w: r ? Math.round(r.width) : 0, pillH: p ? Math.round(p.height) : 0, radius: pill ? getComputedStyle(pill).borderTopLeftRadius : null, chevron: !!a?.querySelector("svg.lucide-chevron-left") }
    })
    expect(back.text === "Library" && back.h >= 44 && back.w >= 44 && back.pillH === 36 && back.chevron && parseFloat(back.radius) >= 18, "the back control is a chevron and Library, a 36px pill in a 44px target", back)
    const box = await page.$eval("[data-library-back]", (a) => { const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    await sleep(220)
    const pressed = await page.evaluate(() => { const s = getComputedStyle(document.querySelector("[data-library-back] span")); return { scale: s.scale, bg: s.backgroundColor } })
    await page.screenshot({ path: join(shots, `product-back-pressed-${label}.png`), clip: { x: 0, y: 0, width: vp.width, height: 260 } })
    expect(pressed.scale === "0.96" && pressed.bg === "rgb(238, 240, 243)", "pressed, it dips to 96% on a grey fill", pressed)
    await page.mouse.up()
    await sleep(900)
    const after = await page.evaluate(() => ({ path: location.pathname, scrollY: Math.round(scrollY), rows: document.querySelectorAll("[data-library-item]").length, left: document.querySelectorAll("[data-library-leaving]").length }))
    expect(after.path === "/library" && after.rows === 5 && after.left === 0, "Library returns to the list", after)
    expect(Math.abs(after.scrollY - listScroll) <= 1, "with the list's scroll where it was", { was: listScroll, now: after.scrollY })
    await page.screenshot({ path: join(shots, `product-back-${label}.png`) })

    /* Again, sampled frame by frame this time: in, then Library pressed as a click. */
    await page.evaluate((y) => window.scrollTo(0, y), listScroll)
    await sleep(120)
    await page.click('[data-library-item="p3"] a[href="/library/products/p3"]:not([aria-hidden])')
    await sleep(700)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    const home = await sampleMove(page, { selector: "[data-library-back]", to: "/library" }, 1300)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    console.log(`    back: ${summary(home.f)}; layout shift ${home.cls.toFixed(4)}`)
    if (process.env.DEBUG_FRAMES) console.log(home.f.map((x) => JSON.stringify({ t: x.t, c: x.clock, lead: x.lead, inc: x.inc, live: x.live, copies: x.copies, y: x.scrollY })).join("\n"))
    console.log(`          ${trace(home.f)}`)
    expect(Math.min(...home.f.map((x) => x.cover)) >= 0.99, "no blank frame on the way back", Math.min(...home.f.map((x) => x.cover)))
    expect(fades(home.f) && home.f.at(-1).live === 1 && home.f.at(-1).lead === 0 && home.f.at(-1).path === "/library", "the product dissolves into the list (no hard cut)", home.f.map((x) => x.lead.toFixed(2)).slice(0, 12))
    const settled = home.f.filter((x) => x.live > 0).map((x) => x.scrollY)
    expect(settled.length > 0 && settled.every((y) => Math.abs(y - listScroll) <= 1), "the list is drawn at its old scroll from its first frame", { was: listScroll, drawnAt: [...new Set(settled)] })

    /* The browser's own back: no fade of ours on top of the browser's, the scroll still put back. */
    await page.click('[data-library-item="p3"] a[href="/library/products/p3"]:not([aria-hidden])')
    await sleep(700)
    await page.evaluate(() => history.back())
    await sleep(120)
    const pop = await page.evaluate(() => ({ path: location.pathname, left: document.querySelectorAll("[data-library-leaving]").length, scrollY: Math.round(scrollY) }))
    expect(pop.path === "/library" && pop.left === 0 && Math.abs(pop.scrollY - listScroll) <= 1, "the browser's back is not faded, and still lands at the list's scroll", { ...pop, was: listScroll })
    expect(page.errors.length === 0, "no page errors", page.errors)
    await page.close()
  }

  /* ─── REVIEWS: written, edited and deleted right there ─────────────── */
  for (const [label, vp] of part("reviews") ? [["390", PHONE], ["1280", DESK]] : []) {
    console.log(`\nreviews composer at ${label}`)
    const page = await open("reviews", vp, { path: "/library/reviews" })
    state.reviews.length = 0
    await page.evaluate(() => { window.__router = [] })
    await page.click('[data-review-waiting="p1"] [data-review-write]')
    await sleep(500)
    const shown = await page.evaluate(() => {
      const c = document.querySelector('[data-review-composer="p1"]')
      const r = c?.getBoundingClientRect()
      return { open: !!c, top: r ? Math.round(r.top) : null, bottom: r ? Math.round(r.bottom) : null, dialog: !!c?.closest('[data-slot="dialog-content"]') }
    })
    expect(shown.open, "Leave a review opens the composer on this page", shown)
    expect(label === "390" ? !shown.dialog : shown.dialog, label === "390" ? "as the sheet on a phone" : "as a dialog on a computer", shown)
    await page.screenshot({ path: join(shots, `reviews-composer-${label}.png`) })
    await page.click('[data-review-composer="p1"] [data-star]:nth-of-type(4)')
    await page.type('[data-review-composer="p1"] textarea', "Clean presets, the Portra one is on every edit now.")
    await page.click('[data-review-composer="p1"] [data-composer-submit]')
    await sleep(120)
    const optimistic = await page.evaluate(() => ({
      done: !!document.querySelector('[data-review-done="p1"]'),
      waiting: !!document.querySelector('[data-review-waiting="p1"]'),
      busy: document.querySelector('[data-review-done="p1"]')?.getAttribute("data-review-busy"),
      stars: document.querySelector('[data-review-done="p1"] [role="img"]')?.getAttribute("aria-label"),
      composer: !!document.querySelector('[data-review-composer="p1"]'),
    }))
    expect(optimistic.done && !optimistic.waiting && optimistic.busy === "post" && optimistic.stars === "4 out of 5 stars", "Post moves it into Your reviews at once, before the server answers", optimistic)
    await sleep(900)
    const settled = await page.evaluate(() => ({ busy: document.querySelector('[data-review-done="p1"]')?.getAttribute("data-review-busy"), router: window.__router }))
    const post = state.reviews.find((r) => r[0] === "POST")
    expect(post && post[1].productId === "p1" && post[1].rating === 4 && /Portra/.test(post[1].content), "it posted the stars and the words to /api/reviews", post)
    expect(!settled.busy && !settled.router.some(([k]) => k === "push" || k === "link" || k === "replace"), "and settled with no page change (only a refresh of the data)", settled)
    await page.screenshot({ path: join(shots, `reviews-posted-${label}.png`), fullPage: true })

    /* Edit, then Delete. */
    await page.click('[data-review-done="p1"] [data-review-edit]')
    await sleep(450)
    const pre = await page.evaluate(() => ({ text: document.querySelector('[data-review-composer="p1"] textarea')?.value, lit: document.querySelectorAll('[data-review-composer="p1"] [data-lit="true"]').length }))
    expect(/Portra/.test(pre.text || "") && pre.lit === 4, "Edit opens the composer with their stars and words", pre)
    await page.click('[data-review-composer="p1"] [data-star]:nth-of-type(5)')
    await page.click('[data-review-composer="p1"] [data-composer-submit]')
    await sleep(80)
    const edited = await page.evaluate(() => document.querySelector('[data-review-done="p1"] [role="img"]')?.getAttribute("aria-label"))
    expect(edited === "5 out of 5 stars", "the edit shows at once", edited)
    await sleep(700)
    expect(state.reviews.some((r) => r[0] === "PATCH" && r[1] === "r-p1" && r[2].rating === 5), "and is saved with PATCH /api/reviews/<id>", state.reviews.filter((r) => r[0] === "PATCH"))
    await page.click('[data-review-done="p1"] [data-review-delete]')
    await sleep(80)
    await page.screenshot({ path: join(shots, `reviews-delete-confirm-${label}.png`), fullPage: true })
    await page.click('[data-review-done="p1"] [data-review-delete-confirm]')
    await sleep(60)
    const gone = await page.evaluate(() => ({ done: !!document.querySelector('[data-review-done="p1"]'), waiting: !!document.querySelector('[data-review-waiting="p1"]') }))
    expect(!gone.done && gone.waiting, "Delete puts it back under To review at once", gone)
    await sleep(700)
    expect(state.reviews.some((r) => r[0] === "DELETE" && r[1] === "r-p1"), "and deletes it on the server", state.reviews.map((r) => r[0]))

    /* A refusal: the review goes back, the composer reopens with the words and the reason. */
    await page.click('[data-review-waiting="p3"] [data-review-write]')
    await sleep(450)
    await page.click('[data-review-composer="p3"] [data-star]:nth-of-type(2)')
    await page.type('[data-review-composer="p3"] textarea', "FAIL this should be refused")
    await page.click('[data-review-composer="p3"] [data-composer-submit]')
    await sleep(1400)
    const refused = await page.evaluate(() => ({
      waiting: !!document.querySelector('[data-review-waiting="p3"]'),
      done: !!document.querySelector('[data-review-done="p3"]'),
      alert: document.querySelector('[data-review-composer="p3"] [role="alert"]')?.textContent,
      text: document.querySelector('[data-review-composer="p3"] textarea')?.value,
    }))
    expect(refused.waiting && !refused.done && /completed purchase/.test(refused.alert || "") && /FAIL/.test(refused.text || ""), "a refusal puts it back and reopens the composer with their words and the reason", refused)
    await page.screenshot({ path: join(shots, `reviews-refused-${label}.png`) })
    expect(page.errors.length === 0, "no page errors", page.errors)
    await page.close()

    /* From a product's More menu: /library/reviews?product=p3 */
    const focused = await open("reviews", vp, { path: "/library/reviews", focus: "p3" })
    await sleep(600)
    const f = await focused.evaluate(() => ({ open: !!document.querySelector('[data-review-composer="p3"]'), row: document.getElementById("review-p3")?.getBoundingClientRect().top }))
    expect(f.open, "?product=<id> opens that purchase's composer", f)
    await focused.close()
  }

  /* ─── A PRODUCT ROW'S MORE, AND THE CREATOR BLOCK ──────────────────── */
  if (part("creator")) {
  console.log("\nmore menu and creator block")
    const page = await open("home", DESK)
    await page.click('[data-library-item="p1"] [data-row-more]')
    await sleep(300)
    const rows = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"], [data-slot="dropdown-menu-item"], .action-list a')].map((a) => [a.textContent.trim(), a.getAttribute("href"), a.getAttribute("target")]))
    const review = rows.find((r) => /review/i.test(r[0]))
    const store = rows.find((r) => /store/i.test(r[0]))
    expect(review && review[1] === "/library/reviews?product=p1", "Write a review goes to the Reviews tab, focused on that product", review)
    expect(store && store[2] === "_blank", "the creator's store opens in a new tab", store)
    await page.close()

    for (const width of [320, 360, 390, 430, 768, 1024, 1280]) {
      const p = await open("product", { width, height: 900, isMobile: width < 640, hasTouch: width < 640 }, { path: "/library/products/p1" })
      const m = await p.evaluate(() => {
        const btns = [...document.querySelectorAll("[data-creator-actions] > a")]
        return btns.map((b) => {
          const r = b.getBoundingClientRect()
          const lh = parseFloat(getComputedStyle(b).lineHeight) || 20
          return { text: b.textContent.trim(), h: Math.round(r.height), top: Math.round(r.top), lines: Math.round(b.querySelector("span").getBoundingClientRect().height / lh), target: b.getAttribute("target") }
        })
      })
      const sameRow = new Set(m.map((b) => b.top)).size === 1
      const sameH = new Set(m.map((b) => b.h)).size === 1
      expect(m.length === 2 && sameRow && sameH && m.every((b) => b.lines === 1), `at ${width}px the creator's two buttons are one height, one line, side by side`, m.map((b) => `${b.text} ${b.h}px ${b.lines}l`))
      if (width === 390 || width === 1280) {
        expect(m[1]?.target === "_blank", `at ${width}px Store opens in a new tab`, m[1]?.target)
        await p.evaluate(() => document.querySelector("[data-product-creator]").scrollIntoView({ block: "center" }))
        await p.screenshot({ path: join(shots, `creator-block-${width}.png`) })
      }
      await p.close()
    }
    const app = await open("product", PHONE, { path: "/library/products/p1", ua: IPHONE_UA + " Capacitor", init: () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" } } })
    const inApp = await app.evaluate(() => document.querySelector("[data-creator-store]")?.getAttribute("target"))
    expect(inApp === null, "inside the app the store opens in the same web view, as store links do there", inApp)
    await app.close()
  }

  /* ─── THE APP BANNER ───────────────────────────────────────────────── */
  if (part("banner")) {
    for (const width of [360, 390, 430]) {
      console.log(`\napp banner on an iPhone's browser at ${width}`)
      const page = await browser.newPage()
      await page.deleteCookie({ name: "storelib_app_banner", url: origin })
      await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
      await page.setUserAgent(IPHONE_UA)
      /* Every layout shift from the very first paint. */
      await page.evaluateOnNewDocument(() => {
        window.__mode = "home"
        window.__path = "/library"
        window.__shifts = []
        new PerformanceObserver((l) =>
          l.getEntries().forEach((e) => {
            /* The banner itself, or the heading and pills right under it, moving: anything the banner's arrival could push. (Rows reflowing as the web font swaps in are not the banner's.) */
            const moved = (e.sources || []).filter((s) => s.node && s.node.closest && (s.node.closest("[data-open-in-app]") || s.node.closest("[data-library-header]")) && Math.abs(s.currentRect.y - s.previousRect.y) > 0.5)
            if (moved.length) window.__shifts.push([e.value, moved.map((s) => `${s.node.nodeName}.${String(s.node.className).slice(0, 40)} ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)}`).join(" | ")])
          }),
        ).observe({ type: "layout-shift", buffered: true })
      })
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      await page.goto(`${origin}/library`, { waitUntil: "networkidle0" })
      await page.evaluate(() => document.fonts.ready)
      await sleep(500)
      const b = await page.evaluate(() => {
        const el = document.querySelector("[data-open-in-app]")
        const strip = el?.querySelector("[data-open-in-app-banner]")
        const icon = el?.querySelector("[data-open-in-app-icon]")
        const open = el?.querySelector("[data-open-in-app-open]")
        const close = el?.querySelector("[data-open-in-app-close]")
        const h1 = document.querySelector("h1")
        const r = strip?.getBoundingClientRect()
        return {
          h: r ? Math.round(r.height) : 0,
          right: r ? Math.round(r.right) : 0,
          aboveHeading: !!(r && h1 && r.bottom <= h1.getBoundingClientRect().top),
          iconIsLogo: icon?.tagName === "IMG" && /storelib-logo/.test(icon.getAttribute("src") || "") && icon.naturalWidth > 0,
          iconSize: icon ? Math.round(icon.getBoundingClientRect().width) : 0,
          iconRadius: icon ? getComputedStyle(icon).borderTopLeftRadius : null,
          text: strip?.innerText.replace(/\s+/g, " ").trim(),
          clipped: [...(strip?.querySelectorAll("p") || [])].some((p) => p.scrollWidth > p.clientWidth + 1),
          link: open?.getAttribute("href"),
          openH: open ? Math.round(open.getBoundingClientRect().height) : 0,
          closeH: close ? Math.round(close.getBoundingClientRect().height) : 0,
          shifts: window.__shifts.reduce((a, v) => a + v[0], 0),
          moved: window.__shifts.map((v) => v[1]),
        }
      })
      expect(b.h >= 56 && b.h <= 64, "a 56 to 64px strip", b.h)
      expect(b.aboveHeading && b.right <= width - 16, "at the top of the library, above the heading, inside the page's gutter", { above: b.aboveHeading, right: b.right })
      expect(b.iconIsLogo && b.iconSize === 40 && b.iconRadius === "7px", "the Storelib icon at its 7px corner", { logo: b.iconIsLogo, size: b.iconSize, radius: b.iconRadius })
      expect(/^Storelib /.test(b.text || "") && /Open$/.test(b.text || "") && !b.clipped, "Storelib, one short line that fits whole, Open", b.text)
      expect(b.link === "com.storelib.app://open?path=%2Flibrary", "Open goes into this page in the app", b.link)
      expect(b.closeH >= 44, "the close is 44px to press", b.closeH)
      expect(b.shifts < 0.001, "neither the banner nor the heading and pills under it moved while it arrived (its room was in the first paint)", { cls: b.shifts, moved: b.moved })
      await page.screenshot({ path: join(shots, `banner-${width}.png`), clip: { x: 0, y: 0, width, height: 300 } })
      if (width === 390) {
        /* Closing folds it away, smoothly, and it stays closed. */
        const fold = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const el = document.querySelector("[data-open-in-app]")
              const h1 = document.querySelector("h1")
              const out = []
              const t0 = performance.now()
              el.querySelector("[data-open-in-app-close]").click()
              const step = () => {
                const t = performance.now()
                const box = document.querySelector("[data-open-in-app]")
                out.push({ t: Math.round(t - t0), h: box ? Math.round(box.getBoundingClientRect().height * 10) / 10 : 0, top: Math.round(h1.getBoundingClientRect().top * 10) / 10 })
                if (t - t0 > 450) return resolve(out)
                requestAnimationFrame(step)
              }
              requestAnimationFrame(step)
            }),
        )
        const hs = fold.map((x) => x.h)
        console.log(`    fold heights: ${hs.slice(0, 16).join(" ")}`)
        expect(hs.filter((v, i) => i > 0 && v > hs[i - 1] + 0.1).length === 0 && hs.filter((v) => v > 1 && v < 59).length >= 3 && hs.at(-1) === 0, "close folds it away over several frames, never back up", hs.slice(0, 10))
        const cookie = await page.evaluate(() => document.cookie)
        expect(/storelib_app_banner=closed/.test(cookie), "and remembers it in a cookie the server reads", cookie)
        await page.reload({ waitUntil: "networkidle0" })
        expect(!(await page.$("[data-open-in-app]")), "not drawn again once closed")
      }
      expect(errors.length === 0, "no page errors", errors)
      await page.close()
    }
    const android = await open("home", PHONE, { init: () => { document.cookie = "storelib_app_banner=; max-age=0; path=/" }, ua: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Mobile Safari/537.36" })
    const intent = await android.evaluate(() => document.querySelector("[data-open-in-app-open]")?.getAttribute("href"))
    expect(/^intent:#Intent;.*package=com\.storelib\.app;/.test(intent || ""), "an Android phone's browser gets the app's intent", intent)
    await android.close()
    const desk = await open("home", DESK)
    expect(!(await desk.$("[data-open-in-app]")), "not on a computer")
    await desk.close()
    const inApp = await open("home", PHONE, { ua: IPHONE_UA + " Capacitor", init: () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" } } })
    expect(!(await inApp.$("[data-open-in-app]")), "not inside the app")
    await inApp.close()
  }

  /* ─── THE WISHLIST ─────────────────────────────────────────────────── */
  if (part("wishlist")) {
    for (const width of [360, 390, 430, 1280]) {
      console.log(`\nwishlist at ${width}`)
      const phone = width < 640
      const page = await open("wishlist", { width, height: phone ? 844 : 900, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 }, { path: "/library/wishlist" })
      await sleep(300)
      await page.screenshot({ path: join(shots, `wishlist-${width}.png`), fullPage: true })
      const m = await page.evaluate(() => {
        const items = [...document.querySelectorAll("[data-wishlist-item]")]
        const list = document.querySelector("[data-wishlist-list]")
        const byId = (id) => document.querySelector(`[data-wishlist-item="${id}"]`)
        const info = (id) => {
          const el = byId(id)
          return {
            price: el.querySelector("[data-wishlist-price]").innerText.replace(/\s+/g, " ").trim(),
            action: el.querySelector("[data-wishlist-action]")?.textContent.trim(),
            actionHref: el.querySelector("[data-wishlist-action]")?.getAttribute("href"),
            creator: el.querySelector("[data-wishlist-creator] > span:last-child")?.textContent.trim(),
            avatar: (() => { const a = el.querySelector("[data-wishlist-creator] > :first-child"); const r = a?.getBoundingClientRect(); return !!r && Math.round(r.width) === 18 && Math.round(r.height) === 18 && getComputedStyle(a).borderRadius !== "0px" })(),
          }
        }
        const hearts = items.map((el) => { const r = el.querySelector("[data-wishlist-remove]").getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] })
        const tops = [...new Set(items.map((el) => Math.round(el.getBoundingClientRect().top)))]
        const escaped = items.filter((el) => { const b = el.getBoundingClientRect(); return [...el.querySelectorAll("*")].some((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && (r.right > b.right + 0.5 || r.left < b.left - 0.5) }) }).length
        const overlap = items.filter((el) => {
          const h = el.querySelector("[data-wishlist-remove] span").getBoundingClientRect()
          const t = el.querySelector("[data-wishlist-price]").parentElement.querySelector("a, span").getBoundingClientRect()
          return !(h.right <= t.left || h.left >= t.right || h.bottom <= t.top || h.top >= t.bottom)
        }).length
        const cover = items[0].querySelector("img").getBoundingClientRect()
        return {
          count: items.length,
          columns: items.filter((el) => Math.round(el.getBoundingClientRect().top) === tops[0]).length,
          display: getComputedStyle(list).display,
          hearts,
          escaped,
          overlap,
          cover: [Math.round(cover.width), Math.round(cover.height)],
          heartBg: getComputedStyle(items[0].querySelector("[data-wishlist-remove] span")).backgroundColor,
          q1: info("q1"),
          q2: info("q2"),
          q3: info("q3"),
          q4: info("q4"),
          p2: info("p2"),
          titleLines: (() => { const a = byId("q1").querySelector("[data-wishlist-price]").previousElementSibling.previousElementSibling; return Math.round(a.getBoundingClientRect().height / parseFloat(getComputedStyle(a).lineHeight)) })(),
        }
      })
      const over = await overflowOf(page)
      expect(m.count === 5 && over <= 0 && m.escaped === 0, "five saved products, nothing wider than the screen or its card", { count: m.count, over, escaped: m.escaped })
      expect(phone ? m.columns === 1 && m.cover[0] === 76 : m.columns >= 3, phone ? "on a phone, rows with a 76px cover" : "on a computer, a grid of cards", { columns: m.columns, cover: m.cover })
      expect(m.hearts.every(([w, h]) => w >= 44 && h >= 44) && m.overlap === 0, "every heart is 44px to press and covers no title", { hearts: m.hearts[0], overlap: m.overlap })
      expect(phone ? m.heartBg === "rgba(0, 0, 0, 0)" : m.heartBg === "rgb(255, 255, 255)", phone ? "on a row the heart sits on the card" : "on a cover the heart sits in a white circle", m.heartBg)
      expect(/^\$29\.00 \$39\.00 26% off$/.test(m.q1.price) && m.q1.action === "Buy" && m.q1.actionHref === "/checkout?productId=q1", "on sale: the price, the old one struck, the saving; Buy goes to checkout", m.q1)
      expect(/^\$9\.00\/month$/.test(m.q2.price) && m.q2.action === "Join" && m.q2.actionHref === "/checkout?productId=q2&interval=month", "a membership says /month and Join", m.q2)
      expect(m.q3.price === "$5.00+" && m.q3.action === "View", "pay what you want: from its minimum, View to choose a price", m.q3)
      expect(m.q4.price === "Free" && m.q4.action === "Get it free", "free: Get it free", m.q4)
      expect(m.p2.action === "In your library" && m.p2.actionHref === "/library/products/p2", "already theirs: In your library", m.p2)
      expect(m.q1.creator === "Maya Chen" && m.q1.avatar, "the creator with their face", m.q1.creator)
      expect(page.errors.length === 0, "no page errors", page.errors)

      if (width === 390 || width === 1280) {
        /* Remove, then Undo. */
        state.wishlist.length = 0
        const cdp = await page.createCDPSession()
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
        const frames = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const out = []
              const t0 = performance.now()
              const second = () => document.querySelector('[data-wishlist-item="q2"]')
              document.querySelector('[data-wishlist-item="q1"] [data-wishlist-remove]').click()
              const step = () => {
                const t = performance.now()
                const q1 = document.querySelector('[data-wishlist-item="q1"]')
                const r2 = second().getBoundingClientRect()
                out.push({ t: Math.round(t - t0), q1: q1 ? parseFloat(getComputedStyle(q1).opacity) : null, q2Top: Math.round(r2.top * 10) / 10, q2Left: Math.round(r2.left * 10) / 10, bar: !!document.querySelector("[data-wishlist-undo]") })
                if (t - t0 > 800) return resolve(out)
                requestAnimationFrame(step)
              }
              requestAnimationFrame(step)
            }),
        )
        await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
        /* On a phone the next row moves up; in the grid the next card moves left into the first column. */
        const tops = frames.map((x) => (phone ? x.q2Top : x.q2Left))
        const moves = tops.filter((v, i) => i > 0 && Math.abs(v - tops[i - 1]) > 0.5).length
        console.log(`    remove: q1 opacity ${frames.slice(0, 8).map((x) => x.q1 === null ? "gone" : x.q1.toFixed(2)).join(" ")}; next card ${phone ? "top" : "left"} ${tops[0]} to ${tops.at(-1)} over ${moves} frames`)
        const ops = frames.map((x) => x.q1).filter((v) => v !== null)
        expect(ops.filter((v, i) => i > 0 && v > ops[i - 1] + 0.01).length === 0 && frames.at(-1).q1 === null, "the removed product fades out and is gone", ops.slice(0, 6))
        expect(tops.at(-1) < tops[0] - 20 && moves >= 3 && tops.filter((v, i) => i > 0 && v > tops[i - 1] + 0.5).length === 0, "the next one glides into its place, over several frames, only one way", { from: tops[0], to: tops.at(-1), moves })
        expect(frames.some((x) => x.bar), "a bar says it was removed, with Undo", frames.at(-1).bar)
        await sleep(200)
        await page.screenshot({ path: join(shots, `wishlist-removed-${width}.png`) })
        expect(state.wishlist.some(([m, id]) => m === "DELETE" && id === "q1"), "and the server is asked to remove it", state.wishlist)
        await page.click("[data-wishlist-undo-button]")
        await sleep(500)
        const back = await page.evaluate(() => [...document.querySelectorAll("[data-wishlist-item]")].map((el) => el.getAttribute("data-wishlist-item")))
        expect(back[0] === "q1" && back.length === 5, "Undo puts it back where it was", back)
        expect(state.wishlist.some(([m, id]) => m === "POST" && id === "q1"), "and saves it again", state.wishlist)
        const count = await page.evaluate(() => window.__wishCount)
        expect(count === 5, "the header's count is told each time", count)
        await page.close()
      } else await page.close()
    }
    const empty = await open("wishlist-empty", PHONE, { path: "/library/wishlist" })
    await sleep(200)
    const e = await empty.evaluate(() => ({ shown: !!document.querySelector("[data-wishlist-empty]"), text: document.querySelector("[data-wishlist-empty]")?.innerText, href: document.querySelector("[data-wishlist-empty] a")?.getAttribute("href") }))
    expect(e.shown && /Nothing saved yet/.test(e.text || "") && e.href === "/explore", "empty: says what it is for and where to find things", e)
    await empty.screenshot({ path: join(shots, "wishlist-empty-390.png") })
    await empty.close()
  }

  /* ─── BROWSER DOWNLOAD ─────────────────────────────────────────────
     A real attachment from another origin. The page must keep its address,
     no tab or window may be created (no about:blank), and Chromium must
     begin a download of the file. The address takes 600ms to sign, and the
     button says Preparing for that time. */
  for (const [label, vp] of part("download") ? [["1280", DESK], ["390", PHONE]] : []) {
    console.log(`\nbrowser download at ${label}`)
    const page = await open("home", vp)
    const dir = mkdtempSync(join(tmpdir(), "storelib-dl-"))
    const cdp = await browser.target().createCDPSession()
    const begun = []
    cdp.on("Browser.downloadWillBegin", (e) => begun.push(e.suggestedFilename))
    await cdp.send("Browser.setDownloadBehavior", { behavior: "allowAndName", downloadPath: dir, eventsEnabled: true })
    const created = []
    const onTarget = (t) => created.push(t.url())
    browser.on("targetcreated", onTarget)
    const before = (await browser.pages()).length
    const startUrl = page.url()
    state.api.length = 0
    state.apiDelay = 600
    await page.click('[data-library-item="p2"] [data-row-download]')
    await sleep(250)
    const waiting = await page.evaluate(() => document.querySelector('[data-library-item="p2"] [data-row-download]')?.textContent)
    await page.screenshot({ path: join(shots, `download-preparing-${label}.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(900, vp.height) } })
    await sleep(2200)
    state.apiDelay = 0
    browser.off("targetcreated", onTarget)
    const after = (await browser.pages()).length
    expect(state.api.join() === "b1", "Download asks /api/download once for that file", state.api)
    expect(/Preparing/.test(waiting || ""), "the button says Preparing while the address is signed", waiting)
    expect(begun.includes("b1.pdf"), "Chromium starts a download of the attachment", begun)
    expect(after === before && created.length === 0, "no tab, no window, no about:blank", { before, after, created })
    expect(page.url() === startUrl, "and the library's address never changes", page.url())
    const frames = await page.evaluate(() => document.querySelectorAll("[data-download-frame]").length)
    expect(frames === 1, "the file came through one hidden frame on this page", frames)
    await cdp.send("Browser.setDownloadBehavior", { behavior: "default" })
    await cdp.detach()
    rmSync(dir, { recursive: true, force: true })
    await page.close()
  }

  /* ─── IPHONE APP, no native downloader ───────────────────────────── */
  if (part("app")) {
  console.log("\niPhone app, an install without the native downloader")
    const page = await open("home", PHONE, {
      ua: IPHONE_UA + " Capacitor",
      init: () => {
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" }
        window.__shared = []
        Object.defineProperty(navigator, "canShare", { value: (d) => Array.isArray(d?.files), configurable: true })
        Object.defineProperty(navigator, "share", { value: async (d) => { window.__shared.push(d.files.map((f) => [f.name, f.size, f.type])) }, configurable: true })
      },
    })
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    state.storage = 0
    await page.click('[data-library-item="p2"] [data-row-download]')
    /* The bar, every frame, while the bytes arrive. */
    const frames = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const out = []
          const t0 = performance.now()
          let last = t0
          const step = () => {
            const now = performance.now()
            const bar = document.querySelector("[data-tray-bar]")
            const job = document.querySelector("[data-download-job]")?.getAttribute("data-download-job")
            out.push({ t: Math.round(now - t0), gap: Math.round(now - last), scale: bar ? parseFloat(getComputedStyle(bar).scale.split(" ")[0]) : null, raw: bar ? getComputedStyle(bar).scale + "|" + bar.style.scale : null, job, button: document.querySelector('[data-library-item="p2"] [data-row-download]')?.textContent })
            last = now
            if (job === "ready" || now - t0 > 12000) return resolve(out)
            requestAnimationFrame(step)
          }
          requestAnimationFrame(step)
        }),
    )
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const scales = frames.map((f) => f.scale).filter((s) => typeof s === "number" && !Number.isNaN(s))
    const shrinks = scales.filter((s, i) => i > 0 && s < scales[i - 1] - 0.001).length
    const targets = frames.map((f) => parseFloat((f.raw || "").split("|")[1])).filter((n) => !Number.isNaN(n))
    const counted = [...new Set(frames.map((f) => f.button).filter((b) => /%$/.test(b || "")))]
    const gaps = frames.map((f) => f.gap).sort((a, b) => a - b)
    console.log(`    ${frames.length} frames over ${frames.at(-1)?.t}ms at 4x throttle; bar ${scales[0]?.toFixed(2)} to ${scales.at(-1)?.toFixed(2)}; median frame ${gaps[Math.floor(gaps.length / 2)]}ms, worst ${gaps.at(-1)}ms`)
    if (process.env.DEBUG_FRAMES) console.log(frames.map((f) => `${f.t} ${f.job} ${f.raw} ${f.button}`).join("\n"))
    expect(frames.at(-1)?.job === "ready", "the file is read into the page with the tray showing it", frames.at(-1)?.job)
    expect(scales.length > 10 && shrinks === 0 && scales[0] < 0.1 && targets.at(-1) >= 0.95, "the bar only grows, frame by frame, from empty to full", { n: scales.length, shrinks, first: scales[0], lastTarget: targets.at(-1) })
    expect(counted.length >= 3, "and the row's button counts up", counted.slice(0, 6))
    await page.screenshot({ path: join(shots, "iphone-app-ready-390.png") })
    await page.click("[data-tray-save]")
    await sleep(300)
    const shared = await page.evaluate(() => window.__shared)
    expect(shared.length === 1 && shared[0][0][0] === "b1.pdf" && shared[0][0][1] === 3_000_000 && shared[0][0][2] === "application/pdf", "Save to Files hands the whole file to the share sheet", shared)
    const after = await page.evaluate(() => ({ job: document.querySelector("[data-download-job]")?.getAttribute("data-download-job"), status: document.querySelector("[data-tray-status]")?.textContent }))
    expect(after.job === "saved" && after.status === "Saved", "and the tray says Saved", after)

    /* The tray sits over the bottom of the list: the row is brought above it first, as a thumb would scroll it. */
    await page.evaluate(() => {
      document.querySelector("[data-download-tray] [aria-label='Close']")?.click()
      document.querySelector('[data-library-item="p3"]').scrollIntoView({ block: "start" })
    })
    await sleep(100)
    state.storage = 0
    await page.click('[data-library-item="p3"] [data-row-download]')
    await sleep(900)
    const big = await page.evaluate(() => ({ job: [...document.querySelectorAll("[data-download-job]")].map((j) => j.getAttribute("data-download-job")), text: document.querySelector("[data-download-tray]")?.innerText }))
    expect(state.storage === 0, "a 600 MB file is never read by the page", state.storage)
    expect(big.job.includes("handoff") && /Safari/.test(big.text || ""), "it goes to Safari, and the tray says where it lands", big)
    await page.screenshot({ path: join(shots, "iphone-app-big-390.png") })
    expect(page.errors.length === 0, "no page errors", page.errors)
    await page.close()
  }

  /* ─── ANDROID APP, with the native downloader ────────────────────── */
  if (part("app")) {
  console.log("\nAndroid app, with the native downloader")
    const page = await open("home", PHONE, {
      ua: "Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36 Capacitor",
      init: () => {
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "android" }
        window.__dm = { calls: [], t: 0 }
        window.StorelibNative = {
          download: (url, name, type) => {
            window.__dm.calls.push([url, name, type])
            window.__dm.t = performance.now()
            return "77"
          },
          downloadStatus: () => {
            const p = Math.min(1, (performance.now() - window.__dm.t) / 1500)
            return JSON.stringify({ state: p >= 1 ? "done" : "running", loaded: Math.round(p * 5_400_000), total: 5_400_000 })
          },
          openDownload: (id) => {
            window.__dm.opened = id
            return true
          },
        }
      },
    })
    await page.click('[data-library-item="p2"] [data-row-download]')
    await sleep(700)
    await page.screenshot({ path: join(shots, "android-app-running-390.png") })
    const mid = await page.evaluate(() => ({ job: document.querySelector("[data-download-job]")?.getAttribute("data-download-job"), status: document.querySelector("[data-tray-status]")?.textContent }))
    await sleep(1800)
    const done = await page.evaluate(() => ({ calls: window.__dm.calls, job: document.querySelector("[data-download-job]")?.getAttribute("data-download-job"), status: document.querySelector("[data-tray-status]")?.textContent, open: !!document.querySelector("[data-tray-open]") }))
    expect(done.calls.length === 1 && /\/b1$/.test(done.calls[0][0]) && done.calls[0][1] === "b1.pdf" && done.calls[0][2] === "application/pdf", "DownloadManager gets the signed address, the name and the type", done.calls)
    expect(mid.job === "downloading" && / of 5\.1 MB$/.test(mid.status || ""), "the tray follows its progress", mid)
    expect(done.job === "saved" && done.status === "Saved to Downloads" && done.open, "then says Saved to Downloads, with Open", done)
    await page.screenshot({ path: join(shots, "android-app-saved-390.png") })
    await page.click("[data-tray-open]")
    expect((await page.evaluate(() => window.__dm.opened)) === "77", "Open opens that download")
    expect(page.errors.length === 0, "no page errors", page.errors)
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
  fileServer.close()
  if (!process.env.KEEP_STUBS) rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nshots in ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall good")
process.exit(broken ? 1 : 0)
