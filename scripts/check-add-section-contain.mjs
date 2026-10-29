/**
 * ===========================================================================
 *  ADD A SECTION: NOTHING IN A CARD PAINTS OUTSIDE IT, NO CARD OVER ANOTHER
 * ===========================================================================
 * Round 45, the owner (desktop, Add a section, Hero and banners): a Before /
 * After section's labels, halves and arrow drawn over the cards above and
 * below it, a hero ("Headline goes here", its "Pause gallery" button) drawn
 * over another card, and a hero product card cut and out of line.
 *
 * The real editor (scripts/editor-probe-harness.mjs), on the default theme
 * and on imported theme fixtures, at 1280 and 390. For every category, every
 * card is scrolled to and, once its picture is in, every element painted in
 * it (and its ::before and ::after, placed from their own computed insets) is
 * held against the card's picture box:
 *
 *   PAINTED is the element's box cut by every box that clips it on the way
 *   up its containing blocks (an absolute element is not cut by an ancestor
 *   between it and the box it is placed against, a fixed one only by what
 *   holds fixed boxes), the way the browser cuts it. For an imported theme
 *   the picture is in the cards' frame, and the frame's box is a cut too.
 *   Anything painted more than 0.5px past the card's box is a violation.
 *
 *   No two cards in the list overlap, and an imported theme's section sits
 *   exactly on its card (its top left and its height).
 *
 * Then the same again with every height this browser remembered made wrong
 * (three times too tall, or 12px), to show a stale height cannot mis-size or
 * misplace a card. Screenshots of every category.
 *
 *   node scripts/check-add-section-contain.mjs
 *   THEMES=native,tests/fixtures/shopify-escape SIZES=1280 node scripts/check-add-section-contain.mjs
 *   SHOTS=/path JSON=/path/out.json ...
 */
import { createServer } from "node:http"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import JSZip from "jszip"
import { bundle, css, CHROMIUM, root } from "./editor-probe-harness.mjs"

const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-add-section-contain")
mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SIZES = (process.env.SIZES ?? "1280,390").split(",").map(Number)
const THEMES = (process.env.THEMES ?? "native,native-escape,tests/fixtures/shopify-escape,tests/fixtures/shopify-materia").split(",")

/*
  NATIVE-ESCAPE: the default theme with sections a creator (or Ask Storelib)
  wrote that try every way out of a box: what the imported fixture
  (tests/fixtures/shopify-escape) does, as .storelib files.
*/
const own = (type, name, template, style) => `<template>${template}</template>
<style scoped>${style}</style>
<schema>${JSON.stringify({ schema_version: 1, type, name, category: "hero", settings: [{ type: "text", id: "heading", label: "Heading", default: name }], presets: [{ name, settings: { heading: name } }] })}</schema>`
const ESCAPES = {
  "sections/own_before_after.storelib": own("own_before_after", "Before / After", `<section class="ba"><h2>{{ settings.heading }}</h2><div class="st"><div class="h b"><span class="lb">Before</span></div><div class="h a"><span class="lb la">After</span></div></div><svg class="ar" viewBox="0 0 100 100"><path d="M10 80 C 30 10, 70 10, 90 60" stroke="#111" stroke-width="4" fill="none"/></svg></section>`,
    `.ba { padding: 40px 0; text-align: center; } .st { display: flex; width: 80%; margin: 0 auto; } .h { flex: 1; height: 260px; } .b { background: #d9c7b8; margin-top: -180px; } .a { background: #8fb3a5; transform: translateY(240px) scale(1.4); z-index: 9999; position: relative; } .lb { position: absolute; top: -90px; left: 8px; background: #111; color: #fff; padding: 4px 10px; z-index: 99999; } .la { top: auto; bottom: -400px; left: auto; right: -300px; } .ar { position: absolute; left: 50%; top: -260px; width: 360px; height: 360px; } .ba::before { content: ""; position: absolute; inset: -500px; border: 6px solid rgb(255, 0, 200); } .ba::after { content: "After"; position: fixed; bottom: -40px; right: -40px; background: rgb(255, 0, 200); padding: 20px; }`),
  "sections/own_slideshow.storelib": own("own_slideshow", "Headline goes here", `<section class="hs"><h1>{{ settings.heading }}</h1><div class="sl"></div><button class="pa" type="button" aria-label="Pause gallery">Pause gallery</button><div class="dt"></div></section>`,
    `.hs { height: 100vh; min-height: 100dvh; background: #1f2a44; color: #fff; display: flex; align-items: center; justify-content: center; } .sl { position: absolute; top: 0; left: 100%; width: 100vw; height: 100vh; background: #3b4a6b; } .pa { position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; padding: 10px 16px; background: #fff; color: #111; border: 0; } .dt { position: fixed; top: 0; left: 0; width: 100vw; height: 12px; background: rgb(255, 0, 200); }`),
  "sections/own_hero_product.storelib": own("own_hero_product", "Hero Product Section Placeholder", `<section class="hp"><div class="in"><div class="md"></div><div><span class="bd"></span><h2 class="tt">{{ settings.heading }}</h2></div></div></section>`,
    `.hp { width: 100vw; margin-left: calc(50% - 50vw); margin-top: -120px; margin-bottom: -120px; padding: 160px 0; background: #f4efe6; } .in { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; } .md { height: 320px; background: #c9b79c; } .bd { position: absolute; top: -60px; left: -60px; width: 140px; height: 140px; border-radius: 50%; background: rgb(255, 0, 200); } .tt { margin-left: -400px; white-space: nowrap; font-size: 64px; }`),
  "sections/own_fixed_bar.storelib": own("own_fixed_bar", "Fixed bar", `<section class="fb"><p>{{ settings.heading }}</p><div class="bar"></div></section>`,
    `.fb { padding: 30px 0; background: #fff7d6; } .bar { position: fixed; top: 0; left: 0; right: 0; height: 2000px; z-index: 99999; background: rgba(255, 0, 200, 0.6); }`),
}
const STALE = process.env.STALE !== "0"

/* The importer, bundled for node on the spot (it is TypeScript). */
const convertOut = join(mkdtempSync(join(tmpdir(), "storelib-convert-")), "convert.mjs")
execFileSync("npx", ["--no-install", "esbuild", join(root, "lib/storelib-theme/shopify/convert.ts"), "--bundle", "--platform=node", "--format=esm", "--log-level=error", `--alias:@=${root}`, `--outfile=${convertOut}`, "--banner:js=import{createRequire as __cr}from'module';const require=__cr(import.meta.url);"], { stdio: ["ignore", "ignore", "inherit"] })
const { convertShopifyTheme } = await import(convertOut)

async function compatOf(folder) {
  const zip = new JSZip()
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(folder, p), readFileSync(p))
    }
  }
  walk(folder)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  const sources = Object.fromEntries(Object.entries(r.theme.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(r.theme.files).filter(([p, t]) => p.startsWith("shopify/") && !t.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  return { name: r.theme.name, compat: { settings: r.theme.settings, pages, sources, files }, assets: r.theme.files }
}

const js = readFileSync(bundle)
let current = { compat: null, assets: {} }
const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  if (url.pathname === "/editor-probe.js") {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
  if (asset) {
    const name = decodeURIComponent(asset[1])
    const text = current.assets[`shopify/assets/${name}`]
    if (text === undefined) { res.writeHead(404); return res.end() }
    const type = name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : name.endsWith(".svg") ? "image/svg+xml" : "text/plain"
    res.writeHead(200, { "content-type": type, "access-control-allow-origin": "*" })
    return res.end(text.startsWith("base64:") ? Buffer.from(text.slice(7), "base64") : text)
  }
  if (url.pathname === "/") {
    const globals = current.compat ? `window.PROBE_COMPAT=${JSON.stringify(current.compat).replace(/</g, "\\u003c")};` : current.files ? `window.PROBE_FILES=${JSON.stringify(current.files).replace(/</g, "\\u003c")};` : ""
    res.writeHead(200, { "content-type": "text/html" })
    return res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;${globals}</script><script src="/editor-probe.js"></script></body></html>`)
  }
  res.writeHead(404)
  res.end()
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"], protocolTimeout: 600_000 })

/* ── In the page ─────────────────────────────────────────────────────────── */

const IN_PAGE = String.raw`
window.__contain = (() => {
  const TOL = 0.5
  const styles = new Map()
  const cs = (el, pseudo) => {
    const k = pseudo ? null : el
    if (k && styles.has(k)) return styles.get(k)
    const s = el.ownerDocument.defaultView.getComputedStyle(el, pseudo || null)
    if (k) styles.set(k, s)
    return s
  }
  const holdsFixed = (s) => s.transform !== "none" || s.perspective !== "none" || s.filter !== "none" || (s.backdropFilter && s.backdropFilter !== "none") || /paint|layout|strict|content/.test(s.contain) || s.contentVisibility === "auto" || /transform|perspective|filter/.test(s.willChange) || (s.containerType && s.containerType !== "normal")
  /* The box a child of 'from' with this position is placed against (null: the window). */
  const cbFrom = (from, pos) => {
    if (pos !== "absolute" && pos !== "fixed") return from
    for (let a = from; a; a = a.parentElement) {
      const s = cs(a)
      if (pos === "fixed" ? holdsFixed(s) : s.position !== "static" || holdsFixed(s)) return a
    }
    return null
  }
  const clips = (s) => s.overflowX !== "visible" || s.overflowY !== "visible" || /paint|strict|content/.test(s.contain) || s.contentVisibility === "auto"
  const padBox = (a) => {
    const r = a.getBoundingClientRect()
    const k = a.offsetWidth ? r.width / a.offsetWidth : 1
    return { left: r.left + a.clientLeft * k, top: r.top + a.clientTop * k, right: r.left + (a.clientLeft + a.clientWidth) * k, bottom: r.top + (a.clientTop + a.clientHeight) * k }
  }
  const cut = (r, c) => ({ left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) })
  /* r cut by every box that clips it, starting at the box it is placed against. */
  const painted = (r, cb, stopAt) => {
    let a = cb
    while (a) {
      const s = cs(a)
      if (clips(s)) r = cut(r, padBox(a))
      if (a === stopAt) return r
      a = cbFrom(a.parentElement, s.position)
    }
    return r
  }
  const seen = (el) => {
    for (let a = el; a; a = a.parentElement) { const s = cs(a); if (s.display === "none" || parseFloat(s.opacity) < 0.01) return false }
    return cs(el).visibility !== "hidden"
  }
  const px = (v) => (v === "auto" || v === "" ? NaN : parseFloat(v))
  /* Every painted box of every element under 'top', in the coordinates of the document 'top' is in. */
  const boxesUnder = (top, stopAt) => {
    const out = []
    for (const el of [top, ...top.querySelectorAll("*")]) {
      if (!seen(el)) continue
      const s = cs(el)
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        const cb = cbFrom(el.parentElement, s.position)
        out.push({ el, what: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""), r: cb ? painted({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }, cb, stopAt) : r, raw: r })
      }
      for (const pseudo of ["::before", "::after"]) {
        const p = cs(el, pseudo)
        if (!p.content || p.content === "none" || p.content === "normal" || p.display === "none" || p.visibility === "hidden" || parseFloat(p.opacity) < 0.01) continue
        if (p.position !== "absolute" && p.position !== "fixed") continue
        const cb = cbFrom(el, p.position)
        const win = el.ownerDocument.defaultView
        const base = cb ? padBox(cb) : { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight }
        const k = cb && cb.clientWidth ? (base.right - base.left) / cb.clientWidth : 1
        const W = (base.right - base.left) / k, H = (base.bottom - base.top) / k
        let w = px(p.width), h = px(p.height)
        const L = px(p.left), T = px(p.top), R = px(p.right), B = px(p.bottom)
        if (!(w >= 0)) w = !isNaN(L) && !isNaN(R) ? W - L - R : 0
        if (!(h >= 0)) h = !isNaN(T) && !isNaN(B) ? H - T - B : 0
        const x = !isNaN(L) ? L : !isNaN(R) ? W - R - w : 0
        const y = !isNaN(T) ? T : !isNaN(B) ? H - B - h : 0
        const raw = { left: base.left + x * k, top: base.top + y * k, right: base.left + (x + w) * k, bottom: base.top + (y + h) * k }
        if (raw.right - raw.left <= 0 || raw.bottom - raw.top <= 0) continue
        out.push({ el, what: el.tagName.toLowerCase() + pseudo, r: cb ? painted(raw, cb, stopAt) : raw, raw })
      }
    }
    return out
  }
  const outside = (r, box) => r.right - r.left > TOL && r.bottom - r.top > TOL && (r.left < box.left - TOL || r.top < box.top - TOL || r.right > box.right + TOL || r.bottom > box.bottom + TOL)
  const fmt = (r) => [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)).join(",")

  const lib = () => {
    const l = document.querySelector("[data-section-library]")
    if (!l) return null
    const phone = l.getAttribute("data-section-library") === "phone"
    return { lib: l, phone, scroller: l.querySelector("[data-library-scroll]"), pills: [...l.querySelectorAll(phone ? ".wb-chip" : "nav button")] }
  }
  const nameOf = (c) => c.getAttribute("data-library-card") + ":" + c.getAttribute("data-preset")
  const ready = (c) => {
    const box = c.querySelector("[data-preview-box]")
    if (!box) return true
    const st = box.getAttribute("data-compat-preview-state")
    if (st) return st !== "waiting"
    return !!box.querySelector("[data-keep-transform]") || !!box.querySelector("[data-preview-fallback]")
  }
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))

  /* One card, against its own box. */
  function audit(card) {
    styles.clear()
    const box = card.querySelector("[data-preview-box]")
    const b = box.getBoundingClientRect()
    const res = { name: nameOf(card), box: [Math.round(b.width), Math.round(b.height)], escaped: [], checked: 0, misplaced: null, sizeOff: null }
    const compat = box.hasAttribute("data-compat-preview")
    if (!compat) {
      const inner = box.querySelector("[data-keep-transform]")
      if (inner) {
        for (const x of boxesUnder(inner, box)) { res.checked++; if (outside(x.r, b)) res.escaped.push(x.what + " " + fmt(x.r)) }
        const sec = inner.firstElementChild
        if (sec) {
          const sh = sec.getBoundingClientRect().height
          const crop = Math.round(b.width * (window.innerWidth < 640 ? 1.22 : 0.56))
          res.sizeOff = Math.round(b.height - Math.min(crop, Math.max(80, Math.ceil(sh))))
        }
      }
      return res
    }
    const f = document.querySelector("iframe[data-compat-sheet]")
    const doc = f && f.contentDocument
    const w = doc && doc.querySelector('[data-sl-pv="' + card.getAttribute("data-library-card") + ":" + card.getAttribute("data-preset") + '"]')
    if (!w || box.getAttribute("data-compat-preview-state") !== "shown") return res
    const fr = f.getBoundingClientRect()
    const k = f.offsetWidth ? fr.width / f.offsetWidth : 1
    const fb = padBox(f)
    const toPage = (r) => ({ left: fr.left + r.left * k, top: fr.top + r.top * k, right: fr.left + r.right * k, bottom: fr.top + r.bottom * k })
    /* The card's own box in the frame (round 45: <sl-card>), or the section's <main> before it. */
    const cardBox = w.parentElement && w.parentElement.localName === "sl-card" ? w.parentElement : w
    for (const x of boxesUnder(cardBox, null)) {
      res.checked++
      const r = cut(toPage(x.r), fb)
      if (outside(r, b)) res.escaped.push(x.what + " " + fmt(r))
    }
    const wr = toPage(cardBox.getBoundingClientRect())
    res.misplaced = Math.round(Math.max(Math.abs(wr.left - b.left), Math.abs(wr.top - b.top), Math.abs((wr.bottom - wr.top) - b.height), Math.abs((wr.right - wr.left) - b.width)) * 10) / 10
    /* As tall as its section, between the floor and the crop (compat-section-preview.tsx). */
    const sec = w.querySelector(".shopify-section") || w.firstElementChild
    if (sec) {
      const sr = toPage(sec.getBoundingClientRect())
      res.sizeOff = Math.round(b.height - Math.max(64, Math.min(Math.round(b.width * 1.1), Math.ceil(sr.bottom - sr.top))))
    }
    return res
  }

  /* Every card shown in the sight of the list: none over another. */
  function overlaps() {
    const L = lib()
    const view = L.scroller.getBoundingClientRect()
    const cards = [...L.lib.querySelectorAll("[data-library-card]")].filter((c) => !c.hidden).map((c) => ({ n: nameOf(c), r: c.getBoundingClientRect() })).filter((c) => c.r.height > 0 && c.r.bottom > view.top && c.r.top < view.bottom).sort((a, b) => a.r.top - b.r.top)
    const out = []
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i].r, c = cards[j].r
      if (Math.min(a.right, c.right) - Math.max(a.left, c.left) > TOL && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > TOL) out.push(cards[i].n + " x " + cards[j].n)
    }
    return out
  }

  async function category(name) {
    const L = lib()
    const pill = L.pills.find((b) => (b.textContent || "").trim().replace(/\d+$/, "").trim() === name)
    if (!pill) return { missing: true }
    pill.click()
    await frame(); await frame()
    const cards = [...L.lib.querySelectorAll("[data-library-card]")].filter((c) => !c.hidden)
    const out = { cards: [], overlaps: [] }
    for (const c of cards) {
      c.scrollIntoView({ block: "center" })
      for (let i = 0; i < 160 && !ready(c); i++) await new Promise((r) => setTimeout(r, 25))
      await frame(); await frame()
      out.cards.push(audit(c))
      for (const o of overlaps()) if (!out.overlaps.includes(o)) out.overlaps.push(o)
    }
    L.scroller.scrollTop = 0
    await frame()
    return out
  }
  return { lib, category, pills: () => lib().pills.map((b) => (b.textContent || "").trim().replace(/\d+$/, "").trim()) }
})()
`

/* ── A run: one theme, one width ─────────────────────────────────────────── */

let failures = 0
const totals = []
async function run(theme, width, stale) {
  const phone = width < 640
  const p = await browser.newPage()
  await p.evaluateOnNewDocument("window.__name = (f) => f")
  await p.setViewport(phone ? { width, height: 844, isMobile: true, hasTouch: true } : { width, height: 800 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e?.message ?? e).slice(0, 160)))
  await p.goto(`${origin}/`, { waitUntil: "domcontentloaded" })
  if (stale) {
    /* Every remembered height made wrong, then the editor opened again on them. */
    const n = await p.evaluate(() => {
      let n = 0
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!/^wb-(compat-)?preview-h/.test(k)) continue
        const all = JSON.parse(localStorage.getItem(k) || "{}")
        let j = 0
        for (const key of Object.keys(all)) { all[key] = j++ % 2 ? 12 : all[key] * 3 + 400; n++ }
        localStorage.setItem(k, JSON.stringify(all))
      }
      return n
    })
    await p.reload({ waitUntil: "domcontentloaded" })
    console.log(`  --    ${n} remembered heights made wrong before this run`)
  }
  await sleep(3500)
  let opened = false
  for (let i = 0; i < 80 && !opened; i++) {
    opened = await p.evaluate(() => {
      const add = document.querySelector("[data-section-group='template'] [data-add-section]") ?? document.querySelector("[data-add-section]")
      if (add) { add.click(); return true }
      const tab = [...document.querySelectorAll("button, [role='tab']")].find((b) => (b.textContent ?? "").trim() === "Sections")
      tab?.click()
      return false
    })
    if (!opened) await sleep(250)
  }
  await p.waitForFunction(() => document.querySelector("[data-section-library] [data-library-scroll]"), { timeout: 20_000 }).catch(() => {})
  await sleep(1200)
  await p.evaluate(IN_PAGE)
  const tag = `${theme.label}-${width}${stale ? "-stale" : ""}`
  const pills = await p.evaluate(() => window.__contain.pills())
  const sum = { tag, cards: 0, elements: 0, escapedCards: 0, escapes: 0, overlaps: 0, misplaced: 0, misSized: 0, categories: pills.length }
  const examples = []
  for (const name of pills) {
    const res = await p.evaluate((n) => window.__contain.category(n), name)
    if (res.missing) continue
    await p.evaluate(() => { const s = document.querySelector("[data-section-library] [data-library-scroll]"); if (s) s.scrollTop = 0 })
    await sleep(250)
    await p.screenshot({ path: join(SHOTS, `contain-${tag}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`) })
    for (const c of res.cards) {
      sum.cards++
      sum.elements += c.checked
      if (c.escaped.length) { sum.escapedCards++; sum.escapes += c.escaped.length; if (examples.length < 12) examples.push(`${name} › ${c.name}: ${c.escaped.slice(0, 3).join(" | ")} (box ${c.box.join("x")})`) }
      if (c.misplaced !== null && c.misplaced > 1) { sum.misplaced++; if (examples.length < 12) examples.push(`${name} › ${c.name}: section ${c.misplaced}px off its card`) }
      if (c.sizeOff !== null && c.sizeOff < -2) { sum.misSized++; if (examples.length < 12) examples.push(`${name} › ${c.name}: card ${-c.sizeOff}px short of its section`) }
    }
    sum.overlaps += res.overlaps.length
    for (const o of res.overlaps.slice(0, 2)) if (examples.length < 12) examples.push(`${name}: cards overlap ${o}`)
  }
  const ok = sum.escapes === 0 && sum.overlaps === 0 && sum.misplaced === 0 && sum.misSized === 0
  if (!ok) failures++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${tag}: ${sum.categories} categories, ${sum.cards} cards, ${sum.elements} painted boxes; ${sum.escapes} painted outside their card (in ${sum.escapedCards} cards), ${sum.overlaps} card overlaps, ${sum.misplaced} sections off their card, ${sum.misSized} cards shorter than their section`)
  for (const e of examples) console.log(`          ${e}`)
  if (errors.length) console.log(`  --    page errors: ${errors.slice(0, 3).join(" | ")}`)
  totals.push(sum)
  return p
}

for (const t of THEMES) {
  if (t === "native") current = { compat: null, assets: {} }
  else if (t === "native-escape") current = { compat: null, assets: {}, files: ESCAPES }
  else {
    const made = await compatOf(join(root, t))
    current = { compat: made.compat, assets: made.assets }
  }
  const label = t.startsWith("native") ? t : t.split("/").pop()
  console.log(`\n══ ${t === "native" ? "The default theme" : t === "native-escape" ? "The default theme, with sections of the creator's that try to get out" : `Imported: ${label}`} ══`)
  for (const width of SIZES) {
    const p = await run({ label }, width, false)
    await p.close()
    if (STALE) {
      /* Same browser profile, so the heights the first run remembered are there to spoil. */
      const q = await run({ label }, width, true)
      await q.close()
    }
  }
}
await browser.close()
server.close()
if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(totals, null, 1))
const all = totals.reduce((a, s) => ({ cards: a.cards + s.cards, escapes: a.escapes + s.escapes, overlaps: a.overlaps + s.overlaps, misplaced: a.misplaced + s.misplaced, misSized: a.misSized + s.misSized }), { cards: 0, escapes: 0, overlaps: 0, misplaced: 0, misSized: 0 })
console.log(`\n${all.cards} cards checked: ${all.escapes} boxes painted outside their card, ${all.overlaps} overlaps, ${all.misplaced} misplaced, ${all.misSized} cut short. Screenshots in ${SHOTS}\n`)
process.exit(failures ? 1 : 0)
