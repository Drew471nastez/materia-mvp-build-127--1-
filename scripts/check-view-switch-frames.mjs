/**
 * ===========================================================================
 *  THE SIZE SWITCH, AS PICTURES: EVERY FRAME OF EVERY SWITCH, LOOKED AT
 * ===========================================================================
 * The owner, after four rounds that measured frame rate and declared it done:
 * "every time I switch to mobile view, desktop view, full screen, it flashes,
 * it glitches, it bumps, it's non-smooth, it disappears, it fades".
 *
 * Frame rate is not what that says. This films what is on the screen (the
 * browser's own screencast, every frame it composites) and reads the page at
 * every animation frame beside it, for each way the canvas switches:
 *
 *   desktop to phone, phone to desktop, into and out of full screen (button
 *   and Escape), phone into full screen, the size switch out of full screen,
 *   and a second press 140ms into a switch (the turn round)
 *
 * on a long native page and on an imported theme (Dawn, drawn in its frame),
 * scrolled to the top and to the middle, at 1440x900 and 1280x800, at 1x and
 * 4x CPU. Per switch it prints:
 *
 *   blank     screencast frames where a band across the card is one flat
 *             colour that was not there before or after (a section drawn as
 *             nothing), and animation frames where a paused section
 *             (content-visibility) is inside the view
 *   fade      every opacity animation or transition that ran on the card, the
 *             page, the sidebar, the bar or the Ask pill, and the lowest
 *             effective opacity of each
 *   bump      the card's and the sidebar's edges going back on themselves,
 *             the bar moving, the element under the viewer's eye moving in
 *             one frame by more than the frames around it (px), the scroll
 *             or a scrollbar changing, and the END JUMP: how far that element
 *             and the card moved between the last animated frame and the page
 *             at rest (styles handed back, paused sections released)
 *   disappear sections or frames drawn again from nothing, pictures in view
 *             that are not drawn, a frame inside the canvas loading again
 *   smooth    animation frames, the longest gap, stalls (the card not moving
 *             for more than two frames mid switch)
 *
 * Contact sheets of the frames go to $OUT/<run>/<switch>.png. LOOK at them.
 *
 *   node scripts/check-view-switch-frames.mjs [dawn.zip]
 *   SETUPS=native,compat SIZES=1440x900,1280x800 CPUS=1,4 SCROLLS=top,middle
 *   ONLY="desktop to phone"   OUT=/tmp/vsf   SHEETS=0 (no pictures)
 *
 * Exits 1 when any switch shows a blank, a fade, a bump, a remount or an end
 * jump over 2px.
 */
import { createServer } from "node:http"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { CHROMIUM, bundle, css, root } from "./editor-probe-harness.mjs"

const OUT = process.env.OUT ?? join(tmpdir(), "view-switch-frames")
const SETUPS = (process.env.SETUPS ?? "native,compat").split(",")
const SIZES = (process.env.SIZES ?? "1440x900,1280x800").split(",").map((s) => s.split("x").map(Number))
const CPUS = (process.env.CPUS ?? "1,4").split(",").map(Number)
const SCROLLS = (process.env.SCROLLS ?? "top,middle").split(",")
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null
const SHEETS = process.env.SHEETS !== "0"
const RECORD_MS = Number(process.env.RECORD_MS ?? 1500)
const zipPath = process.argv[2] ?? process.env.THEME_ZIP ?? null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })

/* ── pictures ─────────────────────────────────────────────────────────────── */
const pictures = new Map()
async function picture(name) {
  if (pictures.has(name)) return pictures.get(name)
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  const c = (k) => `hsl(${(h >> k) % 360},${40 + ((h >> (k + 3)) % 40)}%,${35 + ((h >> (k + 5)) % 30)}%)`
  const svg = `<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${c(1)}"/><stop offset="1" stop-color="${c(7)}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="${300 + (h % 600)}" cy="${250 + (h % 300)}" r="${120 + (h % 160)}" fill="${c(11)}"/><rect x="${h % 700}" y="${420 + (h % 200)}" width="420" height="200" fill="${c(13)}"/></svg>`
  const jpg = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer()
  pictures.set(name, jpg)
  return jpg
}

/* ── an imported theme, converted the way the import converts it ─────────── */
let compat = null
let compatAssets = null
const IMG_PORT = 47000 + Math.floor(Math.random() * 1000)
const imgBase = `http://127.0.0.1:${IMG_PORT}`
if (SETUPS.includes("compat")) {
  if (!zipPath || !existsSync(zipPath)) {
    console.log("no theme zip given: the imported theme is skipped (node scripts/check-view-switch-frames.mjs dawn.zip)")
    SETUPS.splice(SETUPS.indexOf("compat"), 1)
  } else {
    const outFile = join(tmpdir(), `vsf-theme-${process.pid}.json`)
    const code = `
      const JSZip = require("jszip"); const { readFileSync, writeFileSync } = require("node:fs")
      const { convertShopifyTheme } = require(${JSON.stringify(join(root, "lib/storelib-theme/shopify/convert"))})
      ;(async () => {
        const zip = await JSZip.loadAsync(readFileSync(${JSON.stringify(zipPath)}))
        const schemaOf = async (type) => { const f = Object.values(zip.files).find((x) => x.name.endsWith("sections/" + type + ".liquid")); if (!f) return null; const m = /{%-?\\s*schema\\s*-?%}([\\s\\S]*?){%-?\\s*endschema\\s*-?%}/.exec(await f.async("string")); try { return m ? JSON.parse(m[1]) : null } catch { return null } }
        for (const [path, f] of Object.entries(zip.files)) {
          if (f.dir || !/(^|\\/)templates\\/index\\.json$/.test(path)) continue
          const doc = JSON.parse((await f.async("string")).replace(/^\\s*\\/\\*[\\s\\S]*?\\*\\//, ""))
          /* A long page: the home template's sections, three times over, as a real store's home is. */
          const order = doc.order ?? Object.keys(doc.sections)
          const sections = {}, nextOrder = []
          for (let k = 0; k < 3; k++) for (const id of order) { const s = JSON.parse(JSON.stringify(doc.sections[id])); sections[id + (k ? "-" + k : "")] = s; nextOrder.push(id + (k ? "-" + k : "")) }
          for (const [id, s] of Object.entries(sections)) {
            const schema = await schemaOf(s.type); if (!schema) continue
            for (const st of schema.settings ?? []) if (st.type === "image_picker" && !s.settings?.[st.id]) s.settings = { ...(s.settings ?? {}), [st.id]: ${JSON.stringify(imgBase)} + "/img/" + id + "-" + st.id + ".jpg" }
            for (const [bid, b] of Object.entries(s.blocks ?? {})) { const def = schema.blocks?.find((d) => d.type === b.type); for (const st of def?.settings ?? []) if (st.type === "image_picker" && !b.settings?.[st.id]) b.settings = { ...(b.settings ?? {}), [st.id]: ${JSON.stringify(imgBase)} + "/img/" + id + "-" + bid + "-" + st.id + ".jpg" } }
          }
          doc.sections = sections; doc.order = nextOrder
          zip.file(path, JSON.stringify(doc))
        }
        const r = await convertShopifyTheme(zip)
        if (!r.ok) throw new Error(r.error)
        writeFileSync(${JSON.stringify(outFile)}, JSON.stringify(r.theme))
      })().catch((e) => { console.error(e); process.exit(1) })`
    execFileSync("npx", ["--no-install", "tsx", "-e", code], { stdio: ["ignore", "inherit", "inherit"], cwd: root })
    const t = JSON.parse(readFileSync(outFile, "utf8"))
    const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
    const files = Object.fromEntries(Object.entries(t.files).filter(([p, v]) => p.startsWith("shopify/") && !v.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
    compat = { settings: t.settings, pages: Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])), sources, files }
    compatAssets = t.files
  }
}
const imgServer = createServer(async (req, res) => {
  const body = await picture(req.url ?? "/")
  res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" })
  res.end(body)
})
await new Promise((r) => imgServer.listen(IMG_PORT, "127.0.0.1", r))

/* ── the editor ───────────────────────────────────────────────────────────── */
/* A long native page: most of the kinds of section a store's home has, images in them. */
const NATIVE = ["header", "hero_centered", "image_banner", "features_grid", "gallery", "text_image", "stats", "logo_bar", "pricing", "team_members", "process_steps", "testimonials", "faq_accordion", "image_grid", "features_cards", "text_columns", "timeline", "comparison_table", "cta_simple", "media_collage", "hero_split", "multirow", "collection_list", "proof_testimonials", "promo_newsletter", "text_rich", "features_image", "footer"]
const js = readFileSync(bundle)
const pageHtml = (setup) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;${setup === "compat" ? `window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")};` : `window.PROBE_PAGES=${JSON.stringify({ home: NATIVE })};`}</script><script src="/editor-probe.js"></script></body></html>`
const typeOf = (name) => (/\.css$/.test(name) ? "text/css" : /\.js$/.test(name) ? "text/javascript" : /\.svg$/.test(name) ? "image/svg+xml" : /\.woff2$/.test(name) ? "font/woff2" : /\.png$/.test(name) ? "image/png" : /\.jpe?g$/.test(name) ? "image/jpeg" : "text/plain")
let currentSetup = "native"
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  if (url.pathname === "/editor-probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
  const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
  if (asset) {
    const name = decodeURIComponent(asset[1])
    const text = compatAssets?.[`shopify/assets/${name}`]
    if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); return res.end() }
    res.writeHead(200, { "Content-Type": typeOf(name), "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" })
    return res.end(text.startsWith("base64:") ? Buffer.from(text.slice(7), "base64") : text)
  }
  if (/\.(png|jpe?g|webp|gif)$/.test(url.pathname)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(pageHtml(currentSetup))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}/website-builder/editor/probe-install`

/* ── read at every animation frame, in the editor ─────────────────────────── */
const RECORDER = String.raw`(() => {
  const r2 = (n) => Math.round(n * 10) / 10
  const eff = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return Math.round(o * 1000) / 1000 }
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r2(r.left), t: r2(r.top), r: r2(r.right), b: r2(r.bottom) } }
  window.__vsfStart = (ms, press, again) => new Promise((done) => {
    const card = document.querySelector(".wb-canvas-frame")
    const root = document.getElementById("wb-preview-root")
    const fold = document.querySelector("[data-wb-sidebar-fold]")
    const panel = document.querySelector("[data-wb-sidebar-panel]")
    const tabs = document.querySelector("[data-wb-sidebar-tabs]")
    const bar = document.querySelector(".wb-editor-topbar")
    const sw = document.querySelector("[data-wb-device-switch]")
    const content = root && root.querySelector(".wb-canvas-in")
    const boxes = () => Array.from(root.querySelectorAll("[data-section-box]")).filter((b) => !b.parentElement.closest("[data-section-box]"))
    for (const b of boxes()) b.__vsf = 1
    if (content) content.__vsf = 1
    for (const f of root.querySelectorAll("iframe")) f.__vsf = 1
    const imgs0 = new Set(root.querySelectorAll("img"))
    /* What the viewer is looking at: the element at the view's top, a little in, and the section around it. */
    const view0 = root.getBoundingClientRect()
    const eyeAt = (v) => { const x = (v.left + v.right) / 2, y = v.top + Math.min(120, v.height / 4); let el = document.elementFromPoint(x, y); return el && root.contains(el) ? el : null }
    const eye = eyeAt(view0)
    const eyeSection = eye && eye.closest("[data-section-box]")
    const fades = new Map()
    const film = []
    /* A stamp in the corner, its colour the frame's number, so a picture of the screen is matched to the frame it shows. */
    let stamp = document.getElementById("vsf-stamp")
    if (!stamp) { stamp = document.createElement("div"); stamp.id = "vsf-stamp"; stamp.style.cssText = "position:fixed;left:0;bottom:0;width:24px;height:12px;z-index:2147483647;pointer-events:none;background:#000"; document.body.appendChild(stamp) }
    const t0 = performance.now()
    const tick = (now) => {
      const n = film.length
      stamp.style.background = "rgb(" + ((n % 8) * 32 + 16) + "," + (Math.floor(n / 8) % 8 * 32 + 16) + "," + (Math.floor(n / 64) % 4 * 45 + 120) + ")"
      const v = root.getBoundingClientRect()
      let heldPx = 0, heldN = 0, skippedPx = 0
      for (const b of boxes()) {
        const r = b.getBoundingClientRect()
        const top = Math.max(r.top, v.top), bottom = Math.min(r.bottom, v.bottom)
        if (bottom - top <= 0) continue
        const cv = getComputedStyle(b).contentVisibility
        if (cv === "hidden") { heldPx += bottom - top; heldN++ }
        else if (cv === "auto" && b.firstElementChild && b.firstElementChild.checkVisibility && !b.firstElementChild.checkVisibility({ contentVisibilityAuto: true })) skippedPx += bottom - top
      }
      let undrawn = 0
      for (const img of root.querySelectorAll("img")) {
        const r = img.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom < v.top || r.top > v.bottom) continue
        if (!img.complete || img.naturalWidth === 0) undrawn++
      }
      for (const a of document.getAnimations()) {
        if (a.playState !== "running") continue
        const t = a.effect && a.effect.target
        if (!t || !(t instanceof Element)) continue
        const where = card.contains(t) ? "page" : t === card ? "card" : fold && fold.contains(t) ? "sidebar" : bar.contains(t) ? "bar" : t.closest("[data-ask-dock],[data-ask-pill]") ? "ask" : null
        if (!where) continue
        const kf = a.effect.getKeyframes ? a.effect.getKeyframes() : []
        const props = a.transitionProperty ? [a.transitionProperty] : kf.flatMap((k) => Object.keys(k))
        if (!props.some((p) => p === "opacity" || p === "filter")) continue
        /* An opacity that does not change (held at one value) is no fade. */
        if (!a.transitionProperty && new Set(kf.map((k) => String(k.opacity))).size < 2) continue
        const name = where + ":" + (t.id || (t.getAttribute("data-ask-pill") !== null ? "ask-pill" : "") || String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(" ").slice(0, 3).join(".")) + ":" + (a.animationName || a.transitionProperty || "waapi")
        fades.set(name, (fades.get(name) || 0) + 1)
      }
      const moving = (card.getAnimations ? card.getAnimations().length : 0) + (fold ? fold.getAnimations().length : 0) + (panel ? panel.getAnimations().length : 0)
      const er = eye && eye.isConnected ? eye.getBoundingClientRect() : null
      const sr = eyeSection && eyeSection.isConnected ? eyeSection.getBoundingClientRect() : null
      const pill = document.querySelector("[data-ask-pill]")
      const c = card.getBoundingClientRect()
      film.push({
        n, t: Math.round(now - t0), wall: performance.timeOrigin + now,
        card: rect(card), cardOpacity: eff(card), radius: getComputedStyle(card).borderTopLeftRadius + "/" + getComputedStyle(card).borderBottomLeftRadius,
        content: content && content.isConnected ? eff(content) : -1,
        view: rect(root), scrollTop: Math.round(root.scrollTop), scrollHeight: root.scrollHeight, bar: root.offsetWidth - root.clientWidth,
        fold: fold ? r2(fold.getBoundingClientRect().width) : null, panel: rect(panel), panelOpacity: tabs ? eff(tabs) : null,
        topbar: rect(bar), topbarOpacity: eff(bar), sw: rect(sw),
        pill: pill ? { ...rect(pill), o: eff(pill), vis: getComputedStyle(pill).visibility } : null,
        eye: er ? r2(er.top - v.top) : null, eyeLeft: er ? r2(er.left - c.left) : null, section: sr ? r2(sr.top - v.top) : null, sectionH: sr ? r2(sr.height) : null,
        heldPx: Math.round(heldPx), heldN, skippedPx: Math.round(skippedPx), undrawn, moving,
        remounted: boxes().filter((b) => !b.__vsf).length + (content && !content.isConnected ? 1 : 0) + (root.querySelector(".wb-canvas-in") && !root.querySelector(".wb-canvas-in").__vsf ? 1 : 0),
        newFrames: Array.from(root.querySelectorAll("iframe")).filter((f) => !f.__vsf).length,
        newImgs: Array.from(root.querySelectorAll("img")).filter((i) => !imgs0.has(i)).length,
      })
      if (now - t0 < ms) requestAnimationFrame(tick)
      else { stamp.style.background = "rgb(0,0,0)"; done({ film, fades: Object.fromEntries(fades), eye: eye ? eye.tagName + "." + String(eye.className).slice(0, 40) : null }) }
    }
    const hit = (sel) => {
      if (sel === "Escape") { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return }
      const el = document.querySelector(sel)
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", isPrimary: true }))
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", isPrimary: true }))
      el.click()
    }
    stamp.style.background = "rgb(0,0,0)"
    film.push({ n: -1, t: -1, wall: performance.timeOrigin + performance.now(), card: rect(card), view: rect(root), scrollTop: Math.round(root.scrollTop), eye: eye ? Math.round(eye.getBoundingClientRect().top - view0.top) : null, section: eyeSection ? Math.round(eyeSection.getBoundingClientRect().top - view0.top) : null })
    window.__vsfPressWall = performance.timeOrigin + performance.now()
    hit(press)
    if (again) setTimeout(() => { window.__vsfAgainWall = performance.timeOrigin + performance.now(); hit(again[0]) }, again[1])
    requestAnimationFrame(tick)
  })
})()`

/* ── and inside an imported theme's frame ─────────────────────────────────── */
const FRAME_RECORDER = String.raw`(() => {
  window.__vsfFrame = (ms) => new Promise((done) => {
    const r2 = (n) => Math.round(n * 10) / 10
    const secs = () => Array.from(document.querySelectorAll(".shopify-section"))
    for (const s of secs()) s.__vsf = 1
    const eyeAt = () => { let el = document.elementFromPoint(innerWidth / 2, Math.min(120, innerHeight / 4)); return el }
    const eye = eyeAt()
    const section = eye && eye.closest(".shopify-section")
    const film = []
    const t0 = performance.now()
    const tick = (now) => {
      let heldPx = 0, undrawn = 0, fades = 0
      for (const s of secs()) {
        const r = s.getBoundingClientRect()
        const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom)
        if (bottom - top > 0 && getComputedStyle(s).contentVisibility === "hidden") heldPx += bottom - top
      }
      for (const img of document.images) {
        const r = img.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue
        if (!img.complete || img.naturalWidth === 0) undrawn++
      }
      for (const a of document.getAnimations()) if (a.playState === "running") { const kf = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : []; if (a.transitionProperty === "opacity" || kf.some((k) => "opacity" in k)) fades++ }
      const er = eye && eye.isConnected ? eye.getBoundingClientRect() : null
      const sr = section && section.isConnected ? section.getBoundingClientRect() : null
      film.push({ wall: performance.timeOrigin + now, w: innerWidth, h: innerHeight, y: Math.round(scrollY), sh: document.documentElement.scrollHeight, eye: er ? r2(er.top) : null, section: sr ? r2(sr.top) : null, heldPx: Math.round(heldPx), undrawn, fades, remounted: secs().filter((s) => !s.__vsf).length, bar: innerWidth - document.documentElement.clientWidth })
      if (now - t0 < ms) requestAnimationFrame(tick)
      else done(film)
    }
    requestAnimationFrame(tick)
  })
})()`

/* ── pictures of the frames ───────────────────────────────────────────────── */
const GRID = 8
/** Flat bands across the card: rows of the card (in GRID px steps) whose every cell is one colour. Returns the tallest band and the share of flat cells. */
async function flatness(data, box, scale) {
  const meta = await sharp(data).metadata()
  const left = Math.max(0, Math.round(box.l * scale)), top = Math.max(0, Math.round(box.t * scale))
  const width = Math.min(meta.width - left, Math.round((box.r - box.l) * scale)), height = Math.min(meta.height - top, Math.round((box.b - box.t) * scale))
  if (width < 16 || height < 16) return { band: height, flat: 1, editorBg: 1 }
  const cols = Math.max(4, Math.floor(width / GRID)), rows = Math.max(4, Math.floor(height / GRID))
  const raw = await sharp(data).extract({ left, top, width, height }).resize(cols * 2, rows * 2, { fit: "fill", kernel: "nearest" }).removeAlpha().raw().toBuffer()
  const W = cols * 2
  let flatCells = 0, band = 0, run = 0, bgCells = 0
  for (let y = 0; y < rows; y++) {
    let rowFlat = true
    const first = [raw[(y * 2 * W) * 3], raw[(y * 2 * W) * 3 + 1], raw[(y * 2 * W) * 3 + 2]]
    for (let x = 0; x < cols; x++) {
      let lo = 255, hi = 0, same = true
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((y * 2 + dy) * W + x * 2 + dx) * 3
        const l = raw[i] * 0.3 + raw[i + 1] * 0.59 + raw[i + 2] * 0.11
        lo = Math.min(lo, l); hi = Math.max(hi, l)
        if (Math.abs(raw[i] - first[0]) > 4 || Math.abs(raw[i + 1] - first[1]) > 4 || Math.abs(raw[i + 2] - first[2]) > 4) same = false
        if (Math.abs(raw[i] - 0xee) < 4 && Math.abs(raw[i + 1] - 0xf1) < 4 && Math.abs(raw[i + 2] - 0xf5) < 4) bgCells += 0.25
      }
      if (hi - lo < 3) flatCells++
      if (!same) rowFlat = false
    }
    run = rowFlat ? run + GRID : 0
    band = Math.max(band, run)
  }
  return { band, flat: flatCells / (cols * rows), editorBg: bgCells / (cols * rows) }
}
/** Which animation frame a picture shows, read off the stamp in its corner (-1: before the press). */
async function stampOf(data, h) {
  const px = await sharp(data).extract({ left: 6, top: h - 9, width: 12, height: 6 }).resize(1, 1).removeAlpha().raw().toBuffer()
  if (px[2] < 100) return -1
  const a = Math.round((px[0] - 16) / 32), b = Math.round((px[1] - 16) / 32)
  const c = Math.round((px[2] - 120) / 45)
  return Math.max(0, Math.min(7, a)) + 8 * Math.max(0, Math.min(7, b)) + 64 * Math.max(0, Math.min(3, c))
}
async function meanDiff(a, b, box, scale) {
  const crop = async (d) => {
    const meta = await sharp(d).metadata()
    const left = Math.max(0, Math.round(box.l * scale)), top = Math.max(0, Math.round(box.t * scale))
    return sharp(d).extract({ left, top, width: Math.max(1, Math.min(meta.width - left, Math.round((box.r - box.l) * scale))), height: Math.max(1, Math.min(meta.height - top, Math.round((box.b - box.t) * scale))) }).resize(96, 24, { fit: "fill" }).removeAlpha().raw().toBuffer()
  }
  const x = await crop(a), y = await crop(b)
  let d = 0
  for (let i = 0; i < x.length; i++) d += Math.abs(x[i] - y[i])
  return d / x.length / 255
}
async function sheet(shots, press, file, label) {
  const tw = 360
  const meta = await sharp(shots[0].data).metadata()
  const th = Math.round((meta.height / meta.width) * tw)
  const per = 6
  const cells = []
  for (const s of shots) {
    const t = (s.n === undefined || s.n < 0 ? "pre" : "#" + s.n) + " " + Math.round(s.wall - press)
    const img = await sharp(s.data).resize(tw, th).png().toBuffer()
    const tag = Buffer.from(`<svg width="${tw}" height="18" xmlns="http://www.w3.org/2000/svg"><rect width="${tw}" height="18" fill="#000" opacity="0.75"/><text x="4" y="13" font-family="monospace" font-size="12" fill="#fff">${t}ms ${s.note ?? ""}</text></svg>`)
    cells.push(await sharp(img).composite([{ input: tag, top: 0, left: 0 }]).png().toBuffer())
  }
  const rowsN = Math.ceil(cells.length / per)
  const title = Buffer.from(`<svg width="${tw * per}" height="24" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="24" fill="#fff"/><text x="6" y="17" font-family="monospace" font-size="14" fill="#000">${label.replace(/[<&>]/g, "")}</text></svg>`)
  const base = sharp({ create: { width: tw * per, height: rowsN * (th + 4) + 24, channels: 3, background: "#fff" } })
  await base.composite([{ input: title, top: 0, left: 0 }, ...cells.map((c, i) => ({ input: c, top: 24 + Math.floor(i / per) * (th + 4), left: (i % per) * tw }))]).png().toFile(file)
}

/* ── reading a switch ─────────────────────────────────────────────────────── */
function oneWay(values) {
  const v = values.filter((x) => x !== null && x !== undefined)
  if (v.length < 2) return 0
  const dir = Math.sign(v[v.length - 1] - v[0])
  let back = 0
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1]
    if (dir === 0 ? Math.abs(d) > 0.5 : dir * d < -0.5) back = Math.max(back, Math.abs(d))
  }
  return Math.round(back * 10) / 10
}
function biggestStepOver(values, k = 4) {
  /* A step bigger than k times the steps on either side of it, and over 8px: a jump in an otherwise even motion. */
  let worst = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i] === null || values[i - 1] === null) continue
    const d = Math.abs(values[i] - values[i - 1])
    const around = [values[i - 1] - (values[i - 2] ?? values[i - 1]), (values[i + 1] ?? values[i]) - values[i]].map(Math.abs)
    if (d > 8 && d > k * Math.max(1, ...around)) worst = Math.max(worst, d)
  }
  return Math.round(worst)
}

async function analyse(rec, frameFilm, shots, pressWall, againWall, dir, name, scale) {
  const f = rec.film.filter((x) => x.t >= 0)
  const pre = rec.film[0]
  const last = f[f.length - 1]
  /* The motion ends at the last frame anything of the switch is still animating. */
  let lastMoving = -1
  for (let i = 0; i < f.length; i++) if (f[i].moving > 0) lastMoving = i
  const motion = lastMoving >= 0 ? f.slice(0, lastMoving + 1) : f
  const atEnd = lastMoving >= 0 && lastMoving + 1 < f.length ? f[lastMoving + 1] : last
  const W = (x) => x.card.r - x.card.l, H = (x) => x.card.b - x.card.t
  /* Card edges and size, one way only (a turn round is allowed one change of direction). */
  const turn = !!againWall
  const split = turn ? f.findIndex((x) => x.wall >= againWall) : -1
  const legs = turn && split > 0 ? [f.slice(0, split + 1), f.slice(split)] : [f]
  const cardBack = Math.max(...legs.map((leg) => Math.max(oneWay(leg.map((x) => x.card.l)), oneWay(leg.map((x) => x.card.r)), oneWay(leg.map(W)), oneWay(leg.map(H)))))
  const panelBack = Math.max(...legs.map((leg) => oneWay(leg.map((x) => x.panel?.l ?? null))))
  const cardJump = Math.max(biggestStepOver(f.map((x) => x.card.l)), biggestStepOver(f.map((x) => x.card.r)), biggestStepOver(f.map(H)))
  /* Stalls: the card or the fold not moving for more than two frames while the switch is still under way. */
  let stall = 0, run = 0
  for (let i = 1; i < motion.length; i++) {
    const same = Math.abs(W(motion[i]) - W(motion[i - 1])) < 0.2 && Math.abs(H(motion[i]) - H(motion[i - 1])) < 0.2 && Math.abs((motion[i].fold ?? 0) - (motion[i - 1].fold ?? 0)) < 0.2
    run = same ? run + 1 : 0
    stall = Math.max(stall, run)
  }
  const gaps = f.slice(1).map((x, i) => x.t - f[i].t)
  /* The element under the eye. */
  const eyes = f.map((x) => x.eye)
  const eyeJump = biggestStepOver(eyes)
  const eyeEnd = atEnd.eye !== null && motion.length && motion[motion.length - 1].eye !== null ? Math.round(Math.abs(last.eye - motion[motion.length - 1].eye)) : null
  const eyeDrift = pre.eye !== null && last.eye !== null ? Math.round(last.eye - pre.eye) : null
  const cardEnd = motion.length ? Math.round(Math.max(Math.abs(last.card.l - motion[motion.length - 1].card.l), Math.abs(last.card.r - motion[motion.length - 1].card.r), Math.abs(H(last) - H(motion[motion.length - 1])))) : 0
  const topbarMoved = Math.round(Math.max(...f.map((x) => Math.abs(x.topbar.t - f[0].topbar.t) + Math.abs(x.topbar.b - f[0].topbar.b))))
  const bars = new Set(f.map((x) => x.bar)).size > 1
  /* After the card has landed, the scroll must not move by itself, and nothing on screen may move. */
  const settled = f.slice(lastMoving + 1)
  const scrollAfter = settled.length ? Math.max(...settled.map((x) => Math.abs(x.scrollTop - settled[0].scrollTop))) : 0
  const eyeAfter = settled.length && settled[0].eye !== null ? Math.max(...settled.map((x) => (x.eye === null ? 0 : Math.abs(x.eye - settled[0].eye)))) : 0
  const heldFrames = f.filter((x) => x.heldPx > 0 || x.skippedPx > 0).length
  const heldMax = Math.max(0, ...f.map((x) => x.heldPx + x.skippedPx))
  const undrawn = Math.max(0, ...f.map((x) => x.undrawn))
  const remounted = Math.max(0, ...f.map((x) => x.remounted + x.newFrames))
  const opacities = { card: Math.min(...f.map((x) => x.cardOpacity)), page: Math.min(...f.map((x) => x.content)), sidebar: Math.min(...f.filter((x) => x.panel && x.panel.r > x.panel.l + 4 && x.fold > 4).map((x) => x.panelOpacity ?? 1), 1), bar: Math.min(...f.map((x) => x.topbarOpacity)) }
  const pillO = f.map((x) => x.pill?.o ?? null).filter((x) => x !== null)
  const pillFade = pillO.some((o) => o > 0.02 && o < 0.98)
  const radii = [...new Set(f.map((x) => x.radius))]
  /* Inside an imported theme's frame. */
  let frame = null
  if (frameFilm && frameFilm.length) {
    const ff = frameFilm
    frame = {
      frames: ff.length,
      widths: `${ff[0].w}->${ff[ff.length - 1].w}`,
      heightLag: 0,
      scrollJump: biggestStepOver(ff.map((x) => x.y)),
      eyeJump: biggestStepOver(ff.map((x) => x.eye)),
      eyeDrift: ff[0].eye !== null && ff[ff.length - 1].eye !== null ? Math.round(ff[ff.length - 1].eye - ff[0].eye) : null,
      heldPx: Math.max(0, ...ff.map((x) => x.heldPx)),
      undrawn: Math.max(0, ...ff.map((x) => x.undrawn)),
      fades: Math.max(0, ...ff.map((x) => x.fades)),
      remounted: Math.max(0, ...ff.map((x) => x.remounted)),
      bars: new Set(ff.map((x) => x.bar)).size > 1,
    }
    /* The frame's height against the card's at the same moment: a frame shorter than the card shows what is behind it. */
    let lag = 0
    for (const x of ff) {
      const c = f.reduce((best, y) => (Math.abs(y.wall - x.wall) < Math.abs(best.wall - x.wall) ? y : best), f[0])
      lag = Math.max(lag, Math.abs(H(c) - x.h), Math.abs(W(c) - x.w - (c.bar ?? 0)))
    }
    frame.heightLag = Math.round(lag)
  }
  /* The screencast. */
  let pix = null
  if (shots.length) {
    const H0 = (await sharp(shots[0].data).metadata()).height
    for (const s of shots) s.n = await stampOf(s.data, H0)
    /* Frames are matched by their stamp; the screencast's own clock runs behind the page's. */
    const byN = new Map(rec.film.map((y) => [y.n, y]))
    const nearN = (s) => byN.get(s.n) ?? rec.film[0]
    const before = shots.filter((s) => s.n === -1).pop() ?? shots[0]
    const pressIdx = shots.indexOf(before)
    const after = shots[shots.length - 1]
    for (let i = 0; i < shots.length; i++) shots[i].wall = i <= pressIdx ? pressWall - 1 - (pressIdx - i) : (nearN(shots[i]).wall)
    const fb = await flatness(before.data, rec.film[0].card, scale)
    const fa = await flatness(after.data, last.card, scale)
    let blank = 0, worstBand = 0, bgFrames = 0, chrome = 0
    const topbarBox = { l: 0, t: 0, r: pre.card ? f[0].topbar.r : 1440, b: f[0].topbar.b }
    for (const s of shots) {
      if (s.wall < pressWall) continue
      const at = nearN(s)
      const fl = await flatness(s.data, at.card, scale)
      const band = fl.band - Math.max(fb.band, fa.band)
      const isBlank = band > 48 || fl.flat > Math.max(fb.flat, fa.flat) + 0.12
      const isBg = fl.editorBg > Math.max(fb.editorBg, fa.editorBg) + 0.03
      if (isBlank) blank++
      if (isBg) bgFrames++
      worstBand = Math.max(worstBand, band)
      s.note = `${isBlank ? "BLANK " : ""}${isBg ? "BG " : ""}band ${Math.round(fl.band)} flat ${fl.flat.toFixed(2)}`
      /* The bar, but not the two buttons that change their own icon. */
      const sw = f[0].sw
      const left = { ...topbarBox, r: sw ? sw.l - 8 : topbarBox.r / 2 }
      const right = { ...topbarBox, l: sw ? sw.r + 48 : topbarBox.r / 2 }
      const d = Math.max(await meanDiff(before.data, s.data, left, scale), await meanDiff(before.data, s.data, right, scale))
      if (d > 0.02) chrome++
    }
    /* The last frame of the motion against the page at rest. */
    const lastMotionWall = motion.length ? motion[motion.length - 1].wall : pressWall
    const lastMotionShot = shots.filter((s) => s.wall <= lastMotionWall + 1).pop()
    const endPop = lastMotionShot ? Math.round((await meanDiff(lastMotionShot.data, after.data, last.card, scale)) * 1000) / 1000 : null
    pix = { shots: shots.filter((s) => s.wall >= pressWall).length, blank, worstBand: Math.round(worstBand), editorBgInCard: bgFrames, chromeChanged: chrome, endPop }
    if (SHEETS) {
      const file = join(dir, `${name.replace(/[^a-z0-9]+/gi, "-")}.png`)
      await sheet(shots.filter((s) => s.wall >= pressWall - 200), pressWall, file, `${name}  ${dir.split("/").pop()}`)
      pix.sheet = file
    }
  }
  return {
    frames: f.length, motionFrames: motion.length, longestGapMs: Math.max(0, ...gaps), stallFrames: stall,
    blankHeldFrames: heldFrames, heldPxMax: heldMax, undrawnImages: undrawn, remounted,
    fades: rec.fades, opacities, pillFade, radii,
    cardBack, panelBack, cardJump, topbarMoved, scrollbarChanged: bars,
    eyeJump, eyeEnd, eyeDrift, eyeAfter: Math.round(eyeAfter), scrollAfter, cardEnd,
    frame, pix,
  }
}
function verdict(r) {
  const bad = []
  if (r.blankHeldFrames) bad.push(`held sections in view ${r.blankHeldFrames} frames (${r.heldPxMax}px)`)
  if (r.pix?.blank) bad.push(`blank ${r.pix.blank} shots (band ${r.pix.worstBand}px)`)
  if (r.pix?.editorBgInCard) bad.push(`editor grey inside the card ${r.pix.editorBgInCard} shots`)
  if (r.pix?.chromeChanged) bad.push(`bar changed ${r.pix.chromeChanged} shots`)
  if (Object.keys(r.fades).length) bad.push(`fades ${Object.keys(r.fades).join(" ")}`)
  if (r.opacities.card < 0.99 || r.opacities.page < 0.99 || r.opacities.sidebar < 0.99 || r.opacities.bar < 0.99) bad.push(`opacity ${JSON.stringify(r.opacities)}`)
  if (r.pillFade) bad.push("Ask pill faded")
  if (r.cardBack > 1) bad.push(`card went back ${r.cardBack}px`)
  if (r.panelBack > 1) bad.push(`sidebar went back ${r.panelBack}px`)
  if (r.cardJump) bad.push(`card jumped ${r.cardJump}px`)
  if (r.topbarMoved) bad.push(`bar moved ${r.topbarMoved}px`)
  if (r.scrollbarChanged) bad.push("scrollbar came or went")
  if (r.eyeJump) bad.push(`content under the eye jumped ${r.eyeJump}px`)
  if ((r.eyeEnd ?? 0) > 2) bad.push(`end jump ${r.eyeEnd}px`)
  if (r.eyeAfter > 2) bad.push(`moved after landing ${r.eyeAfter}px`)
  if (r.cardEnd > 2) bad.push(`card snapped at the end ${r.cardEnd}px`)
  if (r.remounted) bad.push(`remounted ${r.remounted}`)
  if (r.undrawnImages) bad.push(`pictures not drawn ${r.undrawnImages}`)
  if (r.stallFrames > 2) bad.push(`stalled ${r.stallFrames} frames`)
  if (r.frame) {
    if (r.frame.heightLag > 2) bad.push(`theme frame off the card by ${r.frame.heightLag}px`)
    if (r.frame.heldPx) bad.push(`theme sections held in view ${r.frame.heldPx}px`)
    if (r.frame.eyeJump) bad.push(`theme content jumped ${r.frame.eyeJump}px`)
    if (r.frame.scrollJump) bad.push(`theme scroll jumped ${r.frame.scrollJump}px`)
    if (r.frame.remounted) bad.push(`theme sections remounted ${r.frame.remounted}`)
    if (r.frame.undrawn) bad.push(`theme pictures not drawn ${r.frame.undrawn}`)
    if (r.frame.bars) bad.push("theme scrollbar came or went")
  }
  return bad
}

/* ── the switches ─────────────────────────────────────────────────────────── */
const DEV = "[data-wb-device-switch]", FULL = "[data-wb-full-toggle]"
const state = (p) => p.evaluate(() => ({ device: document.querySelector("[data-wb-device-switch]")?.getAttribute("data-wb-device"), full: document.querySelector("[data-wb-full-toggle]")?.getAttribute("aria-pressed") }))
const STEPS = [
  ["desktop to phone", DEV, null, (s) => s.device === "mobile"],
  ["phone to desktop", DEV, null, (s) => s.device === "desktop"],
  ["desktop into full screen", FULL, null, (s) => s.full === "true"],
  ["full screen to desktop", FULL, null, (s) => s.full === "false"],
  ["desktop into full screen again", FULL, null, (s) => s.full === "true"],
  ["full screen out by Escape", "Escape", null, (s) => s.full === "false"],
  ["desktop to phone, for the next", DEV, null, (s) => s.device === "mobile"],
  ["phone into full screen", FULL, null, (s) => s.full === "true" && s.device === "desktop"],
  ["full screen out by the size switch", DEV, null, (s) => s.full === "false" && s.device === "desktop"],
  ["desktop to phone, turned round at 140ms", DEV, [DEV, 140], (s) => s.device === "desktop"],
  ["into full screen, turned round at 140ms", FULL, [FULL, 140], (s) => s.full === "false"],
]

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] })
const table = []
let failures = 0
try {
  for (const setup of SETUPS) for (const [w, h] of SIZES) for (const scroll of SCROLLS) for (const cpu of CPUS) {
    const run = `${setup}-${w}x${h}-${scroll}-cpu${cpu}`
    const dir = join(OUT, run)
    mkdirSync(dir, { recursive: true })
    console.log(`\n=== ${run}`)
    currentSetup = setup
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)))
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
    await page.setRequestInterception(true)
    page.on("request", (req) => {
      const u = req.url()
      if (u.startsWith("https://example.invalid/")) picture(u).then((body) => req.respond({ status: 200, contentType: "image/jpeg", body, headers: { "Cache-Control": "public, max-age=3600" } }))
      else req.continue()
    })
    await page.goto(origin, { waitUntil: "load" })
    await page.evaluate(() => { try { sessionStorage.removeItem("wb:full-screen") } catch {} })
    if (setup === "native") await page.waitForFunction((n) => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= n, { timeout: 60_000 }, NATIVE.length - 4)
    else await page.waitForSelector("[data-compat-frame='front']", { timeout: 90_000 })
    await page.waitForFunction(() => !!document.querySelector("[data-code-pane]"), { timeout: 20_000 }).catch(() => {})
    await sleep(3500)
    await page.evaluate(RECORDER)
    const frameOf = async () => {
      if (setup !== "compat") return null
      const el = await page.$("[data-compat-frame='front']")
      const fr = el ? await el.contentFrame() : null
      if (fr) await fr.evaluate(FRAME_RECORDER).catch(() => {})
      return fr
    }
    let fr = await frameOf()
    if (scroll === "middle") {
      if (setup === "native") await page.evaluate(() => { const r = document.getElementById("wb-preview-root"); r.scrollTop = Math.round((r.scrollHeight - r.clientHeight) / 2) })
      else if (fr) await fr.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) / 2)))
      await sleep(1200)
    }
    const cdp = await page.createCDPSession()
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    for (const [name, press, again, ok] of STEPS) {
      if (ONLY && !ONLY.some((o) => name.includes(o))) {
        /* Still pressed, so the next step starts where it expects. */
        await page.evaluate((sel) => { if (sel === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); else document.querySelector(sel).click() }, press)
        if (again) { await sleep(again[1]); await page.evaluate((sel) => document.querySelector(sel).click(), again[0]) }
        await sleep(1600)
        continue
      }
      await page.mouse.move(w - 5, h - 5)
      await sleep(900)
      fr = await frameOf()
      const shots = []
      const onShot = (e) => {
        shots.push({ wall: e.metadata.timestamp * 1000, data: Buffer.from(e.data, "base64") })
        cdp.send("Page.screencastFrameAck", { sessionId: e.sessionId }).catch(() => {})
      }
      cdp.on("Page.screencastFrame", onShot)
      await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1, maxWidth: w, maxHeight: h })
      await sleep(300)
      const framePromise = fr ? fr.evaluate((ms) => window.__vsfFrame(ms), RECORD_MS).catch(() => null) : Promise.resolve(null)
      const rec = await page.evaluate((ms, p, a) => window.__vsfStart(ms, p, a), RECORD_MS, press, again)
      const frameFilm = await framePromise
      const walls = await page.evaluate(() => ({ press: window.__vsfPressWall, again: window.__vsfAgainWall ?? null }))
      await page.evaluate(() => { window.__vsfAgainWall = undefined })
      await sleep(150)
      await cdp.send("Page.stopScreencast")
      cdp.off("Page.screencastFrame", onShot)
      shots.sort((a, b) => a.wall - b.wall)
      const s = await state(page)
      const r = await analyse(rec, frameFilm, shots, walls.press, walls.again, dir, name, 1)
      const bad = verdict(r)
      if (!ok(s)) bad.unshift(`landed wrong ${JSON.stringify(s)}`)
      if (bad.length) failures++
      table.push({ run, name, r, bad })
      console.log(`  ${bad.length ? "BAD " : "ok  "} ${name.padEnd(40)} ${bad.join("; ") || "clean"}`)
      console.log(`        frames ${r.frames} motion ${r.motionFrames} gap ${r.longestGapMs}ms stall ${r.stallFrames}  eye drift ${r.eyeDrift} jump ${r.eyeJump} end ${r.eyeEnd} after ${r.eyeAfter}  card end ${r.cardEnd}  held ${r.heldPxMax}px  shots ${r.pix?.shots} blank ${r.pix?.blank} band ${r.pix?.worstBand} endPop ${r.pix?.endPop}  radii ${r.radii.join(",")}${r.frame ? `  frame ${JSON.stringify(r.frame)}` : ""}`)
      if (process.env.VSF_FILM === "1") for (const x of rec.film) console.log(`          ${x.t} card ${x.card?.l}-${x.card?.r} x ${x.card?.t}-${x.card?.b} scroll ${x.scrollTop} eye ${x.eye} sec ${x.section} held ${x.heldPx} skip ${x.skippedPx} moving ${x.moving} fold ${x.fold} panel ${x.panel?.l} o ${x.panelOpacity}`)
    }
    if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    if (errors.length) console.log("  page errors:", errors.slice(0, 3))
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
  imgServer.close()
}
writeFileSync(join(OUT, "results.json"), JSON.stringify(table, null, 1))
console.log(`\n${table.length} switches, ${failures} with something wrong. Sheets and results.json in ${OUT}`)
process.exit(failures ? 1 : 0)
