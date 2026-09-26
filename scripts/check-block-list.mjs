/**
 * ===========================================================================
 *  A SECTION'S BLOCKS, DRAGGED BY THE GRIP
 * ===========================================================================
 * An FAQ's questions, drawn by components/website-builder/editor/
 * section-block-list.tsx and mounted by scripts/render-block-list.tsx, at 360
 * and 320 wide with touch, and at 1280 with a mouse.
 *
 *   Each row is the grip, the name, Duplicate, Delete and the chevron: 48px
 *   on a phone, 40px on a computer. No Move up, no Move down.
 *   A finger on the grip lifts the row, the others slide aside, nothing is
 *   saved until it lifts, and then the new order is saved once. A drag never
 *   opens or closes a row; a tap on the name does.
 *   Held near the bottom edge of the scroller, the list scrolls.
 *   Delete is grey at rest and under the pointer, never red.
 *   Nothing is wider than a 320px screen.
 *
 *   node scripts/check-block-list.mjs      (PROBE_CSS=source without a build)
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)
const stubs = join(root, ".block-list-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-block-list-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const order = (p) => p.evaluate(() => window.__blocks.map((b) => b.id).join(","))
const saves = (p) => p.evaluate(() => window.__saves)
const openRows = (p) => p.evaluate(() => [...document.querySelectorAll("[data-block-panel]")].map((el) => el.closest("[data-block-row]").dataset.blockRow).join(","))
const grip = (id) => `[data-block-row="${id}"] [data-block-grip]`
const centre = (p, sel) => p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom } })

/** The bin's colours as [r, g, b]: its icon, its fill and its border. */
const binColours = (p, id) => p.evaluate((id) => {
  const el = document.querySelector(`[data-block-row="${id}"] [data-block-remove]`)
  const c = document.createElement("canvas")
  c.width = c.height = 1
  const x = c.getContext("2d")
  const rgb = (v) => { x.clearRect(0, 0, 1, 1); x.fillStyle = "#fff"; x.fillRect(0, 0, 1, 1); x.fillStyle = v; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3) }
  const s = getComputedStyle(el)
  return { icon: rgb(s.color), fill: rgb(s.backgroundColor), border: rgb(s.borderTopColor), shadow: s.boxShadow }
}, id)
/** Grey: red, green and blue within a few steps of each other. */
const grey = (c) => Math.max(...c) - Math.min(...c) <= 12
const allGrey = (b) => grey(b.icon) && grey(b.fill) && grey(b.border)

async function touchDrag(p, from, toY, { hold = 0, during } = {}) {
  await p.touchscreen.touchStart(from.x, from.y)
  const steps = 14
  for (let i = 1; i <= steps; i++) {
    await p.touchscreen.touchMove(from.x, from.y + ((toY - from.y) * i) / steps)
    await sleep(16)
  }
  if (hold) {
    for (let t = 0; t < hold; t += 50) {
      await p.touchscreen.touchMove(from.x, toY + (t % 100 ? 0.5 : 0))
      await sleep(50)
    }
  }
  const seen = during ? await during() : null
  await p.touchscreen.touchEnd()
  await sleep(150)
  return seen
}

async function mouseDrag(p, from, toY) {
  await p.mouse.move(from.x, from.y)
  await p.mouse.down()
  for (let i = 1; i <= 12; i++) {
    await p.mouse.move(from.x, from.y + ((toY - from.y) * i) / 12)
    await sleep(16)
  }
  await p.mouse.up()
  await sleep(150)
}

async function phone(browser, width) {
  const label = `phone-${width}`
  console.log(`\n${label}`)
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width, height: 760, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await p.goto(`file://${join(stubs, "index.html")}`)
  await sleep(500)
  if (errors.length) fail(`The page threw: ${errors[0]}`)

  const layout = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-block-list] > [data-reorder-row]")]
    const bar = (r) => r.firstElementChild.firstElementChild
    const kids = bar(rows[0]).children
    return {
      bars: rows.map((r) => Math.round(bar(r).getBoundingClientRect().height)),
      gaps: rows.slice(1).map((r, i) => Math.round(r.getBoundingClientRect().top - rows[i].getBoundingClientRect().bottom)),
      parts: [...kids].map((k) => k.dataset.blockGrip !== undefined ? "grip" : k.dataset.blockToggle !== undefined ? "name" : k.dataset.blockDuplicate !== undefined ? "duplicate" : k.dataset.blockRemove !== undefined ? "delete" : k.getAttribute("aria-label")?.startsWith("Open") ? "chevron" : "?"),
      moves: document.querySelectorAll('[aria-label^="Move"]').length,
      sheetNoDrag: bar(rows[0]).querySelector("[data-block-grip]").hasAttribute("data-sheet-no-drag"),
      touchAction: getComputedStyle(bar(rows[0]).querySelector("[data-block-grip]")).touchAction,
      wide: document.documentElement.scrollWidth,
    }
  })
  expect(layout.bars.every((h) => h === 48), "every row is 48px on a phone", layout.bars)
  expect(layout.gaps.every((g) => g === 8), "rows are 8px apart", layout.gaps)
  expect(layout.parts.join(",") === "grip,name,duplicate,delete,chevron", "grip, name, Duplicate, Delete, chevron", layout.parts)
  expect(layout.moves === 0, "no Move up or Move down buttons", layout.moves)
  expect(layout.sheetNoDrag && layout.touchAction === "none", "the grip owns its finger, not the sheet", layout)
  expect(layout.wide <= width, `nothing is wider than ${width}px`, layout.wide)
  const bin = await binColours(p, "q1")
  expect(allGrey(bin) && bin.shadow !== "none", "Delete is a grey key with a soft foot", bin)
  await p.screenshot({ path: join(shots, `${label}-list.png`), fullPage: true })

  /* ── a finger drags the first question below the third ── */
  const before = await saves(p)
  const q1 = await centre(p, grip("q1"))
  const q3 = await centre(p, '[data-block-row="q3"]')
  const mid = await touchDrag(p, q1, q3.bottom - 4, {
    during: async () => {
      const seen = await p.evaluate(() => {
        const row = document.querySelector('[data-block-row="q1"]')
        const q2 = document.querySelector('[data-block-row="q2"]')
        return { transform: row.style.transform, z: row.style.zIndex, passed: q2.style.transform, saves: window.__saves }
      })
      await p.screenshot({ path: join(shots, `${label}-mid-drag.png`), fullPage: true })
      return seen
    },
  })
  expect(/translate3d\(0px, [1-9]/.test(mid.transform) && mid.z === "20", "the row lifts and follows the finger", mid)
  expect(/translate3d\(0px, -/.test(mid.passed), "the rows it passes slide up", mid.passed)
  expect(mid.saves === before, "nothing is saved while the finger is down", { before, during: mid.saves })
  expect((await order(p)) === "q2,q3,q1,q4,q5", "on release it lands below the third", await order(p))
  expect((await saves(p)) === before + 1, "and the new order is saved once", await saves(p))
  expect((await openRows(p)) === "", "the drag opened nothing", await openRows(p))
  expect(await p.evaluate(() => [...document.querySelectorAll("[data-reorder-row]")].every((r) => !r.style.transform)), "no row is left displaced")

  /* ── a tap on the name opens it, a drag of another row closes it ── */
  await p.tap('[data-block-row="q2"] [data-block-toggle]')
  await sleep(150)
  expect((await openRows(p)) === "q2", "a tap on the name opens the row", await openRows(p))
  await p.screenshot({ path: join(shots, `${label}-open.png`), fullPage: true })
  const q5 = await centre(p, grip("q5"))
  const top = await centre(p, '[data-block-row="q2"]')
  await touchDrag(p, q5, top.top - 30)
  expect((await order(p)).startsWith("q5,"), "a row dragged past an open one lands at the top", await order(p))
  expect((await openRows(p)) === "", "picking it up closed the open row, and the drag opened nothing", await openRows(p))
  await p.tap('[data-block-row="q3"] [data-block-toggle]')
  await sleep(120)
  await p.tap('[data-block-row="q3"] [data-block-toggle]')
  await sleep(120)
  expect((await openRows(p)) === "", "a second tap closes it again", await openRows(p))

  /* ── near the edge, the scroller scrolls ── */
  await p.goto(`file://${join(stubs, "index.html")}?many`)
  await sleep(400)
  const box = await p.$eval("#scroller", (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })
  const g = await centre(p, grip("q1"))
  const s0 = await saves(p)
  await touchDrag(p, g, box.bottom - 12, { hold: 1500 })
  const scrolled = await p.evaluate(() => ({ top: document.getElementById("scroller").scrollTop, at: window.__blocks.findIndex((b) => b.id === "q1") }))
  expect(scrolled.top > 60, "held at the bottom edge, the list scrolls", scrolled.top)
  expect(scrolled.at >= 7, "and the row lands further down than the screen showed", scrolled.at)
  expect((await saves(p)) === s0 + 1, "saved once for the whole drag", (await saves(p)) - s0)

  if (errors.length) expect(false, "no errors on the page", errors)
  await p.close()
}

async function desktop(browser) {
  console.log("\ndesktop-1280")
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.goto(`file://${join(stubs, "index.html")}`)
  await sleep(400)
  await p.evaluate(() => { document.getElementById("app").style.width = "300px" })
  await sleep(100)
  const bar = await p.$eval('[data-block-row="q1"] > div > div', (el) => el.getBoundingClientRect().height)
  expect(bar === 40, "a row is 40px on a computer", bar)
  expect(await p.evaluate(() => document.querySelectorAll('[aria-label^="Move"]').length) === 0, "no Move up or Move down buttons")

  const s0 = await saves(p)
  const q5 = await centre(p, grip("q5"))
  const q1 = await centre(p, '[data-block-row="q1"]')
  await mouseDrag(p, q5, q1.top + 4)
  expect((await order(p)) === "q5,q1,q2,q3,q4", "a mouse drags the last question to the top", await order(p))
  expect((await saves(p)) === s0 + 1, "saved once", (await saves(p)) - s0)
  expect((await openRows(p)) === "", "the drag opened nothing", await openRows(p))

  await p.focus(grip("q5"))
  await p.keyboard.press("ArrowDown")
  await sleep(80)
  expect((await order(p)) === "q1,q5,q2,q3,q4", "Arrow Down on a focused grip moves it one place", await order(p))

  await p.click('[data-block-row="q2"] [data-block-toggle]')
  await sleep(120)
  expect((await openRows(p)) === "q2", "a click on the name opens the row", await openRows(p))
  await p.click('[data-block-row="q2"] [aria-label^="Close"]')
  await sleep(120)
  expect((await openRows(p)) === "", "and the chevron closes it", await openRows(p))

  const rest = await binColours(p, "q3")
  expect(allGrey(rest), "Delete is grey at rest", rest)
  await p.hover('[data-block-row="q3"] [data-block-remove]')
  await sleep(300)
  const hover = await binColours(p, "q3")
  expect(allGrey(hover), "and grey under the pointer, never red", hover)
  expect(hover.icon[0] < rest.icon[0] && hover.fill[0] <= rest.fill[0], "a shade darker under the pointer", { rest: rest.icon, hover: hover.icon })
  await p.screenshot({ path: join(shots, "desktop-hover.png"), clip: { x: 0, y: 0, width: 320, height: 330 } })

  const n = await p.evaluate(() => window.__blocks.length)
  await p.click('[data-block-row="q3"] [data-block-remove]')
  await sleep(120)
  expect((await p.evaluate(() => window.__blocks.length)) === n - 1 && !(await order(p)).includes("q3"), "Delete removes the block", await order(p))
  await p.click('[data-block-row="q1"] [data-block-duplicate]')
  await sleep(150)
  expect((await p.evaluate(() => window.__blocks.length)) === n && (await openRows(p)).startsWith("copy"), "Duplicate adds a copy below and opens it", await openRows(p))
  await p.screenshot({ path: join(shots, "desktop-open.png"), clip: { x: 0, y: 0, width: 320, height: 420 } })
  if (errors.length) expect(false, "no errors on the page", errors)
  await p.close()
}

try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-block-list.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": "." },
    banner: { js: "var process={env:{NODE_ENV:'production'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:system-ui,sans-serif;background:#fff}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
  const only = process.env.ONLY ? process.env.ONLY.split(",") : null
  for (const w of [360, 320]) if (!only || only.includes(`phone-${w}`)) await phone(browser, w)
  await browser.close()
  if (!only || only.includes("desktop")) {
    /* Headless says it has no hover; a computer with a mouse does, and
       Tailwind puts hover: behind (hover: hover). No setViewport here: its
       touch override takes the hover back. */
    const mouse = await puppeteer.launch({
      executablePath: CHROMIUM,
      defaultViewport: null,
      args: ["--no-sandbox", "--disable-gpu", "--window-size=1280,800", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
    })
    await desktop(mouse)
    await mouse.close()
  }
} finally {
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nscreenshots in ${shots}`)
if (broken) { console.error(`\n${broken} check(s) failed\n`); process.exit(1) }
console.log("\nall checks passed\n")
