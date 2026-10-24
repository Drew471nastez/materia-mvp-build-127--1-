/**
 * ===========================================================================
 *  EVERY THEME SETTING, LIVE, WITH NO RELOAD (round 1023, part 2)
 * ===========================================================================
 * The owner: "changing some settings in the sidebar still refreshes the
 * whole canvas, which then causes the freeze. Every theme setting (colours,
 * colour pickers, sliders, toggles, selects, text, fonts, images, all of
 * Theme settings, and section and block settings) should apply live with no
 * flash, no glitch and no reload, in every theme."
 *
 * The real editor (scripts/editor-probe-harness.mjs's bundle) on the
 * owner's Materia store (scripts/materia-store-kit.mjs: a theme setting of
 * every type Shopify has, printed where store themes print them), the page
 * scrolled to the middle. Each setting of the store's settings_schema.json
 * is changed in turn from Theme settings, by the control's own onChange
 * (the call every control makes; a few are also driven by real input: a
 * slider by its keys, a switch by a click, a text by typing), and after
 * each, in the canvas:
 *
 *   RELOAD   the frame's document replaced (a marker left in it is gone),
 *            a frame loaded in the canvas (its load event), or the frame in
 *            front swapped for another
 *   SCROLL   where the page stands, against where it stood (kept within 2px)
 *   SHOWN    the new value on the page (a variable, a class, an element,
 *            a font's stylesheet), with no refresh
 *   HELD     the page held still afterwards (overflow hidden on <html> or
 *            <body> with nothing open): the freeze the reload led to
 *
 * Then the same for a section setting and a block setting.
 *
 * Round 1023 part 2, main's bundle and this round's, the Materia store
 * (every other setting was already live on main, its value shown and the
 * scroll kept, and stays so):
 *
 *                                                before    after
 *   buttons_shadow   checkbox: a <style> it adds  reload    live
 *   cookie_text      richtext, in the layout      reload    live
 *   cookie_button    text, in the layout (typed)  reload    live
 *   cookie_enabled   checkbox: the banner goes    reload    live
 *   back_to_top      checkbox: a button comes     reload    live
 *   custom_liquid    liquid, in the layout        reload    live
 *   predictive_…     checkbox: a head script      reload    live (started)
 *   favicon          image_picker: a head link    reload    live
 *   custom_head_html html: a tag in the head      reload    live
 *   colours, schemes, fonts, ranges, selects, radio, number, alignment,
 *   url, text, textarea, inline_richtext, link_list, video_url, video,
 *   collection(s), product(s), page; a section and a block setting
 *                                                live      live
 *   blog: no control in Theme settings (Storelib has no blogs)
 * The Storelib theme: every field of Theme settings live before and after
 * (no section mounted again, no frame loaded).
 *
 *   npx tsx scripts/check-theme-settings-live.mjs
 *   ONLY=<regexp>            only the settings whose id matches
 *   EDITOR_BUNDLE=<file>     reuse a bundle (one from another commit, to compare)
 *   JSON=<file>              the table as JSON
 *   BUDGET=0                 report without failing
 */
import { writeFileSync } from "node:fs"
import { importedTheme, openEditor, sleep } from "./canvas-probe-kit.mjs"
import { STORE_CHANGES, STORE_SETTINGS } from "./materia-store-kit.mjs"

const BUDGET = process.env.BUDGET !== "0"
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : BUDGET ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok && BUDGET) broken++
}

/* What the page shows for each setting's new value, read in the frame. Null: printed nowhere a visitor can read it back. */
const styleHas = (t) => `[...document.querySelectorAll("style")].some((s) => s.textContent.includes(${JSON.stringify(t)}))`
const SHOWN = {
  color_background: styleHas("--color-background: #f4efe6"),
  color_text: styleHas("--color-text: #202a44"),
  gradient_accent: styleHas("#aa3355, #3355aa"),
  "color_schemes::scheme-1::settings::background": styleHas("--scheme-bg: #fff7e8"),
  header_scheme: `!!document.querySelector("header.hd.color-scheme-2")`,
  type_header_font: `[...document.querySelectorAll("link[data-storelib-font]")].some((l) => /Playfair/i.test(l.href)) && ${styleHas("Playfair Display")}`,
  type_body_font: `[...document.querySelectorAll("link[data-storelib-font]")].some((l) => /Lora/i.test(l.href))`,
  heading_scale: styleHas("--heading-scale: 1.3"),
  text_transform: styleHas("text-transform: uppercase"),
  page_width: `document.documentElement.style.getPropertyValue("--page-width").trim() === "1400px"`,
  layout_style: `document.body.classList.contains("layout--boxed")`,
  card_style: `document.body.classList.contains("cards--card")`,
  products_per_row: styleHas("--products-per-row: 3"),
  heading_alignment: styleHas("text-align: center"),
  animations_reveal_on_scroll: `!document.documentElement.classList.contains("has-reveal")`,
  buttons_radius: styleHas("--buttons-radius: 22px"),
  buttons_shadow: styleHas("box-shadow: 0 4px 12px"),
  social_facebook_link: `!!document.querySelector('.tb__icon[href="https://facebook.com/materia-store"]')`,
  social_instagram_link: `!!document.querySelector('.tb__icon[href="https://instagram.com/materia-store"]')`,
  cookie_text: `/Cookies keep/.test(document.querySelector("[data-cookie-banner]")?.textContent || "")`,
  cookie_button: `(document.querySelector("[data-cookie-accept]")?.textContent || "").trim() === "Accept"`,
  cookie_enabled: `!document.querySelector("[data-cookie-banner]")`,
  cart_type: `document.body.getAttribute("data-cart-type") === "page"`,
  cart_note: `(document.querySelector(".cart-drawer__note")?.textContent || "").trim() === "Shipped in 24 hours"`,
  predictive_search_enabled: `!!document.querySelector('script[src*="predictive-search"]') && window.__predictive >= 1`,
  favicon: `!!document.querySelector('link[rel="icon"]')`,
  back_to_top: `!!document.querySelector(".back-to-top")`,
  custom_head_html: `!!document.querySelector('meta[name="materia-custom"]')`,
  intro_video: `!!document.querySelector(".ft__video")`,
  footer_menu: `document.querySelector(".ft__menu")?.getAttribute("data-menu") === "main-menu"`,
  footer_tagline: `!!document.querySelector(".ft__tagline strong")`,
  custom_liquid: `!!document.querySelector(".custom-liquid")`,
}
/* The order they are changed in: the banner's words while it is there, then the banner off. */
const ORDER = (() => {
  const all = []
  for (const g of STORE_SETTINGS) for (const s of g.settings) {
    if (s.type === "color_scheme_group") all.push({ group: g.name, id: "color_schemes::scheme-1::settings::background", type: "color (in a colour scheme)", value: "#fff7e8" })
    else all.push({ group: g.name, id: s.id, type: s.type, value: STORE_CHANGES[s.id] })
  }
  const off = all.findIndex((x) => x.id === "cookie_enabled")
  all.push(...all.splice(off, 1))
  return all
})()
/* Printed in the store's start-up script (window.theme = { settings: ... }), which its JavaScript reads once. */
const READ_AT_START = new Set(["cart_type", "animations_reveal_on_scroll"])
/* Driven by real input as well as by onChange: one per kind of control. */
const REAL = { page_width: "slider", buttons_shadow: "switch", cookie_button: "type" }

async function importedRun(bundle, css) {
  console.log("\nIMPORTED THEME (the Materia store): every setting of its settings_schema.json")
  const compat = await importedTheme({ store: true })
  const { page, front, js, errors, close } = await openEditor({ kind: "imported", bundle, css, compat })
  const table = []
  try {
    /* Every load of a frame in the canvas, and which frame is in front, kept in the editor's document. */
    await js(() => {
      window.__loads = 0
      /* What a page that asked to be drawn again said about why (canvas-bridge.ts reload). */
      window.__why = []
      window.addEventListener("message", (e) => { if (e.data && e.data.storelib === 1 && e.data.type === "reload") window.__why.push(String(e.data.why)) })
      document.addEventListener("load", (e) => { if (e.target && e.target.tagName === "IFRAME" && e.target.closest("#wb-preview-root")) window.__loads++ }, true)
    })
    const frontEl = () => js(() => { const f = document.querySelector("iframe[data-compat-frame='front']"); if (!f) return null; f.__probeId = f.__probeId || Math.random(); return f.__probeId })
    const frameState = async () => (await front())?.evaluate(() => {
      const hs = getComputedStyle(document.documentElement), bs = getComputedStyle(document.body)
      const held = hs.overflowY === "hidden" || ((bs.overflowY === "hidden") && hs.overflowY === "visible")
      return { mark: window.__probeMark || null, y: Math.round(scrollY), held }
    }).catch(() => null)
    const mark = async () => (await front())?.evaluate(() => { window.__probeMark = window.__probeMark || String(Math.random()); scrollTo(0, 700); return window.__probeMark })

    /* Theme settings, a group opened by its name. */
    const openGroup = async (name) => {
      await js(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Theme" && x.getClientRects().length); b?.click() })
      await sleep(400)
      /* Back to the list of groups if a group is open. */
      for (let i = 0; i < 2; i++) {
        const inGroup = await js(() => !!document.querySelector("[data-compat-theme-group]"))
        if (!inGroup) break
        await js(() => document.querySelector("[data-compat-theme-group] button[aria-label='Back']")?.click())
        await sleep(400)
      }
      const ok = await js((name) => { const b = [...document.querySelectorAll("[data-wb-sidebar-panel] button")].find((x) => x.textContent.trim() === name && x.getClientRects().length); if (!b) return false; b.click(); return true }, name)
      await sleep(500)
      return ok
    }
    /* The control's own onChange, found from the field's row: what every control calls with its new value. */
    const change = (id, value) => js((id, value) => {
      const scroll = document.querySelector("[data-compat-theme-group] [data-sheet-scroll]")
      if (!scroll) return "no group"
      const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
      for (const row of scroll.children) {
        const f0 = fiberOf(row)
        if (!f0) continue
        let found = null
        const walk = (f, depth) => { for (let c = f; c && !found && depth < 12; c = c.child) { const p = c.memoizedProps; if (p && p.field && p.field.id === id && typeof p.onChange === "function") { found = p; return } if (c.sibling && depth > 0) walk(c.sibling, depth + 1) } }
        walk(f0, 0)
        if (found) { row.scrollIntoView({ block: "center" }); found.onChange(value); return "ok" }
      }
      return "no field"
    }, id, value)
    /* Real input, where asked: a slider's thumb and its arrow key, a switch's click, a text field typed into. */
    const realInput = async (id, how) => {
      const at = await js((id) => {
        const scroll = document.querySelector("[data-compat-theme-group] [data-sheet-scroll]")
        const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
        for (const row of scroll.children) {
          let hit = false
          const walk = (f, d) => { for (let c = f; c && !hit && d < 12; c = c.child) { if (c.memoizedProps?.field?.id === id) { hit = true; return } if (c.sibling && d > 0) walk(c.sibling, d + 1) } }
          walk(fiberOf(row), 0)
          if (!hit) continue
          row.scrollIntoView({ block: "center" })
          const el = row.querySelector("[data-slot='slider-thumb'], [role=slider]") || row.querySelector("button[role=switch]") || row.querySelector("input[type=text], input:not([type]), textarea")
          if (!el) return null
          const r = el.getBoundingClientRect()
          return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName }
        }
        return null
      }, id)
      if (!at) return "no control"
      await page.mouse.click(at.x, at.y)
      if (how === "slider") { for (let i = 0; i < 2; i++) { await page.keyboard.press("ArrowRight"); await sleep(120) } }
      if (how === "type") { await page.keyboard.down("Control"); await page.keyboard.press("a"); await page.keyboard.up("Control"); await page.keyboard.type("Accept", { delay: 25 }) }
      return "ok"
    }

    let group = null
    for (const item of ORDER) {
      if (ONLY && !ONLY.test(item.id)) continue
      if (group !== item.group) { if (!(await openGroup(item.group))) { console.log(`  (group ${item.group} not found)`); continue } group = item.group }
      const m0 = await mark()
      await sleep(250)
      const id0 = await frontEl()
      const loads0 = await js(() => window.__loads)
      const how = REAL[item.id]
      const said = how ? await realInput(item.id, how) : await change(item.id, item.value)
      await sleep(1600)
      const s = await frameState()
      const id1 = await frontEl()
      const loads = (await js(() => window.__loads)) - loads0
      const why = await js(() => window.__why.splice(0).join(","))
      const reloaded = !s || s.mark !== m0 || id1 !== id0 || loads > 0
      const shown = SHOWN[item.id] ? await (await front())?.evaluate((src) => { try { return !!new Function("return (" + src + ")")() } catch (e) { return false } }, SHOWN[item.id]).catch(() => false) : null
      const row = { id: item.id, type: item.type, how: how ?? "onChange", said, reloaded, loads, scroll: s ? [700, s.y] : null, kept: !!s && Math.abs(s.y - 700) <= 2, shown, held: !!s?.held }
      table.push(row)
      console.log(`  ${said === "no field" ? "-     " : reloaded ? "RELOAD" : "live  "} ${item.id.padEnd(48)} ${item.type.padEnd(26)} ${String(row.how).padEnd(8)} scroll ${row.kept ? "kept" : `LOST ${JSON.stringify(row.scroll)}`}  shown ${shown === null ? "-" : shown ? "yes" : "NO"}${row.held ? "  HELD" : ""}${said !== "ok" ? `  (${said})` : ""}${why ? `  asked: ${why}` : ""}`)
      /* Back to a page at rest for the next: the banner and anything the change left open closed. */
      await (await front())?.evaluate(() => { scrollTo(0, 0) }).catch(() => {})
    }

    /* A section setting and a block setting, typed into, as the live edit probes do. */
    for (const [label, sel, blockSel] of [["section setting (Rich text heading)", ".rt h2", ".rt"], ["block setting (Slideshow slide)", ".hero__heading", ".hero__slide.is-active"]]) {
      if (ONLY && !ONLY.test(label)) continue
      const m0 = await mark()
      const id0 = await frontEl()
      const loads0 = await js(() => window.__loads)
      const f = await front()
      const at = await f.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 } }, sel)
      const box = await (await page.$("iframe[data-compat-frame='front']")).boundingBox()
      await page.mouse.click(box.x + at.x, box.y + at.y)
      await sleep(900)
      const y0 = await f.evaluate(() => Math.round(scrollY))
      const typed = await js(() => {
        const side = document.querySelector("[data-wb-sidebar-scroll]") || document
        const el = [...side.querySelectorAll("input[type=text], input:not([type]), textarea")].find((x) => x.getClientRects().length)
        if (!el) return false
        el.focus(); el.select?.()
        return true
      })
      if (typed) await page.keyboard.type(" live", { delay: 30 })
      await sleep(1500)
      const s = await frameState()
      const id1 = await frontEl()
      const loads = (await js(() => window.__loads)) - loads0
      const reloaded = !s || s.mark !== m0 || id1 !== id0 || loads > 0
      const shown = await (await front()).evaluate((sel) => / live/.test(document.querySelector(sel)?.textContent || ""), blockSel).catch(() => false)
      const row = { id: label, type: "text", how: "type", said: typed ? "ok" : "no field", reloaded, loads, scroll: [y0, s?.y], kept: !!s && Math.abs(s.y - y0) <= 2, shown, held: !!s?.held }
      table.push(row)
      console.log(`  ${reloaded ? "RELOAD" : "live  "} ${label.padEnd(48)} ${"text".padEnd(26)} type     scroll ${row.kept ? "kept" : `LOST ${JSON.stringify(row.scroll)}`}  shown ${shown ? "yes" : "NO"}${row.held ? "  HELD" : ""}`)
    }
  } finally {
    await close()
  }
  return { table, errors }
}

/*
  A STOREFRONT OF STORELIB'S OWN: every field of every group of Theme
  settings, changed to another value of its type by its own onChange, and
  after each: a section thrown away and mounted again (the Storelib
  canvas's reload), an iframe loaded in the canvas, the canvas's scroll.
*/
async function storelibRun(bundle, css) {
  console.log("\nSTORELIB THEME: every field of Theme settings")
  const { js, errors, close } = await openEditor({ kind: "storelib", bundle, css })
  const table = []
  try {
    await js(() => {
      window.__loads = 0; window.__remounts = 0
      document.addEventListener("load", (e) => { if (e.target && e.target.tagName === "IFRAME" && e.target.closest("#wb-preview-root")) window.__loads++ }, true)
      new MutationObserver((list) => { for (const m of list) for (const r of m.removedNodes) { if (r.nodeType !== 1) continue; if (r.hasAttribute("data-section-box")) window.__remounts++; else window.__remounts += r.querySelectorAll("[data-section-box]").length } }).observe(document.getElementById("wb-preview-root"), { childList: true, subtree: true })
    })
    const groups = await (async () => {
      await js(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Theme" && x.getClientRects().length); b?.click() })
      await sleep(500)
      return js(() => [...document.querySelectorAll("[data-theme-group-row]")].map((b) => b.getAttribute("data-theme-group-row")))
    })()
    for (const g of groups) {
      if (ONLY && !ONLY.test(g)) continue
      await js(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Theme" && x.getClientRects().length); b?.click() })
      await sleep(300)
      await js(() => document.querySelector("[data-theme-group-open] button[aria-label='Back']")?.click())
      await sleep(300)
      const opened = await js((g) => { const b = document.querySelector(`[data-theme-group-row="${g}"]`); if (!b) return false; b.click(); return true }, g)
      await sleep(600)
      if (!opened) continue
      /* Every field the group shows, outermost control first, by its id. */
      const ids = await js(() => {
        const root = document.querySelector("[data-theme-group]")
        if (!root) return []
        const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
        const out = []
        const seen = new Set()
        const walk = (f) => { for (let c = f; c; c = c.sibling) { const p = c.memoizedProps; if (p && p.field && p.field.id && !seen.has(p.field.id)) { seen.add(p.field.id); out.push({ id: p.field.id, type: p.field.type }) } if (c.child) walk(c.child) } }
        walk(fiberOf(root).child)
        return out
      })
      for (const f of ids) {
        const y0 = await js(() => { const el = document.getElementById("wb-preview-root"); el.scrollTop = 900; return el.scrollTop })
        await sleep(200)
        const before = await js(() => ({ loads: window.__loads, remounts: window.__remounts }))
        const said = await js((id) => {
          const root = document.querySelector("[data-theme-group]")
          const fiberOf = (el) => el[Object.keys(el).find((k) => k.startsWith("__reactFiber$"))]
          /* The field's own shell (ThemeFieldShell, FieldEditor), and the first control under it with an onChange: what that control calls. */
          let shell = null
          const walk = (f) => { for (let c = f; c && !shell; c = c.sibling) { const p = c.memoizedProps; if (p && p.field && p.field.id === id) { shell = c; return } if (c.child) walk(c.child) } }
          walk(fiberOf(root).child)
          if (!shell) return "no field"
          let hit = typeof shell.memoizedProps.onChange === "function" ? shell.memoizedProps : null
          const down = (f) => { for (let c = f; c && !hit; c = c.sibling) { const p = c.memoizedProps; if (p && typeof p.onChange === "function") { hit = p; return } if (c.child) down(c.child) } }
          if (!hit) down(shell.child)
          if (!hit) return "no control"
          const field = shell.memoizedProps.field
          const value = hit.value
          const v = value ?? field.default
          const opts = (field.options || []).map((o) => (o && typeof o === "object" ? o.value : o))
          let next
          switch (field.type) {
            case "color": case "color_background": next = v === "#3a6ea5" ? "#a53a6e" : "#3a6ea5"; break
            case "range": case "number": { const min = field.min ?? 0, max = field.max ?? (Number(v) || 0) + 10, step = field.step ?? 1; next = Math.round((min + (max - min) * 0.7) / step) * step; if (next === Number(v)) next = min; break }
            case "checkbox": case "toggle": case "boolean": next = !v; break
            case "select": case "radio": case "segmented": case "font": case "font_picker": next = opts.find((o) => o !== v); break
            case "text": case "textarea": case "richtext": case "inline_richtext": case "html": next = `${v ?? ""} x`; break
            case "image": case "image_picker": next = "https://example.invalid/new.png"; break
            case "url": case "link": next = "/pages/about"; break
            case "header": case "paragraph": return "skipped (a heading)"
            default: return `skipped (${field.type})`
          }
          if (next === undefined) return `skipped (no other value)`
          hit.onChange(next)
          return "ok"
        }, f.id)
        await sleep(1200)
        const after = await js(() => ({ loads: window.__loads, remounts: window.__remounts, y: document.getElementById("wb-preview-root").scrollTop }))
        const row = { id: `storelib ${g}.${f.id}`, type: f.type, how: "onChange", said, reloaded: after.loads > before.loads || after.remounts > before.remounts, loads: after.loads - before.loads, remounts: after.remounts - before.remounts, scroll: [y0, after.y], kept: Math.abs(after.y - y0) <= 2, shown: null, held: false }
        if (said !== "ok") { console.log(`  -      ${row.id.padEnd(48)} ${String(f.type).padEnd(26)} ${said}`); continue }
        table.push(row)
        console.log(`  ${row.reloaded ? "RELOAD" : "live  "} ${row.id.padEnd(48)} ${String(f.type).padEnd(26)} onChange scroll ${row.kept ? "kept" : `anchored ${JSON.stringify(row.scroll)}`}${row.remounts ? `  ${row.remounts} sections mounted again` : ""}${row.loads ? `  ${row.loads} frames loaded` : ""}`)
      }
    }
  } finally {
    await close()
  }
  return { table, errors }
}

async function main() {
  const { bundle, css } = await import("./editor-probe-harness.mjs")
  const kinds = process.env.THEME ? [process.env.THEME] : ["imported", "storelib"]
  const table = [], errors = []
  for (const k of kinds) {
    const r = k === "imported" ? await importedRun(bundle, css) : await storelibRun(bundle, css)
    table.push(...r.table)
    errors.push(...r.errors)
  }
  if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(table, null, 2))
  console.log("\nBUDGETS")
  for (const r of table) {
    /* A type Storelib's panel draws no control for (a blog: Storelib has no blogs) cannot be changed, so it cannot reload anything: said, not counted. */
    if (r.said === "no field") { console.log(`  note  ${r.id}: no control in Theme settings (${r.type})`); continue }
    expect(r.said === "ok", `${r.id}: changed (${r.how})`, r.said)
    /*
      Round BC: a setting the store prints in the script its JavaScript reads
      once at start (window.theme, materia-store-kit.mjs) is drawn again
      behind the page on screen, where it was scrolled to: written in place
      it changed nothing the theme's script had already read.
    */
    if (READ_AT_START.has(r.id)) expect(r.loads <= 1, `${r.id}: drawn again once, behind the page, for the theme's script`, { loads: r.loads })
    else expect(!r.reloaded, `${r.id}: the canvas did not reload`, { loads: r.loads, remounts: r.remounts })
    /* A Storelib canvas keeps what is on screen where it is (the browser's scroll anchoring): a setting that grows what is above moves scrollTop with it, and the page does not move. */
    if (!r.id.startsWith("storelib ")) expect(r.kept, `${r.id}: the scroll stayed`, r.scroll)
    if (r.shown !== null) expect(r.shown, `${r.id}: the page shows the new value`)
    expect(!r.held, `${r.id}: the page is not left held`)
  }
  if (errors.length) console.log(`  note  page errors ${JSON.stringify(errors.slice(0, 3))}`)
  console.log(`\n${broken ? `${broken} over budget` : "all within budget"}`)
  process.exit(broken ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
