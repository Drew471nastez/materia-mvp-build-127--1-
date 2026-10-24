/**
 * ===========================================================================
 *  EVERY THEME SETTING REACHES THE CANVAS, AS A RELOAD WOULD SHOW IT (round BC)
 * ===========================================================================
 * The owner: "Theme settings, Variant Swatches, Display style switched to
 * Variant images or Color swatches: the canvas does not change until I
 * reload." Every setting of a theme's settings_schema.json is changed in
 * turn from Theme settings, by the control's own onChange, in the real
 * editor (scripts/editor-probe-harness.mjs's bundle). Once the canvas has
 * settled, what the page in the frame holds is read:
 *
 *   SCRIPTS   the text of every inline script (a theme's settings printed
 *             for its JavaScript: window.theme = {...}, a JSON block)
 *   STYLES    every stylesheet's rules, as the browser holds them
 *   HEAD      the head's links and metas
 *   ROOT      <html>'s and <body>'s classes and data
 *   SECTIONS  each section's elements: tag, classes, data and the words in it
 *   JS        what the theme's JavaScript made of its settings (the probe's
 *             own swatch script below writes it on <body>)
 *
 * A change the canvas showed by loading the page again behind the one on
 * screen (a setting the theme's start-up script reads) says so.
 *
 * Then the page is drawn again from nothing (the frame asks for a reload, as
 * one that cannot take a change does), and read again. A part that differs
 * is a setting that did not reach the canvas until a reload.
 *
 * The Materia store (scripts/materia-store-kit.mjs) is given a "Variant
 * swatches" group the way store themes print it: a Display style select
 * printed in the theme's settings script its JavaScript reads once at start
 * (which then draws the swatches), and a Swatch size range printed there
 * and in a CSS variable.
 *
 *   npx tsx scripts/check-settings-reach-canvas.mjs [dawn.zip]
 *   THEME=materia|dawn     one of the two (both by default; Dawn needs the zip)
 *   ONLY=<regexp>          only the settings whose id matches
 *   BUDGET=0               report without failing
 */
import { readFileSync } from "node:fs"
import JSZip from "jszip"
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"

const BUDGET = process.env.BUDGET !== "0"
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
let broken = 0
/* A frame taken away while it is read never answers (the devtools protocol waits minutes): read with a limit. */
const within = (p, ms = 8000) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))])

/* ── The themes ─────────────────────────────────────────────────────── */

const SWATCHES = { name: "Variant swatches", settings: [
  { type: "select", id: "swatch_display_style", label: "Display style", options: [{ value: "variant_images", label: "Variant images" }, { value: "color_swatches", label: "Color swatches" }, { value: "buttons", label: "Buttons" }], default: "buttons" },
  { type: "range", id: "swatch_size", label: "Swatch size", min: 20, max: 60, step: 2, unit: "px", default: 32 },
] }

async function materia() {
  return importedTheme({ store: true, edit: async (zip) => {
    const schema = JSON.parse(await zip.file("config/settings_schema.json").async("string"))
    schema.push(SWATCHES)
    zip.file("config/settings_schema.json", JSON.stringify(schema, null, 2))
    const data = JSON.parse(await zip.file("config/settings_data.json").async("string"))
    data.current = { ...data.current, swatch_display_style: "buttons", swatch_size: 32 }
    zip.file("config/settings_data.json", JSON.stringify(data, null, 2))
    let layout = await zip.file("layout/theme.liquid").async("string")
    if (!layout.includes("<script>window.theme = { settings: { cartType:")) throw new Error("the store's settings script was not found")
    layout = layout
      .replace("<script>window.theme = { settings: { cartType:", "<script>window.theme = { settings: { swatchStyle: {{ settings.swatch_display_style | json }}, swatchSize: {{ settings.swatch_size | json }}, cartType:")
      .replace("{% style %}", "{% style %}\n      :root { --swatch-size: {{ settings.swatch_size }}px; }")
      .replace("</body>", `<div class="swatches" data-swatches></div>
    <script>(function () { var s = (window.theme && window.theme.settings) || {}; var el = document.querySelector("[data-swatches]"); if (el) el.innerHTML = s.swatchStyle === "color_swatches" ? '<span class="swatch swatch--color"></span>' : s.swatchStyle === "variant_images" ? '<img class="swatch swatch--image" alt="">' : '<button class="swatch swatch--button">S</button>'; document.body.setAttribute("data-probe-js", String(s.swatchStyle) + "|" + String(s.swatchSize)); })();</script>
  </body>`)
    zip.file("layout/theme.liquid", layout)
  } })
}

async function dawn(zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert.ts")
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  const t = r.theme
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  return { settings: t.settings, pages, sources, files, all: t.files }
}

/* Another value of a field's type, from the field and the value it shows: { value } or { skip }. Run in the editor's page. */
const NEXT_VALUE = `
  const opts = (field.options || []).map((o) => (o && typeof o === "object" ? o.value : o))
  switch (field.type) {
    case "color": return { value: String(v).toLowerCase() === "#3a6ea5" ? "#a53a6e" : "#3a6ea5" }
    case "color_background": return { value: "linear-gradient(90deg, #aa3355, #3355aa)" }
    case "range": { const min = field.min ?? 0, max = field.max ?? 100, step = field.step ?? 1; let n = min + Math.round(((max - min) * 0.7) / step) * step; if (n === Number(v)) n = min; return { value: n } }
    case "number": return { value: (Number(v) || 0) + 1 }
    case "checkbox": return { value: !v }
    case "select": case "radio": { const o = opts.find((x) => x !== v); return o === undefined ? { skip: "skipped (no other value)" } : { value: o } }
    case "text_alignment": return { value: v === "center" ? "right" : "center" }
    case "text": case "textarea": return { value: (v ?? "") + " probe" }
    case "richtext": return { value: "<p>Probe words</p>" }
    case "inline_richtext": return { value: "Probe <strong>words</strong>" }
    case "html": case "liquid": return { value: '<p class="probe-custom">Probe</p>' }
    case "color_scheme": return { value: v === "scheme-2" ? "scheme-1" : "scheme-2" }
    case "font_picker": return { value: v === "lora_n4" ? "playfair_display_n7" : "lora_n4" }
    case "url": return { value: "https://example.invalid/probe" }
    default: return { skip: "skipped (" + field.type + ")" }
  }`

/* ── What the page holds, read in the frame ─────────────────────────── */

const READ = () => {
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim()
  /* What the canvas itself adds (its outlines, its bridge, the builder's own styles) is not the theme's. */
  const ours = (el) => el.closest && (el.closest("[data-sl-box],[data-sl-add],[data-sl]") || el.hasAttribute("data-sl") || el.hasAttribute("data-storelib-canvas"))
  /* Classes a theme's script puts on and takes off as the page is scrolled or played (a reveal, a slide): when they are there is the script's, not the setting's. */
  const STATE = /^(is-in|is-active|active|is-visible|visible|animated?|loaded|lazyloaded|is-loaded|scroll-trigger--offscreen|is-open|is-sticky|scrolled.*|in-view)$/
  const attrs = (el, keep) => Array.from(el.attributes).filter((a) => keep(a.name)).map((a) => `${a.name}=${a.name === "class" ? a.value.split(/\s+/).filter((w) => w && !STATE.test(w)).sort().join(" ") : a.value}`).sort().join(" ")
  const scripts = Array.from(document.scripts).filter((s) => !s.src && !ours(s) && !Array.from(s.attributes).some((a) => a.name.startsWith("data-sl") || a.name.startsWith("data-storelib"))).map((s) => norm(s.textContent)).filter((t) => t && !/storelib:1|__sl|window\.__storelib/.test(t.slice(0, 400)))
  const styles = Array.from(document.querySelectorAll("style")).filter((s) => !ours(s)).map((s) => { try { return Array.from(s.sheet.cssRules).map((r) => r.cssText).join("\n") } catch (e) { return norm(s.textContent) } })
  /* A section's stylesheet the canvas moved into the head as it drew the section (canvas-bridge.ts keep) is where a section's is: not compared. */
  const head = Array.from(document.head.querySelectorAll("link, meta")).filter((l) => !(l.tagName === "LINK" && l.hasAttribute("data-sl"))).map((l) => attrs(l, (n) => n !== "data-sl-d"))
  const root = [attrs(document.documentElement, (n) => n === "class" || n === "lang" || n.startsWith("data-")), attrs(document.body, (n) => n === "class" || (n.startsWith("data-") && !n.startsWith("data-sl")))]
  const sections = {}
  for (const sec of document.querySelectorAll(".shopify-section[id]")) {
    const out = []
    for (const el of sec.querySelectorAll("*")) {
      if (ours(el) || el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "TEMPLATE" || el.tagName === "LINK") continue
      const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.data).join("")
      out.push(`${el.tagName.toLowerCase()} ${attrs(el, (n) => n === "class" || n === "src" || n === "href" || n === "type" || n === "value" || (n.startsWith("data-") && !n.startsWith("data-sl")))} ${norm(text)}`)
    }
    sections[sec.id] = out
  }
  const js = document.body.getAttribute("data-probe-js")
  return { scripts, styles, head, root, sections, js }
}

/* The first place two readings differ, part by part. */
function differences(a, b) {
  const out = []
  const list = (name, x, y) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return
    const i = x.findIndex((v, k) => v !== y[k])
    const at = i < 0 ? Math.min(x.length, y.length) : i
    out.push({ part: name, canvas: String(x[at] ?? "(none)").slice(0, 160), reload: String(y[at] ?? "(none)").slice(0, 160) })
  }
  /* A part that differs only in where a script's words differ from where a style's do, compared as sets: the order a theme's script adds styles in is its own. */
  list("scripts", [...a.scripts].sort(), [...b.scripts].sort())
  list("styles", [...a.styles].sort(), [...b.styles].sort())
  list("head", [...a.head].sort(), [...b.head].sort())
  list("root", a.root, b.root)
  for (const id of new Set([...Object.keys(a.sections), ...Object.keys(b.sections)])) list(`section ${id.replace("shopify-section-", "")}`, a.sections[id] ?? [], b.sections[id] ?? [])
  if (a.js !== b.js) out.push({ part: "js", canvas: String(a.js), reload: String(b.js) })
  return out
}

/* ── One theme ─────────────────────────────────────────────────────── */

async function run(name, compat, bundle, css) {
  console.log(`\n${name.toUpperCase()}: every setting of its settings_schema.json`)
  const schema = JSON.parse(compat.all["shopify/config/settings_schema.json"])
  /* A group named by a translation key (Dawn's "t:settings_schema.colors.name") is shown by its words in the theme's own language file. */
  const words = JSON.parse(compat.all[Object.keys(compat.all).find((p) => /^shopify\/locales\/[^/]*\.default\.schema\.json$/.test(p))] ?? "{}")
  const say = (name) => typeof name === "string" && name.startsWith("t:") ? name.slice(2).split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), words) ?? name : name
  const { page, front, js, errors, close } = await openEditor({ kind: "imported", bundle, css, compat })
  /* WATCHDOG=1: a main thread busy for 40 seconds is paused and where it is said (a loop in the editor or in the page). */
  if (process.env.WATCHDOG) {
    const dbg = await page.createCDPSession()
    let paused = false
    dbg.on("Debugger.paused", (e) => {
      console.log("  PAUSED, the main thread's stack:")
      for (const f of e.callFrames.slice(0, 25)) console.log(`    ${f.functionName || "(anonymous)"}  ${f.url.slice(-60)}:${f.location.lineNumber}:${f.location.columnNumber}`)
      dbg.send("Debugger.resume").catch(() => {})
    })
    await dbg.send("Debugger.enable")
    let last = Date.now()
    setInterval(async () => {
      const t = Date.now()
      const alive = await within(page.evaluate(() => 1).catch(() => null), 5000)
      if (alive === 1) { last = t; return }
      if (t - last > 40000 && !paused) { paused = true; console.log("  (the main thread has not answered for 40s: pausing it)"); dbg.send("Debugger.pause").catch((e) => console.log("  pause failed", String(e))) }
    }, 5000).unref()
  }
  const rows = []
  try {
    /* Every frame loaded in the canvas, counted in the editor's document: a change the canvas drew by loading the page again behind says so. */
    await js(() => { window.__loads = 0; document.addEventListener("load", (e) => { if (e.target && e.target.tagName === "IFRAME" && e.target.closest("#wb-preview-root")) window.__loads++ }, true) })
    const openGroup = async (group) => {
      await js(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Theme" && x.getClientRects().length); b?.click() })
      await sleep(300)
      for (let i = 0; i < 2; i++) {
        if (!(await js(() => !!document.querySelector("[data-compat-theme-group]")))) break
        await js(() => document.querySelector("[data-compat-theme-group] button[aria-label='Back']")?.click())
        await sleep(300)
      }
      const ok = await js((group) => { const b = [...document.querySelectorAll("[data-wb-sidebar-panel] button")].find((x) => x.textContent.trim() === group && x.getClientRects().length); if (!b) return false; b.click(); return true }, group)
      await sleep(400)
      return ok
    }
    /* The control's own onChange, with another value of its type, chosen from the field and the value it shows. `root`: where the field is (a Theme settings group, or the sidebar with a section open). */
    const change = (id, root = "[data-compat-theme-group] [data-sheet-scroll]") => js((id, root, NEXT) => {
      const scroll = document.querySelector(root)
      if (!scroll) return { said: "no group" }
      const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
      let found = null, row = null
      const walk = (f, depth) => { for (let c = f; c && !found; c = c.sibling) { const p = c.memoizedProps; if (p && p.field && p.field.id === id && typeof p.onChange === "function") { found = p; return } if (c.child && depth < 80) walk(c.child, depth + 1) } }
      for (const r of scroll.children) { const f0 = fiberOf(r); if (!f0) continue; walk(f0, 0); if (found) { row = r; break } }
      if (!found) return { said: "no field" }
      const next = new Function("field", "v", NEXT)(found.field, found.value !== undefined ? found.value : found.field.default)
      if (next && next.skip) return { said: next.skip }
      row.scrollIntoView({ block: "center" })
      found.onChange(next.value)
      return { said: "ok", from: found.value !== undefined ? found.value : found.field.default, to: next.value }
    }, id, root, NEXT_VALUE)
    /* Every field the sidebar shows for the section open in it: its id and type. */
    const sectionFields = () => js(() => {
      const root = document.querySelector("[data-wb-sidebar-scroll]")
      if (!root) return []
      const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
      const out = [], seen = new Set()
      const walk = (f, depth) => { for (let c = f; c; c = c.sibling) { const p = c.memoizedProps; if (p && p.field && p.field.id && typeof p.onChange === "function" && !seen.has(p.field.id)) { seen.add(p.field.id); out.push({ id: p.field.id, type: p.field.type }) } if (c.child && depth < 80) walk(c.child, depth + 1) } }
      for (const r of root.children) { const f0 = fiberOf(r); if (f0) walk(f0, 0) }
      return out
    })
    const frontId = () => js(() => { const f = document.querySelector("iframe[data-compat-frame='front']"); if (!f) return null; f.__probeId = f.__probeId || Math.random(); return f.__probeId })
    /* Drawn again from nothing, as a page that cannot take a change asks to be: a new frame comes to the front. */
    const reloaded = async () => {
      const before = await frontId()
      const f = await front()
      await within(f.evaluate(() => { window.__probeOld = true; parent.postMessage({ storelib: 1, type: "reload", why: "probe" }, "*") }), 3000)
      for (let i = 0; i < 60; i++) {
        await sleep(200)
        const id = await frontId()
        const g = await within(front(), 3000)
        const fresh = g && (await within(g.evaluate(() => !window.__probeOld && document.querySelectorAll(".shopify-section").length > 0).catch(() => false), 3000))
        if (id !== before && fresh) { await sleep(1500); return g }
      }
      return null
    }
    /* One change, then the canvas against the page drawn again from nothing. */
    const compareAfter = async (label, type, c, loads0) => {
      await sleep(1800)
      const loads = (await js(() => window.__loads)) - loads0
      const f = await within(front(), 3000)
      const live = f ? await within(f.evaluate(READ).catch(() => null)) : null
      const g2 = await reloaded()
      const fresh = g2 ? await within(g2.evaluate(READ).catch(() => null)) : null
      const diff = live && fresh ? differences(live, fresh) : [{ part: "read", canvas: String(!!live), reload: String(!!fresh) }]
      rows.push({ theme: name, id: label, type, from: c.from, to: c.to, diff, loads })
      console.log(`  ${diff.length ? "STALE" : "ok   "} ${label.padEnd(40)} ${String(type).padEnd(16)} ${JSON.stringify(c.from)?.slice(0, 24)} -> ${JSON.stringify(c.to)?.slice(0, 24)}${loads ? `   (drawn again behind: ${loads} frame${loads > 1 ? "s" : ""})` : ""}`)
      for (const d of diff.slice(0, 3)) console.log(`          ${d.part}: canvas ${JSON.stringify(d.canvas)}\n          ${" ".repeat(d.part.length)}  reload ${JSON.stringify(d.reload)}`)
    }
    /*
      SECTIONS=1: every section on the page selected in the canvas in turn,
      and every setting the sidebar shows for it changed the same way.
    */
    if (process.env.SECTIONS) {
      const ids = await (await front()).evaluate(() => [...document.querySelectorAll(".shopify-section[id]")].filter((x) => x.getBoundingClientRect().height > 40).map((x) => x.id))
      for (const secId of ids) {
        const select = async () => {
          const f = await front()
          const at = await within(f.evaluate((id) => { const el = document.getElementById(id); if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: Math.min(r.left + 30, innerWidth - 10), y: Math.max(10, Math.min(r.top + Math.min(r.height / 2, 60), innerHeight - 10)) } }, secId), 3000)
          if (!at) return false
          await sleep(300)
          const box = await (await page.$("iframe[data-compat-frame='front']")).boundingBox()
          await page.mouse.click(box.x + at.x, box.y + at.y)
          await sleep(900)
          return true
        }
        if (!(await select())) continue
        const fields = await sectionFields()
        console.log(`  [${secId.replace("shopify-section-", "")}] ${fields.length} settings`)
        for (const fld of fields) {
          if (ONLY && !ONLY.test(fld.id)) continue
          const loads0 = await js(() => window.__loads)
          const c = await change(fld.id, "[data-wb-sidebar-scroll]")
          if (c.said === "no field") { if (!(await select())) break; continue }
          if (c.said !== "ok") { console.log(`  -     ${fld.id.padEnd(40)} ${String(fld.type).padEnd(16)} ${c.said}`); continue }
          await compareAfter(`${secId.replace("shopify-section-", "").slice(-18)}.${fld.id}`, fld.type, c, loads0)
          await select()
        }
      }
      return rows
    }
    let group = null
    for (const g of schema) {
      for (const s of g.settings || []) {
        if (!s.id || s.type === "header" || s.type === "paragraph") continue
        if (ONLY && !ONLY.test(s.id)) continue
        if (s.type === "color_scheme_group") continue
        if (group !== g.name) { if (!(await openGroup(say(g.name)))) { console.log(`  (group ${say(g.name)} not found)`); group = null; continue } group = g.name }
        const loads0 = await js(() => window.__loads)
        const c = await change(s.id)
        if (c.said !== "ok") { console.log(`  -     ${s.id.padEnd(40)} ${String(s.type).padEnd(16)} ${c.said}`); continue }
        await compareAfter(s.id, s.type, c, loads0)
      }
    }
  } finally {
    await close()
  }
  if (errors.length) console.log(`  note  page errors ${JSON.stringify(errors.slice(0, 3))}`)
  return rows
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const which = process.env.THEME ? [process.env.THEME] : ["materia", "dawn"]
  const rows = []
  for (const w of which) {
    if (w === "dawn") {
      const zipPath = process.argv[2]
      if (!zipPath) { console.log("\n(dawn: no zip given)"); continue }
      rows.push(...(await run("dawn", await dawn(zipPath), bundle, css)))
    } else rows.push(...(await run("materia", await materia(), bundle, css)))
  }
  console.log("\nBUDGETS")
  for (const r of rows) {
    const ok = r.diff.length === 0
    console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${r.theme} ${r.id}: the canvas shows what a reload shows${ok ? "" : `   (${r.diff.map((d) => d.part).join(", ")})`}${r.loads ? `, drawn again behind` : ""}`)
    if (!ok && BUDGET) broken++
  }
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
