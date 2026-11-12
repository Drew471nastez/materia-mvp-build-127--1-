/**
 * A TAP TO EVERY PART OF A BLOCK SHEET ON SCREEN, FRAME BY FRAME (round R3).
 *
 * The owner: "when opening embed sheets (Spotify, YouTube, maps, forms) the
 * sheet's content, headings, text and buttons, not only the frame, sometimes
 * appears delayed or pops in after the sheet opened." The real
 * BlockSheetProvider and the real blocks (scripts/render-onepage-sheet-first-
 * frame.tsx), on a phone (390x844, touch) and a computer (1440x900, mouse),
 * on a page whose own typeface is served one file per weight as Google Fonts
 * serves it, each file after FONT_MS.
 *
 * From the press, on every frame the browser draws, for every part of the
 * sheet (its title, Close, Share and the block's button, every line of text,
 * every field and button in its body, and the place an embed arrives in):
 *
 *   first     the frame the sheet itself is first drawn on (its card has any opacity)
 *   late      a part drawn on a later frame than the sheet: mounted late, or
 *             faded or clipped on its own after the sheet was up
 *   swap      a line of text whose width changed after its first frame (a
 *             typeface arriving and replacing the fallback)
 *   place     the embed's place: drawn on the sheet's first frame at its final
 *             size, in a fill of its own, before the frame inside has loaded
 *
 * Fails on any late part, any swap, or an embed place that is not there with
 * the sheet. Every service's document is answered after LATENCY ms.
 *
 * Each sheet is opened twice, the second time after Close (a sheet with a
 * frame comes back from being kept hidden). The same blocks are opened on the
 * real page (PublicOnePage, scripts/render-onepage-header-as.tsx &sheets),
 * light and dark, with its legibility pass, and on a page drawn in its
 * regular weight only (?plain), where the sheet is the first to ask for its
 * title's and button's weights.
 *
 *   node scripts/check-onepage-sheet-first-frame.mjs
 *   REPORT=1 prints without failing. ONLY=spotify,form picks.
 */
import puppeteer from "puppeteer-core"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const root = process.env.ROOT || process.cwd()
const report = !!process.env.REPORT
const only = (process.env.ONLY || "").split(",").filter(Boolean)
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => existsSync(p))
const LATENCY = 250
const FONT_MS = 180
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}

/* The typeface's files: two real weights from the repository's own dependencies, standing in for a family's four. */
const fontDir = join(root, "node_modules/.pnpm")
const findFont = (name) => {
  const { execFileSync } = awaitExec
  return execFileSync("find", [fontDir, "-name", name, "-path", "*polished*"], { encoding: "utf8" }).split("\n")[0]
}
const awaitExec = await import("node:child_process")
const REGULAR = readFileSync(findFont("SourceCodePro-Regular.ttf.woff2"))
const BOLD = readFileSync(findFont("SourceCodePro-Bold.ttf.woff2"))

const TARGETS = [
  ["spotify-link", "[data-probe-open='spotify-link']", true],
  ["spotify", "[data-probe='spotify'] [data-block-sheet-trigger]", true],
  ["youtube", "[data-probe='youtube'] [data-block-sheet-trigger]", true],
  ["map", "[data-probe='map'] [data-block-sheet-trigger]", true],
  ["x", "[data-probe='x'] [data-block-sheet-trigger]", true],
  ["form", "[data-probe='form'] [data-block-sheet-trigger], [data-probe='form'] button", false],
  ["rsvp", "[data-probe='rsvp'] button", false],
].filter(([name]) => !only.length || only.includes(name))

const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-onepage-sheet-first-frame.tsx" })
/* The real page (PublicOnePage, its legibility pass and its fonts included), with the same blocks. */
const real = await serveEditorProbe({ root, entry: "scripts/render-onepage-header-as.tsx" })
const PAGE_TARGETS = [
  ["page spotify", "[data-op-block='sp'] [data-block-sheet-trigger], [data-op-block='sp'] button", true],
  ["page youtube", "[data-op-block='yt'] [data-block-sheet-trigger], [data-op-block='yt'] button", true],
  ["page map", "[data-op-block='mp'] [data-block-sheet-trigger]", true],
  ["page form", "[data-op-block='cf'] [data-block-sheet-trigger], [data-op-block='cf'] button", false],
].filter(([name]) => !only.length || only.includes(name.replace("page ", "")))
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] })

/* Watches the sheet from the press, on every frame. */
const WATCH = `(() => {
  const w = { t0: performance.now(), frames: [], parts: new Map(), first: null, fonts: 0 }
  window.__sheetWatch = w
  document.fonts.addEventListener("loadingdone", () => { w.fonts++ })
  w.events = {}
  for (const type of ["pointerdown", "pointerup", "click"]) document.addEventListener(type, () => { if (w.events[type] === undefined) w.events[type] = Math.round(performance.now() - w.t0) }, { capture: true, once: true })
  const name = (el) => {
    if (el.matches("[data-block-sheet-title]")) return "title"
    for (const k of ["close", "share", "cta"]) if (el.matches("[data-block-sheet-" + k + "]")) return k
    if (el.matches("[data-embed-place]")) return "embed place"
    const tag = el.tagName.toLowerCase()
    const text = (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 28)
    return tag + (text ? " '" + text + "'" : "")
  }
  /* The parts: the head and foot, every element with text of its own, every field and button, and the embed's place. */
  const partsOf = (panel) => {
    const out = new Set()
    for (const el of panel.querySelectorAll("[data-block-sheet-title], [data-block-sheet-close], [data-block-sheet-share], [data-block-sheet-cta], [data-block-sheet-body] input:not([type=hidden]):not([tabindex='-1']), [data-block-sheet-body] textarea, [data-block-sheet-body] button, [data-block-sheet-body] select")) out.add(el)
    for (const el of panel.querySelectorAll("[data-block-sheet-body] *")) {
      if (el.closest("[aria-hidden='true'], .sr-only")) continue
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) out.add(el)
    }
    for (const f of panel.querySelectorAll("[data-block-sheet-body] iframe")) {
      const place = f.parentElement
      place.setAttribute("data-embed-place", "")
      out.add(place)
    }
    return [...out]
  }
  /* How it is drawn: laid out, inside the card (the card may be partly below the screen as it rises), and its opacity of its own, the card's apart. */
  const state = (el, panel, pr) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return 0
    if (r.bottom <= pr.top + 1 || r.top >= pr.bottom - 1) return 0
    let o = 1
    for (let n = el; n && n !== panel; n = n.parentElement) {
      const cs = getComputedStyle(n)
      if (cs.visibility === "hidden" || cs.display === "none") return 0
      o *= parseFloat(cs.opacity || "1")
    }
    return Math.round(o * 1000) / 1000
  }
  /* Its colours as drawn: a word recoloured after the sheet is up (a legibility pass a frame late) is a change too. */
  const paint = (el) => {
    const cs = getComputedStyle(el)
    return cs.color + "|" + cs.backgroundColor + "|" + cs.borderTopColor
  }
  const fill = (el) => {
    for (let n = el; n; n = n.firstElementChild) {
      const bg = getComputedStyle(n).backgroundColor
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return true
      if (n.tagName === "IFRAME") break
    }
    return false
  }
  const width = (el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return Math.round(range.getBoundingClientRect().width / (parseFloat(getComputedStyle(document.querySelector("[data-block-sheet-panel]")).scale) || 1) * 10) / 10
  }
  const tick = () => {
    const t = Math.round(performance.now() - w.t0)
    const panel = document.querySelector("[data-block-sheet-open] [data-block-sheet-panel]")
    if (panel) {
      const op = parseFloat(getComputedStyle(panel).opacity)
      const pr = panel.getBoundingClientRect()
      if (w.first === null && op > 0) w.first = { t, frame: w.frames.length }
      if (w.first !== null) {
        const firstFrame = w.first.frame === w.frames.length
        for (const el of partsOf(panel)) {
          let p = w.parts.get(el)
          if (!p) w.parts.set(el, (p = { name: name(el), seen: t, atFirst: firstFrame ? state(el, panel, pr) : -1, widths: [], place: null, now: 0, rose: null, paint: paint(el), repaint: null }))
          /* A transition of its own (a hover, a press) is not a recolour: only a colour set again. */
          if (p.repaint === null && paint(el) !== p.paint && !el.matches(":hover, :active, :focus-visible")) p.repaint = { t, from: p.paint, to: paint(el) }
          const o = state(el, panel, pr)
          /* Anything that becomes more visible after the sheet's first frame came in late. */
          if (p.rose === null && o > (p.atFirst < 0 ? 0 : p.atFirst) + 0.02) p.rose = t
          p.now = o
          if (o > 0 && !el.matches("[data-embed-place]") && el.textContent.trim()) p.widths.push(width(el))
          if (el.matches("[data-embed-place]")) {
            if (p.place === null && o > 0) p.place = { h: el.offsetHeight, fill: fill(el), loaded: el.closest("[data-embed-shown]") !== null, frame: w.frames.length }
            p.last = { h: el.offsetHeight }
          }
        }
      }
    }
    w.frames.push(t)
    if (t < 1400) requestAnimationFrame(tick)
    else w.done = true
  }
  requestAnimationFrame(tick)
})()`

const READ = `(() => {
  const w = window.__sheetWatch
  return { first: w.first, events: w.events, fonts: w.fonts, frames: w.frames.length, parts: [...w.parts.values()].map((p) => ({ name: p.name, seen: p.seen, atFirst: p.atFirst, now: p.now, rose: p.rose, repaint: p.repaint, swap: p.widths.length ? Math.round((Math.max(...p.widths) - Math.min(...p.widths)) * 10) / 10 : 0, place: p.place, last: p.last || null })) }
})()`

async function setup(page, { width, height, touch }, query = "") {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.pathname.startsWith("/__face/")) {
      const body = u.pathname.includes("regular") ? REGULAR : BOLD
      return void setTimeout(() => r.respond({ status: 200, contentType: "font/woff2", body }).catch(() => {}), FONT_MS)
    }
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return void r.continue()
    if (r.resourceType() === "document") {
      return void setTimeout(() => r.respond({ status: 200, contentType: "text/html", body: `<!doctype html><body style="margin:0;background:#181818;color:#fff">${u.hostname}</body>` }).catch(() => {}), LATENCY)
    }
    return void r.respond({ status: 204, body: "" }).catch(() => {})
  })
  page.on("pageerror", (e) => console.log("   pageerror", String(e).slice(0, 200)))
  if (query.startsWith("/app?")) {
    await page.goto(real.base + query, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-op-block='sp']")
  } else {
    await page.goto(base + "/app/onepage" + query, { waitUntil: "domcontentloaded" })
    await page.waitForSelector("[data-probe-open='spotify-link']")
  }
  /* A visitor reads the page a moment before the first tap. */
  await sleep(1500)
}

async function press(page, selector, touch) {
  const el = await page.$(selector)
  if (!el) return false
  await el.scrollIntoView()
  await sleep(150)
  const box = await el.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + Math.min(box.height / 2, 28)
  if (touch) {
    await page.evaluate(WATCH)
    await page.touchscreen.touchStart(x, y)
    await sleep(70)
    await page.touchscreen.touchEnd()
  } else {
    await page.mouse.move(x - 40, y)
    await page.mouse.move(x, y, { steps: 4 })
    await sleep(150)
    await page.evaluate(WATCH)
    await page.mouse.down()
    await sleep(70)
    await page.mouse.up()
  }
  return true
}

const RUNS = [
  ["390", { width: 390, height: 844, touch: true }, ""],
  ["1440", { width: 1440, height: 900, touch: false }, ""],
  /* A page in its regular weight only: the sheet is the first to draw in 500 and 600. */
  ["390 plain", { width: 390, height: 844, touch: true }, "?plain"],
  ["1440 plain", { width: 1440, height: 900, touch: false }, "?plain"],
  /* The real page, light and dark. */
  ["390", { width: 390, height: 844, touch: true }, "/app?layout=classic&sheets"],
  ["1440", { width: 1440, height: 900, touch: false }, "/app?layout=classic&sheets"],
  ["390 dark", { width: 390, height: 844, touch: true }, "/app?layout=hero&sheets&dark"],
  ["1440 dark", { width: 1440, height: 900, touch: false }, "/app?layout=hero&sheets&dark"],
]
for (const [label, viewport, query] of RUNS) {
  const page = await browser.newPage()
  await setup(page, viewport, query)
  const list = query.startsWith("/app?") ? PAGE_TARGETS : query ? TARGETS.filter(([n]) => n === "spotify-link") : TARGETS
  /* Each opened twice: the first time, and again after Close (a sheet with a frame is kept hidden and shown again). */
  for (const [name, selector, embed] of [...list, ...list.map(([n, s, e]) => [n + " again", s, e])]) {
    if (!(await press(page, selector, viewport.touch))) {
      check(false, `${label} ${name}: no trigger`)
      continue
    }
    await page.waitForFunction("window.__sheetWatch && window.__sheetWatch.done", { timeout: 5000 }).catch(() => {})
    const w = await page.evaluate(READ)
    /* Late: not in the sheet on its first frame, or drawn fainter or cut there than it ends up. */
    const late = w.parts.filter((p) => p.now > 0 && (p.atFirst < 0 || p.rose !== null))
    const swaps = w.parts.filter((p) => p.swap > 1)
    const repaints = w.parts.filter((p) => p.repaint)
    const place = w.parts.find((p) => p.name === "embed place")
    console.log(`   ${label} ${name}: sheet first drawn ${w.first?.t}ms after the press (frame ${w.first?.frame}; pointer up at ${w.events.pointerup}ms, click at ${w.events.click}ms), ${w.parts.length} parts, fonts loaded during it ${w.fonts}`)
    for (const p of late) console.log(`     late  ${p.name}: in the page at ${p.seen}ms, ${p.atFirst < 0 ? "not there" : "at " + p.atFirst} on the sheet's first frame, ${p.now} from ${p.rose}ms`)
    for (const p of swaps) console.log(`     swap  ${p.name}: its width changed by ${p.swap}px`)
    for (const p of repaints) console.log(`     paint ${p.name}: recoloured at ${p.repaint.t}ms (${p.repaint.from} -> ${p.repaint.to})`)
    check(w.first !== null && w.parts.length >= 3, `${label} ${name}: the sheet is drawn ${w.first?.t}ms after the press with ${w.parts.length} parts`)
    check(late.length === 0, `${label} ${name}: every part is drawn on the sheet's first frame (${late.length} late${late.length ? ": " + late.map((p) => p.name).join(", ") : ""})`)
    check(swaps.length === 0, `${label} ${name}: no line of text changes width after it is drawn (${swaps.length} swapped)`)
    check(repaints.length === 0, `${label} ${name}: no part is recoloured after it is drawn (${repaints.length}${repaints.length ? ": " + repaints.map((p) => p.name).join(", ") : ""})`)
    if (embed) check(!!place && place.place?.frame === w.first?.frame && place.place?.fill && place.place.h > 100 && Math.abs(place.place.h - place.last.h) <= 2, `${label} ${name}: the embed's place is there with the sheet, ${place?.place?.h}px in a fill of its own (${place?.last?.h}px once loaded)`)
    await page.keyboard.press("Escape")
    await page.waitForFunction(() => !document.querySelector("[data-block-sheet-open]"), { timeout: 3000 }).catch(() => {})
    await sleep(500)
  }
  await page.close()
}

await browser.close()
server.close()
real.server.close()
if (failures.length && !report) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log(failures.length ? `\n${failures.length} over (REPORT)` : "\nall passed")
