/**
 * ===========================================================================
 *  ROUND 13 THEMESET: TEN NEW FONTS, AND SWATCH SETTINGS THAT REACH THE CANVAS
 * ===========================================================================
 * Two owner asks, measured in a real browser.
 *
 * SWATCHES (PART=swatches). "In the theme settings, in the variant swatches,
 * when I change the swatch fill between colour and variant image, it doesn't
 * update in real time in the canvas." The Materia store (scripts/materia-
 * store-kit.mjs) is given a Variant swatches group, each setting printed one
 * of the ways store themes print such a setting:
 *
 *   swatch_fill           Liquid in a section's markup: a colour or the
 *                         variant's picture as the swatch's own style
 *   swatch_fill_element   on a custom element (data-fill), which paints its
 *                         swatches when it connects
 *   swatch_fill_json      in a JSON script of the layout, read once at start
 *   swatch_fill_global    in window.theme.settings, read once at start
 *   swatch_fill_listen    the same, by a theme that also listens for the
 *                         builder's storelib:settings-change and applies it
 *   swatch_shape          a class on <body>
 *   swatch_size           a CSS variable in the layout's {% style %}
 *   swatch_border         a <style> that is there only while it is on
 *   swatch_soldout_style  a data attribute on the sold-out swatch
 *
 * Each is changed by its control's own onChange in Theme settings, REPEAT
 * times (there and back). Inside every frame of the canvas a script reads
 * what the swatches look like (computed style) on every animation frame and
 * tells the editor when it changes; the editor keeps which frame is in
 * front. The time from the change to the front frame showing what a reload
 * shows is the latency (median). The page is then drawn again from nothing
 * and compared: the canvas must end up as the reload.
 *
 * The Storelib theme: Theme settings › Buttons and inputs › Variant pills
 * (pill_radius, pill_border_width), and the product page's Variant picker
 * block (swatch_shape, swatches), on a product whose colour option shows one
 * value by its variant's photo.
 *
 * FONTS (PART=fonts): scripts/check-themeset-r13-fonts.mjs.
 *
 *   npx tsx scripts/check-themeset-r13.mjs            everything
 *   PART=swatches|swatches:imported|swatches:native|fonts
 *   CPU=4                                             CPU slowed (swatches)
 *   OUT=<dir>                                         screenshots and results.json
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"

const PART = process.env.PART ?? "all"
const CPU = Number(process.env.CPU ?? 1)
const OUT = process.env.OUT ?? join(process.cwd(), ".probe-out/themeset-r13")
mkdirSync(OUT, { recursive: true })
let broken = 0
const results = []
const within = (p, ms = 8000) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))])
const verdict = (ok, line) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`)
  if (!ok) broken++
  results.push({ ok, line })
}

/* ── Swatches: the imported theme ──────────────────────────────────── */

const FILL = [{ value: "color", label: "Colour" }, { value: "variant_image", label: "Variant image" }]
const SWATCHES = { name: "Variant swatches", settings: [
  { type: "select", id: "swatch_fill", label: "Swatch fill", options: FILL, default: "color" },
  { type: "select", id: "swatch_fill_element", label: "Swatch fill (element)", options: FILL, default: "color" },
  { type: "select", id: "swatch_fill_json", label: "Swatch fill (settings JSON)", options: FILL, default: "color" },
  { type: "select", id: "swatch_fill_global", label: "Swatch fill (window.theme)", options: FILL, default: "color" },
  { type: "select", id: "swatch_fill_listen", label: "Swatch fill (window.theme, listened)", options: FILL, default: "color" },
  { type: "select", id: "swatch_shape", label: "Swatch shape", options: [{ value: "circle", label: "Circle" }, { value: "square", label: "Square" }], default: "circle" },
  { type: "range", id: "swatch_size", label: "Swatch size", min: 20, max: 60, step: 2, unit: "px", default: 32 },
  { type: "checkbox", id: "swatch_border", label: "Swatch border", default: false },
  { type: "select", id: "swatch_soldout_style", label: "Sold out", options: [{ value: "cross", label: "Crossed out" }, { value: "fade", label: "Faded" }], default: "cross" },
] }
const FIRST = { swatch_fill: "color", swatch_fill_element: "color", swatch_fill_json: "color", swatch_fill_global: "color", swatch_fill_listen: "color", swatch_shape: "circle", swatch_size: 32, swatch_border: false, swatch_soldout_style: "cross" }
const NEXT = {
  swatch_fill: "variant_image", swatch_fill_element: "variant_image", swatch_fill_json: "variant_image", swatch_fill_global: "variant_image", swatch_fill_listen: "variant_image",
  swatch_shape: "square", swatch_size: 48, swatch_border: true, swatch_soldout_style: "fade",
}
/* The swatches each setting changes. */
const TARGET = { swatch_fill: /^liquid/, swatch_fill_element: /^element$/, swatch_fill_json: /^json$/, swatch_fill_global: /^global$/, swatch_fill_listen: /^listen$/, swatch_soldout_style: /^liquid3$/ }
/* What only a start-up script reads: no frame can show it but a page drawn again. */
const RELOADS = new Set(["swatch_fill_json", "swatch_fill_global"])
const parts = (sig, only) => sig.split("|").filter((p) => !only || only.test(p.split(",")[0])).join("|")

const SECTION = `<div class="swd page-width">
  <div class="sw-list sw-list--{{ settings.swatch_fill }}" data-probe="liquid">
    {%- for c in (1..3) -%}
      {%- if settings.swatch_fill == 'variant_image' -%}
        <span class="sw sw--image" data-probe-sw="liquid{{ c }}"{% if c == 3 %} data-soldout="{{ settings.swatch_soldout_style }}"{% endif %} style="background-image: url(https://example.invalid/v{{ c }}.png); background-color: transparent"></span>
      {%- else -%}
        <span class="sw sw--color" data-probe-sw="liquid{{ c }}"{% if c == 3 %} data-soldout="{{ settings.swatch_soldout_style }}"{% endif %} style="background-color: #c0{{ c }}{{ c }}33"></span>
      {%- endif -%}
    {%- endfor -%}
  </div>
  <variant-swatches class="sw-list" data-fill="{{ settings.swatch_fill_element }}">
    <span class="sw" data-probe-sw="element" data-color="#2a6f97" data-image="https://example.invalid/e.png"></span>
  </variant-swatches>
  <div class="sw-list sw-list--json"><span class="sw" data-probe-sw="json" data-color="#6a994e" data-image="https://example.invalid/j.png"></span></div>
  <div class="sw-list sw-list--global"><span class="sw" data-probe-sw="global" data-color="#bc4749" data-image="https://example.invalid/g.png"></span></div>
  <div class="sw-list sw-list--listen"><span class="sw" data-probe-sw="listen" data-color="#386641" data-image="https://example.invalid/l.png"></span></div>
</div>
{% schema %}
{ "name": "Swatches", "settings": [], "presets": [ { "name": "Swatches" } ] }
{% endschema %}`

const THEME_JS = `
;(function () {
  var paint = function (el, fill) { el.style.background = fill === "variant_image" ? "url(" + el.getAttribute("data-image") + ") center / cover" : el.getAttribute("data-color"); };
  if (!customElements.get("variant-swatches")) customElements.define("variant-swatches", class extends HTMLElement {
    connectedCallback() { var f = this.getAttribute("data-fill"); this.querySelectorAll(".sw").forEach(function (s) { paint(s, f); }); }
  });
  var start = function () {
    var j = document.getElementById("swatch-settings"), cfg = {};
    try { cfg = JSON.parse(j ? j.textContent : "{}"); } catch (e) {}
    document.querySelectorAll("[data-probe-sw='json']").forEach(function (s) { paint(s, cfg.fill); });
    var g = (window.theme && window.theme.settings) || {};
    document.querySelectorAll("[data-probe-sw='global']").forEach(function (s) { paint(s, g.swatchFill); });
    document.querySelectorAll("[data-probe-sw='listen']").forEach(function (s) { paint(s, g.swatchFillListen); });
  };
  /* The Storelib builder's own event (content/developers/imported-shopify-themes.md): the value applied where it is, no reload needed. */
  document.addEventListener("storelib:settings-change", function (e) {
    var s = e.detail && e.detail.settings;
    if (!s || !("swatch_fill_listen" in s)) return;
    document.querySelectorAll("[data-probe-sw='listen']").forEach(function (el) { paint(el, s.swatch_fill_listen); });
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  /* As store themes do: a section drawn again in the theme editor is set up again. */
  document.addEventListener("shopify:section:load", start);
})();
`

const THEME_CSS = `
.swd { display: flex; gap: 24px; padding: 24px; }
.sw-list { display: flex; gap: 8px; }
.sw { display: inline-block; width: var(--swatch-size, 32px); height: var(--swatch-size, 32px); border-radius: 50%; background-size: cover; }
body.swatch-shape--square .sw { border-radius: 0; }
.sw[data-soldout="fade"] { opacity: .35; }
.sw[data-soldout="cross"] { opacity: 1; outline: 1px dashed #999; }
`

async function swatchTheme() {
  return importedTheme({ store: true, edit: async (zip) => {
    const schema = JSON.parse(await zip.file("config/settings_schema.json").async("string"))
    schema.push(SWATCHES)
    zip.file("config/settings_schema.json", JSON.stringify(schema, null, 2))
    const data = JSON.parse(await zip.file("config/settings_data.json").async("string"))
    data.current = { ...data.current, ...FIRST }
    zip.file("config/settings_data.json", JSON.stringify(data, null, 2))
    let layout = await zip.file("layout/theme.liquid").async("string")
    if (!layout.includes("<script>window.theme = { settings: { cartType:")) throw new Error("the store's settings script was not found")
    layout = layout
      .replace("<script>window.theme = { settings: { cartType:", `<script type="application/json" id="swatch-settings">{ "fill": {{ settings.swatch_fill_json | json }} }</script>
    <script>window.theme = { settings: { swatchFill: {{ settings.swatch_fill_global | json }}, swatchFillListen: {{ settings.swatch_fill_listen | json }}, cartType:`)
      .replace("{% style %}", "{% style %}\n      :root { --swatch-size: {{ settings.swatch_size }}px; }")
      .replace("{%- if settings.buttons_shadow -%}", "{%- if settings.swatch_border -%}<style>.sw { box-shadow: 0 0 0 2px #111 inset; }</style>{%- endif -%}\n    {%- if settings.buttons_shadow -%}")
      .replace('<body class="template-{{ template.name }}', '<body class="swatch-shape--{{ settings.swatch_shape }} template-{{ template.name }}')
    zip.file("layout/theme.liquid", layout)
    zip.file("sections/swatch-demo.liquid", SECTION)
    const index = JSON.parse(await zip.file("templates/index.json").async("string"))
    index.sections.swatches = { type: "swatch-demo", settings: {} }
    index.order = ["swatches", ...index.order]
    zip.file("templates/index.json", JSON.stringify(index))
    zip.file("assets/materia.js", `${await zip.file("assets/materia.js").async("string")}${THEME_JS}`)
    zip.file("assets/materia.css", `${await zip.file("assets/materia.css").async("string")}${THEME_CSS}`)
  } })
}

/*
  In every frame (the canvas's pages are sandboxed, with no origin, so the
  editor cannot read them): what the swatches look like, said to the editor
  whenever it changes. In the editor: which frame is in front, every frame.
*/
const WATCH = `(() => {
  if (window === top) {
    window.__sw = { sigs: new Map(), log: [] };
    addEventListener("message", (e) => { const d = e.data; if (d && d.__probeSw) window.__sw.sigs.set(e.source, d.sig); }, true);
    let last = "";
    const tick = () => {
      const f = document.querySelector("iframe[data-compat-frame='front']");
      const sig = f ? window.__sw.sigs.get(f.contentWindow) ?? "" : "";
      if (sig !== last) { last = sig; window.__sw.log.push({ at: performance.timeOrigin + performance.now(), sig }); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return;
  }
  let last = null;
  const read = () => {
    const els = document.querySelectorAll("[data-probe-sw]");
    if (els.length) {
      const sig = Array.from(els).map((el) => { const s = getComputedStyle(el); return [el.getAttribute("data-probe-sw"), s.backgroundColor, s.backgroundImage.replace(/^url\\("?[^"]*\\/([^/"]+)"?\\)$/, "$1"), s.width, s.borderTopLeftRadius, s.boxShadow === "none" ? "-" : "b", s.opacity].join(",") }).join("|");
      if (sig !== last) { last = sig; try { parent.postMessage({ __probeSw: 1, sig }, "*"); } catch (e) {} }
    }
    requestAnimationFrame(read);
  };
  requestAnimationFrame(read);
})()`

async function swatchesImported(bundle, css) {
  console.log(`\nIMPORTED THEME (Materia store): Variant swatches${CPU > 1 ? `, CPU slowed ${CPU}x` : ""}`)
  const compat = await swatchTheme()
  const { front, js, errors, close } = await openEditor({ kind: "imported", bundle, css, compat, init: WATCH, cpu: CPU })
  try {
    await js(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Theme" && x.getClientRects().length); b?.click() })
    await sleep(400)
    const opened = await js(() => { const b = [...document.querySelectorAll("[data-wb-sidebar-panel] button")].find((x) => x.textContent.trim() === "Variant swatches" && x.getClientRects().length); if (!b) return false; b.click(); return true })
    if (!opened) throw new Error("no Variant swatches group in Theme settings")
    await sleep(600)
    const sig = () => js(() => { const l = window.__sw.log; return l.length ? l[l.length - 1].sig : "" })
    /* One change by the control's onChange, then the page drawn again from nothing: how long the canvas took to show what the reload shows. */
    const once = async (id, to) => {
      const before = await sig()
      const t0 = await js((id, to) => {
        const scroll = document.querySelector("[data-compat-theme-group] [data-sheet-scroll]")
        const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
        let found = null
        const walk = (f, d) => { for (let c = f; c && !found; c = c.sibling) { const p = c.memoizedProps; if (p && p.field && p.field.id === id && typeof p.onChange === "function") { found = p; return } if (c.child && d < 80) walk(c.child, d + 1) } }
        for (const r of scroll?.children ?? []) { const f0 = fiberOf(r); if (f0) walk(f0, 0); if (found) break }
        if (!found) return null
        const at = performance.timeOrigin + performance.now()
        found.onChange(to)
        return at
      }, id, to)
      if (t0 === null) return { missing: true }
      await sleep(2500 * Math.min(CPU, 2))
      const log = await js((t0) => window.__sw.log.filter((x) => x.at >= t0 - 1), t0)
      const last = log.length ? log[log.length - 1].sig : before
      const f = await within(front(), 3000)
      await within(f.evaluate(() => { window.__probeOld = true; parent.postMessage({ storelib: 1, type: "reload", why: "probe" }, "*") }), 3000)
      let truth = ""
      for (let i = 0; i < 80; i++) {
        await sleep(200)
        const g = await within(front(), 2000)
        const fresh = g && (await within(g.evaluate(() => !window.__probeOld && document.querySelectorAll("[data-probe-sw]").length > 0).catch(() => false), 2000))
        if (fresh) { await sleep(800); truth = await sig(); break }
      }
      const only = TARGET[id]
      const hit = log.find((x) => parts(x.sig, only) === parts(truth, only))
      if (process.env.DEBUG) console.log("        before", before, "\n        truth ", truth, "\n        log   ", JSON.stringify(log.map((x) => [Math.round(x.at - t0), x.sig])))
      return { ms: hit ? Math.round(hit.at - t0) : null, changed: truth !== before, stale: last !== truth }
    }
    const REPEAT = Number(process.env.REPEAT ?? 3)
    for (const [id, to] of Object.entries(NEXT)) {
      const runs = []
      for (let k = 0; k < REPEAT; k++) runs.push(await once(id, k % 2 === 0 ? to : FIRST[id]))
      if (runs.some((r) => r.missing)) { verdict(false, `imported ${id}: no control found`); continue }
      const times = runs.map((r) => r.ms)
      const median = times.includes(null) ? null : [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]
      /* A setting only the theme's start-up script reads is shown by drawing the page again behind: a page load, not a frame. */
      const budget = (RELOADS.has(id) ? 600 : 120) * CPU
      const ok = runs.every((r) => r.changed && !r.stale) && median !== null && median <= budget
      verdict(ok, `imported ${id.padEnd(22)} ${median === null ? "never shown before a reload" : `shown in ${String(median).padStart(4)}ms (median of ${times.join(", ")})`}  budget ${budget}ms${RELOADS.has(id) ? ", drawn again behind" : ""}${runs.every((r) => r.changed) ? "" : "  [changed nothing a reload shows]"}${runs.some((r) => r.stale) ? "  [the canvas ended up unlike the reload]" : ""}`)
    }
  } finally {
    if (errors.length) console.log(`  note  page errors ${JSON.stringify(errors.slice(0, 3))}`)
    await close()
  }
}

/* ── Swatches: the Storelib theme ──────────────────────────────────── */

/* What the product page's swatches and pills look like, every frame, in the editor's own document (the Storelib canvas is not a frame). */
const WATCH_NATIVE = `(() => {
  if (window !== top) return;
  window.__sw = { log: [] };
  let last = "";
  const tick = () => {
    const els = document.querySelectorAll("#wb-preview-root [data-swatch], #wb-preview-root [data-variant-pill]");
    const sig = Array.from(els).map((el) => { const s = getComputedStyle(el); return [el.hasAttribute("data-swatch") ? "swatch" : "pill", s.borderTopLeftRadius, s.borderTopWidth, s.width].join(",") }).join("|");
    if (sig !== last) { last = sig; window.__sw.log.push({ at: performance.timeOrigin + performance.now(), sig }); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`

async function swatchesNative(bundle, css) {
  console.log(`\nSTORELIB THEME: the product page's swatches and variant pills${CPU > 1 ? `, CPU slowed ${CPU}x` : ""}`)
  /* A shirt in two colours (one shown by its variant's photo) and three sizes, one sold out (as scripts/render-product-page.tsx). */
  const v = (id, c, sz, img, available = true) => ({ id, name: `${c} / ${sz}`, options: [c, sz, null], price_cents: 8900, compare_at_cents: null, image_url: `https://example.invalid/${img}.png`, available, left: null, max_quantity: available ? 99 : 0, pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null })
  const product = {
    id: "11111111-1111-4111-8111-111111111111", title: "Field overshirt", slug: "field-overshirt", type: "physical", description: "<p>Twill.</p>", description_html: "<p>Twill.</p>",
    price_cents: 8900, compare_at_cents: null, thumbnail_url: "https://example.invalid/one.png", gallery_urls: ["https://example.invalid/one.png", "https://example.invalid/sand.png"],
    options: [{ name: "Colour", values: ["Black", "Sand"], swatches: { Sand: "photo" } }, { name: "Size", values: ["S", "M", "L"] }],
    variants: [v("v-bs", "Black", "S", "one"), v("v-bm", "Black", "M", "one"), v("v-sm", "Sand", "M", "sand"), v("v-sl", "Sand", "L", "sand", false)],
    inventory_left: null, created_at: new Date().toISOString(),
  }
  const section = { id: "main-product", type: "product", name: "Product", settings: { multiple_images_layout: "stacked", image_width: "55%" }, blocks: [{ id: "b-title", type: "title", settings: {} }, { id: "b-price", type: "price", settings: {} }, { id: "b-picker", type: "variant_picker", settings: {} }, { id: "b-buy", type: "buy_buttons", settings: {} }] }
  const globals = `window.PROBE_PAGES={home:["header","hero_centered","features_grid","text_rich","faq_accordion","cta_simple","product_grid","footer"],product:["header",${JSON.stringify(section)},"footer"]};window.PROBE_PAGE_DELAY_MS=0;window.PROBE_PRODUCTS=${JSON.stringify([product])};`
  const { page, js, errors, close } = await openEditor({ kind: "storelib", bundle, css, globals, init: WATCH_NATIVE, cpu: CPU })
  try {
    /* The product page, from the page menu, as a person opens it. */
    await page.click("[data-page-switcher]")
    await page.waitForFunction(() => !!document.querySelector(".wb-pages-menu"), { timeout: 8000 })
    await sleep(300)
    await js((id) => { const menu = document.querySelector(".wb-pages-menu"); if (!menu.querySelector(`[data-page-row='product:${id}']`)) menu.querySelector("[data-page-group-toggle='products']")?.click() }, product.id)
    await page.waitForFunction((id) => !!document.querySelector(`.wb-pages-menu [data-page-row='product:${id}']`), { timeout: 8000 }, product.id)
    await js((id) => { const el = document.querySelector(`.wb-pages-menu [data-page-row='product:${id}']`); (el.matches("button, a") ? el : el.querySelector("button, a") ?? el).click() }, product.id)
    await page.waitForFunction(() => !!document.querySelector("#wb-preview-root [data-swatch]"), { timeout: 20000 }).catch(() => {})
    await sleep(1200)
    const sig = () => js(() => { const l = window.__sw.log; return l.length ? l[l.length - 1].sig : "" })
    if (!(await sig())) throw new Error("no swatch or variant pill on the Storelib theme's product page")
    /* The control's own onChange, found by its field id: the field's row (props.field), then the first control under it that takes onChange. */
    const change = (id, to) => js((id, to) => {
      const scroll = document.querySelector("[data-wb-sidebar-panel]")
      const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
      let found = null
      const under = (f, d) => { for (let c = f; c; c = c.sibling) { const p = c.memoizedProps; if (p && typeof p.onChange === "function") return p; const x = c.child && d < 30 ? under(c.child, d + 1) : null; if (x) return x } return null }
      const walk = (f, d) => { for (let c = f; c && !found; c = c.sibling) { const p = c.memoizedProps; if (p && p.field && p.field.id === id) { found = typeof p.onChange === "function" ? p : under(c.child, 0); if (found) return } if (c.child && d < 90) walk(c.child, d + 1) } }
      for (const r of scroll?.children ?? []) { const f0 = fiberOf(r); if (f0) walk(f0, 0); if (found) break }
      if (!found) return null
      const at = performance.timeOrigin + performance.now()
      found.onChange(to)
      return at
    }, id, to)
    const measure = async (label, id, to) => {
      const before = await sig()
      const t0 = await change(id, to)
      if (t0 === null) { verdict(false, `storelib ${label}: no control found`); return }
      await sleep(1500)
      const log = await js((t0) => window.__sw.log.filter((x) => x.at >= t0 - 1), t0)
      const after = await sig()
      const hit = log.find((x) => x.sig === after)
      const ms = hit ? Math.round(hit.at - t0) : null
      const budget = 120 * CPU
      verdict(after !== before && ms !== null && ms <= budget, `storelib ${label.padEnd(30)} ${after !== before ? `shown in ${String(ms).padStart(4)}ms` : "changed nothing on the canvas"} (budget ${budget}ms)`)
    }
    /* Theme settings › Buttons and inputs › Variant pills. */
    await js(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Theme" && x.getClientRects().length); b?.click() })
    await sleep(400)
    await js(() => { const b = [...document.querySelectorAll("[data-wb-sidebar-panel] button")].find((x) => /^Buttons and inputs/.test(x.textContent.trim()) && x.getClientRects().length); b?.click() })
    await sleep(600)
    await measure("pill_radius -> 4", "pill_radius", 4)
    await measure("pill_border_width -> 3", "pill_border_width", 3)
    /* The product section's Variant picker block: its swatch shape and its swatches switch. */
    await js(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Sections" && x.getClientRects().length); b?.click() })
    await sleep(300)
    const picker = await page.$("#wb-preview-root [data-variant-picker]")
    if (picker) { await picker.click(); await sleep(900) }
    await measure("swatch_shape -> square", "swatch_shape", "square")
    await measure("swatches -> off", "swatches", false)
  } finally {
    if (errors.length) console.log(`  note  page errors ${JSON.stringify(errors.slice(0, 3))}`)
    await close()
  }
}

async function main() {
  if (PART === "all" || PART.startsWith("swatches")) {
    const { bundle, css } = await import("./editor-probe-harness.mjs")
    if (PART !== "swatches:native") await swatchesImported(bundle, css)
    if (PART !== "swatches:imported") await swatchesNative(bundle, css)
  }
  if (PART === "all" || PART === "fonts") {
    const { fontsPart } = await import("./check-themeset-r13-fonts.mjs")
    for (const x of await fontsPart(OUT)) verdict(x.ok, x.line)
  }
  writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2))
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
