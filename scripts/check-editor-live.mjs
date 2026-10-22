/**
 * ===========================================================================
 *  EVERY KIND OF EDIT, ON THE CANVAS AT ONCE, WITHOUT A RELOAD
 * ===========================================================================
 * The owner, round 1022: "sliders lag while dragging (Theme settings ›
 * corner radius) ... changes don't show on the canvas, I have to refresh
 * (theme settings, section settings, Prices and currency: the currency code
 * on product cards) ... flashes, re-mounts, jumps, the canvas redrawing from
 * scratch, scroll position lost".
 *
 * The real editor (scripts/render-editor-probe.tsx through
 * scripts/editor-probe-harness.mjs, production React, nothing about the
 * editor stubbed), driven with real input over the devtools protocol, on a
 * Storelib theme (the bundled .storelib sections, a product grid among them)
 * and on an imported theme (tests/fixtures/shopify-materia through the real
 * converter, given what a store theme's layout and sections print: a button
 * radius and an accent as variables, a section's top padding, prices that
 * show the currency code when Show currency codes is on). For each edit:
 *
 *   THUMB       from a pointer move to the slider's thumb taking its value:
 *               the input answers in the same task (p95)
 *   FRAMES      the editor's frame intervals while the finger is down: p95,
 *               and how many were longer than a frame and a half (25ms)
 *   CANVAS      from each value to the first canvas frame showing it (or a
 *               newer one): p50, p95, in ms and in frames
 *   SHOWN       of the values the control passed, how many the canvas drew
 *   FINAL       once released and committed, the canvas shows the last value
 *               with no refresh (the "I have to refresh" report)
 *   RELOADS     documents the canvas loaded (an imported theme's frame), or
 *               sections thrown away and mounted again (a Storelib canvas)
 *   SCROLL      the canvas's scroll before and after: kept
 *   SAVES       autosaves sent while the finger was down (none) and after
 *               (one, in the background)
 *
 * Desktop is 1440x900 at full speed; "phone" is the same editor with the
 * CPU slowed 4x, the usual stand in for a phone's CPU in these probes.
 *
 *   npx tsx scripts/check-editor-live.mjs
 *   THEME=storelib|imported   one theme only
 *   CPU=1|4                   one speed only
 *   ONLY=<regexp>             only the edits whose name matches
 *   EDITOR_BUNDLE=<file>      reuse a bundle (one from another commit, to compare)
 *   JSON=<file>               the numbers as JSON
 *   LONG=1                    the Storelib theme on a page of 44 sections
 *   LAT=1                     every value's wait, in order
 *   PROFILE=<edit>            the editor's main thread during that edit
 *   BUDGET=0                  report without failing
 *
 * Round 1022, the bundle before the round and after it, one run each on a
 * shared 4 core machine. Canvas wait p50/p95 in ms; "no" where the canvas
 * never showed the edit without a refresh; frames p95 / frames over 25ms.
 *
 *                              1x before        1x after        4x before         4x after
 *   Storelib theme radius      1170/1670        17/67           462/1046 jumps    86/162
 *     frames                   16.7, 1          16.8, 0         66.6, 72          50, 53
 *   Storelib undo the drag     no               258             no                789
 *   Storelib theme colour      2/35             2/20            16/103 jumps      9/82
 *   Storelib currency code     no (RON)         53              no (RON)          203
 *   Storelib section text      7/14             8/14            21/43             23/44
 *   Storelib section range     33/51            35/51           86/160            82/143
 *   imported theme radius      1200/1700        19/51           688/1179          143/269
 *   imported undo the drag     no               63              no                421
 *   imported theme colour      no, 33 reloads   1/18            no, 17 reloads    36/131
 *   imported currency code     no               40              no                164
 *   imported field radius      27 reloads       17/70           11 reloads        79/242
 *   imported hover colour      no, 2 reloads    1/18            no, 4 reloads     39/139
 *   imported section text      29/61            25/32           46/64             40/56
 *   imported section range     19/36            18/50           62/137            58/129
 *
 * After: no canvas loaded again, no section mounted again, the scroll kept
 * and one autosave after each edit, never while a finger is down; the
 * thumb takes the pointer's value in the task of the move (p95 under 1ms
 * at 1x, 5ms at 4x); desktop frames p95 16.8ms in every drag.
 */
import { createServer } from "node:http"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { deflateSync } from "node:zlib"
import JSZip from "jszip"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BUDGET = process.env.BUDGET !== "0"
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

/** A real picture, so every image decodes and paints like one. */
function picture() {
  const w = 320, h = 200
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255) / w; raw[o + 1] = (y * 255) / h; raw[o + 2] = (x ^ y) & 255 }
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
}
const PNG = picture()

/* The shop's cards, as /api/website-builder/products?cards=1 answers. */
const CARDS = ["Linen shirt", "Wool scarf", "Canvas tote", "Leather belt"].map((title, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i + 1}`,
  type: "product",
  settings: {
    title, price: `$${24 + i * 6}.00`, compare_price: "", currency: "USD", free: false, pay_what_you_want: false,
    image: `https://example.invalid/p${i}.png`, images: [`https://example.invalid/p${i}.png`], url: `/products/p${i}`, slug: `p${i}`,
    kind: "physical", available: true, tag: "", checkout_url: "", variants: [],
  },
}))

/* LONG=1: a home page of 44 sections, most with pictures (scripts/check-editor-live-edit.mjs's), the product grid among them. */
const LONG_PAGE = ["header", "hero_centered", "features_grid", "product_grid", "text_image", "gallery", "proof_testimonials", "image_banner", "faq_accordion", "split_content", "team_members", "logo_bar",
  "cta_image", "media_gallery", "text_rich", "features_cards", "image_comparison", "collection_banner", "about_image", "process_steps", "promo_newsletter", "multirow",
  "features_image", "timeline", "lookbook", "press_mentions", "icon_box", "cta_banner", "media_collage", "hero_split", "stats", "about_founder",
  "proof_logos", "text_columns", "image_section", "testimonials", "pricing", "cta_simple", "promotion_banner", "banner_packery", "social_proof_bar", "faq_columns",
  "newsletter", "footer"]

/* ── The imported theme: Materia, with what a store theme's files print ── */

function withSchema(liquid, add) {
  return liquid.replace(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/, (_m, body) => {
    const schema = JSON.parse(body)
    add(schema)
    return `{% schema %}\n${JSON.stringify(schema, null, 2)}\n{% endschema %}`
  })
}

async function importedTheme() {
  const dir = join(root, "tests/fixtures/shopify-materia")
  const zip = new JSZip()
  const walk = (d, rel) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p, `${rel}${n}/`)
      else zip.file(`${rel}${n}`, readFileSync(p))
    }
  }
  walk(dir, "")
  /* The layout prints the button radius and the accent as variables, as Dawn's does. */
  let layout = await zip.file("layout/theme.liquid").async("string")
  layout = layout.replace("</head>", `{% style %}
      :root { --accent: {{ settings.accent }}; --buttons-radius: {{ settings.buttons_radius }}px; }
      .button, .pg__card { border-radius: var(--buttons-radius); transition: all .25s ease; }
      a, .button { color: var(--accent); }
    {% endstyle %}
  </head>`)
  /* What a theme's layout prints from its settings outside a stylesheet: the browser's bar colour in the head, a block of CSS in the body. */
  layout = layout.replace("<title>", `<meta name="theme-color" content="{{ settings.accent }}">\n    <title>`)
  layout = layout.replace("<main ", `<style>.fp__card { outline-color: {{ settings.accent }}; }</style>\n    <main `)
  zip.file("layout/theme.liquid", layout)
  /* The theme's script adds a stylesheet of its own to the head, as sliders, popups and app widgets do. */
  const js = await zip.file("assets/materia.js").async("string")
  zip.file("assets/materia.js", `${js}\n;(function () { var s = document.createElement("style"); s.textContent = ".materia-ready{}"; document.head.appendChild(s) })();\n`)
  const schema = JSON.parse(await zip.file("config/settings_schema.json").async("string"))
  schema.push({ name: "Buttons", settings: [{ type: "range", id: "buttons_radius", min: 0, max: 40, step: 1, unit: "px", label: "Corner radius", default: 6 }] })
  schema.push({ name: "Currency format", settings: [{ type: "checkbox", id: "currency_code_enabled", label: "Show currency codes", default: false }] })
  zip.file("config/settings_schema.json", JSON.stringify(schema, null, 2))
  /* The rich text's top padding, in its own markup, as a section range. */
  let rich = await zip.file("sections/rich-text.liquid").async("string")
  rich = rich.replace('<div class="rt reveal">', '<div class="rt reveal" style="padding-top: {{ section.settings.padding_top }}px">')
  rich = withSchema(rich, (s) => { s.settings = [...(s.settings ?? []), { type: "range", id: "padding_top", min: 0, max: 120, step: 2, unit: "px", label: "Top padding", default: 36 }] })
  zip.file("sections/rich-text.liquid", rich)
  /* The shop's products with their prices, the way Dawn's price snippet prints them. */
  zip.file("sections/featured-products.liquid", `<div class="fp">
  <h2>{{ section.settings.heading }}</h2>
  {%- for product in collections.all.products limit: 4 -%}
    <div class="fp__card"><span class="fp__title">{{ product.title }}</span>
      <span class="fp__price">{%- if settings.currency_code_enabled -%}{{ product.price | money_with_currency }}{%- else -%}{{ product.price | money }}{%- endif -%}</span>
      <a class="button" href="{{ product.url }}">View</a>
    </div>
  {%- endfor -%}
  <input class="field__input fp__email" type="email" placeholder="Email">
</div>
{% schema %}
{ "name": "Featured products", "settings": [ { "type": "text", "id": "heading", "label": "Heading", "default": "Featured" } ], "presets": [ { "name": "Featured products" } ] }
{% endschema %}`)
  const index = JSON.parse(await zip.file("templates/index.json").async("string"))
  index.sections.shop = { type: "featured-products", settings: {} }
  index.order.splice(2, 0, "shop")
  zip.file("templates/index.json", JSON.stringify(index))
  const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert.ts")
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  const t = r.theme
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  return { settings: t.settings, pages, sources, files, all: t.files }
}

/* ── In the editor's document: frames, saves, the canvas, every frame ── */

const TOOLS = String.raw`
window.__el = (function () {
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  var frame = function () { return new Promise(function (r) { requestAnimationFrame(function () { r() }) }) }
  var now = function () { return performance.timeOrigin + performance.now() }
  function text(el) { return (el.textContent || "").replace(/\s+/g, " ").trim() }
  function side() { return document.querySelector("[data-wb-sidebar-scroll]") || document }
  function centre(el) { el.scrollIntoView({ block: "center" }); var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
  function byText(re, scope) {
    var all = (scope || document).querySelectorAll("button, [role=button], [role=tab]")
    for (var i = 0; i < all.length; i++) if (re.test(text(all[i])) && all[i].getClientRects().length) return all[i]
    return null
  }
  function sliders() {
    var out = []
    document.querySelectorAll("[data-slot='slider']").forEach(function (s) {
      if (s.closest("#wb-preview-root") || !s.getClientRects().length) return
      var label = ""
      for (var p = s.parentElement; p && p !== document.body && !label; p = p.parentElement) {
        var l = p.querySelector("label, p, span")
        if (l && !s.contains(l) && text(l)) label = text(l)
      }
      out.push({ el: s, label: label })
    })
    return out
  }
  /* A switch by the words of its row. */
  function switchFor(re) {
    var all = document.querySelectorAll("button[role=switch]")
    for (var i = 0; i < all.length; i++) {
      var s = all[i]
      if (!s.getClientRects().length || s.closest("#wb-preview-root")) continue
      /* Its own row: the widest ancestor that holds this switch and no other. */
      var row = s
      for (var p = s.parentElement; p && p.querySelectorAll("button[role=switch]").length === 1; p = p.parentElement) row = p
      if (re.test(text(row))) return s
    }
    return null
  }
  /* A colour's chip by the words of its row, or the first one. */
  function chipFor(re) {
    var all = side().querySelectorAll("button")
    for (var i = 0; i < all.length; i++) {
      var b = all[i]
      var said = (b.getAttribute("aria-label") || "") + " " + text(b)
      if (!b.getClientRects().length) continue
      /* A colour not chosen yet is its label alone. */
      if (re && re.test(text(b)) && text(b).length < 30 && b.closest("[data-compat-theme-group]")) return b
      if (!/Pick color|#[0-9a-f]{3,8}\b|: none/i.test(said)) continue
      if (!re || re.test(said)) return b
      var row = b
      for (var p = b.parentElement; p && p.querySelectorAll("button").length === 1; p = p.parentElement) row = p
      if (re.test(text(row))) return b
    }
    return null
  }
  var w = null
  /* The canvas's own scroller, for a Storelib canvas. */
  function scroller() { return document.getElementById("wb-preview-root") }
  function start(storelibRead) {
    var canvas = scroller()
    w = { t0: now(), frames: [], samples: [], values: [], moves: [], thumbs: [], loads: 0, frameEls: 0, removedSections: 0, on: true, saves0: (window.probeSaves || []).length, calls0: (window.probeCalls || []).length }
    w.loadsWhat = []
    w.onLoad = function (e) { if (e.target && e.target.tagName === "IFRAME" && (e.target.hasAttribute("data-compat-frame") || e.target.closest("#wb-preview-root"))) { w.loads++; w.loadsWhat.push((e.target.getAttribute("data-compat-frame") || e.target.getAttribute("title") || e.target.className || "iframe") + "@" + Math.round(now() - w.t0)) } }
    document.addEventListener("load", w.onLoad, true)
    w.mo = new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) {
        var m = list[i]
        for (var j = 0; j < m.addedNodes.length; j++) { var a = m.addedNodes[j]; if (a.nodeType === 1 && (a.tagName === "IFRAME" || (a.querySelector && a.querySelector("iframe[data-compat-frame]")))) w.frameEls++ }
        for (var j2 = 0; j2 < m.removedNodes.length; j2++) {
          var r = m.removedNodes[j2]
          if (r.nodeType !== 1) continue
          if (r.hasAttribute && r.hasAttribute("data-section-box")) w.removedSections++
          else if (r.querySelectorAll) w.removedSections += r.querySelectorAll("[data-section-box]").length
        }
      }
    })
    if (canvas) w.mo.observe(canvas, { childList: true, subtree: true })
    w.onMove = function (e) { if (e.buttons === 1) w.moves.push(now()) }
    document.addEventListener("pointermove", w.onMove, true)
    w.thumbObs = new MutationObserver(function (list) { for (var i = 0; i < list.length; i++) { var t = list[i].target; if (!t.closest("#wb-preview-root")) w.thumbs.push({ t: now(), v: t.getAttribute("aria-valuenow") }) } })
    document.querySelectorAll("[data-slot='slider-thumb']").forEach(function (t) { w.thumbObs.observe(t, { attributes: true, attributeFilter: ["aria-valuenow"] }) })
    var read = storelibRead ? new Function("return (" + storelibRead + ")()") : null
    var prev = null, last
    function tick(ts) {
      if (!w || !w.on) return
      if (prev !== null) w.frames.push(ts - prev)
      prev = ts
      if (read) { var v; try { v = String(read()) } catch (e) { v = "?" } if (v !== last) { w.samples.push([now(), v]); last = v } }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return canvas ? canvas.scrollTop : null
  }
  function value(v) { if (w) w.values.push({ t: now(), v: v }) }
  function savesSoFar() { return w ? (window.probeSaves || []).length - w.saves0 : 0 }
  function stop() {
    w.on = false
    w.mo.disconnect(); w.thumbObs.disconnect()
    document.removeEventListener("load", w.onLoad, true)
    document.removeEventListener("pointermove", w.onMove, true)
    var saves = (window.probeSaves || []).slice(w.saves0)
    var calls = (window.probeCalls || []).slice(w.calls0)
    var canvas = scroller()
    return { frames: w.frames, samples: w.samples, values: w.values, moves: w.moves, thumbs: w.thumbs, loads: w.loads, loadsWhat: w.loadsWhat, frameEls: w.frameEls, removedSections: w.removedSections, saves: saves.map(function (s) { return s.url }), fetches: calls.filter(function (c) { return /^GET /.test(c) }).length, scroll: canvas ? canvas.scrollTop : null }
  }
  return { sleep: sleep, frame: frame, now: now, text: text, side: side, centre: centre, byText: byText, sliders: sliders, switchFor: switchFor, chipFor: chipFor, start: start, value: value, savesSoFar: savesSoFar, stop: stop }
})()
true
`

/* In an imported theme's frame: what the page shows, every frame. */
const FRAME_TOOLS = String.raw`
window.__fl = (function () {
  var w = null
  /* Storelib's own events, as a theme's code hears them (canvas-bridge.ts). */
  if (!window.__slEv) {
    var ev = window.__slEv = { settings: 0, live: 0, sections: 0, keys: {} }
    document.addEventListener("storelib:settings-change", function (e) { ev.settings++; if (e.detail && e.detail.live) ev.live++; Object.keys((e.detail && e.detail.settings) || {}).forEach(function (k) { ev.keys[k] = 1 }) })
    document.addEventListener("storelib:section-load", function () { ev.sections++ })
  }
  return {
    start: function (src) {
      var read = new Function("return (" + src + ")()")
      w = { samples: [], on: true, scroll: scrollY, ev0: { settings: window.__slEv.settings, live: window.__slEv.live, sections: window.__slEv.sections } }
      window.__slEv.keys = {}
      var last
      var tick = function () {
        if (!w || !w.on) return
        var v
        try { v = String(read()) } catch (e) { v = "?" }
        if (v !== last) { w.samples.push([performance.timeOrigin + performance.now(), v]); last = v }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      return scrollY
    },
    stop: function () { if (!w) return null; w.on = false; var ev = window.__slEv; return { samples: w.samples, scroll: scrollY, events: { settings: ev.settings - w.ev0.settings, live: ev.live - w.ev0.live, sections: ev.sections - w.ev0.sections, keys: Object.keys(ev.keys) } } },
    read: function (src) { try { return String(new Function("return (" + src + ")()")()) } catch (e) { return "?" } },
  }
})()
true
`

/* PROFILE=<edit>: the editor's main thread while the edit is made, self and total time by function. */
function printProfile(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const dt = new Map()
  profile.samples.forEach((id, k) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[k] ?? 0)))
  const self = new Map(), total = new Map()
  const name = (n) => `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber}`
  for (const [id, us] of dt) {
    const n = byId.get(id)
    if (/^\((idle|program|garbage collector)\)/.test(n.callFrame.functionName)) continue
    self.set(name(n), (self.get(name(n)) ?? 0) + us)
    const seen = new Set()
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
      const nm = name(byId.get(cur))
      if (seen.has(nm)) continue
      seen.add(nm)
      total.set(nm, (total.get(nm) ?? 0) + us)
    }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `      ${(v / 1000).toFixed(1).padStart(7)}ms  ${k}`).join("\n")
  console.log("    SELF\n" + top(self, 25) + "\n    TOTAL\n" + top(total, Number(process.env.PROFILE_N ?? 45)))
}

const pct = (a, p) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1)
}

async function run({ kind, cpu, bundle, css, compat }) {
  const globals = kind === "imported"
    ? `window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")};`
    : `window.PROBE_PAGES={home:${JSON.stringify(process.env.LONG ? LONG_PAGE : ["header", "hero_centered", "features_grid", "product_grid", "text_rich", "faq_accordion", "promo_newsletter", "cta_simple", "footer"])}};window.PROBE_PAGE_DELAY_MS=0;`
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_CARDS=${JSON.stringify(CARDS)};${globals}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(bundle))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset && compat) {
      const name = decodeURIComponent(asset[1])
      const text = compat.all[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      res.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "text/plain", "Access-Control-Allow-Origin": "*" })
      res.end(text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${server.address().port}`
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
  const report = {}
  const errors = []
  try {
    const page = await browser.newPage()
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    if (process.env.DEBUG_CONSOLE) { await page.evaluateOnNewDocument("window.__dbg = true"); page.on("console", (m) => { if (m.text().startsWith("[dbg]")) console.log("      " + m.text().slice(0, 300)) }) }
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      const u = r.url()
      if (/example\.invalid/.test(u) || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(u)) return r.respond({ status: 200, contentType: "image/png", body: PNG })
      if (u.startsWith(base) || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("about:")) return r.continue()
      return r.respond({ status: 200, contentType: "text/plain", body: "" })
    })
    await page.goto(base, { waitUntil: "domcontentloaded" })
    const front = async () => (await (await page.$("[data-compat-frame='front']"))?.contentFrame()) ?? null
    if (kind === "imported") {
      let f = null
      for (let i = 0; i < 160 && !f; i++) {
        await sleep(250)
        f = await front()
        if (f && !(await f.evaluate(() => document.querySelectorAll(".shopify-section").length).catch(() => 0))) f = null
      }
      if (!f) throw new Error("the canvas never drew the imported theme")
    } else {
      await page.waitForFunction((n) => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= n, { timeout: 120_000, polling: 200 }, process.env.LONG ? LONG_PAGE.length - 2 : 7)
    }
    /* Quiet: the editor reads the store's languages, markets and cards after it opens. */
    for (let i = 0, n = -1; i < 40; i++) {
      await sleep(500)
      const c = await page.evaluate(() => window.probeCalls.length)
      if (c === n && i > 6) break
      n = c
    }
    await page.evaluate(TOOLS)
    const cdp = await page.createCDPSession()
    const throttle = async (rate) => {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate })
      const f = await front()
      const client = f?.client
      if (client && client !== cdp) await client.send("Emulation.setCPUThrottlingRate", { rate }).catch(() => {})
    }
    const js = (fn, ...a) => page.evaluate(fn, ...a)
    const clickAt = async (p) => { await page.mouse.click(p.x, p.y); await sleep(500) }
    console.log(`\n${kind === "imported" ? "IMPORTED THEME (Materia fixture)" : "STORELIB THEME"}   CPU ${cpu}x${cpu > 1 ? " (phone-class)" : " (desktop)"}`)

    /* Into a theme group of the sidebar, from wherever it is. */
    const themeGroup = async (re) => {
      await js(() => { const b = window.__el.byText(/^Theme$/); if (b) b.click() })
      await sleep(700)
      for (let i = 0; i < 3; i++) {
        const back = await js(() => { const b = document.querySelector("[data-theme-group-open] button, [data-compat-theme-group] [data-panel-back] button"); if (b) { b.click(); return true } return false })
        if (!back) break
        await sleep(500)
      }
      const ok = await js((src) => { const b = window.__el.byText(new RegExp(src, "i"), window.__el.side()); if (!b) return false; b.scrollIntoView({ block: "center" }); b.click(); return true }, re.source)
      await sleep(800)
      return ok
    }
    /* A section selected by a press on it in the canvas. */
    const selectSection = async (selector) => {
      await js(() => { const b = window.__el.byText(/^Sections$/); if (b) b.click() })
      await sleep(500)
      if (kind === "imported") {
        const f = await front()
        const at = await f.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + Math.min(20, r.width / 2), y: r.top + Math.min(r.height / 2, 30) } }, selector)
        if (!at) return false
        await sleep(300)
        const box = await (await page.$("[data-compat-frame='front']")).boundingBox()
        await clickAt({ x: box.x + at.x, y: box.y + at.y })
      } else {
        const at = await js((sel) => { const el = document.querySelector(`#wb-preview-root ${sel}`); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + Math.min(40, r.width / 2), y: r.top + Math.min(r.height / 2, 30) } }, selector)
        if (!at) return false
        await sleep(300)
        await clickAt(at)
      }
      await sleep(600)
      return true
    }
    /* The canvas scrolled so what an edit changes is on screen, not at the top. */
    const bringIntoView = async (selector) => {
      if (kind === "imported") await (await front())?.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: "center" }) }, selector)
      else await js((sel) => { const el = document.querySelector(`#wb-preview-root ${sel}`); if (el) el.scrollIntoView({ block: "center" }) }, selector)
      await sleep(400)
    }

    /*
      One edit: `read` is what the canvas shows (a function's source, run in
      the canvas's document every frame), `expected` what it shows for a
      value. `act` does the edit and marks each value the control took.
    */
    const edit = async (name, { read, expected, act, byChange = false, scrollTo }) => {
      if (ONLY && !ONLY.test(name)) return
      if (scrollTo) await bringIntoView(scrollTo)
      let frameScroll0 = null
      if (kind === "imported") {
        const f = await front()
        await f.evaluate(FRAME_TOOLS)
        frameScroll0 = await f.evaluate((src) => window.__fl.start(src), read)
      }
      const scroll0 = await js((src) => window.__el.start(src), kind === "imported" ? null : read)
      await throttle(cpu)
      const profiling = process.env.PROFILE && new RegExp(process.env.PROFILE, "i").test(name)
      if (profiling) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
      const tStart = Date.now()
      await act()
      if (profiling) printProfile((await cdp.send("Profiler.stop")).profile)
      const released = await js(() => window.__el.now())
      const savesDuring = await js(() => window.__el.savesSoFar())
      /* The commit, the autosave behind it, and a moment more for anything that would jump. */
      await sleep(2600 * Math.max(1, cpu / 2))
      await throttle(1)
      const m = await js(() => window.__el.stop())
      let samples = m.samples
      let frameScroll1 = null
      let frameLost = false
      let frameEvents = null
      if (kind === "imported") {
        const f = await front()
        const got = await f.evaluate(() => window.__fl ? window.__fl.stop() : null).catch(() => null)
        if (got) { samples = got.samples; frameScroll1 = got.scroll; frameEvents = got.events } else {
          /* The page was loaded again: what the new one shows, read once, after the release. */
          frameLost = true
          const v = await f.evaluate((src) => String(new Function("return (" + src + ")()")()), read).catch(() => "?")
          samples = [[released + 1e9, v]]
          frameScroll1 = await f.evaluate(() => scrollY).catch(() => null)
        }
      }
      const values = m.values
      const exp = values.map((x) => expected(x.v))
      /* Which value each canvas frame showed: the newest value by then that reads the same. */
      const shownAt = samples.map(([t, v], k) => {
        let j = -1
        for (let i = 0; i < values.length && values[i].t <= t + 1; i++) if (byChange ? k > 0 : exp[i] === v) j = i
        return { t, j, v }
      })
      const lat = []
      for (let i = 0; i < values.length; i++) {
        /* A value the canvas draws the same as the one before (a trailing space, trimmed) has nothing to show. */
        if (!byChange && (i > 0 ? exp[i] === exp[i - 1] : exp[0] === samples[0]?.[1])) continue
        const hit = shownAt.find((s) => s.j >= i && s.t >= values[i].t - 1)
        if (hit) lat.push(hit.t - values[i].t)
      }
      if (process.env.LAT) console.log(`      latencies: ${lat.map((x) => Math.round(x)).join(" ")}`)
      const shown = new Set(shownAt.filter((s) => s.j >= 0).map((s) => (byChange ? s.j : exp.indexOf(exp[s.j])))).size
      const drawable = byChange ? values.length : new Set(exp).size
      const finalWanted = byChange ? null : exp[exp.length - 1]
      const last = samples[samples.length - 1]?.[1]
      const firstFinal = shownAt.findIndex((s) => s.v === last && s.t >= (values[values.length - 1]?.t ?? 0) - 1)
      const jumped = firstFinal >= 0 ? shownAt.slice(firstFinal).filter((s) => s.v !== last).map((s) => s.v) : []
      /* The slider's thumb: from each pointer move to the thumb's value changing. */
      const thumbLag = []
      for (const t of m.thumbs) {
        let mv = null
        for (const x of m.moves) if (x <= t.t + 0.5) mv = x
        if (mv !== null) thumbLag.push(t.t - mv)
      }
      void released
      /* While the finger is down, and the frames just after: the commit's frame is the one most likely to be long. */
      const fr = m.frames
      const out = {
        values: values.length,
        thumbP95: pct(thumbLag, 95),
        frameP95: pct(fr, 95), frameMax: fr.length ? Math.round(Math.max(...fr)) : null, framesOver25: fr.filter((f) => f > 25).length, frames: fr.length,
        canvasP50: pct(lat, 50), canvasP95: pct(lat, 95), shown, drawable,
        final: byChange ? last : finalWanted, last, finalOk: byChange ? samples.length > 1 : last === finalWanted, jumped,
        reloads: m.loads + m.frameEls, reloadsWhat: m.loadsWhat, remounted: m.removedSections, frameLost,
        scroll: kind === "imported" ? [frameScroll0, frameScroll1] : [scroll0, m.scroll],
        events: frameEvents,
        savesWhileDown: savesDuring, saves: m.saves.length, fetches: m.fetches, ms: Date.now() - tStart,
      }
      report[name] = out
      const sc = out.scroll
      console.log(`  ${name.padEnd(24)} thumb p95 ${out.thumbP95 ?? "-"}ms  frames p95 ${out.frameP95}ms (>25ms: ${out.framesOver25}/${out.frames}, worst ${out.frameMax}ms)  canvas p50 ${out.canvasP50}ms p95 ${out.canvasP95}ms  shown ${out.shown}/${out.drawable}  final ${out.finalOk ? "ok" : `NOT SHOWN (${JSON.stringify(out.last)} != ${JSON.stringify(out.final)})`}${jumped.length ? `  JUMPED ${JSON.stringify(jumped.slice(0, 3))}` : ""}  reloads ${out.reloads}${out.reloads ? ` ${JSON.stringify(out.reloadsWhat)}` : ""}  remounted ${out.remounted}  scroll ${sc[0] === null ? "-" : Math.round(sc[0])}->${sc[1] === null ? "-" : Math.round(sc[1])}  saves ${out.saves}  fetches ${out.fetches}${frameEvents ? `  events: settings-change ${frameEvents.settings} (${frameEvents.live} live; ${frameEvents.keys.join(",")}), section-load ${frameEvents.sections}` : ""}${frameLost ? "  FRAME REPLACED" : ""}`)
    }

    /* A slider dragged across and back, a move every 8ms (a 120Hz pointer); each thumb value is a value. */
    const drag = async (re, span = 0.9) => {
      const s = await js(async (src) => {
        const all = window.__el.sliders()
        const hit = all.find((x) => new RegExp(src, "i").test(x.label))
        if (!hit) return { none: all.map((x) => x.label) }
        hit.el.scrollIntoView({ block: "center" })
        await window.__el.frame(); await window.__el.frame()
        const t = hit.el.querySelector("[data-slot='slider-thumb']").getBoundingClientRect()
        const r = hit.el.getBoundingClientRect()
        return { label: hit.label, tx: t.left + t.width / 2, ty: t.top + t.height / 2, left: r.left, right: r.right }
      }, re.source)
      if (s.none) { expect(false, `a slider labelled ${re}`, s.none); return false }
      await js(() => {
        window.__thumbV = new MutationObserver((l) => { for (const r of l) if (!r.target.closest("#wb-preview-root")) window.__el.value(r.target.getAttribute("aria-valuenow")) })
        document.querySelectorAll("[data-slot='slider-thumb']").forEach((t) => window.__thumbV.observe(t, { attributes: true, attributeFilter: ["aria-valuenow"] }))
      })
      const a = s.left + 2, b = s.left + (s.right - s.left) * span
      await page.mouse.move(s.tx, s.ty)
      await page.mouse.down()
      const N = 90
      for (let k = 0; k <= N; k++) {
        const f = k / N
        const x = f < 0.5 ? s.tx + (b - s.tx) * (f * 2) : b + (a + (b - a) * 0.6 - b) * ((f - 0.5) * 2)
        await page.mouse.move(x, s.ty)
        await sleep(8)
        if (process.env.DEBUG_MID && k === 45) console.log("    mid-drag:", JSON.stringify(await js((src) => new Function("return (" + src + ")()")(), process.env.DEBUG_MID)))
      }
      await page.mouse.up()
      await js(() => window.__thumbV.disconnect())
      return true
    }

    const READ = kind === "imported"
      ? {
          radius: `function () { return getComputedStyle(document.querySelector(".fp .button")).borderTopLeftRadius }`,
          accent: `function () { return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() }`,
          text: `function () { var h = document.querySelector(".rt h2"); return h ? h.textContent.trim() : "" }`,
          padding: `function () { return getComputedStyle(document.querySelector(".rt")).paddingTop }`,
          price: `function () { var p = document.querySelector(".fp__price"); return p ? p.textContent.trim() : "" }`,
        }
      : {
          radius: `function () { var b = document.querySelector("#wb-preview-root [data-section-type='hero_centered'] .s__btn--primary"); return b ? getComputedStyle(b).borderTopLeftRadius : "" }`,
          accent: `function () { var out = []; document.querySelectorAll("#wb-preview-root [data-section-type='hero_centered'] .s, #wb-preview-root [data-section-type='hero_centered'] .s__btn--primary, #wb-preview-root [data-section-type='hero_centered'] h1").forEach(function (e) { var c = getComputedStyle(e); out.push(c.backgroundColor + "/" + c.color) }); return out.join(" ") }`,
          text: `function () { var h = document.querySelector("#wb-preview-root [data-section-type='hero_centered'] h1"); return h ? h.textContent.trim() : "" }`,
          padding: `function () { var s = document.querySelector("#wb-preview-root [data-section-type='hero_centered'] .s"); return s ? getComputedStyle(s).paddingTop : "" }`,
          price: `function () { var p = document.querySelector("#wb-preview-root [data-section-type='product_grid'] .card__price"); return p ? p.firstChild.textContent.trim() : "" }`,
        }

    /* What the canvas shows now, read once. */
    const readNow = async (src) => kind === "imported"
      ? (await front()).evaluate((x) => String(new Function("return (" + x + ")()")()), src).catch(() => "")
      : js((x) => String(new Function("return (" + x + ")()")()), src)
    /* ── Theme settings › Buttons › Corner radius, then Undo ── */
    if (!ONLY || ONLY.test("theme radius")) {
      const radiusTarget = kind === "storelib" ? "[data-section-type='hero_centered']" : ".fp"
      const opened = kind === "storelib" ? await themeGroup(/^Buttons and inputs/) : await themeGroup(/^Buttons$/)
      if (!opened) expect(false, "Theme has its Buttons group")
      else {
        await bringIntoView(radiusTarget)
        const before = await readNow(READ.radius)
        /* "Corner radius when rounded" on a Storelib theme: the default shape is rounded. */
        await edit("theme radius", { read: READ.radius, expected: (v) => `${v}px`, act: () => drag(kind === "storelib" ? /^Corner radius when rounded/ : /^Corner radius/), scrollTo: radiusTarget })
        /* Undo: the whole drag taken back, and the canvas with it (a value a finger drew was kept laid over the theme). */
        await edit("undo theme radius", {
          read: READ.radius, expected: (v) => v, scrollTo: radiusTarget,
          act: async () => {
            await js(() => document.activeElement?.blur?.())
            await js((v) => window.__el.value(v), before)
            await page.keyboard.down("Control"); await page.keyboard.press("z"); await page.keyboard.up("Control")
          },
        })
      }
    }
    /* ── A colour: the theme's accent (imported), the first scheme's colour (Storelib), dragged in the picker ── */
    if (!ONLY || ONLY.test("theme colour")) {
      const ok = await themeGroup(/^Colou?rs$/)
      const chip = ok ? await js((imported) => {
        const b = window.__el.chipFor(imported ? /Accent/i : null)
        return b ? window.__el.centre(b) : null
      }, kind === "imported") : null
      if (!chip) expect(false, "Theme › Colors has a colour", await js(() => [...window.__el.side().querySelectorAll("button")].filter((b) => b.getClientRects().length).map((b) => b.getAttribute("aria-label") || window.__el.text(b)).slice(0, 20)))
      else {
        await clickAt(chip)
        const box = await js(() => { const b = document.querySelector(".cursor-crosshair[data-sheet-no-drag]"); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height } })
        if (!box) expect(false, "the colour picker opened")
        else await edit("theme colour", {
          read: READ.accent, expected: (v) => v, byChange: true, scrollTo: kind === "imported" ? ".rt" : "[data-section-type='hero_centered']",
          act: async () => {
            await js(() => { window.__mv = (e) => { if (e.buttons === 1) window.__el.value("") }; document.addEventListener("pointermove", window.__mv, true) })
            await page.mouse.move(box.left + box.w * 0.2, box.top + box.h * 0.2)
            await page.mouse.down()
            for (let k = 0; k <= 60; k++) {
              const f = k / 60
              await page.mouse.move(box.left + box.w * (0.2 + 0.6 * f), box.top + box.h * (0.2 + 0.5 * Math.sin(f * Math.PI)))
              await sleep(8)
            }
            await page.mouse.up()
            await js(() => document.removeEventListener("pointermove", window.__mv, true))
          },
        })
        await page.keyboard.press("Escape")
        await sleep(400)
      }
    }
    /* ── Show currency codes on prices ── */
    if (!ONLY || ONLY.test("currency code")) {
      const ok = await themeGroup(kind === "imported" ? /^Currency format$/ : /^Product cards$/)
      const sw = ok ? await js(() => { const s = window.__el.switchFor(/Show currency codes/); return s ? window.__el.centre(s) : null }) : null
      if (!sw) expect(false, "a Show currency codes switch")
      else {
        await bringIntoView(kind === "imported" ? ".fp" : "[data-section-type='product_grid']")
        const before = kind === "imported" ? await (await front()).evaluate((src) => new Function("return (" + src + ")()")(), READ.price).catch(() => "") : await js((src) => new Function("return (" + src + ")()")(), READ.price)
        await edit("currency code", {
          read: READ.price, expected: (v) => v, scrollTo: kind === "imported" ? ".fp" : "[data-section-type='product_grid']",
          act: async () => {
            /* The store's own currency, as the cards are priced (USD here). */
            const want = / USD$/.test(before) ? before.replace(/ USD$/, "") : `${before} USD`
            await js((v) => window.__el.value(v), want)
            await page.mouse.click(sw.x, sw.y)
          },
        })
        if (process.env.DEBUG) console.log("    after:", JSON.stringify(await js(() => ({ checked: window.__el.switchFor(/Show currency codes/)?.getAttribute("aria-checked"), saves: (window.probeSaves || []).slice(-2).map((x) => ({ url: x.url, cc: JSON.stringify(x.body).match(/currency_code_enabled[^,}]*/)?.[0] })) }))))
      }
    }
    /* ── An imported theme's Hover and focus, added by Storelib (lib/storelib-theme/compat/overrides.ts): the fields' corner radius, a button's hover colour ── */
    if (kind === "imported" && (!ONLY || ONLY.test("hover"))) {
      if (await themeGroup(/^Hover and focus$/)) {
        await edit("hover field radius", {
          read: `function () { return getComputedStyle(document.querySelector(".fp__email")).borderTopLeftRadius }`,
          expected: (v) => (Number(v) < 0 ? "?" : `${v}px`), scrollTo: ".fp",
          act: () => drag(/^Corner radius/, 0.8),
        })
        const chip = await js(() => { const b = window.__el.chipFor(/^Background$/); return b ? window.__el.centre(b) : null })
        if (!chip) expect(false, "Hover and focus has a Background colour", await js(() => [...window.__el.side().querySelectorAll("button")].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute("aria-label") || "") + "/" + window.__el.text(b)).slice(0, 30)))
        else {
          await clickAt(chip)
          const box = await js(() => { const b = document.querySelector(".cursor-crosshair[data-sheet-no-drag]"); if (!b) return null; const r = b.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height } })
          if (!box) expect(false, "the colour picker opened")
          else await edit("hover button colour", {
            read: `function () { var s = document.querySelector("style[data-storelib-overrides]"); return s ? (s.__slText !== undefined ? s.__slText : s.textContent) : "" }`, expected: (v) => v, byChange: true, scrollTo: ".fp",
            act: async () => {
              await js(() => { window.__mv = (e) => { if (e.buttons === 1) window.__el.value("") }; document.addEventListener("pointermove", window.__mv, true) })
              await page.mouse.move(box.left + box.w * 0.3, box.top + box.h * 0.3)
              await js(() => { window.__box0 = document.querySelector(".cursor-crosshair[data-sheet-no-drag]") })
              await page.mouse.down()
              if (process.env.DEBUG) console.log("    picker after the press:", await js(() => ({ same: document.querySelector(".cursor-crosshair[data-sheet-no-drag]") === window.__box0, connected: window.__box0?.isConnected })))
              for (let k = 0; k <= 40; k++) {
                await page.mouse.move(box.left + box.w * (0.3 + 0.5 * (k / 40)), box.top + box.h * (0.3 + 0.3 * Math.sin((k / 40) * Math.PI)))
                await sleep(8)
              }
              await page.mouse.up()
              await js(() => document.removeEventListener("pointermove", window.__mv, true))
            },
          })
          await page.keyboard.press("Escape")
          await sleep(400)
        }
      } else expect(false, "Theme has Hover and focus")
    }
    /* ── A section's text, typed ── */
    if (!ONLY || ONLY.test("section text")) {
      const sel = kind === "imported" ? ".rt h2" : "[data-section-type='hero_centered'] h1"
      if (await selectSection(kind === "imported" ? ".rt" : "[data-section-type='hero_centered']")) {
        const current = kind === "imported" ? await (await front()).evaluate((s) => document.querySelector(s)?.textContent.trim() ?? "", sel) : await js((s) => document.querySelector(`#wb-preview-root ${s}`)?.textContent.trim() ?? "", sel)
        const field = await js((cur) => {
          const all = [...document.querySelectorAll("[data-wb-sidebar-scroll] input[type=text], [data-wb-sidebar-scroll] input:not([type]), [data-wb-sidebar-scroll] textarea")]
          const f = all.find((i) => i.getClientRects().length && i.value.trim() === cur)
          if (!f) return null
          f.scrollIntoView({ block: "center" })
          const r = f.getBoundingClientRect()
          return { x: r.left + r.width - 8, y: r.top + r.height / 2 }
        }, current)
        if (!field) expect(false, "the section's heading field is in the sidebar", current)
        else {
          await clickAt(field)
          await page.keyboard.press("End")
          await edit("section text", {
            read: READ.text, expected: (v) => v.trim(), scrollTo: kind === "imported" ? ".rt" : "[data-section-type='hero_centered']",
            act: async () => {
              await js(() => { window.__kh = (e) => window.__el.value((e.target.value ?? e.target.textContent ?? "")); document.addEventListener("input", window.__kh, true) })
              await page.keyboard.type(" and more words", { delay: 70 })
              await js(() => document.removeEventListener("input", window.__kh, true))
            },
          })
          await js(() => document.activeElement?.blur?.())
        }
      } else expect(false, "the section can be pressed in the canvas")
    }
    /* ── A section's range: its top padding ── */
    if (!ONLY || ONLY.test("section range")) {
      if (await selectSection(kind === "imported" ? ".rt" : "[data-section-type='hero_centered']")) {
        await edit("section range", { read: READ.padding, expected: (v) => `${v}px`, act: () => drag(/^Top padding|^Padding top|^Top$/), scrollTo: kind === "imported" ? ".rt" : "[data-section-type='hero_centered']" })
      }
    }
    if (errors.length) console.log(`  page errors: ${errors.slice(0, 3).join(" | ")}`)
    report.errors = errors
  } finally {
    await browser.close()
    server.close()
  }
  return report
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const kinds = process.env.THEME ? [process.env.THEME] : ["storelib", "imported"]
  const cpus = process.env.CPU ? [Number(process.env.CPU)] : [1, 4]
  const compat = kinds.includes("imported") ? await importedTheme() : null
  const all = {}
  for (const kind of kinds) for (const cpu of cpus) all[`${kind} ${cpu}x`] = await run({ kind, cpu, bundle, css, compat })
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(all, null, 2))

  console.log("\nBUDGETS")
  for (const [key, r] of Object.entries(all)) {
    const slow = !key.endsWith(" 1x")
    for (const [name, d] of Object.entries(r)) {
      if (name === "errors" || !d || !d.values) continue
      expect(d.finalOk, `${key} ${name}: the canvas shows the edit without a refresh`, { last: d.last, final: d.final })
      expect(d.reloads === 0, `${key} ${name}: the canvas is not loaded again`, d.reloads)
      expect(d.remounted === 0, `${key} ${name}: no section thrown away and mounted again`, d.remounted)
      expect(d.scroll[0] === null || Math.abs((d.scroll[1] ?? 0) - d.scroll[0]) <= 2, `${key} ${name}: the canvas keeps its scroll`, d.scroll)
      expect(d.jumped.length === 0, `${key} ${name}: once released, no jump back`, d.jumped.slice(0, 3))
      /* A drag or typing: within four frames at p95 on a computer (the frame commit holds a value back on a slow frame, use-frame-commit.ts). One change (Undo, a switch): the page drawn once. */
      const once = d.drawable <= 1
      expect(d.canvasP95 !== null && d.canvasP95 <= (once ? (slow ? 900 : 300) : slow ? 300 : 70), `${key} ${name}: the canvas follows (p95, ms)`, { p50: d.canvasP50, p95: d.canvasP95 })
      if (d.thumbP95 !== null) expect(d.thumbP95 <= 1, `${key} ${name}: the thumb takes the pointer's value in the same task`, d.thumbP95)
      if (!slow && /radius|range|colour/.test(name)) expect(d.frameP95 !== null && d.frameP95 <= 17.5, `${key} ${name}: frames p95 within one frame while dragging`, { p95: d.frameP95, over25: d.framesOver25, frames: d.frames })
      expect(d.saves >= 1, `${key} ${name}: saved in the background`, d.saves)
      expect(d.savesWhileDown === 0 || !/radius|range|colour/.test(name), `${key} ${name}: nothing saved while the finger is down`, d.savesWhileDown)
      if (d.events && /theme|hover|currency/.test(name)) expect(d.events.settings >= 1, `${key} ${name}: the theme's code hears storelib:settings-change`, d.events)
      if (d.events && /section/.test(name)) expect(d.events.sections >= 1, `${key} ${name}: the theme's code hears storelib:section-load`, d.events)
    }
    if (r.errors?.length) expect(false, `${key}: no page errors`, r.errors.slice(0, 3))
  }
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
