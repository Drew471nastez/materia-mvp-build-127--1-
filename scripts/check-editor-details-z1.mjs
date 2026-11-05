/**
 * ===========================================================================
 *  FOUR SMALL THINGS IN THE BUILDER, MEASURED (round Z1)
 * ===========================================================================
 * The owner, about the website builder's editor:
 *
 *   ADD KEY    "when I click on plus add section ... it bumps the plus icon
 *              there". The plus key's box is read before the press, every
 *              frame while the button is held, and every frame after the
 *              click while the section library opens: it must not move.
 *   APPS       "just the button there, app embeds, next to the search input
 *              ... avatars, circles overlapping ... three ... the actual icons
 *              of the apps I have installed ... on mobile ... just Apps".
 *              Add section opened on a computer and a phone, with two apps
 *              on in Settings › Integrations and one still to set up: the
 *              button beside the search, its word, two round marks that
 *              overlap, there in the library's first frame, the button the
 *              same size in every frame of the opening; pressed, only the
 *              apps' sections. With no app on: the word alone.
 *   SCROLLBAR  "too slim": the sidebar's thumb, its width and where it sits.
 *   OUTLINE    "increase just a little bit ... the width of the blue
 *              selector": the selected section's ring, photographed at 1x
 *              and 2x, counted in screen pixels across its edge.
 *
 * The real editor (editor-probe-harness.mjs) in headless Chromium.
 *
 *   node scripts/check-editor-details-z1.mjs
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { CHROMIUM, bundle, css } from "./editor-probe-harness.mjs"

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false</script><script src="/editor-probe.js"></script></body></html>`
const js = readFileSync(bundle)
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (/\.(png|jpe?g|webp|gif)/.test(req.url)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}/website-builder/editor/probe-install`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const numbers = {}

/* A computer with a mouse: headless Chromium otherwise reports no pointer, and the drawn scrollbar is only for a fine one. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"] })

async function open({ width, height, phone = false, dpr = 1, states = null }) {
  const page = await browser.newPage()
  if (states) await page.evaluateOnNewDocument((s) => { window.PROBE_APP_STATES = s }, states)
  /* The editor's layout mounts the drawn scrollbar (app/(storelib)/website-builder/layout.tsx); the probe mounts it when asked. */
  await page.evaluateOnNewDocument(() => { window.PROBE_RAIL = true })
  await page.setViewport({ width, height, isMobile: phone, hasTouch: phone, deviceScaleFactor: dpr })
  /* A computer has a mouse: headless reports none, and the drawn scrollbar is only for a fine pointer (slim-scroll-rail.tsx). */
  if (!phone) {
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: "fine" }, { name: "hover", value: "hover" }] }).catch(() => {})
    /* Headless Chromium answers "(pointer: fine)" false whatever is emulated; a computer answers true. */
    await page.evaluateOnNewDocument(() => {
      const own = window.matchMedia.bind(window)
      window.matchMedia = (q) => (q.replace(/\s/g, "") === "(pointer:fine)" ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } : own(q))
    })
  }
  await page.goto(origin, { waitUntil: "load" })
  await page.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
  return page
}

/* Frames of a box, from a press, read in the page itself. */
const FILM_BOX = (selector, ms) => new Promise((resolve) => {
  const out = []
  const t0 = performance.now()
  const tick = (now) => {
    const el = document.querySelector(selector)
    const r = el?.getBoundingClientRect()
    const cs = el ? getComputedStyle(el) : null
    out.push(r ? { t: Math.round(now - t0), x: r.left, y: r.top, w: r.width, h: r.height, translate: cs.translate, transform: cs.transform, scale: cs.scale } : { t: Math.round(now - t0), gone: true })
    if (now - t0 < ms) requestAnimationFrame(tick)
    else resolve(out)
  }
  requestAnimationFrame(tick)
})

const STATES = { "storelib-reviews": "on", "storelib-email-marketing": "on", "storelib-bundles": "setup" }

try {
  /* ── ADD KEY ─────────────────────────────────────────────────────────── */
  console.log("\nThe plus key of Add section, pressed")
  {
    const page = await open({ width: 1440, height: 900, states: STATES })
    await sleep(1500)
    /* The key by its attribute, or where it sits in the row (the same span before it had one). */
    const sel = (await page.$("[data-add-section-top] [data-add-key]")) ? "[data-add-section-top] [data-add-key]" : "[data-add-section-top] > span[aria-hidden] > span"
    const key = await page.$(sel)
    expect(!!key, "the Add section row has its plus key")
    if (key) {
      const box = await key.boundingBox()
      await page.mouse.move(box.x + 40, box.y + box.height / 2)
      await sleep(250)
      const before = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }, sel)
      const held = page.evaluate(FILM_BOX, sel, 260)
      await page.mouse.down()
      const whileHeld = await held
      const after = page.evaluate(FILM_BOX, sel, 600)
      await page.mouse.up()
      const afterClick = await after
      const all = [...whileHeld, ...afterClick].filter((f) => !f.gone)
      const moved = all.filter((f) => Math.abs(f.x - before.x) > 0.01 || Math.abs(f.y - before.y) > 0.01 || Math.abs(f.w - before.w) > 0.01 || Math.abs(f.h - before.h) > 0.01)
      const transformed = all.filter((f) => (f.translate && f.translate !== "none" && f.translate !== "0px") || (f.transform && f.transform !== "none") || (f.scale && f.scale !== "none"))
      numbers.addKey = { frames: all.length, moved: moved.length, transformed: transformed.length, box: before }
      expect(all.length >= 20, "filmed while held and while the library opens", all.length)
      expect(moved.length === 0, "the plus key does not move by even a hundredth of a pixel, held or after", moved.slice(0, 3))
      expect(transformed.length === 0, "and is never translated or scaled", transformed.slice(0, 2))
      const lib = await page.evaluate(() => document.querySelector('[data-section-library-layer]')?.getAttribute("data-state"))
      expect(lib === "open", "the press opened Add section", lib)

      /* ── APPS, a computer ── */
      console.log("\nAdd section on a computer: App embeds")
      await page.keyboard.press("Escape")
      await sleep(500)
      /* The opening filmed: the button's box and its marks, from the press. */
      const filmOpen = page.evaluate(() => new Promise((resolve) => {
        const out = []
        const t0 = performance.now()
        const tick = (now) => {
          const layer = document.querySelector("[data-section-library-layer]")
          const b = document.querySelector('[data-section-library="desktop"] [data-app-embeds-toggle]')
          /* Its own layout box: the dialog itself rises and scales in, which is not the button changing. */
          out.push({ t: Math.round(now - t0), open: layer?.getAttribute("data-state") === "open", w: b ? b.offsetWidth : null, x: b ? b.offsetLeft : null, marks: b ? b.querySelectorAll("[data-app-mark]").length : null })
          if (now - t0 < 500) requestAnimationFrame(tick)
          else resolve(out)
        }
        requestAnimationFrame(tick)
      }))
      await page.click("[data-add-section-top]")
      const opening = (await filmOpen).filter((f) => f.open)
      const widths = new Set(opening.map((f) => f.w))
      const xs = new Set(opening.map((f) => f.x))
      numbers.appsOpening = { frames: opening.length, widths: [...widths], marks: [...new Set(opening.map((f) => f.marks))] }
      expect(opening.length > 0 && opening.every((f) => f.marks === 2), "both installed apps' marks are there from the library's first frame", numbers.appsOpening)
      expect(widths.size === 1 && xs.size === 1, "and the button never changes size or moves while it opens", { widths: [...widths], xs: [...xs] })
      const d = await page.evaluate(() => {
        const root = document.querySelector('[data-section-library="desktop"]')
        const b = root.querySelector("[data-app-embeds-toggle]")
        const s = root.querySelector('input[type="search"]')
        const r = b.getBoundingClientRect()
        const q = s.getBoundingClientRect()
        const marks = [...b.querySelectorAll("[data-app-mark]")].map((m) => { const mr = m.getBoundingClientRect(); const cs = getComputedStyle(m); return { id: m.getAttribute("data-app-mark"), x: mr.left, w: mr.width, h: mr.height, radius: cs.borderTopLeftRadius, svg: !!m.querySelector("svg") } })
        return { text: b.textContent.trim(), label: b.getAttribute("aria-label"), pressed: b.getAttribute("aria-pressed"), right: r.right, top: r.top, h: r.height, searchLeft: q.left, searchTop: q.top, searchH: q.height, marks, groups: root.querySelectorAll("[data-library-group]").length, imgs: b.querySelectorAll("img").length }
      })
      numbers.appsDesktop = d
      expect(d.text === "App embeds", "it says App embeds", d.text)
      expect(d.right <= d.searchLeft && d.searchLeft - d.right <= 12 && Math.abs(d.top - d.searchTop) <= 1 && Math.abs(d.h - d.searchH) <= 1, "beside the search, the search's height", { right: d.right, searchLeft: d.searchLeft, h: d.h, searchH: d.searchH })
      expect(d.marks.length === 2 && d.marks.map((m) => m.id).join() === "reviews,email", "the marks are the two apps that are on, in order (Offers is still to set up)", d.marks.map((m) => m.id))
      expect(d.marks.every((m) => m.w === 20 && m.h === 20 && parseFloat(m.radius) >= 10 && m.svg), "each a 20px circle with the app's own tile in it", d.marks)
      expect(d.marks.length === 2 && d.marks[1].x < d.marks[0].x + d.marks[0].w, "overlapping", d.marks.map((m) => m.x))
      expect(d.imgs === 0, "nothing to download: the marks are drawn, not fetched", d.imgs)
      expect(/Storelib Reviews/.test(d.label ?? "") && /Email/.test(d.label ?? ""), "a screen reader hears the word and which apps", d.label)
      expect(d.groups === 0, "no Apps group in the list of categories", d.groups)
      await page.click('[data-section-library="desktop"] [data-app-embeds-toggle]')
      await sleep(350)
      const shown = await page.evaluate(() => ({
        pressed: document.querySelector('[data-section-library="desktop"] [data-app-embeds-toggle]').getAttribute("aria-pressed"),
        cards: [...document.querySelectorAll('[data-section-library="desktop"] [data-library-card]:not([hidden])')].length,
        apps: [...document.querySelectorAll('[data-section-library="desktop"] [data-library-card]:not([hidden]) [data-card-app]')].length,
      }))
      expect(shown.pressed === "true" && shown.cards > 0 && shown.cards === shown.apps, "pressed, the list is the apps' sections only", shown)
      await page.keyboard.press("Tab")
      const focusable = await page.evaluate(() => { const b = document.querySelector('[data-section-library="desktop"] [data-app-embeds-toggle]'); return b.tabIndex >= 0 && b.tagName === "BUTTON" })
      expect(focusable, "a button the keyboard reaches")
      await page.keyboard.press("Escape")
      await sleep(400)

      /* ── SCROLLBAR ── */
      console.log("\nThe sidebar's scrollbar")
      /* A laptop's height, where the sidebar's list is longer than the panel. */
      await page.setViewport({ width: 1440, height: 520 })
      /* And a list longer than the panel whatever the probe's page holds: the thumb's size and place are what is measured, not the page. */
      await page.evaluate(() => { const s = document.querySelector("[data-wb-sidebar-scroll]"); const pad = document.createElement("div"); pad.style.height = "1600px"; pad.setAttribute("aria-hidden", "true"); s.appendChild(pad) })
      await sleep(500)
      const scroller = await page.$("[data-wb-sidebar-scroll]")
      const sb = await scroller.boundingBox()
      await page.mouse.move(sb.x + sb.width / 2, sb.y + 200)
      await page.mouse.wheel({ deltaY: 120 })
      await page.evaluate(() => { const s = document.querySelector("[data-wb-sidebar-scroll]"); if (s.scrollTop === 0) s.scrollTop = 120 })
      await sleep(450)
      const thumb = await page.evaluate(() => {
        const t = document.querySelector("[data-slim-scroll-thumb]")
        if (!t) return { room: 0, missing: true }
        const s = document.querySelector("[data-wb-sidebar-scroll]")
        const r = t.getBoundingClientRect()
        const q = s.getBoundingClientRect()
        const cs = getComputedStyle(t)
        return { w: r.width, h: r.height, gap: Math.round((q.right - r.right) * 10) / 10, opacity: Number(cs.opacity), radius: cs.borderTopLeftRadius, colour: cs.backgroundColor, room: s.scrollHeight - s.clientHeight, fine: matchMedia("(pointer: fine)").matches, rail: document.documentElement.classList.contains("slim-rail"), slim: s.classList.contains("wb-slim-scroll"), top: s.scrollTop }
      })
      numbers.scrollbar = thumb
      if (thumb.room > 1) {
        expect(thumb.w === 7, "the thumb is 7px wide (it was 4)", thumb.w)
        expect(thumb.gap === 2, "2px in from the panel's edge", thumb)
        expect(thumb.opacity > 0.9 && parseFloat(thumb.radius) >= 3.5, "shown while the pointer is in the panel, round at the ends", { opacity: thumb.opacity, radius: thumb.radius })
        await page.mouse.move(sb.x + sb.width - 4, thumb.h > 0 ? sb.y + 220 : sb.y + 200)
        await sleep(350)
        const hovered = await page.evaluate(() => getComputedStyle(document.querySelector("[data-slim-scroll-thumb]")).width)
        expect(hovered === "7px", "and as wide under the pointer: nothing moves sideways", hovered)
      } else console.log("  (the sidebar does not scroll at this size; thumb not measured)")
      await page.close()
    }
  }

  /* ── APPS, nothing on ── */
  console.log("\nAdd section with no app on")
  {
    const page = await open({ width: 1440, height: 900, states: { "storelib-reviews": "off", "storelib-email-marketing": "setup", "storelib-bundles": "setup" } })
    await sleep(3500)
    await page.click("[data-add-section-top]")
    await sleep(500)
    const d = await page.evaluate(() => { const b = document.querySelector('[data-section-library="desktop"] [data-app-embeds-toggle]'); return b ? { text: b.textContent.trim(), marks: b.querySelectorAll("[data-app-mark]").length } : null })
    expect(!!d && d.text === "App embeds" && d.marks === 0, "the word alone, no marks", d)
    await page.close()
  }

  /* ── APPS, a phone ── */
  console.log("\nAdd section on a phone: Apps")
  {
    const page = await open({ width: 390, height: 844, phone: true, states: STATES })
    await sleep(3500)
    await page.evaluate(() => document.querySelector('[data-section-group="template"] [data-add-section]')?.click())
    await page.waitForSelector('[data-section-library="phone"]', { visible: true })
    await sleep(900)
    const d = await page.evaluate(() => {
      const root = document.querySelector('[data-section-library="phone"]')
      const b = root.querySelector("[data-app-embeds-toggle]")
      const s = root.querySelector('input[type="search"]')
      const r = b.getBoundingClientRect()
      const q = s.getBoundingClientRect()
      return { text: b.textContent.trim(), marks: [...b.querySelectorAll("[data-app-mark]")].map((m) => Math.round(m.getBoundingClientRect().width)), left: r.left, right: r.right, top: r.top, h: r.height, searchRight: q.right, searchTop: q.top, searchH: q.height, pills: [...root.querySelectorAll('[role="toolbar"] button')].map((p) => p.textContent) }
    })
    numbers.appsPhone = d
    expect(d.text === "Apps", "it says Apps", d.text)
    expect(d.marks.length === 2 && d.marks.every((w) => w === 20), "with the same two marks", d.marks)
    expect(d.left >= d.searchRight && d.left - d.searchRight <= 12 && Math.abs(d.top - d.searchTop) <= 1 && Math.abs(d.h - d.searchH) <= 1 && d.right <= 390 - 15, "beside the search, its height, inside the sheet", d)
    expect(!d.pills.includes("Reviews") && !d.pills.includes("Email"), "no app pills in the row", d.pills.slice(0, 6))
    await page.close()
  }

  /* ── OUTLINE ── */
  for (const dpr of [1, 2]) {
    console.log(`\nThe selected section's ring at ${dpr}x`)
    const page = await open({ width: 1440, height: 900, dpr })
    await sleep(1200)
    /* The hero's heading, which a click opens (scripts/check-click-to-edit.mjs). */
    const target = await page.evaluate(() => {
      const h = document.querySelector('#wb-preview-root [data-section-type="hero_centered"] [data-sl-setting="heading"]')
      const r = h.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    await page.mouse.click(target.x, target.y)
    /* The pointer away, so only the selection is drawn (no hover outline over the strip). */
    await page.mouse.move(700, 20)
    await sleep(700)
    const ring = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('#wb-preview-root [data-section-type="hero_centered"] span.wb-ring')].filter((s) => !s.textContent && /rgb\(59, 130, 246\)/.test(getComputedStyle(s).boxShadow) && s.getBoundingClientRect().height > 40)
      const s = spans[0]
      if (!s) return null
      const r = s.getBoundingClientRect()
      let o = 1
      for (let e = s; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity)
      return { left: r.left, top: r.top, width: r.width, height: r.height, shadow: getComputedStyle(s).boxShadow, opacity: o, onTop: document.elementFromPoint(r.left + 1, r.top + Math.min(r.height / 2, 80))?.className?.toString().slice(0, 60) }
    })
    expect(!!ring, "a section is selected and wears its ring", ring)
    if (ring) {
      /* A strip 12px wide across the ring's left edge, half way down. */
      const y = Math.round(ring.top + Math.min(ring.height / 2, 80))
      const x = Math.round(ring.left) - 2
      if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/ring-${dpr}x.png`, clip: { x: x - 40, y: y - 60, width: 120, height: 120 }, captureBeyondViewport: false })
      const shot = await page.screenshot({ clip: { x, y, width: 12, height: 1 }, type: "png", captureBeyondViewport: false })
      const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
      const cols = []
      for (let i = 0; i < info.width; i++) {
        const [r, g, b] = [data[i * info.channels], data[i * info.channels + 1], data[i * info.channels + 2]]
        cols.push({ r, g, b })
      }
      const blue = (c) => Math.abs(c.r - 59) <= 12 && Math.abs(c.g - 130) <= 12 && Math.abs(c.b - 246) <= 12
      const tinted = (c) => !blue(c) && c.b - c.r > 20
      const solid = cols.filter(blue).length
      const partial = cols.filter(tinted).length
      numbers[`ring${dpr}x`] = { css: ring.shadow, solidDevicePx: solid, blendedDevicePx: partial }
      console.log(`  across the edge: ${cols.map((c) => (blue(c) ? "B" : tinted(c) ? "b" : ".")).join("")}`)
      expect(/2px/.test(ring.shadow), "the ring is 2px", ring.shadow)
      expect(solid === 2 * dpr, `${2 * dpr} solid screen pixels of blue across the edge`, solid)
      expect(partial === 0, "and none half drawn: crisp", partial)
    }
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\nnumbers ${JSON.stringify(numbers)}`)
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
