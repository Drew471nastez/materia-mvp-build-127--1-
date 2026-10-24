/**
 * ===========================================================================
 *  SECTIONS AND BLOCKS DRAGGED IN THE SIDEBAR, MEASURED
 * ===========================================================================
 * The owner: "drag and drop like Shopify's theme editor ... the other rows
 * move aside in real time to open a gap where it will land ... on drop it
 * settles smoothly and the canvas reflects the new order live ... smooth,
 * 60fps, mouse, touch and trackpad."
 *
 * The real SectionsList and BlockTreeLevel (scripts/render-sidebar-dnd.tsx)
 * beside a canvas drawn from the same state. At 1280 with a mouse and at 390
 * with a touch screen it drags rows and reads back:
 *
 *   - frame times while a section is carried (requestAnimationFrame deltas)
 *   - the rows it passes slid aside by one row, animated (sampled mid slide)
 *   - the held row under the pointer, to the pixel it was held by
 *   - nothing saved while held, one save on the drop, the order right
 *   - the canvas in the new order after the drop
 *   - no transform left on any row once it settles
 *   - Escape puts it back and saves nothing
 *   - a block among its siblings, a nested block among its own, a static
 *     block with no grip
 *   - held at the bottom edge of a long list, it scrolls; a trackpad scroll
 *     while held carries the row too (mouse only)
 *   - the keyboard: Arrow Down on a focused grip, focus kept, and said aloud
 *
 *   node scripts/check-sidebar-dnd.mjs
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
const stubs = join(root, ".sidebar-dnd-probe")
mkdirSync(stubs, { recursive: true })

let broken = 0
let passed = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (ok) passed++
  else broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const order = (p) => p.evaluate(() => window.__order.join(","))
const canvasOrder = (p) => p.evaluate(() => [...document.querySelectorAll("[data-canvas-section]")].map((e) => e.dataset.canvasSection).join(","))
const saves = (p) => p.evaluate(() => ({ ...window.__saves }))
const sectionGrip = (id) => `[data-section-row="${id}"] span[role="button"][aria-label^="Drag "]`
const sectionRow = (id) => `[data-section-row-wrap="${id}"]`
const blockGrip = (id) => `[data-tree-block="${id}"] > div [data-block-grip]`
const blockRow = (id) => `[data-tree-block="${id}"]`

const box = (p, sel) =>
  p.$eval(sel, (el) => {
    el.scrollIntoView({ block: "nearest" })
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom, h: r.height }
  })

async function down(p, kind, at) {
  if (kind === "touch") await p.touchscreen.touchStart(at.x, at.y)
  else {
    await p.mouse.move(at.x, at.y)
    await p.mouse.down()
  }
}
async function moveTo(p, kind, x, y) {
  if (kind === "touch") await p.touchscreen.touchMove(x, y)
  else await p.mouse.move(x, y)
}
async function up(p, kind) {
  if (kind === "touch") await p.touchscreen.touchEnd()
  else await p.mouse.up()
}

/** Down at `from`, moved in steps to `to`, a look while held, then up (or Escape first). */
async function drag(p, kind, from, to, { during, escape = false, steps = 18 } = {}) {
  await down(p, kind, from)
  for (let i = 1; i <= steps; i++) {
    await moveTo(p, kind, from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
    await sleep(16)
  }
  await sleep(260)
  const seen = during ? await during() : null
  if (escape) await p.keyboard.press("Escape")
  await up(p, kind)
  await sleep(320)
  return seen
}

const translateY = (p, sel) =>
  p.$eval(sel, (el) => {
    const m = getComputedStyle(el).transform
    if (!m || m === "none") return 0
    const v = m.match(/matrix(3d)?\(([^)]+)\)/)
    if (!v) return 0
    const n = v[2].split(",").map(Number)
    return Math.round(v[1] ? n[13] : n[5])
  })

async function run(browser, { label, width, kind }) {
  console.log(`\n${label}`)
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width, height: 860, isMobile: kind === "touch", hasTouch: kind === "touch", deviceScaleFactor: 2 })
  await p.goto(`file://${join(stubs, "index.html")}`)
  await sleep(500)

  /* 1. Section s3 carried down past three rows: frames, displacement, the held row, then the drop. */
  {
    /* Well clear of the scroller's edges, where the list would scroll under the finger (that is case 6). */
    await p.$eval("#scroller", (el) => { el.scrollTop = el.querySelector('[data-section-row-wrap="s2"]').offsetTop - 60 })
    await sleep(100)
    const from = await box(p, sectionGrip("s3"))
    const rowTop = (await box(p, sectionRow("s3"))).top
    const target = await box(p, sectionRow("s6"))
    const rowH = (await box(p, sectionRow("s4"))).h
    const before = await saves(p)
    await p.evaluate(() => {
      window.__frames = []
      let last = performance.now()
      const loop = (t) => {
        window.__frames.push(t - last)
        last = t
        if (window.__frames.length < 400) window.__frameRaf = requestAnimationFrame(loop)
      }
      window.__frameRaf = requestAnimationFrame(loop)
    })
    await down(p, kind, from)
    const steps = 24
    const toY = target.y + 4
    let mid = null
    for (let i = 1; i <= steps; i++) {
      await moveTo(p, kind, from.x, from.y + ((toY - from.y) * i) / steps)
      /* Just after the held row's middle passes s4's: sample s4 as it slides. */
      if (!mid && ((toY - from.y) * i) / steps > rowH * 0.6) {
        await sleep(20)
        const samples = []
        for (let k = 0; k < 6; k++) {
          samples.push(await translateY(p, sectionRow("s4")))
          await sleep(30)
        }
        mid = samples
      }
      await sleep(16)
    }
    await sleep(260)
    const held = await p.evaluate(() => {
      const lifted = document.querySelector("[data-section-lifted]")
      return lifted ? Math.round(lifted.getBoundingClientRect().top) : null
    })
    const shifted = await Promise.all(["s4", "s5", "s6", "s7"].map((id) => translateY(p, sectionRow(id))))
    const during = (await saves(p)).sections
    const frames = await p.evaluate(() => {
      cancelAnimationFrame(window.__frameRaf)
      return window.__frames.slice(2)
    })
    await up(p, kind)
    await sleep(320)
    const sorted = [...frames].sort((a, b) => a - b)
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
    const max = sorted[sorted.length - 1] ?? 0
    const long = frames.filter((f) => f > 34).length
    console.log(`        frames while carried: ${frames.length}, median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms, max ${max.toFixed(1)}ms, over 34ms: ${long}`)
    expect(p95 <= 20 && long <= 2, "frame times while a section is carried: p95 at 60fps, no more than two long frames", { p95: +p95.toFixed(1), max: +max.toFixed(1), long })
    const wantTop = Math.round(rowTop + (toY - from.y))
    expect(held !== null && Math.abs(held - wantTop) <= 2, "the held row follows the pointer, to the pixel it was held by", { held, want: wantTop })
    expect(shifted.slice(0, 3).every((y) => Math.abs(y + rowH) <= 3) && Math.abs(shifted[3]) <= 1, "the three rows it passed slid aside by one row, the next one stayed", { shifted, rowH: Math.round(rowH) })
    const animated = !!mid && mid.some((y) => y < -1 && y > -rowH + 1)
    expect(animated, "  and they slid there (an in-between position sampled mid slide)", mid)
    expect(during === before.sections, "nothing saved while it is held", { before: before.sections, during })
    expect((await order(p)) === "s0,s1,s2,s4,s5,s6,s3,s7,s8,s9", "let go: Image with text lands after s6", await order(p))
    expect((await saves(p)).sections === before.sections + 1, "  saved once", await saves(p))
    expect((await canvasOrder(p)) === (await order(p)), "  and the canvas draws the new order, no reload", await canvasOrder(p))
    const leftover = await p.$$eval("[data-reorder-row]", (rs) => rs.filter((r) => r.style.transform && r.style.transform !== "translate3d(0px, 0px, 0px)").length)
    expect(leftover === 0, "  no row left with a transform once it settles", leftover)
  }

  /* 2. Escape puts it back. */
  {
    const before = await saves(p)
    const from = await box(p, sectionGrip("s0"))
    const to = await box(p, sectionRow("s5"))
    await drag(p, kind, from, { x: from.x, y: to.y }, { escape: true })
    expect((await order(p)) === "s0,s1,s2,s4,s5,s6,s3,s7,s8,s9" && (await saves(p)).sections === before.sections, "Escape while held puts it back and saves nothing", await order(p))
    const said = await p.$eval("[data-reorder-live]", (el) => el.textContent)
    expect(/put back/.test(said ?? ""), "  and says so", said)
  }

  /* 3. A block among its siblings; the static block has no grip. */
  {
    const before = await saves(p)
    const from = await box(p, blockGrip("s1/b1"))
    const to = await box(p, `${blockRow("s1/b3")} > div`)
    await drag(p, kind, from, { x: from.x, y: to.y + 4 })
    const blocks = await p.evaluate(() => window.__blocks.join(","))
    expect(blocks === "b0,b2,b3,b1,b4", "a block dragged down two places lands there", blocks)
    expect((await saves(p)).blocks === before.blocks + 1 && (await saves(p)).sections === before.sections, "  one block save, the sections untouched", await saves(p))
    const canvasBlocks = await p.evaluate(() => [...document.querySelectorAll("[data-canvas-block]")].map((e) => e.dataset.canvasBlock).join(","))
    expect(canvasBlocks === blocks, "  and the canvas's blocks follow", canvasBlocks)
    expect(!(await p.$(`${blockRow("s1/static")} [data-block-grip]`)), "a static block has no grip")
  }

  /* 4. A nested block among its own siblings. */
  {
    const t = await p.$(`${blockRow("s1/b0")} [data-tree-toggle]`)
    if (t && !(await p.$(`[data-tree-children="s1/b0"]`))) {
      await t.click()
      await sleep(200)
    }
    const from = await box(p, blockGrip("s1/b0/c0"))
    const to = await box(p, `${blockRow("s1/b0/c2")} > div`)
    await drag(p, kind, from, { x: from.x, y: to.y + 4 })
    const nested = await p.evaluate(() => window.__nested.join(","))
    expect(nested === "c1,c2,c0", "a nested block dragged to the end of its group lands there", nested)
    expect((await p.evaluate(() => window.__blocks.join(","))) === "b0,b2,b3,b1,b4", "  its parent's level untouched")
  }

  if (kind === "mouse") {
    /* 5. The keyboard. */
    await p.focus(sectionGrip("s0"))
    await p.keyboard.press("ArrowDown")
    await sleep(150)
    expect((await order(p)).startsWith("s1,s0"), "Arrow Down on a focused grip moves the section one place", await order(p))
    const focused = await p.evaluate(() => document.activeElement?.closest("[data-section-row]")?.getAttribute("data-section-row"))
    expect(focused === "s0", "  and the grip keeps focus, so the next press moves it again", focused)
    await sleep(60)
    const said = await p.$eval("[data-reorder-live]", (el) => el.textContent)
    expect(/Moved Hero to position 2 of 10/.test(said ?? ""), "  said aloud", said)
    expect((await canvasOrder(p)) === (await order(p)), "  the canvas follows", await canvasOrder(p))
  }
  expect((await p.evaluate(() => document.documentElement.scrollWidth)) <= width, `nothing wider than ${width}px`)
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))
  await p.close()

  /* 6. Held near the bottom edge of a long list, it scrolls; a trackpad scroll while held carries the row. */
  const q = await browser.newPage()
  await q.setViewport({ width, height: 860, isMobile: kind === "touch", hasTouch: kind === "touch", deviceScaleFactor: 2 })
  await q.goto(`file://${join(stubs, "index.html")}?many`)
  await sleep(500)
  {
    const from = await box(q, sectionGrip("s0"))
    const sc = await q.$eval("#scroller", (el) => el.getBoundingClientRect().bottom)
    await down(q, kind, from)
    for (let i = 1; i <= 10; i++) {
      await moveTo(q, kind, from.x, from.y + ((sc - 10 - from.y) * i) / 10)
      await sleep(16)
    }
    await sleep(900)
    const scrolled = await q.$eval("#scroller", (el) => el.scrollTop)
    await up(q, kind)
    await sleep(320)
    const landed = (await order(q)).split(",").indexOf("s0")
    expect(scrolled > 60, "held at the bottom edge, the list scrolls", scrolled)
    expect(landed >= 8, "  and the section lands further down than the screen showed", landed)
    expect((await canvasOrder(q)) === (await order(q)), "  the canvas follows", null)
  }
  if (kind === "mouse") {
    await q.$eval("#scroller", (el) => { el.scrollTop = 0 })
    await sleep(100)
    const from = await box(q, sectionGrip("s1"))
    const rowTop = (await box(q, sectionRow("s1"))).top
    await down(q, kind, from)
    await moveTo(q, kind, from.x, from.y + 6)
    await sleep(40)
    await moveTo(q, kind, from.x, from.y + 10)
    await sleep(60)
    for (let i = 0; i < 6; i++) {
      await q.mouse.wheel({ deltaY: 60 })
      await sleep(40)
    }
    await sleep(200)
    const scrolled = await q.$eval("#scroller", (el) => el.scrollTop)
    const held = await q.evaluate(() => Math.round(document.querySelector("[data-section-lifted]")?.getBoundingClientRect().top ?? -1))
    await up(q, kind)
    await sleep(320)
    const want = Math.round(rowTop + 10)
    const landed = (await order(q)).split(",").indexOf("s1")
    expect(scrolled > 100 && Math.abs(held - want) <= 2, "a trackpad scroll while held: the list scrolls and the row stays under the pointer", { scrolled, held, want })
    expect(landed >= 4, "  and it lands where it was carried to", landed)
  }
  await q.close()
}

try {
  writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/website-builder/editor/x"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
export const redirect = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-sidebar-dnd.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      "next/navigation": "./.sidebar-dnd-probe/navigation.js",
      "next/link": "./.sidebar-dnd-probe/link.jsx",
      "next/image": "./.sidebar-dnd-probe/image.jsx",
    },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    /* The section compiler is reached through the group rules and asks for node:crypto, which the list never calls. */
    plugins: [{
      name: "node-stub",
      setup(b) {
        b.onResolve({ filter: /^node:/ }, (a) => ({ path: a.path, namespace: "node-stub" }))
        b.onLoad({ filter: /.*/, namespace: "node-stub" }, () => ({ contents: "export const createHash = () => ({ update() { return this }, digest: () => '0' }); export default {}", loader: "js" }))
      },
    }],
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fff}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

  const mouse = await puppeteer.launch({
    executablePath: CHROMIUM,
    args: ["--no-sandbox", "--disable-gpu", "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4"],
  })
  await run(mouse, { label: "desktop 1280, mouse and trackpad", width: 1280, kind: "mouse" })
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
