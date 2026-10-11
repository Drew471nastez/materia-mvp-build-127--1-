/**
 * ===========================================================================
 *  ADDING A SECTION, ON A PHONE AND A COMPUTER, WITH THE FRAMES COUNTED
 * ===========================================================================
 * "When I tap between two sections, it opens the add a section modal ...
 * it should not glitch, be very optimized for performance, not lag at all.
 * When I'm adding a section, it should be very smooth on click, not glitch
 * or flash; when I click add, smoothly close the modal, add the section very
 * smoothly in between the sections where it adds it, auto smooth scroll to
 * it, and it should appear very smoothly in the canvas."
 *
 * And then: "one section per row, not 2 per row", "it should not show at the
 * end 'after (whatever)'", "'Created by you' should be called 'Created'",
 * "when I switch between the category pills there should be no flash and no
 * glitch in the preview cards", and on a phone, after adding, "open, from the
 * bottom, smoothly, the sections mobile bottom sheet on that section's
 * settings".
 *
 * The real editor (scripts/editor-probe-harness.mjs), CPU at a quarter speed
 * (Chrome's mobile profile), at 390 × 844 and 1280 × 800, driven the way a
 * person drives it:
 *
 *   OPEN      tap the gap between the first two sections of the page;
 *             every frame until the library has stopped moving is timed
 *   WORDS     no line saying where the section goes; the creator's own
 *             sections are the first category, called Created
 *   ROWS      one card per row: every card shown starts at the same x and is
 *             as wide as the list
 *   HEIGHTS   every card as tall as the section drawn in it: under 24px of
 *             empty card below any section shown whole, and a section only
 *             ever cut where it is taller than the tallest card
 *   PILLS     every category, then three again, every frame sampled: a card
 *             whose preview was already drawn must never be without it,
 *             faded, skipped by content-visibility, or moved sideways, and
 *             the screen itself is filmed and each preview's pixels read
 *   ADD       tap a card: the library closes, the section lands in the gap
 *             that was tapped, and every frame until it has all settled is
 *             recorded: on a phone the sections sheet then rises once, from
 *             its peek to its middle stop, already on the new section's
 *             settings, with the canvas holding still under it
 *   SHEET     on a phone, the same from the sheet's own Add section button:
 *             the sheet stays where it is and ends on the new section
 *   EARLY     a fresh editor, the library opened before its previews are
 *             drawn: no card on screen, or above it, ever gets shorter while
 *             it is open; closed and opened again, every card is its
 *             section's height
 *
 * with long tasks (over 50ms) counted across each step, and screenshots.
 *
 *   node scripts/check-add-section.mjs
 *   SHOTS=/path node scripts/check-add-section.mjs    (where the pictures go)
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import puppeteer from "puppeteer-core"
import { bundle, css } from "./editor-probe-harness.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? join(tmpdir(), "storelib-add-section")
mkdirSync(SHOTS, { recursive: true })
const shot = (name) => join(SHOTS, `addsection-${name}.png`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-")

/* A creator with a section of their own, so the first pill has something in it. */
const OWN = `<template><section class="mine"><h2>{{ settings.heading }}</h2></section></template>
<style scoped>.mine { padding: 48px 24px; background: #fef3c7; text-align: center; font-family: system-ui; }</style>
<schema>{"schema_version":1,"type":"my_banner","name":"My banner","category":"content","settings":[{"type":"text","id":"heading","label":"Heading","default":"Made by me"}],"presets":[{"name":"My banner","settings":{"heading":"Made by me"}}]}</schema>`

const js = readFileSync(bundle)
const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${interFaces()}</style><style>${css}</style></head><body><div id="app"></div>
<script>
  window.PROBE_SHORT = false
  /* The install's saved files, with one section the creator wrote. */
  window.PROBE_FILES = { "sections/my_banner.storelib": ${JSON.stringify(OWN)} }
</script>
<script src="/editor-probe.js"></script></body></html>`
/**
 * THE EDITOR, AND NOTHING ELSE. The editor frames its code editor
 * (/website-builder/code/...?embedded=1) over the canvas, and this server
 * used to answer every address with the editor: two more whole editors ran
 * in frames inside the one being measured, each drawing its own previews,
 * and their long tasks were counted as the library's (the Long Tasks API
 * reports a same-origin frame's to the page). Anything but /editor is an
 * empty page now.
 */
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

/* In the page: a frame and long-task recorder that can be started and read. */
const RECORDER = `
  window.__rec = {
    start() {
      this.frames = []; this.long = []; this.on = true
      if (!this.obs) {
        this.obs = new PerformanceObserver((l) => { if (this.on) for (const e of l.getEntries()) this.long.push(Math.round(e.duration)) })
        this.obs.observe({ type: "longtask", buffered: false })
      }
      let last = performance.now()
      const tick = (t) => { if (!this.on) return; this.frames.push(Math.round((t - last) * 10) / 10); last = t; requestAnimationFrame(tick) }
      requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick) })
    },
    stop() {
      this.on = false
      const f = this.frames.slice()
      const s = [...f].sort((a, b) => a - b)
      const at = (q) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0)
      return { frames: f.length, median: at(0.5), p95: at(0.95), worst: s.length ? s[s.length - 1] : 0, over34: f.filter((d) => d > 34).length, long: this.long.slice() }
    },
  }
`

/**
 * The library's pieces, found the same way on both shells. The scroller has
 * a hook of its own now; the fallbacks are what the library looked like
 * before it did, so this probe can be run against an older checkout.
 */
const PARTS = `
  window.__lib = () => {
    const lib = document.querySelector("[data-section-library]")
    if (!lib) return null
    const phone = lib.getAttribute("data-section-library") === "phone"
    const scroller = lib.querySelector("[data-library-scroll]") ?? (phone ? lib.querySelector("[data-sheet-scroll]") : [...lib.querySelectorAll(".overflow-y-auto")].pop())
    const pills = [...lib.querySelectorAll(phone ? ".wb-chip" : "nav button")]
    return { lib, phone, scroller, pills }
  }
  /* The editor's own sheet, the one with Sections, Pages and Theme on it. */
  window.__baseSheet = () => [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((s) => s.querySelector("[data-wb-sidebar-scroll]")) ?? null
`

/**
 * EVERY FRAME OF A CATEGORY SWITCH, for the cards on screen. A card counts as
 * ready when its preview is in it before the switch; after the switch, a
 * ready card that is on screen must have its preview in every frame, at full
 * opacity all the way up the tree, not skipped by content-visibility, with no
 * animation running on it, and at the same x and width it had.
 */
const SWITCH = async ({ names }) => {
  const { lib, scroller, pills } = window.__lib()
  const cardsOnScreen = () => {
    const box = scroller.getBoundingClientRect()
    const out = []
    for (const c of lib.querySelectorAll("[data-library-card]")) {
      if (c.hidden) continue
      const r = c.getBoundingClientRect()
      if (r.height === 0 || r.bottom <= box.top || r.top >= box.bottom) continue
      const pv = c.querySelector("[data-keep-transform]")
      const pbox = c.querySelector("[data-preview-box]") ?? (pv ? pv.parentElement : null)
      let opacity = 1
      for (let n = pv; n && n !== document.documentElement; n = n.parentElement) opacity *= parseFloat(getComputedStyle(n).opacity)
      const anims = pv ? pv.getAnimations().length + (pbox ? pbox.getAnimations().length : 0) : 0
      out.push({
        key: `${c.getAttribute("data-library-card")}:${c.getAttribute("data-preset")}`,
        preview: !!pv,
        opacity: Math.round(opacity * 1000) / 1000,
        cv: pbox && pbox.checkVisibility ? pbox.checkVisibility({ contentVisibilityAuto: true }) : true,
        anims,
        left: Math.round(r.left),
        width: Math.round(r.width),
        top: Math.round(r.top - box.top),
        rect: pbox ? (() => { const b = pbox.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] })() : null,
      })
    }
    return out
  }
  const ready = new Set([...lib.querySelectorAll("[data-library-card]")].filter((c) => c.querySelector("[data-keep-transform]")).map((c) => `${c.getAttribute("data-library-card")}:${c.getAttribute("data-preset")}`))
  const report = []
  for (const name of names) {
    const button = pills.find((b) => (b.textContent || "").trim().replace(/\d+$/, "") === name)
    if (!button) { report.push({ name, missing: true }); continue }
    const frames = []
    const t0 = performance.now()
    /* The epoch time of the press, which is the clock the screencast stamps its frames with. */
    const pressedAt = Date.now()
    button.click()
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => requestAnimationFrame(() => r()))
      frames.push({ t: Math.round(performance.now() - t0), cards: cardsOnScreen(), scrollTop: Math.round(scroller.scrollTop) })
    }
    const last = frames[frames.length - 1].cards
    const settled = new Map(last.map((c) => [c.key, c]))
    const problems = []
    for (const [i, f] of frames.entries()) {
      for (const c of f.cards) {
        if (!ready.has(c.key)) continue
        const why = []
        if (!c.preview) why.push("no preview")
        if (c.opacity < 0.99) why.push(`opacity ${c.opacity}`)
        if (!c.cv) why.push("skipped by content-visibility")
        if (c.anims) why.push(`${c.anims} animation${c.anims === 1 ? "" : "s"} running`)
        const end = settled.get(c.key)
        if (end && (end.left !== c.left || end.width !== c.width)) why.push(`moved sideways ${c.left}/${c.width} -> ${end.left}/${end.width}`)
        if (end && i > 0 && end.top !== c.top) why.push(`moved ${c.top} -> ${end.top}`)
        if (why.length) problems.push({ frame: i, t: f.t, key: c.key, why: why.join(", ") })
      }
    }
    report.push({
      name,
      pressedAt,
      pressed: button.getAttribute("aria-pressed"),
      frames: frames.length,
      firstFrameMs: frames[0].t,
      onScreen: last.length,
      readyOnScreen: last.filter((c) => ready.has(c.key)).length,
      scrollTopAfter: frames[0].scrollTop,
      problems: problems.length,
      examples: problems.slice(0, 4),
      rects: last.filter((c) => ready.has(c.key) && c.rect).map((c) => c.rect),
    })
    await new Promise((r) => setTimeout(r, 250))
  }
  return report
}

/**
 * EVERY CARD SHOWN, AGAINST THE SECTION DRAWN IN IT. Each is brought on
 * screen first, so it is laid out whatever content-visibility would skip,
 * and its preview box is read against the section inside it (the renderer's
 * `data-section-box`, scaled as the card scales it). The list is put back at
 * its top afterwards.
 */
const CARD_HEIGHTS = async ({ ratio }) => {
  const { lib, scroller } = window.__lib()
  const cardName = (c) => (c.querySelector(":scope > span")?.textContent ?? c.textContent ?? "").trim()
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  const r1 = (x) => Math.round(x * 10) / 10
  const out = []
  for (const c of [...lib.querySelectorAll("[data-library-card]")].filter((x) => !x.hidden)) {
    c.scrollIntoView({ block: "nearest" })
    await frame()
    await frame()
    const name = cardName(c)
    const box = c.querySelector("[data-preview-box]")
    const inner = box ? box.querySelector("[data-keep-transform]") : null
    const section = inner ? inner.querySelector("[data-section-box]") ?? inner.firstElementChild : null
    if (!box || !section) {
      out.push({ name, missing: true })
      continue
    }
    const b = box.getBoundingClientRect()
    const sct = section.getBoundingClientRect()
    out.push({
      name,
      type: c.getAttribute("data-library-card"),
      box: r1(b.height),
      section: r1(sct.height),
      offset: r1(sct.top - b.top),
      below: r1(b.bottom - sct.bottom),
      tallest: Math.round(b.width * ratio),
    })
  }
  scroller.scrollTop = 0
  await frame()
  return out
}

/** The shortest a card is drawn (PREVIEW_MIN_HEIGHT in lib/website-builder/preview-markup.ts). */
const FLOOR = 80
/** Less than this much empty card under a section shown whole; a section taller than the tallest card is cut instead. */
const EMPTY_UNDER = 24

function judgeHeights(where, hs) {
  const missing = hs.filter((h) => h.missing)
  const read = hs.filter((h) => !h.missing)
  const cut = read.filter((h) => h.section > h.box + 1)
  const whole = read.filter((h) => h.section <= h.box + 1)
  /* Under the floor: the card is the floor, and the section sits in the middle of it. */
  const floor = whole.filter((h) => h.box <= FLOOR + 1 && h.section < h.box - 1)
  const empty = whole.filter((h) => h.below >= EMPTY_UNDER)
  const badCut = cut.filter((h) => Math.abs(h.box - h.tallest) > 1)
  const offTop = read.filter((h) => !floor.includes(h) && Math.abs(h.offset) > 1)
  const offMiddle = floor.filter((h) => Math.abs(h.offset - h.below) > 1)
  const worst = whole.reduce((a, h) => (a && a.below >= h.below ? a : h), null)
  expect(read.length >= 30 && missing.length === 0, `${where}: every card shown has its section drawn in it`, { cards: hs.length, missing: missing.map((h) => h.name) })
  expect(
    empty.length === 0,
    `${where}: under every section shown whole, less than ${EMPTY_UNDER}px of empty card`,
    empty.length
      ? empty.slice(0, 6).map((h) => `${h.name}: ${h.below}px under a ${h.section}px section in a ${h.box}px card`)
      : worst ? `most is ${worst.below}px, under "${worst.name}"` : "none shown whole",
  )
  expect(badCut.length === 0, `${where}: a section is only cut where it is taller than the tallest card`, badCut.length ? badCut.slice(0, 6).map((h) => `${h.name}: ${h.section}px section cut at ${h.box}px, tallest is ${h.tallest}px`) : `${cut.length} cut, all at the tallest`)
  expect(offTop.length === 0, `${where}: every section the floor's height or more starts at the top of its card`, offTop.slice(0, 4).map((h) => `${h.name}: ${h.offset}px down`))
  expect(offMiddle.length === 0, `${where}: a section under the floor sits in the middle of its card`, floor.map((h) => `${h.name}: ${h.offset}px above, ${h.below}px below`))
  const boxes = read.map((h) => h.box)
  note(`${where}: ${whole.length - floor.length} cards at their section's own height, ${floor.length} at the ${FLOOR}px floor, ${cut.length} cut at the tallest (${cut[0]?.tallest ?? read[0]?.tallest}px); cards ${Math.min(...boxes)} to ${Math.max(...boxes)}px tall`)
  for (const h of floor) note(`   at the floor: "${h.name}", a ${h.section}px section in a ${h.box}px card, ${h.offset}px above it and ${h.below}px below`)
  const mine = read.find((h) => h.type === "my_banner")
  if (mine) note(`   "My banner": a ${mine.box}px card for a ${mine.section}px section, ${mine.below}px under it (every card was ${mine.tallest}px before)`)
  return { whole: whole.length, floor: floor.length, cut: cut.length, empty: empty.length }
}

/**
 * EVERY FRAME WHILE THE PREVIEWS LAND IN AN OPEN LIBRARY. A card on screen
 * or above it (where a change moves what is on screen) must never get
 * shorter from one frame to the next; one below the fold may, and those are
 * counted. At the end, the cards in sight whose section sits over empty card
 * are the ones being held until nobody can see them change.
 */
const WATCH = async ({ ms }) => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
  const t0 = performance.now()
  let prev = new Map()
  const shrunk = []
  const tookBelow = new Set()
  const landed = new Set()
  let frames = 0
  while (performance.now() - t0 < ms) {
    await frame()
    const L = window.__lib()
    if (!L || !L.scroller) continue
    const view = L.scroller.getBoundingClientRect()
    if (view.height === 0) continue
    frames++
    const now = new Map()
    for (const c of L.lib.querySelectorAll("[data-library-card]")) {
      if (c.hidden) continue
      const box = c.querySelector("[data-preview-box]")
      if (!box) continue
      const r = box.getBoundingClientRect()
      const key = `${c.getAttribute("data-library-card")}:${c.getAttribute("data-preset")}`
      const sight = r.top < view.bottom
      const drawn = !!box.querySelector("[data-keep-transform]")
      now.set(key, { h: r.height, sight, drawn })
      const was = prev.get(key)
      if (!was) continue
      if (drawn && !was.drawn && sight) landed.add(key)
      if (r.height < was.h - 1.5) {
        if (was.sight) shrunk.push({ key, t: Math.round(performance.now() - t0), from: Math.round(was.h), to: Math.round(r.height) })
        else tookBelow.add(key)
      }
    }
    prev = now
  }
  const L = window.__lib()
  const view = L.scroller.getBoundingClientRect()
  const inSight = []
  for (const c of L.lib.querySelectorAll("[data-library-card]")) {
    if (c.hidden) continue
    const box = c.querySelector("[data-preview-box]")
    if (!box) continue
    const b = box.getBoundingClientRect()
    if (b.top >= view.bottom || b.bottom <= view.top) continue
    const sec = box.querySelector("[data-keep-transform] [data-section-box]")
    const sr = sec ? sec.getBoundingClientRect() : null
    inSight.push({ name: (c.querySelector(":scope > span")?.textContent ?? "").trim(), box: Math.round(b.height), section: sr ? Math.round(sr.height) : null, below: sr ? Math.round(b.bottom - sr.bottom) : null })
  }
  return { frames, cards: prev.size, shrunk, tookBelow: tookBelow.size, landedInSight: landed.size, inSight }
}

/**
 * EVERY FRAME OF AN ADD, from the tap until everything has stopped: where the
 * library is, where the editor's own sheet is and what it shows, where the
 * canvas is scrolled, and where the new section is and whether it is
 * selected. Started before the tap, read afterwards.
 */
const SEQUENCE = `
  window.__seq = {
    start(before) {
      this.samples = []; this.on = true
      const t0 = performance.now()
      const root = document.getElementById("wb-preview-root")
      const tick = () => {
        if (!this.on) return
        const libEl = document.querySelector("[data-section-library='phone']")?.closest("[data-mobile-bottom-sheet]")
        const dialog = document.querySelector("[data-section-library-layer]")
        const base = window.__baseSheet()
        const panel = base ? base.querySelector(".wb-sheet-panel") : null
        const back = base ? base.querySelector("[data-panel-back]") : null
        const el = [...root.querySelectorAll("[id^='wb-section-']")].find((e) => !before.includes(e.id)) ?? null
        const r = el ? el.getBoundingClientRect() : null
        const ring = el ? [...el.querySelectorAll("span.wb-ring")].some((s) => /139, 92, 246\\)|#8b5cf6/i.test(s.getAttribute("style") || "") && !/opacity-0/.test(s.className)) : false
        const overlay = base ? base.previousElementSibling : null
        this.samples.push({
          t: Math.round(performance.now() - t0),
          lib: libEl ? Math.round(libEl.getBoundingClientRect().top) : null,
          dialog: dialog ? dialog.getAttribute("data-state") : null,
          sheet: base ? Math.round(base.getBoundingClientRect().top) : null,
          shows: back ? (back.textContent || "").trim() : base ? (base.querySelector("[data-page-list]") ? "pages" : "list") : null,
          /* Running ones only: a CSS animation that has finished and fills forwards is still listed. */
          panelAnims: panel ? panel.getAnimations().filter((a) => a.playState === "running").length : 0,
          overlay: overlay ? Math.round(parseFloat(getComputedStyle(overlay).opacity) * 100) / 100 : null,
          scroll: Math.round(root.scrollTop),
          canvasTop: Math.round(root.getBoundingClientRect().top),
          id: el ? el.id : null,
          top: r ? Math.round(r.top) : null,
          bottom: r ? Math.round(r.bottom) : null,
          arrival: el ? el.getAttribute("data-arrival") : null,
          ring,
          sidebar: document.querySelector("[data-wb-sidebar-scroll] [data-panel-back]")?.textContent?.trim() ?? null,
        })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    },
    stop() { this.on = false; return this.samples },
  }
`

/**
 * Film the screen while `act` runs, as PNG frames with their times. The
 * screencast sends a frame whenever the compositor makes one, so the frames
 * after `pressAt` are every picture the switch put on the glass.
 */
async function film(p, act) {
  const cdp = await p.createCDPSession()
  const frames = []
  let t0 = 0
  cdp.on("Page.screencastFrame", (m) => {
    frames.push({ t: Math.round(performance.now() - t0), at: (m.metadata?.timestamp ?? 0) * 1000, data: m.data })
    cdp.send("Page.screencastFrameAck", { sessionId: m.sessionId }).catch(() => {})
  })
  await cdp.send("Page.enable")
  t0 = performance.now()
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1 })
  await sleep(150)
  const pressAt = Math.round(performance.now() - t0)
  const result = await act()
  await sleep(250)
  await cdp.send("Page.stopScreencast")
  await cdp.detach().catch(() => {})
  return { frames, result, pressAt }
}

/**
 * ===========================================================================
 *  EVERY FILMED FRAME IS EITHER BEFORE THE SWITCH OR AFTER IT
 * ===========================================================================
 * Read off the pixels, inside the preview boxes the switch leaves on screen.
 * Each frame filmed after the press is compared, box by box, with two
 * pictures: the frame that was on the glass when the pill was pressed, and
 * the frame the switch settles on. A frame that matches the first has not
 * caught up with the press yet; one that matches the second shows the new
 * category exactly as it will stay. A frame that matches neither is a
 * picture of something in between (a list fading in, a preview coming up
 * from grey, a box drawn empty for a frame), which is the flash. And once a
 * box has shown its settled picture it must keep it.
 *
 * A box whose own picture moves by itself (a section with an animation in
 * it) is left out, and so is any box the settled frame shows as nothing at
 * all, which would make "matches the settled frame" a test of nothing.
 */
const SAME = 2 /* mean difference per channel, out of 255, below which two pictures of a box are the same */
async function frameVerdicts(decoder, frames, pressedAt, rects) {
  /* In the order they were drawn: the screencast can deliver two a little out of turn. */
  const drawn = [...frames].sort((a, b) => a.at - b.at)
  const before = [...drawn].reverse().find((f) => f.at <= pressedAt) ?? drawn[0]
  const after = drawn.filter((f) => f.at > pressedAt)
  if (!after.length || !rects.length) return { frames: 0, boxes: 0, between: [], regressed: [], skipped: 0 }
  const list = [before, ...after]
  await decoder.evaluate(() => { window.__px = [] })
  for (const f of list) {
    await decoder.evaluate(async ({ data, rects }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = img.width
      c.height = img.height
      const g = c.getContext("2d", { willReadFrequently: true })
      g.drawImage(img, 0, 0)
      const boxes = rects.map(([x, y, w, h]) => {
        const x0 = Math.max(0, x + 3), y0 = Math.max(0, y + 3)
        const x1 = Math.min(img.width, x + w - 3), y1 = Math.min(img.height, y + h - 3)
        if (x1 - x0 < 8 || y1 - y0 < 8) return null
        const px = g.getImageData(x0, y0, x1 - x0, y1 - y0).data
        const out = new Uint8Array(Math.ceil(px.length / 12))
        let k = 0
        for (let i = 0; i < px.length; i += 12) out[k++] = (px[i] + px[i + 1] + px[i + 2]) / 3
        return out
      })
      window.__px.push(boxes)
    }, { data: f.data, rects })
  }
  return decoder.evaluate(({ SAME }) => {
    const px = window.__px
    const diff = (a, b) => {
      if (!a || !b) return 0
      let s = 0
      for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
      return s / a.length
    }
    const flat = (a) => {
      if (!a) return true
      let lo = 255, hi = 0
      for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v }
      return hi - lo < 8
    }
    const pre = px[0]
    const post = px.slice(1)
    const settled = post[post.length - 1]
    const boxes = settled.map((_, b) => b)
    /* A box that is still changing between the last three frames animates by itself, or has not settled. */
    const steady = boxes.filter((b) => post.length < 3 || (diff(post[post.length - 2][b], settled[b]) < SAME && diff(post[post.length - 3][b], settled[b]) < SAME))
    const judged = steady.filter((b) => !flat(settled[b]))
    const between = []
    const regressed = []
    const reached = new Set()
    post.forEach((frame, i) => {
      for (const b of judged) {
        const dNew = diff(frame[b], settled[b])
        const dOld = diff(frame[b], pre[b])
        if (dNew < SAME) { reached.add(b); continue }
        if (reached.has(b)) regressed.push({ frame: i, box: b, fromSettled: Math.round(dNew * 10) / 10 })
        else if (dOld >= SAME) between.push({ frame: i, box: b, fromBefore: Math.round(dOld * 10) / 10, fromSettled: Math.round(dNew * 10) / 10 })
      }
    })
    return { frames: post.length, boxes: judged.length, between, regressed, skipped: boxes.length - judged.length }
  }, { SAME })
}

async function run(kind) {
  const phone = kind === "phone"
  const p = await browser.newPage()
  await p.setViewport(phone ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 800 })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
  await p.evaluate(RECORDER)
  await p.evaluate(PARTS)
  await p.evaluate(SEQUENCE)
  /* The editor settles and the library draws its previews in idle time. */
  await p.waitForFunction(() => document.querySelectorAll("[data-library-card]").length >= 30, { timeout: 30_000 }).catch(() => {})
  await sleep(2500)
  const warm = await p.evaluate(() => {
    const cards = [...document.querySelectorAll("[data-library-card]")]
    return { cards: cards.length, drawn: cards.filter((c) => c.querySelector("[data-keep-transform]")).length }
  })
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await sleep(300)

  console.log(`\n══ ${phone ? "A phone, 390 × 844" : "A computer, 1280 × 800"}, CPU at a quarter speed ══\n`)
  /* A phone's sheet keeps its content, so it is ready before it opens; a computer's dialog is built as it opens (below). */
  if (phone) expect(warm.cards >= 30 && warm.drawn === warm.cards, "every card is built, with its preview drawn, before the library is opened", warm)

  /* The page as it was, to find the new section by. */
  const before = await p.evaluate(() => [...document.querySelectorAll("#wb-preview-root [id^='wb-section-']")].map((e) => e.id))

  /* ── OPEN: the gap between the first two sections of the page ── */
  await p.evaluate(() => {
    const strips = [...document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")]
    ;(strips[1] ?? strips[0]).scrollIntoView({ block: "center" })
  })
  await sleep(400)
  const gap = await p.evaluate(() => {
    const strips = [...document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")]
    const r = (strips[1] ?? strips[0]).getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
  await p.evaluate(() => window.__rec.start())
  if (phone) await p.touchscreen.tap(gap.x, gap.y)
  else await p.mouse.click(gap.x, gap.y)
  /* Until the library has stopped moving for six frames. */
  const opened = await p.evaluate(async (phone) => {
    const start = performance.now()
    const surface = () => phone
      ? document.querySelector("[data-section-library='phone']")?.closest("[data-mobile-bottom-sheet]")
      : document.querySelector("[data-section-library='desktop']")
    let last = "", still = 0, seen = null
    while (performance.now() - start < 3000) {
      await new Promise((r) => requestAnimationFrame(r))
      const el = surface()
      if (!el) continue
      if (seen === null) seen = Math.round(performance.now() - start)
      const r = el.getBoundingClientRect()
      const now = `${Math.round(r.top)}:${getComputedStyle(el).opacity}`
      still = now === last ? still + 1 : 0
      last = now
      if (still >= 6) return { seen, settled: Math.round(performance.now() - start) }
    }
    return { seen, settled: null }
  }, phone)
  const openStats = await p.evaluate(() => window.__rec.stop())
  await p.screenshot({ path: shot(`${kind}-1-open`) })
  expect(opened.settled !== null, "the library opens and comes to rest", opened)
  note(`opened: first frame at ${opened.seen}ms, at rest at ${opened.settled}ms; ${openStats.frames} frames, median ${openStats.median}ms, p95 ${openStats.p95}ms, worst ${openStats.worst}ms; long tasks ${JSON.stringify(openStats.long)}`)
  /* 200ms, at a quarter speed: the open measured 117 to 172ms before this change on this same shared
     machine, so a line any tighter measures the neighbours; a library built as it opens is 400ms and more. */
  expect(openStats.long.every((d) => d < 200), "no task in the open longer than 200ms at a quarter speed", openStats.long)

  /* The previews go in a few a frame; all of them within a second or two of opening, on either shell. */
  const filled = await p.evaluate(async () => {
    const start = performance.now()
    let n = 0, cards = 0
    while (performance.now() - start < 4000) {
      const all = [...document.querySelectorAll("[data-section-library] [data-library-card]")]
      cards = all.length
      n = all.filter((c) => c.querySelector("[data-keep-transform]")).length
      if (cards && n === cards) break
      await new Promise((r) => requestAnimationFrame(r))
    }
    return { cards, drawn: n, ms: Math.round(performance.now() - start) }
  })
  expect(filled.cards >= 30 && filled.drawn === filled.cards, "every card has its preview within moments of opening", filled)

  /* ── WORDS: no line saying where it goes; Created, first ── */
  const words = await p.evaluate(() => {
    const { lib, pills } = window.__lib()
    const head = lib.querySelector("h2")?.parentElement
    return {
      where: document.querySelector("[data-library-where]")?.textContent ?? null,
      head: head ? (head.textContent || "").trim() : null,
      pills: pills.map((b) => (b.textContent || "").trim()),
    }
  })
  expect(words.where === null && !/\b(After|Between|At the end|At the top|On the empty page)\b/.test(words.head ?? ""), "no line under the title saying where the section goes", words.head)
  expect(/^Created\d*$/.test(words.pills[0] ?? ""), "the creator's own sections are the first category, called Created", words.pills.slice(0, 3))
  expect(!words.pills.some((t) => /Created by you/.test(t)), "and nothing is called Created by you any more")

  /* ── ROWS: one card per row ── */
  const rows = await p.evaluate(() => {
    const { lib, scroller } = window.__lib()
    const cards = [...lib.querySelectorAll("[data-library-card]")].filter((c) => !c.hidden)
    const lefts = new Set(cards.map((c) => Math.round(c.getBoundingClientRect().left)))
    const grid = lib.querySelector("[data-library-grid]")
    const cs = getComputedStyle(scroller)
    const inner = scroller.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const widths = cards.map((c) => Math.round(c.getBoundingClientRect().width))
    const box = cards[0]?.querySelector("[data-preview-box]") ?? cards[0]?.querySelector("[data-keep-transform]")?.parentElement
    const b = box?.getBoundingClientRect()
    return { cards: cards.length, columns: lefts.size, cardWidth: Math.min(...widths), maxWidth: Math.max(...widths), listWidth: Math.round(inner), gridWidth: grid ? Math.round(grid.getBoundingClientRect().width) : null, preview: b ? [Math.round(b.width), Math.round(b.height)] : null }
  })
  expect(rows.columns === 1, "one card per row: every card starts at the same x", rows)
  expect(rows.cardWidth >= rows.listWidth - 1 && rows.maxWidth <= rows.listWidth + 1, "and each is as wide as the list", `${rows.cardWidth}px cards in a ${rows.listWidth}px list, preview ${rows.preview?.join(" × ")}`)

  /* ── HEIGHTS: each card as tall as its section ── */
  const hs = await p.evaluate(CARD_HEIGHTS, { ratio: phone ? 1.22 : 0.56 })
  writeFileSync(join(SHOTS, `addsection-${kind}-heights.json`), JSON.stringify(hs, null, 1))
  judgeHeights("All", hs)

  /* ── PILLS: every category, every frame sampled, the screen filmed ── */
  /* Every category once, the first time it is shown, then back to three that have been. */
  const pillNames = await p.evaluate(() => window.__lib().pills.map((b) => (b.textContent || "").trim().replace(/\d+$/, "")))
  const names = [...pillNames.filter((n) => n !== "All" && n !== "Created"), "All", "Hero", "Created"]
  /* The pixels are read in a page of their own, and the editor is put back in
     front: a page in the background gets no animation frames at all. */
  const decoder = await browser.newPage()
  await p.bringToFront()
  let filmed = 0, judgedBoxes = 0, flashes = 0
  for (const name of names) {
    const { frames, result } = await film(p, () => p.evaluate(SWITCH, { names: [name] }))
    const s = result[0]
    expect(!s.missing && s.pressed === "true", `"${s.name}": the pill is pressed`, s.missing ? "no such pill" : s.pressed)
    expect(s.problems === 0, `"${s.name}": no frame where a drawn preview on screen is missing, faded, skipped or moved`, s.problems ? s.examples : `${s.frames} frames sampled, ${s.readyOnScreen} drawn previews on screen, first frame ${s.firstFrameMs}ms after the press`)
    expect(s.scrollTopAfter === 0, `"${s.name}": the list starts at its top from the first frame`, s.scrollTopAfter)
    /* Every filmed frame after the press, box by box, against the frame before it and the frame it settles on. */
    const v = await frameVerdicts(decoder, frames, s.pressedAt ?? Infinity, s.rects ?? [])
    filmed += v.frames
    judgedBoxes += v.boxes
    flashes += v.between.length + v.regressed.length
    const after = [...frames].sort((a, b) => a.at - b.at).filter((f) => s.pressedAt && f.at > s.pressedAt)
    const odd = new Set([...v.between, ...v.regressed].map((x) => x.frame))
    for (const i of [...odd].slice(0, 3)) writeFileSync(shot(`${kind}-2-flash-${slug(name)}-${i}`), Buffer.from(after[i].data, "base64"))
    /* The first frame drawn after the switch's own first frame began, not merely after the press. */
    const first = after.find((f) => s.pressedAt && f.at >= s.pressedAt + (s.firstFrameMs ?? 0)) ?? after[after.length - 1]
    if (first) writeFileSync(shot(`${kind}-2-switch-${slug(name)}-first-frame`), Buffer.from(first.data, "base64"))
    note(`"${name}": ${v.frames} frames filmed after the press, ${v.boxes} previews read in each (${v.skipped} left out); ${odd.size} frame${odd.size === 1 ? "" : "s"} showing something between the two`)
    if (odd.size) note(`   ${JSON.stringify([...v.between, ...v.regressed].slice(0, 4))}`)
    if (process.env.DEBUG_FILM) for (const [i, f] of frames.entries()) writeFileSync(join(SHOTS, `film-${kind}-${slug(name)}-${String(i).padStart(3, "0")}-${Math.round(f.at - s.pressedAt)}ms.png`), Buffer.from(f.data, "base64"))
  }
  await p.screenshot({ path: shot(`${kind}-2-category`) })
  expect(filmed > 0 && judgedBoxes > 0 && flashes === 0, "no filmed frame shows a preview anywhere between how it was and how it settles", `${flashes} box-frames in between, over ${filmed} frames`)
  await decoder.close()

  /* The creator's own card, and the category with the shortest sections in it (the announcement bars, at the floor). */
  await p.evaluate(() => window.__lib().pills.find((b) => /^Created\d*$/.test((b.textContent || "").trim()))?.click())
  await sleep(400)
  await p.screenshot({ path: shot(`${kind}-2-created`) })
  const marketing = await p.evaluate(() => {
    const pill = window.__lib().pills.find((b) => /^Marketing\d*$/.test((b.textContent || "").trim()))
    pill?.scrollIntoView({ inline: "center", block: "nearest" })
    pill?.click()
    return !!pill
  })
  if (marketing) {
    await sleep(400)
    await p.evaluate(() => window.__lib().lib.querySelector("[data-library-card='promo_announcement']")?.scrollIntoView({ block: "center" }))
    await sleep(300)
    await p.screenshot({ path: shot(`${kind}-2-floor`) })
  }

  /* Back to everything, for the add. */
  await p.evaluate(() => window.__lib().pills.find((b) => /^All\d*$/.test((b.textContent || "").trim()))?.click())
  await sleep(400)

  /* ── ADD ── */
  await p.evaluate(() => window.__rec.start())
  const card = await p.evaluate(() => {
    const { lib } = window.__lib()
    const c = [...lib.querySelectorAll("[data-library-card]")].find((x) => !x.hidden && x.getAttribute("data-library-card") === "features_grid") ?? [...lib.querySelectorAll("[data-library-card]")].find((x) => !x.hidden)
    c.scrollIntoView({ block: "center" })
    const r = c.getBoundingClientRect()
    return { type: c.getAttribute("data-library-card"), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 60)) }
  })
  await sleep(200)
  await p.evaluate((before) => window.__seq.start(before), before)
  if (phone) await p.touchscreen.tap(card.x, card.y)
  else await p.mouse.click(card.x, card.y)
  const tAdd = Date.now()
  await sleep(phone ? 420 : 300)
  await p.screenshot({ path: shot(`${kind}-3-arriving`) })
  await sleep(phone ? 1900 : 1500)
  const seq = await p.evaluate(() => window.__seq.stop())
  const addStats = await p.evaluate(() => window.__rec.stop())
  await p.screenshot({ path: shot(`${kind}-4-added`) })
  const end = seq[seq.length - 1]
  const order = await p.evaluate(() => [...document.querySelectorAll("#wb-preview-root [id^='wb-section-']")].map((e) => e.id))
  const index = end.id ? order.indexOf(end.id) : -1
  const settledAt = seq.find((s, i) => i > 0 && s.arrival === "done" && seq.slice(i).every((x) => x.sheet === s.sheet && x.scroll === s.scroll))?.t ?? null
  expect(end.arrival === "done", "the new section arrives and settles", { id: end.id, arrival: end.arrival })
  /* The gap tapped was the one under the page's first section: header, first section, the new one. */
  expect(index === 2, "in the gap that was tapped, not at the end of the page", `at ${index} of ${order.length}`)
  expect(end.ring, "and it is selected")
  const libGone = phone ? end.lib === null || end.lib >= 842 : end.dialog !== "open"
  expect(libGone, "the library has gone", phone ? end.lib : end.dialog)
  note(`add: ${seq.length} frames recorded; everything still ${settledAt === null ? "never" : `${settledAt}ms`} after the tap; ${addStats.frames} frames, median ${addStats.median}ms, p95 ${addStats.p95}ms, worst ${addStats.worst}ms; long tasks ${JSON.stringify(addStats.long)}`)
  writeFileSync(join(SHOTS, `addsection-${kind}-sequence.json`), JSON.stringify(seq, null, 1))

  if (!phone) {
    /* A computer is as it was: the canvas brings it on screen, selected, its settings in the sidebar. */
    expect(end.top !== null && end.top >= end.canvasTop - 1 && end.top < 800 - 120, "on screen when it has arrived", { top: end.top, canvasTop: end.canvasTop })
    expect(!!end.sidebar && /Feature/i.test(end.sidebar), "and its settings are in the sidebar", end.sidebar)
  } else {
    /* ── THE PHONE'S SHEET, AFTER ── */
    const peekTop = seq[0].sheet
    const libClosedAt = seq.find((s) => s.lib === null || s.lib >= 842)?.t ?? null
    const rising = seq.filter((s) => s.sheet !== null && s.sheet < peekTop - 2)
    const firstRise = rising[0] ?? null
    const middle = Math.round(844 - 844 * 0.5)
    note(`today's sequence: sheet at ${peekTop} when tapped, library gone at ${libClosedAt}ms, sheet first moves at ${firstRise ? `${firstRise.t}ms` : "never"}, ends at ${end.sheet} showing "${end.shows}"`)
    expect(end.sheet !== null && Math.abs(end.sheet - middle) <= 6, "the sections sheet ends at its middle stop", { sheet: end.sheet, middle })
    expect(!!end.shows && /Feature/i.test(end.shows), "on the new section's settings", end.shows)
    expect(firstRise !== null && libClosedAt !== null && firstRise.t >= libClosedAt, "and it starts rising only once the library has gone", { libClosedAt, firstRise: firstRise?.t ?? null })
    const risePath = rising.map((s) => s.sheet)
    const backwards = risePath.filter((y, i) => i > 0 && y > risePath[i - 1] + 1).length
    const overshoot = rising.length ? Math.min(...risePath) < middle - 2 : false
    expect(rising.length > 0 && backwards === 0 && !overshoot, "rising once, one way, with no bounce", { frames: rising.length, backwards, lowest: rising.length ? Math.min(...risePath) : null })
    const wrong = rising.filter((s) => !/Feature/i.test(s.shows ?? ""))
    expect(rising.length > 0 && wrong.length === 0, "already on the section's settings in every frame it is moving (the list never shows)", wrong.slice(0, 3).map((s) => s.shows))
    const sliding = rising.filter((s) => s.panelAnims > 0)
    expect(rising.length > 0 && sliding.length === 0, "and nothing inside it slides while it rises: one movement, not two", `${sliding.length} frames`)
    const scrolls = new Set(rising.map((s) => s.scroll))
    const tops = new Set(rising.map((s) => s.top))
    expect(rising.length > 0 && scrolls.size === 1 && tops.size === 1, "the canvas holds still while the sheet rises", { scrolls: [...scrolls], tops: [...tops] })
    expect(end.top !== null && end.top >= end.canvasTop - 1 && end.top <= end.sheet - 100, "and the new section is on screen above the sheet", { top: end.top, sheet: end.sheet, canvasTop: end.canvasTop })
    const flicker = seq.filter((s, i) => i > 0 && s.lib !== null && seq[i - 1].lib !== null && s.lib < seq[i - 1].lib - 1)
    expect(flicker.length === 0, "the library only ever moves down once tapped", flicker.slice(0, 3))

    /* ── THE SAME ADD FROM THE SHEET'S OWN BUTTON ── */
    await sleep(600)
    const before2 = await p.evaluate(() => [...document.querySelectorAll("#wb-preview-root [id^='wb-section-']")].map((e) => e.id))
    /* Back to the list, where the sheet's own Add section button is, with the sheet open. */
    await p.evaluate(() => window.__baseSheet()?.querySelector("[data-panel-back] button")?.click())
    await sleep(700)
    const atPeek = await p.evaluate(() => window.__baseSheet().getBoundingClientRect().top > window.innerHeight - 120)
    if (atPeek) {
      const tab = await p.evaluate(() => {
        const t = [...window.__baseSheet().querySelectorAll("[role='tab']")].find((x) => /Sections/.test(x.textContent || ""))
        const r = t.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
      })
      await p.touchscreen.tap(tab.x, tab.y)
      await sleep(900)
    }
    const sheetBefore = await p.evaluate(() => Math.round(window.__baseSheet().getBoundingClientRect().top))
    const addButton = await p.evaluate(() => {
      const b = [...window.__baseSheet().querySelectorAll("button")].find((x) => /^Add section$/.test((x.textContent || "").trim()))
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    expect(!!addButton, "the sheet's own Add section button is there", addButton)
    if (addButton) {
      await p.touchscreen.tap(addButton.x, addButton.y)
      await sleep(900)
      const card2 = await p.evaluate(() => {
        const { lib } = window.__lib()
        const c = [...lib.querySelectorAll("[data-library-card]")].find((x) => !x.hidden && x.getAttribute("data-library-card") === "faq_accordion") ?? [...lib.querySelectorAll("[data-library-card]")].find((x) => !x.hidden)
        c.scrollIntoView({ block: "center" })
        const r = c.getBoundingClientRect()
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 60)), name: c.textContent.trim() }
      })
      await sleep(200)
      await p.evaluate((b) => window.__seq.start(b), before2)
      await p.touchscreen.tap(card2.x, card2.y)
      await sleep(2300)
      const seq2 = await p.evaluate(() => window.__seq.stop())
      await p.screenshot({ path: shot(`${kind}-5-added-from-sheet`) })
      writeFileSync(join(SHOTS, `addsection-${kind}-sequence-from-sheet.json`), JSON.stringify(seq2, null, 1))
      const end2 = seq2[seq2.length - 1]
      note(`from the sheet: sheet at ${sheetBefore} before, ${end2.sheet} after, showing "${end2.shows}"; new section at ${end2.top}`)
      expect(end2.arrival === "done" && end2.ring, "the section arrives, selected", { arrival: end2.arrival, ring: end2.ring })
      expect(!!end2.shows && /FAQ|Accordion/i.test(end2.shows), "and the sheet is on its settings", end2.shows)
      expect(end2.sheet !== null && Math.abs(end2.sheet - middle) <= 6, "at the middle stop", { sheet: end2.sheet, middle })
      expect(end2.top !== null && end2.top >= end2.canvasTop - 1 && end2.top <= end2.sheet - 100, "with the new section on screen above it", { top: end2.top, sheet: end2.sheet })
      /* The sheet's panel may change while the library still covers it; once any of it shows, nothing in it slides. */
      const seenSliding = seq2.filter((s) => s.panelAnims > 0 && s.sheet !== null && (s.lib === null || s.lib > s.sheet + 40))
      const moved = new Set(seq2.map((s) => s.sheet)).size
      expect(seenSliding.length === 0, "nothing in the sheet slides where it can be seen as the library goes", `${seenSliding.length} frames${seenSliding.length ? `, first at ${seenSliding[0].t}ms with the library at ${seenSliding[0].lib}` : ""}`)
      expect(moved === 1, "and the sheet itself does not move", [...new Set(seq2.map((s) => s.sheet))])
    }
  }
  await p.close()
}

/* ── EARLY: a library opened before its previews are drawn ── */
async function early(kind) {
  const phone = kind === "phone"
  const p = await browser.newPage()
  await p.setViewport(phone ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 800 })
  await p.goto(`${origin}/editor`, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
  await p.evaluate(PARTS)
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  console.log(`\n══ ${phone ? "A phone" : "A computer"}, the library opened before its previews are drawn ══\n`)
  const tapGap = async () => {
    const gap = await p.evaluate(() => {
      const strips = [...document.querySelectorAll("#wb-preview-root [aria-label='Add a section here']")]
      const s = strips[1] ?? strips[0]
      s.scrollIntoView({ block: "center" })
      const r = s.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    if (phone) await p.touchscreen.tap(gap.x, gap.y)
    else await p.mouse.click(gap.x, gap.y)
  }
  const atTap = await p.evaluate(() => ({ ms: Math.round(performance.now()), cards: document.querySelectorAll("[data-library-card]").length, drawn: document.querySelectorAll("[data-library-card] [data-keep-transform]").length }))
  await tapGap()
  const w = await p.evaluate(WATCH, { ms: 4000 })
  await p.screenshot({ path: shot(`${kind}-6-early`) })
  note(`opened ${atTap.ms}ms after the page began, with ${atTap.cards} cards built and ${atTap.drawn} previews in them; watched ${w.frames} frames: ${w.landedInSight} previews landed on screen, ${w.tookBelow} cards below the fold took their own height`)
  note(`on screen at the end: ${w.inSight.map((c) => `"${c.name}" ${c.box}px card, ${c.section ?? "no"}px section`).join("; ")}`)
  for (const s of w.shrunk.slice(0, 4)) note(`   shrank in sight: ${s.key} ${s.from} -> ${s.to}px at ${s.t}ms`)
  expect(w.frames > 30 && w.cards >= 30, "the library was watched, open, while its previews landed", { frames: w.frames, cards: w.cards })
  expect(w.shrunk.length === 0, "no card on screen, or above it, got shorter while the library was open", w.shrunk.length ? w.shrunk.slice(0, 4) : undefined)

  /* Closed, and opened again: nobody saw the held cards change. */
  if (phone) {
    await p.evaluate(() => {
      const sheet = document.querySelector("[data-section-library='phone']")?.closest("[data-mobile-bottom-sheet]")
      const overlay = sheet?.previousElementSibling
      if (overlay && overlay.hasAttribute("data-wb-sheet-overlay")) overlay.click()
    })
  } else {
    await p.keyboard.press("Escape")
  }
  await sleep(1200)
  await tapGap()
  await sleep(1200)
  /* Every preview in, however long the rest took to draw at a quarter speed. */
  const allIn = await p.waitForFunction(() => {
    const cards = [...document.querySelectorAll("[data-section-library] [data-library-card]")]
    return cards.length >= 30 && cards.every((c) => c.querySelector("[data-keep-transform]"))
  }, { timeout: 60_000, polling: 250 }).then(() => true).catch(() => false)
  expect(allIn, "opened again, every preview is drawn")
  const held = w.inSight.filter((c) => c.below !== null && c.below >= EMPTY_UNDER)
  note(`held at the end of the watch, in sight with empty card under them: ${held.length ? held.map((c) => `"${c.name}" ${c.box}px for ${c.section}px`).join("; ") : "none"}`)
  const again = await p.evaluate(CARD_HEIGHTS, { ratio: phone ? 1.22 : 0.56 })
  writeFileSync(join(SHOTS, `addsection-${kind}-heights-reopened.json`), JSON.stringify(again, null, 1))
  judgeHeights("Opened again", again)
  await p.screenshot({ path: shot(`${kind}-7-early-reopened`) })
  await p.close()
}

await run("phone")
await run("desktop")
await early("phone")
await early("desktop")
await browser.close()
server.close()
console.log(`\nScreenshots in ${SHOTS}\n`)
if (bad) {
  console.error(`${bad} check${bad === 1 ? "" : "s"} failed.`)
  process.exit(1)
}
console.log("Opening, choosing and adding a section keep up, and the section lands where it was asked for.\n")
