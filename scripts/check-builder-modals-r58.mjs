/**
 * ===========================================================================
 *  THE BUILDER'S TWO BIG PICKERS, MEASURED (round 58)
 * ===========================================================================
 * The theme marketplace (app/(storelib)/app/website-builder/themes/
 * themes-client.tsx, through scripts/render-theme-popup-probe.tsx with the
 * templates' real covers) and Add a section on a Materia install
 * (components/website-builder/editor/section-library.tsx, through
 * scripts/render-section-preview-stress.tsx with a Materia template composed
 * and imported the way Add does it), at 360, 390, 768 and 1280.
 *
 *   THE MARKETPLACE
 *   • on a phone: a bottom sheet with a handle, its grid scrolling inside it,
 *     and a swipe on the page behind moves nothing
 *   • the order is a menu, not a <select>: a popover on a computer, a sheet
 *     on a phone; picking Name reorders the grid
 *   • every category, pressed in turn, frames sampled from the press to 600ms
 *     after: frames whose visible cards show no picture (not loaded, or
 *     faded under 5%), frames part faded, the grid's own opacity, layout
 *     shifts (all of them, input or not) and long tasks, with the CPU
 *     slowed four times. Once right after opening, before anything is
 *     warmed, and once a moment later.
 *
 *   ADD A SECTION (Materia)
 *   • the first cards of All, by name and by kind
 *   • the cards on the first screen: drawn (state shown) or not, and how
 *     much of each box is painted (from a screenshot)
 *   • the list scrolled half a screen at a time with the CPU slowed four
 *     times: layout shifts and long tasks
 *
 *   node scripts/check-builder-modals-r58.mjs
 *   SHOTS=/dir WIDTHS=360,390 PART=themes|sections MATERIA=/dir/of/an/install
 *
 * MATERIA is a folder of an install's files (.storelib sources, shopify/
 * files, config/settings.json); without it the script makes one from
 * theme-packages/materia (the clothing template).
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, extname, join, relative } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const SHOTS = process.env.SHOTS || ""
const WIDTHS = (process.env.WIDTHS ?? "360,390,768,1280").split(",").map(Number)
const PART = process.env.PART ?? "all"
const TAG = process.env.TAG ?? "now"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const out = mkdtempSync(join(tmpdir(), "storelib-r58-modals-"))
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const esbuild = join(root, "node_modules/.bin/esbuild")
const BANNER = '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;'
const report = { themes: {}, sections: {} }
let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === "" ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const css = (await appCss(root)) + "\n" + interFaces(root)
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"], protocolTimeout: 600_000 })

/* What every page records from its first moment: layout shifts and long tasks, with when they happened. */
const OBSERVE = `(() => {
  window.__shifts = []; window.__long = []
  const name = (n) => !n || !n.getAttribute ? String(n && n.nodeName) : n.nodeName.toLowerCase() + ["data-template-card", "data-themes-grid", "data-library-card", "data-themes-scroll", "class"].map((a) => n.getAttribute(a) != null ? "[" + a + "=" + String(n.getAttribute(a)).slice(0, 30) + "]" : "").join("")
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts.push({ t: e.startTime, v: e.value, input: e.hadRecentInput, from: (e.sources || []).slice(0, 4).map((x) => name(x.node) + " " + [x.previousRect.y, x.currentRect.y, x.previousRect.height, x.currentRect.height].map(Math.round).join("/")), outside: (e.sources || []).filter((x) => !(x.node && x.node.closest && x.node.closest("[data-themes-grid], [data-library-grid]"))).map((x) => name(x.node)) }) }).observe({ type: "layout-shift", buffered: true }) } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) }).observe({ type: "longtask", buffered: true }) } catch {}
})()`

const viewport = (W) => {
  const phone = W < 768
  return { width: W, height: W >= 1280 ? 800 : W >= 768 ? 1024 : W <= 360 ? 740 : 844, deviceScaleFactor: 2, isMobile: phone, hasTouch: phone }
}
const shot = async (p, name) => {
  if (SHOTS) await p.screenshot({ path: join(SHOTS, `${TAG}-${name}.png`) })
}
const throttle = async (p, rate) => {
  const s = await p.createCDPSession()
  await s.send("Emulation.setCPUThrottlingRate", { rate })
  return s
}
/* A finger's swipe, through CDP, from (x, y) by dy over a few steps. */
const swipe = async (p, x, y, dy, steps = 8) => {
  const s = await p.createCDPSession()
  await s.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  for (let i = 1; i <= steps; i++) {
    await s.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (dy * i) / steps }] })
    await sleep(16)
  }
  await s.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await s.detach()
}

/* ══ THE THEME MARKETPLACE ═════════════════════════════════════════════════ */
async function themes() {
  const stubs = join(out, "stubs")
  mkdirSync(stubs, { recursive: true })
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }\nexport const useLinkStatus = () => ({ pending: false })\n`)
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => window.location.pathname\nexport const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })\nexport const useSearchParams = () => new URLSearchParams(window.location.search)\n`)
  writeFileSync(join(stubs, "toast.js"), `export const useToast = () => ({ toast() {} })\n`)
  writeFileSync(join(stubs, "navbar.js"), `export const startNavigationLoading = () => {}\nexport const NavigationLoadingBar = () => null\n`)
  const js = join(out, "themes.js")
  execFileSync(esbuild, [join(root, "scripts/render-theme-popup-probe.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${js}`, BANNER,
    '--define:process.env.NODE_ENV="production"', "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@/hooks/use-toast=${join(stubs, "toast.js")}`, `--alias:@/components/app/navigation-loading-bar=${join(stubs, "navbar.js")}`, `--alias:@=${root}`], { stdio: ["ignore", "ignore", "inherit"], cwd: root, env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const bundle = readFileSync(js)
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>*{box-sizing:border-box}html,body{height:100%;margin:0;overflow:hidden}body{background:#f8f9fa;font-family:Inter,system-ui,sans-serif}#root{height:100dvh}</style><script>${OBSERVE}</script>`
  /* A cover takes a moment to come, as one from the CDN does on a phone's network. */
  const COVER_MS = Number(process.env.COVER_MS ?? 180)
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x")
    let file = null
    if (url.pathname === "/_next/image") file = url.searchParams.get("url")
    else if (url.pathname.startsWith("/themes/")) file = url.pathname
    if (file && /^\/themes\/[\w/.-]+$/.test(file) && existsSync(join(root, "public", file))) {
      await sleep(COVER_MS)
      res.writeHead(200, { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" })
      return res.end(readFileSync(join(root, "public", file)))
    }
    if (url.pathname === "/live.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/theme-previews/") || url.pathname.includes(".")) { res.writeHead(404); return res.end("{}") }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(`<!doctype html><html><head>${head}</head><body><div id="root"></div><script src="/live.js"></script></body></html>`)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`

  for (const W of WIDTHS) {
    console.log(`\nThe theme marketplace, ${W}px\n`)
    const phone = W < 768
    const r = (report.themes[W] = {})
    const p = await browser.newPage()
    await p.setViewport(viewport(W))
    p.on("pageerror", (e) => expect(false, "no script error", String(e).slice(0, 160)))
    await p.goto(`${origin}/app/website-builder?covers=real`, { waitUntil: "networkidle0", timeout: 60_000 })
    await p.waitForSelector("[data-wb-page]")
    await sleep(200)
    await p.evaluate(() => document.querySelector("[data-theme-marketplace-open='heading']").scrollIntoView({ block: "center" }))
    await sleep(100)
    const pageTop0 = await p.evaluate(() => document.querySelector(".page-scroll")?.scrollTop ?? 0)
    await p.click("[data-theme-marketplace-open='heading']")
    await p.waitForSelector("[data-themes-categories]")

    /* ── Right after opening: a category at once, before anything is warmed ── */
    const cats = await p.$$eval("[data-themes-category]", (b) => b.map((x) => x.getAttribute("data-themes-category")))
    const slow = await throttle(p, 4)
    await sleep(450)
    r.early = await switchTo(p, cats[2] ?? cats[1])
    await slow.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await p.click(`[data-themes-category="all"]`)
    await sleep(2500)
    await shot(p, `themes-${W}-open`)

    /* ── The shell ── */
    r.shell = await p.evaluate(() => {
      const popup = document.querySelector("[data-themes-popup]")
      const sheet = popup.closest("[data-sheet-panel]")
      const box = (sheet ?? popup).getBoundingClientRect()
      const scroll = document.querySelector("[data-themes-scroll]")
      const cs = getComputedStyle(sheet ?? popup)
      return {
        sheet: !!sheet,
        handle: !!sheet?.querySelector("[data-sheet-handle] > div"),
        top: Math.round(box.top),
        height: Math.round(box.height),
        radius: cs.borderTopLeftRadius,
        scrolls: scroll.scrollHeight > scroll.clientHeight,
        select: !!document.querySelector("[data-themes-popup] select"),
        chipsSelectable: getComputedStyle(document.querySelector("[data-themes-category]")).userSelect,
        chipOn: (() => { const c = getComputedStyle(document.querySelector("[data-themes-category-on]")); return `${c.backgroundColor} ${c.color}` })(),
      }
    })
    console.log("  shell", JSON.stringify(r.shell))
    if (phone) {
      expect(r.shell.sheet && r.shell.handle && r.shell.top > 0, "a phone gets a bottom sheet with a handle, below the top of the screen", `top ${r.shell.top}px, radius ${r.shell.radius}`)
      /* A swipe on the grid scrolls the grid; one on the dim above the sheet moves nothing behind it. */
      const before = await p.evaluate(() => ({ page: document.querySelector(".page-scroll")?.scrollTop ?? 0, grid: document.querySelector("[data-themes-scroll]").scrollTop }))
      await swipe(p, W / 2, viewport(W).height - 140, -320)
      await sleep(700)
      await swipe(p, W / 2, Math.max(8, r.shell.top / 2), -200)
      await sleep(700)
      const after = await p.evaluate(() => ({ page: document.querySelector(".page-scroll")?.scrollTop ?? 0, grid: document.querySelector("[data-themes-scroll]").scrollTop, open: !!document.querySelector("[data-themes-popup]") }))
      r.scroll = { before, after, pageTop0 }
      expect(after.grid > before.grid, "the grid scrolls inside the sheet", `${before.grid} -> ${after.grid}`)
      expect(after.page === before.page, "the page behind does not scroll", `${before.page} -> ${after.page}`)
      await p.evaluate(() => { document.querySelector("[data-themes-scroll]").scrollTop = 0 })
    }
    expect(!r.shell.select, "the order is not a native select")
    expect(r.shell.chipsSelectable === "none", "a chip's words cannot be selected like text", r.shell.chipsSelectable)

    /* ── Every category, warmed ── */
    const s4 = await throttle(p, 4)
    r.switches = []
    for (const c of [...cats.slice(1), "all"]) r.switches.push({ c, ...(await switchTo(p, c)) })
    await s4.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const sum = (k) => r.switches.reduce((a, s) => a + s[k], 0)
    r.totals = { switches: r.switches.length, blankFrames: sum("blankFrames"), fadedFrames: sum("fadedFrames"), dimFrames: sum("dimFrames"), shift: +r.switches.reduce((a, s) => a + s.shift, 0).toFixed(4), cls: +r.switches.reduce((a, s) => a + s.cls, 0).toFixed(4), shiftOutside: r.switches.flatMap((s) => s.shiftOutside).length, longTasks: sum("longTasks"), longest: Math.max(...r.switches.map((s) => s.longest)), firstFrameBlank: r.switches.filter((s) => s.firstBlank > 0).length }
    console.log("  early switch (just opened)", JSON.stringify(r.early))
    console.log("  every switch, warmed", JSON.stringify(r.totals))
    expect(r.totals.blankFrames === 0, "no frame of a switch shows a card without its picture", `${r.totals.blankFrames} frames over ${r.totals.switches} switches`)
    /*
      CLS as the standard counts it leaves out what moves within 500ms of a
      press: the cards of the new category taking the place of the old ones.
      So two readings: CLS, which must be 0, and anything at all moving
      outside the grid (the bar, the chips, the sheet), which must not.
    */
    expect(r.totals.cls === 0 && r.early.cls === 0, "CLS of the switches is 0", `warmed ${r.totals.cls}, just opened ${r.early.cls} (every shift entry, the press's own included: ${r.totals.shift} and ${r.early.shift}, all of them cards in the grid)`)
    expect(r.totals.shiftOutside === 0 && r.early.shiftOutside.length === 0, "nothing outside the grid moves on a switch", `${r.totals.shiftOutside + r.early.shiftOutside.length} sources outside`)
    expect(r.totals.dimFrames === 0, "no frame of a switch dims the grid", `${r.totals.dimFrames} frames`)
    expect(r.totals.longest < 120, "no task over 120ms on a switch with the CPU slowed four times", `${r.totals.longest}ms`)
    await p.click(`[data-themes-category="${cats[1]}"]`)
    await sleep(400)
    await shot(p, `themes-${W}-category`)
    await p.click(`[data-themes-category="all"]`)
    await sleep(300)

    /* ── The order ── */
    const trigger = await p.$("[data-themes-sort]")
    const tag = await p.evaluate((el) => el.tagName, trigger)
    if (tag === "SELECT") {
      r.sort = { kind: "select" }
    } else {
      const names0 = await p.$$eval("[data-themes-grid] [data-template-card] h3", (h) => h.map((x) => x.textContent))
      await trigger.click()
      await sleep(phone ? 650 : 250)
      await shot(p, `themes-${W}-sort`)
      r.sort = await p.evaluate(() => {
        const menu = document.querySelector("[data-action-list]")
        const sheet = document.querySelector("[data-app-sheet='open'] [data-action-sheet]")
        const rows = [...(sheet ?? menu ?? document).querySelectorAll("[data-action-item]")].map((x) => x.textContent.trim())
        return { kind: sheet ? "sheet" : menu ? "menu" : "none", rows }
      })
      const name = await p.$("[data-action-item='sort-name']")
      if (name) {
        await name.click()
        await sleep(phone ? 700 : 300)
      }
      const names1 = await p.$$eval("[data-themes-grid] [data-template-card] h3", (h) => h.map((x) => x.textContent))
      r.sort.reordered = names1.join() !== names0.join() && names1.join() === [...names1].sort((a, b) => a.localeCompare(b)).join()
      r.sort.label = await p.$eval("[data-themes-sort]", (b) => b.textContent.trim())
    }
    console.log("  sort", JSON.stringify(r.sort))
    expect(r.sort.kind === (phone && W < 640 ? "sheet" : "menu"), "the order opens a menu on a computer and a sheet on a phone", r.sort.kind)
    expect(!!r.sort.reordered, "Name puts the themes in name order", r.sort.label)
    await p.close()
  }
  server.close()
}

/*
  One press on a category, and every frame from it to 600ms after: the
  visible cards, how many of them have no picture yet (not decoded, or under
  5% opacity), how many are part faded, the grid's opacity, and every layout
  shift and long task in that time.
*/
async function switchTo(p, category) {
  await p.evaluate(() => {
    window.__frames = []
    const scroller = document.querySelector("[data-themes-scroll]")
    const grid = document.querySelector("[data-themes-grid]")
    const t0 = performance.now()
    window.__t0 = t0
    window.__done = new Promise((res) => {
      const tick = () => {
        const sr = scroller.getBoundingClientRect()
        const cards = [...grid.querySelectorAll("[data-template-card]")].filter((c) => {
          const r = c.querySelector("[data-template-frame]").getBoundingClientRect()
          return r.bottom > sr.top + 4 && r.top < sr.bottom - 4
        })
        let blank = 0
        let faded = 0
        for (const c of cards) {
          const img = c.querySelector("img[data-template-shot]")
          if (!img) continue
          const op = parseFloat(getComputedStyle(img).opacity)
          if (!img.complete || img.naturalWidth === 0 || op < 0.05) blank++
          else if (op < 0.99) faded++
        }
        let gop = 1
        for (let el = grid; el; el = el.parentElement) gop *= parseFloat(getComputedStyle(el).opacity)
        window.__frames.push({ t: Math.round(performance.now() - t0), names: cards.map((c) => c.getAttribute("data-template-card")).join(), blank, faded, gop: +gop.toFixed(3) })
        if (performance.now() - t0 < 600) requestAnimationFrame(tick)
        else res()
      }
      requestAnimationFrame(tick)
    })
  })
  await sleep(40)
  await p.click(`[data-themes-category="${category}"]`)
  return p.evaluate(async () => {
    await window.__done
    const f = window.__frames
    const first = f.findIndex((x) => x.names !== f[0].names)
    const after = first < 0 ? f.slice(1) : f.slice(first)
    const t0 = window.__t0
    const shifts = window.__shifts.filter((s) => s.t >= t0)
    const long = window.__long.filter((s) => s.t + s.d >= t0)
    return {
      frames: after.length,
      firstBlank: after[0]?.blank ?? 0,
      blankFrames: after.filter((x) => x.blank > 0).length,
      fadedFrames: after.filter((x) => x.faded > 0).length,
      dimFrames: after.filter((x) => x.gop < 0.99).length,
      minOpacity: Math.min(1, ...after.map((x) => x.gop)),
      shift: +shifts.reduce((a, s) => a + s.v, 0).toFixed(4),
      cls: +shifts.filter((s) => !s.input).reduce((a, s) => a + s.v, 0).toFixed(4),
      shiftFrom: shifts.flatMap((s) => s.from).slice(0, 4),
      shiftOutside: shifts.flatMap((s) => s.outside),
      longTasks: long.length,
      longest: Math.round(Math.max(0, ...long.map((l) => l.d))),
      pressToFrame: first < 0 ? null : f[first].t - f[0].t,
    }
  })
}

/* ══ ADD A SECTION, ON A MATERIA INSTALL ══════════════════════════════════ */
async function sections() {
  let dir = process.env.MATERIA
  if (!dir) {
    dir = join(out, "materia")
    execFileSync(process.execPath, [join(root, "scripts/check-builder-modals-r58-theme.mjs")], { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, OUT: dir }, cwd: root })
  }
  const sources = {}
  const files = {}
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const f = join(d, name)
      if (statSync(f).isDirectory()) walk(f)
      else {
        const rel = relative(dir, f)
        if (rel.endsWith(".storelib")) sources[rel] = readFileSync(f, "utf8")
        else if (rel.startsWith("shopify/") && !/\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|mp4|webm|pdf)$/i.test(rel)) files[rel] = readFileSync(f, "utf8")
      }
    }
  }
  walk(dir)
  const settings = existsSync(join(dir, "config/settings.json")) ? JSON.parse(readFileSync(join(dir, "config/settings.json"), "utf8")) : {}
  const stubs = join(out, "sstubs")
  mkdirSync(stubs, { recursive: true })
  const stub = (name, body) => (writeFileSync(join(stubs, name), body), join(stubs, name))
  const empty = stub("empty.js", "export default {}; export const readFileSync=()=>{throw Error('fs')}, existsSync=()=>false, join=(...p)=>p.join('/'), dirname=(p)=>p, resolve=(...p)=>p.join('/'), basename=(p)=>p;")
  const crypto = stub("crypto.js", "export function createHash(){let a='';return{update(s){a+=String(s);return this},digest(){let h=0x811c9dc5;for(let i=0;i<a.length;i++){h^=a.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(16).padStart(8,'0').repeat(4)}}} export function randomUUID(){return globalThis.crypto.randomUUID()} export default {createHash,randomUUID}")
  const nav = stub("navigation.js", "export const usePathname=()=>'/website-builder/editor/stress-install';export const useRouter=()=>({push(){},replace(){},refresh(){},prefetch(){},back(){}});export const useSearchParams=()=>new URLSearchParams();export const useParams=()=>({installId:'stress-install'});export const redirect=()=>{};export const notFound=()=>{};")
  const link = stub("link.jsx", "import React from 'react';export default function Link({href,children,...r}){return React.createElement('a',{href,...r},children)}")
  const image = stub("image.jsx", "import React from 'react';export default function Image({src,alt,fill,priority,unoptimized,sizes,quality,placeholder,blurDataURL,loader,...r}){return React.createElement('img',{src:typeof src==='string'?src:src&&src.src,alt,...r})}")
  const supa = stub("supabase.js", "const chain=()=>new Proxy(function(){},{get:(_,k)=>k==='then'?undefined:chain,apply:()=>chain()});export function createClient(){return{auth:{getUser:async()=>({data:{user:null}}),getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>chain(),channel:()=>({on(){return this},subscribe(){return this},unsubscribe(){}}),removeChannel(){}}}")
  const js = join(out, "sections.js")
  execFileSync(esbuild, [join(root, "scripts/render-section-preview-stress.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--minify", "--log-level=error", `--outfile=${js}`, BANNER,
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
    `--alias:next/navigation=${nav}`, `--alias:next/link=${link}`, `--alias:next/image=${image}`, `--alias:@/lib/supabase/client=${supa}`, `--alias:node:crypto=${crypto}`, `--alias:crypto=${crypto}`, `--alias:node:fs=${empty}`, `--alias:fs=${empty}`, `--alias:node:path=${empty}`, `--alias:path=${empty}`, `--alias:@=${root}`], { stdio: ["ignore", "ignore", "inherit"], cwd: root, env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
  const bundle = readFileSync(js)
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><script>${OBSERVE}</script></head><body><div id="app"></div>
<script>window.STRESS_PASS=${JSON.stringify("p".repeat(32))};window.STRESS_FILES_MS=200;window.STRESS=${JSON.stringify({ sources, files, settings }).replace(/</g, "\\u003c")}</script><script src="/probe.js"></script></body></html>`
  const mime = { ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2", ".woff": "font/woff" }
  const server = createServer((req, res) => {
    const url = req.url ?? "/"
    if (url === "/probe.js") return res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" }).end(bundle)
    const asset = /^\/api\/site-theme\/assets\/[^/]+\/([^/]+)\/([^?]+)/.exec(url)
    if (asset) {
      const name = decodeURIComponent(asset[2])
      const f = join(dir, "shopify/assets", name)
      return setTimeout(() => {
        if (!existsSync(f)) return res.writeHead(404, { "Access-Control-Allow-Origin": "*" }).end()
        res.writeHead(200, { "Content-Type": mime[extname(name).toLowerCase()] ?? "text/plain", "Access-Control-Allow-Origin": "*" }).end(readFileSync(f))
      }, 40)
    }
    if (url === "/" || url.startsWith("/?")) return res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html)
    res.writeHead(404).end()
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`

  for (const W of WIDTHS) {
    console.log(`\nAdd a section on Materia, ${W}px\n`)
    const r = (report.sections[W] = {})
    const p = await browser.newPage()
    await p.setViewport(viewport(W))
    p.on("pageerror", (e) => expect(false, "no script error", String(e).slice(0, 160)))
    await p.setRequestInterception(true)
    p.on("request", (q) => {
      const u = q.url()
      if (u.startsWith(origin) || u.startsWith("data:") || u.startsWith("about:") || u.startsWith("blob:")) return q.continue()
      return q.respond({ status: 404, body: "" })
    })
    await p.goto(origin, { waitUntil: "domcontentloaded" })
    await sleep(600)
    await p.evaluate(() => window.stress.open())
    await sleep(Number(process.env.SECTIONS_WAIT ?? 7000))
    const lib = W < 640 ? "[data-section-library='phone']" : "[data-section-library-layer]"
    r.order = await p.evaluate((lib) => [...document.querySelectorAll(`${lib} [data-library-card]`)].filter((c) => !c.hidden).slice(0, 24).map((c) => c.querySelector(":scope > span")?.textContent ?? c.getAttribute("data-library-card")), lib)
    console.log("  All starts with:", r.order.slice(0, 16).join(" | "))
    await shot(p, `sections-${W}-open`)
    /* The cards on the first screen: drawn or not, and how much of each box is painted. */
    r.firstScreen = await paintedCards(p, lib)
    console.log("  first screen", JSON.stringify(r.firstScreen.map((c) => `${c.type} ${c.state} ${c.h}px ink ${c.ink}%`)))
    /* Down the list a half screen at a time, slowed four times. */
    const s = await throttle(p, 4)
    const t0 = await p.evaluate(() => performance.now())
    const states = []
    for (let i = 0; i < 6; i++) {
      await p.evaluate((lib) => { const l = document.querySelector(`${lib} [data-library-scroll]`); l.scrollTop += Math.round(l.clientHeight / 2) }, lib)
      await sleep(700)
      const cards = await paintedCards(p, lib)
      states.push(...cards)
      if (i === 1) await shot(p, `sections-${W}-scrolled`)
    }
    await s.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    const perf = await p.evaluate((t0) => ({ shift: +window.__shifts.filter((x) => x.t >= t0).reduce((a, x) => a + x.v, 0).toFixed(4), long: window.__long.filter((x) => x.t >= t0).map((x) => Math.round(x.d)) }), t0)
    r.scroll = { cardsSeen: states.length, shown: states.filter((c) => c.state === "shown").length, notShown: states.filter((c) => c.state !== "shown").map((c) => `${c.type}:${c.state}`), emptyLooking: states.filter((c) => c.ink < 0.5).map((c) => c.type), ...perf }
    console.log("  scrolling", JSON.stringify({ ...r.scroll, notShown: r.scroll.notShown.slice(0, 8) }))
    await p.close()
  }
  server.close()
}

/* Every card wholly or mostly on screen in the list: its kind, its state, its height, and from a screenshot how much of its box is not one colour. */
async function paintedCards(p, lib) {
  const cards = await p.evaluate((lib) => {
    const v = document.querySelector(`${lib} [data-library-scroll]`)?.getBoundingClientRect()
    const out = []
    for (const c of document.querySelectorAll(`${lib} [data-library-card]`)) {
      if (c.hidden) continue
      const b = c.querySelector("[data-preview-box]")
      if (!b) continue
      const r = b.getBoundingClientRect()
      const top = Math.max(r.top, v.top), bottom = Math.min(r.bottom, v.bottom)
      if (bottom - top < Math.min(r.height, 100)) continue
      out.push({ type: c.getAttribute("data-library-card"), state: b.getAttribute("data-compat-preview-state") ?? (b.querySelector("[data-keep-transform]") ? "shown" : "waiting"), x: r.left, y: top, w: r.width, hv: bottom - top, h: Math.round(r.height) })
    }
    return out
  }, lib)
  if (!cards.length) return []
  const png = await p.screenshot({ type: "png" })
  const ink = await p.evaluate(async (b64, cards) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    const k = img.width / innerWidth
    return cards.map((card) => {
      const d = g.getImageData(Math.round((card.x + 2) * k), Math.round((card.y + 2) * k), Math.max(1, Math.round((card.w - 4) * k)), Math.max(1, Math.round((card.hv - 4) * k))).data
      const counts = new Map()
      for (let i = 0; i < d.length; i += 4) {
        const q = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4)
        counts.set(q, (counts.get(q) ?? 0) + 1)
      }
      return +(100 * (1 - Math.max(...counts.values()) / (d.length / 4))).toFixed(1)
    })
  }, png.toString("base64"), cards)
  return cards.map((c, i) => ({ type: c.type, state: c.state, h: c.h, ink: ink[i] }))
}

try {
  if (PART === "all" || PART === "themes") await themes()
  if (PART === "all" || PART === "sections") await sections()
} finally {
  await browser.close()
}
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 2))
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
