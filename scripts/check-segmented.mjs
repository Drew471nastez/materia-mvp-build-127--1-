/**
 * ===========================================================================
 *  A SELECT SETTING: BUTTONS FOR ONE TO THREE, A DROPDOWN PAST THAT, MEASURED
 * ===========================================================================
 * The owner: "a setting with 1 to 3 options must render as a segmented
 * control ... light grey track, white selected pill with subtle shadow,
 * smooth transform animation of the pill, and only 4+ options use the
 * dropdown ... long labels handled ... keyboard accessible."
 *
 * ChoiceControl itself (scripts/render-segmented.tsx), at 1280 with a mouse
 * and 390 with a finger:
 *
 *   - two and three short options are a radiogroup; four, and three long
 *     labels, are a select
 *   - a track too narrow for its labels is a select, and becomes buttons
 *     when it is widened
 *   - the colours: grey track, white pill with a shadow
 *   - pressed, the pill slides (in-between positions sampled), by transform
 *     only, and lands exactly on the chosen segment; frame times meanwhile
 *   - no label is cut in a segment
 *   - the arrow keys move the choice and the focus, round the end
 *   - 28px tall under a mouse, 44px under a thumb
 *
 *   node scripts/check-segmented.mjs
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
process.env.PROBE_CSS = "source"
const css = await appCss(root)
const stubs = join(root, ".segmented-probe")
mkdirSync(stubs, { recursive: true })

let broken = 0
let passed = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (ok) passed++
  else broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shape = (p, id) => p.$eval(`[data-case="${id}"] [data-choice-control]`, (el) => el.getAttribute("data-choice-control"))

async function run(browser, { label, width, kind }) {
  console.log(`\n${label}`)
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width, height: 900, isMobile: kind === "touch", hasTouch: kind === "touch", deviceScaleFactor: 2 })
  await p.goto(`file://${join(stubs, "index.html")}`)
  await sleep(400)

  const shapes = {}
  for (const id of ["direction", "position", "four", "long", "narrow"]) shapes[id] = await shape(p, id)
  expect(shapes.direction === "segments" && shapes.position === "segments", "Vertical | Horizontal and Top | Center | Bottom are buttons", shapes)
  expect(shapes.four === "dropdown", "four options are the dropdown", shapes.four)
  expect(shapes.long === "dropdown", "three labels too long for a third of the track each are the dropdown", shapes.long)
  expect(shapes.narrow === "dropdown", "two labels in a 150px track are the dropdown", shapes.narrow)
  /* The sidebar's track on a computer (12.5px type); the phone sheet's, 390 less its gutters, under a thumb (14px type). */
  const wide = kind === "touch" ? 358 : 268
  await p.$eval('[data-case="narrow"]', (el, w) => { el.style.width = `${w}px`; el.parentElement.style.width = `${w + 32}px` }, wide)
  await sleep(200)
  expect((await shape(p, "narrow")) === "segments", `  widened to ${wide}px, the same two are buttons`, await shape(p, "narrow"))
  expect(!!(await p.$('[data-case="four"] select')) && !(await p.$('[data-case="four"] [role="radiogroup"]')), "  the dropdown is the browser's own select")

  const sem = await p.$eval('[data-case="position"] [role="radiogroup"]', (g) => ({
    label: g.getAttribute("aria-label"),
    radios: [...g.querySelectorAll('[role="radio"]')].map((r) => [r.getAttribute("aria-checked"), r.tabIndex]),
  }))
  expect(sem.label === "Position" && sem.radios.length === 3 && sem.radios[0][0] === "true" && sem.radios[0][1] === 0 && sem.radios[1][1] === -1, "a named radiogroup, the checked radio alone in the tab order", sem)

  const look = await p.$eval('[data-case="position"]', (c) => {
    const track = c.querySelector("[data-segments]")
    const pill = c.querySelector("[data-segment-pill]")
    const btn = c.querySelector("[data-segment]")
    const cs = getComputedStyle(pill)
    return {
      track: getComputedStyle(track).backgroundColor,
      pill: cs.backgroundColor,
      shadow: cs.boxShadow !== "none",
      transition: cs.transitionProperty,
      h: Math.round(btn.getBoundingClientRect().height),
    }
  })
  expect(look.track === "rgb(241, 242, 244)" && look.pill === "rgb(255, 255, 255)" && look.shadow, "a light grey track, a white pill with a shadow", look)
  expect(look.transition === "transform", "  the pill animates its transform and nothing else", look.transition)
  expect(look.h === (kind === "touch" ? 44 : 28), `  ${kind === "touch" ? 44 : 28}px tall`, look.h)

  const cut = await p.$$eval("[data-segment]", (bs) => bs.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent))
  expect(cut.length === 0, "no label is cut in a segment", cut)

  /* Pressed: the pill slides from Top to Bottom. */
  {
    const target = await p.$eval('[data-case="position"] [data-segment="bottom"]', (b) => {
      const r = b.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.left }
    })
    await p.evaluate(() => {
      window.__pillX = []
      window.__frames = []
      const pill = document.querySelector('[data-case="position"] [data-segment-pill]')
      let last = performance.now()
      const loop = (t) => {
        window.__frames.push(t - last)
        last = t
        window.__pillX.push(Math.round(pill.getBoundingClientRect().left))
        if (window.__pillX.length < 30) requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    })
    if (kind === "touch") await p.touchscreen.tap(target.x, target.y)
    else await p.mouse.click(target.x, target.y)
    await sleep(600)
    const xs = await p.evaluate(() => window.__pillX)
    const frames = await p.evaluate(() => window.__frames.slice(1))
    const start = xs[0]
    const end = xs[xs.length - 1]
    const between = xs.filter((x) => x > start + 2 && x < end - 2).length
    const final = await p.$eval('[data-case="position"]', (c) => {
      const pill = c.querySelector("[data-segment-pill]").getBoundingClientRect()
      const btn = c.querySelector('[data-segment="bottom"]').getBoundingClientRect()
      return { pill: [Math.round(pill.left), Math.round(pill.width)], btn: [Math.round(btn.left), Math.round(btn.width)] }
    })
    const max = Math.max(...frames)
    console.log(`        pill left by frame: ${xs.slice(0, 16).join(" ")} ...; frames max ${max.toFixed(1)}ms`)
    expect(between >= 4, "pressed, the pill slides: in-between positions on the way", { between, start, end })
    expect(Math.abs(final.pill[0] - final.btn[0]) <= 1 && Math.abs(final.pill[1] - final.btn[1]) <= 1, "  and lands exactly on the chosen segment", final)
    expect(max <= 34, "  no long frame while it slides", +max.toFixed(1))
    expect((await p.evaluate(() => window.__values.position)) === "bottom", "  the value is Bottom", await p.evaluate(() => window.__values.position))
  }

  /* The keyboard: Right from Bottom goes round to Top, the focus with it. */
  {
    await p.focus('[data-case="position"] [data-segment="bottom"]')
    await p.keyboard.press("ArrowRight")
    await sleep(300)
    const now = await p.evaluate(() => ({ value: window.__values.position, focus: document.activeElement?.getAttribute("data-segment"), checked: document.activeElement?.getAttribute("aria-checked") }))
    expect(now.value === "top" && now.focus === "top" && now.checked === "true", "Arrow Right on the last choice goes round to the first, focus and all", now)
    await p.keyboard.press("ArrowLeft")
    await sleep(100)
    expect((await p.evaluate(() => window.__values.position)) === "bottom", "  Arrow Left goes back round", await p.evaluate(() => window.__values.position))
    await p.keyboard.press("Home")
    await sleep(100)
    expect((await p.evaluate(() => window.__values.position)) === "top", "  Home goes to the first")
  }

  expect((await p.evaluate(() => document.documentElement.scrollWidth)) <= width, `nothing wider than ${width}px`)
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))
  await p.close()
}

try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-segmented.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": "." },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const mouse = await puppeteer.launch({
    executablePath: CHROMIUM,
    args: ["--no-sandbox", "--disable-gpu", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
  await run(mouse, { label: "desktop 1280, mouse", width: 1280, kind: "mouse" })
  await mouse.close()
  const finger = await puppeteer.launch({
    executablePath: CHROMIUM,
    args: ["--no-sandbox", "--disable-gpu", "--blink-settings=primaryHoverType=1,availableHoverTypes=1,primaryPointerType=2,availablePointerTypes=2"],
  })
  await run(finger, { label: "phone 390, touch", width: 390, kind: "touch" })
  await finger.close()
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\n${passed} passed, ${broken} failed`)
process.exit(broken ? 1 : 0)
