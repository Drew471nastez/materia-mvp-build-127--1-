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
 *   OPEN APP   on an iPhone's browser a line with Open, whose link is the
 *              app's scheme carrying this page; not on a computer, not
 *              inside the app, and not again once closed.
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

/* ONLY=nav|reviews|creator|download|app runs one part, for working on it. */
const ONLY = process.env.ONLY || ""
const part = (name) => !ONLY || ONLY === name
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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
const state = { api: [], storage: 0, reviews: [], apiDelay: 0, fileHits: 0 }
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
  await page.evaluateOnNewDocument(
    (m, p, initSrc, focus) => {
      window.__mode = m
      window.__path = p
      if (focus) window.__focus = focus
      if (initSrc) (0, eval)(initSrc)
    },
    mode,
    path,
    init ? `(${init.toString()})()` : "",
    focusId || "",
  )
  await page.goto(`${origin}/library-probe`, { waitUntil: "networkidle0" })
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

  /* ─── TAB SWITCHING, frame by frame at 4x CPU throttle ───────────────
     Warm (the router already has the page) and cold (the route's skeleton
     first, the page 500ms later). Every animation frame after the press:
     each pill's fill opacity, the panel's opacity, whether the panel holds
     anything, and where the pill row sits. */
  const sampleSwitch = (page, to) =>
    page.evaluate(
      (to) =>
        new Promise((resolve) => {
          const out = []
          const t0 = performance.now()
          const fill = (href) => parseFloat(getComputedStyle(document.querySelector(`[data-library-tab-href="${href}"] [data-library-tab-fill]`)).opacity)
          const panel = document.querySelector("[data-library-panel]")
          const row = document.querySelector("[data-library-tabs]")
          const from = document.querySelector('[data-library-tab][data-active="true"]').getAttribute("data-library-tab-href")
          const step = () => {
            const now = performance.now()
            const content = panel.firstElementChild
            out.push({
              t: Math.round(now - t0),
              to: fill(to),
              from: fill(from),
              active: document.querySelector('[data-library-tab][data-active="true"]')?.getAttribute("data-library-tab-href"),
              panel: parseFloat(getComputedStyle(panel).opacity),
              filled: !!content && content.getBoundingClientRect().height > 80 && getComputedStyle(content).opacity !== "0",
              skeleton: !!panel.querySelector("[data-library-skeleton]"),
              skeletonOpacity: panel.querySelector("[data-library-skeleton]") ? parseFloat(getComputedStyle(panel.querySelector("[data-library-skeleton]")).opacity) : null,
              rowTop: Math.round(row.getBoundingClientRect().top * 10) / 10,
              scrollY: window.scrollY,
            })
            if (now - t0 > 1200) return resolve(out)
            requestAnimationFrame(step)
          }
          document.querySelector(`[data-library-tab-href="${to}"]`).click()
          step()
        }),
      to,
    )

  for (const [label, vp] of part("nav") ? [["390", PHONE], ["1280", DESK]] : []) {
    for (const cold of [false, true]) {
      console.log(`\ntab switch at ${label}, ${cold ? "cold (skeleton first)" : "warm"}, 4x CPU`)
      const page = await open("nav", vp, { init: cold ? () => { window.__cold = true } : undefined })
      await sleep(2600)
      const prefetched = await page.evaluate(() => (window.__prefetch || []).filter(([, k]) => k === "full").map(([h]) => h))
      if (!cold) expect(["/library/courses", "/library/memberships", "/library/reviews", "/library/receipts", "/library/wishlist"].every((h) => prefetched.includes(h)), "every other tab is fetched whole while the page is idle", [...new Set(prefetched)])
      await page.evaluate(() => window.scrollTo(0, 60))
      const cdp = await page.createCDPSession()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      const f = await sampleSwitch(page, "/library/reviews")
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      const gaps = f.slice(1).map((x, i) => x.t - f[i].t).sort((a, b) => a - b)
      console.log(`    ${f.length} frames over ${f.at(-1).t}ms; median frame ${gaps[Math.floor(gaps.length / 2)]}ms, worst ${gaps.at(-1)}ms`)
      console.log(`    new pill fill: ${f.slice(0, 12).map((x) => x.to.toFixed(2)).join(" ")}`)
      console.log(`    panel opacity: ${f.slice(0, 12).map((x) => x.panel.toFixed(2)).join(" ")}`)
      if (process.env.DEBUG_FRAMES) console.log(f.map((x) => JSON.stringify(x)).join("\n"))
      /* f[0] is read in the same task as the click, before React has committed anything; f[1] is the first frame painted after the press. */
      expect(f[1].active === "/library/reviews", "the pressed pill is chosen in the first frame after the press, ahead of the route", { t: f[1].t, active: f[1].active })
      const fills = f.map((x) => x.to)
      const drops = fills.filter((v, i) => i > 0 && v < fills[i - 1] - 0.001).length
      const full = f.find((x) => x.to >= 0.999)
      /* Timed from the frame the pill was chosen in. Samples are only as dense as the frames a throttled main thread gets, so a sample's own gap is allowed on top. */
      const startAt = f[1].t
      const gapAtFull = full ? full.t - f[f.indexOf(full) - 1].t : 0
      expect(drops === 0 && full && full.t - startAt <= 150 + gapAtFull + 20 && fills[0] < 1, "its fill only grows, 0 to 1 in settings' 150ms from the press's frame", { first: fills[0], chosenAt: startAt, fullAt: full?.t, sampleGap: gapAtFull, drops })
      const outs = f.map((x) => x.from)
      expect(outs.at(-1) === 0 && outs.filter((v, i) => i > 0 && v > outs[i - 1] + 0.001).length === 0, "the old pill's fill only fades out", outs.slice(0, 6))
      expect(f.every((x) => x.filled), "no frame without a screen under the pills (no blank frame)", f.filter((x) => !x.filled).map((x) => x.t))
      expect(f.every((x) => x.panel >= 0.19), "the panel never goes below settings' 0.2", Math.min(...f.map((x) => x.panel)))
      expect(f.at(-1).panel === 1, "and ends fully there", f.at(-1).panel)
      const tops = [...new Set(f.map((x) => x.rowTop))]
      expect(tops.length === 1, "the pill row never moves (no jump, no layout shift above the screen)", tops)
      expect(new Set(f.map((x) => x.scrollY)).size === 1, "and the scroll stays where the finger left it", [...new Set(f.map((x) => x.scrollY))])
      if (cold) {
        const sk = f.filter((x) => x.skeleton)
        const firstSk = f.findIndex((x) => x.skeleton)
        expect(sk.length > 0 && sk.every((x) => x.skeletonOpacity === 1) && firstSk > -1 && f.slice(0, firstSk).every((x) => x.filled), "cold: the old screen goes straight to the route's skeleton at full strength, never a 200ms blank", { firstAt: sk[0]?.t, opacity: sk[0]?.skeletonOpacity })
        expect(!f.at(-1).skeleton, "and gives way to the screen", f.at(-1).skeleton)
      } else {
        expect(f.every((x) => !x.skeleton), "warm: straight to the screen, no skeleton", f.filter((x) => x.skeleton).length)
      }
      await page.screenshot({ path: join(shots, `nav-${cold ? "cold" : "warm"}-${label}.png`), fullPage: true })
      expect(page.errors.length === 0, "no page errors", page.errors)
      await page.close()
    }
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

  /* ─── OPEN IN APP ─────────────────────────────────────────────────── */
  if (part("layout")) {
  console.log("\nopen in app")
    const page = await open("home", PHONE, { ua: IPHONE_UA })
    const q = await page.evaluate(() => {
      const el = document.querySelector("[data-open-in-app]")
      const panel = document.querySelector("[data-library-panel]")
      return {
        link: el?.querySelector("a")?.getAttribute("href"),
        h: el ? Math.round(el.getBoundingClientRect().height) : 0,
        below: el && panel ? el.getBoundingClientRect().top >= panel.getBoundingClientRect().bottom : false,
        aboveList: !!document.querySelector("[data-library-header] [data-open-in-app]"),
      }
    })
    expect(q.link === "com.storelib.app://open?path=%2Flibrary", "an iPhone's browser still gets Open, into this page in the app", q.link)
    expect(q.h > 0 && q.h <= 40 && q.below && !q.aboveList, "as one quiet line under everything, never a card at the top", q)
    await page.evaluate(() => document.querySelector("[data-open-in-app]").scrollIntoView({ block: "center" }))
    await page.screenshot({ path: join(shots, "open-in-app-390.png") })
    await page.evaluate(() => document.querySelector('[data-open-in-app] button[aria-label="Hide for now"]').click())
    await page.reload({ waitUntil: "networkidle0" })
    expect(!(await page.$("[data-open-in-app]")), "and not again once closed")
    await page.close()
    const desk = await open("home", DESK)
    expect(!(await desk.$("[data-open-in-app]")), "not on a computer")
    await desk.close()
    const inApp = await open("home", PHONE, { ua: IPHONE_UA + " Capacitor", init: () => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios" } } })
    expect(!(await inApp.$("[data-open-in-app]")), "not inside the app")
    await inApp.close()
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
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nshots in ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall good")
process.exit(broken ? 1 : 0)
