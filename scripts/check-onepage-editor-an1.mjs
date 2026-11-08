/**
 * ===========================================================================
 *  ROUND AN, TRACK 1: THE ONEPAGE EDITOR'S SHELL AND CONTROLS
 * ===========================================================================
 * The real editor (scripts/onepage-probe-server.mjs) in headless Chromium, at
 * 390x844 (a phone: touch, 2x) and 1440x900 (a mouse):
 *
 *   plus       + Add's + and the button under it, every frame of an open and
 *              of a close, the CPU slowed four times: the + turns through
 *              frames to 45 and back to 0 without ever turning back on
 *              itself, and the button's colour lands with it
 *   sparkle    a link's row has the animation button beside its numbers; it
 *              opens a menu (a computer) or the shared sheet (a phone),
 *              Pulse is kept, and the preview draws the link pulsing; no
 *              block's Layout tab holds animation pictures
 *   remove     an open email signup (a long block) shows Remove above its
 *              Settings | Layout tabs, on screen without a scroll
 *   matrix     every entry in Add block's View all: added, opened, Settings
 *              and Layout, a value typed, collapsed, moved with the keys,
 *              removed through Remove and Delete; no page error, no native
 *              <select>, nothing wider than its panel, and at 1440 the
 *              preview changes when the value is typed
 *
 *   PROBE_CSS=source node scripts/check-onepage-editor-an1.mjs
 *   REPORT=1   numbers only, nothing fails
 *   ONLY=link,heading   matrix entries to run (all by default)
 */
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const REPORT = process.env.REPORT === "1"
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",")) : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const expect = (ok, label, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`)
  if (!ok) failures++
}
const fail = (m) => { throw new Error(m) }

const blocks = [
  { id: "hdr", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
  { id: "lnk", type: "link_button", enabled: true, sort_order: 1, data: { label: "Shop the prints", url: "https://example.com/shop" } },
  { id: "sig", type: "email_capture", enabled: true, sort_order: 2, data: { headline: "Join my newsletter", description: "Updates", button_preset: "subscribe" } },
  { id: "hed", type: "heading", enabled: true, sort_order: 3, data: { text: "Work with me", size: "medium", alignment: "center" } },
]
const { base, server } = await serveEditorProbe({ blocks, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], protocolTimeout: 600000 })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }

async function open(vp) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 240)))
  p.on("console", (m) => {
    if (m.type() !== "error") return
    const t = m.text()
    /* A picture or a stub answer the harness does not serve is the harness, not the editor. */
    if (/Failed to load resource|net::ERR_|favicon/.test(t)) return
    errors.push(t.slice(0, 240))
  })
  await p.goto(`${base}/app/onepage#links`)
  await p.waitForSelector("[data-add-block]", { timeout: 20000 })
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
  await sleep(120)
  if (vp.hasTouch) await p.touchscreen.tap(box.x, box.y)
  else await p.mouse.click(box.x, box.y)
  return true
}

/* ── + Add, open and close, every frame ─────────────────────────────── */

async function plusMotion(vp) {
  const w = vp.width
  console.log(`\n+ Add at ${w}, CPU 4x`)
  const { p, errors } = await open(vp)
  const cdp = await p.target().createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const sample = () => p.evaluate(() => {
    window.__f = []
    const btn = document.querySelector("[data-add-block]")
    const svg = btn.querySelector("svg")
    const t0 = performance.now()
    const tick = () => {
      const r = getComputedStyle(svg).rotate
      const c = getComputedStyle(btn)
      window.__f.push({ t: Math.round(performance.now() - t0), rot: r === "none" ? 0 : parseFloat(r), bg: c.backgroundColor, scale: c.scale })
      if (performance.now() - t0 < 900) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const read = () => p.evaluate(() => window.__f)
  const judge = (frames, from, to, what) => {
    const rots = frames.map((f) => f.rot)
    const between = [...new Set(rots.filter((r) => Math.abs(r - from) > 0.5 && Math.abs(r - to) > 0.5))]
    let reversals = 0
    const dir = Math.sign(to - from)
    for (let i = 1; i < rots.length; i++) if (Math.sign(rots[i] - rots[i - 1]) === -dir && Math.abs(rots[i] - rots[i - 1]) > 0.05) reversals++
    const steps = rots.slice(1).map((r, i) => Math.abs(r - rots[i]))
    const moving = frames.filter((f, i) => i > 0 && Math.abs(f.rot - frames[i - 1].rot) > 0.05)
    const landedAt = frames.find((f) => Math.abs(f.rot - to) < 0.05)?.t ?? null
    const colours = [...new Set(frames.map((f) => f.bg))]
    const colourLanded = frames.findIndex((f) => f.bg === frames[frames.length - 1].bg)
    console.log(`        ${what}: ${frames.length} frames, ${between.length} in between, biggest step ${Math.max(0, ...steps).toFixed(1)}deg, lands at ${landedAt}ms, ${colours.length} colours, colour lands at ${frames[colourLanded]?.t}ms`)
    expect(Math.abs(rots[rots.length - 1] - to) < 0.05, `${w}: ${what}: the + ends at ${to} degrees`, rots[rots.length - 1])
    expect(between.length >= 3, `${w}: ${what}: it turns through frames, not in one step`, between.slice(0, 6).map((r) => +r.toFixed(1)))
    expect(reversals === 0, `${w}: ${what}: it never turns back on itself (one motion, no second animation)`, { reversals, moving: moving.length })
    expect(colours.length >= 3, `${w}: ${what}: the button's colour moves with it, through frames`, colours.length)
  }
  /* Open. */
  await p.evaluate(() => document.querySelector("[data-add-block]").scrollIntoView({ block: "center" }))
  await sleep(300)
  await sample()
  await press(p, vp, "[data-add-block]")
  await sleep(1100)
  judge(await read(), 0, 45, "open")
  /* Close: Escape, as a keyboard or the scrim would. */
  await sample()
  await p.keyboard.press("Escape")
  await sleep(1100)
  judge(await read(), 45, 0, "close")
  expect(errors.length === 0, `${w}: no page errors`, errors.slice(0, 2))
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await p.close()
}

/* ── the sparkle, Remove at the top ────────────────────────────────────── */

async function rowControls(vp) {
  const w = vp.width
  console.log(`\nThe row's animation button and Remove at ${w}`)
  const { p, errors } = await open(vp)
  const btn = '[data-block-id="lnk"] [data-block-animation]'
  const has = await p.$(btn)
  expect(!!has, `${w}: a link's row has the animation button`)
  const beside = await p.evaluate(() => {
    const row = document.querySelector('[data-block-id="lnk"] [data-reorder-zone]')
    const a = row?.querySelector("[data-block-animation]")
    const stats = row?.querySelector('[title]:not([data-block-animation])')
    if (!a || !stats) return null
    const ra = a.getBoundingClientRect()
    const rs = stats.getBoundingClientRect()
    return { gap: Math.round(rs.left - ra.right), sameLine: Math.abs(ra.top + ra.height / 2 - (rs.top + rs.height / 2)) < 2 }
  })
  expect(beside && beside.sameLine && beside.gap >= 0 && beside.gap <= 16, `${w}: it sits beside the numbers, on the same line`, beside)
  await press(p, vp, btn)
  await sleep(700)
  const surface = await p.evaluate(() => (document.querySelector("[data-action-list]") ? "menu" : document.querySelector("[data-mobile-bottom-sheet], [data-sheet-root]") ? "sheet" : null))
  expect(surface === (vp.hasTouch ? "sheet" : "menu"), `${w}: it opens ${vp.hasTouch ? "the shared sheet" : "a menu under it"}`, surface)
  const row = await p.evaluate(() => {
    const all = [...document.querySelectorAll("[data-action-list] [role=menuitem], [data-mobile-bottom-sheet] button, [data-sheet-root] button")]
    const el = all.find((b) => b.textContent.trim() === "Pulse")
    if (!el) return null
    el.setAttribute("data-probe-pick", "")
    return true
  })
  expect(!!row, `${w}: Pulse is in it`)
  if (row) await press(p, vp, "[data-probe-pick]")
  await sleep(900)
  const now = await p.evaluate(() => document.querySelector('[data-block-id="lnk"] [data-block-animation]')?.getAttribute("data-block-animation"))
  expect(now === "pulse", `${w}: the choice is kept`, now)
  if (!vp.hasTouch) {
    await sleep(800)
    const pulsing = await p.evaluate(() => {
      const f = document.querySelector("iframe")
      const d = f?.contentDocument
      return d ? !!d.querySelector('[data-op-block="lnk"] .animate-onepage-pulse, [data-op-block="lnk"].animate-onepage-pulse') : null
    })
    expect(pulsing === true, `${w}: the preview draws the link pulsing`, pulsing)
  }
  /* Remove, at the top of an open long block. */
  await press(p, vp, '[data-block-open="sig"]')
  await sleep(900)
  const top = await p.evaluate(() => {
    const card = document.querySelector('[data-block-id="sig"]')
    const settings = card.querySelector("[data-block-settings]")
    const remove = settings?.querySelector("[data-block-remove]")
    const tabs = settings?.querySelector("[data-block-tabs]")
    if (!remove || !tabs) return null
    const rr = remove.getBoundingClientRect()
    const rt = tabs.getBoundingClientRect()
    const rs = settings.getBoundingClientRect()
    return { removeTop: Math.round(rr.top - rs.top), aboveTabs: rr.bottom <= rt.top + 0.5, onScreen: rr.top >= 0 && rr.bottom <= innerHeight, settingsHeight: Math.round(rs.height) }
  })
  expect(top && top.aboveTabs && top.removeTop <= 24, `${w}: Remove is the first line of the open block, above Settings | Layout`, top)
  expect(top && top.onScreen, `${w}: and on screen without a scroll`, top)
  const animationPictures = await p.evaluate(async () => {
    const t = document.querySelector('[data-block-id="sig"] [data-block-tab="layout"]')
    t?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
    t?.click()
    await new Promise((r) => setTimeout(r, 400))
    return document.querySelectorAll("[data-block-animation-choice]").length
  })
  expect(animationPictures === 0, `${w}: no animation pictures in Layout`, animationPictures)
  expect(errors.length === 0, `${w}: no page errors`, errors.slice(0, 2))
  await p.close()
}

/* ── every block, through its life ───────────────────────────────────── */

async function matrix(vp) {
  const w = vp.width
  console.log(`\nEvery block at ${w}`)
  const { p, errors } = await open(vp)
  /* The entries Add block's View all lists. */
  await press(p, vp, "[data-add-block]")
  await sleep(800)
  await press(p, vp, '[data-picker-chip="all"]')
  await sleep(500)
  let entries = await p.evaluate(() => [...new Set([...document.querySelectorAll('[data-picker-section][data-shown] [data-picker-entry]')].filter((b) => !b.disabled).map((b) => b.getAttribute("data-picker-entry")))])
  await p.keyboard.press("Escape")
  await sleep(600)
  if (ONLY) entries = entries.filter((e) => ONLY.has(e))
  console.log(`        ${entries.length} entries`)
  const results = []
  for (const entry of entries) {
    const before = errors.length
    const r = { entry, added: false, open: false, tabs: "-", edited: "-", preview: "-", collapsed: false, moved: false, removed: false, selects: 0, overflow: [] }
    try {
      const ids0 = await p.evaluate(() => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id")))
      await press(p, vp, "[data-add-block]")
      await sleep(700)
      await press(p, vp, '[data-picker-chip="all"]')
      await sleep(300)
      await press(p, vp, `[data-picker-section][data-shown] [data-picker-entry="${entry}"]`)
      await sleep(1100)
      const id = await p.evaluate((ids0) => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id")).find((x) => !ids0.includes(x)) ?? null, ids0)
      r.added = !!id
      if (!id) throw new Error("not added")
      r.type = await p.evaluate((id) => document.querySelector(`[data-block-id="${id}"]`)?.getAttribute("data-block-type") ?? null, id)
      const isOpen = () => p.evaluate((id) => !!document.querySelector(`[data-block-id="${id}"] [data-block-settings]`), id)
      if (!(await isOpen())) { await press(p, vp, `[data-block-open="${id}"]`); await sleep(700) }
      r.open = await isOpen()
      const measure = () => p.evaluate((id) => {
        const card = document.querySelector(`[data-block-id="${id}"]`)
        const settings = card?.querySelector("[data-block-settings]")
        if (!settings) return { selects: 0, over: [] }
        const box = settings.getBoundingClientRect()
        const over = []
        for (const el of settings.querySelectorAll("*")) {
          const s = getComputedStyle(el)
          if (s.display === "none" || s.visibility === "hidden") continue
          /* Inside a row that scrolls sideways on purpose (a pill row), it is that row's to clip. */
          if (el.closest("[data-scroll-row], [data-pill-row]")) continue
          const b = el.getBoundingClientRect()
          if (!b.width || !b.height) continue
          if (b.right > box.right + 1 || b.left < box.left - 1) over.push(`${el.tagName.toLowerCase()}${el.getAttribute("data-slot") ? "[" + el.getAttribute("data-slot") + "]" : ""} ${Math.round(b.left)}..${Math.round(b.right)} in ${Math.round(box.left)}..${Math.round(box.right)}`)
        }
        const page = document.scrollingElement.scrollWidth > innerWidth + 1 ? [`page ${document.scrollingElement.scrollWidth} > ${innerWidth}`] : []
        return { selects: settings.querySelectorAll("select").length, over: [...page, ...over].slice(0, 3) }
      }, id)
      let m = await measure()
      r.selects += m.selects
      r.overflow.push(...m.over)
      const layoutTab = `[data-block-id="${id}"] [data-block-tab="layout"]`
      if (await p.$(layoutTab)) {
        await press(p, vp, layoutTab)
        await sleep(450)
        m = await measure()
        r.selects += m.selects
        r.overflow.push(...m.over)
        await press(p, vp, `[data-block-id="${id}"] [data-block-tab="settings"]`)
        await sleep(450)
        r.tabs = "ok"
      }
      /* A value typed into the first text field the block's Settings show. */
      const field = await p.evaluate((id) => {
        const s = document.querySelector(`[data-block-id="${id}"] [data-block-settings]`)
        const f = [...(s?.querySelectorAll('input:not([type]), input[type="text"], input[type="url"], textarea') ?? [])].find((el) => {
          if (el.closest("[data-block-foot]") || el.disabled || el.readOnly) return false
          const b = el.getBoundingClientRect()
          return b.width > 0 && b.height > 0
        })
        if (!f) return false
        f.setAttribute("data-probe-field", id)
        return true
      }, id)
      const previewHtml = () => p.evaluate((id) => document.querySelector("iframe")?.contentDocument?.querySelector(`[data-op-block="${id}"]`)?.outerHTML ?? document.querySelector("iframe")?.contentDocument?.body?.innerHTML?.length ?? null, id)
      if (field) {
        const before = vp.hasTouch ? null : await previewHtml()
        await p.click(`[data-probe-field="${id}"]`, { count: 3 })
        await p.type(`[data-probe-field="${id}"]`, "https://example.com/probe")
        await sleep(vp.hasTouch ? 400 : 1600)
        r.edited = "ok"
        if (!vp.hasTouch) {
          const after = await previewHtml()
          r.preview = before !== after ? "ok" : "same"
        }
        if (vp.hasTouch) await p.evaluate(() => document.activeElement?.blur())
      }
      /* Collapse. */
      await press(p, vp, `[data-block-open="${id}"]`)
      await sleep(700)
      r.collapsed = !(await isOpen())
      /* Move with the keys: up one, as a keyboard moves a card. */
      const at0 = await p.evaluate((id) => [...document.querySelectorAll("[data-block-id]")].findIndex((e) => e.getAttribute("data-block-id") === id), id)
      await p.focus(`[data-reorder-grip="${id}"]`)
      await p.keyboard.press("ArrowUp")
      await sleep(600)
      const at1 = await p.evaluate((id) => [...document.querySelectorAll("[data-block-id]")].findIndex((e) => e.getAttribute("data-block-id") === id), id)
      r.moved = at1 === at0 - 1
      /* Remove: open, Remove at the top, Delete. */
      await press(p, vp, `[data-block-open="${id}"]`)
      await sleep(700)
      await press(p, vp, `[data-block-id="${id}"] [data-block-remove]`)
      await sleep(450)
      await press(p, vp, `[data-block-id="${id}"] [data-block-delete]`)
      await sleep(900)
      r.removed = !(await p.$(`[data-block-id="${id}"]`))
    } catch (e) {
      r.error = String(e.message || e).slice(0, 120)
    }
    r.errors = errors.slice(before)
    results.push(r)
    const good = r.added && r.open && r.collapsed && r.moved && r.removed && !r.selects && !r.overflow.length && !r.errors.length && r.preview !== "same"
    console.log(`  ${good ? "ok  " : "FAIL"}  ${w} ${entry}${r.type ? ` (${r.type})` : ""}: added ${r.added}, open ${r.open}, tabs ${r.tabs}, typed ${r.edited}, preview ${r.preview}, collapsed ${r.collapsed}, moved ${r.moved}, removed ${r.removed}, selects ${r.selects}${r.overflow.length ? `, overflow ${JSON.stringify(r.overflow)}` : ""}${r.errors.length ? `, errors ${JSON.stringify(r.errors.slice(0, 2))}` : ""}${r.error ? `, stopped: ${r.error}` : ""}`)
    if (!good) failures++
    /* A failed step can leave a sheet up; start the next one clean. */
    await p.keyboard.press("Escape")
    await sleep(300)
  }
  await p.close()
  return results
}

try {
  for (const vp of [PHONE, DESK]) {
    if (!ONLY) {
      await plusMotion(vp)
      await rowControls(vp)
    }
    await matrix(vp)
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\n${failures ? `${failures} failed` : "all passed"}`)
if (failures && !REPORT) process.exit(1)
