/**
 * ===========================================================================
 *  ROUND AR, TRACK 6: THE ONEPAGE EDITOR, MEASURED
 * ===========================================================================
 * The real editor (scripts/onepage-probe-server.mjs) in headless Chromium at
 * 390x844 (a phone: touch) and 1440x900 (a mouse), deviceScaleFactor 1.
 * Chromium paints at 60 Hz, so frame numbers are of 60 Hz frames.
 *
 *   picker     the cover and the group picture are one row each: its height,
 *              its thumbnail, nothing wider than the panel
 *   grow       a group's description grows with a long text, up to 320px
 *   share      Share › Add link to Instagram bio opens in place: its height
 *              frame by frame, no second dialog, a QR code drawn (1440), the
 *              steps and Open Instagram (390)
 *   pick       1440: hovering a block in the phone preview rings it; a click
 *              opens that block in the list (its card in view), the page's
 *              own link does not run; a click on the open block goes to the
 *              page
 *   sweep      every block's Settings and Layout, Design, Settings and Share
 *              at both widths: nothing wider than the screen, no text cut
 *              in a control, no error in the console
 *
 *   SHOTS=<dir> node scripts/check-onepage-ar6.mjs
 *   REPORT=1   numbers only, nothing fails
 */
import { mkdirSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const REPORT = process.env.REPORT === "1"
const SHOTS = process.env.SHOTS || null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const expect = (ok, label, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`)
  if (!ok && !REPORT) failures++
}
const fail = (m) => { throw new Error(m) }

const long = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of a long description that wraps.`).join(" ")
const blocks = [
  { id: "hdr", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
  { id: "lnk", type: "link_button", enabled: true, sort_order: 1, data: { label: "Shop the prints", url: "https://example.com/shop" } },
  { id: "lk2", type: "link_button", enabled: true, sort_order: 2, data: { label: "Second link", url: "https://example.com/two" } },
  { id: "hed", type: "heading", enabled: true, sort_order: 3, data: { text: "Work with me", size: "medium", alignment: "center" } },
  { id: "grp", type: "group", enabled: true, sort_order: 4, data: { title: "Favourites", layout: "stack", children: [{ id: "c1", type: "link_button", enabled: true, sort_order: 0, data: { label: "First", url: "https://example.com/1" } }] } },
  { id: "sig", type: "email_capture", enabled: true, sort_order: 5, data: { headline: "Join my newsletter", description: "Updates", button_preset: "subscribe" } },
  { id: "txt", type: "text", enabled: true, sort_order: 6, data: { content: "Hello there", alignment: "center" } },
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
  await p.waitForSelector("[data-add-block]", { timeout: 30000 }).catch(() => null)
  await sleep(1800)
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
const shot = async (p, name) => {
  if (!SHOTS) return
  await p.screenshot({ path: `${SHOTS}/${name}.png` })
  console.log(`        shot ${SHOTS}/${name}.png`)
}
const box = (p, sel) => p.evaluate((sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height), l: Math.round(r.left), r: Math.round(r.right) }
}, sel)

/** Nothing wider than the screen, and no control whose words are cut off without an ellipsis. */
const overflow = (p) => p.evaluate(() => {
  const wide = document.documentElement.scrollWidth - innerWidth
  const cut = []
  for (const el of document.querySelectorAll("button, label, [role=tab], [data-slot=label]")) {
    const s = getComputedStyle(el)
    if (s.display === "none" || s.visibility === "hidden" || !el.getClientRects().length) continue
    if (el.scrollWidth > el.clientWidth + 2 && s.textOverflow !== "ellipsis" && s.overflowX !== "visible" && el.textContent.trim().length > 1) cut.push(el.textContent.trim().slice(0, 40))
  }
  return { wide, cut: cut.slice(0, 6) }
})

async function run(vp) {
  const w = vp.width
  console.log(`\nAt ${w}${vp.hasTouch ? " (touch)" : ""}`)
  const { p, errors } = await open(vp)

  /* ── picker: the cover, in the header's settings ── */
  await press(p, vp, '[data-block-open="hdr"]')
  await sleep(900)
  const cover = await box(p, "[data-header-cover-editor]")
  const thumb = await box(p, "[data-header-cover-editor] [data-image-thumb]")
  console.log(`        cover picker ${JSON.stringify(cover)} thumb ${JSON.stringify(thumb)}`)
  expect(cover && cover.h <= 140, `${w}: the cover picker is a row, at most 140px tall (was about 630)`, cover)
  expect(thumb && thumb.h === 56 && thumb.w === 96, `${w}: the cover's thumbnail is 96x56`, thumb)
  await shot(p, `ar6-cover-${w}`)
  await press(p, vp, '[data-block-open="hdr"]')
  await sleep(700)

  /* ── picker and grow: the group ── */
  await press(p, vp, '[data-block-open="grp"]')
  await sleep(900)
  const pic = await box(p, "[data-group-image]")
  console.log(`        group picture ${JSON.stringify(pic)}`)
  expect(pic && pic.h <= 100, `${w}: the group's picture is a row, at most 100px tall (was about 440)`, pic)
  const before = await box(p, "[data-group-description]")
  await p.evaluate((text) => {
    const el = document.querySelector("[data-group-description]")
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set
    set.call(el, text)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }, long)
  await sleep(400)
  const after = await box(p, "[data-group-description]")
  console.log(`        description ${before?.h}px empty, ${after?.h}px with ${long.length} characters`)
  expect(before && after && after.h > before.h + 60 && after.h <= 322, `${w}: the description grows with its text, up to 320px`, { before: before?.h, after: after?.h })
  await shot(p, `ar6-group-${w}`)
  await press(p, vp, '[data-block-open="grp"]')
  await sleep(700)

  /* ── share: Add link to Instagram bio ── */
  const opened = await press(p, vp, vp.hasTouch ? "[data-onepage-share]" : "[data-onepage-share-desk]")
  await sleep(900)
  const rowThere = await p.$("[data-instagram-bio-row]")
  expect(opened && !!rowThere, `${w}: Share has Add link to Instagram bio`)
  if (rowThere) {
    const dialogs = await p.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
    await press(p, vp, "[data-instagram-bio-row]")
    const heights = []
    for (let i = 0; i < 24; i++) {
      heights.push(await p.evaluate(() => Math.round(document.querySelector("[data-instagram-bio-share]")?.getBoundingClientRect().height ?? -1)))
      await p.evaluate(() => new Promise((r) => requestAnimationFrame(r)))
    }
    const steps = heights.filter((h, i) => i > 0 && h !== heights[i - 1]).length
    const backwards = heights.some((h, i) => i > 0 && h < heights[i - 1] - 1)
    console.log(`        panel heights by 60 Hz frame ${JSON.stringify(heights)}`)
    expect(steps >= 4 && !backwards, `${w}: the panel opens over several frames, only growing`, { steps, backwards })
    await sleep(900)
    const dialogsAfter = await p.evaluate(() => document.querySelectorAll('[role="dialog"]').length)
    expect(dialogsAfter === dialogs, `${w}: no second window`, { dialogs, dialogsAfter })
    if (vp.hasTouch) {
      expect(!!(await p.$("[data-instagram-open]")), `${w}: the steps and Open Instagram, on the phone`)
    } else {
      const qr = await p.evaluate(() => {
        const img = document.querySelector("[data-instagram-qr] img")
        return img ? { w: img.naturalWidth, src: img.getAttribute("src").slice(0, 22) } : null
      })
      expect(qr && qr.w >= 124 && qr.src.startsWith("data:image/png"), `${w}: a QR code drawn in the browser`, qr)
    }
    await shot(p, `ar6-share-${w}`)
    await p.keyboard.press("Escape")
    await sleep(700)
  }

  /* ── pick: a block in the phone preview (computers) ── */
  if (!vp.hasTouch) {
    const frameHandle = await p.$("[data-onepage-phone] iframe")
    const frame = frameHandle ? await frameHandle.contentFrame() : null
    if (frame) await frame.waitForSelector('[data-op-block="lk2"]', { timeout: 15000 }).catch(() => null)
    const target = frame ? await p.evaluate(() => {
      const f = document.querySelector("[data-onepage-phone] iframe")
      const inner = f.contentDocument.querySelector('[data-op-block="lk2"]')
      if (!inner) return null
      const fr = f.getBoundingClientRect()
      const r = inner.getBoundingClientRect()
      const z = parseFloat(getComputedStyle(f).zoom) || 1
      return { x: fr.left + (r.left + r.width / 2) * z, y: fr.top + (r.top + r.height / 2) * z }
    }) : null
    expect(!!target, `${w}: the preview draws the block`, target)
    if (target) {
      await p.mouse.move(target.x, target.y, { steps: 4 })
      await sleep(250)
      const ring = await frame.evaluate(() => {
        const r = document.querySelector("[data-pick-hover]")
        const b = document.querySelector('[data-op-block="lk2"]').getBoundingClientRect()
        if (!r) return null
        const rb = r.getBoundingClientRect()
        return { opacity: getComputedStyle(r).opacity, dx: Math.round(rb.left - (b.left - 4)), dy: Math.round(rb.top - (b.top - 4)), dw: Math.round(rb.width - (b.width + 8)) }
      })
      expect(ring && ring.opacity === "1" && ring.dx === 0 && ring.dy === 0 && ring.dw === 0, `${w}: hover rings exactly that block`, ring)
      const t0 = Date.now()
      await p.mouse.click(target.x, target.y)
      let openAt = null
      for (let i = 0; i < 60; i++) {
        const open = await p.evaluate(() => document.querySelector('[data-block-id="lk2"] [data-block-settings]') !== null)
        if (open) { openAt = Date.now() - t0; break }
        await sleep(16)
      }
      await sleep(900)
      const inView = await p.evaluate(() => {
        const el = document.querySelector('[data-block-id="lk2"]')
        const r = el.getBoundingClientRect()
        return r.top >= 0 && r.top < innerHeight
      })
      const notice = await frame.evaluate(() => !!document.querySelector("[data-preview-notice]"))
      console.log(`        pick: settings open after ${openAt}ms, card in view ${inView}, page's link ran ${notice}`)
      expect(openAt !== null && openAt < 500, `${w}: a click opens that block's settings (under 500ms)`, openAt)
      expect(inView, `${w}: the list scrolled its card into view`)
      expect(!notice, `${w}: the page's own link did not run`)
      const openRing = await frame.evaluate(() => getComputedStyle(document.querySelector("[data-pick-open]")).opacity)
      expect(openRing === "1", `${w}: the open block keeps its ring`, openRing)
      await shot(p, `ar6-pick-${w}`)
      await p.mouse.click(target.x, target.y)
      await sleep(400)
      const passed = await frame.evaluate(() => !!document.querySelector("[data-preview-notice]"))
      expect(passed, `${w}: a click on the open block goes to the page (its link says it opens live)`, passed)
    }
  }

  /* ── sweep: every block's Settings and Layout ── */
  for (const id of ["lnk", "hed", "grp", "sig", "txt"]) {
    await press(p, vp, `[data-block-open="${id}"]`)
    await sleep(800)
    const tabs = await p.evaluate((id) => [...document.querySelectorAll(`[data-block-id="${id}"] [role="tab"]`)].map((t) => t.textContent.trim()), id)
    const o1 = await overflow(p)
    const empty = await p.evaluate((id) => {
      const s = document.querySelector(`[data-block-id="${id}"] [data-block-settings]`)
      return s ? s.getBoundingClientRect().height : -1
    }, id)
    let o2 = { wide: 0, cut: [] }
    if (tabs.length > 1) {
      await p.evaluate((id) => [...document.querySelectorAll(`[data-block-id="${id}"] [role="tab"]`)][1]?.click(), id)
      await sleep(500)
      o2 = await overflow(p)
    }
    console.log(`        ${id}: tabs ${JSON.stringify(tabs)} settings ${Math.round(empty)}px, overflow ${o1.wide}/${o2.wide}, cut ${JSON.stringify([...o1.cut, ...o2.cut])}`)
    expect(empty > 80, `${w}: ${id}'s settings drew`, Math.round(empty))
    expect(o1.wide <= 0 && o2.wide <= 0, `${w}: ${id}: nothing wider than the screen`, [o1.wide, o2.wide])
    await shot(p, `ar6-sweep-${id}-${w}`)
    await press(p, vp, `[data-block-open="${id}"]`)
    await sleep(600)
  }
  for (const hash of ["design", "settings"]) {
    await p.evaluate((h) => { location.hash = h; window.dispatchEvent(new PopStateEvent("popstate")) }, hash)
    await sleep(1200)
    const o = await overflow(p)
    console.log(`        ${hash}: overflow ${o.wide}, cut ${JSON.stringify(o.cut)}`)
    expect(o.wide <= 0, `${w}: ${hash}: nothing wider than the screen`, o.wide)
    await shot(p, `ar6-${hash}-${w}`)
  }
  expect(errors.length === 0, `${w}: no errors in the console`, errors.slice(0, 3))
  await p.close()
}

try {
  await run(DESK)
  await run(PHONE)
} finally {
  await browser.close()
  server.close()
}
console.log(failures ? `\n${failures} failed` : "\nall passed")
process.exit(failures && !REPORT ? 1 : 0)
