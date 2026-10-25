/**
 * The font half of scripts/check-themeset-r13.mjs: the ten new families,
 * looked at in the pickers, the canvases and the live pages, on a computer
 * (1440x900) and a phone (390x844, CPU slowed 4x for the pickers).
 *
 *   PICKERS   the website builder's Typography font picker (Theme settings)
 *             in the real editor (scripts/editor-probe-harness.mjs), and the
 *             OnePage Design tab's (scripts/onepage-probe-server.mjs): how
 *             long the list takes to show, the longest frame while it
 *             scrolls top to bottom, how many faces it fetched when it first
 *             opened (rows out of view must not ask for theirs), and every
 *             new family's row drawn in its own face
 *   CANVAS    each new family picked in the website builder's picker, the
 *             canvas's heading read; the OnePage editor's preview frame
 *             drawn with it
 *   LIVE      a website's front page as the published page draws it
 *             (ThemePage, scripts/render-themeset-r13.tsx) and a OnePage as
 *             the live route draws it (PublicOnePage)
 *
 * "The right family is used" is read three ways: the element's computed
 * font-family names it first, document.fonts holds a loaded face of it, and
 * the font the browser actually drew the text with (the devtools protocol's
 * CSS.getPlatformFontsForNode) is that web font, not a fallback.
 *
 * Google Fonts is answered from a local copy fetched once with curl
 * (scripts/hero-fonts.mjs): the headless browser here cannot reach it.
 *   FONTS_ONLY=live|wb|onepage   one part
 */
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { fontCache } from "./hero-fonts.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const NEW_FONTS = ["Fraunces", "Newsreader", "Bodoni Moda", "Bricolage Grotesque", "Geist", "Manrope", "Figtree", "Fredoka", "Geist Mono", "Big Shoulders"]
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 }
const PNG = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000" + "1f15c4890000000d49444154789c636060606000000005000146a53e1a0000000049454e44ae426082", "hex")

/** Google Fonts from the local copy; the page's own server as it is; anything else empty. */
async function routed(page, base, cache, cpu = 1) {
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = r.url()
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) {
      const a = cache.answer(u)
      return a ? r.respond({ status: a.status, contentType: a.contentType, body: a.body, headers: a.headers }) : r.respond({ status: 400, body: "" })
    }
    if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")) return r.continue()
    if (/\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(u)) return r.respond({ status: 200, contentType: "image/png", body: PNG })
    return r.respond({ status: 200, contentType: "text/plain", body: "" })
  })
  if (cpu > 1) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: cpu })
}

/** What `selector`'s first visible element is drawn in (in `frame`, the page's own by default): computed, loaded, and the font actually used. */
async function faceOf(page, selector, family, frame = page) {
  const info = await frame.evaluate(async (selector, family) => {
    await document.fonts.ready
    const el = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length && e.textContent.trim())
    if (!el) return null
    el.setAttribute("data-probe-face", "")
    const first = getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "")
    const loaded = [...document.fonts].some((f) => f.family.replace(/^["']|["']$/g, "") === family && f.status === "loaded")
    return { first, loaded, text: el.textContent.trim().slice(0, 40) }
  }, selector, family)
  if (!info) return null
  const cdp = await page.createCDPSession()
  let used = []
  try {
    await cdp.send("DOM.enable")
    await cdp.send("CSS.enable")
    /* Into frames too (the OnePage preview is one): the marked node, wherever it is. */
    const doc = await cdp.send("DOM.getDocument", { depth: -1, pierce: true })
    const find = (n) => {
      if (!n) return null
      const a = n.attributes ?? []
      for (let i = 0; i < a.length; i += 2) if (a[i] === "data-probe-face") return n.nodeId
      for (const c of [...(n.children ?? []), ...(n.contentDocument ? [n.contentDocument] : []), ...(n.shadowRoots ?? [])]) { const x = find(c); if (x) return x }
      return null
    }
    const r = await cdp.send("CSS.getPlatformFontsForNode", { nodeId: find(doc.root) })
    used = r.fonts.map((f) => ({ name: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount }))
  } catch (e) {
    used = [{ name: `(${String(e).slice(0, 60)})`, custom: false }]
  } finally {
    await frame.evaluate(() => document.querySelector("[data-probe-face]")?.removeAttribute("data-probe-face")).catch(() => {})
    await cdp.detach().catch(() => {})
  }
  /* The file's own name for itself can carry more ("Fraunces 72pt"): a web font whose name starts with the family's first word. */
  const word = family.split(" ")[0].toLowerCase()
  const ok = info.first === family && info.loaded && used.length > 0 && used.every((u) => u.custom && u.name.toLowerCase().startsWith(word))
  return { ...info, used, ok }
}

/** A list scrolled from its top to its bottom in `ms`, a step every frame; the frames' lengths. */
const scrollList = (page, selector, ms = 1200) => page.evaluate((selector, ms) => new Promise((done) => {
  const box = [...document.querySelectorAll(selector)].find((e) => e.getClientRects().length)
  if (!box) return done(null)
  box.scrollTop = 0
  const gaps = []
  const t0 = performance.now()
  let last = t0
  const end = box.scrollHeight - box.clientHeight
  const step = (t) => {
    gaps.push(t - last)
    last = t
    const k = Math.min(1, (t - t0) / ms)
    box.scrollTop = end * k
    if (k < 1) requestAnimationFrame(step)
    else done({ gaps: gaps.slice(1), height: box.scrollHeight })
  }
  requestAnimationFrame(step)
}), selector, ms)

/** How many of `families`' faces the page has asked for (loading or loaded). */
const facesAsked = (page, families) => page.evaluate((families) => {
  const asked = new Set()
  for (const f of document.fonts) { const name = f.family.replace(/^["']|["']$/g, ""); if (families.includes(name) && f.status !== "unloaded") asked.add(name) }
  return asked.size
}, families)

/*
  scripts/render-themeset-r13.tsx bundled for the browser, as scripts/hero-shots.mjs bundles its
  pages: the theme engine compiles sections with node:crypto and Buffer, which get small stand-ins.
*/
async function servePages() {
  const { execFileSync } = await import("node:child_process")
  const { createServer } = await import("node:http")
  const { readFileSync, rmSync, writeFileSync } = await import("node:fs")
  const { appCss, interFaces } = await import("./probe-css.mjs")
  const dir = join(root, `.themeset-probe-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
  writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
  writeFileSync(join(dir, "supabase.js"), `const result = { data: [], error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }), removeChannel() {} } }
`)
  writeFileSync(join(dir, "crypto.js"), `export function createHash() { let a = ""; return { update(s) { a += String(s); return this }, digest() { let h = 0x811c9dc5; for (let i = 0; i < a.length; i++) { h ^= a.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, "0").repeat(4) } } }
export function randomUUID() { return crypto.randomUUID() }
export default { createHash, randomUUID }
`)
  writeFileSync(join(dir, "buffer.js"), `const enc = new TextEncoder(), dec = new TextDecoder()
class Buf {
  constructor(bytes) { this.bytes = bytes }
  static from(x) { if (x instanceof Uint8Array) return new Buf(x); if (typeof x === "string") return new Buf(enc.encode(x)); return new Buf(new Uint8Array(x)) }
  static isBuffer(x) { return x instanceof Buf }
  static byteLength(s) { return enc.encode(String(s)).length }
  toString() { return dec.decode(this.bytes) }
  get length() { return this.bytes.length }
}
globalThis.Buffer = Buf
`)
  writeFileSync(join(dir, "empty.js"), `export const readFileSync = () => "", existsSync = () => false, readdirSync = () => []
export const join = (...p) => p.join("/"), resolve = (...p) => p.join("/"), dirname = (p) => p.split("/").slice(0, -1).join("/"), basename = (p) => p.split("/").pop(), extname = (p) => { const i = p.lastIndexOf("."); return i < 0 ? "" : p.slice(i) }
export default {}
`)
  let bundle
  try {
    execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-themeset-r13.tsx"),
      `--alias:node:crypto=${join(dir, "crypto.js")}`, `--alias:crypto=${join(dir, "crypto.js")}`,
      `--alias:node:fs=${join(dir, "empty.js")}`, `--alias:fs=${join(dir, "empty.js")}`, `--alias:node:path=${join(dir, "empty.js")}`, `--alias:path=${join(dir, "empty.js")}`,
      `--alias:server-only=${join(dir, "empty.js")}`,
      "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "pages.js")}`,
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
      '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"', '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', `--inject:${join(dir, "buffer.js")}`,
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
      `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
      `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
      { stdio: ["ignore", "ignore", "inherit"] })
    bundle = readFileSync(join(dir, "pages.js"), "utf8")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const css = await appCss(root)
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script>${bundle}</script></body></html>`
  const server = createServer((req, res) => {
    if (req.url === "/" || req.url.startsWith("/?") || req.url.startsWith("/onepage-preview")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
    res.writeHead(200, { "content-type": "application/json" })
    res.end("{}")
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { base: `http://127.0.0.1:${server.address().port}`, server }
}

export async function fontsPart(out) {
  const results = []
  const say = (ok, line) => { results.push({ ok, line }); if (process.env.DEBUG) console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`) }
  const shots = join(out, "fonts")
  mkdirSync(shots, { recursive: true })
  const cache = fontCache(process.env.FONT_CACHE ?? join(root, "node_modules/.cache/themeset-r13-fonts"))
  const only = process.env.FONTS_ONLY ?? ""
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] })
  try {
    /* ── LIVE: a website and a OnePage as their live routes draw them; the OnePage editor's preview ── */
    if (!only || only === "live") {
      console.log("\nFONTS: the live pages and the OnePage preview, each new family")
      const pages = await servePages()
      try {
        for (const [vpName, vp] of [["1440", DESKTOP], ["390", PHONE]]) {
          for (const [view, selector, what] of [["site", "#section-hero h1, #section-hero h2", "website, live"], ["onepage", "h1", "OnePage, live"], ["preview", "h1", "OnePage, editor preview"]]) {
            if (view === "preview" && vpName === "1440") continue
            const bad = []
            for (const family of NEW_FONTS) {
              const p = await browser.newPage()
              await p.setViewport(vp)
              await routed(p, pages.base, cache)
              await p.goto(`${pages.base}/?view=${view}&font=${encodeURIComponent(family)}`, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {})
              await sleep(500)
              /* The preview draws the page in its own frame (components/onepage/live-preview.tsx LivePreviewFrame). */
              let frame = p
              if (view === "preview") {
                for (let i = 0; i < 40; i++) {
                  frame = p.frames().find((fr) => fr !== p.mainFrame() && /onepage-preview/.test(fr.url())) ?? null
                  if (frame && (await frame.evaluate(() => !!document.querySelector("h1")).catch(() => false))) break
                  await sleep(250)
                }
                await sleep(600)
              }
              const f = frame ? await faceOf(p, selector, family, frame) : null
              if (!f || !f.ok) bad.push({ family, ...(f ?? { missing: selector }) })
              await p.screenshot({ path: join(shots, `${view}-${vpName}-${family.replace(/\s+/g, "-").toLowerCase()}.png`), clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 640) } })
              await p.close()
            }
            say(bad.length === 0, `${what} at ${vpName}: every new family drawn in itself (computed, loaded, used)${bad.length ? `   ${JSON.stringify(bad).slice(0, 400)}` : ""}`)
          }
        }
      } finally {
        pages.server.close()
      }
    }

    /* ── PICKER + CANVAS: the website builder's Typography ── */
    if (!only || only === "wb") {
      console.log("\nFONTS: the website builder's Typography picker and its canvas")
      const { bundle, css } = await import("./editor-probe-harness.mjs")
      const { createServer } = await import("node:http")
      const { readFileSync } = await import("node:fs")
      const globals = `window.PROBE_PAGES={home:["header","hero_centered","features_grid","text_rich","faq_accordion","cta_simple","footer"]};window.PROBE_PAGE_DELAY_MS=0;window.PROBE_HEADER={links:3};`
      const server = createServer((req, res) => {
        if (req.url.startsWith("/editor-probe.js")) { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end(readFileSync(bundle)) }
        if (req.url === "/" || req.url.startsWith("/?")) {
          res.writeHead(200, { "Content-Type": "text/html" })
          return res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;${globals}</script><script src="/editor-probe.js"></script></body></html>`)
        }
        res.writeHead(404)
        res.end()
      })
      await new Promise((ok) => server.listen(0, "127.0.0.1", ok))
      const base = `http://127.0.0.1:${server.address().port}`
      try {
        for (const [vpName, vp, cpu] of [["1440", DESKTOP, 1], ["390", PHONE, 4]]) {
          const p = await browser.newPage()
          const errors = []
          p.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
          await p.setViewport(vp)
          await routed(p, base, cache, cpu)
          await p.goto(base, { waitUntil: "domcontentloaded" })
          await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 5, { timeout: 120000, polling: 250 })
          await sleep(1500)
          const tap = (text) => p.evaluate((text) => { const b = [...document.querySelectorAll("button, [role=tab]")].find((x) => x.textContent.trim() === text && x.getClientRects().length); if (!b) return false; b.click(); return true }, text)
          await tap("Theme")
          await sleep(600)
          const typo = await p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Typography/.test(x.textContent.trim()) && x.getClientRects().length); if (!b) return false; b.click(); return true })
          await sleep(800)
          const trigger = "[data-font-picker] button[aria-haspopup=listbox]"
          if (!typo || !(await p.$(trigger))) { say(false, `website builder at ${vpName}: no Typography font picker reached`); await p.close(); continue }
          /* Open time: the press to the first frame with the list drawn, three times; the faces asked for on the first. */
          const opens = []
          let firstAsked = null
          for (let i = 0; i < 3; i++) {
            const ms = await p.evaluate((trigger) => new Promise((done) => {
              const b = [...document.querySelectorAll(trigger)].find((e) => e.getClientRects().length)
              const t0 = performance.now()
              b.click()
              const look = () => {
                const rows = [...document.querySelectorAll("[role=listbox] [data-font-row]")].filter((r) => r.getClientRects().length)
                if (rows.length) requestAnimationFrame(() => done(performance.now() - t0))
                else if (performance.now() - t0 > 4000) done(null)
                else requestAnimationFrame(look)
              }
              requestAnimationFrame(look)
            }), trigger)
            opens.push(ms)
            if (i === 0) { await sleep(600); firstAsked = await facesAsked(p, await p.evaluate(() => [...document.querySelectorAll("[role=listbox] [data-font-row]")].map((r) => r.querySelector("span span")?.textContent?.trim() ?? ""))) }
            if (i < 2) { await p.keyboard.press("Escape"); await sleep(500); await p.evaluate(() => document.activeElement?.blur?.()); await sleep(300) }
          }
          const openMs = Math.max(...opens.map((x) => x ?? 9999))
          const openBudget = 120 * cpu
          say(openMs <= openBudget, `website builder picker at ${vpName}${cpu > 1 ? ` (CPU ${cpu}x)` : ""}: opens in ${opens.map((x) => (x === null ? "never" : `${Math.round(x)}ms`)).join(", ")} (budget ${openBudget}ms)`)
          await sleep(400)
          const offered = await p.evaluate(() => [...document.querySelectorAll("[role=listbox] [data-font-row]")].map((r) => r.querySelector("span span")?.textContent?.trim() ?? ""))
          say(firstAsked !== null && firstAsked < offered.length, `  only the rows in view ask for their face when the list first opens: ${firstAsked} of ${offered.length}`)
          say(NEW_FONTS.every((f) => offered.includes(f)), `  the ten new families are offered (${offered.length} in the heading list)`)
          await p.screenshot({ path: join(shots, `wb-picker-${vpName}-top.png`) })
          const scrolled = await scrollList(p, "[role=listbox]")
          const long = scrolled ? Math.max(...scrolled.gaps) : null
          const scrollBudget = 34 * cpu
          say(!!scrolled && long <= scrollBudget, `  scrolled top to bottom: longest frame ${long === null ? "?" : Math.round(long)}ms, ${scrolled ? scrolled.gaps.filter((g) => g > 20 * cpu).length : "?"} frames over ${20 * cpu}ms (budget ${scrollBudget}ms)`)
          await sleep(1200)
          /* Every new row drawn in its own face once it is in view. */
          const rowFaces = []
          for (const family of NEW_FONTS) {
            await p.evaluate((family) => { const r = [...document.querySelectorAll("[role=listbox] [data-font-row]")].find((x) => x.querySelector("span span")?.textContent?.trim() === family); r?.scrollIntoView({ block: "center" }); r?.querySelector("span span")?.setAttribute("data-probe-row", "") }, family)
            await sleep(400)
            const f = await faceOf(p, "[data-probe-row]", family)
            await p.evaluate(() => document.querySelector("[data-probe-row]")?.removeAttribute("data-probe-row"))
            if (!f || !f.ok) rowFaces.push({ family, ...(f ?? {}) })
          }
          say(rowFaces.length === 0, `  each new family's row is drawn in that family${rowFaces.length ? `   ${JSON.stringify(rowFaces).slice(0, 300)}` : ""}`)
          await p.screenshot({ path: join(shots, `wb-picker-${vpName}-new.png`) })
          await p.keyboard.press("Escape")
          await sleep(500)
          /* Each new family picked from the list: the canvas's heading drawn in it. */
          const canvasBad = []
          for (const family of NEW_FONTS) {
            const picked = await p.evaluate((trigger, family) => new Promise((done) => {
              const b = [...document.querySelectorAll(trigger)].find((e) => e.getClientRects().length)
              b.click()
              setTimeout(() => {
                const r = [...document.querySelectorAll("[role=listbox] [data-font-row]")].find((x) => x.querySelector("span span")?.textContent?.trim() === family)
                if (!r) return done(false)
                r.scrollIntoView({ block: "center" })
                r.click()
                done(true)
              }, 350)
            }), trigger, family)
            await sleep(1200)
            const f = picked ? await faceOf(p, "#wb-preview-root [data-section-box] h1, #wb-preview-root [data-section-box] h2", family) : null
            if (!f || !f.ok) canvasBad.push({ family, picked, ...(f ?? {}) })
            const hero = await p.evaluateHandle(() => [...document.querySelectorAll("#wb-preview-root [data-section-box] h1, #wb-preview-root [data-section-box] h2")].find((e) => e.getClientRects().length)?.closest("[data-section-box]") ?? null)
            const box = hero.asElement() ? await hero.asElement().boundingBox() : null
            if (box && box.width > 0) await p.screenshot({ path: join(shots, `wb-canvas-${vpName}-${family.replace(/\s+/g, "-").toLowerCase()}.png`), clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(box.width, vp.width), height: Math.min(box.height, 520) } })
          }
          say(canvasBad.length === 0, `website builder canvas at ${vpName}: each new family picked is the heading's face (computed, loaded, used)${canvasBad.length ? `   ${JSON.stringify(canvasBad).slice(0, 400)}` : ""}`)
          if (errors.length) say(false, `  page errors: ${JSON.stringify(errors.slice(0, 2))}`)
          await p.close()
        }
      } finally {
        server.close()
      }
    }

    /* ── PICKER: the OnePage Design tab ── */
    if (!only || only === "onepage") {
      console.log("\nFONTS: the OnePage Design tab's font picker")
      const { serveEditorProbe } = await import("./onepage-probe-server.mjs")
      const op = await serveEditorProbe({ root, fail: (m) => { throw new Error(m) } })
      try {
        for (const [vpName, vp, cpu] of [["1440", DESKTOP, 1], ["390", PHONE, 4]]) {
          const p = await browser.newPage()
          await p.setViewport(vp)
          await routed(p, op.base, cache, cpu)
          await p.evaluateOnNewDocument(() => { try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {} })
          await p.goto(`${op.base}/app/onepage#design`)
          await p.waitForSelector("[data-scroll-container]", { timeout: 60000 })
          await sleep(1200)
          await p.evaluate(() => document.querySelector('[data-nav-row="text"]')?.click())
          await sleep(900)
          const ms = await p.evaluate(() => new Promise((done) => {
            const b = [...document.querySelectorAll('[data-font-picker="Page font"]')].find((e) => e.getClientRects().length)
            if (!b) return done(null)
            const t0 = performance.now()
            b.click()
            const look = () => {
              const rows = [...document.querySelectorAll("[data-font-option]")].filter((r) => r.getClientRects().length && r.getBoundingClientRect().top < innerHeight)
              if (rows.length) requestAnimationFrame(() => done(performance.now() - t0))
              else if (performance.now() - t0 > 4000) done(null)
              else requestAnimationFrame(look)
            }
            requestAnimationFrame(look)
          }))
          const budget = 120 * cpu
          say(ms !== null && ms <= budget, `OnePage picker at ${vpName}${cpu > 1 ? ` (CPU ${cpu}x)` : ""}: opens in ${ms === null ? "never" : `${Math.round(ms)}ms`} (budget ${budget}ms)`)
          await sleep(900)
          const offered = await p.evaluate(() => [...document.querySelectorAll("[data-font-option]")].filter((r) => r.getClientRects().length).map((r) => r.getAttribute("data-font-option")))
          say(NEW_FONTS.every((f) => offered.includes(f)), `  the ten new families are offered (${offered.length} rows)`)
          const scrolled = await scrollList(p, "[role=listbox][aria-label='Page font']")
          const long = scrolled ? Math.max(...scrolled.gaps) : null
          say(!!scrolled && long <= 34 * cpu, `  scrolled top to bottom: longest frame ${long === null ? "?" : Math.round(long)}ms (budget ${34 * cpu}ms)`)
          await sleep(1500)
          const rowBad = []
          for (const family of NEW_FONTS) {
            await p.evaluate((family) => { const r = [...document.querySelectorAll(`[data-font-option="${family}"]`)].find((e) => e.getClientRects().length); r?.scrollIntoView({ block: "center" }); r?.querySelector("[data-font-sample]")?.setAttribute("data-probe-row", "") }, family)
            await sleep(600)
            const f = await faceOf(p, "[data-probe-row]", family)
            await p.evaluate(() => document.querySelector("[data-probe-row]")?.removeAttribute("data-probe-row"))
            if (!f || !f.ok) rowBad.push({ family, ...(f ?? {}) })
          }
          say(rowBad.length === 0, `  each new family's row is drawn in that family${rowBad.length ? `   ${JSON.stringify(rowBad).slice(0, 300)}` : ""}`)
          await p.screenshot({ path: join(shots, `onepage-picker-${vpName}.png`) })
          await p.close()
        }
      } finally {
        op.server.close()
      }
    }
  } finally {
    await browser.close()
  }
  return results
}
