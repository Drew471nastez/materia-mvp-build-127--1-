/**
 * ===========================================================================
 *  EVERY LAYOUT, BUTTON AND TEXT SETTING, ON THE PAGE AND IN THE PREVIEW
 * ===========================================================================
 * Round W8, the owner: "Layout settings must all work and apply live in the
 * preview and on the published page", "Buttons settings must all work 100%",
 * and the same for Text. scripts/render-onepage-settings-w8.tsx draws the real
 * published page and the real editor (its preview frame) with one look per
 * row below. For each control, each value is drawn on its own and the probe
 * reads what the browser computes (getComputedStyle, boxes, hover):
 *
 *   own        the value's own result (a gap, a radius, a colour, a side...)
 *   distinct   the values of one control draw differently from each other
 *   preview    the editor's preview frame computes the same styles as the page
 *
 *   node scripts/check-onepage-settings-w8.mjs          (ONLY=<group> for one control,
 *                                                       TEMPLATE=<theme id> over a theme, LIVE_W=1280 the computer's page)
 *   REPORT=1 prints the matrix without failing.
 */
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const ONLY = process.env.ONLY || ""
const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
/* TEMPLATE=<theme id> runs the matrix over a theme's own look instead of a plain page (the expectations read the theme drawn). */
const TEMPLATE = process.env.TEMPLATE || ""
/* LIVE_W=1280 reads the published page at a computer's width (its own desktop layout); 390 by default, the phone. */
const LIVE_W = Number(process.env.LIVE_W) || 390
const plain = { background_type: "solid", background_color: "#f6f5f2", text_color: "#1a1a2e", button_style: "filled", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 12, button_border_width: 0, button_border_color: "#1a1a2e", button_shadow: "none", button_hover_animation: "none" }
const base0 = TEMPLATE ? {} : plain

/* [group, value name, theme, settings, anim] */
const ROWS = []
const row = (group, name, theme = {}, settings = {}, anim = null) => ROWS.push({ group, name, theme: { ...base0, ...theme }, settings, anim })
for (const [n, v] of [["Tight", "compact"], ["Normal", "normal"], ["Roomy", "comfortable"]]) row("spacing", n, { spacing: v })
for (const [n, v] of [["As set", null], ["Grid", "grid"], ["Rows", "rows"]]) row("products", n, { product_layout: v })
for (const [n, v] of [["Centred", "center"], ["Left", "left"]]) row("header", n, { header_align: v })
for (const v of ["glass", "white", "black"]) row("share", v, {}, { share_style: v })
for (const v of ["glass", "white", "black"]) row("subscribe", v, {}, { subscribe_style: v })
for (const [n, t] of [["Solid", { button_style: "filled" }], ["Soft", { button_style: "soft", button_text_color: "#1a1a2e" }], ["Outline", { button_style: "outline", button_text_color: "#1a1a2e" }], ["Glass", { button_style: "glass", button_text_color: "#1a1a2e" }]]) row("style", n, t)
for (const [n, r] of [["Square", 0], ["Rounded", 12], ["Pill", 999], ["Corners 20px", 20], ["Corners 4px", 4]]) row("shape", n, { button_border_radius: r })
for (const [n, s] of [["Small", "compact"], ["Medium", "regular"], ["Large", "large"]]) row("size", n, { button_size: s })
for (const [n, t] of [["Text in the middle", { button_text_align: "center" }], ["Text on the left", { button_text_align: "left" }], ["Icon on the left", { button_icon_position: "left" }], ["Icon on the right", { button_icon_position: "right" }]]) row("textIcon", n, t)
for (const [n, t] of [["None", { button_shadow: "none" }], ["Soft", { button_shadow: "subtle" }], ["Strong", { button_shadow: "strong" }], ["Hard", { button_shadow: "hard" }], ["Strong, blue", { button_shadow: "strong", button_shadow_color: "#2340c7" }]]) row("shadow", n, t)
for (const w of [0, 1, 2, 3, 4]) row("border", `${w}px`, { button_border_width: w, button_border_color: "#d42d17" })
row("border", "Outline 1px draws 2px", { button_style: "outline", button_border_width: 1, button_border_color: "#2340c7", button_color: "#2340c7", button_text_color: "#2340c7" })
for (const [n, t] of [["Button #f0a24a", { button_color: "#f0a24a" }], ["Button text #fde047", { button_text_color: "#fde047" }], ["Border #12695e", { button_border_width: 2, button_border_color: "#12695e" }]]) row("colours", n, t)
for (const [n, h] of [["None", "none"], ["Lift", "lift"], ["Bigger", "zoom"], ["Glow", "glow"], ["Fill", "fill"], ["Fill and lift", "pop"], ["Underline", "underline"]]) row("hover", n, { button_hover_animation: h })
row("hoverColours", "Fill, own colours", { button_hover_animation: "fill", button_hover_fill: "#d42d17", button_hover_text: "#fef3c7" })
row("hoverColours", "Fill, Reset", { button_hover_animation: "fill", button_hover_fill: null, button_hover_text: null })
for (const a of ["pulse", "bounce", "shake", "glow", "swipe"]) row("sparkle", a, {}, {}, a)
for (const [n, f] of [["Inter", "'Inter', sans-serif"], ["Playfair", "'Playfair Display', serif"], ["Poppins", "'Poppins', sans-serif"]]) row("pageFont", n, { font_family: f })
for (const [n, f] of [["Same as page", null], ["Bebas Neue", "'Bebas Neue', sans-serif"], ["Pacifico", "'Pacifico', cursive"]]) row("titleFont", n, { title_font: f })
for (const w of ["title", "bio"]) {
  for (const s of ["small", null, "large"]) row(`${w}Size`, s ?? "default", { [`${w}_size`]: s })
  for (const v of w === "title" ? [400, 500, null, 800] : [null, 500, 600]) row(`${w}Weight`, String(v ?? (w === "title" ? 700 : 400)), { [`${w}_weight`]: v })
  for (const v of ["tight", null, "wide"]) row(`${w}Tracking`, v ?? "normal", { [`${w}_tracking`]: v })
  for (const v of [null, "upper"]) row(`${w}Case`, v ?? "as typed", { [`${w}_case`]: v })
}
for (const [n, t] of [["Title = text", { title_color: null }], ["Title #d42d17", { title_color: "#d42d17" }]]) row("titleColour", n, t)
for (const [n, c] of [["#1a1a2e", "#1a1a2e"], ["#2340c7", "#2340c7"]]) row("textColour", n, { text_color: c })
for (const [n, c] of [["#6b7280", "#6b7280"], ["#12695e", "#12695e"]]) row("secondaryColour", n, { secondary_text_color: c })

const SEL = ROWS.map((r, i) => ({ ...r, i })).filter((r) => !ONLY || ONLY.split(",").includes(r.group))
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-settings-w8.tsx" })
const HOVER_ARGS = ["--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* What the browser computes, in the page or the preview frame. */
const READ = () => {
  const vis = (el) => el && el.getClientRects().length > 0
  const link = (t) => [...document.querySelectorAll("a.op-btn, button.op-btn")].find((e) => vis(e) && (e.textContent || "").includes(t))
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } }
  const b1 = link("Shop the prints"), b2 = link("Follow on Instagram"), b3 = link("New drop")
  const cs = (el) => el && getComputedStyle(el)
  const btn = (el) => {
    if (!el) return null
    const c = cs(el), r = box(el), label = el.querySelector(".op-label") || el
    const icon = el.querySelector("svg, img")
    const lr = box(label), ir = icon ? box(icon) : null
    return { bg: c.backgroundColor, color: c.color, radius: c.borderTopLeftRadius, bw: c.borderTopWidth, bc: c.borderTopColor, shadow: c.boxShadow, h: r.h, w: r.w, align: cs(label).textAlign, labelLeft: lr.l - r.l, labelRight: r.r - lr.r, iconLeft: ir ? ir.l - r.l : null, iconRight: ir ? r.r - ir.r : null, font: c.fontFamily, hover: el.getAttribute("data-hover"), anim: [c.animationName, getComputedStyle(el, "::before").animationName, getComputedStyle(el, "::after").animationName].find((a) => a && a !== "none") || "none", cls: el.className }
  }
  const header = document.querySelector("[data-op-header]")
  const h1 = header?.querySelector("h1") || document.querySelector("h1")
  /* The classic header's bio or the hero header's (data-hero-header). */
  const bio = [...document.querySelectorAll("p")].find((p) => vis(p) && (p.textContent || "").trim() === "Prints, posters and a newsletter")
  const avatar = header?.querySelector("img")
  const hb = box(header)
  const heading = [...document.querySelectorAll("h2, h3, p")].find((e) => vis(e) && e.textContent.trim() === "Work with me")
  const text = [...document.querySelectorAll("p, div")].find((e) => vis(e) && e.children.length === 0 && e.textContent.trim() === "Prints made by hand in small runs.")
  const products = [...document.querySelectorAll("[data-product-block]")].filter(vis).map((e) => ({ kind: e.getAttribute("data-product-block"), ...box(e) }))
  const share = document.querySelector("[data-onepage-share-button]")
  const sub = [...document.querySelectorAll("button")].find((e) => (e.getAttribute("aria-label") || "").startsWith("Subscribe to"))
  const type = (el) => el && { font: cs(el).fontFamily, size: cs(el).fontSize, weight: cs(el).fontWeight, tracking: cs(el).letterSpacing, case: cs(el).textTransform, color: cs(el).color, align: cs(el).textAlign }
  return {
    /* The gap between blocks: between consecutive blocks of the page's column that sit one under the other (in Grid and
       Mixed tiles two links share a row, so the first two links are not always one under the other). */
    gap: (() => {
      const col = document.querySelector("[data-block-layout]")
      const kids = col ? [...col.children].filter(vis).map(box) : []
      const gaps = []
      for (let i = 1; i < kids.length; i++) if (kids[i].t >= kids[i - 1].b - 0.5) gaps.push(Math.round(kids[i].t - kids[i - 1].b))
      if (!gaps.length) return null
      const count = {}
      for (const g of gaps) count[g] = (count[g] || 0) + 1
      return Number(Object.entries(count).sort((a, b) => b[1] - a[1])[0][0])
    })(),
    tile: !!(b2 && b2.closest("[data-link-tile], [data-block-size=half]")),
    b1: btn(b1), b2: btn(b2), b3: btn(b3),
    h1: type(h1), bio: type(bio), heading: type(heading), text: type(text),
    h1Left: h1 && hb ? Math.round(box(h1).l - hb.l) : null,
    avatarLeft: avatar && hb ? Math.round(box(avatar).l - hb.l) : null,
    products,
    share: share ? cs(share).backgroundColor : null,
    theme: window.__probeTheme || null,
    sub: sub ? cs(sub).backgroundColor : null,
  }
}

/* The hovered link: what moves and what fills. */
async function hovered(page, text, ctx = page) {
  const el = (await ctx.evaluateHandle((t) => [...document.querySelectorAll("a.op-btn")].find((e) => (e.textContent || "").includes(t)), text)).asElement()
  if (!el) return null
  await el.evaluate((e) => e.scrollIntoView({ block: "center" }))
  await sleep(150)
  /* In the preview the frame is zoomed (components/onepage/live-preview), which puppeteer's boxes leave out: map by hand. */
  const inner = await el.evaluate((e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  const at = ctx === page ? inner : await page.evaluate((x, y) => {
    const f = [...document.querySelectorAll("iframe")].find((i) => (i.src || "").includes("onepage-preview")) || document.querySelector("iframe")
    const r = f.getBoundingClientRect(), z = Number(getComputedStyle(f).zoom) || 1
    return { x: r.left + x * z, y: r.top + y * z }
  }, inner.x, inner.y)
  await page.mouse.move(at.x, at.y)
  await sleep(600)
  const h = await el.evaluate((e) => {
    const c = getComputedStyle(e), before = getComputedStyle(e, "::before"), after = getComputedStyle(e, "::after")
    const label = e.querySelector(".op-label")
    const u = label ? getComputedStyle(label, "::after") : null
    return { translate: c.translate, scale: c.scale, color: c.color, beforeOpacity: before.opacity, beforeShadow: before.boxShadow, afterOpacity: after.opacity, afterBg: after.backgroundColor, underline: u ? u.scale : null, opacity: c.opacity }
  })
  await page.mouse.move(2, 2)
  await sleep(300)
  return h
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", "--disable-gpu", "--window-size=390,844", "--hide-scrollbars", ...HOVER_ARGS] })
/* At a pixel ratio of 2, as a creator's screen: at 1 the zoomed phone frame snaps 1px and 2px borders to one device pixel. */
const editorBrowser = await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,900", "--hide-scrollbars", "--force-device-scale-factor=2", ...HOVER_ARGS] })
async function open(b, path, v) {
  const page = await b.newPage()
  /* The page at a phone's width (a window cannot be narrower than 500px); no touch, so the mouse still hovers. */
  if (b === browser) await page.setViewport({ width: LIVE_W, height: LIVE_W > 640 ? 900 : 844 })
  /* The two products as the creator's catalogue has them, so the preview (which asks the catalogue) draws them as the page does. */
  await page.evaluateOnNewDocument(() => { window.PROBE_PRODUCTS = [1, 2].map((n) => ({ id: `6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c0${n}`, title: n === 1 ? "Strength Blueprint" : "Meal plan PDF", slug: `p${n}`, price_cents: 1900 + n * 100, thumbnail_url: null, type: "digital", status: "published", archived: false })) })
  if (TEMPLATE) await page.evaluateOnNewDocument((id) => { window.PROBE_TEMPLATE = id }, TEMPLATE)
  await page.evaluateOnNewDocument((all) => { window.PROBE_VARIANTS = all }, ROWS.map((r) => ({ theme: r.theme, settings: r.settings, anim: r.anim })))
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/plain", body: "" })
    void r.continue()
  })
  await page.goto(`${base}${path}${path.includes("?") ? "&" : "?"}v=${v}`, { waitUntil: "domcontentloaded", timeout: 120000 })
  return page
}

const results = []
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
  return ok
}
try {
  for (const r of SEL) {
    const live = await open(browser, "/app/onepage?live", r.i)
    await live.waitForSelector(".op-btn", { timeout: 90000 })
    await sleep(900)
    const m = await live.evaluate(READ)
    if (["hover", "hoverColours"].includes(r.group)) m.hovered = await hovered(live, "Shop the prints")
    await live.close()
    /* The editor's preview frame, drawn from what the editor posts to it. */
    const editor = await open(editorBrowser, "/app/onepage", r.i)
    let frame = null
    for (let k = 0; k < 120 && !frame; k++) {
      frame = editor.frames().find((f) => f.url().includes("onepage-preview")) || null
      if (frame && !(await frame.$(".op-btn").catch(() => null))) frame = null
      if (!frame) await sleep(150)
    }
    let p = null
    if (frame) {
      await sleep(900)
      p = await frame.evaluate(READ)
      if (["hover", "hoverColours"].includes(r.group)) p.hovered = await hovered(editor, "Shop the prints", frame)
    }
    await editor.close()
    results.push({ ...r, live: m, preview: p })
    process.stdout.write(".")
  }
} finally {
  await browser.close()
  await editorBrowser.close()
  server.close()
}
console.log("")

const rgb = (hex) => { const h = hex.replace("#", ""); return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})` }
const lum = (c) => { const m = /(\d+), (\d+), (\d+)/.exec(c || ""); return m ? (0.299 * m[1] + 0.587 * m[2] + 0.114 * m[3]) / 255 : null }
const groups = [...new Set(results.map((r) => r.group))]
const matrix = []
const of = (g) => results.filter((r) => r.group === g)
const distinct = (g, f, label) => {
  const list = of(g)
  for (const surface of ["live", "preview"]) {
    let vals = list.map((r) => (r[surface] ? JSON.stringify(f(r[surface], r)) : "missing"))
    /* An outline's 0, 1 and 2px are one border: one of them stands for all three. */
    if (g === "border" && list[0].live.theme?.button_style === "outline") vals = [...new Set(vals)]
    if (g === "textIcon" && list[0].live.tile) return
    expect(new Set(vals).size === vals.length && !vals.includes("missing"), `${g}: every value draws differently on the ${surface === "live" ? "page" : "preview"} (${label})`, list.map((r, i) => `${r.name}=${vals[i]}`).join(" | "))
  }
}
/* The preview computes what the page computes, for style (boxes are zoomed in the phone frame). */
const SAME = { b1: ["bg", "color", "radius", "bc", "shadow", "align", "font", "hover", "anim"], b3: ["anim"], h1: ["font", "weight", "case", "color", "align"], bio: ["font", "weight", "case", "color", "align"], heading: ["font", "color"], text: ["font", "color"] }
const previewSame = (r) => {
  if (!r.preview) return expect(false, `${r.group} / ${r.name}: the preview drew the page`)
  const diff = []
  for (const [k, props] of Object.entries(SAME)) for (const q of props) if (r.live[k] && r.preview[k] && r.live[k][q] !== r.preview[k][q]) diff.push(`${k}.${q}: page ${r.live[k][q]} / preview ${r.preview[k][q]}`)
  if (r.live.share !== r.preview.share) diff.push(`share: ${r.live.share} / ${r.preview.share}`)
  if (r.live.sub !== r.preview.sub) diff.push(`subscribe: ${r.live.sub} / ${r.preview.sub}`)
  return expect(diff.length === 0, `${r.group} / ${r.name}: the preview computes what the page computes`, diff.length ? diff.join("; ") : undefined)
}

for (const g of groups) {
  console.log(`\n${g}`)
  const L = of(g)
  const by = (n) => L.find((r) => r.name === n)
  for (const r of L) {
    const m = r.live, t = { ...r.theme, ...(m.theme || {}) }
    let own = true
    const filled = (t.button_style || "filled") === "filled"
    switch (g) {
      case "spacing": break
      case "products": {
        const [a, b] = m.products
        if (r.name === "Grid") own = expect(a && b && Math.abs(a.t - b.t) < 2 && b.l > a.r - 2, "Grid: the two products side by side", m.products)
        else if (r.name === "Rows") own = expect(a && b && b.t >= a.b - 1 && a.kind !== by("As set").live.products[0]?.kind, "Rows: stacked, drawn as rows", m.products.map((p) => p.kind))
        else own = expect(a && b && b.t >= a.b - 1, "As set: each as its block says (stacked callouts)", m.products.map((p) => p.kind))
        break
      }
      case "header": if (t.header_layout === "hero") break; own = expect(r.name === "Left" ? m.h1.align === "left" && m.avatarLeft < 4 : m.h1.align === "center" && m.avatarLeft > 40, `${r.name}: name ${m.h1.align}, photo ${m.avatarLeft}px from the edge`); break
      case "share": case "subscribe": {
        const c = g === "share" ? m.share : m.sub, l = lum(c), am = /rgba\(.*, (0?\.\d+)\)/.exec(c || ""), a = am ? Number(am[1]) : 1
        own = expect(r.name === "white" ? l > 0.9 && a >= 0.9 : r.name === "black" ? l !== null && l < 0.2 && a >= 0.7 : a < 0.5, `${r.name}: ${c}`)
        break
      }
      case "style": own = expect(t.button_style === "filled" ? m.b1.bg === rgb(t.button_color) : t.button_style === "outline" ? m.b1.bg === "rgba(0, 0, 0, 0)" && parseFloat(m.b1.bw) >= 2 : t.button_style === "glass" ? m.b1.bg === "rgba(255, 255, 255, 0.15)" : /0\.14|color-mix|srgb/.test(m.b1.bg), `${r.name}: fill ${m.b1.bg}, border ${m.b1.bw}`); break
      case "shape": own = expect(t.button_border_radius === 999 ? parseFloat(m.b1.radius) >= m.b1.h / 2 : m.b1.radius === `${t.button_border_radius}px`, `${r.name}: radius ${m.b1.radius}`); break
      case "size": break
      case "textIcon": {
        if (r.name === "Text on the left") own = expect(m.b1.labelLeft < 40 && m.b1.align === "left", `left: words ${Math.round(m.b1.labelLeft)}px from the left`)
        else if (r.name === "Text in the middle") own = expect(Math.abs(m.b1.labelLeft - m.b1.labelRight) < 4 || m.b1.align === "center", `middle: ${Math.round(m.b1.labelLeft)} / ${Math.round(m.b1.labelRight)}`)
        else if (m.tile) console.log(`  --    ${r.name}: the links are tiles here (Grid or Mixed tiles), their icon above their words`)
        else if (r.name === "Icon on the right") own = expect(m.b2.iconRight < 40 && m.b2.iconLeft > 100, `icon right: ${Math.round(m.b2.iconLeft)} / ${Math.round(m.b2.iconRight)}`)
        else own = expect(m.b2.iconLeft < 40, `icon left: ${Math.round(m.b2.iconLeft)}`)
        break
      }
      case "shadow": {
        const c = rgb(t.button_shadow_color || "#000000").replace("rgb(", "rgba(").replace(")", "")
        own = expect(t.button_shadow === "none" ? m.b1.shadow === "none" : m.b1.shadow.startsWith(c), `${r.name}: ${m.b1.shadow}`)
        break
      }
      case "border": {
        const want = t.button_style === "outline" ? Math.max(2, t.button_border_width) : t.button_border_width
        own = expect(m.b1.bw === `${want}px` && (want === 0 || m.b1.bc === rgb(t.button_border_color)), `${r.name}: ${m.b1.bw} ${m.b1.bc}`)
        break
      }
      case "colours":
        if (r.name.startsWith("Button #")) own = expect(filled ? m.b1.bg === rgb(t.button_color) : t.button_style === "glass" ? true : m.b1.bg !== by("Button text #fde047").live.b1.bg || t.button_style === "outline", `${r.name}: ${m.b1.bg}`)
        else if (r.name.startsWith("Button text")) own = expect(m.b1.color === rgb(t.button_text_color), `${r.name}: ${m.b1.color}`)
        else own = expect(m.b1.bc === rgb(t.button_border_color) && m.b1.bw === "2px", `${r.name}: ${m.b1.bw} ${m.b1.bc}`)
        break
      case "hover": {
        for (const [where, h] of [["page", m.hovered], ["preview", r.preview?.hovered]]) {
          const idle = h && h.translate === "none" && (h.scale === "none" || h.scale === "1") && Number(h.afterOpacity) < 0.06 && Number(h.beforeOpacity) === 0 && h.underline !== "1"
          const want = {
            none: idle,
            lift: h && /-2px/.test(h.translate),
            zoom: h && /1\.03/.test(h.scale),
            glow: h && Number(h.beforeOpacity) === 1 && h.translate === "none",
            fill: h && Number(h.afterOpacity) === 1 && h.translate === "none",
            pop: h && Number(h.afterOpacity) === 1 && /-2px/.test(h.translate),
            underline: h && /^1( 1)?$/.test(String(h.underline)),
          }[t.button_hover_animation]
          own = expect(!!want, `${r.name} on the ${where}: hovered ${JSON.stringify(h)}`) && own
        }
        break
      }
      case "hoverColours": {
        for (const [where, h] of [["page", m.hovered], ["preview", r.preview?.hovered]]) {
          if (r.name.includes("own")) own = expect(h && h.afterBg === rgb(t.button_hover_fill) && h.color === rgb(t.button_hover_text), `own colours on the ${where}: fill ${h?.afterBg}, words ${h?.color}`) && own
          else own = expect(h && (filled ? h.afterBg === rgb(t.button_text_color) && h.color === rgb(t.button_color) : h.afterBg === rgb(t.button_color)), `Reset on the ${where}: a solid button turns to its text colour (${h?.afterBg}) with the button colour's words (${h?.color})`) && own
        }
        break
      }
      case "sparkle": own = expect(m.b3.anim !== "none" && m.b1.anim === "none" && m.b2.anim === "none", `${r.name}: the one link moves (${m.b3.anim}), the others do not (${m.b1.anim})`); break
      case "pageFont": own = expect(m.b1.font.includes(r.name === "Playfair" ? "Playfair" : r.name) && m.text?.font.includes(r.name === "Playfair" ? "Playfair" : r.name), `${r.name}: link ${m.b1.font}, text ${m.text?.font}`); break
      case "titleFont": own = expect(t.title_font ? m.h1.font.includes(r.name) : m.h1.font === m.b1.font, `${r.name}: name in ${m.h1.font}`); break
      case "titleColour": own = expect(m.h1.color === rgb(t.title_color || t.text_color), `${r.name}: ${m.h1.color}`); break
      /* Text is the titles' and headings' colour; Secondary text the bio and the small print, a text block's words among them (Design › Text says so). */
      case "textColour": own = expect(m.heading?.color === rgb(t.text_color) && m.h1.color === rgb(t.text_color), `${r.name}: heading ${m.heading?.color}, name ${m.h1.color}`); break
      case "secondaryColour": own = expect(m.bio?.color === rgb(t.secondary_text_color) && m.text?.color === rgb(t.secondary_text_color), `${r.name}: bio ${m.bio?.color}, text ${m.text?.color}`); break
      default: {
        const which = g.startsWith("title") ? "h1" : "bio"
        const v = m[which]
        if (g.endsWith("Weight")) own = expect(v && v.weight === r.name, `${r.name}: ${v?.weight}`)
        if (g.endsWith("Case")) own = expect(v && v.case === (r.name === "upper" ? "uppercase" : "none"), `${r.name}: ${v?.case}`)
      }
    }
    const prev = previewSame(r)
    matrix.push({ control: g, value: r.name, page: own ? "pass" : "FAIL", preview: prev ? "pass" : "FAIL" })
  }
  /* The values of one control are told apart. */
  const D = {
    spacing: [(m) => m.gap, "gap between blocks"],
    products: [(m) => m.products.map((p) => [p.kind, Math.round(p.l), Math.round(p.w)]), "product boxes"],
    header: [(m) => [m.h1.align, m.avatarLeft > 4], "name alignment, photo side"],
    share: [(m) => m.share, "share fill"],
    subscribe: [(m) => m.sub, "subscribe fill"],
    style: [(m) => [m.b1.bg, m.b1.bw], "fill and border"],
    shape: [(m) => m.b1.radius, "radius"],
    size: [(m) => Math.round(m.b1.h), "height"],
    shadow: [(m) => m.b1.shadow, "shadow"],
    /* An outline is at least 2px: its 0, 1 and 2 are one border (the Buttons panel says so). */
    border: [(m, r) => [r.name.startsWith("Outline") ? "outline" : (m.theme?.button_style === "outline" && parseFloat(m.b1.bw) <= 2 ? "2px" : m.b1.bw), m.b1.bc], "border"],
    hover: [(m) => m.hovered, "hovered"],
    sparkle: [(m) => m.b3.anim, "animation"],
    pageFont: [(m) => m.b1.font, "font"],
    titleFont: [(m) => m.h1.font, "font"],
    titleSize: [(m) => m.h1.size, "size"],
    titleWeight: [(m) => m.h1.weight, "weight"],
    titleTracking: [(m) => m.h1.tracking, "letter spacing"],
    titleCase: [(m) => m.h1.case, "case"],
    bioSize: [(m) => m.bio?.size, "size"],
    bioWeight: [(m) => m.bio?.weight, "weight"],
    bioTracking: [(m) => m.bio?.tracking, "letter spacing"],
    bioCase: [(m) => m.bio?.case, "case"],
    titleColour: [(m) => m.h1.color, "colour"],
    textColour: [(m) => m.heading?.color, "colour"],
    secondaryColour: [(m) => m.bio?.color, "colour"],
  }
  const notOffered = (g === "spacing" && of(g)[0].live.theme?.block_layout === "compact") || (g === "header" && of(g)[0].live.theme?.header_layout === "hero")
  if (notOffered) console.log(`  --    ${g}: not offered with this theme's layout`)
  else if (D[g]) {
    distinct(g, D[g][0], D[g][1])
    if (["spacing", "size", "titleSize", "bioSize"].includes(g)) {
      for (const s of ["live", "preview"]) {
        const v = L.map((r) => r[s] && parseFloat(D[g][0](r[s])))
        expect(v.every((x, i) => i === 0 || x > v[i - 1]), `${g}: grows from the first value to the last on the ${s === "live" ? "page" : "preview"}`, v)
      }
    }
  }
}

console.log("\nMATRIX")
for (const m of matrix) console.log(`  ${m.control.padEnd(16)} ${m.value.padEnd(24)} page ${m.page.padEnd(5)} preview ${m.preview}`)
if (broken && !report) {
  console.error(`\n${broken} failed`)
  process.exit(1)
}
console.log(broken ? `\n${broken} would fail (REPORT)` : "\nall passed")
