/**
 * ===========================================================================
 *  ROUND 11: + ADD, THE ADD BLOCK SHEET, BRAND MARKS, EMBEDS, SOCIAL SHEET
 * ===========================================================================
 * Reads, in the real editor (scripts/render-onepage-editor.tsx served by
 * scripts/onepage-probe-server.mjs) at 390x844 (touch, CPU slowed 4x) and
 * 1440x900, everything the owner asked of round 11's Add block work:
 *
 *   PLUS       the + on + Add: its rotate, every frame, under a mouse (a
 *              quarter turn, then 135 open) and under a finger (never turns)
 *   SHEET      Add block's open and close: the longest main-thread task of
 *              the tap and of the close, and frames dropped while it moves
 *              (BEFORE_ROOT=/a/checkout measures the same, run for run)
 *   CHIPS      every category chip pressed in turn: the task and frames of
 *              each switch, the settings pill's fill and hairline on the one
 *              chosen, the right sections shown
 *   TOUCH      a finger down on a row, a chip and + Add: no transform, scale
 *              or translate, only a tint
 *   KEYBOARD   the social sheet: a field focused, the keyboard simulated
 *              (visualViewport shrinks, as iOS does): the sheet rises on one
 *              curve without a jump, the page behind does not move or shift,
 *              the field stays above the keyboard; then Cancel: the sheet
 *              leaves still showing what it showed
 *   BRANDS     brand marks in their colours in the picker, the social sheet
 *              and the live social row (and one colour when asked), every
 *              mark drawn (a box, a fill), Instagram's gradient present
 *   EMBEDS     each new embed on the live page AS SERVED ON storelib.me (the
 *              page loaded as http://storelib.me:<port>, every request it
 *              makes put through lib/onepage/host-route onePageRoute with
 *              Host storelib.me) and in the editor's preview: the frame, its
 *              address (Twitch told storelib.me), its height, a post that
 *              says its height growing to it
 *   ICONS      Choose icon: opens, searches, switches, scrolls, and a choice
 *              lands on the link and in the preview
 *
 *   PROBE_CSS=source xvfb-run -a node scripts/check-onepage-addblock-r11.mjs
 *   ONLY=plus,sheet,chips,touch,keyboard,brands,embeds,icons
 *   BEFORE_ROOT=/a/checkout   REPEAT=3   SHOTS=/some/dir
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const only = process.env.ONLY || ""
const wants = (part) => !only || only.split(",").includes(part)
const shots = process.env.SHOTS || null
if (shots) mkdirSync(shots, { recursive: true })
const REPEAT = Math.max(1, Number(process.env.REPEAT) || 3)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* ── lib/onepage/host-route, bundled for node, so a request is judged as storelib.me would ── */
const routeDir = join(process.cwd(), `.addblock-route-${process.pid}`)
mkdirSync(routeDir, { recursive: true })
execFileSync("pnpm", ["exec", "esbuild", "lib/onepage/host-route.ts", "--bundle", "--format=esm", "--platform=node", "--log-level=error", `--alias:@=${process.cwd()}`, `--outfile=${join(routeDir, "route.mjs")}`])
const { onePageRoute } = await import(pathToFileURL(join(routeDir, "route.mjs")).href)
rmSync(routeDir, { recursive: true, force: true })
/** Would storelib.me answer this request of the page's own? (next or a rewrite: yes; a redirect or a not found: no.) */
const answersOnMe = (u, method) => {
  const r = onePageRoute({ host: "storelib.me", pathname: u.pathname, search: u.search, method, mainDomain: "storelib.com" })
  return { ok: !r || r.kind === "next" || r.kind === "rewrite", kind: r?.kind ?? "none" }
}

/* ── The pages ───────────────────────────────────────────────────────── */
const EMBEDS = [
  ["instagram", "https://www.instagram.com/p/C8ZQd4dOWQk/", "https://www.instagram.com/p/C8ZQd4dOWQk/embed/"],
  ["x", "https://x.com/jack/status/20", "https://platform.twitter.com/embed/Tweet.html?id=20&dnt=true"],
  ["typeform", "https://form.typeform.com/to/UQo1Ja", "https://form.typeform.com/to/UQo1Ja?typeform-embed=embed-widget"],
  ["googleforms", "https://docs.google.com/forms/d/e/1FAIpQLSf3vY5c9ZbXo0yqBd1d6Q0/viewform", "https://docs.google.com/forms/d/e/1FAIpQLSf3vY5c9ZbXo0yqBd1d6Q0/viewform?embedded=true"],
  ["tally", "https://tally.so/r/wMDxQr", "https://tally.so/embed/wMDxQr?alignLeft=1&hideTitle=0&transparentBackground=1"],
  ["substack", "https://on.substack.com", "https://on.substack.com/embed"],
  ["podcasts", "https://podcasts.apple.com/us/podcast/the-daily/id1200361736", "https://embed.podcasts.apple.com/us/podcast/the-daily/id1200361736"],
  ["twitch", "https://www.twitch.tv/twitch", "https://player.twitch.tv/?channel=twitch&autoplay=false&parent=storelib.me"],
  ["loom", "https://www.loom.com/share/e5b8c04bca094dd8a5507925ab887002", "https://www.loom.com/embed/e5b8c04bca094dd8a5507925ab887002"],
  ["mixcloud", "https://www.mixcloud.com/spartacus/party-time/", "https://player-widget.mixcloud.com/widget/iframe?feed=%2Fspartacus%2Fparty-time%2F&hide_cover=1&light=1"],
  ["bandcamp", '<iframe style="border:0" src="https://bandcamp.com/EmbeddedPlayer/album=1536701931/size=large/bgcol=ffffff/linkcol=0687f5/" seamless></iframe>', "https://bandcamp.com/EmbeddedPlayer/album=1536701931/size=large/bgcol=ffffff/linkcol=1a1a2e/tracklist=false/artwork=small/transparent=true/"],
  ["deezer", "https://www.deezer.com/en/album/302127", "https://widget.deezer.com/widget/auto/album/302127"],
  ["gcal", "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0abcdef", "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0abcdef?gv=true"],
]
const EMBED_HOSTS = ["www.instagram.com", "platform.twitter.com", "form.typeform.com", "docs.google.com", "tally.so", "on.substack.com", "embed.podcasts.apple.com", "player.twitch.tv", "clips.twitch.tv", "www.loom.com", "player-widget.mixcloud.com", "www.mixcloud.com", "bandcamp.com", "widget.deezer.com", "calendar.google.com"]
const EMBED_BLOCKS = [
  { id: "b1", type: "link_button", enabled: true, sort_order: 0, data: { label: "Shop the prints", url: "https://example.com/shop" } },
  { id: "bs", type: "social_row", enabled: true, sort_order: 1, data: { platforms: [{ platform: "instagram", url: "https://instagram.com/satori" }, { platform: "youtube", url: "https://youtube.com/@satori" }, { platform: "spotify", url: "https://open.spotify.com/artist/1" }, { platform: "twitter", url: "https://x.com/satori" }, { platform: "snapchat", url: "https://snapchat.com/add/satori" }], style: "icons" } },
  ...EMBEDS.map(([kind, url], i) => ({ id: `e_${kind}`, type: "embed", enabled: true, sort_order: 2 + i, data: { url, title: "", provider: kind } })),
]

const after = await serveEditorProbe({ fail })
const embedsPage = wants("embeds") || wants("brands") ? await serveEditorProbe({ fail, blocks: EMBED_BLOCKS, theme: { social_icon_tone: "brand" } }) : null
const before = process.env.BEFORE_ROOT ? await serveEditorProbe({ root: process.env.BEFORE_ROOT, fail }) : null

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu", "--host-resolver-rules=MAP storelib.me 127.0.0.1"],
  protocolTimeout: 240000,
})
/*
  A COMPUTER WITH A MOUSE. Headless Chromium has no pointer device, so it
  answers (hover: none) and (pointer: none), and neither CDP's media
  emulation nor --blink-settings changes that in this build; every hover
  rule behind app/globals.css's `hover:` and `pointer-fine:` would read as
  absent. Under a display (xvfb-run -a node ...) the 1440 pages run in a
  headed Chromium, which has the X server's mouse: (hover: hover) and
  (pointer: fine), as a laptop.
*/
const deskBrowser = process.env.DISPLAY
  ? await puppeteer.launch({ executablePath: CHROMIUM, headless: false, args: ["--no-sandbox", "--disable-gpu", "--host-resolver-rules=MAP storelib.me 127.0.0.1", "--window-size=1440,1000"], protocolTimeout: 240000 })
  : null
if (!deskBrowser) console.log("(no DISPLAY: run under xvfb-run -a for the mouse checks at 1440; they read a pointerless browser otherwise)")
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900 }

async function open(vp, url, { cpu = 1, settle = 5000, intercept = null, keyboard = false } = {}) {
  const p = await (!vp.hasTouch && deskBrowser ? deskBrowser : browser).newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  p.on("dialog", (d) => d.accept().catch(() => {}))
  if (intercept) {
    await p.setRequestInterception(true)
    p.on("request", intercept)
  }
  if (keyboard) await p.evaluateOnNewDocument(() => { window.PROBE_KEYBOARD = true })
  await p.evaluateOnNewDocument(() => {
    window.__shifts = []
    try {
      window.__shiftSources = []
      new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__shifts.push(e.value); for (const src of e.sources || []) window.__shiftSources.push({ v: Math.round(e.value * 1e4) / 1e4, node: src.node && src.node.nodeType === 1 ? src.node.outerHTML.slice(0, 120) : String(src.node && src.node.nodeName), from: src.previousRect && [src.previousRect.y, src.previousRect.height], to: src.currentRect && [src.currentRect.y, src.currentRect.height] }) })).observe({ type: "layout-shift", buffered: true })
    } catch { /* none here */ }
  })
  await p.goto(url)
  await p.waitForSelector("[data-scroll-container], [data-onepage-embed], #app *", { timeout: 15000 })
  /* Arrived, and the kept tabs and sheets built in the idle time. */
  await sleep(settle)
  const cdp = await p.target().createCDPSession()
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  return { p, errors, cdp }
}

/* Frame gaps from requestAnimationFrame, and the main thread from Chromium's trace. */
const startFrames = (p) => p.evaluate(() => {
  window.__ft = []
  const gen = (window.__ftGen = (window.__ftGen || 0) + 1)
  window.__ftOn = true
  window.__shifts = []
  const tick = (t) => { if (!window.__ftOn || window.__ftGen !== gen) return; window.__ft.push(t); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
const stopFrames = (p) => p.evaluate(() => {
  window.__ftOn = false
  const t = window.__ft
  return { gaps: t.slice(1).map((v, i) => v - t[i]), shift: window.__shifts.reduce((a, s) => a + s, 0) }
})
const FRAME = 1000 / 60
const dropped = (gaps) => gaps.reduce((a, g) => a + Math.max(0, Math.round(g / FRAME) - 1), 0)
const worst = (gaps) => Math.round(Math.max(0, ...gaps) * 10) / 10
function longestTask(buf) {
  const ev = JSON.parse(Buffer.from(buf).toString("utf8")).traceEvents
  const mainTid = ev.find((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain" && ev.some((x) => x.tid === e.tid && x.name === "UpdateLayoutTree"))?.tid
  const tasks = ev.filter((e) => e.ph === "X" && e.tid === mainTid && e.name === "RunTask")
  if (process.env.PROFILE) {
    const t = [...tasks].sort((a, b) => b.dur - a.dur)[0]
    if (t) {
      const inner = {}
      ev.filter((e) => e.ph === "X" && e.tid === mainTid && e.ts >= t.ts && e.ts + e.dur <= t.ts + t.dur && e.name !== "RunTask").forEach((e) => { const k = e.name === "FunctionCall" ? `FunctionCall ${e.args?.data?.functionName || ""}@${(e.args?.data?.url || "").split("/").pop()}:${e.args?.data?.lineNumber ?? ""}` : e.name; inner[k] = (inner[k] || 0) + e.dur })
      console.log("        longest task:", JSON.stringify(Object.fromEntries(Object.entries(inner).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v / 100) / 10]))))
    }
  }
  return Math.round(Math.max(0, ...tasks.map((e) => e.dur)) / 100) / 10
}
const TRACE = ["devtools.timeline", "disabled-by-default-devtools.timeline"]
async function measure(s, act, ms) {
  await startFrames(s.p)
  await s.p.tracing.start({ categories: TRACE })
  await act()
  await sleep(ms)
  const f = await stopFrames(s.p)
  const longest = longestTask(await s.p.tracing.stop())
  return { longest, dropped: dropped(f.gaps), worst: worst(f.gaps), frames: f.gaps.length, shift: f.shift }
}
const tapAt = async (s, x, y) => {
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  await sleep(40)
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
const center = (p, sel) => p.evaluate((sel) => {
  const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}, sel)
const tapSel = async (s, sel) => {
  /* Into view first, as a thumb scrolls a row of chips to the one it wants. */
  await s.p.evaluate((sel) => { const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length); el?.scrollIntoView({ block: "nearest", inline: "center" }) }, sel)
  await sleep(120)
  const c = await center(s.p, sel)
  if (!c) return false
  await tapAt(s, c.x, c.y)
  return true
}
const sheetOpen = (p) => p.evaluate(() => !!document.querySelector('[data-app-sheet="open"]'))
const shot = async (p, name) => { if (shots) { const f = join(shots, `${name}.png`); await p.screenshot({ path: f }); console.log(`        picture: ${f}`) } }

/* ── PLUS ────────────────────────────────────────────────────────────── */
/** Every frame's rotate of the + for `ms`. */
const sampleRotate = (p, ms) => p.evaluate((ms) => new Promise((done) => {
  const svg = document.querySelector("[data-add-block] svg")
  const out = []
  const t0 = performance.now()
  const tick = () => {
    const r = getComputedStyle(svg).rotate
    out.push(r === "none" ? 0 : Number.parseFloat(r))
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    else done(out)
  }
  requestAnimationFrame(tick)
}), ms)

if (wants("plus")) {
  console.log("\n+ Add: the + under a mouse (1440) and under a finger (390, CPU 4x)")
  {
    const s = await open(DESK, `${after.base}/app/onepage#links`, { settle: 2500 })
    const c = await center(s.p, "[data-add-block]")
    const mouse = await s.p.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)
    expect(mouse, "this page has a mouse: (hover: hover) and (pointer: fine)")
    await s.p.mouse.move(c.x, c.y)
    const hover = await sampleRotate(s.p, 500)
    expect(Math.max(...hover) <= 90.5 && Math.abs(hover[hover.length - 1] - 90) < 0.5, "a hover turns it a quarter (to 90) and no further", { max: Math.max(...hover), end: hover[hover.length - 1], frames: hover.length })
    expect(hover.every((v, i) => i === 0 || v >= hover[i - 1] - 0.01), "the hover turn only goes one way", hover.slice(0, 6))
    await s.p.mouse.click(c.x, c.y)
    const opened = await sampleRotate(s.p, 500)
    expect(Math.max(...opened) <= 135.5 && Math.abs(opened[opened.length - 1] - 135) < 0.5, "open: on to 135 (an x), not past it", { max: Math.max(...opened), end: opened[opened.length - 1] })
    await s.p.mouse.move(5, 5)
    await s.p.keyboard.press("Escape")
    const closed = await sampleRotate(s.p, 600)
    expect(Math.abs(closed[closed.length - 1]) < 0.5, "closed and left: back to 0", closed[closed.length - 1])
    const total = [hover, opened, closed].reduce((a, xs) => a + xs.slice(1).reduce((b, v, i) => b + Math.abs(v - xs[i]), 0), 0)
    console.log(`        degrees turned in all: ${Math.round(total)} (round 10 as shipped: no hover turn at all, its class was never generated, and 405 on every open and back, a phone included)`)
    await s.p.close()
  }
  {
    const s = await open(PHONE, `${after.base}/app/onepage#links`, { cpu: 4, settle: 3000 })
    const c = await center(s.p, "[data-add-block]")
    const sampling = sampleRotate(s.p, 900)
    await tapAt(s, c.x, c.y)
    const tapped = await sampling
    expect(tapped.every((v) => v === 0), "a finger: the + never turns on the tap that opens the sheet", { max: Math.max(...tapped), frames: tapped.length })
    const open1 = await sheetOpen(s.p)
    expect(open1, "the tap opened Add block")
    const sampling2 = sampleRotate(s.p, 900)
    await s.p.keyboard.press("Escape")
    const back = await sampling2
    expect(back.every((v) => v === 0), "and never on the close", { max: Math.max(...back) })
    const pressed = await s.p.evaluate(() => { const b = document.querySelector("[data-add-block]"); const cs = getComputedStyle(b); return { scale: cs.scale, translate: cs.translate } })
    console.log(`        + Add's own press at rest: ${JSON.stringify(pressed)}`)
    await s.p.close()
  }
}

/* ── SHEET ───────────────────────────────────────────────────────────── */
const openAdd = (s) => s.p.evaluate(() => { document.querySelector("[data-add-block]").click() })
async function sheetRun(base) {
  const s = await open(PHONE, `${base}/app/onepage#links`, { cpu: 4 })
  const o = await measure(s, () => openAdd(s), 900)
  const up = await sheetOpen(s.p)
  /* Closed by a tap on the dimmed page above it, as a thumb does. */
  const c = await measure(s, () => tapAt(s, 195, 40), 900)
  const down = !(await sheetOpen(s.p))
  await s.p.close()
  return { open: o, close: c, up, down, errors: s.errors }
}
if (wants("sheet")) {
  console.log(`\nAdd block's sheet at 390x844, touch, CPU 4x, ${REPEAT} runs each (frame gaps in ms; 16.7 is 60fps)`)
  const sides = before ? [["before", before.base], ["after", after.base]] : [["after", after.base]]
  const rows = Object.fromEntries(sides.map(([k]) => [k, []]))
  for (let k = 0; k < REPEAT; k++) {
    for (const [label, base] of sides) {
      try {
        const r = await sheetRun(base)
        rows[label].push(r)
        console.log(`  [${label}] open: longest task ${r.open.longest}ms, ${r.open.dropped} dropped, worst gap ${r.open.worst} | close: longest task ${r.close.longest}ms, ${r.close.dropped} dropped, worst gap ${r.close.worst} | CLS ${Math.round((r.open.shift + r.close.shift) * 1e4) / 1e4}`)
      } catch (e) {
        console.log(`  [${label}] run broke: ${String(e).slice(0, 100)}`)
      }
    }
  }
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)] }
  for (const [label] of sides) {
    const rs = rows[label]
    if (!rs.length) continue
    console.log(`  ${label.toUpperCase()} median: open longest ${med(rs.map((r) => r.open.longest))}ms, dropped ${med(rs.map((r) => r.open.dropped))} | close longest ${med(rs.map((r) => r.close.longest))}ms, dropped ${med(rs.map((r) => r.close.dropped))}`)
  }
  const a = rows.after
  expect(a.length > 0 && a.every((r) => r.up && r.down), "it opens on the tap and closes on a tap above it, every run")
  expect(a.every((r) => r.errors.length === 0), "no errors", a.flatMap((r) => r.errors).slice(0, 2))
  expect(a.every((r) => r.open.shift === 0 && r.close.shift === 0), "nothing behind it shifts")
  if (a.length) {
    expect(med(a.map((r) => r.open.longest)) <= 60, "the tap's longest task, median, is under 60ms at 4x", med(a.map((r) => r.open.longest)))
    expect(med(a.map((r) => r.open.dropped)) <= 4 && med(a.map((r) => r.close.dropped)) <= 2, "open drops at most 4 frames and close at most 2 (median)", { open: med(a.map((r) => r.open.dropped)), close: med(a.map((r) => r.close.dropped)) })
  }
}

/* ── CHIPS and TOUCH ─────────────────────────────────────────────────── */
if (wants("chips") || wants("touch")) {
  console.log("\nCategory chips and a finger on the rows, 390, touch, CPU 4x")
  const s = await open(PHONE, `${after.base}/app/onepage#links`, { cpu: 4 })
  await openAdd(s)
  await sleep(900)
  if (wants("chips")) {
    const order = ["essentials", "sell", "media", "grow", "integrations", "links", "all"]
    const per = []
    for (const id of order) {
      /* The row scrolled to the chip first, outside the measure, as a thumb does before it presses. */
      await s.p.evaluate((id) => document.querySelector(`[data-picker-chip="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "center" }), id)
      await sleep(400)
      const c = await center(s.p, `[data-picker-chip="${id}"]`)
      const r = await measure(s, () => tapAt(s, c.x, c.y), 450)
      await sleep(200)
      const state = await s.p.evaluate((id) => {
        const chip = document.querySelector(`[data-picker-chip="${id}"]`)
        const cs = getComputedStyle(chip)
        const fill = chip.querySelector("[data-pill-fill]")
        const fs = fill ? getComputedStyle(fill) : null
        const shown = [...document.querySelectorAll("[data-picker-section]")].filter((x) => x.hasAttribute("data-shown") && x.getBoundingClientRect().height > 0).map((x) => x.getAttribute("data-picker-section"))
        return { selected: chip.getAttribute("aria-selected"), fill: fs && { opacity: fs.opacity, bg: fs.backgroundColor, border: fs.borderTopColor, shadow: fs.boxShadow }, border: cs.borderTopColor, bg: cs.backgroundColor, scale: cs.scale, transform: cs.transform, shown }
      }, id)
      per.push({ id, ...r, ...state })
      console.log(`  ${id.padEnd(13)} longest task ${r.longest}ms, ${r.dropped} dropped, worst gap ${r.worst} | shows ${state.shown.join(",")}`)
    }
    expect(per.every((r) => r.selected === "true"), "each press chooses its chip")
    expect(per.every((r) => r.fill && r.fill.opacity === "1" && r.fill.bg === "rgb(226, 228, 232)" && /inset/.test(r.fill.shadow) && r.bg === "rgb(255, 255, 255)"), "the chosen chip is Storelib's pill: white on a hairline, its own grey fill in, with its inset depth", per[0] && { fill: per[0].fill, bg: per[0].bg })
    expect(per.every((r) => r.scale === "none" && r.transform === "none"), "no chip scales or moves")
    expect(per.slice(0, 6).every((r) => r.shown.length === 1 && r.shown[0] === r.id), "a category shows its section alone", per.map((r) => r.shown.join("+")))
    expect(per[6].shown.length >= 6, "All shows every section", per[6].shown)
    const med = [...per.map((r) => r.longest)].sort((a, b) => a - b)[3]
    const dropMed = [...per.map((r) => r.dropped)].sort((a, b) => a - b)[3]
    /* The median, not the worst: on a machine shared with builds one switch in a run can lose a few frames to something else. */
    expect(med <= 50 && dropMed <= 2, "a switch is light: median task under 50ms, median 2 frames dropped at most", { median: med, dropped: per.map((r) => r.dropped) })
    const off = await s.p.evaluate(() => { const c = document.querySelector('[data-picker-chip="sell"]'); return { fill: getComputedStyle(c.querySelector("[data-pill-fill]")).opacity, bg: getComputedStyle(c).backgroundColor } })
    expect(off.fill === "0" && off.bg === "rgb(255, 255, 255)", "a chip not chosen is white on its hairline, its fill out", off)
    await shot(s.p, "r11-picker-390")
  }
  if (wants("touch")) {
    /* A finger down and held on a row, a chip and a brand tile, then lifted off by a cancel (no tap, nothing added). */
    const read = (sel) => s.p.evaluate((sel) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length)
      const cs = getComputedStyle(el)
      const tile = el.querySelector("[data-block-tile]")
      const ts = tile ? getComputedStyle(tile) : null
      return { scale: cs.scale, transform: cs.transform, translate: cs.translate, bg: cs.backgroundColor, tile: ts && { scale: ts.scale, transform: ts.transform } }
    }, sel)
    const hold = async (sel) => {
      const c = await center(s.p, sel)
      await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] })
      await sleep(260)
      const r = await read(sel)
      await s.cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] })
      await sleep(200)
      return r
    }
    for (const sel of ['[data-picker-entry="link"]', '[data-picker-entry="product"]', '[data-picker-entry="int_youtube"]', '[data-picker-chip="media"]']) {
      const r = await hold(sel)
      expect(r.scale === "none" && r.transform === "none" && r.translate === "none" && (!r.tile || (r.tile.scale === "none" && r.tile.transform === "none")), `a finger on ${sel}: no bump (no scale, transform or translate)`, r)
    }
    /* A finger sliding down over the rows (a scroll): nothing on the way lights up or moves. */
    const c = await center(s.p, '[data-picker-entry="text"]')
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] })
    for (let k = 1; k <= 6; k++) { await s.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: c.x, y: c.y - k * 20 }] }); await sleep(30) }
    const moved = await s.p.evaluate(() => [...document.querySelectorAll("[data-picker-entry]")].filter((e) => { const cs = getComputedStyle(e); return cs.scale !== "none" || cs.transform !== "none" }).length)
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    expect(moved === 0, "a finger sliding over the list moves no row", moved)
    const rules = await s.p.evaluate(() => {
      const hits = []
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        const walk = (list, media) => {
          for (const r of list) {
            if (r.cssRules && !r.selectorText) walk(r.cssRules, r.conditionText || media)
            else if (r.selectorText && /data-picker|data-add-block/.test(r.selectorText) && /scale|transform|translate/.test(r.style?.cssText || "")) hits.push(`${media} ${r.selectorText}`)
          }
        }
        walk(rules, "")
      }
      return hits
    })
    console.log(`        rules moving a row or chip: ${rules.length}`)
  }
  expect(s.errors.length === 0, "no errors", s.errors.slice(0, 2))
  await s.p.close()
}

/* ── KEYBOARD and the social sheet's Cancel ──────────────────────────── */
const fieldTopsDbg = (kb) => kb.out.slice(0, 20).map((f) => `${Math.round(f.t)}:${Math.round(f.inputBottom)}[${f.scrolls}|${Math.round(f.ih)}|${f.pb}]`).join(" ")
if (wants("keyboard")) {
  console.log("\nThe social sheet: a field, the keyboard, Cancel (390, touch, CPU 4x)")
  const s = await open(PHONE, `${after.base}/app/onepage#links`, { cpu: 4, keyboard: true })
  const scroll0 = await s.p.evaluate(() => { const sc = document.querySelector("[data-scroll-container]"); return { win: scrollY, list: sc ? sc.scrollTop : 0 } })
  await tapSel(s, '[data-social-chip="instagram"]')
  await sleep(900)
  const title = () => s.p.evaluate(() => document.querySelector('[data-app-sheet="open"] h2')?.textContent ?? null)
  expect(await sheetOpen(s.p) && /edit social link/i.test(await title() ?? ""), "the instagram chip opens Edit Social Link", await title())
  const panelRect = () => s.p.evaluate(() => { const el = document.querySelector('[data-app-sheet="open"] [data-sheet-panel]'); const r = el.getBoundingClientRect(); return { top: r.top, height: r.height } })
  const restRect = await panelRect()
  /* The field, focused by a tap. */
  const field = await center(s.p, '[data-app-sheet="open"] input[aria-label]')
  await tapAt(s, field.x, field.y)
  await sleep(150)
  /* The keyboard: iOS keeps the layout viewport and shrinks the visual one by the keys' height, then says so. */
  const KB = 336
  const track = s.p.evaluate((KB) => new Promise((done) => {
    const vv = window.visualViewport
    const H = innerHeight
    Object.defineProperty(vv, "height", { configurable: true, get: () => H - KB })
    const panel = document.querySelector('[data-app-sheet="open"] [data-sheet-panel]')
    const input = document.querySelector('[data-app-sheet="open"] input[aria-label]')
    const sc = document.querySelector("[data-scroll-container]")
    const out = []
    const t0 = performance.now()
    window.__shifts = []
    window.__shiftSources = []
    vv.dispatchEvent(new Event("resize"))
    window.dispatchEvent(new Event("resize"))
    const tick = () => {
      const r = panel.getBoundingClientRect()
      const i = input.getBoundingClientRect()
      const scrolls = []
      for (let n = input.parentElement; n && n !== document.body; n = n.parentElement) if (n.scrollTop) scrolls.push(`${n.tagName}.${(n.getAttribute("data-social-sheet") !== null ? "social" : n.getAttribute("data-sheet-body") !== null ? "body" : n.className.slice(0, 30))}=${n.scrollTop}`)
      out.push({ t: performance.now() - t0, top: r.top, inputBottom: i.bottom, win: scrollY, list: sc ? sc.scrollTop : 0, scrolls: scrolls.join(","), ih: panel.getBoundingClientRect().height, pb: getComputedStyle(panel).paddingBottom })
      if (performance.now() - t0 < 900) requestAnimationFrame(tick)
      else done({ out, shift: window.__shifts.reduce((a, v) => a + v, 0), visibleBottom: H - KB, sources: window.__shiftSources || [] })
    }
    requestAnimationFrame(tick)
  }), KB)
  const kb = await track
  const tops = kb.out.map((f) => f.top)
  const steps = tops.slice(1).map((v, i) => v - tops[i])
  const maxStep = Math.max(...steps.map(Math.abs))
  const reversals = steps.filter((d, i) => i > 0 && Math.sign(d) !== 0 && Math.sign(steps[i - 1]) !== 0 && Math.sign(d) !== Math.sign(steps[i - 1])).length
  const last = kb.out[kb.out.length - 1]
  console.log(`        top ${Math.round(restRect.top)} -> ${Math.round(last.top)} over ${kb.out.length} frames, largest step ${Math.round(maxStep)}px, field bottom ${Math.round(last.inputBottom)} of ${kb.visibleBottom} visible`)
  console.log(`        field: ${fieldTopsDbg(kb)}`)
  console.log(`        tops: ${tops.slice(0, 24).map((t) => Math.round(t)).join(" ")}`)
  if (kb.sources?.length) console.log(`        shifted: ${JSON.stringify(kb.sources.slice(0, 4))}`)
  /* Its field is at the top, above any keyboard: the sheet does not move at all, so nothing can jump. */
  expect(maxStep <= 1 && Math.abs(last.top - restRect.top) <= 1, "the keyboard does not move the sheet: its top edge, title and field stay put", { from: restRect.top, to: last.top, maxStep, reversals })
  const fieldTops = kb.out.map((f) => f.inputBottom)
  expect(Math.max(...fieldTops) - Math.min(...fieldTops) <= 1, "the field never moves under the finger", { min: Math.min(...fieldTops), max: Math.max(...fieldTops) })
  expect(last.inputBottom <= kb.visibleBottom, "the field stays above the keyboard", { field: last.inputBottom, visible: kb.visibleBottom })
  expect(kb.out.every((f) => f.win === scroll0.win && f.list === scroll0.list), "the page behind does not scroll", { before: scroll0, after: { win: last.win, list: last.list } })
  const behind = (kb.sources || []).filter((x) => !/data-sheet-panel/.test(x.node))
  expect(behind.length === 0, "and nothing behind it shifts", behind.slice(0, 3))
  await shot(s.p, "r11-social-keyboard-390")
  /*
    The keyboard goes (Done on the keys: the field lets go, the viewport grows
    back), then Cancel. Measured apart from the keyboard on purpose: when the
    keys go, ViewportVars (app/layout) writes --kb-inset and --vv-h on <html>,
    and a custom property changed on the root restyles the whole page (about
    70ms here at 4x), the same for every sheet in the app. That is the
    keyboard's cost, not the sheet's.
  */
  await s.p.evaluate(() => { document.activeElement?.blur(); delete window.visualViewport.height; window.visualViewport.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("resize")) })
  await sleep(900)
  const watch = s.p.evaluate(() => new Promise((done) => {
    const out = []
    const t0 = performance.now()
    const tick = () => {
      const panel = document.querySelector("[data-sheet-panel]:not([aria-hidden='true'])") || document.querySelector('[data-app-sheet] [data-sheet-panel]')
      const h2 = document.querySelector('[data-app-sheet] h2')
      const r = panel?.getBoundingClientRect()
      out.push({ t: performance.now() - t0, top: r ? r.top : null, title: h2?.textContent ?? null, list: !!document.querySelector('[data-app-sheet] [data-social-platform]:not([hidden])') && !!document.querySelector('[data-app-sheet] [data-social-platform]')?.getClientRects().length })
      if (performance.now() - t0 < 800) requestAnimationFrame(tick)
      else done(out)
    }
    requestAnimationFrame(tick)
  }))
  const cancel = await measure(s, () => tapSel(s, "[data-social-cancel]"), 820)
  const frames = await watch
  const visible = frames.filter((f) => f.top !== null && f.top < 844 - 2)
  expect(visible.every((f) => /edit social link/i.test(f.title || "") && !f.list), "Cancel: the sheet leaves still showing Edit Social Link (never swaps to the platform list on the way)", visible.slice(-3))
  const downs = visible.map((f) => f.top)
  expect(downs.every((v, i) => i === 0 || v >= downs[i - 1] - 0.5), "and only goes down", downs.slice(0, 8).map(Math.round))
  expect(!(await sheetOpen(s.p)), "and is gone")
  console.log(`        Cancel: longest task ${cancel.longest}ms, ${cancel.dropped} dropped, worst gap ${cancel.worst}`)
  expect(cancel.dropped <= 3, "Cancel's close drops at most 3 frames", cancel.dropped)
  expect(s.errors.length === 0, "no errors", s.errors.slice(0, 2))
  await s.p.close()
}

/* ── BRANDS ──────────────────────────────────────────────────────────── */
const markColours = (p, scope) => p.evaluate((scope) => {
  const out = {}
  for (const svg of document.querySelectorAll(`${scope} svg[data-mark]`)) {
    if (!svg.getClientRects().length) continue
    const key = svg.getAttribute("data-mark")
    const path = svg.querySelector("path")
    const box = svg.getBoundingClientRect()
    const fill = path ? getComputedStyle(path).fill : null
    const grad = fill && /url\(/.test(fill) ? document.getElementById(fill.match(/#([^")]+)/)?.[1] || "") : null
    out[key] = { fill, tone: svg.getAttribute("data-tone"), w: Math.round(box.width), h: Math.round(box.height), d: !!path?.getAttribute("d"), gradient: grad ? grad.tagName : null }
  }
  return out
}, scope)
if (wants("brands") && embedsPage) {
  console.log("\nBrand marks in their colours: the picker, the social sheet, the live row")
  const s = await open(DESK, `${embedsPage.base}/app/onepage#links`, { settle: 2500 })
  await openAdd(s)
  await sleep(600)
  await s.p.evaluate(() => document.querySelector('[data-picker-chip="integrations"]').click())
  await sleep(300)
  const picker = await markColours(s.p, "[data-add-block-picker]")
  const want = { youtube: "rgb(255, 0, 0)", spotify: "rgb(30, 215, 96)", twitch: "rgb(145, 70, 255)", loom: "rgb(98, 93, 245)", soundcloud: "rgb(255, 85, 0)" }
  for (const [k, c] of Object.entries(want)) expect(picker[k]?.fill === c, `picker: ${k} in its own colour`, picker[k])
  expect(picker.instagram?.gradient === "radialGradient", "picker: Instagram in its gradient", picker.instagram)
  expect(picker.twitter?.fill === "rgb(26, 26, 46)", "picker: X, a black mark, in the near black", picker.twitter)
  const bad = Object.entries(picker).filter(([, v]) => !v.d || v.w < 10 || v.h < 10)
  expect(Object.keys(picker).length >= 15 && bad.length === 0, "every mark drawn, with a path and a size", { marks: Object.keys(picker).length, bad })
  await shot(s.p, "r11-picker-integrations-1440")
  await s.p.keyboard.press("Escape")
  await sleep(500)
  await s.p.evaluate(() => document.querySelector('[data-social-chip="instagram"]')?.click())
  await sleep(500)
  /* Back to the list of platforms: Cancel, then the + beside the chips. */
  await s.p.keyboard.press("Escape")
  await sleep(700)
  await s.p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.querySelector("svg.lucide-plus") && x.className.includes("w-7 h-7")); b?.click() })
  await sleep(600)
  const social = await markColours(s.p, '[role="dialog"]')
  expect(social.youtube?.fill === "rgb(255, 0, 0)" && social.instagram?.gradient === "radialGradient" && social.whatsapp?.fill === "rgb(37, 211, 102)", "social sheet: the platforms in their colours", { youtube: social.youtube, whatsapp: social.whatsapp })
  expect(!!social.snapchat?.d && social.snapchat.w >= 10 && social.snapchat.fill === "rgb(255, 252, 0)", "social sheet: Snapchat in its yellow, drawn", social.snapchat)
  await shot(s.p, "r11-social-sheet-1440")
  expect(s.errors.length === 0, "no errors", s.errors.slice(0, 2))
  await s.p.close()
}

/* ── EMBEDS, live on storelib.me and in the preview ──────────────────── */
if (wants("embeds") || wants("brands")) {
  console.log("\nEmbeds and the social row on the live page, as served on storelib.me (390)")
  const port = new URL(embedsPage.base).port
  const requested = []
  const ownRequests = []
  const intercept = (req) => {
    const u = new URL(req.url())
    if (EMBED_HOSTS.includes(u.hostname)) {
      requested.push(req.url())
      /* Each service's frame, stood in for: Instagram's says how tall the post is, as the real one does. */
      const say = u.hostname === "www.instagram.com" ? `<script>parent.postMessage(JSON.stringify({type:"MEASURE",details:{height:700}}),"*")</script>` : u.hostname === "platform.twitter.com" ? `<script>parent.postMessage({"twttr.embed":{method:"twttr.private.resize",params:[{height:612,width:550}],id:"0"}},"*")</script>` : ""
      return req.respond({ status: 200, contentType: "text/html", body: `<!doctype html><body style="margin:0;background:#eef">${u.hostname}${say}</body>` })
    }
    if (u.hostname === "storelib.me") {
      ownRequests.push({ url: u, method: req.method() })
      return req.continue()
    }
    if (u.protocol === "data:" || u.protocol === "blob:") return req.continue()
    return req.abort()
  }
  for (const tone of ["brand", "mono"]) {
    const url = `http://storelib.me:${port}/app/onepage?live`
    const s = await open(PHONE, url, { settle: 1500, intercept })
    await s.p.evaluate((tone) => { window.__tone = tone }, tone)
    if (tone === "mono") {
      /* The same page with the choice set to one colour: the live theme is handed in before the bundle runs, so reload with it. */
      await s.p.evaluateOnNewDocument(() => { window.PROBE_LIVE_THEME = { ...(window.PROBE_LIVE_THEME || {}), social_icon_tone: "mono" } })
      await s.p.reload()
      await sleep(1500)
    } else {
      await s.p.evaluateOnNewDocument(() => { window.PROBE_LIVE_THEME = { ...(window.PROBE_LIVE_THEME || {}), social_icon_tone: "brand" } })
      await s.p.reload()
      await sleep(1500)
    }
    const row = await markColours(s.p, "#app")
    if (tone === "brand") {
      expect(row.youtube?.fill === "rgb(255, 0, 0)" && row.instagram?.gradient === "radialGradient" && row.spotify?.fill === "rgb(30, 215, 96)", "live, brand colours: YouTube red, Instagram's gradient, Spotify green", { youtube: row.youtube?.fill, instagram: row.instagram?.gradient, spotify: row.spotify?.fill })
      expect(!!row.snapchat?.d && row.snapchat.fill === "rgb(255, 252, 0)", "live: Snapchat drawn, in its yellow", row.snapchat)
      await shot(s.p, "r11-live-socials-brand-390")
      if (wants("embeds")) {
        /* Down the page, so every lazy frame comes near the screen and loads. */
        for (let y = 0; y < 12000; y += 500) { await s.p.evaluate((y) => scrollTo(0, y), y); await sleep(120) }
        await sleep(800)
        const frames = await s.p.evaluate(() => [...document.querySelectorAll("[data-onepage-embed]")].filter((el) => el.getClientRects().length).map((el) => {
          const f = el.querySelector("iframe")
          const box = f?.parentElement?.getBoundingClientRect()
          return { kind: el.getAttribute("data-onepage-embed"), src: f?.getAttribute("src") ?? null, h: box ? Math.round(box.height) : 0, w: box ? Math.round(box.width) : 0 }
        }))
        for (const [kind, , src] of EMBEDS) {
          const f = frames.find((x) => x.kind === kind)
          expect(!!f && f.src === src && f.h > 100 && f.w > 200, `live: ${kind} in its own frame, at its address`, f)
          expect(requested.some((r) => r === src), `live: ${kind}'s frame was asked for`, src)
        }
        expect(frames.find((f) => f.kind === "instagram")?.h === 700, "live: an Instagram post grows to the height it says", frames.find((f) => f.kind === "instagram")?.h)
        expect(frames.find((f) => f.kind === "x")?.h === 612, "live: an X post too", frames.find((f) => f.kind === "x")?.h)
        await s.p.evaluate(() => [...document.querySelectorAll('[data-onepage-embed="twitch"]')].find((e) => e.getClientRects().length)?.scrollIntoView({ block: "start" }))
        await sleep(300)
        await shot(s.p, "r11-live-embeds-390")
        const judged = ownRequests.map((r) => ({ path: r.url.pathname, method: r.method, ...answersOnMe(r.url, r.method) }))
        /* The calls the page makes (fetches to /api) must be answered on storelib.me; a picture redirected to storelib.com still draws. */
        const calls = judged.filter((j) => j.path.startsWith("/api/"))
        const refused = calls.filter((j) => !j.ok)
        console.log(`        the page's own requests on storelib.me: ${judged.map((j) => `${j.method} ${j.path} -> ${j.kind}`).filter((v, i, a) => a.indexOf(v) === i).join(", ")}`)
        expect(refused.length === 0, "the embeds and the row add no call storelib.me would refuse (their frames load from each service, not from storelib.me)", { calls: calls.length, refused: refused.slice(0, 3) })
      }
    } else {
      const marks = Object.values(row)
      expect(marks.length > 0 && marks.every((m) => m.tone !== "brand"), "live, one colour: no mark in a brand colour (a page saved before the choice looks as it did)", Object.fromEntries(Object.entries(row).slice(0, 3)))
      await shot(s.p, "r11-live-socials-mono-390")
    }
    expect(s.errors.length === 0, `live (${tone}): no errors`, s.errors.slice(0, 2))
    await s.p.close()
  }
  if (wants("embeds")) {
    console.log("\nThe same embeds in the editor's preview (1440)")
    const s = await open(DESK, `${embedsPage.base}/app/onepage#links`, { settle: 3000, intercept: (req) => {
      const u = new URL(req.url())
      if (EMBED_HOSTS.includes(u.hostname)) return req.respond({ status: 200, contentType: "text/html", body: `<!doctype html><body style="margin:0;background:#eef">${u.hostname}</body>` })
      return req.continue()
    } })
    const frame = s.p.frames().find((f) => f.url().includes("/onepage-preview"))
    expect(!!frame, "the preview's frame is there")
    if (frame) {
      const kinds = await frame.evaluate(() => [...document.querySelectorAll("[data-onepage-embed]")].map((el) => ({ kind: el.getAttribute("data-onepage-embed"), src: el.querySelector("iframe")?.getAttribute("src") ?? null })))
      for (const [kind, , src] of EMBEDS) {
        const f = kinds.find((k) => k.kind === kind)
        const want = kind === "twitch" ? src.replace("parent=storelib.me", "parent=127.0.0.1") : src
        expect(!!f && f.src === want, `preview: ${kind} drawn as on the live page`, f)
      }
    }
    /* The blocks list names each embed by its service. */
    const rows = await s.p.evaluate(() => [...document.querySelectorAll("[data-block-id]")].map((e) => e.textContent.replace(/\s+/g, " ").trim().slice(0, 40)))
    expect(rows.some((r) => /Instagram/.test(r)) && rows.some((r) => /Google Calendar/.test(r)), "the blocks list names each embed by its service", rows.slice(2, 6))
    await shot(s.p, "r11-editor-embeds-1440")
    expect(s.errors.length === 0, "no errors", s.errors.slice(0, 2))
    await s.p.close()
  }
}

/* ── ICONS: Choose icon ──────────────────────────────────────────────── */
if (wants("icons")) {
  console.log("\nChoose icon, 390, touch, CPU 4x")
  const s = await open(PHONE, `${after.base}/app/onepage#links`, { cpu: 4, settle: 7000 })
  const thumb = `(() => { const b = [...document.querySelectorAll("[data-scroll-container] button.w-10.h-10.shrink-0.overflow-hidden")].find((e) => e.getClientRects().length); if (b) b.click(); return !!b })()`
  const thumbFound = await s.p.evaluate(thumb)
  await sleep(900)
  const thumbSheet = await s.p.evaluate(() => ({ open: !!document.querySelector('[data-app-sheet="open"]'), title: document.querySelector('[data-app-sheet="open"] h2')?.textContent ?? null, buttons: [...document.querySelectorAll('[data-app-sheet="open"] button')].map((b) => b.textContent.trim().slice(0, 20)) }))
  expect(thumbFound && thumbSheet.open, "a link's thumbnail opens its sheet", thumbSheet)
  const choose = await measure(s, () => s.p.evaluate(() => { const b = [...document.querySelectorAll('[data-app-sheet="open"] button')].find((x) => /choose icon/i.test(x.textContent)); b?.click() }), 900)
  const lib = await s.p.evaluate(() => { const g = [...document.querySelectorAll("[data-icon-library]")].find((e) => e.getClientRects().length && e.closest('[data-app-sheet="open"]')); return g ? { rows: Number(g.querySelector("[data-icon-rows]")?.getAttribute("data-icon-rows") || 0), tiles: g.querySelectorAll("[data-icon-tile]").length } : { rows: 0, tiles: 0 } })
  console.log(`        Choose icon: longest task ${choose.longest}ms, ${choose.dropped} dropped; ${lib.rows} rows of 5, ${lib.tiles} tiles in the document`)
  expect(lib.rows * 5 >= 170 && lib.tiles > 20 && lib.tiles <= 80, "the library holds every icon, with only the rows near the screen built", lib)
  expect(choose.longest <= 60 && choose.dropped <= 4, "and opens light: task under 60ms, at most 4 frames dropped", choose)
  /* Search. */
  await s.p.evaluate(() => { const i = [...document.querySelectorAll("[data-icon-search]")].find((e) => e.getClientRects().length); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "money"); i.dispatchEvent(new Event("input", { bubbles: true })) })
  await sleep(300)
  const found = await s.p.evaluate(() => [...document.querySelectorAll('[data-app-sheet="open"] [data-icon-tile]')].map((e) => e.getAttribute("data-icon-tile")))
  expect(found.includes("dollar") && found.length < 15, "a search for money finds the dollar", found)
  await s.p.evaluate(() => { const i = [...document.querySelectorAll("[data-icon-search]")].find((e) => e.getClientRects().length); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })) })
  await sleep(200)
  const sw = await measure(s, () => tapSel(s, '[data-app-sheet="open"] [data-icon-chip="platforms"]'), 500)
  console.log(`        Platforms chip: longest task ${sw.longest}ms, ${sw.dropped} dropped`)
  /* A scroll through the grid by a finger. */
  await s.p.evaluate(() => { const i = [...document.querySelectorAll('[data-icon-chip="all"]')].find((e) => e.getClientRects().length); i.click() })
  await sleep(300)
  const g = await center(s.p, '[data-app-sheet="open"] [data-icon-grid]')
  const sc = await measure(s, async () => {
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: g.x, y: g.y + 120 }] })
    for (let k = 1; k <= 14; k++) { await s.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: g.x, y: g.y + 120 - k * 22 }] }); await sleep(16) }
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }, 600)
  await sleep(300)
  const scrolled = await s.p.evaluate(() => [...document.querySelectorAll("[data-icon-grid]")].find((e) => e.getClientRects().length).scrollTop)
  /* Nothing blank where the finger left the grid: the tiles cover the scroller's visible rows. */
  const covered = await s.p.evaluate(() => {
    const sc = [...document.querySelectorAll("[data-icon-grid]")].find((e) => e.getClientRects().length)
    const r = sc.getBoundingClientRect()
    const tiles = [...sc.querySelectorAll("[data-icon-tile]")].map((t) => t.getBoundingClientRect())
    const ys = [r.top + 20, r.top + r.height / 2, r.bottom - 40]
    return ys.every((y) => tiles.some((t) => t.top <= y && t.bottom + 8 >= y))
  })
  expect(covered, "after the scroll, the rows on screen are there (no blank band)")
  console.log(`        a scroll of the grid: ${Math.round(scrolled)}px, longest task ${sc.longest}ms, ${sc.dropped} dropped`)
  expect(scrolled > 100 && sc.dropped <= 4, "the grid scrolls under a finger, at most 4 frames dropped in the whole fling at 4x", { scrolled, dropped: sc.dropped })
  await shot(s.p, "r11-icon-library-390")
  await s.p.evaluate(() => { const i = [...document.querySelectorAll('[data-icon-chip="platforms"]')].find((e) => e.getClientRects().length); i.click() })
  await sleep(300)
  await tapSel(s, '[data-app-sheet="open"] [data-icon-tile="instagram"]')
  await sleep(1000)
  const landed = await s.p.evaluate(() => ({ open: !!document.querySelector('[data-app-sheet="open"]'), mark: !!document.querySelector('[data-scroll-container] [data-block-id] svg[data-mark="instagram"]') }))
  expect(!landed.open, "choosing an icon closes the sheets", landed)
  expect(landed.mark, "and the link wears it at once in the blocks list", landed)
  const frame = s.p.frames().find((f) => f.url().includes("/onepage-preview"))
  if (frame) {
    await sleep(800)
    const inPreview = await frame.evaluate(() => !!document.querySelector('svg[data-mark="instagram"]'))
    expect(inPreview, "and in the preview")
  }
  expect(s.errors.length === 0, "no errors", s.errors.slice(0, 2))
  await s.p.close()
}

await browser.close()
await deskBrowser?.close()
for (const x of [after, embedsPage, before]) x?.server.close()
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
