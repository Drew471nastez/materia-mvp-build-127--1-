/**
 * ===========================================================================
 *  ROUND AO: A WALK THROUGH THE ONEPAGE EDITOR, MEASURED AND PICTURED
 * ===========================================================================
 * The owner: "are you sure you have fixed all I told you in the onepage
 * editor". The real editor (scripts/onepage-probe-server.mjs) at 390x844
 * (touch) and 1440x900, deviceScaleFactor 1:
 *
 *   picker     Add block: one entry per row (each as wide as the list), a
 *              coloured round mark on each (not grey), the categories, the
 *              search, and Recently used once a block has been added
 *   blocks     a set of blocks added from the picker, each opened: its
 *              Settings and its Layout tab pictured; in both, no field
 *              label sits closer than 4px over its field, every select is
 *              Storelib's picker (no native <select>) with its arrow inside
 *              the field's right edge and centred, and nothing is wider than
 *              the block
 *   design     the Design tab's panels pictured (Header, Wallpaper, Text)
 *
 *   SHOTS=<dir> node scripts/check-onepage-tour-ao.mjs
 *   ONLY=link,group   picker entries to walk (a default set otherwise)
 *   REPORT=1   numbers only, nothing fails
 */
import { mkdirSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const REPORT = process.env.REPORT === "1"
const SHOTS = process.env.SHOTS || null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const ENTRIES = process.env.ONLY ? process.env.ONLY.split(",") : ["link", "email_capture", "image", "group", "text", "heading", "shelf_digital", "shelf_physical", "app_instagram", "app_tiktok", "app_note", "app_poll", "int_booking", "pdf_document", "int_spotify", "music", "form_quiz", "contact_form", "whatsapp", "social_row", "magnet_download", "followers", "faq", "map"]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const expect = (ok, label, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`)
  if (!ok) failures++
}
const fail = (m) => { throw new Error(m) }

const blocks = [
  { id: "hdr", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
]
const { base, server } = await serveEditorProbe({ blocks, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], protocolTimeout: 600000 })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

async function open(vp, hash = "links") {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 240)))
  p.on("console", (m) => {
    if (m.type() !== "error") return
    const t = m.text()
    if (/Failed to load resource|net::ERR_|favicon/.test(t)) return
    errors.push(t.slice(0, 240))
  })
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector(hash === "links" ? "[data-add-block]" : "[data-design-panel]", { timeout: 30000 })
  await sleep(2000)
  return { p, errors }
}

async function press(p, vp, sel) {
  const box = await p.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    el.scrollIntoView({ block: "center" })
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, sel)
  if (!box) return false
  await sleep(150)
  if (vp.hasTouch) await p.touchscreen.tap(box.x, box.y)
  else await p.mouse.click(box.x, box.y)
  return true
}

const shot = async (p, name, el = null) => {
  if (!SHOTS) return
  if (el) {
    const h = await p.$(el)
    if (h) { await h.screenshot({ path: `${SHOTS}/${name}.png` }); return }
  }
  await p.screenshot({ path: `${SHOTS}/${name}.png` })
}

/* Labels over their fields, select arrows, overflow: in one block's open settings. */
const fields = (p, id) => p.evaluate((id) => {
  const settings = document.querySelector(`[data-block-id="${id}"] [data-block-settings]`)
  if (!settings) return null
  const box = settings.getBoundingClientRect()
  const visible = (el) => {
    const b = el.getBoundingClientRect()
    if (!b.width || !b.height) return false
    for (let a = el; a && a !== settings; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false
    }
    return true
  }
  const controls = [...settings.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=color]), textarea, [data-choice-field]')].filter(visible)
  const texts = [...settings.querySelectorAll("*")].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
  const glued = []
  const gaps = []
  for (const c of controls) {
    const cb = c.getBoundingClientRect()
    let best = null
    for (const t of texts) {
      if (c.contains(t) || t.contains(c)) continue
      const tb = t.getBoundingClientRect()
      if (tb.bottom > cb.top + 2 || cb.top - tb.bottom > 40) continue
      if (tb.right < cb.left + 2 || tb.left > cb.right - 2) continue
      if (!best || tb.bottom > best.b.bottom) best = { t, b: tb }
    }
    if (!best) continue
    const gap = Math.round((cb.top - best.b.bottom) * 10) / 10
    gaps.push(gap)
    if (gap < 4) glued.push(`"${best.t.textContent.trim().slice(0, 28)}" ${gap}px over ${c.tagName.toLowerCase()}`)
  }
  const arrows = []
  /* "Add a network" and the like are a centred + and words, with no arrow (components/onepage/editor-choice AddFromList). */
  for (const f of [...settings.querySelectorAll("[data-choice-field]")].filter((x) => !x.closest("[data-add-from-list]"))) {
    if (!visible(f)) continue
    const svg = [...f.querySelectorAll("svg")].filter((x) => getComputedStyle(x).display !== "none" && x.getBoundingClientRect().width > 0).pop()
    if (!svg) continue
    const fb = f.getBoundingClientRect(), sb = svg.getBoundingClientRect()
    const inset = Math.round(fb.right - sb.right)
    const off = Math.round(Math.abs((sb.top + sb.bottom) / 2 - (fb.top + fb.bottom) / 2) * 10) / 10
    if (inset < 6 || inset > 20 || off > 1.5) arrows.push(`${f.getAttribute("data-choice-field")}: inset ${inset}, off-centre ${off}`)
  }
  const selects = [...settings.querySelectorAll("select")].filter(visible).map((s) => s.getAttribute("aria-label") || s.name || "?")
  const over = [...settings.querySelectorAll("*")].filter((el) => {
    if (!visible(el) || el.closest("[data-scroll-row], [data-pill-row]")) return false
    for (let a = el.parentElement; a && a !== settings; a = a.parentElement) if (getComputedStyle(a).overflowX !== "visible") return false
    const b = el.getBoundingClientRect()
    return b.right > box.right + 1 || b.left < box.left - 1
  }).map((el) => el.tagName.toLowerCase() + " " + (el.textContent || "").trim().slice(0, 20)).slice(0, 3)
  return { controls: controls.length, minGap: gaps.length ? Math.min(...gaps) : null, glued, arrows, selects, over, height: Math.round(box.height) }
}, id)

async function picker(vp) {
  const w = vp.width
  console.log(`\nAdd block at ${w}`)
  const { p, errors } = await open(vp)
  await press(p, vp, "[data-add-block]")
  await sleep(1000)
  const look = await p.evaluate(() => {
    const entries = [...document.querySelectorAll("[data-picker-section][data-shown] [data-picker-entry]")].filter((e) => e.getBoundingClientRect().height > 0)
    const list = entries[0]?.closest("[data-picker-section]")?.getBoundingClientRect()
    const widths = entries.map((e) => Math.round(e.getBoundingClientRect().width))
    const lefts = new Set(entries.map((e) => Math.round(e.getBoundingClientRect().left)))
    const marks = entries.map((e) => {
      const m = [...e.querySelectorAll("span, div")].find((x) => { const s = getComputedStyle(x); const b = x.getBoundingClientRect(); return b.width >= 28 && Math.abs(b.width - b.height) < 2 && (s.backgroundColor !== "rgba(0, 0, 0, 0)" || x.querySelector("svg")) })
      if (!m) return null
      const bg = getComputedStyle(m).backgroundColor
      const nums = (bg.match(/\d+/g) || []).map(Number)
      const grey = nums.length >= 3 && Math.max(nums[0], nums[1], nums[2]) - Math.min(nums[0], nums[1], nums[2]) < 12 && nums[0] > 200
      return { size: Math.round(m.getBoundingClientRect().width), radius: getComputedStyle(m).borderRadius, grey }
    })
    const chips = [...document.querySelectorAll("[data-picker-chip]")].map((c) => c.textContent.trim())
    return { count: entries.length, oneColumn: lefts.size === 1, minWidth: Math.min(...widths), listWidth: Math.round(list?.width ?? 0), marks: marks.filter(Boolean).length, greyMarks: marks.filter((m) => m && m.grey).length, markSize: marks.find(Boolean)?.size, markRadius: marks.find(Boolean)?.radius, chips, search: !!document.querySelector("[data-picker-search]") }
  })
  console.log(`        ${JSON.stringify(look)}`)
  expect(look.oneColumn && look.minWidth >= look.listWidth - 2, `${w}: one entry per row, each as wide as the list`, { oneColumn: look.oneColumn, minWidth: look.minWidth, listWidth: look.listWidth })
  expect(look.marks === look.count && look.greyMarks === 0, `${w}: every entry has a coloured round mark, none grey`, { marks: look.marks, of: look.count, grey: look.greyMarks, size: look.markSize, radius: look.markRadius })
  expect(["Essentials", "Commerce", "Social", "Media", "Contact", "Events", "Text"].every((c) => look.chips.some((x) => x.includes(c))) && look.chips.some((x) => /View all|All/.test(x)), `${w}: the categories, then View all`, look.chips)
  expect(look.search, `${w}: a search field`)
  await shot(p, `picker-essentials-${w}`)
  await p.type("[data-picker-search]", "insta")
  await sleep(600)
  const found = await p.evaluate(() => [...document.querySelectorAll("[data-picker-entry]")].filter((e) => e.getBoundingClientRect().height > 0).map((e) => e.textContent.trim().slice(0, 30)))
  expect(found.some((t) => /Instagram/.test(t)), `${w}: search "insta" finds Instagram`, found.slice(0, 4))
  await shot(p, `picker-search-${w}`)
  /* Add one, open again: Recently used. */
  await p.evaluate(() => { const s = document.querySelector("[data-picker-search]"); s.value = ""; s.dispatchEvent(new Event("input", { bubbles: true })) })
  await p.keyboard.press("Escape")
  await sleep(700)
  await press(p, vp, "[data-add-block]")
  await sleep(900)
  await press(p, vp, '[data-picker-section][data-shown] [data-picker-entry="link"]')
  await sleep(1200)
  await press(p, vp, "[data-add-block]")
  await sleep(1000)
  const recent = await p.evaluate(() => [...document.querySelectorAll("[data-picker-section]")].filter((s) => s.getBoundingClientRect().height > 0).map((s) => s.getAttribute("data-picker-section")))
  expect(recent.some((s) => /recent/.test(s)), `${w}: Recently used shows after adding`, recent)
  await shot(p, `picker-recent-${w}`)
  await p.keyboard.press("Escape")
  await sleep(500)
  expect(errors.length === 0, `${w}: no page errors`, errors.slice(0, 2))
  await p.close()
}

async function walk(vp) {
  const w = vp.width
  console.log(`\nBlocks at ${w}`)
  const { p, errors } = await open(vp)
  for (const entry of ENTRIES) {
    const ids0 = await p.evaluate(() => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id")))
    await press(p, vp, "[data-add-block]")
    await sleep(800)
    await press(p, vp, '[data-picker-chip="all"]')
    await sleep(400)
    const ok = await press(p, vp, `[data-picker-section][data-shown] [data-picker-entry="${entry}"]`)
    await sleep(1200)
    const id = await p.evaluate((ids0) => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id")).find((x) => !ids0.includes(x)) ?? null, ids0)
    if (!ok || !id) { expect(false, `${w} ${entry}: added`, { ok, id }); await p.keyboard.press("Escape"); await sleep(400); continue }
    const isOpen = () => p.evaluate((id) => !!document.querySelector(`[data-block-id="${id}"] [data-block-settings]`), id)
    if (!(await isOpen())) { await press(p, vp, `[data-block-open="${id}"]`); await sleep(900) }
    await p.evaluate((id) => document.querySelector(`[data-block-id="${id}"]`).scrollIntoView({ block: "start" }), id)
    await sleep(300)
    const type = await p.evaluate((id) => document.querySelector(`[data-block-id="${id}"]`)?.getAttribute("data-block-type"), id)
    const s = await fields(p, id)
    await shot(p, `block-${entry}-settings-${w}`, `[data-block-id="${id}"]`)
    let l = null
    const layoutTab = `[data-block-id="${id}"] [data-block-tab="layout"]`
    const hasTabs = !!(await p.$(layoutTab))
    if (hasTabs) {
      await press(p, vp, layoutTab)
      await sleep(600)
      l = await fields(p, id)
      await shot(p, `block-${entry}-layout-${w}`, `[data-block-id="${id}"]`)
      await press(p, vp, `[data-block-id="${id}"] [data-block-tab="settings"]`)
      await sleep(400)
    }
    const all = { glued: [...(s?.glued ?? []), ...(l?.glued ?? [])], arrows: [...(s?.arrows ?? []), ...(l?.arrows ?? [])], selects: [...(s?.selects ?? []), ...(l?.selects ?? [])], over: [...(s?.over ?? []), ...(l?.over ?? [])] }
    console.log(`        ${entry} (${type}): tabs ${hasTabs}, settings ${s?.controls} fields min gap ${s?.minGap}px, layout ${l?.controls ?? "-"} fields min gap ${l?.minGap ?? "-"}px`)
    expect(hasTabs, `${w} ${entry}: Settings | Layout tabs`)
    expect(all.glued.length === 0, `${w} ${entry}: no label glued to its field (< 4px)`, all.glued)
    expect(all.arrows.length === 0, `${w} ${entry}: select arrows inside the right edge and centred`, all.arrows)
    expect(all.selects.length === 0, `${w} ${entry}: no native select`, all.selects)
    expect(all.over.length === 0, `${w} ${entry}: nothing wider than the block`, all.over)
    await press(p, vp, `[data-block-open="${id}"]`)
    await sleep(700)
  }
  expect(errors.length === 0, `${w}: no page errors`, errors.slice(0, 2))
  await p.close()
}

async function design(vp) {
  const w = vp.width
  console.log(`\nDesign at ${w}`)
  const { p, errors } = await open(vp, "design")
  await shot(p, `design-home-${w}`)
  for (const row of ["header", "wallpaper", "text", "buttons"]) {
    const has = await p.$(`[data-nav-row="${row}"]`)
    if (!has) { expect(false, `${w}: Design has ${row}`); continue }
    await p.$eval(`[data-nav-row="${row}"]`, (b) => b.click())
    await sleep(900)
    const panel = await p.evaluate(() => {
      const sc = [...document.querySelectorAll("[data-design-panel]")].find((e) => e.getAttribute("data-design-panel") !== "home" && e.getBoundingClientRect().width > 0)
      if (!sc) return null
      return { selects: sc.querySelectorAll("select").length, files: [...sc.querySelectorAll("button")].filter((b) => /Your files|From your files|Choose from your files/i.test(b.textContent)).length, profileLayout: /Profile image/i.test(sc.textContent) }
    })
    console.log(`        ${row}: ${JSON.stringify(panel)}`)
    expect(panel && panel.selects === 0, `${w}: ${row}: no native select`, panel)
    await shot(p, `design-${row}-${w}`)
    await p.evaluate(() => { const sc = document.querySelector("[data-design-panel]")?.closest("[data-scroll-container]"); if (sc) sc.scrollTop = 900 })
    await sleep(500)
    await shot(p, `design-${row}-scrolled-${w}`)
    const back = await p.$("[data-sticky-back-button]")
    if (back) await p.$eval("[data-sticky-back-button]", (b) => b.click())
    else await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Design$|Back/.test(b.getAttribute("aria-label") || b.textContent.trim()))?.click())
    await sleep(800)
  }
  expect(errors.length === 0, `${w}: no page errors`, errors.slice(0, 2))
  await p.close()
}

try {
  for (const vp of [PHONE, DESK]) {
    if (!process.env.SKIP?.includes("picker")) await picker(vp)
    if (!process.env.SKIP?.includes("blocks")) await walk(vp)
    if (!process.env.SKIP?.includes("design")) await design(vp)
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\n${failures ? `${failures} failed` : "all passed"}`)
if (failures && !REPORT) process.exit(1)
