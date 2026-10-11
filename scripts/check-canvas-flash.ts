/**
 * ===========================================================================
 *  AN IMPORTED THEME'S FIRST PAGE AND A PAGE SWITCH, FILMED: CANVAS AGAINST LIVE
 * ===========================================================================
 *   npx tsx scripts/check-canvas-flash.ts <theme.zip> [first] [nav]
 *
 * "When I land on the homepage, the images flash and the sections flash."
 * The theme is converted as the import converts it. Its pictures from the
 * shop's Files (shopify://shop_images/…, which an import cannot bring) are
 * served by this probe, each a different photograph-sized JPEG answered after
 * IMG_MS, as a phone network brings them; its stylesheets and scripts after
 * ASSET_MS. Then the same home page is opened twice and filmed with the
 * browser's own screencast (every frame it composites):
 *
 *   live    the live site's handler (lib/storelib-theme/compat/site.ts) with
 *           the live page's head and foot, in a window the size of the canvas.
 *   canvas  the real editor (scripts/render-editor-probe.tsx), the canvas
 *           cropped out of every frame.
 *
 * Each frame is held against the page's settled last frame. A frame that is
 * further from it than an earlier frame already was is a RELAPSE: something
 * that had arrived went away again (a picture blanked and loaded again, a
 * section shown and then hidden for its entrance, a page drawn twice). The
 * theme's own entrance plays once, from hidden to shown, and is no relapse.
 * Inside the page every animation that starts is counted per element (an
 * entrance restarted is counted twice), and every picture requested per
 * address (a picture asked for twice is counted twice).
 *
 * `nav` then presses a header link in the canvas and on the live site and
 * films the switch: frames of white, frames of neither page (a cross-fade is
 * expected; a blank is not), and whether the new page's own entrance played
 * where it can be seen (animations that ran after it came forward).
 *
 * Measurements, not opinions. Frames go to $OUT (default /tmp/canvas-flash).
 */
import { createServer, type Server } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import JSZip from "jszip"
import puppeteer, { type Browser, type CDPSession, type Page } from "puppeteer-core"
import sharp from "sharp"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, themeAsset, type SiteData } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { liveNavigationEnd, liveNavigationMarkup } from "../lib/website-builder/live-navigation"
import { shop } from "./check-builder-nav19"

const OUT = process.env.OUT ?? "/tmp/canvas-flash"
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
const IMG_MS = Number(process.env.IMG_MS ?? 450)
const ASSET_MS = Number(process.env.ASSET_MS ?? 120)
const FILM_MS = Number(process.env.FILM_MS ?? 4500)
const W = Number(process.env.W ?? 1440)
const H = Number(process.env.H ?? 900)
mkdirSync(OUT, { recursive: true })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const within = <T,>(p: Promise<T>, ms = 1500): Promise<T> => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("no answer")), ms))])
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  const d = typeof detail === "string" ? detail : JSON.stringify(detail)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${d ? `  (${d})` : ""}`)
}

/* ── pictures, late ───────────────────────────────────────────────────────── */

const pictures = new Map<string, Buffer>()
async function picture(name: string): Promise<Buffer> {
  const had = pictures.get(name)
  if (had) return had
  const h = createHash("md5").update(name).digest()
  const c = (i: number) => `rgb(${h[i]},${h[i + 1]},${h[i + 2]})`
  const svg = `<svg width="1600" height="1000" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${c(0)}"/><stop offset="1" stop-color="${c(3)}"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><circle cx="${400 + h[6] * 3}" cy="${300 + h[7]}" r="${180 + h[8]}" fill="${c(9)}"/><rect x="${h[12] * 4}" y="${500 + h[13]}" width="500" height="260" fill="${c(10)}"/></svg>`
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
  pictures.set(name, jpg)
  return jpg
}
async function pictureServer(): Promise<{ base: string; server: Server; log: string[] }> {
  const log: string[] = []
  const server = createServer(async (req, res) => {
    const name = decodeURIComponent((req.url ?? "/").split("?")[0].replace(/^\/img\//, ""))
    log.push(req.url ?? "")
    const body = await picture(name)
    await sleep(IMG_MS)
    /* As the store's file storage answers: cached for a while. */
    res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*", "Timing-Allow-Origin": "*" })
    res.end(body)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { base: `http://127.0.0.1:${(server.address() as { port: number }).port}`, server, log }
}

/* ── the theme, converted with its shop pictures pointed at the probe ─────── */

async function themeFrom(zipPath: string, img: string) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  for (const [path, f] of Object.entries(zip.files)) {
    if (f.dir || !/\.(json|liquid)$/.test(path)) continue
    const text = await f.async("string")
    if (!text.includes("shopify://shop_images/")) continue
    zip.file(path, text.replace(/shopify:\/\/shop_images\/([^"'\s\\]+)/g, (_, n) => `${img}/img/${n}`))
  }
  /*
    A theme as exported carries no pictures of the store's: every picture
    setting of the home and page templates left empty is given one, as a
    store that has chosen its pictures has (FILL=0 leaves them empty).
  */
  if (process.env.FILL !== "0") {
    const schemaOf = async (type: string): Promise<{ settings?: { id: string; type: string }[]; blocks?: { type: string; settings?: { id: string; type: string }[] }[] } | null> => {
      const f = zip.file(`sections/${type}.liquid`) ?? Object.values(zip.files).find((x) => x.name.endsWith(`/sections/${type}.liquid`))
      if (!f) return null
      const m = /{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/.exec(await f.async("string"))
      try { return m ? JSON.parse(m[1]) : null } catch { return null }
    }
    for (const [path, f] of Object.entries(zip.files)) {
      if (f.dir || !/(^|\/)templates\/[^/]+\.json$/.test(path)) continue
      let doc: { sections?: Record<string, { type: string; settings?: Record<string, unknown>; blocks?: Record<string, { type: string; settings?: Record<string, unknown> }> }> }
      try { doc = JSON.parse((await f.async("string")).replace(/^\s*\/\*[\s\S]*?\*\//, "")) } catch { continue }
      let n = 0
      for (const [id, s] of Object.entries(doc.sections ?? {})) {
        const schema = await schemaOf(s.type)
        if (!schema) continue
        for (const st of schema.settings ?? []) if (st.type === "image_picker" && !s.settings?.[st.id]) { s.settings = { ...(s.settings ?? {}), [st.id]: `${img}/img/${id}-${st.id}.jpg` }; n++ }
        for (const [bid, b] of Object.entries(s.blocks ?? {})) {
          const def = schema.blocks?.find((d) => d.type === b.type)
          for (const st of def?.settings ?? []) if (st.type === "image_picker" && !b.settings?.[st.id]) { b.settings = { ...(b.settings ?? {}), [st.id]: `${img}/img/${id}-${bid}-${st.id}.jpg` }; n++ }
        }
      }
      if (n) zip.file(path, JSON.stringify(doc))
    }
  }
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  return r.theme
}

const typeOf = (name: string) => (/\.css$/.test(name) ? "text/css" : /\.js$/.test(name) ? "text/javascript" : /\.svg$/.test(name) ? "image/svg+xml" : /\.woff2$/.test(name) ? "font/woff2" : /\.woff$/.test(name) ? "font/woff" : /\.ttf$/.test(name) ? "font/ttf" : /\.png$/.test(name) ? "image/png" : /\.jpe?g$/.test(name) ? "image/jpeg" : /\.gif$/.test(name) ? "image/gif" : /\.webp$/.test(name) ? "image/webp" : "text/plain")
const bodyOf = (text: string) => (text.startsWith("base64:") ? Buffer.from(text.slice(7), "base64") : text)

async function serveLive(t: Awaited<ReturnType<typeof themeFrom>>): Promise<{ server: Server; base: string }> {
  const files = t.files
  const theme = themeOfInstall(files, t.settings, {
    assetUrl: (n) => `/api/site-theme/assets/x/1/${encodeURIComponent(n)}`,
    assetText: (n) => files[`shopify/assets/${n}`] ?? null,
  })
  const { products, collections, menus } = shop()
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  const site: SiteData = {
    creatorId: "c", theme, pages, products: products as never, collections: collections as never,
    menus: compatMenus(menus, Object.keys(pages)),
    shop: { name: t.name, currency: "USD", moneyFormat: "${{amount}}" },
    host: "127.0.0.1", extraHead: liveNavigationMarkup(), extraBodyEnd: liveNavigationEnd(),
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname.startsWith("/api/site-theme/assets/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      await sleep(ASSET_MS)
      const raw = files[`shopify/assets/${name}`]
      if (raw !== undefined && raw.startsWith("base64:")) { res.writeHead(200, { "Content-Type": typeOf(name), "Cache-Control": "public, max-age=3600" }); res.end(bodyOf(raw)); return }
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type, "Cache-Control": "public, max-age=3600" })
      res.end(a.body)
      return
    }
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body: null, cart: [] })
    res.writeHead(out.status, { ...(out.headers ?? {}), "Content-Type": out.type, "Cache-Control": "private, no-store" })
    res.end(out.body)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` }
}

async function serveEditor(t: Awaited<ReturnType<typeof themeFrom>>): Promise<{ server: Server; base: string }> {
  const { bundle, css } = (await import("./editor-probe-harness.mjs")) as { bundle: string; css: string }
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, v]) => p.startsWith("shopify/") && !v.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  const compat = { settings: t.settings, pages, sources, files }
  const { products, menus } = shop()
  const probeProducts = products.map((p) => ({ id: p.id, title: p.settings.title, slug: p.settings.slug, status: "published", price: 39, type: "physical" }))
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_API_DELAY_MS=${Number(process.env.API_MS ?? 150)};window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")};window.PROBE_PRODUCTS=${JSON.stringify(probeProducts)};window.PROBE_STORE_MENUS=${JSON.stringify({ available: true, stored: true, menus })};window.PROBE_CARDS=${JSON.stringify(products).replace(/</g, "\\u003c")};window.PROBE_ROUTE_DELAY_MS=${process.env.ROUTES ?? "{}"}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(bundle))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const name = decodeURIComponent(asset[1])
      await sleep(ASSET_MS)
      const text = t.files[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      res.writeHead(200, { "Content-Type": typeOf(name), "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" })
      res.end(bodyOf(text))
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` }
}

/* ── filming ──────────────────────────────────────────────────────────────── */

type Shot = { t: number; data: Buffer }
async function film(page: Page): Promise<{ cdp: CDPSession; stop: () => Promise<Shot[]> }> {
  const cdp = await page.createCDPSession()
  const shots: Shot[] = []
  cdp.on("Page.screencastFrame", (f: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
    shots.push({ t: (f.metadata.timestamp ?? Date.now() / 1000) * 1000, data: Buffer.from(f.data, "base64") })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
  return { cdp, stop: async () => { await cdp.send("Page.stopScreencast").catch(() => {}); return shots.sort((a, b) => a.t - b.t) } }
}

const SW = 72, SH = 45
type Px = { rgb: Buffer; std: number }
async function pixels(data: Buffer, crop: { left: number; top: number; width: number; height: number } | null): Promise<Px> {
  let img = sharp(data)
  if (crop) {
    const meta = await sharp(data).metadata()
    const left = Math.max(0, Math.min(crop.left, (meta.width ?? 1) - 2))
    const top = Math.max(0, Math.min(crop.top, (meta.height ?? 1) - 2))
    img = img.extract({ left, top, width: Math.min(crop.width, (meta.width ?? 1) - left), height: Math.min(crop.height, (meta.height ?? 1) - top) })
  }
  const rgb = await img.resize(SW, SH, { fit: "fill" }).removeAlpha().raw().toBuffer()
  let sum = 0, sq = 0
  for (const v of rgb) { sum += v; sq += v * v }
  const mean = sum / rgb.length
  return { rgb, std: Math.sqrt(sq / rgb.length - mean * mean) }
}
/** Mean difference per channel, 0..1, over the rows [from, to) of the small picture. */
function dist(a: Buffer, b: Buffer, from = 0, to = SH): number {
  let d = 0, n = 0
  for (let y = from; y < to; y++) for (let x = 0; x < SW * 3; x++) { d += Math.abs(a[y * SW * 3 + x] - b[y * SW * 3 + x]); n++ }
  return d / n / 255
}

type Row = { t: number; all: number; hero: number; rest: number; blank: boolean }
/**
 * How the frames came to the settled page. A relapse is a frame further from
 * the end than the nearest an earlier frame had come, by more than `slack`:
 * something shown that went away again.
 */
/**
 * From the moment the page is revealed (`from`, ms after t0; the first frame
 * with anything on it when not given), after a grace of GRACE_MS for the
 * reveal's own fade: frames that are blank (white), and JUMPS, frames that
 * differ from the one before by more than JUMP in the top or bottom half.
 * A theme's entrance fades or slides over many frames; a picture popping in,
 * a section swapped or a page replaced is one frame.
 */
const JUMP = Number(process.env.JUMP ?? 0.08)
const GRACE_MS = 120
async function timeline(shots: Shot[], crop: { left: number; top: number; width: number; height: number } | null, t0: number, label: string, from = -1): Promise<{ rows: Row[]; relapses: number; relapseFrames: number; firstContent: number; settled: number; blankAfterContent: number; jumps: string[]; blankAfterReveal: number; revealed: number }> {
  if (process.env.DUMP) {
    mkdirSync(`${OUT}/${label}`, { recursive: true })
    for (const s of shots) {
      let img = sharp(s.data)
      if (crop) { const m = await sharp(s.data).metadata(); img = img.extract({ left: crop.left, top: crop.top, width: Math.min(crop.width, (m.width ?? 0) - crop.left), height: Math.min(crop.height, (m.height ?? 0) - crop.top) }) }
      await img.resize(560).png().toFile(`${OUT}/${label}/${String(Math.round(s.t - t0)).padStart(6, "0")}.png`)
    }
  }
  const px: Px[] = []
  for (const s of shots) px.push(await pixels(s.data, crop))
  const end = px[px.length - 1].rgb
  const heroTo = Math.round(SH * 0.5)
  const rows: Row[] = px.map((p, i) => ({ t: Math.round(shots[i].t - t0), all: dist(p.rgb, end), hero: dist(p.rgb, end, 0, heroTo), rest: dist(p.rgb, end, heroTo, SH), blank: p.std < 6 }))
  const SLACK = 0.035
  let bestHero = 1, bestRest = 1, relapses = 0, relapseFrames = 0, inRelapse = false, firstContent = -1, blankAfterContent = 0
  for (const r of rows) {
    if (firstContent < 0 && !r.blank && r.all < 0.12) firstContent = r.t
    if (firstContent >= 0 && r.blank) blankAfterContent++
    const bad = r.hero > bestHero + SLACK || r.rest > bestRest + SLACK
    if (bad) { relapseFrames++; if (!inRelapse) relapses++ }
    inRelapse = bad
    bestHero = Math.min(bestHero, r.hero)
    bestRest = Math.min(bestRest, r.rest)
  }
  /* After the reveal. */
  const revealed = from >= 0 ? from : rows.find((r) => !r.blank)?.t ?? 0
  const jumps: string[] = []
  let blankAfterReveal = 0
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].t < revealed + GRACE_MS) continue
    if (rows[i].blank) blankAfterReveal++
    const top = dist(px[i].rgb, px[i - 1].rgb, 0, heroTo), bottom = dist(px[i].rgb, px[i - 1].rgb, heroTo, SH)
    if (top > JUMP || bottom > JUMP) jumps.push(`${rows[i].t}ms (${top.toFixed(2)}/${bottom.toFixed(2)})`)
  }
  let settled = rows[rows.length - 1].t
  for (let i = rows.length - 1; i >= 0; i--) { if (rows[i].all > 0.01) break; settled = rows[i].t }
  writeFileSync(`${OUT}/${label}-timeline.txt`, rows.map((r) => `${String(r.t).padStart(6)}ms  all ${r.all.toFixed(3)}  hero ${r.hero.toFixed(3)}  rest ${r.rest.toFixed(3)}${r.blank ? "  BLANK" : ""}`).join("\n"))
  /* A strip of the frames, for a person to look at. */
  const picks = shots.filter((_, i) => i % Math.max(1, Math.ceil(shots.length / 24)) === 0).slice(0, 24)
  const tiles = await Promise.all(picks.map(async (s) => {
    let img = sharp(s.data)
    if (crop) { const m = await sharp(s.data).metadata(); img = img.extract({ left: crop.left, top: crop.top, width: Math.min(crop.width, (m.width ?? 0) - crop.left), height: Math.min(crop.height, (m.height ?? 0) - crop.top) }) }
    return img.resize(240, 150, { fit: "fill" }).png().toBuffer()
  }))
  await sharp({ create: { width: 240 * 6, height: 150 * Math.ceil(tiles.length / 6), channels: 3, background: "#000" } })
    .composite(tiles.map((input, i) => ({ input, left: (i % 6) * 240, top: Math.floor(i / 6) * 150 })))
    .png().toFile(`${OUT}/${label}-strip.png`)
  return { rows, relapses, relapseFrames, firstContent, settled, blankAfterContent, jumps, blankAfterReveal, revealed }
}

/* In the theme's page: every animation started, per element, and every picture asked for, per address. */
const COUNT = `(function(){var a=window.__slAnim={starts:0,per:{},restarted:0,names:{}};var key=function(el){if(!el||!el.tagName)return"?";if(!el.__slk)el.__slk=el.tagName+"#"+(el.id||"")+"."+String(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className||"").slice(0,40)+"@"+Math.random().toString(36).slice(2,6);return el.__slk};
var on=function(e){var k=key(e.target)+":"+(e.animationName||e.propertyName||"");a.starts++;a.per[k]=(a.per[k]||0)+1;if(a.per[k]===2)a.restarted++;a.names[e.animationName||e.propertyName]=(a.names[e.animationName||e.propertyName]||0)+1};
addEventListener("animationstart",on,true);a.msgs=[];addEventListener("message",function(e){var m=e.data;if(m&&m.storelib===1&&m.type!=="select")a.msgs.push(m.type+(m.id?":"+m.id:""))});addEventListener("transitionrun",function(e){if(e.propertyName==="opacity"||e.propertyName==="transform"||e.propertyName==="clip-path")on(e)},true);
var log=a.log=[],ids=new WeakMap(),n=0,last=new Map();var fcp=0;try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(!fcp&&e.name==="first-contentful-paint")fcp=performance.timeOrigin+e.startTime;a.fcp=fcp})}).observe({type:"paint",buffered:true})}catch(e){}
var idOf=function(el){var i=ids.get(el);if(i===undefined){i=++n;ids.set(el,i)}return i};
var look=function(){if(!document.body){requestAnimationFrame(look);return}var t=Date.now(),h=innerHeight;var els=document.querySelectorAll(".shopify-section,.shopify-section .scroll-trigger,.shopify-section [class*='animate'],.shopify-section [class*='reveal'],.shopify-section img");for(var k=0;k<els.length&&k<400;k++){var el=els[k];var r=el.getBoundingClientRect();if(r.width<2||r.height<2||r.bottom<=0||r.top>=h)continue;var id=idOf(el);var v;if(el.tagName==="IMG"){v=(el.complete&&el.naturalWidth>0?"P":"-")+(el.currentSrc||el.src||"").slice(-40)}else{var o=parseFloat(getComputedStyle(el).opacity);v=String(Math.round(o*10)/10)}if(last.get(id)!==v){last.set(id,v);log.push([t,id,el.tagName==="IMG"?"img":"el",v])}}requestAnimationFrame(look)};requestAnimationFrame(look);
})();`

/* In the editor: when its loader, the canvas's outline and each frame came and went, and what each frame said. */
const EVENTS = `(function(){var ev=window.__ev=[];var log=function(w){ev.push([Date.now(),w])};var last="";
addEventListener("message",function(e){var m=e.data;if(m&&m.storelib===1&&m.type!=="box"&&m.type!=="scrolled"&&m.type!=="storage")log("frame says "+m.type)});
var look=function(){var l=document.querySelector(".wb-canvas-loader");var p=document.querySelector("[data-canvas-placeholder]");var f=[].map.call(document.querySelectorAll("[data-compat-frame]"),function(x){return x.getAttribute("data-compat-frame")}).join(",");var k="loader "+(l?(l.getAttribute("data-leaving")==="true"?"leaving":"up"):"none")+" | outline "+(p?p.getAttribute("data-canvas-placeholder"):"none")+" | frames "+(f||"none");if(k!==last){last=k;log(k)}};
new MutationObserver(look).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:["data-leaving","data-canvas-placeholder","data-compat-frame"]});})();`

type Log = [number, number, string, string][]
async function readCount(target: { evaluate: Page["evaluate"] }): Promise<{ starts: number; restarted: number; names: Record<string, number>; msgs?: string[]; log?: Log; fcp?: number } | null> {
  return within(target.evaluate(() => { const a = (window as unknown as { __slAnim?: { starts: number; restarted: number; names: Record<string, number>; msgs: string[]; log: [number, number, string, string][]; fcp: number } }).__slAnim; return a ? { starts: a.starts, restarted: a.restarted, names: a.names, msgs: a.msgs, log: a.log, fcp: a.fcp } : null }), 5000).catch(() => null)
}

/**
 * What the page did in view, from the moment it was revealed, read from
 * inside it (every animation frame, every element on its first screen):
 *   HIDDEN AGAIN   an element that had been shown (opacity up) and then went
 *                  down by 0.3 or more: a section or picture that flashed out
 *   PICTURES LATE  a picture on the first screen that arrived after the reveal
 *                  (popped in over a page already shown), or changed address
 *   ENTRANCES      elements that went from hidden (< 0.5) to shown after the
 *                  reveal: the theme's own entrance, played where it is seen
 */
function inView(log: Log, reveal: number) {
  const byId = new Map<number, { kind: string; v: string; t: number }[]>()
  for (const [t, id, kind, v] of log) { const l = byId.get(id) ?? []; l.push({ kind, v, t }); byId.set(id, l) }
  let hiddenAgain = 0, picturesLate = 0, entrances = 0
  const late: string[] = []
  for (const [, l] of byId) {
    if (l[0].kind === "img") {
      const at = l.filter((x) => x.t <= reveal).pop()
      const after = l.filter((x) => x.t > reveal)
      if (after.some((x) => x.v.startsWith("P")) && (!at || !at.v.startsWith("P") || after.some((x) => x.v.slice(1) !== at.v.slice(1)))) { picturesLate++; late.push(`${after.find((x) => x.v.startsWith("P"))!.t - reveal}ms`) }
      continue
    }
    /* What stood when the page was revealed, and every change after: shown is the highest it has been since. */
    const standing = l.filter((z) => z.t <= reveal).pop()
    const seen = [...(standing ? [standing] : []), ...l.filter((z) => z.t > reveal)]
    let max = -1, low = 2, hid = false, rose = false
    for (const x of seen) {
      const o = Number(x.v)
      if (max >= 0 && o <= max - 0.3) hid = true
      if (low < 0.5 && o >= 0.9) rose = true
      max = Math.max(max, o)
      low = Math.min(low, o)
    }
    if (hid) hiddenAgain++
    if (rose) entrances++
  }
  return { hiddenAgain, picturesLate, entrances, late }
}

async function frontFrame(page: Page) {
  for (let i = 0; i < 100; i++) {
    const h = await within(page.$("[data-compat-frame='front']")).catch(() => null)
    const f = h ? await within(h.contentFrame()).catch(() => null) : null
    if (f && (await within(f.evaluate(() => !!document.querySelector(".shopify-section"))).catch(() => false))) return f
    await sleep(100)
  }
  throw new Error("the canvas never drew the theme")
}

async function first(browser: Browser, liveBase: string, editorBase: string, pics: { log: string[] }) {
  /* The canvas first, to learn its size; the live site is then filmed in a window that size. */
  const ed = await browser.newPage()
  await ed.setViewport({ width: W, height: H })
  await ed.evaluateOnNewDocument("window.__name = (f) => f")
  ed.on("pageerror", (e) => process.env.DEBUG && console.log("    editor error:", String(e).slice(0, 200)))
  /* Counted inside every frame the canvas makes: the bridge's own scripts run in it, so this goes in with them. */
  const cdp0 = await ed.createCDPSession()
  await cdp0.send("Page.enable")
  await cdp0.send("Page.addScriptToEvaluateOnNewDocument", { source: COUNT, runImmediately: true } as never).catch(() => {})
  const reqs: string[] = []
  ed.on("request", (r) => { if (r.url().includes("/img/")) reqs.push(r.url()) })
  await ed.evaluateOnNewDocument(EVENTS)
  pics.log.length = 0
  const rec = await film(ed)
  const t0 = Date.now()
  await ed.goto(editorBase, { waitUntil: "domcontentloaded" })
  /* The editor's own code arrives first; the canvas is filmed from then until FILM_MS after its frame exists. */
  await ed.waitForSelector("[data-compat-frame]", { timeout: 60_000 })
  await sleep(FILM_MS)
  const shots = await rec.stop()
  const box = await ed.evaluate(() => { const r = document.getElementById("wb-preview-root")!.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } })
  const f = await frontFrame(ed)
  const anim = await readCount(f)
  const canvasPics = pics.log.length
  const ev = await ed.evaluate(() => (window as unknown as { __ev: [number, string][] }).__ev)
  const s0 = shots[0]?.t ?? t0
  writeFileSync(`${OUT}/canvas-first-events.txt`, ev.map(([t, w]) => `${String(Math.round(t - s0)).padStart(6)}ms  ${w}`).join("\n"))
  /* Revealed: the editor's loader has faded off the page (its fade is the reveal, not a jump of the page's). */
  const reveal = ev.find(([, w]) => /^loader none \| outline (gone|none) \| frames front/.test(w))
  const c = await timeline(shots, box, s0, "canvas-first", reveal ? Math.round(reveal[0] - s0) : -1)
  /* Every frame the canvas made for this one page: one is the page drawn once. */
  /* In view from the moment the loader starts to fade off it. */
  const leaving = ev.find(([, w]) => /^loader (leaving|none) \| outline \w+ \| frames front/.test(w)) ?? reveal
  const cin = anim?.log && leaving ? inView(anim.log, leaving[0]) : null
  const looks = ev.filter(([, w]) => w.startsWith("loader"))
  const pageLoads = looks.filter(([, w], k) => /frames [^|]*behind/.test(w) && !(k > 0 && /frames [^|]*behind/.test(looks[k - 1][1]))).length + 1

  const lv = await browser.newPage()
  await lv.setViewport({ width: box.width, height: box.height })
  await lv.evaluateOnNewDocument("window.__name = (f) => f")
  await lv.evaluateOnNewDocument(COUNT)
  pics.log.length = 0
  const rec2 = await film(lv)
  await lv.goto(liveBase + "/", { waitUntil: "domcontentloaded" })
  await sleep(FILM_MS)
  const shots2 = await rec2.stop()
  const lanim = await readCount(lv)
  const livePics = pics.log.length
  const l = await timeline(shots2, null, shots2[0]?.t ?? Date.now(), "live-first")
  const lin = lanim?.log && lanim.fcp ? inView(lanim.log, lanim.fcp) : null

  console.log(`\nfirst load of the home page (canvas ${box.width}x${box.height})`)
  const say = (n: string, x: typeof c, a: typeof anim, p: number) => console.log(`  ${n.padEnd(7)} frames ${String(x.rows.length).padStart(3)}  revealed ${x.revealed}ms  blank after reveal ${x.blankAfterReveal}  JUMPS ${x.jumps.length}${x.jumps.length ? ` [${x.jumps.slice(0, 8).join(", ")}]` : ""}  animations ${a?.starts ?? "?"} restarted ${a?.restarted ?? "?"}  picture requests ${p}`)
  say("live", l, lanim, livePics)
  say("canvas", c, anim, canvasPics)
  console.log(`    canvas page loads ${pageLoads}`)
  const sayIn = (n: string, x: ReturnType<typeof inView> | null) => console.log(`  ${n.padEnd(7)} in view: HIDDEN AGAIN ${x?.hiddenAgain ?? "?"}  PICTURES LATE ${x?.picturesLate ?? "?"}${x?.late.length ? ` [${x.late.slice(0, 6).join(", ")}]` : ""}  ENTRANCES ${x?.entrances ?? "?"}`)
  sayIn("live", lin)
  sayIn("canvas", cin)
  console.log("    canvas frame was sent:", (anim?.msgs ?? []).join(", ") || "nothing")
  if (process.env.DEBUG) console.log("    canvas names", anim?.names, "\n    live names", lanim?.names)
  await ed.close()
  await lv.close()
  return { canvas: c, live: l, anim, lanim, pageLoads, cin, lin }
}

/* ── a page switch ────────────────────────────────────────────────────────── */

async function nav(browser: Browser, liveBase: string, editorBase: string) {
  const ed = await browser.newPage()
  await ed.setViewport({ width: W, height: H })
  await ed.evaluateOnNewDocument("window.__name = (f) => f")
  const cdp0 = await ed.createCDPSession()
  await cdp0.send("Page.enable")
  await cdp0.send("Page.addScriptToEvaluateOnNewDocument", { source: COUNT, runImmediately: true } as never).catch(() => {})
  await ed.evaluateOnNewDocument(EVENTS)
  await ed.goto(editorBase, { waitUntil: "domcontentloaded" })
  let f = await frontFrame(ed)
  await sleep(2500)
  const box = await ed.evaluate(() => { const r = document.getElementById("wb-preview-root")!.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } })
  /* The first header link to another page of the theme. */
  const href = await f.evaluate(() => {
    const as = [...document.querySelectorAll<HTMLAnchorElement>("header a[href], .header a[href], [class*='header'] a[href]")]
    const a = as.find((x) => /^\/(collections|products|pages)\//.test(x.getAttribute("href") ?? "") && x.getBoundingClientRect().width > 0)
    return a?.getAttribute("href") ?? null
  })
  if (!href) { console.log("  no header link to press"); await ed.close(); return }
  const before = await ed.screenshot({ type: "png", clip: { x: box.left, y: box.top, width: box.width, height: box.height } })
  const rec = await film(ed)
  const clickedAt = Date.now()
  await f.evaluate((h) => { const a = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].find((x) => x.getAttribute("href") === h && x.getBoundingClientRect().width > 0); a?.click() }, href)
  await sleep(FILM_MS)
  const shots = await rec.stop()
  f = await frontFrame(ed)
  const anim = await readCount(f)
  const after = shots[shots.length - 1].data
  const c = await switchTimeline(shots, box, before, after, "canvas-nav")
  /* The new page came forward: the first change after the click from a page behind to none behind. */
  const ev = (await ed.evaluate(() => (window as unknown as { __ev: [number, string][] }).__ev)).filter(([t, w]) => t >= clickedAt && w.startsWith("loader"))
  writeFileSync(`${OUT}/canvas-nav-events.txt`, ev.map(([t, w]) => `${String(t - clickedAt).padStart(6)}ms  ${w}`).join("\n"))
  const behindAt = ev.findIndex(([, w]) => /behind/.test(w))
  const forward = behindAt >= 0 ? ev.slice(behindAt).find(([, w]) => !/behind/.test(w)) : undefined
  const cin = anim?.log && forward ? inView(anim.log, forward[0]) : null

  const lv = await browser.newPage()
  await lv.setViewport({ width: box.width, height: box.height })
  await lv.evaluateOnNewDocument("window.__name = (f) => f")
  await lv.evaluateOnNewDocument(COUNT)
  await lv.goto(liveBase + "/", { waitUntil: "networkidle0" })
  await sleep(1500)
  const lbefore = await lv.screenshot({ type: "png" })
  const rec2 = await film(lv)
  /* Followed as a visitor's press is: the link clicked, or (a link in a closed menu, which a click does not reach) the address opened. */
  await lv.evaluate((h) => { const a = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].find((x) => x.getAttribute("href") === h && x.getBoundingClientRect().width > 0); a?.click(); setTimeout(() => { if (location.pathname === "/") location.assign(h) }, 300) }, href)
  await sleep(FILM_MS)
  const shots2 = await rec2.stop()
  const lanim = await readCount(lv)
  const l = await switchTimeline(shots2, null, lbefore, shots2[shots2.length - 1].data, "live-nav")
  const lin = lanim?.log && lanim.fcp ? inView(lanim.log, lanim.fcp) : null
  console.log(`\npage switch: header link ${href}`)
  const say = (n: string, x: typeof c, a: typeof anim) => console.log(`  ${n.padEnd(7)} frames ${String(x.frames).padStart(3)}  leaves the old page at ${x.startsAt}ms  new page settled at ${x.arrivedAt}ms  ARRIVAL ${x.arrival}ms over ${x.between} frames  blank ${x.blank}  back to old ${x.backToOld}  animations started in the new page ${a?.starts ?? "?"}`)
  say("live", l, lanim)
  say("canvas", c, anim)
  const sayIn = (n: string, x: ReturnType<typeof inView> | null) => console.log(`  ${n.padEnd(7)} new page in view: HIDDEN AGAIN ${x?.hiddenAgain ?? "?"}  PICTURES LATE ${x?.picturesLate ?? "?"}  ENTRANCES ${x?.entrances ?? "?"}`)
  sayIn("live", lin)
  sayIn("canvas", cin)
  console.log(`    canvas: came forward ${forward ? `${forward[0] - clickedAt}ms after the press` : "?"}`)
  await ed.close()
  await lv.close()
  return { canvas: c, live: l, anim, lanim, cin, lin }
}

/**
 * A switch, frame by frame, against the page left (`before`) and the page
 * arrived at (the last frame). It starts at the first frame unlike the page
 * left and ends at the last frame unlike the page arrived at: in between is
 * the arrival (a cut is no frame at all; a hand over and the new page's own
 * entrance are frames in between). Blank frames and frames that went back to
 * the page left are counted on their own.
 */
async function switchTimeline(shots: Shot[], crop: { left: number; top: number; width: number; height: number } | null, before: Uint8Array, after: Buffer, label: string) {
  /* `before` is a clip already for the canvas. */
  const old = (await pixels(Buffer.from(before), null)).rgb
  const neu = (await pixels(after, crop)).rgb
  const t0 = shots[0]?.t ?? 0
  const rows: { t: number; dOld: number; dNew: number; blank: boolean }[] = []
  for (const s of shots) {
    const p = await pixels(s.data, crop)
    const dOld = dist(p.rgb, old), dNew = dist(p.rgb, neu)
    /* Blank: a sheet of one colour that is neither page (a page that is mostly white is not a blank). */
    rows.push({ t: Math.round(s.t - t0), dOld, dNew, blank: p.std < 6 && dOld > 0.05 && dNew > 0.05 })
  }
  const start = rows.findIndex((r) => r.dOld > 0.02)
  let end = rows.length - 1
  while (end > 0 && rows[end - 1].dNew <= 0.015) end--
  let blank = 0, backToOld = 0, seenNew = false
  for (const r of rows) {
    if (r.blank) blank++
    if (r.dNew < 0.05) seenNew = true
    if (seenNew && r.dOld < 0.02) backToOld++
  }
  writeFileSync(`${OUT}/${label}-timeline.txt`, rows.map((r) => `${String(r.t).padStart(6)}ms  old ${r.dOld.toFixed(3)}  new ${r.dNew.toFixed(3)}${r.blank ? "  BLANK" : ""}`).join("\n"))
  if (process.env.DUMP) await timeline(shots, crop, t0, label).catch(() => null)
  return { frames: shots.length, startsAt: start < 0 ? -1 : rows[start].t, arrivedAt: rows[end].t, between: start < 0 ? 0 : Math.max(0, end - start), arrival: start < 0 ? 0 : rows[end].t - rows[start].t, blank, backToOld }
}

/* ── the same page drawn again (an edit it could not take in place) ───────── */

async function redraw(browser: Browser, editorBase: string) {
  const ed = await browser.newPage()
  await ed.setViewport({ width: W, height: H })
  await ed.evaluateOnNewDocument("window.__name = (f) => f")
  const cdp0 = await ed.createCDPSession()
  await cdp0.send("Page.enable")
  await cdp0.send("Page.addScriptToEvaluateOnNewDocument", { source: COUNT, runImmediately: true } as never).catch(() => {})
  await ed.evaluateOnNewDocument(EVENTS)
  await ed.goto(editorBase, { waitUntil: "domcontentloaded" })
  const f = await frontFrame(ed)
  await sleep(3000)
  const at = Date.now()
  /* As the bridge asks when a change cannot be made in place (canvas-bridge.ts, reload). */
  await f.evaluate(() => parent.postMessage({ storelib: 1, type: "reload", why: "probe" }, "*"))
  await sleep(4000)
  const ev = (await ed.evaluate(() => (window as unknown as { __ev: [number, string][] }).__ev)).filter(([t, w]) => t >= at && w.startsWith("loader"))
  const behindAt = ev.findIndex(([, w]) => /behind/.test(w))
  const forward = behindAt >= 0 ? ev.slice(behindAt).find(([, w]) => !/behind/.test(w)) : undefined
  const handed = ev.some(([, w]) => /leaving/.test(w.split("frames ")[1] ?? ""))
  const anim = await readCount(await frontFrame(ed))
  const x = anim?.log && forward ? inView(anim.log, forward[0]) : null
  console.log(`\nthe same page drawn again: came forward ${forward ? forward[0] - at : "?"}ms after, hand over ${handed ? "yes" : "no"}, in view: HIDDEN AGAIN ${x?.hiddenAgain ?? "?"}  ENTRANCES ${x?.entrances ?? "?"}  PICTURES LATE ${x?.picturesLate ?? "?"}`)
  await ed.close()
  return { forward: !!forward, handed, x }
}

async function main() {
  const zipPath = process.argv[2]
  if (!zipPath) { console.log("usage: npx tsx scripts/check-canvas-flash.ts <theme.zip> [first] [nav]"); process.exit(2) }
  const parts = new Set(process.argv.slice(3))
  const all = parts.size === 0
  const pics = await pictureServer()
  const t = await themeFrom(zipPath, pics.base)
  console.log(`${t.name}: pictures ${IMG_MS}ms, files ${ASSET_MS}ms, ${W}x${H}`)
  const live = await serveLive(t)
  const editor = await serveEditor(t)
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"], protocolTimeout: 300_000 })
  try {
    if (all || parts.has("first")) {
      const r = await first(browser, live.base, editor.base, pics)
      check("canvas: the page is drawn once", r.pageLoads === 1, r.pageLoads)
      check("canvas: no white frame once the page is revealed", r.canvas.blankAfterReveal === 0, r.canvas.blankAfterReveal)
      check("canvas: nothing on the first screen is hidden again once it is in view", r.cin?.hiddenAgain === 0, r.cin?.hiddenAgain)
      check("canvas: no picture on the first screen pops in after the page is revealed", r.cin?.picturesLate === 0, r.cin?.late)
      check("canvas: the theme's entrance plays in view as it does live", (r.lin?.entrances ?? 0) === 0 || (r.cin?.entrances ?? 0) > 0, `canvas ${r.cin?.entrances}, live ${r.lin?.entrances}`)
      check("canvas: no entrance plays twice", (r.anim?.restarted ?? 0) <= (r.lanim?.restarted ?? 0), `canvas ${r.anim?.restarted}, live ${r.lanim?.restarted}`)
    }
    if (parts.has("redraw")) {
      const r = await redraw(browser, editor.base)
      check("redrawn: it comes forward", r.forward)
      check("redrawn: as a cut, no hand over (it looks as the page it replaces)", !r.handed)
      check("redrawn: nothing on it fades or rises again, nothing hidden again", (r.x?.entrances ?? 1) === 0 && (r.x?.hiddenAgain ?? 1) === 0, r.x)
    }
    if (all || parts.has("nav")) {
      const r = await nav(browser, live.base, editor.base)
      if (r) {
        check("canvas switch: never blank", r.canvas.blank === 0, r.canvas.blank)
        check("canvas switch: never back to the old page once the new one shows", r.canvas.backToOld === 0, r.canvas.backToOld)
        check("canvas switch: the new page's own entrance plays in view, as live", (r.lin?.entrances ?? 0) === 0 || (r.cin?.entrances ?? 0) > 0, `canvas ${r.cin?.entrances}, live ${r.lin?.entrances}`)
        check("canvas switch: nothing on the new page is hidden again once it is in front", (r.cin?.hiddenAgain ?? 0) === 0, r.cin?.hiddenAgain)
        check("canvas switch: no picture on its first screen pops in after it came forward", (r.cin?.picturesLate ?? 0) === 0, r.cin?.late)
      }
    }
  } finally {
    await browser.close()
    live.server.close()
    editor.server.close()
    pics.server.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall ok")
  process.exit(failed ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
