/**
 * ===========================================================================
 *  EXPLORE: THE LOADING SCREEN, THE MORE PICKER AND THE FILTERS, MEASURED
 * ===========================================================================
 * Renders the real ExplorePageClient and the real loading screen
 * (scripts/render-explore-page.tsx) against the app's stylesheet, at 390px
 * and at 1280px, and checks what the owner asked for as numbers:
 *
 *   THE LOADING SCREEN IS THE PAGE. The hero's heading and search field, the
 *   pill row, the Filters button and the first row of cards sit at the same
 *   place in both, to within a pixel, and a card placeholder is the height
 *   of a real card.
 *
 *   THE MORE PICKER is a panel under the pill on a computer and the shared
 *   sheet on a phone. Its rows carry no icons (a chevron or a tick, drawn,
 *   and nothing else). A category with subcategories opens into a level of
 *   its own that slides in from the right by transform, and back slides it
 *   out; the sheet's top edge does not move while it does. The sheet follows
 *   the finger one to one and a pull closes it. A pick chooses and closes.
 *
 *   THE FILTERS are two questions, applied the moment they are answered, in
 *   a panel on a computer and the sheet on a phone.
 *
 * Screenshots of every state go to SHOTS_DIR (a temporary folder by default).
 *
 *   node scripts/check-explore-browse.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".explore-browse-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-explore-browse-")), "shots")
mkdirSync(shots, { recursive: true })

writeFileSync(join(stubs, "navigation.js"), `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/explore"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(window.__search || "")
export const useParams = () => ({ category: window.__category })
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, className, style, ...rest }) {
  return React.createElement("img", { src, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`)

execFileSync("npx", [
  "esbuild", "scripts/render-explore-page.tsx", "--bundle", "--format=iife", "--jsx=automatic",
  '--define:process.env.NODE_ENV="production"', "--alias:@=.",
  "--banner:js=var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;",
  "--alias:next/navigation=./.explore-browse-probe/navigation.js",
  "--alias:next/link=./.explore-browse-probe/link.jsx",
  "--alias:next/image=./.explore-browse-probe/image.jsx",
  "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  `--outfile=${join(stubs, "app.js")}`, "--log-level=error",
], { cwd: root, stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
const js = readFileSync(join(stubs, "app.js"), "utf8")
writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const url = (mode) => `file://${join(stubs, "index.html")}#${mode}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

/* ── geometry both screens share ── */
const GEOMETRY = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } }
  const heading = document.querySelector("main section p")
  const field = document.querySelector("main form[role=search] input")
  const pillsRow = document.querySelector("[data-category-pills-row], [data-skeleton-pills-row]")
  const pills = pillsRow ? [...pillsRow.children].map(r) : []
  const filters = document.querySelector("[data-filters-button], [data-skeleton-filters]")
  const grid = document.querySelector("[data-skeleton-grid]") || [...document.querySelectorAll("main .grid")].find((g) => g.className.includes("lg:grid-cols-3"))
  const cards = grid ? [...grid.children].slice(0, 3).map(r) : []
  return { heading: r(heading), field: r(field), pills, filters: r(filters), cards, docWidth: document.documentElement.scrollWidth, vw: innerWidth }
})()`

async function open(vp, mode) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(url(mode))
  await p.evaluate(() => document.fonts.ready)
  await sleep(500)
  if (errors.length) fail(`The ${mode} page threw: ${errors[0]}`)
  return p
}

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1280, height: 900, deviceScaleFactor: 1 }

/*
  THE PUSH BETWEEN LEVELS, READ EVERY FRAME. `how` is what starts it: "tap"
  (a pointer down on the row, then the click 80ms later, as a finger does),
  "key" (the row focused and ArrowRight, which has no press before it), or
  "back" (the back row). Both lists' x, the veil, the sheet's top and every
  frame's gap, plus any long task while it runs.
*/
async function push(p, how, group = "design") {
  return p.evaluate(async (how, group) => {
    const host = document.querySelector("[data-app-sheet] [data-sheet-panel]") || document.querySelector("[data-category-panel]")
    const sub = host.querySelector("[data-browse-level=sub]")
    const root = host.querySelector("[data-browse-level=root]")
    const veil = host.querySelector("[data-browse-veil]")
    const width = root.getBoundingClientRect().width
    const x = (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41
    const long = []
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push({ at: Math.round(e.startTime), d: Math.round(e.duration) }) })
    try { po.observe({ type: "longtask" }) } catch {}
    const frames = []
    const t0 = performance.now()
    const done = new Promise((resolve) => {
      const tick = (t) => {
        frames.push({ t: t - t0, sub: x(sub), root: x(root), veil: Number(getComputedStyle(veil).opacity), top: host.getBoundingClientRect().top })
        if (performance.now() - t0 < 900) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    const row = host.querySelector(`[data-browse-group="${group}"]`)
    let pressed = t0
    if (how === "tap") {
      row.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", isPrimary: true }))
      await new Promise((r) => setTimeout(r, 80))
      pressed = performance.now() - t0
      row.click()
    } else if (how === "key") {
      row.focus()
      pressed = performance.now() - t0
      row.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    } else {
      pressed = performance.now() - t0
      host.querySelector("[data-browse-back]").click()
    }
    await done
    po.disconnect()
    return { width, frames, long: long.map((l) => ({ ...l, at: Math.round(l.at - t0) })), pressed: Math.round(pressed) }
  }, how, group)
}

/* What a push measured says: when it moved, how long, whether every value only ever went one way, and the frames. */
function readPush(m, inward) {
  const { width, frames } = m
  const off = (f) => (inward ? f.sub < width - 0.5 : f.sub > 0.5)
  const home = (f) => (inward ? f.sub <= 0.5 : f.sub >= width - 0.5)
  const s = frames.findIndex(off)
  const e = frames.findIndex((f, i) => i > s && home(f))
  const moving = s >= 0 && e > s ? frames.slice(s, e + 1) : []
  const dir = inward ? -1 : 1
  const oneWay = (k, sign) => moving.every((f, i) => i === 0 || (f[k] - moving[i - 1][k]) * sign >= -0.5)
  const gaps = moving.slice(1).map((f, i) => f.t - moving[i].t).sort((a, b) => a - b)
  const last = frames[frames.length - 1]
  return {
    startedAfterPress: s >= 0 ? Math.round(frames[s].t - m.pressed) : null,
    ms: moving.length ? Math.round(moving[moving.length - 1].t - moving[0].t) : 0,
    frames: moving.length,
    maxGap: gaps.length ? Math.round(gaps[gaps.length - 1]) : null,
    p95Gap: gaps.length ? Math.round(gaps[Math.floor(gaps.length * 0.95) - 1] ?? gaps[gaps.length - 1]) : null,
    subOneWay: oneWay("sub", dir),
    rootOneWay: oneWay("root", dir),
    veilOneWay: oneWay("veil", -dir),
    endSub: Math.round(last.sub),
    endRoot: Math.round(last.root * 10) / 10,
    endVeil: Math.round(last.veil * 1000) / 1000,
    tops: [...new Set(frames.map((f) => Math.round(f.top)))],
    longTasks: m.long.filter((l) => l.d >= 50),
    halfwayBy: moving.length ? Math.round((moving.find((f) => (inward ? f.sub <= width / 2 : f.sub >= width / 2))?.t ?? NaN) - moving[0].t) : null,
    width: Math.round(width),
  }
}

/* ========================================================================= */
console.log("\n1. The loading screen is the page")
for (const [label, vp] of [["phone 390", PHONE], ["desktop 1280", DESK]]) {
  const page = await open(vp, "page")
  const load = await open(vp, "loading")
  const a = await page.evaluate(GEOMETRY)
  const b = await load.evaluate(GEOMETRY)
  await page.screenshot({ path: join(shots, `page-${vp.width}.png`) })
  await load.screenshot({ path: join(shots, `loading-${vp.width}.png`) })
  const same = (x, y) => x && y && Math.abs(x.x - y.x) <= 1 && Math.abs(x.y - y.y) <= 1 && Math.abs(x.w - y.w) <= 1 && Math.abs(x.h - y.h) <= 1
  console.log(`\n  ${label}`)
  expect(same(a.heading, b.heading), "the heading is where it will be", { page: a.heading, loading: b.heading })
  expect(same(a.field, b.field), "the search field is where it will be", { page: a.field, loading: b.field })
  expect(a.pills.length === b.pills.length && a.pills.every((p, i) => same(p, b.pills[i])), "every pill, More included, is where it will be",
    a.pills.map((p, i) => [p?.x, b.pills[i]?.x, p?.w, b.pills[i]?.w]).filter(([x1, x2, w1, w2]) => x1 !== x2 || w1 !== w2).slice(0, 4))
  expect(same(a.filters, b.filters), "the Filters button is where it will be", { page: a.filters, loading: b.filters })
  expect(a.cards.length > 0 && a.cards.every((c, i) => same(c, b.cards[i])), "the first row of cards is where it will be, at the real height",
    { page: a.cards[0], loading: b.cards[0] })
  expect(b.docWidth <= b.vw, "nothing on the loading screen runs off the side", b.docWidth)
  await page.close(); await load.close()
}

/* ========================================================================= */
/* Where a panel or sheet is, and what its rows are made of. */
const PANEL = `(() => {
  const sheet = document.querySelector("[data-app-sheet] [data-sheet-panel]")
  const pop = document.querySelector("[data-category-panel]")
  const host = sheet || pop
  if (!host) return null
  const b = host.getBoundingClientRect()
  const rows = [...host.querySelectorAll("[data-browse-level=root] [data-browse-row]")]
  const svgs = rows.map((row) => row.querySelectorAll("svg").length)
  const imgs = host.querySelectorAll("img").length
  const lucide = host.querySelectorAll("svg.lucide").length
  const sub = host.querySelector("[data-browse-level=sub]")
  const rootLevel = host.querySelector("[data-browse-level=root]")
  const rowH = rows.length ? Math.round(rows[1].getBoundingClientRect().height) : 0
  return {
    kind: sheet ? "sheet" : "panel", top: Math.round(b.top), left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height),
    rows: rows.length, rowH, maxSvgPerRow: Math.max(0, ...svgs), imgs, lucide,
    subTransform: sub ? getComputedStyle(sub).transform : null,
    subOpacity: sub ? Number(getComputedStyle(sub).opacity) : null,
    subShadow: sub ? getComputedStyle(sub).boxShadow : null,
    rootTransform: rootLevel ? getComputedStyle(rootLevel).transform : null,
    subX: sub ? Math.round(sub.getBoundingClientRect().left - b.left) : null,
    firstLabels: rows.slice(0, 4).map((r) => r.textContent.trim()),
  }
})()`

console.log("\n2. The More picker")
{
  console.log("\n  desktop 1280: a panel under the pill")
  const p = await open(DESK, "page")
  const pill = await p.$("[data-more-pill]")
  const pillBox = await pill.boundingBox()
  await pill.click()
  await sleep(350)
  const s = await p.evaluate(PANEL)
  await p.screenshot({ path: join(shots, "more-1280-open.png") })
  expect(s && s.kind === "panel", "it is a panel, not a centred modal", s?.kind)
  expect(s && Math.abs(s.top - (pillBox.y + pillBox.height + 8)) <= 2, "it hangs 8px under the pill", { top: s?.top, pillBottom: Math.round(pillBox.y + pillBox.height) })
  expect(s && s.lucide === 0 && s.imgs === 0 && s.maxSvgPerRow <= 1, "no icons beside the rows: one drawn chevron or tick at most", s && { lucide: s.lucide, perRow: s.maxSvgPerRow })
  expect(s && s.rowH >= 34 && s.rowH <= 38, "36px rows on a computer", s?.rowH)
  expect(await p.evaluate(() => document.activeElement?.hasAttribute("data-browse-search")), "focus goes to the search")
  const scrim = await p.evaluate(() => [...document.querySelectorAll("body > *")].some((el) => { const cs = getComputedStyle(el); return cs.position === "fixed" && el.getBoundingClientRect().width >= innerWidth && parseFloat(cs.opacity) > 0 && cs.backgroundColor !== "rgba(0, 0, 0, 0)" }))
  expect(!scrim, "no scrim over the catalogue")

  /* drill in: the push, in the panel too */
  const inPanel = readPush(await push(p, "tap"), true)
  const inSub = await p.evaluate(PANEL)
  await p.screenshot({ path: join(shots, "more-1280-design.png") })
  expect(inPanel.subOneWay && inPanel.frames >= 10, "the subcategories are pushed in from the panel's right edge, over several frames", inPanel)
  expect(inSub.subX === 0 && Math.abs(inPanel.endRoot + inPanel.width / 4) <= 1, "and come to rest over the list, which has moved a quarter left", { subX: inSub.subX, root: inPanel.endRoot, width: inPanel.width })
  expect(inSub.subOpacity === 1 && inSub.subShadow === "none", "fully in, and no shadow along its edge", { opacity: inSub.subOpacity, shadow: inSub.subShadow })
  const back = await p.evaluate(() => document.querySelector("[data-browse-back]")?.textContent.trim())
  expect(back === "Design", "a back row names the category", back)
  const outPanel = readPush(await push(p, "back"), false)
  expect(outPanel.subOneWay && outPanel.endSub === outPanel.width && outPanel.endRoot === 0 && outPanel.endVeil === 0, "back slides it out to the right and brings the list back", outPanel)

  /* search and pick */
  await p.focus("[data-browse-search]")
  await p.keyboard.type("font")
  await sleep(100)
  await p.screenshot({ path: join(shots, "more-1280-search.png") })
  const hit = await p.evaluate(() => [...document.querySelectorAll("[data-category-panel] [data-browse-option]")].map((b) => b.textContent.trim()))
  expect(hit.some((t) => t.startsWith("Fonts & Typography")), "a search finds a subcategory by name", hit.slice(0, 3))
  await p.keyboard.press("Enter")
  await sleep(400)
  const after = await p.evaluate(() => ({ panel: !!document.querySelector("[data-category-panel]"), chip: document.querySelector("[data-subcategory-chip]")?.textContent.trim(), more: document.querySelector("[data-more-pill]")?.textContent.trim() }))
  expect(!after.panel && after.chip === "Fonts & Typography", "Enter chooses it and closes the panel", after)
  await p.screenshot({ path: join(shots, "more-1280-picked.png") })

  /* a category without a pill of its own is held by More */
  await p.click("[data-more-pill]")
  await sleep(300)
  await p.click('[data-browse-group="photography"]')
  await sleep(420)
  await p.click('[data-browse-option="photography/*"]')
  await sleep(400)
  await sleep(500)
  const held = await p.evaluate(() => {
    const m = document.querySelector("[data-more-pill]")
    const t = m.closest(".overflow-x-auto").getBoundingClientRect()
    const b = m.getBoundingClientRect()
    return { label: m.textContent.trim(), bg: getComputedStyle(m).backgroundColor, clear: Math.round(t.right - b.right) }
  })
  expect(held.label === "Photography" && held.bg !== "rgb(255, 255, 255)", "More carries the category it is holding, pressed", held)
  expect(held.clear >= 8, "and the row scrolls it clear of the fade at the edge", held.clear)
  await p.screenshot({ path: join(shots, "more-1280-held.png") })
  await p.close()
}

{
  console.log("\n  phone 390: the shared sheet")
  const p = await open(PHONE, "page")
  await p.tap("[data-more-pill]")
  await sleep(600)
  const s = await p.evaluate(PANEL)
  await p.screenshot({ path: join(shots, "more-390-open.png") })
  expect(s && s.kind === "sheet", "it is the bottom sheet", s?.kind)
  expect(s && s.lucide === 0 && s.imgs === 0 && s.maxSvgPerRow <= 1, "no icons beside the rows", s && { lucide: s.lucide, perRow: s.maxSvgPerRow })
  expect(s && s.rowH >= 47 && s.rowH <= 50, "48px rows on a phone", s?.rowH)
  expect(await p.evaluate(() => !document.activeElement?.hasAttribute("data-browse-search")), "the keyboard does not jump up on its own")

  /*
    THE PUSH, EVERY FRAME. "More standard, smooth and clean... not laggy":
    in from the right edge to 0 while the list moves a quarter left and dims,
    on one curve over about 280ms, back the same in reverse, every value only
    ever going one way, no long task and no dropped run of frames while it
    moves, and the sheet's top edge still.
  */
  const report = []
  for (const [how, label] of [["tap", "a tap"], ["key", "the keyboard"]]) {
    const inn = readPush(await push(p, how), true)
    if (how === "tap") await p.screenshot({ path: join(shots, "more-390-design.png") })
    const out = readPush(await push(p, "back"), false)
    report.push({ how, in: inn, back: out })
    console.log(`    ${label}: in ${inn.ms}ms over ${inn.frames} frames (half way by ${inn.halfwayBy}ms, started ${inn.startedAfterPress}ms after the press), largest gap ${inn.maxGap}ms; back ${out.ms}ms over ${out.frames} frames, largest gap ${out.maxGap}ms; long tasks ${inn.longTasks.length + out.longTasks.length}`)
    expect(inn.subOneWay && inn.rootOneWay && inn.veilOneWay, `${label}: in, the level only ever moves left, the list only left, the veil only darker`, { sub: inn.subOneWay, root: inn.rootOneWay, veil: inn.veilOneWay })
    expect(inn.endSub === 0 && Math.abs(inn.endRoot + inn.width / 4) <= 1 && Math.abs(inn.endVeil - 0.06) <= 0.002, `${label}: it rests at 0, the list at -25% (${-inn.width / 4}px), the veil at 0.06`, { sub: inn.endSub, root: inn.endRoot, veil: inn.endVeil })
    expect(inn.ms >= 230 && inn.ms <= 330 && inn.frames >= 12, `${label}: about 280ms, over a dozen frames or more`, { ms: inn.ms, frames: inn.frames })
    expect(inn.halfwayBy != null && inn.halfwayBy <= 110, `${label}: one curve, quick off the mark and settling (half way within 110ms)`, inn.halfwayBy)
    expect(inn.maxGap != null && inn.maxGap <= 34 && inn.longTasks.length === 0, `${label}: no frame lost for more than one, no long task`, { maxGap: inn.maxGap, long: inn.longTasks })
    expect(inn.tops.length === 1, `${label}: the sheet's top edge does not move`, inn.tops)
    expect(out.subOneWay && out.rootOneWay && out.veilOneWay && out.endSub === out.width && out.endRoot === 0 && out.endVeil === 0, `${label}: back is the same move in reverse, to rest`, { sub: out.endSub, root: out.endRoot, veil: out.endVeil })
    expect(out.ms >= 230 && out.ms <= 330 && out.maxGap <= 34 && out.longTasks.length === 0 && out.tops.length === 1, `${label}: back is as smooth`, { ms: out.ms, maxGap: out.maxGap, long: out.longTasks, tops: out.tops })
  }
  /*
    A transition shows where it starts on its first frame, so two frames is
    as soon as anything can move. Changed on purpose: this also asked that a
    tap move sooner than the keyboard, because its rows were drawn on the
    press; drawing on the press is what made an iPhone drop the tap
    (components/explore/category-browser.tsx, ONE TAP), so both are drawn
    and moved on the click now and both are held to the two frames.
    scripts/check-explore-drill.mjs taps it with real touches.
  */
  const tapIn = report[0].in
  const keyIn = report[1].in
  expect(tapIn.startedAfterPress != null && tapIn.startedAfterPress <= 40 && keyIn.startedAfterPress != null && keyIn.startedAfterPress <= 40,
    "a tap and the keyboard both move it within two frames, drawn and moved on the click", { tap: tapIn.startedAfterPress, key: keyIn.startedAfterPress })
  writeFileSync(join(shots, "push-390.json"), JSON.stringify(report, null, 1))

  /* Reduced motion: no move at all. */
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  const still = readPush(await push(p, "tap", "photography"), true)
  expect(still.frames <= 2 && still.endSub === 0, "under reduced motion the level is simply there", { frames: still.frames, end: still.endSub })
  await push(p, "back")
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])

  /*
    the drag: one to one, then a pull past the threshold closes. Changed on
    purpose with the sheet's release rule (b0f03cad, "it closes where it
    would have gone"): a pull held still before the lift closes once it is
    past half the sheet, so the pull goes on to 420px of a 658px sheet. It
    stopped at 140px, which that rule springs back.
  */
  const drag = await p.evaluate(async () => {
    const panel = document.querySelector("[data-sheet-panel]")
    const handle = panel.querySelector("[data-sheet-handle]")
    const b = handle.getBoundingClientRect()
    const x = 195, y0 = Math.round(b.top + 8)
    const touch = (yy) => new Touch({ identifier: 1, target: handle, clientX: x, clientY: yy })
    const fire = (type, yy) => handle.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [touch(yy)], changedTouches: [touch(yy)], bubbles: true, cancelable: true }))
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
    const y = () => new DOMMatrixReadOnly(getComputedStyle(panel).transform).m42
    fire("touchstart", y0)
    const seen = []
    for (const d of [10, 40, 80, 140, 260, 420]) {
      fire("touchmove", y0 + d)
      await frame(); await frame()
      seen.push([d, Math.round(y())])
      await new Promise((r) => setTimeout(r, 60))
    }
    fire("touchend", y0 + 420)
    await new Promise((r) => setTimeout(r, 600))
    return { seen, gone: !document.querySelector("[data-app-sheet]") }
  })
  expect(drag.seen.slice(1).every(([d, y]) => Math.abs(y - (d - 10) - 10) <= 12), "the sheet follows the finger", drag.seen)
  expect(drag.gone, "a pull past the threshold closes it", drag.gone)

  /* pick from the sub-level */
  await p.tap("[data-more-pill]")
  await sleep(600)
  await p.tap('[data-browse-group="ai"]')
  await sleep(450)
  await p.tap('[data-browse-option="ai/prompts"]')
  await sleep(600)
  const picked = await p.evaluate(() => {
    const on = document.querySelector('[data-category-pills-row] [aria-pressed="true"]')
    const t = on.closest(".overflow-x-auto").getBoundingClientRect()
    const b = on.getBoundingClientRect()
    return { sheet: !!document.querySelector("[data-app-sheet]"), chip: document.querySelector("[data-subcategory-chip]")?.textContent.trim(), pill: on.textContent.trim(), inView: b.left >= t.left && b.right <= t.right - 8 }
  })
  expect(!picked.sheet && picked.chip === "AI Prompts", "a subcategory tap chooses it and closes the sheet", picked)
  expect(picked.pill.endsWith("AI") && picked.inView, "and the row brings the AI pill into view, pressed", picked)
  await p.screenshot({ path: join(shots, "more-390-picked.png") })
  await p.close()
}

/* ========================================================================= */
console.log("\n3. The filters")
{
  console.log("\n  desktop 1280: a panel under the button")
  const p = await open(DESK, "page")
  const btn = await p.$("[data-filters-button]")
  const bb = await btn.boundingBox()
  await btn.click()
  await sleep(300)
  const f = await p.evaluate(() => {
    const el = document.querySelector("[data-filters-panel]")
    if (!el) return null
    const b = el.getBoundingClientRect()
    return {
      top: Math.round(b.top), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height),
      sorts: el.querySelectorAll("[data-filter-sort]").length, prices: el.querySelectorAll("[data-filter-price]").length,
      lucide: el.querySelectorAll("svg.lucide").length, applyButton: [...el.querySelectorAll("button")].some((x) => /apply/i.test(x.textContent)),
      checked: el.querySelector('[data-filter-sort][aria-checked="true"]')?.textContent.trim(),
    }
  })
  await p.screenshot({ path: join(shots, "filters-1280-open.png") })
  expect(f && Math.abs(f.right - Math.round(bb.x + bb.width)) <= 2 && Math.abs(f.top - Math.round(bb.y + bb.height + 8)) <= 2, "it hangs under the button, right edges aligned", f && { right: f.right, button: Math.round(bb.x + bb.width) })
  expect(f && f.sorts === 5 && f.prices === 5, "two questions: five orders, five prices", f && { sorts: f.sorts, prices: f.prices })
  expect(f && !f.applyButton, "no Apply button: a choice applies when it is made")
  expect(f && f.checked === "Recommended", "the default order is called Recommended", f?.checked)
  const before = await p.evaluate(() => [...document.querySelectorAll("main .grid.lg\\:grid-cols-3 > *")].length)
  const t0 = Date.now()
  await p.click('[data-filter-price="free"]')
  const tickAt = await p.evaluate(() => document.querySelector('[data-filter-price="free"]').getAttribute("aria-checked"))
  await sleep(350)
  const afterFree = await p.evaluate(() => ({
    prices: [...document.querySelectorAll("main .grid.lg\\:grid-cols-3 > *")].map((c) => c.textContent.includes("Free")),
    badge: document.querySelector("[data-filters-button]").textContent.replace(/\D/g, ""),
    clear: !!document.querySelector("[data-filter-clear]"),
    open: !!document.querySelector("[data-filters-panel]"),
  }))
  expect(tickAt === "true", "the choice is marked in the same tap", tickAt)
  expect(afterFree.prices.length > 0 && afterFree.prices.length < before && afterFree.prices.every(Boolean), "and the list behind shows only free products", { before, after: afterFree.prices.length })
  expect(afterFree.badge === "1" && afterFree.clear && afterFree.open, "the button counts it, Clear all appears, the panel stays", afterFree)
  await p.screenshot({ path: join(shots, "filters-1280-free.png") })
  await p.click("[data-filter-clear]")
  await sleep(250)
  expect(await p.evaluate(() => !document.querySelector("[data-filter-clear]")), "Clear all puts it back and goes away", Date.now() - t0)
  await p.keyboard.press("Escape")
  await sleep(250)
  expect(await p.evaluate(() => !document.querySelector("[data-filters-panel]")), "Escape closes it")
  await p.close()
}
{
  console.log("\n  phone 390: the shared sheet")
  const p = await open(PHONE, "page")
  await p.tap("[data-filters-button]")
  await sleep(600)
  const s = await p.evaluate(() => {
    const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]")
    if (!panel) return null
    const b = panel.getBoundingClientRect()
    const done = panel.querySelector("[data-filters-done]")
    return { top: Math.round(b.top), height: Math.round(b.height), bottom: Math.round(b.bottom), done: done?.textContent.trim(), doneBg: done ? getComputedStyle(done).backgroundColor : null, lucide: panel.querySelectorAll("svg.lucide").length }
  })
  await p.screenshot({ path: join(shots, "filters-390-open.png") })
  expect(s && s.bottom === 844 && s.top > 120, "it is the bottom sheet, sized to what it holds", s)
  expect(s && /^Show \d+ results$/.test(s.done), "its button says how many results it leaves", s?.done)
  expect(s && s.doneBg === "rgb(17, 17, 19)", "and is the near-black primary", s?.doneBg)
  await p.tap('[data-filter-sort="price-low"]')
  await sleep(300)
  const sorted = await p.evaluate(() => [...document.querySelectorAll("main .grid.lg\\:grid-cols-3 > *")].slice(0, 6).map((c) => c.textContent.match(/Free|\$[\d.]+/)?.[0]))
  expect(sorted[0] === "Free", "choosing an order re-orders the list behind at once", sorted)
  await p.screenshot({ path: join(shots, "filters-390-sorted.png") })
  await p.tap("[data-filters-done]")
  await sleep(600)
  expect(await p.evaluate(() => !document.querySelector("[data-app-sheet]")), "the button closes it")
  await p.close()
}

/* ========================================================================= */
console.log("\n4. A category page, /explore/[category]")
/*
  The same questions asked of the category page and its loading screen
  (app/(marketing)/explore/[category]/loading.tsx): the frame is the page's,
  on the page's ground, and lines up with it; its category pill and its
  Filters are Explore's panel and sheet, with the category page's own picks.
*/
const CAT_GEOMETRY = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } }
  const title = document.querySelector("[data-category-title]")
  const row = document.querySelector("[data-category-pills-row]")
  const track = document.querySelector("[data-category-track]")
  const grid = document.querySelector("[data-skeleton-grid]") || [...document.querySelectorAll("main .grid")].find((g) => g.className.includes("lg:grid-cols-3"))
  return {
    back: r(document.querySelector("[data-category-back]")), title: r(title), blurb: r(title?.nextElementSibling),
    field: r(document.querySelector("[data-category-search]")),
    pills: row ? [...row.children].map(r) : [], scroll: track ? Math.round(track.scrollLeft) : null,
    pressed: row?.querySelector('[aria-pressed="true"]')?.textContent.trim(),
    filters: r(document.querySelector("[data-filters-button], [data-skeleton-filters]")),
    cards: grid ? [...grid.children].slice(0, 3).map(r) : [],
    ground: getComputedStyle(document.querySelector("main")).backgroundColor,
    docWidth: document.documentElement.scrollWidth, vw: innerWidth,
  }
})()`
/* Anything violet on the page: a colour, a background or a border with a violet hue. */
const VIOLET = `(() => {
  const hue = (c) => { const m = c.match(/rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)(?:, ([\\d.]+))?/); if (!m || m[4] === "0") return null
    const [r, g, b] = [m[1], m[2], m[3]].map((v) => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    if (d < 0.12) return null
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return (h * 60 + 360) % 360 }
  const out = []
  for (const el of document.querySelectorAll("main *, [data-app-sheet] *, [data-category-panel] *, [data-filters-panel] *")) {
    if (el.closest("img, a[href^='/p/'], [data-product-card]")) continue
    const cs = getComputedStyle(el)
    for (const c of [cs.color, cs.backgroundColor, cs.borderTopColor]) { const h = hue(c); if (h !== null && h >= 250 && h <= 295) { out.push(el.tagName + "." + String(el.className).slice(0, 40)); break } }
  }
  return out.slice(0, 3)
})()`
const routes = (p) => p.evaluate(() => (window.__router || []).map(([k, h]) => `${k} ${h}`))
const cardsText = (p) => p.evaluate(() => [...document.querySelectorAll("main .grid.lg\\:grid-cols-3 > *")].map((c) => c.textContent))
const same = (x, y) => x && y && Math.abs(x.x - y.x) <= 1 && Math.abs(x.y - y.y) <= 1 && Math.abs(x.w - y.w) <= 1 && Math.abs(x.h - y.h) <= 1

for (const [label, vp] of [["phone 390", PHONE], ["desktop 1280", DESK]]) {
  for (const at of ["design", "design/print"]) {
    const page = await open(vp, `cat-page/${at}`)
    const load = await open(vp, `cat-loading/${at}`)
    const a = await page.evaluate(CAT_GEOMETRY)
    const b = await load.evaluate(CAT_GEOMETRY)
    const tag = at.replace("/", "-")
    await page.screenshot({ path: join(shots, `cat-page-${tag}-${vp.width}.png`) })
    await load.screenshot({ path: join(shots, `cat-loading-${tag}-${vp.width}.png`) })
    console.log(`\n  ${label}, /explore/${at.replace("/", "?sub=")}`)
    expect(a.ground === "rgb(248, 249, 250)" && b.ground === a.ground, "the loading screen is on the page's own ground", { page: a.ground, loading: b.ground })
    expect(same(a.back, b.back) && same(a.title, b.title) && same(a.blurb, b.blurb), "the back link, the heading and its line are where they will be", { page: a.title, loading: b.title })
    expect(same(a.field, b.field), "the search field is where it will be", { page: a.field, loading: b.field })
    expect(a.pills.length > 3 && a.pills.length === b.pills.length && a.pills.every((p, i) => same(p, b.pills[i])) && a.scroll === b.scroll,
      "every pill, the category's own included, is where it will be, the row scrolled alike", { pills: [a.pills.length, b.pills.length], scroll: [a.scroll, b.scroll] })
    expect(a.pressed === b.pressed && a.pressed === (at.includes("/") ? "Print Design" : "All"), "the same pill is pressed", [a.pressed, b.pressed])
    expect(same(a.filters, b.filters), "the Filters button is where it will be", { page: a.filters, loading: b.filters })
    expect(a.cards.length > 0 && a.cards.every((c, i) => same(c, b.cards[i])), "the first row of cards is where it will be, at the real height", { page: a.cards[0], loading: b.cards[0] })
    expect(b.docWidth <= b.vw && a.docWidth <= a.vw, "nothing runs off the side", [a.docWidth, b.docWidth])
    if (at.includes("/")) {
      const box = await page.evaluate(() => { const on = document.querySelector('[data-category-pills-row] [aria-pressed="true"]').getBoundingClientRect(); const t = document.querySelector("[data-category-track]").getBoundingClientRect(); return { l: Math.round(on.left - t.left), r: Math.round(t.right - on.right) } })
      expect(box.l >= 0 && box.r >= 8, "the pressed pill from the address is in view on arrival", box)
    }
    if (!at.includes("/")) {
      const cat = await page.evaluate(() => { const m = document.querySelector("[data-more-pill]"); const b = m.getBoundingClientRect(); return { label: m.textContent.trim(), x: Math.round(b.left), right: Math.round(b.right), first: m === document.querySelector("[data-category-pills-row]").firstElementChild } })
      expect(cat.label === "Design" && cat.first && cat.x >= 0 && cat.right <= vp.width, "the category's own pill opens the row and is on screen", cat)
    }
    const violet = await page.evaluate(VIOLET)
    expect(violet.length === 0, "nothing violet on the page", violet)
    await page.close(); await load.close()
  }
}

{
  console.log("\n  desktop 1280: the subcategory pills")
  const p = await open(DESK, "cat-page/design")
  const all = (await cardsText(p)).length
  await p.click('[data-sub-pill="fonts"]')
  await sleep(450)
  const fonts = await cardsText(p)
  const st = await p.evaluate(() => ({ title: document.querySelector("[data-category-title]").textContent.trim(), pressed: document.querySelector('[data-category-pills-row] [aria-pressed="true"]')?.textContent.trim() }))
  expect((await routes(p)).at(-1) === "push /explore/design?sub=fonts", "a subcategory is ?sub= on the category's page, as before", (await routes(p)).at(-1))
  expect(fonts.length > 0 && fonts.every((t) => /font|typograph/i.test(t)), "and the list is the products that are fonts", fonts.map((t) => t.slice(0, 30)).slice(0, 3))
  expect(st.title === "Fonts & Typography" && st.pressed === "Fonts & Typography", "the heading names it and its pill is pressed", st)
  await p.click('[data-sub-pill="fonts"]')
  await sleep(450)
  expect((await routes(p)).at(-1) === "push /explore/design" && (await cardsText(p)).length === all, "pressing it again takes it off", (await routes(p)).at(-1))
  await p.click('[data-sub-pill="ui-ux"]')
  await sleep(450)
  const ui = await cardsText(p)
  expect(ui.length >= 2 && ui.every((t) => /UI/.test(t)), "a product filed as \"UI Kits\" is Design, and UI/UX finds it", ui.map((t) => t.slice(0, 30)).slice(0, 3))
  await p.close()
}

{
  console.log("\n  desktop 1280: the category's pill opens Explore's panel")
  const p = await open(DESK, "cat-page/design")
  const pill = await p.$("[data-more-pill]")
  const pillBox = await pill.boundingBox()
  await pill.click()
  await sleep(350)
  const s = await p.evaluate(PANEL)
  await p.screenshot({ path: join(shots, "cat-picker-1280-open.png") })
  expect(s && s.kind === "panel" && Math.abs(s.top - (pillBox.y + pillBox.height + 8)) <= 2, "a panel 8px under the pill", s && { top: s.top, pillBottom: Math.round(pillBox.y + pillBox.height) })
  expect(s && s.lucide === 0 && s.imgs === 0 && s.maxSvgPerRow <= 1 && s.rowH >= 34 && s.rowH <= 38, "plain 36px rows, one drawn mark at most", s && { lucide: s.lucide, perRow: s.maxSvgPerRow, rowH: s.rowH })
  const design = await p.evaluate(() => document.querySelector('[data-browse-group="design"]')?.textContent.trim())
  expect(design === "DesignAll", "Design is the category it is on", design)
  await p.click('[data-browse-group="design"]')
  await sleep(450)
  const inSub = await p.evaluate(PANEL)
  expect(inSub.subX === 0 && inSub.subOpacity === 1, "its subcategories are a level of their own", { subX: inSub.subX, opacity: inSub.subOpacity })
  await p.click('[data-browse-option="design/mockups"]')
  await sleep(400)
  const after = await p.evaluate(() => ({ panel: !!document.querySelector("[data-category-panel]"), pressed: document.querySelector('[data-category-pills-row] [aria-pressed="true"]')?.textContent.trim() }))
  expect(!after.panel && after.pressed === "Mockups" && (await routes(p)).at(-1) === "push /explore/design?sub=mockups", "a subcategory of this category is picked here and closes the panel", { ...after, route: (await routes(p)).at(-1) })
  await p.click("[data-more-pill]")
  await sleep(300)
  await p.click('[data-browse-group="photography"]')
  await sleep(420)
  await p.click('[data-browse-option="photography/presets"]')
  await sleep(300)
  expect((await routes(p)).at(-1) === "push /explore/photography?sub=presets", "another category's subcategory is that category's page", (await routes(p)).at(-1))
  await p.click("[data-more-pill]")
  await sleep(300)
  await p.click('[data-browse-option="all"]')
  await sleep(300)
  expect((await routes(p)).at(-1) === "push /explore", "All categories is Explore", (await routes(p)).at(-1))
  await p.close()
}

{
  console.log("\n  phone 390: the category's pill opens the shared sheet")
  const p = await open(PHONE, "cat-page/design")
  await p.tap("[data-more-pill]")
  await sleep(600)
  const s = await p.evaluate(PANEL)
  await p.screenshot({ path: join(shots, "cat-picker-390-open.png") })
  expect(s && s.kind === "sheet" && s.lucide === 0 && s.maxSvgPerRow <= 1, "the bottom sheet, no icons beside the rows", s && { kind: s.kind, lucide: s.lucide })
  expect(s && s.rowH >= 47 && s.rowH <= 50, "48px rows on a phone", s?.rowH)
  const catIn = readPush(await push(p, "tap"), true)
  expect(catIn.subOneWay && catIn.endSub === 0 && catIn.frames >= 12 && catIn.maxGap <= 34 && catIn.longTasks.length === 0, "a category is pushed in as a level, smoothly", { ms: catIn.ms, frames: catIn.frames, maxGap: catIn.maxGap })
  expect(catIn.tops.length === 1, "the sheet's top edge does not move while it does", catIn.tops)
  await p.screenshot({ path: join(shots, "cat-picker-390-design.png") })
  const drag = await p.evaluate(async () => {
    const panel = document.querySelector("[data-sheet-panel]")
    const handle = panel.querySelector("[data-sheet-handle]")
    const b = handle.getBoundingClientRect()
    const x = 195, y0 = Math.round(b.top + 8)
    const touch = (yy) => new Touch({ identifier: 1, target: handle, clientX: x, clientY: yy })
    const fire = (type, yy) => handle.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [touch(yy)], changedTouches: [touch(yy)], bubbles: true, cancelable: true }))
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
    const y = () => new DOMMatrixReadOnly(getComputedStyle(panel).transform).m42
    fire("touchstart", y0)
    const seen = []
    for (const d of [10, 40, 80, 140, 260, 420]) {
      fire("touchmove", y0 + d)
      await frame(); await frame()
      seen.push([d, Math.round(y())])
      await new Promise((r) => setTimeout(r, 60))
    }
    fire("touchend", y0 + 420)
    await new Promise((r) => setTimeout(r, 600))
    return { seen, gone: !document.querySelector("[data-app-sheet]") }
  })
  expect(drag.seen.slice(1).every(([d, y]) => Math.abs(y - (d - 10) - 10) <= 12) && drag.gone, "it follows the finger and a pull closes it", drag)
  await p.tap("[data-more-pill]")
  await sleep(600)
  await p.tap('[data-browse-group="design"]')
  await sleep(450)
  await p.tap('[data-browse-option="design/logos"]')
  await sleep(600)
  const picked = await p.evaluate(() => {
    const on = document.querySelector('[data-category-pills-row] [aria-pressed="true"]')
    const t = on.closest("[data-category-track]").getBoundingClientRect()
    const b = on.getBoundingClientRect()
    return { sheet: !!document.querySelector("[data-app-sheet]"), pill: on.textContent.trim(), inView: b.left >= t.left && b.right <= t.right - 8 }
  })
  expect(!picked.sheet && picked.pill === "Logo Templates" && picked.inView, "a tap picks it, closes the sheet and brings its pill into view", picked)
  await p.screenshot({ path: join(shots, "cat-picker-390-picked.png") })
  await p.close()
}

{
  console.log("\n  desktop 1280: Explore's filters, with the category page's orders")
  const p = await open(DESK, "cat-page/design")
  const btn = await p.$("[data-filters-button]")
  const bb = await btn.boundingBox()
  await btn.click()
  await sleep(300)
  const f = await p.evaluate(() => {
    const el = document.querySelector("[data-filters-panel]")
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { top: Math.round(b.top), right: Math.round(b.right), sorts: [...el.querySelectorAll("[data-filter-sort]")].map((x) => x.textContent.trim()), prices: el.querySelectorAll("[data-filter-price]").length, lucide: el.querySelectorAll("svg.lucide").length, checked: el.querySelector('[data-filter-sort][aria-checked="true"]')?.textContent.trim() }
  })
  await p.screenshot({ path: join(shots, "cat-filters-1280-open.png") })
  expect(f && Math.abs(f.right - Math.round(bb.x + bb.width)) <= 2 && Math.abs(f.top - Math.round(bb.y + bb.height + 8)) <= 2, "a panel under the button, right edges aligned", f && { right: f.right, button: Math.round(bb.x + bb.width) })
  expect(f && f.sorts.length === 4 && !f.sorts.includes("Recommended") && f.checked === "Newest" && f.prices === 5 && f.lucide === 0, "Newest is this page's order; four orders, five prices", f && { sorts: f.sorts, checked: f.checked })
  await p.click('[data-filter-price="free"]')
  await sleep(350)
  const free = await cardsText(p)
  expect(free.length > 0 && free.every((t) => t.includes("Free")), "a price applies at once to the list behind", free.length)
  await p.click("[data-filter-clear]")
  await sleep(250)
  await p.keyboard.press("Escape")
  await sleep(250)
  expect(await p.evaluate(() => !document.querySelector("[data-filters-panel]") && !document.querySelector("[data-filter-clear]")), "Clear all and Escape")
  await p.close()
}
{
  console.log("\n  phone 390: the filters sheet")
  const p = await open(PHONE, "cat-page/design")
  await p.tap("[data-filters-button]")
  await sleep(600)
  const s = await p.evaluate(() => {
    const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]")
    if (!panel) return null
    const b = panel.getBoundingClientRect()
    const done = panel.querySelector("[data-filters-done]")
    return { bottom: Math.round(b.bottom), top: Math.round(b.top), done: done?.textContent.trim(), doneBg: done ? getComputedStyle(done).backgroundColor : null }
  })
  await p.screenshot({ path: join(shots, "cat-filters-390-open.png") })
  expect(s && s.bottom === 844 && s.top > 120 && /^Show \d+ results$/.test(s.done) && s.doneBg === "rgb(17, 17, 19)", "the bottom sheet, its near-black button counting the results", s)
  await p.tap('[data-filter-sort="price-low"]')
  await sleep(300)
  const sorted = await p.evaluate(() => [...document.querySelectorAll("main .grid.lg\\:grid-cols-3 > *")].slice(0, 4).map((c) => c.textContent.match(/Free|\$[\d.]+/)?.[0]))
  expect(sorted[0] === "Free", "an order re-sorts the list behind at once", sorted)
  await p.tap("[data-filters-done]")
  await sleep(600)
  expect(await p.evaluate(() => !document.querySelector("[data-app-sheet]")), "the button closes it")
  await p.close()
}

await browser.close()
if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
console.log(`\nScreenshots: ${shots}`)
if (broken) fail(`${broken} check(s) failed.`)
console.log("\nExplore's and the category page's loading screens, pickers and filters measure as asked.")
