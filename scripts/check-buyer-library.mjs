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
 *   BROWSER    Download asks /api/download once, the file goes to a tab of
 *              its own and the library's address never changes.
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

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back: () => log("back"), refresh() {} }
export const usePathname = () => window.__path || "/library"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
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
const state = { api: [], storage: 0 }
const SIZES = { a1: 48_300_000, b1: 3_000_000, c1: 612_000_000, e1: 31_000_000, a2: 12_900_000, a3: 820_000 }
const fileServer = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  const id = url.pathname.split("/").pop()
  /* Only the page's own reads count: a navigation is the system browser standing in. */
  if (req.headers["sec-fetch-mode"] !== "navigate") state.storage++
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
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    return res.end(JSON.stringify({ success: true, downloadUrl: `${storageOrigin}/storage/v1/object/sign/digital-products/${id}`, fileName: `${id}.pdf`, fileSize: SIZES[id] ?? null, mimeType: "application/pdf" }))
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

async function open(mode, vp, { path = "/library", ua, init } = {}) {
  const page = await browser.newPage()
  await page.setViewport(vp)
  if (ua) await page.setUserAgent(ua)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await page.evaluateOnNewDocument(
    (m, p, initSrc) => {
      window.__mode = m
      window.__path = p
      if (initSrc) (0, eval)(initSrc)
    },
    mode,
    path,
    init ? `(${init.toString()})()` : "",
  )
  await page.goto(`${origin}/library-probe`, { waitUntil: "networkidle0" })
  await page.evaluate(() => document.fonts.ready)
  page.errors = errors
  return page
}

const overflowOf = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

try {
  /* ─── LAYOUT ───────────────────────────────────────────────────────── */
  for (const [label, vp] of [["390", PHONE], ["1280", DESK]]) {
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
        stars: document.querySelectorAll('[data-review-state="open"]').length,
        reviewed: document.querySelectorAll('[data-review-state="reviewed"]').length,
        refunded: [...document.querySelectorAll("[data-library-item]")].filter((r) => /Refunded/.test(r.textContent)).length,
      }
    })
    expect(m.h1 === "Library", "the heading is Library", m.h1)
    expect(m.tabs.map((t) => t[0]).join() === "Products,Courses,Memberships,Reviews,Receipts,Wishlist" && m.tabs[0][1] === "page", "six tabs, Products current", m.tabs)
    expect(m.rows === 5, "one row per purchase", m.rows)
    const over = await overflowOf(page)
    expect(over <= 0, "nothing wider than the screen", over)
    expect(m.minControl >= 36, "every control at least 36px tall", m.minControl)
    expect(m.escaped === 0, "every row's actions stay inside the row", m.escaped)
    expect(label === "390" ? m.chips && !m.aside : !m.chips && m.aside, label === "390" ? "sellers are chips, no column" : "sellers are a column, no chips", { chips: m.chips, aside: m.aside })
    expect(m.stars === 3 && m.reviewed === 1 && m.refunded === 1, "Rate it on three, Your review on one, Refunded on one", m)
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

  for (const [mode, label, vp] of [["reviews", "390", PHONE], ["reviews", "1280", DESK], ["receipts", "390", PHONE], ["receipts", "1280", DESK], ["product", "390", PHONE], ["product", "1280", DESK], ["empty", "390", PHONE], ["empty", "1280", DESK]]) {
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
      review: !!document.getElementById("review"),
      contact: document.querySelector("[data-product-creator] [data-creator-contact]")?.getAttribute("href"),
      empty: !!document.querySelector("[data-library-empty]"),
      text: document.body.innerText,
    }))
    if (mode === "reviews") expect(m.waiting === 3 && m.done === 1, "three to review, one reviewed, the refund in neither", { waiting: m.waiting, done: m.done })
    if (mode === "receipts") expect(m.receipts === 5 && m.invoices === 3 && /Refunded/.test(m.text) && /Free/.test(m.text), "five receipts, invoices for the three paid ones that stand, a refund and a free one said so", { r: m.receipts, i: m.invoices })
    if (mode === "product") {
      expect(m.tabs === 0, "a product has its back link, not the tabs", m.tabs)
      expect(m.files === 3 && /Added after you bought it/.test(m.text), "every file with its size, and the one added later marked", m.files)
      expect(m.review, "the review card is on the page")
      expect(/^mailto:hello@mayachen\.co/.test(m.contact || ""), "and the creator block writes to the seller", m.contact)
    }
    if (mode === "empty") expect(m.empty && /Your wishlist \(3\)/.test(m.text), "an empty library says what it is for and points at the wishlist", m.empty)
    expect(page.errors.length === 0, "no page errors", page.errors)
    await page.close()
  }

  /* ─── OPEN IN APP ─────────────────────────────────────────────────── */
  console.log("\nopen in app")
  {
    const page = await open("home", PHONE, { ua: IPHONE_UA })
    const link = await page.evaluate(() => document.querySelector("[data-open-in-app] a")?.getAttribute("href"))
    expect(link === "com.storelib.app://open?path=%2Flibrary", "an iPhone's browser gets Open, into this page in the app", link)
    await page.screenshot({ path: join(shots, "open-in-app-390.png"), clip: { x: 0, y: 0, width: 390, height: 330 } })
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

  /* ─── BROWSER DOWNLOAD ───────────────────────────────────────────── */
  console.log("\nbrowser download at 1280")
  {
    const page = await open("home", DESK)
    const before = (await browser.pages()).length
    state.api.length = 0
    await page.click('[data-library-item="p2"] [data-row-download]')
    await sleep(1200)
    const after = (await browser.pages()).length
    expect(state.api.join() === "b1", "Download asks /api/download once for that file", state.api)
    expect(after === before + 1, "the file goes to a tab of its own", { before, after })
    expect(new URL(page.url()).pathname === "/library-probe", "and the library stays where it is", page.url())
    for (const p of await browser.pages()) if (p !== page) await p.close().catch(() => {})
    await page.close()
  }

  /* ─── IPHONE APP, no native downloader ───────────────────────────── */
  console.log("\niPhone app, an install without the native downloader")
  {
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
  console.log("\nAndroid app, with the native downloader")
  {
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
