/**
 * ===========================================================================
 *  ADD A SECTION ON AN IMPORTED THEME, UNDER STRESS
 * ===========================================================================
 * The owner: in the Add a section dialog, an imported theme's previews
 * "sometimes break completely": a section's picture over the next card or
 * cut in half, an announcement bar across two cards, headings cut mid line,
 * cards that shift. Only a reload fixed it, and it happened most while the
 * editor took pushes.
 *
 * The real dialog (section-library.tsx, scripts/render-section-preview-stress.tsx)
 * on a 157 section theme built to break it (scripts/section-preview-stress-theme.ts),
 * driven by a seeded random run of what a person and the editor do: open and
 * close, categories pressed fast, a search typed, the list flung, the window
 * and the browser zoom changed, the CPU slowed, the main thread blocked, and
 * pushes (sections changed, added and removed, the theme's stylesheet
 * changed) and AI edits arriving while the dialog is open or closed.
 *
 * After every step, on the very next frame and again once settled, every
 * picture painted in the cards' frame is held against the card boxes:
 *
 *   overlap     a picture painted over any part of a card that is not its own
 *               (more than 1px each way), or a picture with no card at all
 *   misplaced   a picture whose top, left, width or height is more than 1px
 *               off its own card's box
 *   escapable   a picture whose box no longer clips what is in it
 *   stale       a picture showing an older revision of its section than the
 *               last push gave it
 *   duplicate   two pictures of one section
 *
 * Then the list is scrolled for 1.5s and long tasks (over 50ms) and frame
 * times are recorded.
 *
 *   npx tsx scripts/check-section-preview-stress.mjs
 *   RUNS=50 SEED=1 JSON=/path/out.json npx tsx scripts/check-section-preview-stress.mjs
 *   STRICT=0 ...   report without failing (for a before)
 */
import { createServer } from "node:http"
import { execSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { build } from "esbuild"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"
import { stressTheme } from "./section-preview-stress-theme.ts"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const RUNS = Number(process.env.RUNS ?? 6)
const STEPS = Number(process.env.STEPS ?? 22)
const SEED = Number(process.env.SEED ?? 1)
const STRICT = process.env.STRICT !== "0"
const root = process.cwd()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── the page ── */
const stubs = mkdtempSync(join(tmpdir(), "storelib-stress-stubs-"))
const stub = (name, body) => {
  writeFileSync(join(stubs, name), body)
  return join(stubs, name)
}
const empty = stub("empty.js", "export default {}; export const readFileSync=()=>{throw Error('fs')}, existsSync=()=>false, join=(...p)=>p.join('/'), dirname=(p)=>p, resolve=(...p)=>p.join('/'), basename=(p)=>p;")
const crypto = stub("crypto.js", "export function createHash(){let a='';return{update(s){a+=String(s);return this},digest(){let h=0x811c9dc5;for(let i=0;i<a.length;i++){h^=a.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(16).padStart(8,'0').repeat(4)}}} export function randomUUID(){return globalThis.crypto.randomUUID()} export default {createHash,randomUUID}")
const nav = stub("navigation.js", "export const usePathname=()=>'/website-builder/editor/stress-install';export const useRouter=()=>({push(){},replace(){},refresh(){},prefetch(){},back(){}});export const useSearchParams=()=>new URLSearchParams();export const useParams=()=>({installId:'stress-install'});export const redirect=()=>{};export const notFound=()=>{};")
const link = stub("link.jsx", "import React from 'react';export default function Link({href,children,...r}){return React.createElement('a',{href,...r},children)}")
const image = stub("image.jsx", "import React from 'react';export default function Image({src,alt,fill,priority,unoptimized,sizes,quality,placeholder,blurDataURL,loader,...r}){return React.createElement('img',{src:typeof src==='string'?src:src&&src.src,alt,...r})}")
const supa = stub("supabase.js", "const chain=()=>new Proxy(function(){},{get:(_,k)=>k==='then'?undefined:chain,apply:()=>chain()});export function createClient(){return{auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>chain(),channel:()=>({on(){return this},subscribe(){return this},unsubscribe(){}}),removeChannel(){}}}")
const built = await build({
  entryPoints: [join(root, "scripts/render-section-preview-stress.tsx")],
  bundle: true, write: false, platform: "browser", format: "iife", minify: !process.env.PROFILE, jsx: "automatic", logLevel: "error",
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://placeholder.supabase.co"', "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY": '"placeholder"', "process.env.NEXT_PUBLIC_APP_URL": '"https://storelib.com"' },
  banner: { js: 'var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;' },
  alias: {
    "@": root, "next/navigation": nav, "next/link": link, "next/image": image, "@/lib/supabase/client": supa, "node:crypto": crypto, crypto, "node:fs": empty, fs: empty, "node:path": empty, path: empty,
    /* PREVIEW_MODULE: another copy of compat-section-preview.tsx (an older commit's), to measure a before over the same dialog. */
    ...(process.env.PREVIEW_MODULE ? { "@/components/website-builder/compat/compat-section-preview": process.env.PREVIEW_MODULE } : {}),
  },
  nodePaths: [join(root, "node_modules")],
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
})
const js = built.outputFiles[0].text
if (process.env.PROFILE) writeFileSync(join(tmpdir(), "section-preview-stress-probe.js"), js)
const css = await appCss(root)
const theme = await stressTheme()
let font = Buffer.alloc(0)
try {
  const f = execSync(`find -L ${join(root, "node_modules/.pnpm")} -maxdepth 8 -name "geist-latin.woff2" 2>/dev/null | head -1`).toString().trim()
  if (f) font = readFileSync(f)
} catch { /* the late font is then a 404, which still arrives late */ }

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>window.STRESS=${JSON.stringify(theme).replace(/</g, "\\u003c")}</script><script src="/probe.js"></script></body></html>`

/* Pictures with no size, each arriving 100ms to 2.5s late; the theme's font 1.2s late. */
const server = createServer((req, res) => {
  const url = req.url ?? "/"
  if (url === "/probe.js") return res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end(js)
  const im = /^\/img\/(\d+)-(\d+)x(\d+)\.svg/.exec(url)
  if (im) {
    const [, n, w, h] = im.map(Number)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="hsl(${(n * 47) % 360} 30% 82%)"/><circle cx="${w / 2}" cy="${h / 3}" r="${h / 8}" fill="#fff8"/></svg>`
    return setTimeout(() => res.writeHead(200, { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" }).end(svg), 100 + ((n * 7919) % 2400))
  }
  if (url.startsWith("/font/")) return setTimeout(() => res.writeHead(font.length ? 200 : 404, { "Content-Type": "font/woff2" }).end(font), 1200)
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

/* ── a seeded random ── */
function rng(seed) {
  let s = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32
  }
}

/* ── what is painted, against the cards ── */
function audit({ revs, settled }) {
  const frame = document.querySelector("iframe[data-compat-sheet]")
  const scroller = document.querySelector("[data-section-library-layer] [data-library-scroll]")
  const out = { cutScrolling: 0, cut: 0, pictures: 0, overlap: 0, misplaced: 0, escapable: 0, stale: 0, duplicate: 0, orphan: 0, worst: 0, examples: [] }
  if (!frame || !scroller || !frame.contentDocument) return out
  const layer = document.querySelector("[data-section-library-layer]")
  if (layer?.getAttribute("data-state") !== "open") return out
  const view = scroller.getBoundingClientRect()
  const fr = frame.getBoundingClientRect()
  const k = fr.width / (parseFloat(frame.style.width) || frame.offsetWidth)
  const hosts = new Map()
  for (const card of document.querySelectorAll("[data-library-card]")) {
    if (card.hidden || !card.isConnected) continue
    const box = card.querySelector("[data-preview-box]")
    if (!box) continue
    const r = box.getBoundingClientRect()
    if (!(r.width > 0 && r.height > 0)) continue
    hosts.set(`${card.dataset.libraryCard}:${card.dataset.preset}`, r)
  }
  const cut = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) })
  const area = (r) => Math.max(0, r.right - r.left - 1) * Math.max(0, r.bottom - r.top - 1)
  const seen = new Map()
  const win = frame.contentWindow
  for (const sl of frame.contentDocument.querySelectorAll("sl-card")) {
    const cs = win.getComputedStyle(sl)
    if (sl.hidden || cs.display === "none" || cs.visibility !== "visible" || Number(cs.opacity) === 0) continue
    const r = sl.getBoundingClientRect()
    const p = { left: fr.left + r.left * k, top: fr.top + r.top * k, right: fr.left + r.right * k, bottom: fr.top + r.bottom * k }
    const shown = cut(cut(p, view), fr)
    if (area(shown) <= 0) continue
    out.pictures++
    const key = sl.getAttribute("data-sl-card")
    if (seen.has(key)) out.duplicate++
    seen.set(key, true)
    if (!(cs.overflowX === "clip" && cs.overflowY === "clip") && !/paint|strict|content/.test(cs.contain)) out.escapable++
    const own = hosts.get(key)
    const note = (what, extra) => { if (out.examples.length < 6) out.examples.push({ what, key, ...extra }) }
    if (!own) {
      out.orphan++
      for (const [other, b] of hosts) if (area(cut(shown, b)) > 0) { out.overlap++; note("orphan over", { other }); break }
    } else {
      const off = Math.max(Math.abs(p.top - own.top), Math.abs(p.left - own.left), Math.abs(p.right - own.right), Math.abs(p.bottom - own.bottom))
      out.worst = Math.max(out.worst, off)
      if (off > 1) { out.misplaced++; note("misplaced", { off: Math.round(off * 10) / 10 }) }
      /* Cut: the section is taller than its card while the card is not at its tallest (it was measured against other styles than it is drawn in). */
      const pv = sl.querySelector("[data-sl-pv]")
      const natural = pv ? pv.getBoundingClientRect().height * k : 0
      if (settled === "scrolling" && sl.hasAttribute("data-on") && natural > own.height + 2 && own.height < own.width * 1.1 - 2) out.cutScrolling++
      else if (settled === true && sl.hasAttribute("data-on") && natural > own.height + 2 && own.height < own.width * 1.1 - 2) { out.cut++; 
        let mem = null
        try { for (let i = 0; i < localStorage.length; i++) { const lk = localStorage.key(i); if (lk?.startsWith("wb-compat-preview-h3:")) { const v = JSON.parse(localStorage.getItem(lk) ?? "{}")[key]; if (v) mem = v } } } catch { /* none */ }
        note("cut", { natural: Math.round(natural), card: Math.round(own.height), pvHeight: pv.offsetHeight, mem, skipped: sl.hasAttribute("data-measured"), fonts: frame.contentDocument.fonts.status, ro: (window.__ro ?? []).filter((r) => r.key === key).slice(-6), state: document.querySelector(`[data-library-card="${key.split(":")[0]}"] [data-preview-box]`)?.style.height }) }
      for (const [other, b] of hosts) {
        if (other === key) continue
        if (area(cut(shown, b)) > 0) { out.overlap++; note("over", { other }); break }
      }
    }
    const want = revs[key.split(":")[0]]
    const m = /rev (\d+)/.exec(sl.textContent ?? "")
    if (settled === true && want !== undefined && m && Number(m[1]) !== want) { out.stale++; note("stale", { has: Number(m[1]), want }) }
  }
  out.worst = Math.round(out.worst * 100) / 100
  return out
}

const total = { cutScrolling: 0, cut: 0, overlap: 0, misplaced: 0, escapable: 0, stale: 0, duplicate: 0, orphan: 0, checks: 0, pictures: 0 }
const perRun = []
let shots = 0
const profile = new Map()
const perf = { longTasks: 0, longest: 0, frames: [], scrolls: 0 }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"] })
try {
  for (let run = 0; run < RUNS; run++) {
    const rand = rng(SEED * 1000 + run + 1)
    const pick = (list) => list[Math.floor(rand() * list.length)]
    const page = await browser.newPage()
    const cdp = await page.createCDPSession()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    const zoom = pick([1, 1, 0.9, 1.1, 1.25, 2])
    const size = pick([[1440, 900], [1280, 800], [1680, 1050], [1100, 760]])
    await page.setViewport({ width: Math.round(size[0] / zoom), height: Math.round(size[1] / zoom), deviceScaleFactor: zoom })
    const slow = rand() < 0.4 ? pick([2, 4]) : 1
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: slow })
    await page.goto(origin, { waitUntil: "load" })
    if (process.env.SETTLE_EXTRA) await page.evaluate((ms) => { window.SETTLE_EXTRA = ms }, Number(process.env.SETTLE_EXTRA))
    /* Half the runs let the closed library draw its cards ahead first, as an editor left alone does. */
    if (rand() < 0.5) await sleep(2500 + rand() * 3000)
    await page.evaluate(() => {
      window.__long = []
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration) }).observe({ type: "longtask", buffered: false })
    })
    const revs = {}
    for (const p of Object.keys(theme.sources)) {
      const m = /^sections\/(.+)\.storelib$/.exec(p)
      if (m) revs[m[1]] = 0
    }
    let added = 0
    const runTotals = { cut: 0, overlap: 0, misplaced: 0, stale: 0, duplicate: 0, escapable: 0, worst: 0, slow, zoom, size: size.join("x"), examples: [] }
    const check = async (label) => {
      const a = await page.evaluate(audit, { revs, settled: /settled/.test(label) ? true : /last frame/.test(label) ? "scrolling" : false })
      total.checks++
      total.pictures += a.pictures
      for (const k of ["cutScrolling", "cut", "overlap", "misplaced", "escapable", "stale", "duplicate", "orphan"]) total[k] += a[k]
      for (const k of ["cut", "overlap", "misplaced", "stale", "duplicate", "escapable"]) runTotals[k] += a[k]
      runTotals.worst = Math.max(runTotals.worst, a.worst)
      if (a.examples.length && runTotals.examples.length < 8) runTotals.examples.push({ label, ...a.examples[0] })
      if (process.env.SHOTS && a.examples.length && shots < 12) {
        mkdirSync(process.env.SHOTS, { recursive: true })
        await page.screenshot({ path: join(process.env.SHOTS, `run${run + 1}-${shots++}.png`) })
      }
    }
    const nextFrame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const settle = async () => {
      await page.evaluate(() => new Promise((done) => {
        const until = performance.now() + 3500
        const tick = () => {
          const waiting = [...document.querySelectorAll("[data-section-library-layer] [data-compat-preview-state='waiting']")].some((b) => {
            const r = b.getBoundingClientRect(), v = document.querySelector("[data-section-library-layer] [data-library-scroll]")?.getBoundingClientRect()
            return v && r.height > 0 && r.bottom > v.top && r.top < v.bottom
          })
          if (!waiting || performance.now() > until) setTimeout(done, window.SETTLE_EXTRA || 250)
          else setTimeout(tick, 100)
        }
        tick()
      }))
    }
    const isOpen = () => page.evaluate(() => document.querySelector("[data-section-library-layer]")?.getAttribute("data-state") === "open")
    const push = async () => {
      const src = await page.evaluate(() => window.stress.sources())
      const next = {}
      const types = Object.keys(revs)
      const n = 1 + Math.floor(rand() * 8)
      for (let i = 0; i < n; i++) {
        const t = pick(types)
        const path = `sections/${t}.storelib`
        if (!src[path]) continue
        const rev = revs[t] + 1 + Math.floor(rand() * 3)
        next[path] = src[path].replace(/rev \d+/g, `rev ${rev}`).replace(/(\.[a-z]{2}-\d+\{[^}]*?)(padding:)(\d+)/, (m, a, b, c) => `${a}${b}${Number(c) + 10 + Math.floor(rand() * 40)}`)
        revs[t] = rev
      }
      if (rand() < 0.4) {
        const from = pick(types)
        const t = `added-${run}-${added++}`
        const text = src[`sections/${from}.storelib`]
        if (text) {
          next[`sections/${t}.storelib`] = text.replace(/("name":")([^"]+)/g, `$1$2 copy ${added}`)
          const m = /rev (\d+)/.exec(text)
          revs[t] = m ? Number(m[1]) : 0
        }
      }
      if (rand() < 0.3) {
        const t = pick(types)
        next[`sections/${t}.storelib`] = null
        delete revs[t]
      }
      const files = rand() < 0.2 ? { "shopify/assets/marketing-sections.css": theme.files["shopify/assets/marketing-sections.css"] + `\nh2{margin-bottom:${Math.floor(rand() * 30)}px}` } : rand() < 0.3 ? { "shopify/assets/stress.css": theme.files["shopify/assets/stress.css"] + `\n.shopify-section{padding-bottom:${Math.floor(rand() * 30)}px}\n.btn{padding:${8 + Math.floor(rand() * 12)}px 18px}` } : {}
      await page.evaluate((next, files) => window.stress.push(next, files), next, files)
    }
    const block = (ms) => page.evaluate((ms) => { const end = performance.now() + ms; while (performance.now() < end) { /* the main thread held */ } }, ms)

    await page.evaluate(() => window.stress.open())
    await nextFrame()
    await check("open, first frame")
    await settle()
    await check("open, settled")
    if (process.env.SHOTS && run === 0) await page.screenshot({ path: join(process.env.SHOTS, "open-settled.png") })
    for (let step = 0; step < STEPS; step++) {
      const open = await isOpen()
      const what = open ? pick(["category", "category", "scroll", "scroll", "fling", "search", "close", "push", "push", "ai", "resize", "block", "categories fast"]) : pick(["open", "open", "push", "ai"])
      if (what === "open") await page.evaluate(() => window.stress.open())
      else if (what === "close") await page.evaluate(() => window.stress.close())
      else if (what === "category" || what === "categories fast") {
        const count = what === "category" ? 1 : 3 + Math.floor(rand() * 4)
        for (let i = 0; i < count; i++) {
          await page.evaluate((r) => {
            const pills = [...document.querySelectorAll("[data-section-library-layer] [aria-pressed]")].filter((b) => !b.hasAttribute("data-app-embeds-toggle"))
            pills[Math.floor(r * pills.length)]?.click()
          }, rand())
          if (count > 1) await sleep(rand() * 60)
        }
      } else if (what === "scroll") {
        await page.evaluate((r) => { const s = document.querySelector("[data-section-library-layer] [data-library-scroll]"); if (s) s.scrollTop = r * (s.scrollHeight - s.clientHeight) }, rand())
      } else if (what === "fling") {
        await page.mouse.move(size[0] / zoom * 0.6, size[1] / zoom * 0.5)
        for (let i = 0; i < 12; i++) { await page.mouse.wheel({ deltaY: (rand() < 0.75 ? 1 : -1) * (200 + rand() * 900) }); await sleep(16) }
      } else if (what === "search") {
        const word = pick(["hero", "banner", "count", "marq", "faq", "promo", "x", "slide", ""])
        await page.evaluate((w) => {
          const input = document.querySelector("[data-section-library-layer] input[type=search]")
          if (!input) return
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
          set.call(input, w)
          input.dispatchEvent(new Event("input", { bubbles: true }))
        }, word)
      } else if (what === "push") await push()
      else if (what === "ai") {
        await page.evaluate(() => window.stress.ai(true))
        await push()
        if (rand() < 0.5) await page.evaluate((v) => window.stress.settings({ colors_accent: v }), `#${Math.floor(rand() * 0xffffff).toString(16).padStart(6, "0")}`)
        await sleep(200 + rand() * 600)
        await page.evaluate(() => window.stress.ai(false))
      } else if (what === "resize") {
        const w = Math.round((900 + rand() * 900) / zoom)
        await page.setViewport({ width: w, height: Math.round((650 + rand() * 400) / zoom), deviceScaleFactor: zoom })
      } else if (what === "block") {
        await block(80 + rand() * 220)
      }
      await nextFrame()
      await check(`${what}, next frame`)
      if (rand() < 0.5 || what === "push" || what === "ai") {
        await settle()
        await check(`${what}, settled`)
      }
    }
    /* A push that lands while the dialog is closed, then the dialog opened again. */
    if (!(await isOpen())) await page.evaluate(() => window.stress.open())
    await page.evaluate(() => window.stress.close())
    await push()
    await sleep(300)
    await page.evaluate(() => window.stress.open())
    await nextFrame()
    await check("reopen after push, next frame")
    await settle()
    await check("reopen after push, settled")

    /* Scrolling: long tasks and frame times, from the top of All. */
    await page.evaluate(() => {
      const all = [...document.querySelectorAll("[data-section-library-layer] [aria-pressed]")].find((b) => /^All/.test(b.textContent ?? ""))
      all?.click()
    })
    await settle()
    /* PROFILE=1: a trace of the scroll, its main thread time summed by event (and by function for script). */
    const tracing = process.env.PROFILE && slow === 1
    if (tracing) await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink"] })
    const s = await page.evaluate(() => new Promise((done) => {
      const sc = document.querySelector("[data-section-library-layer] [data-library-scroll]")
      if (!sc) return done({ frames: [], long: [] })
      sc.scrollTop = 0
      window.__long = []
      const frames = []
      let last = performance.now()
      const end = last + 1500
      const step = () => {
        const now = performance.now()
        frames.push(now - last)
        last = now
        sc.scrollTop += 60
        if (now < end) requestAnimationFrame(step)
        else done({ frames, long: window.__long.slice() })
      }
      requestAnimationFrame(step)
    }))
    if (tracing) {
      const trace = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8"))
      const names = new Map()
      for (const e of trace.traceEvents) if (e.ph === "M" && e.name === "thread_name" && e.args?.name === "CrRendererMain") names.set(`${e.pid}:${e.tid}`, true)
      for (const e of trace.traceEvents) {
        if (e.ph !== "X" || !names.has(`${e.pid}:${e.tid}`) || !e.dur) continue
        const k = e.name === "FunctionCall" ? `FunctionCall ${e.args?.data?.functionName || "?"} ${(e.args?.data?.url || "").slice(-20)}:${e.args?.data?.lineNumber ?? ""}` : e.name
        profile.set(k, (profile.get(k) ?? 0) + e.dur / 1000)
      }
    }
    perf.scrolls++
    perf.longTasks += s.long.length
    perf.longest = Math.max(perf.longest, ...s.long, 0)
    if (slow === 1) perf.frames.push(...s.frames.slice(1))
    await check("scrolled, last frame")
    /* And three frames later: what is still cut then is not the frame or two a card takes to be read as it scrolls in. */
    await nextFrame()
    await nextFrame()
    await check("scrolled, settled")
    runTotals.errors = errors.slice(0, 3)
    perRun.push(runTotals)
    const bad = runTotals.cut + runTotals.overlap + runTotals.misplaced + runTotals.stale + runTotals.duplicate + runTotals.escapable
    console.log(`run ${run + 1}/${RUNS} ${runTotals.size} zoom ${zoom} cpu x${slow}: overlap ${runTotals.overlap}, misplaced ${runTotals.misplaced}, stale ${runTotals.stale}, duplicate ${runTotals.duplicate}, escapable ${runTotals.escapable}, cut ${runTotals.cut}, worst ${runTotals.worst}px, scroll long tasks ${s.long.length}${bad ? `  e.g. ${JSON.stringify(runTotals.examples.slice(0, 2))}` : ""}${errors.length ? `  errors: ${errors.slice(0, 2).join(" | ")}` : ""}`)
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}

const sorted = perf.frames.slice().sort((a, b) => a - b)
const pct = (p) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] * 10) / 10 : 0)
const runsWithOverlap = perRun.filter((r) => r.overlap > 0).length
const runsBad = perRun.filter((r) => r.cut + r.overlap + r.misplaced + r.stale + r.duplicate > 0).length
const summary = {
  runs: RUNS, steps: STEPS, seed: SEED, checks: total.checks, pictures: total.pictures,
  overlap: total.overlap, cut: total.cut, cutInLastScrollFrame: total.cutScrolling, misplaced: total.misplaced, stale: total.stale, duplicate: total.duplicate, escapable: total.escapable, orphan: total.orphan,
  runsWithOverlap, runsWithAnyFault: runsBad,
  scroll: { runs: perf.scrolls, longTasks: perf.longTasks, longestTask: Math.round(perf.longest), frameP50: pct(0.5), frameP95: pct(0.95), frameMax: pct(1), framesOver20ms: sorted.filter((f) => f > 20).length, frames: sorted.length },
}
console.log("\n" + JSON.stringify(summary, null, 2))
if (profile.size) console.log("\nmain thread while scrolling (ms, summed):\n" + [...profile].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v.toFixed(1).padStart(9)}  ${k}`).join("\n"))
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify({ summary, perRun }, null, 2))
if (STRICT) {
  const fail = []
  if (total.overlap) fail.push(`${total.overlap} pictures painted over another card`)
  if (total.misplaced) fail.push(`${total.misplaced} pictures off their card by more than 1px`)
  if (total.stale) fail.push(`${total.stale} stale pictures after a push`)
  if (total.duplicate) fail.push(`${total.duplicate} duplicate pictures`)
  if (total.cut) fail.push(`${total.cut} pictures cut short of their own section`)
  if (total.escapable) fail.push(`${total.escapable} pictures whose box does not clip`)
  if (fail.length) {
    console.error("\nFAIL: " + fail.join("; "))
    process.exit(1)
  }
  console.log("\nPASS")
}
