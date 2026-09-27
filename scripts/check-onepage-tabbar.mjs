/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S PHONE TAB BAR AND THE THEME KINDS, MEASURED
 * ===========================================================================
 * Three things the owner reported from a phone:
 *
 *   WORDS     "The text overlaps in the buttons": Design and Settings had the
 *             tails of their g cut off. For every button, at every width, the
 *             word's text box (a Range over it, descenders included) against
 *             the box that clips it and against the button's inside, the room
 *             above the icon and under the word, and a pixel check: the bar
 *             photographed as drawn and again with nothing allowed to clip
 *             the words must be the same picture. Also at 125% text, which is
 *             what a phone set to larger text does to these words.
 *
 *   SWITCH    "No slide-in slide effect": the dark pill travelled between the
 *             buttons. Every frame of a switch: where each button and each
 *             dark fill is (nothing may move sideways), which properties are
 *             animating in the bar (opacity only, and scale under a press),
 *             how long the fill takes to arrive, whether the tab under it
 *             moves at all, and that with reduced motion it is instant.
 *
 *   KINDS     "The categories of the themes (All, Light, Dark, Gradient,
 *             Image)... make sure they don't shift layout on click." Every
 *             pill and the row, before, during (every frame) and after each
 *             pick, at the top of the page and scrolled; the panel's scroll;
 *             layout shifts that touch the pills; the cards' 4:5 pictures.
 *
 * The real editor (scripts/onepage-probe-server.mjs) at 320, 360, 390 and
 * 430 wide. Pictures go to SHOTS (or a temp folder, printed).
 *
 *   node scripts/check-onepage-tabbar.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-tabbar.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
import { interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-tabbar-"))
mkdirSync(shots, { recursive: true })
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const numbers = {}

const { base, server } = await serveEditorProbe({ root, fail })
/*
  Inter itself, not a fallback: the question is where Inter's descenders
  fall. The probe server's faces point at file:// urls a page served over
  http may not load, so they are put in as data urls here.
*/
const INTER = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  try { return `url(data:font/woff2;base64,${readFileSync(path).toString("base64")})` } catch { return "url()" }
})
if (!INTER) console.log("  ....  no build of Inter found: the words are measured in the fallback font")
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

const phone = (width) => ({ width, height: width >= 430 ? 932 : width >= 390 ? 844 : width >= 360 ? 780 : 640, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })

async function open(vp, hash) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.evaluateOnNewDocument(() => {
    window.__shifts = []
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__shifts.push({
        t: e.startTime, value: e.value, recentInput: e.hadRecentInput,
        nodes: (e.sources || []).map((s) => s.node && s.node.nodeType === 1 ? (s.node.closest("[data-theme-filters]") ? "pills" : s.node.closest("[data-theme-grid]") ? "grid" : s.node.tagName.toLowerCase()) : "text"),
      }))).observe({ type: "layout-shift", buffered: true })
    } catch { /* no layout shift entries in this browser */ }
  })
  await p.goto(`${base}/app/onepage#${hash}`)
  if (INTER) await p.addStyleTag({ content: INTER })
  await p.waitForSelector("[data-onepage-tabbar] [data-tab]")
  await p.evaluate(() => document.fonts.ready)
  await sleep(900)
  return { p, errors }
}

/* ─────────────────────────────── WORDS ─────────────────────────────── */

const READ_BAR = () => {
  const bar = document.querySelector("[data-onepage-tabbar]")
  const round = (n) => Math.round(n * 100) / 100
  return [...bar.querySelectorAll("[data-tab]")].map((b) => {
    const br = b.getBoundingClientRect()
    const cs = getComputedStyle(b)
    const inner = { top: br.top + parseFloat(cs.borderTopWidth), bottom: br.bottom - parseFloat(cs.borderBottomWidth), left: br.left + parseFloat(cs.borderLeftWidth), right: br.right - parseFloat(cs.borderRightWidth) }
    /* Each button draws its face twice (grey and white) to crossfade: the one showing. */
    const words = [...b.querySelectorAll("[data-tab-word]")]
    const word = words.find((w) => Number(getComputedStyle(w.parentElement.parentElement).opacity) > 0.5) || words[0]
    const range = document.createRange()
    range.selectNodeContents(word)
    const text = range.getBoundingClientRect()
    const clip = word.getBoundingClientRect()
    const icon = word.parentElement.querySelector("svg").getBoundingClientRect()
    return {
      id: b.getAttribute("data-tab"),
      word: word.textContent,
      pressed: b.getAttribute("aria-pressed") === "true",
      w: round(br.width), h: round(br.height), left: round(br.left),
      /* The word's text box against the box that clips it: negative is cut off. */
      clipBelow: round(clip.bottom - text.bottom), clipAbove: round(text.top - clip.top),
      /* Room inside the button's border, under the word and over the icon. */
      roomBelow: round(inner.bottom - text.bottom), roomAbove: round(icon.top - inner.top),
      sideRoom: round(Math.min(text.left - inner.left, inner.right - text.right)),
      truncated: word.scrollWidth > word.clientWidth + 0.5,
      fontSize: parseFloat(getComputedStyle(word).fontSize),
    }
  })
}

const LARGE_TEXT = "[data-onepage-tabbar] [data-tab] { font-size: 14.375px !important }"
const widthRows = []
for (const width of [320, 360, 390, 430]) {
  for (const scale of [1, 1.25]) {
    const label = `${width}${scale === 1 ? "" : " at 125% text"}`
    console.log(`\n── the bar's words, ${label} ──`)
    const { p, errors } = await open(phone(width), "design")
    if (scale !== 1) { await p.addStyleTag({ content: LARGE_TEXT }); await sleep(200) }
    const rows = await p.evaluate(READ_BAR)
    const face = await p.evaluate(() => ({ inter: [...document.fonts].filter((f) => f.family.replace(/"/g, "") === "Inter" && f.status === "loaded").length, family: getComputedStyle(document.querySelector("[data-tab-word]")).fontFamily.split(",")[0] }))
    if (width === 320 && scale === 1) console.log(`  ....  drawn in ${face.family}, ${face.inter} Inter faces loaded`)
    widthRows.push({ label, rows })
    console.log(`  ${rows.map((r) => `${r.word} ${r.w}x${r.h} below ${r.roomBelow} above ${r.roomAbove} sides ${r.sideRoom}${r.truncated ? " (ellipsis)" : ""}`).join(" | ")}`)
    expect(rows.length === 4 && rows.map((r) => r.word).join() === "Links,Design,Products,Settings", "four buttons, each with its word", rows.map((r) => r.word))
    expect(rows.every((r) => r.clipBelow >= 0 && r.clipAbove >= 0), "no word's text box, descenders included, is cut by the box around it", rows.map((r) => [r.word, r.clipBelow, r.clipAbove]))
    expect(rows.every((r) => r.roomBelow >= (scale === 1 ? 6 : 4) && r.roomAbove >= (scale === 1 ? 6 : 4)), `${scale === 1 ? 6 : 4}px or more inside the button under each word and over each icon`, rows.map((r) => [r.word, r.roomBelow, r.roomAbove]))
    if (scale === 1) expect(rows.every((r) => !r.truncated && r.sideRoom >= 2), "every word whole, with room either side", rows.map((r) => [r.word, r.truncated, r.sideRoom]))
    else expect(rows.every((r) => r.sideRoom >= 0), "a word too wide ends in an ellipsis inside its button, never over its edge", rows.map((r) => [r.word, r.truncated, r.sideRoom]))
    expect(Math.max(...rows.map((r) => r.w)) - Math.min(...rows.map((r) => r.w)) < 1 && rows.every((r) => r.h === 54), "four equal buttons, 54px tall", rows.map((r) => [r.w, r.h]))
    const side = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    expect(!side, "nothing scrolls sideways")

    /* The pixel check: drawn as it is, and drawn with nothing allowed to clip a word, must be one picture. */
    const box = await p.evaluate(() => { const r = document.querySelector("[data-tab-row=phone]").getBoundingClientRect(); return { x: 0, y: r.top - 2, width: innerWidth, height: r.height + 4 } })
    const asIs = await p.screenshot({ clip: box })
    await p.evaluate(() => document.querySelectorAll("[data-tab-word]").forEach((w) => { w.dataset.was = w.style.cssText; w.style.overflow = "visible"; w.style.textOverflow = "clip" }))
    await sleep(60)
    const open_ = await p.screenshot({ clip: box })
    await p.evaluate(() => document.querySelectorAll("[data-tab-word]").forEach((w) => { w.style.cssText = w.dataset.was }))
    const anyTruncated = rows.some((r) => r.truncated)
    if (!anyTruncated) expect(asIs.equals(open_), "pixel check: the bar with its words unclipped is the same picture, so no ink was cut off")
    else console.log("  ....  pixel check skipped: a word ends in an ellipsis here, which unclipping would change")
    await p.screenshot({ path: join(shots, `bar-${width}${scale === 1 ? "" : "-large-text"}.png`), clip: { x: 0, y: box.y - 20, width: box.width, height: box.height + 40 } })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
}
numbers.words = widthRows

/* ─────────────────────────────── SWITCH ─────────────────────────────── */

const SAMPLE_BAR = () => {
  const bar = document.querySelector("[data-onepage-tabbar]")
  const buttons = [...bar.querySelectorAll("[data-tab]")]
  const props = new Set()
  for (const a of bar.getAnimations({ subtree: true })) {
    if (a.transitionProperty) props.add(a.transitionProperty)
    else a.effect?.getKeyframes?.().forEach((k) => Object.keys(k).forEach((key) => { if (!["offset", "easing", "composite", "computedOffset"].includes(key)) props.add(key) }))
  }
  const panel = document.querySelector("[data-tab-panel][data-scroll-container]")
  const pr = panel?.getBoundingClientRect()
  return {
    t: performance.now(),
    xs: buttons.map((b) => Math.round(b.getBoundingClientRect().left * 10) / 10),
    fills: buttons.map((b) => { const f = b.querySelector("[data-tab-fill]"); const r = f.getBoundingClientRect(); return { x: Math.round(r.left * 10) / 10, o: Number(getComputedStyle(f).opacity) } }),
    props: [...props],
    pill: !!bar.querySelector("[data-tab-pill]"),
    panel: pr ? { id: panel.getAttribute("data-tab-panel"), x: Math.round(pr.left * 10) / 10, y: Math.round(pr.top * 10) / 10, transform: getComputedStyle(panel).transform } : null,
  }
}
const record = (p, ms) => p.evaluate((ms, fn) => new Promise((resolve) => {
  const sample = new Function(`return (${fn})()`)
  const out = []
  const t0 = performance.now()
  const tick = () => { out.push(sample()); performance.now() - t0 < ms ? requestAnimationFrame(tick) : resolve(out) }
  requestAnimationFrame(tick)
}), ms, SAMPLE_BAR.toString())

const switchRows = []
for (const width of [360, 390, 430]) {
  console.log(`\n── switching tabs, ${width} ──`)
  const { p, errors } = await open(phone(width), "links")
  const order = ["design", "products", "settings", "links"]
  const tabIndex = { links: 0, design: 1, products: 2, settings: 3 }
  for (const to of order) {
    const rec = record(p, 420)
    await sleep(20)
    const t = await p.evaluate((to) => { const t = performance.now(); document.querySelector(`[data-onepage-tabbar] [data-tab="${to}"]`).click(); return t }, to)
    const frames = await rec
    const after = frames.filter((f) => f.t >= t)
    const i = tabIndex[to]
    const xsMoved = new Set(after.map((f) => f.xs.join())).size > 1
    const fillsMoved = new Set(after.map((f) => f.fills.map((x) => x.x).join())).size > 1
    const props = [...new Set(after.flatMap((f) => f.props))]
    const reached = after.find((f) => f.fills[i].o >= 0.999)
    const firstChange = after.find((f) => f.fills[i].o > 0.001)
    const inbetween = after.filter((f) => f.fills[i].o > 0.02 && f.fills[i].o < 0.98).length
    const panelXs = new Set(after.filter((f) => f.panel).map((f) => `${f.panel.x}|${f.panel.y}|${f.panel.transform}`))
    const row = {
      to, frames: after.length, crossfadeMs: reached ? Math.round(reached.t - t) : null, startsAfterMs: firstChange ? Math.round(firstChange.t - t) : null,
      inbetween, props, xsMoved, fillsMoved, pill: after.some((f) => f.pill), panelPlaces: panelXs.size,
    }
    switchRows.push({ width, ...row })
    console.log(`  to ${to.padEnd(9)} fill in ${row.crossfadeMs}ms over ${inbetween} in between frames, animating [${props.join(", ")}], panel places ${row.panelPlaces}`)
    await sleep(250)
  }
  const mine = switchRows.filter((r) => r.width === width)
  expect(mine.every((r) => !r.pill), "no pill in the bar")
  expect(mine.every((r) => !r.xsMoved && !r.fillsMoved), "no button and no dark fill moves sideways in any frame")
  expect(mine.every((r) => r.props.every((k) => k === "opacity" || k === "scale")), "only opacity animates in the bar (scale under a press)", mine.map((r) => r.props))
  expect(mine.every((r) => r.crossfadeMs !== null && r.crossfadeMs >= 100 && r.crossfadeMs <= 240 && r.inbetween >= 2), "the chosen fill crossfades in place over about 140ms, seen in between", mine.map((r) => [r.crossfadeMs, r.inbetween]))
  expect(mine.every((r) => r.panelPlaces === 1), "the tab under the bar does not move while it changes (a fade in place)", mine.map((r) => r.panelPlaces))

  /* A press gives under the thumb: scale on :active. */
  const c = await p.$eval('[data-onepage-tabbar] [data-tab="products"]', (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await p.mouse.move(c.x, c.y)
  await p.mouse.down()
  await sleep(200)
  const pressed = await p.$eval('[data-onepage-tabbar] [data-tab="products"]', (el) => getComputedStyle(el).scale)
  if (width === 390) {
    await p.screenshot({ path: join(shots, `bar-${width}-pressed.png`), clip: { x: 0, y: (await p.evaluate(() => innerHeight)) - 110, width, height: 110 } })
  }
  await p.mouse.up()
  await sleep(250)
  const released = await p.$eval('[data-onepage-tabbar] [data-tab="products"]', (el) => getComputedStyle(el).scale)
  expect(pressed === "0.96" && (released === "none" || released === "1"), "a press scales the button to 0.96, and it comes back", { pressed, released })

  /* Mid crossfade, slowed ten times, for the eye. */
  if (width === 390) {
    const cdp = await p.target().createCDPSession()
    await cdp.send("Animation.enable")
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 })
    await p.evaluate(() => document.querySelector('[data-onepage-tabbar] [data-tab="design"]').click())
    await sleep(700)
    await p.screenshot({ path: join(shots, `bar-${width}-mid-crossfade.png`), clip: { x: 0, y: (await p.evaluate(() => innerHeight)) - 110, width, height: 110 } })
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
    await sleep(300)
  }

  /* Reduced motion: the fill is there on the next frame. */
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const instant = await p.evaluate(() => new Promise((resolve) => {
    document.querySelector('[data-onepage-tabbar] [data-tab="links"]').click()
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const b = document.querySelector('[data-onepage-tabbar] [data-tab="links"]')
      resolve({ fill: Number(getComputedStyle(b.querySelector("[data-tab-fill]")).opacity), anims: document.querySelector("[data-onepage-tabbar]").getAnimations({ subtree: true }).length })
    }))
  }))
  expect(instant.fill === 1 && instant.anims === 0, "with reduced motion the chosen fill is simply there, nothing animating", instant)
  await p.emulateMediaFeatures([])
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}
numbers.switch = switchRows

/* ─────────────────────────────── KINDS ─────────────────────────────── */

const READ_PILLS = () => {
  const row = document.querySelector("[data-theme-filters]")
  const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left * 100) / 100, Math.round(b.top * 100) / 100, Math.round(b.width * 100) / 100, Math.round(b.height * 100) / 100] }
  const box = row.closest("[data-tab-panel]")
  return {
    row: r(row),
    pills: [...row.querySelectorAll("[data-theme-filter]")].map((b) => ({ id: b.getAttribute("data-theme-filter"), at: r(b), on: b.getAttribute("aria-selected") === "true" })),
    rowScroll: row.scrollLeft,
    scrollTop: box ? box.scrollTop : null,
    cards: document.querySelectorAll("[data-theme-card]").length,
  }
}
const samePlace = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 0.5)
const kindRows = []
for (const width of [360, 390, 430]) {
  console.log(`\n── the Theme kinds, ${width} ──`)
  const { p, errors } = await open(phone(width), "design")
  await p.click('[data-nav-row="theme"]')
  await p.waitForSelector("[data-theme-filters]")
  await sleep(900)

  /* The cards' pictures: 4:5, all the same size. */
  const cards = await p.evaluate(() => [...document.querySelectorAll("[data-theme-card]")].map((c) => { const pic = c.querySelector("span.relative"); const r = pic.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, card: Math.round(c.getBoundingClientRect().height * 10) / 10 } }))
  expect(cards.length >= 18 && cards.every((c) => Math.abs(c.w / c.h - 0.8) < 0.01) && new Set(cards.map((c) => c.card)).size === 1, "every theme card's picture is 4:5 and every card one height", { n: cards.length, first: cards[0], heights: [...new Set(cards.map((c) => c.card))] })

  for (const [where, scrollTo] of [["at the top", 0], ["scrolled", "pills"]]) {
    if (scrollTo === "pills") {
      /* Scrolled so the pills sit 8px under the top of the panel: as far down as they can still be pressed. */
      await p.evaluate(() => {
        const row = document.querySelector("[data-theme-filters]")
        const box = row.closest("[data-tab-panel]")
        box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - 8
      })
    } else {
      await p.evaluate(() => { document.querySelector("[data-theme-filters]").closest("[data-tab-panel]").scrollTop = 0 })
    }
    await sleep(300)
    for (const kind of ["light", "dark", "gradient", "image", "all", "image", "light", "all"]) {
      const before = await p.evaluate(READ_PILLS)
      await p.evaluate(() => { window.__shifts = [] })
      const rec = p.evaluate(() => new Promise((resolve) => {
        const out = []
        const read = () => [...document.querySelectorAll("[data-theme-filter]")].map((b) => { const r = b.getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })
        const t0 = performance.now()
        const tick = () => { out.push(read()); performance.now() - t0 < 360 ? requestAnimationFrame(tick) : resolve(out) }
        requestAnimationFrame(tick)
      }))
      await sleep(20)
      const at = before.pills.find((x) => x.id === kind).at
      await p.mouse.click(at[0] + at[2] / 2, at[1] + at[3] / 2)
      const frames = await rec
      await sleep(80)
      const after = await p.evaluate(READ_PILLS)
      const shifts = await p.evaluate(() => window.__shifts)
      const worst = Math.max(0, ...frames.flatMap((f) => f.map((r, i) => Math.max(...r.map((v, k) => Math.abs(v - before.pills[i].at[k]))))))
      const row = {
        width, where, kind,
        still: before.pills.every((x, i) => samePlace(x.at, after.pills[i].at)) && samePlace(before.row, after.row),
        worstFramePx: Math.round(worst * 100) / 100,
        scroll: [before.scrollTop, after.scrollTop],
        rowScroll: [before.rowScroll, after.rowScroll],
        picked: after.pills.find((x) => x.on)?.id,
        cards: after.cards,
        pillShift: shifts.filter((s) => s.nodes.includes("pills")).reduce((a, s) => a + s.value, 0),
        cls: Math.round(shifts.reduce((a, s) => a + s.value, 0) * 10000) / 10000,
        clsNoInput: Math.round(shifts.filter((s) => !s.recentInput).reduce((a, s) => a + s.value, 0) * 10000) / 10000,
      }
      kindRows.push(row)
      if (width === 390 && where === "scrolled" && (kind === "image" || kind === "all")) {
        await sleep(200)
        await p.screenshot({ path: join(shots, `theme-kinds-${width}-${where.replace(" ", "-")}-${kind}-${kindRows.length}.png`) })
      }
      await sleep(150)
    }
    const mine = kindRows.filter((r) => r.width === width && r.where === where)
    console.log(`  ${where}: ${mine.map((r) => `${r.kind} ${r.cards} cards, worst ${r.worstFramePx}px, scroll ${r.scroll.join("→")}, CLS ${r.cls}`).join(" | ")}`)
    expect(mine.every((r) => r.picked === r.kind), "each pick is the one lit", mine.map((r) => r.picked))
    expect(mine.every((r) => r.still && r.worstFramePx <= 0.5), `${where}: no pill and not the row moves, in any frame of any pick`, mine.map((r) => r.worstFramePx))
    expect(mine.every((r) => r.scroll[0] === r.scroll[1] && r.rowScroll[0] === r.rowScroll[1]), `${where}: the panel stays where it was scrolled`, mine.map((r) => r.scroll))
    expect(mine.every((r) => r.pillShift === 0), `${where}: no layout shift touches the pills`, mine.map((r) => r.pillShift))
    if (where === "scrolled") {
      /* The room held under a short kind goes as the panel is scrolled back up. */
      await p.evaluate(() => document.querySelector('[data-theme-filter="image"]').click())
      await sleep(250)
      const held = await p.evaluate(() => { const g = document.querySelector("[data-theme-grid]"); return { min: g.style.minHeight, h: g.offsetHeight } })
      await p.evaluate(() => { document.querySelector("[data-theme-filters]").closest("[data-tab-panel]").scrollTop = 0 })
      await sleep(250)
      const let_ = await p.evaluate(() => { const g = document.querySelector("[data-theme-grid]"); const cards = [...g.children].map((c) => c.getBoundingClientRect()); return { min: g.style.minHeight, h: g.offsetHeight, cards: Math.round(Math.max(...cards.map((c) => c.bottom)) - g.getBoundingClientRect().top) } })
      expect(held.min !== "" && let_.min === "" && Math.abs(let_.h - let_.cards) <= 1, "the room held under a short kind is let go once the panel is back at the top", { held, after: let_ })
      await p.evaluate(() => document.querySelector('[data-theme-filter="all"]').click())
      await sleep(250)
    }
  }
  expect(errors.length === 0, "no page errors", errors)
  await p.close()
}
numbers.kinds = kindRows

writeFileSync(join(shots, "numbers.json"), JSON.stringify(numbers, null, 2))
await browser.close()
server.close()
console.log(`\npictures and numbers in ${shots}`)
if (broken) fail(`${broken} check${broken === 1 ? "" : "s"} failed`)
console.log("\nall checks passed")
