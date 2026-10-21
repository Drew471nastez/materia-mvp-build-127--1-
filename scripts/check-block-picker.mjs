/**
 * ===========================================================================
 *  ADD BLOCK, IN THE REAL EDITOR: OPEN, HOVER, KEYS, ADD, ON FOUR SCREENS
 * ===========================================================================
 * The owner, round 34: Add block "opens that inline modal bad"; it should be
 * a sheet on a phone and, on a computer, the blocks with a live preview.
 * Round 35: "the whole blocks library selector is too big ... The previews
 * should be accurate for everything ... the preview should be good clean
 * optimized best." So this measures the SIZE of what opens against what it
 * holds, and every block's preview against the canvas it will land in.
 *
 * The real editor (editor-probe-harness.mjs), a page with a "Section" that
 * takes any theme block (blocks_section: Heading, Text, Button, Image,
 * Group and the rest), a Product section holding a title, a price and buy
 * buttons (every other product block addable, those three "Already used"),
 * and the footer (columns and links), at 1980 x 1240, 1440 x 900,
 * 1280 x 800 and 390 x 844:
 *
 *   OPEN      the section's Add block row pressed: how long the press held
 *             the main thread, and how long until the cards (or the sheet)
 *             are up with a preview drawn in them
 *   SIZE      the list card is as tall as its rows (up to its cap) and no
 *             taller; the preview card is as tall as its block; both
 *             cards together within 560 to 680 wide; inside the window
 *   GROUPS    what can be added first, what cannot under one heading, no
 *             reason cut off mid word
 *   PREVIEW   for EVERY block of every section: the stage is laid out at
 *             the canvas section's own width; the scale applied is the one
 *             the box says; what the block paints is inside the pane (not
 *             cut) and fills at least 70% of it in one dimension, or is
 *             shown at its own size; pictures and icons are there
 *   HOVER     the pointer moved onto each row in turn: the time from the
 *             move to the first frame whose preview is that block, at full
 *             speed and with the CPU at a quarter speed
 *   KEYS      ArrowDown moves the preview; Escape puts the cards away and
 *             the focus back on the Add block row
 *   MATCH     a block picked: the block the canvas draws is the block the
 *             preview showed (the same markup, ids aside, and the same size)
 *
 * An imported Shopify theme (tests/fixtures/shopify-posture) is driven the
 * same way: its home page's Rich text and its product page's product
 * information (rating, title, price, benefits, bundle, stock, buy buttons).
 *
 *   node scripts/check-block-picker.mjs
 *   SHOTS=/path node scripts/check-block-picker.mjs     (where the pictures go)
 *   ONLY=390 node scripts/check-block-picker.mjs        (one size; ONLY=compat the imported theme)
 */
import { createServer } from "node:http"
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { bundle, css } from "./editor-probe-harness.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-block-picker")
mkdirSync(SHOTS, { recursive: true })
const shot = (name) => join(SHOTS, `blockpicker-${name}.png`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/* The page: the "Section" that takes any theme block, a product section, the footer. */
const SECTION = "blocks_section-1"
const PRODUCT = "product-2"
const FOOTER = "footer-6"

const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>
  window.PROBE_SHORT = false
  window.PROBE_PAGES = { home: ["header", "blocks_section", "product", "features_grid", "faq_accordion", "cta_simple", "footer"] }
  window.PROBE_SECTION_BLOCKS = { product: ["title", "price", "buy_buttons"] }
</script>
<script src="/editor-probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(req.url.startsWith("/editor") ? page : "<!doctype html><title>blank</title>")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage"] })

let bad = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) bad++
}
const note = (what) => console.log(`  --    ${what}`)
const STRICT = process.env.REPORT_ONLY !== "1"
/* Every block's numbers, for the table at the end. */
const table = []

/** The block markup with every id that differs between the preview and the canvas taken out. */
const NORMALISE = `
  window.__norm = (el) => {
    const c = el.cloneNode(true)
    for (const n of [c, ...c.querySelectorAll("*")]) {
      for (const a of [...n.attributes]) {
        if (/^data-(block-id|bp-|section-id|sl-block|editor|wb-)|^(id|aria-[a-z]+|tabindex|contenteditable|spellcheck|draggable|loading|decoding)$/.test(a.name)) n.removeAttribute(a.name)
      }
      if (n.getAttribute && n.getAttribute("style")) n.setAttribute("style", n.getAttribute("style").replace(/block-picker-preview[^;"]*/g, ""))
    }
    return c.outerHTML.replace(/block-picker-preview[-a-z0-9_]*/gi, "X").replace(/(blocks_section|product|footer)-[0-9][-a-z0-9_]*/gi, "X").replace(/\\s+/g, " ").trim()
  }
`

/**
 * THE PREVIEW, MEASURED. Where the block's painted parts are on screen (its
 * words, its pictures and icons, every box it paints a colour or a border
 * on), against the pane that shows them; the stage's own laid out width
 * against the canvas section's; the scale on screen against the one the
 * stage says it has.
 */
const GEOMETRY = `
  window.__geom = (sectionId) => {
    const pane = document.querySelector("[data-block-preview]")
    const stage = pane && pane.querySelector("[data-bp-showing]")
    if (!pane || !stage) return null
    const frame = stage.tagName === "IFRAME"
    const doc = frame ? stage.contentDocument : document
    const view = doc.defaultView
    const t = doc.querySelector("[data-bp-target]")
    const declared = Number(stage.getAttribute("data-bp-scale") || 0)
    const sr = stage.getBoundingClientRect()
    const onScreen = frame ? sr.width / stage.offsetWidth : sr.width / stage.offsetWidth
    const toPage = (r) => frame ? { left: sr.left + r.left * onScreen, top: sr.top + r.top * onScreen, right: sr.left + r.right * onScreen, bottom: sr.top + r.bottom * onScreen } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    const boxes = []
    let imgs = 0, svgs = 0, broken = 0
    if (t) {
      const walk = doc.createTreeWalker(t, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT)
      for (let n = walk.currentNode; n; n = walk.nextNode()) {
        if (n.nodeType === 3) { if (n.textContent.trim()) { const rg = doc.createRange(); rg.selectNodeContents(n); boxes.push(rg.getBoundingClientRect()) } continue }
        const cs = view.getComputedStyle(n)
        if (cs.display === "none" || cs.visibility === "hidden") continue
        if (n.matches("img")) { imgs++; if (n.complete && !n.naturalWidth) broken++ }
        if (n.matches("svg")) svgs++
        const painted = n.matches("img, svg, video, picture, canvas, iframe, input, button, select, textarea, hr") || (cs.backgroundColor && !/rgba\\(0, 0, 0, 0\\)|transparent/.test(cs.backgroundColor)) || (cs.backgroundImage && cs.backgroundImage !== "none") || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0
        if (painted) boxes.push(n.getBoundingClientRect())
      }
    }
    const real = boxes.filter((b) => b.width > 0 && b.height > 0).map(toPage)
    /* A block that paints nothing by itself (a spacer) is shown by an outline of its room: that is what is seen. */
    const outline = pane.querySelector("[data-bp-clip] ~ div:not([hidden])")
    if (outline) { const o = outline.getBoundingClientRect(); if (o.height > 0) real.push({ left: o.left, top: o.top, right: o.right, bottom: o.bottom }) }
    const painted = real.length ? { left: Math.min(...real.map((b) => b.left)), right: Math.max(...real.map((b) => b.right)), top: Math.min(...real.map((b) => b.top)), bottom: Math.max(...real.map((b) => b.bottom)) } : null
    const pr = pane.getBoundingClientRect()
    const canvasBox = document.getElementById("wb-section-" + sectionId) || document.querySelector("iframe[data-compat-frame='front']")
    const r1 = (x) => Math.round(x * 10) / 10
    return {
      showing: stage.getAttribute("data-bp-showing"),
      found: !!t,
      note: pane.parentElement.querySelector("[data-preview-note]")?.textContent ?? null,
      empty: !!pane.querySelector("[data-preview-empty]"),
      pane: { w: r1(pr.width), h: r1(pr.height) },
      painted: painted ? { w: r1(painted.right - painted.left), h: r1(painted.bottom - painted.top) } : null,
      inside: !!painted && painted.left >= pr.left - 1 && painted.right <= pr.right + 1 && painted.top >= pr.top - 1 && painted.bottom <= pr.bottom + 1,
      fill: painted ? r1(Math.max((painted.right - painted.left) / pr.width, (painted.bottom - painted.top) / pr.height) * 100) : 0,
      scale: Math.round(declared * 1000) / 1000,
      scaleOnScreen: Math.round(onScreen * 1000) / 1000,
      stageW: stage.offsetWidth,
      canvasW: canvasBox ? Math.round(canvasBox.getBoundingClientRect().width) : null,
      imgs, svgs, broken,
    }
  }
`

async function openPicker(p, phone, sectionId) {
  const centre = (sel) => p.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    el.scrollIntoView({ block: "center" })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  }, sel)
  const tap = async (pt) => (phone ? p.touchscreen.tap(pt.x, pt.y) : p.mouse.click(pt.x, pt.y))
  const already = await p.evaluate((id) => !!document.querySelector(`[data-section-blocks="${id}"] [data-add-block]`), sectionId)
  if (!already) {
    /* Opened by a click on its chevron: the expanding is not what is measured here. */
    await p.evaluate((id) => { const el = document.querySelector(`[data-section-expand="${id}"]`); el?.scrollIntoView({ block: "center" }); el?.click() }, sectionId)
    await sleep(600)
  }
  const addSel = `[data-section-blocks="${sectionId}"] [data-tree-add-block="1"]`
  const add = await centre(addSel)
  await sleep(300)
  return { add, addSel, tap, centre }
}

/** Presses Add block and times it: the press itself, and until the cards are up with a preview. */
async function pressAdd(p, addSel, phone) {
  await p.evaluate((addSel, phone) => {
    window.__open = { press: 0, ready: null }
    const el = document.querySelector(addSel)
    const t0 = performance.now()
    const surface = () => document.querySelector(phone ? "[data-block-picker='phone']" : "[data-block-picker='desktop']")
    const tick = () => {
      const s = surface()
      const stage = document.querySelector("[data-block-preview] [data-bp-showing]")
      const box = s && (phone ? s.closest("[data-mobile-bottom-sheet]") : s)
      const r = box?.getBoundingClientRect()
      const up = r && (phone ? r.top < innerHeight - 200 : Number(getComputedStyle(box).opacity) > 0.05)
      /* A phone's sheet slides up at the builder's own pace: when its content is there (the sheet open, its preview drawn) is timed apart from when it is in. */
      if (phone && s && s.hasAttribute("data-picker-open") && stage && window.__open.drawn == null) window.__open.drawn = Math.round(performance.now() - t0)
      if (up && stage && window.__open.ready === null) window.__open.ready = Math.round(performance.now() - t0)
      if (performance.now() - t0 < 1500 && window.__open.ready === null) requestAnimationFrame(tick)
    }
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: phone ? "touch" : "mouse", isPrimary: true }))
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: phone ? "touch" : "mouse", isPrimary: true }))
    el.focus()
    el.click()
    window.__open.press = Math.round(performance.now() - t0)
    requestAnimationFrame(tick)
  }, addSel, phone)
  await sleep(700)
  return p.evaluate(() => window.__open)
}

/** The cards (or the sheet) against what they hold. */
async function sizes(p, phone, kind) {
  return p.evaluate((phone) => {
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
    const list = document.querySelector("[data-block-picker-list]")
    const listCard = document.querySelector("[data-block-picker-card='list']")
    const previewCard = document.querySelector("[data-block-picker-card='preview']")
    const sheet = phone ? document.querySelector("[data-block-picker='phone']")?.closest("[data-mobile-bottom-sheet]") : null
    const rows = [...document.querySelectorAll("[data-block-picker-list] [role='option']")]
    const order = rows.map((r) => r.getAttribute("aria-disabled") === "true")
    const heading = document.querySelector("[data-block-picker-heading]")
    const cut = (el) => !!el && (el.scrollWidth > el.clientWidth + 1 || getComputedStyle(el).textOverflow === "ellipsis")
    const sidebar = document.querySelector("[data-wb-sidebar-fold]")?.getBoundingClientRect()
    return {
      rows: rows.map((x) => x.textContent.trim()),
      disabled: rows.filter((r) => r.getAttribute("aria-disabled") === "true").map((r) => ({ name: r.textContent.trim(), reason: r.getAttribute("title") })),
      grouped: order.indexOf(true) < 0 || order.slice(order.indexOf(true)).every(Boolean),
      heading: heading ? { text: heading.textContent.trim(), cut: cut(heading) } : null,
      listCard: rect(listCard),
      listNatural: listCard && list ? Math.round(listCard.offsetHeight - list.clientHeight + list.scrollHeight) : null,
      previewCard: rect(previewCard),
      pane: rect(document.querySelector("[data-block-preview]")),
      sheet: rect(sheet),
      both: listCard && previewCard ? { left: Math.round(listCard.getBoundingClientRect().left), right: Math.round(previewCard.getBoundingClientRect().right) } : null,
      sidebarRight: sidebar ? Math.round(sidebar.right) : null,
      placement: document.querySelector("[data-block-picker='desktop']")?.getAttribute("data-placement") ?? null,
      focus: document.activeElement?.hasAttribute("data-block-picker-search") ?? false,
      focused: document.activeElement ? `${document.activeElement.tagName.toLowerCase()} ${[...document.activeElement.attributes].map((a) => a.name).join(" ").slice(0, 120)}` : null,
      overflow: document.documentElement.scrollWidth - innerWidth,
      shimmer: !!document.querySelector("[data-block-preview] .wb-preview-shimmer"),
      /* What is on top at points across both cards: the picker, or something of the editor's over it. */
      over: (() => {
        if (phone) return []
        const out = []
        for (const card of [listCard, previewCard]) {
          const r = card?.getBoundingClientRect()
          if (!r) continue
          for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.1, 0.5, 0.95]) {
            const x = r.left + r.width * fx, y = r.top + r.height * fy
            if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
            const el = document.elementFromPoint(x, y)
            if (el && !card.contains(el)) out.push(`${Math.round(x)},${Math.round(y)} ${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`)
          }
        }
        return out
      })(),
    }
  }, phone)
}

/** Shows one row's block (a pointer on it, or a tap on a phone). */
async function showRow(p, want, phone) {
  await p.evaluate((want, phone) => {
    const row = [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => `${r.getAttribute("data-block-choice")}:${r.getAttribute("data-preset")}` === want)
    if (!row) return
    row.scrollIntoView({ block: "nearest" })
    if (phone) row.click()
    else row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
  }, want, phone)
}

/** Every block a section offers: drawn, at the canvas's width, scaled as it says, inside its pane, filling it, pictured. */
async function everyBlock(p, phone, kind, sectionId, label) {
  const choices = await p.evaluate(() => [...document.querySelectorAll("[data-block-picker-list] [role='option']")].map((r) => r.getAttribute("data-block-choice") + ":" + r.getAttribute("data-preset")))
  for (const want of choices) {
    await showRow(p, want, phone)
    await sleep(140)
    const g = await p.evaluate((id) => window.__geom(id), sectionId)
    if (!g) { expect(false, `${label} ${want}: a preview`); continue }
    const extra = await p.evaluate(() => {
      const r = document.querySelector("[data-block-picker-reason]")
      return { reason: r ? r.textContent.trim() : null, reasonCut: !!r && r.scrollWidth > r.clientWidth + 1, card: Math.round(document.querySelector("[data-block-picker-card='preview']")?.getBoundingClientRect().height ?? 0) }
    })
    const atOwnSize = g.scale >= 0.999
    const fills = g.fill >= 70 || atOwnSize
    const empty = g.empty && (phone || g.pane.h <= 80)
    const ok = empty || g.found && g.showing === want && g.inside && Math.abs(g.stageW - (g.canvasW ?? g.stageW)) <= 1 && Math.abs(g.scale - g.scaleOnScreen) <= 0.01 && fills && !extra.reasonCut
    table.push({ screen: `${kind.w}x${kind.h}`, section: label, block: want, pane: `${g.pane.w}x${g.pane.h}`, painted: g.painted ? `${g.painted.w}x${g.painted.h}` : "-", fill: g.fill, scale: g.scale, stage: g.stageW, canvas: g.canvasW, imgs: g.imgs, svgs: g.svgs })
    expect(ok || (!g.found && !!g.note), `${label} ${want}: ${empty ? "draws nothing here, says so; " : ""}pane ${g.pane.w}x${g.pane.h}, painted ${g.painted ? `${g.painted.w}x${g.painted.h}` : "nothing"}, fills ${g.fill}%${atOwnSize ? " (own size)" : ""}, scale ${g.scale} (on screen ${g.scaleOnScreen}), laid out ${g.stageW}px for a ${g.canvasW}px section${g.imgs || g.svgs ? `, ${g.imgs} img ${g.svgs} svg` : ""}${extra.reason ? `, reason "${extra.reason}"` : ""}`, ok ? undefined : { ...g, ...extra })
    await p.screenshot({ path: shot(`${kind.w}-${label}-${want.replace(/[^a-z0-9]+/gi, "-")}`) })
  }
}

async function checkSizes(p, phone, kind, label) {
  const st = await sizes(p, phone, kind)
  note(`${label}: ${st.rows.length} blocks offered: ${st.rows.join(", ")}`)
  if (st.disabled.length) note(`${label}: cannot be added: ${st.disabled.map((d) => `${d.name} (${d.reason})`).join("; ")}`)
  expect(st.grouped, `${label}: what can be added first, what cannot after it`)
  if (st.disabled.length) expect(!!st.heading && !st.heading.cut, `${label}: one heading over what cannot be added, whole`, st.heading)
  expect(!st.shimmer, `${label}: no spinner or shimmer, the first preview is there at once`)
  if (!phone) {
    const w = st.both ? st.both.right - st.both.left : null
    note(`${label}: list card ${st.listCard?.w}x${st.listCard?.h} (its rows want ${st.listNatural}), preview card ${st.previewCard?.w}x${st.previewCard?.h}, both ${w} wide, at ${st.listCard?.left},${st.listCard?.top}`)
    expect(st.focus, `${label}: the search box has the focus`, st.focus ? undefined : st.focused)
    expect(w !== null && w >= 560 && w <= 680, `${label}: the two cards together are 560 to 680 wide`, w)
    expect(st.listCard && st.listCard.h <= st.listNatural + 2, `${label}: the list card is no taller than its rows`, { card: st.listCard?.h, rows: st.listNatural })
    expect(st.previewCard && st.pane && st.previewCard.h - st.pane.h <= 60, `${label}: the preview card is its preview (and at most a line under it)`, { card: st.previewCard?.h, pane: st.pane?.h })
    expect(st.placement === "beside" ? st.listCard.left >= st.sidebarRight && st.listCard.left - st.sidebarRight <= 16 : st.placement === "center", `${label}: beside the sidebar`, { left: st.listCard?.left, sidebar: st.sidebarRight, placement: st.placement })
    const box = st.both && { left: st.both.left, right: st.both.right, top: Math.min(st.listCard.top, st.previewCard.top), bottom: Math.max(st.listCard.bottom, st.previewCard.bottom) }
    expect(box && box.left >= 0 && box.right <= kind.w && box.top >= 0 && box.bottom <= kind.h, `${label}: inside the window`, box)
  } else {
    note(`${label}: sheet ${st.sheet?.w}x${st.sheet?.h} of a ${kind.h} tall screen, preview ${st.pane?.w}x${st.pane?.h}`)
    expect(st.sheet && st.sheet.h <= kind.h * 0.9 + 2 && st.sheet.bottom <= kind.h + 1, `${label}: the sheet is no taller than 90% of the screen`, st.sheet)
  }
  if (!phone) expect(st.over.length === 0, `${label}: nothing of the editor's is drawn over the cards`, st.over)
  expect(st.overflow <= 0, `${label}: nothing wider than the window`, st.overflow)
  return st
}

async function close(p, phone, kind) {
  /* A phone's sheet is put away the way a person does: a tap on the dimmed editor above it. */
  if (phone) await p.touchscreen.tap(Math.round(kind.w / 2), 30)
  else await p.keyboard.press("Escape")
  await sleep(650)
  const open = await p.evaluate(() => !!document.querySelector("[data-block-picker][data-picker-open]") || document.querySelector("[data-block-picker-layer]")?.getAttribute("data-state") === "open")
  expect(!open, "put away")
}

async function run(kind) {
  const phone = kind.w < 640
  const p = await browser.newPage()
  await p.setViewport(phone ? { width: kind.w, height: kind.h, isMobile: true, hasTouch: true } : { width: kind.w, height: kind.h })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 4, { timeout: 60_000 })
  await p.evaluate(NORMALISE)
  await p.evaluate(GEOMETRY)
  await sleep(2500)
  console.log(`\n══ ${kind.w} × ${kind.h}${phone ? ", a phone" : ""} ══\n`)

  if (phone) {
    /* The sections sheet up, from its peek. */
    const tab = await p.evaluate(() => {
      const base = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((s) => s.querySelector("[data-wb-sidebar-scroll]"))
      const t = base && [...base.querySelectorAll("[role='tab']")].find((x) => /Sections/.test(x.textContent || ""))
      if (!t) return null
      const r = t.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    if (tab) (phone ? await p.touchscreen.tap(tab.x, tab.y) : await p.mouse.click(tab.x, tab.y))
    await sleep(900)
  }

  /* ── The product section and the footer: size, groups, every block ── */
  for (const [id, label] of [[PRODUCT, "product"], [FOOTER, "footer"]]) {
    const { add, addSel } = await openPicker(p, phone, id)
    if (!add) { expect(false, `${label}: its Add block row is in the tree`); continue }
    const opened = await pressAdd(p, addSel, phone)
    note(`${label}: the press held the main thread ${opened.press}ms; up with its preview ${opened.ready}ms after the press`)
    await checkSizes(p, phone, kind, label)
    await p.screenshot({ path: shot(`${kind.w}-${label}-0-open`) })
    await everyBlock(p, phone, kind, id, label)
    await close(p, phone, kind)
  }

  /* ── The "Section": open, time it, size, every block ── */
  const { add, addSel, tap, centre } = await openPicker(p, phone, SECTION)
  expect(!!add, "the section's Add block row is in the tree", add)
  if (!add) { await p.close(); return }
  const opened = await pressAdd(p, addSel, phone)
  note(`open: the press held the main thread ${opened.press}ms; ${phone ? `the sheet open with its preview drawn ${opened.drawn}ms, slid up ` : "up with its preview "}${opened.ready}ms after the press`)
  if (phone) {
    expect(opened.drawn != null && opened.drawn <= 80, "the sheet is open with its preview drawn in about 60ms", opened)
    expect(opened.ready !== null && opened.ready <= 400, "and has slid up within the builder's sheet timing", opened)
  } else expect(opened.ready !== null && opened.ready <= 80, "it opens, with a preview, in about 60ms", opened)
  await checkSizes(p, phone, kind, "section")
  await p.screenshot({ path: shot(`${kind.w}-section-0-open`) })

  /* ── HOVER, at full speed and at a quarter ── */
  const client = await p.target().createCDPSession()
  for (const rate of [1, 4]) {
    await client.send("Emulation.setCPUThrottlingRate", { rate })
    const times = await p.evaluate(async (phone) => {
      const rows = [...document.querySelectorAll("[data-block-picker-list] [role='option']")]
      const out = []
      for (const row of rows) {
        const want = `${row.getAttribute("data-block-choice")}:${row.getAttribute("data-preset")}`
        const t0 = performance.now()
        if (phone) row.click()
        else row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
        const got = await new Promise((resolve) => {
          const tick = () => {
            const stage = document.querySelector("[data-block-preview] [data-bp-showing]")
            if (stage?.getAttribute("data-bp-showing") === want) resolve(Math.round(performance.now() - t0))
            else if (performance.now() - t0 > 2000) resolve(null)
            else requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        out.push({ block: row.textContent.trim(), ms: got })
        await new Promise((r) => setTimeout(r, 60))
      }
      return out
    }, phone)
    const ms = times.map((t) => t.ms).filter((x) => x !== null).sort((a, b) => a - b)
    const worst = ms[ms.length - 1]
    const median = ms[Math.floor(ms.length / 2)]
    note(`${phone ? "tap" : "hover"} to preview, CPU ${rate}x: median ${median}ms, worst ${worst}ms  ${times.map((t) => `${t.block} ${t.ms}`).join(", ")}`)
    expect(times.every((t) => t.ms !== null), `every ${phone ? "tap" : "hover"} shows its block (CPU ${rate}x)`)
    expect(worst <= (rate === 1 ? 50 : 120), `and on the next frame or so (CPU ${rate}x)`, { median, worst })
  }
  await client.send("Emulation.setCPUThrottlingRate", { rate: 1 })

  await everyBlock(p, phone, kind, SECTION, "section")

  if (!phone) {
    /* ── KEYS ── */
    await p.evaluate(() => document.querySelector("[data-block-picker-search]").focus())
    const before = await p.evaluate(() => document.querySelector("[data-bp-showing]")?.getAttribute("data-bp-showing"))
    await p.keyboard.press("ArrowDown")
    await sleep(80)
    const after = await p.evaluate(() => document.querySelector("[data-bp-showing]")?.getAttribute("data-bp-showing"))
    expect(before !== after && !!after, "ArrowDown moves the preview to the next block", { before, after })
    await p.keyboard.type("butt")
    await sleep(120)
    const filtered = await p.evaluate(() => ({ rows: [...document.querySelectorAll("[data-block-picker-list] [role='option']")].map((r) => r.textContent.trim()), showing: document.querySelector("[data-bp-showing]")?.getAttribute("data-bp-showing") }))
    expect(filtered.rows.length >= 1 && filtered.rows.every((r) => /butt/i.test(r)) && /^button/.test(filtered.showing ?? ""), "typing filters the list and previews what is left", filtered)
    await p.keyboard.press("Escape")
    await sleep(350)
    const closed = await p.evaluate((addSel) => ({ state: document.querySelector("[data-block-picker-layer]")?.getAttribute("data-state"), focusBack: document.activeElement === document.querySelector(addSel) }), addSel)
    expect(closed.state === "closed" && closed.focusBack, "Escape puts it away, the focus back on Add block", closed)

    /* Opened again and a press outside it. */
    await p.mouse.click(add.x, add.y)
    await sleep(350)
    await p.mouse.click(kind.w - 40, kind.h - 40)
    await sleep(350)
    const away = await p.evaluate(() => document.querySelector("[data-block-picker-layer]")?.getAttribute("data-state"))
    expect(away === "closed", "a press outside puts it away", away)

    /* The line between the first two blocks: a new opening, and the block drawn at that place, not at the end. */
    const between = await p.evaluate((id) => {
      const line = document.querySelector(`[data-section-blocks="${id}"] [data-insert-block]`)
      const first = document.querySelector(`[data-section-blocks="${id}"] [data-tree-block]`)?.getAttribute("data-tree-block")
      if (!line) return null
      line.click()
      return { first }
    }, SECTION)
    await sleep(350)
    if (between) {
      await showRow(p, "text:Text", false)
      await sleep(80)
      const placed = await p.evaluate(() => {
        const t = document.querySelector("[data-block-preview] [data-bp-target]")
        const ids = [...(t?.closest("[data-bp-stage]")?.querySelectorAll("[data-block-id]") ?? [])].map((e) => e.getAttribute("data-block-id")).filter((x) => !/block-picker-preview-/.test(x))
        return { ids, showing: document.querySelector("[data-bp-showing]")?.getAttribute("data-bp-showing") }
      })
      expect(placed.ids[1] === "block-picker-preview" && placed.ids[0] === between.first, "from the line between two blocks, the block is drawn between them", placed)
      await p.keyboard.press("Escape")
      await sleep(300)
    } else note("no insert line between blocks found")
    /* A second opening of the same place: the previews are kept, so it is quicker still. */
    const again = await pressAdd(p, addSel, false)
    note(`a second opening: the press held the main thread ${again.press}ms; up ${again.ready}ms after the press`)
    expect(again.ready !== null && again.ready <= 80, "a second opening is up in about 60ms too", again)
  }

  /* ── MATCH: pick the Heading, and hold the canvas's block against the preview's ── */
  const pick = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-block-picker-list] [role='option']")]
    return rows.find((r) => r.getAttribute("data-block-choice") === "heading") ? "heading" : rows[0]?.getAttribute("data-block-choice")
  })
  const preview = await p.evaluate((pick, phone) => {
    const row = [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === pick)
    if (phone) row.click()
    else row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
    return new Promise((resolve) => requestAnimationFrame(() => {
      const t = document.querySelector("[data-block-preview] [data-bp-target]")
      const stage = t?.closest("[data-bp-stage]")
      const scale = stage ? stage.getBoundingClientRect().width / stage.offsetWidth : 1
      const r = t?.getBoundingClientRect()
      const fs = t ? getComputedStyle(t.matches("h1,h2,h3,p,a,span") ? t : t.querySelector("h1,h2,h3,p,a,span") ?? t) : null
      const vars = {}
      if (fs) for (let i = 0; i < fs.length; i++) if (fs[i].startsWith("--")) vars[fs[i]] = fs.getPropertyValue(fs[i]).trim()
      resolve(t ? { vars, html: window.__norm(t), w: Math.round(r.width / scale), h: Math.round(r.height / scale), font: fs.fontFamily, size: fs.fontSize, color: fs.color } : null)
    }))
  }, pick, phone)
  const blocksBefore = await p.evaluate((id) => [...document.querySelectorAll(`#wb-section-${id} [data-block-id]`)].map((e) => e.getAttribute("data-block-id")), SECTION)
  if (phone) {
    const btn = await centre("[data-block-picker-add]")
    await tap(btn)
  } else {
    await p.evaluate((pick) => [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === pick).click(), pick)
  }
  await sleep(1200)
  const landed = await p.evaluate((id, before) => {
    const fresh = [...document.querySelectorAll(`#wb-section-${id} [data-block-id]`)].find((e) => !before.includes(e.getAttribute("data-block-id")))
    if (!fresh) return null
    const r = fresh.getBoundingClientRect()
    const sc = document.getElementById("wb-preview-root").getBoundingClientRect()
    const fs = getComputedStyle(fresh.matches("h1,h2,h3,p,a,span") ? fresh : fresh.querySelector("h1,h2,h3,p,a,span") ?? fresh)
    const vars = {}
    for (let i = 0; i < fs.length; i++) if (fs[i].startsWith("--")) vars[fs[i]] = fs.getPropertyValue(fs[i]).trim()
    return { vars, html: window.__norm(fresh), w: Math.round(r.width), h: Math.round(r.height), font: fs.fontFamily, size: fs.fontSize, color: fs.color, onScreen: r.bottom > sc.top && r.top < sc.bottom }
  }, SECTION, blocksBefore)
  expect(!!landed, `the ${pick} block lands in the section`)
  if (landed && preview) {
    const same = landed.html === preview.html
    expect(same, "the canvas draws exactly the markup the preview showed", same ? undefined : { preview: preview.html.slice(0, 220), canvas: landed.html.slice(0, 220) })
    expect(Math.abs(landed.w - preview.w) <= 2 && Math.abs(landed.h - preview.h) <= 2, "at the same size", { preview: [preview.w, preview.h], canvas: [landed.w, landed.h] })
    expect(landed.font === preview.font && landed.size === preview.size && landed.color === preview.color, "in the same type and colour", { preview: [preview.font, preview.size, preview.color], canvas: [landed.font, landed.size, landed.color] })
    expect(landed.onScreen, "and is on screen in the canvas")
    const differ = Object.keys({ ...landed.vars, ...preview.vars }).filter((k) => landed.vars[k] !== preview.vars[k])
    if (differ.length) note(`custom properties that differ on the block: ${differ.slice(0, 12).map((k) => `${k} preview=${preview.vars[k]} canvas=${landed.vars[k]}`).join("; ")}`)
  }
  await p.screenshot({ path: shot(`${kind.w}-section-9-added`) })
  expect((await p.evaluate(() => document.documentElement.scrollWidth - innerWidth)) <= 0, "still nothing wider than the window")
  await p.close()
}

/**
 * ===========================================================================
 *  AN IMPORTED THEME: tests/fixtures/shopify-posture
 * ===========================================================================
 * Its sections are drawn by the compat engine, in a frame: the preview is
 * the same engine, in a frame of its own. The block is found by what the
 * theme prints for `block.shopify_attributes`, and held against the block
 * the canvas's frame draws once it is added. Its home page's Rich text,
 * then its product page's product information.
 */
async function CANVAS_FRAME(p) {
  for (const f of p.frames()) {
    if (f === p.mainFrame() || f.url() !== "about:srcdoc" || f.parentFrame() !== p.mainFrame()) continue
    const el = await f.frameElement().catch(() => null)
    if (el && (await el.evaluate((x) => x.getAttribute("data-compat-frame") === "front"))) return f
  }
  return null
}
async function compatSection(p, match, label, kind) {
  const id = await p.evaluate((match) => [...document.querySelectorAll("[data-section-row]")].find((r) => new RegExp(match, "i").test(r.textContent || ""))?.getAttribute("data-section-row") ?? null, match)
  expect(!!id, `the theme's ${label} section is in the tree`, id)
  if (!id) return null
  const already = await p.evaluate((id) => !!document.querySelector(`[data-section-blocks="${id}"] [data-add-block]`), id)
  if (!already) await p.evaluate((id) => document.querySelector(`[data-section-expand="${id}"]`)?.click(), id)
  await sleep(500)
  const addSel = `[data-section-blocks="${id}"] [data-tree-add-block="1"]`
  const t0 = Date.now()
  await p.evaluate((sel) => { const el = document.querySelector(sel); el.scrollIntoView({ block: "center" }); el.focus(); el.click() }, addSel)
  let ready = null
  for (let i = 0; i < 100 && ready === null; i++) {
    await sleep(50)
    if (await p.evaluate(() => !!document.querySelector("[data-block-preview] iframe[data-bp-showing]"))) ready = Date.now() - t0
  }
  note(`${label}: the preview frame showed its first block ${ready}ms after the press (the theme's files are read once, the first time)`)
  expect(ready !== null, `${label}: the imported theme's block is drawn in the preview`, ready)
  await sleep(300)
  await checkSizes(p, false, kind, `compat ${label}`)
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-block-picker-list] [role='option']")].map((r) => `${r.getAttribute("data-block-choice")}:${r.getAttribute("data-preset")}`))
  const times = []
  for (const want of rows) {
    const ms = await p.evaluate((want) => new Promise((resolve) => {
      const row = [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => `${r.getAttribute("data-block-choice")}:${r.getAttribute("data-preset")}` === want)
      row.scrollIntoView({ block: "nearest" })
      const t = performance.now()
      row.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", isPrimary: true }))
      const tick = () => {
        const f = document.querySelector("[data-block-preview] iframe[data-bp-showing]")
        if (f?.getAttribute("data-bp-showing") === want) resolve(Math.round(performance.now() - t))
        else if (performance.now() - t > 2000) resolve(null)
        else requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }), want)
    times.push(ms)
  }
  note(`${label}: hover to preview in the imported theme: ${times.join(", ")}ms`)
  expect(times.every((t) => t !== null && t <= 80), `${label}: each on the next frame or so`, times)
  await everyBlock(p, false, kind, id, `compat-${label}`)
  return { id, addSel }
}

async function compat() {
  const fixture = JSON.parse(execFileSync("npx", ["tsx", "-e", `
    import { converted } from "./scripts/check-builder-nav19"
    converted().then((t) => {
      const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
      const files = Object.fromEntries(Object.entries(t.files).filter(([p, v]) => p.startsWith("shopify/") && !String(v).startsWith("base64:")))
      const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
      process.stdout.write(JSON.stringify({ compat: { settings: t.settings, pages, sources, files }, all: t.files }))
    })`], { maxBuffer: 256 * 1024 * 1024, encoding: "utf8" }))
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_COMPAT=${JSON.stringify(fixture.compat).replace(/</g, "\\u003c")}</script><script src="/editor-probe.js"></script></body></html>`
  const srv = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x")
    if (url.pathname === "/editor-probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const name = decodeURIComponent(asset[1])
      const text = fixture.all[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404); return res.end() }
      res.writeHead(200, { "content-type": name.endsWith(".css") ? "text/css" : name.endsWith(".js") ? "text/javascript" : "text/plain", "access-control-allow-origin": "*" })
      return res.end(text)
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(url.pathname.startsWith("/editor") ? html : "<!doctype html><title>blank</title>")
  })
  await new Promise((r) => srv.listen(0, "127.0.0.1", r))
  const kind = { w: 1440, h: 900 }
  const p = await browser.newPage()
  await p.setViewport({ width: kind.w, height: kind.h })
  await p.evaluateOnNewDocument("window.__name = (f) => f")
  await p.goto(`http://127.0.0.1:${srv.address().port}/editor`, { waitUntil: "load" })
  console.log("\n══ 1440 × 900, an imported Shopify theme ══\n")
  for (let i = 0; i < 120 && !(await CANVAS_FRAME(p)); i++) await sleep(250)
  await sleep(2500)
  await p.evaluate(NORMALISE)
  await p.evaluate(GEOMETRY)
  const rich = await compatSection(p, "Rich text", "rich-text", kind)
  if (rich) {
    /* Pick the Heading, and hold the canvas frame's block against the preview frame's. */
    await showRow(p, (await p.evaluate(() => { const r = [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === "heading"); return `${r.getAttribute("data-block-choice")}:${r.getAttribute("data-preset")}` })), false)
    await sleep(120)
    const preview = await p.evaluate(() => {
      const t = document.querySelector("[data-block-preview] iframe").contentDocument.querySelector("[data-bp-target]")
      const cs = t.ownerDocument.defaultView.getComputedStyle(t)
      return { html: window.__norm(t), font: cs.fontFamily, size: cs.fontSize, color: cs.color, w: Math.round(t.getBoundingClientRect().width) }
    })
    let frame = await CANVAS_FRAME(p)
    const before = await frame.evaluate(() => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id")))
    await p.evaluate(() => [...document.querySelectorAll("[data-block-picker-list] [role='option']")].find((r) => r.getAttribute("data-block-choice") === "heading").click())
    await sleep(2500)
    frame = (await CANVAS_FRAME(p)) ?? frame
    const landed = await frame.evaluate((before) => {
      const el = [...document.querySelectorAll("[data-block-id]")].find((e) => !before.includes(e.getAttribute("data-block-id")))
      if (!el) return null
      const c = el.cloneNode(true)
      for (const n of [c, ...c.querySelectorAll("*")]) for (const a of [...n.attributes]) if (/^data-(block-id|bp-|section-id|sl-block|editor|wb-)|^(id|aria-[a-z]+|tabindex|contenteditable|spellcheck|draggable|loading|decoding)$/.test(a.name)) n.removeAttribute(a.name)
      const cs = getComputedStyle(el)
      return { html: c.outerHTML.replace(/\s+/g, " ").trim(), font: cs.fontFamily, size: cs.fontSize, color: cs.color, w: Math.round(el.getBoundingClientRect().width) }
    }, before).catch((e) => ({ error: String(e).slice(0, 120) }))
    expect(!!landed && !landed.error, "the heading lands in the canvas's frame", landed?.error)
    if (landed && !landed.error) {
      expect(landed.html === preview.html, "the frame draws the markup the preview showed", landed.html === preview.html ? undefined : { preview: preview.html.slice(0, 160), canvas: landed.html.slice(0, 160) })
      expect(landed.font === preview.font && landed.size === preview.size && landed.color === preview.color, "in the same type and colour", { preview: [preview.size, preview.color, preview.font.slice(0, 30)], canvas: [landed.size, landed.color, landed.font.slice(0, 30)] })
      expect(Math.abs(landed.w - preview.w) <= 2, "at the same width", { preview: preview.w, canvas: landed.w })
    }
    await p.screenshot({ path: shot("compat-added") })
  }

  /* The product page, through the page switcher, and its product information. */
  const switched = await p.evaluate(async () => {
    const opener = [...document.querySelectorAll("button")].find((b) => /^(Home page|Home)$/.test((b.textContent || "").trim()))
    if (!opener) return "no switcher"
    opener.click()
    await new Promise((r) => setTimeout(r, 500))
    const row = document.querySelector("[data-page-row='product']") ?? [...document.querySelectorAll("button, [role=button]")].find((b) => /^\/product/i.test((b.textContent || "").trim()))
    if (!row) return "no product row"
    row.click()
    return "ok"
  })
  note(`the product page: ${switched}`)
  await sleep(4000)
  await p.evaluate(GEOMETRY)
  await compatSection(p, "Product", "product", kind)
  await p.keyboard.press("Escape")
  await p.close()
  srv.close()
}

/* ONLY=390 runs one size; ONLY=compat the imported theme alone. */
for (const kind of [{ w: 1980, h: 1240 }, { w: 1440, h: 900 }, { w: 1280, h: 800 }, { w: 390, h: 844 }].filter((k) => !process.env.ONLY || String(k.w) === process.env.ONLY)) await run(kind)
if (!process.env.ONLY || process.env.ONLY === "compat") await compat()
await browser.close()
server.close()
if (table.length) {
  console.log("\nEvery preview: screen, section, block, pane, what it paints, fill %, scale, laid out at / canvas width")
  for (const r of table) console.log(`  ${r.screen.padEnd(10)} ${r.section.padEnd(18)} ${r.block.padEnd(36)} ${r.pane.padEnd(12)} ${r.painted.padEnd(13)} ${String(r.fill).padStart(5)}%  x${String(r.scale).padEnd(6)} ${r.stage}/${r.canvas}`)
}
console.log(`\n${bad === 0 ? "all good" : `${bad} failed`}; pictures in ${SHOTS}\n`)
if (bad && STRICT) process.exit(1)
