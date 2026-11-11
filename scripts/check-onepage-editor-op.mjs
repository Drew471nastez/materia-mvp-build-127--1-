/**
 * ===========================================================================
 *  CLICK A BLOCK IN THE PHONE, MEASURED (OnePage editor round)
 * ===========================================================================
 * The owner: "remove the visible selector outline; clicking anywhere on a
 * block or area in the preview selects that block, smoothly scrolls the
 * left sidebar to it and smoothly opens its settings".
 *
 * The real editor (scripts/onepage-probe-server.mjs) in headless Chromium at
 * 1440x900 with a mouse, a page long enough that the list has to move:
 *
 *   nothing    hovering and clicking draw nothing over the page (no ring,
 *              no outline, no box shadow layer), the pointer is a hand
 *   far        a click on the last block opens its settings and the list
 *              glides to its card: the list's scrollTop is read every frame
 *              and has to pass through several values in between (a jump
 *              is one), ending with the card in view
 *   gap        a click in the gap between two blocks takes the nearer one
 *   embed      a click on a YouTube player (a frame of its own) takes the
 *              block instead of starting the video
 *   again      the list scrolled away, a click on the open block brings the
 *              list back to its card, and the page still hears it
 *   header     a click on the name in the preview opens the header block
 *   autoplay   a YouTube video set to play by itself loads its player muted
 *              once it is on screen, and not before
 *   map        the map's field takes a typed address, a Google Maps place
 *              link and a short Share link (read once); the preview's map
 *              searches for what was found
 *
 *   node scripts/check-onepage-editor-op.mjs
 *   SHOTS=<dir>  screenshots;  REPORT=1  numbers only, nothing fails
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

const links = Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, type: "link_button", enabled: true, sort_order: i + 2, data: { label: `Link number ${i + 1}`, url: `https://example.com/${i}` } }))
const blocks = [
  { id: "hdr", type: "header", enabled: true, sort_order: 0, data: { show_avatar: true, show_name: true, show_bio: true } },
  { id: "yt", type: "video", enabled: true, sort_order: 1, data: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", layout: "player" } },
  { id: "auto", type: "video", enabled: true, sort_order: 30, data: { url: "https://youtu.be/aqz-KE-bpKQ", layout: "player", autoplay: true } },
  ...links,
  { id: "last", type: "link_button", enabled: true, sort_order: 40, data: { label: "The last link", url: "https://example.com/last" } },
  { id: "map", type: "map", enabled: true, sort_order: 41, data: { title: "Visit", address: "350 5th Ave, New York, NY 10118" } },
]
/* The short link Google Maps' Share button makes, read by app/api/onepage/map-place: answered here as Google would lead it. */
const SHORT = "https://maps.app.goo.gl/AbCdEf123"
const LONG = "https://www.google.com/maps/place/Joe's+Pizza/@40.7305,-74.0021,17z/data=!3d40.730546!4d-74.002136"
const api = (req) => (req.url.startsWith("/api/onepage/map-place") ? (new URL(req.url, "http://x").searchParams.get("url") === SHORT ? { body: { url: LONG, label: "Joe's Pizza" } } : { status: 422, body: { error: "This link did not lead to a place. Paste the address instead." } }) : null)
const { base, server } = await serveEditorProbe({ blocks, fail, api })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], protocolTimeout: 600000 })

try {
  const p = await browser.newPage()
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 240)))
  await p.goto(`${base}/app/onepage#links`)
  await p.waitForSelector("[data-add-block]", { timeout: 30000 }).catch(() => null)
  await sleep(1800)
  const frame = await (await p.$("[data-onepage-phone] iframe")).contentFrame()
  await frame.waitForSelector('[data-op-block="last"]', { timeout: 20000 })
  await sleep(600)
  /* Before anything scrolls: the self playing video is far down the page. */
  const before = await frame.evaluate(() => document.querySelector('[data-op-block="auto"] [data-video-autoplay]')?.getAttribute("data-video-autoplay") ?? null)

  /* Where a point in the frame is on the editor's screen (the phone is zoomed). */
  const at = (sel, fx = 0.5, fy = 0.5) => p.evaluate((sel, fx, fy) => {
    const f = document.querySelector("[data-onepage-phone] iframe")
    const el = f.contentDocument.querySelector(sel)
    if (!el) return null
    const fr = f.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const z = parseFloat(getComputedStyle(f).zoom) || 1
    return { x: fr.left + (r.left + r.width * fx) * z, y: fr.top + (r.top + r.height * fy) * z, frameTop: fr.top, frameBottom: fr.bottom }
  }, sel, fx, fy)
  const scrollFrameTo = (sel) => frame.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "center" }), sel)
  const openId = () => p.evaluate(() => document.querySelector("[data-block-settings]")?.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null)
  const scroller = () => p.evaluate(() => {
    const el = document.querySelector('[data-block-id="l0"]')
    let s = el?.parentElement
    while (s && s !== document.documentElement) {
      const oy = getComputedStyle(s).overflowY
      if ((oy === "auto" || oy === "scroll") && s.scrollHeight > s.clientHeight) break
      s = s.parentElement
    }
    if (s) s.setAttribute("data-probe-scroller", "")
    return !!s
  })
  /* scrollTop read every frame for `ms`, in the editor's own clock. */
  const watchScroll = (ms) => p.evaluate((ms) => new Promise((done) => {
    const s = document.querySelector("[data-probe-scroller]")
    const seen = []
    const t0 = performance.now()
    const tick = () => {
      seen.push(Math.round(s.scrollTop))
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else done(seen)
    }
    requestAnimationFrame(tick)
  }), ms)
  const inView = (id) => p.evaluate((id) => {
    const el = document.querySelector(`[data-block-id="${id}"]`)
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.top < innerHeight - 40
  }, id)

  console.log("\nnothing drawn")
  await scroller()
  let t = await at('[data-op-block="l3"]')
  await p.mouse.move(t.x, t.y, { steps: 4 })
  await sleep(250)
  const look = await frame.evaluate(() => {
    const extra = [...document.querySelectorAll("body *")].filter((el) => {
      const s = getComputedStyle(el)
      return s.position === "fixed" && /rgba?\(/.test(s.boxShadow) && s.boxShadow !== "none" && el.getBoundingClientRect().width > 0 && !el.closest("[data-op-block]")
    }).length
    return { rings: document.querySelectorAll("[data-pick-hover],[data-pick-open]").length, extra, cursor: getComputedStyle(document.querySelector('[data-op-block="l3"] a, [data-op-block="l3"] button, [data-op-block="l3"]')).cursor }
  })
  expect(look.rings === 0 && look.extra === 0, "hover draws no ring or outline layer over the page", look)
  expect(look.cursor === "pointer", "the pointer is a hand over a block", look.cursor)

  console.log("\nfar: the last block")
  await scrollFrameTo('[data-op-block="last"]')
  await sleep(300)
  t = await at('[data-op-block="last"]')
  const watching = watchScroll(1400)
  await p.mouse.click(t.x, t.y)
  const seen = await watching
  const distinct = new Set(seen).size
  const moved = seen[seen.length - 1] - seen[0]
  console.log(`        scrollTop ${seen[0]} -> ${seen[seen.length - 1]}, ${distinct} values over ${seen.length} frames`)
  expect((await openId()) === "last", "the last block's settings are open")
  expect(moved > 100 && distinct >= 6, "the list glides to it (many frames in between, not a jump)", { moved, distinct })
  expect(await inView("last"), "its card is in view")
  expect(!(await frame.evaluate(() => !!document.querySelector("[data-preview-notice]"))), "the page's own link did not run")
  await shotIf(p, "pick-op-far")

  console.log("\ngap: between two links")
  await scrollFrameTo('[data-op-block="l5"]')
  await sleep(300)
  const gap = await frame.evaluate(() => {
    const a = document.querySelector('[data-op-block="l5"]').getBoundingClientRect()
    const b = document.querySelector('[data-op-block="l6"]').getBoundingClientRect()
    return { y: a.bottom + Math.max(1, Math.min(4, (b.top - a.bottom) / 3)), gap: b.top - a.bottom }
  })
  const gp = await p.evaluate((y) => {
    const f = document.querySelector("[data-onepage-phone] iframe")
    const fr = f.getBoundingClientRect()
    const z = parseFloat(getComputedStyle(f).zoom) || 1
    return { x: fr.left + fr.width / 2, y: fr.top + y * z }
  }, gap.y)
  await p.mouse.click(gp.x, gp.y)
  await sleep(700)
  expect((await openId()) === "l5", `a click in the ${Math.round(gap.gap)}px gap just under a link takes that link`, await openId())

  console.log("\nembed: the YouTube player")
  await scrollFrameTo('[data-op-block="yt"]')
  await sleep(400)
  const ytFrame = await frame.evaluate(() => !!document.querySelector('[data-op-block="yt"] iframe'))
  t = await at('[data-op-block="yt"]')
  await p.mouse.click(t.x, t.y)
  await sleep(800)
  expect((await openId()) === "yt", `a click on the player takes the block${ytFrame ? " (a player frame is drawn)" : " (a poster is drawn)"}`, await openId())
  const ytPointer = await frame.evaluate(() => {
    const f = document.querySelector('[data-op-block="yt"] iframe')
    return f ? getComputedStyle(f).pointerEvents : "no frame"
  })
  expect(ytPointer === "auto" || ytPointer === "no frame", "once open, its player takes clicks again", ytPointer)

  console.log("\nagain: the open block, the list scrolled away")
  await p.evaluate(() => document.querySelector("[data-probe-scroller]").scrollTo({ top: 99999 }))
  await sleep(300)
  const away = await inView("yt")
  t = await at('[data-op-block="yt"]')
  const watch2 = watchScroll(1200)
  await p.mouse.click(t.x, t.y)
  const seen2 = await watch2
  expect(!away && (await inView("yt")), "the list comes back to the open card", { away, frames: new Set(seen2).size })
  expect((await openId()) === "yt", "it stays open")

  console.log("\nheader: the name")
  await scrollFrameTo('[data-op-block="hdr"]')
  await sleep(300)
  t = await at('[data-op-block="hdr"] h1, [data-op-block="hdr"]')
  await p.mouse.click(t.x, t.y)
  await sleep(800)
  expect((await openId()) === "hdr", "a click on the name opens the header", await openId())

  console.log("\nautoplay: a YouTube video that plays by itself")
  await scrollFrameTo('[data-op-block="auto"]')
  await sleep(700)
  const after = await frame.evaluate(() => {
    const f = document.querySelector('[data-op-block="auto"] iframe')
    return { state: document.querySelector('[data-op-block="auto"] [data-video-autoplay]')?.getAttribute("data-video-autoplay") ?? null, src: f ? f.getAttribute("src") : null }
  })
  expect(before === "waiting", "off screen it waits (no player loaded)", before)
  expect(after.state === "playing" && /autoplay=1/.test(after.src || "") && /mute=1/.test(after.src || ""), "on screen its player loads, muted, playing", after)

  console.log("\nmap: a typed address or a Google Maps link")
  await scrollFrameTo('[data-op-block="map"]')
  await sleep(400)
  t = await at('[data-op-block="map"]', 0.5, 0.4)
  await p.mouse.click(t.x, t.y)
  await sleep(900)
  expect((await openId()) === "map", "a click on the map opens it (its frame does not take the click)", await openId())
  const field = '[data-block-id="map"] [data-map-place-field] input'
  const placeholder = await p.$eval(field, (e) => e.placeholder).catch(() => null)
  expect(placeholder && /New York/.test(placeholder) && !/Strada/.test(placeholder), "the example address is in New York", placeholder)
  const typeIn = async (text) => {
    await p.evaluate((sel, v) => { const el = document.querySelector(sel); el.focus(); el.select(); document.execCommand("insertText", false, v) }, field, text)
  }
  const said = () => p.evaluate(() => { const e = document.querySelector('[data-block-id="map"] [data-map-place-said]'); return e ? { tone: e.getAttribute("data-map-place-said"), text: e.textContent } : null })
  const mapSrc = () => frame.evaluate(() => document.querySelector('[data-op-block="map"] iframe')?.getAttribute("src") ?? null)
  await typeIn(SHORT)
  await sleep(1800)
  const s1 = await said()
  expect(s1 && s1.tone === "quiet" && /Joe's Pizza/.test(s1.text), "a short Share link is read once: Found Joe's Pizza", s1)
  const src1 = await mapSrc()
  expect(/q=40\.730546%2C-74\.002136/.test(src1 || ""), "the preview's map pins the place's own point", src1)
  await typeIn("https://www.google.com/maps/place/Katz's+Delicatessen/@40.7223,-73.9874,17z")
  await sleep(1200)
  const s2 = await said()
  expect(s2 && /Katz's Delicatessen/.test(s2.text), "a whole place link says what it found", s2)
  await typeIn("https://example.com/where")
  await sleep(400)
  const s3 = await said()
  expect(s3 && s3.tone === "problem", "another site's link says, calmly, what to paste", s3)
  await typeIn("Times Square, New York")
  await sleep(1300)
  const s4 = await said()
  const src4 = await mapSrc()
  expect(s4 === null && /q=Times%20Square%2C%20New%20York/.test(src4 || ""), "a typed address is the map's search, nothing more to say", { s4, src4 })
  await shotIf(p, "editor-op-map")

  expect(errors.length === 0, "no error in the page", errors)
} finally {
  await browser.close()
  server.close()
}

async function shotIf(p, name) {
  if (!SHOTS) return
  await p.screenshot({ path: `${SHOTS}/${name}.png` })
  console.log(`        shot ${SHOTS}/${name}.png`)
}

console.log(failures ? `\n${failures} failed` : "\nall passed")
process.exit(failures ? 1 : 0)
