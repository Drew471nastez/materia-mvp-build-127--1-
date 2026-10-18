/**
 * ===========================================================================
 *  A MENU'S LINKS, DRAGGED INTO AND OUT OF EACH OTHER
 * ===========================================================================
 * The owner: "drag a normal link and drag it under another main so I can
 * drop it as a sublink, or drag it as a normal link there ... very smooth and
 * clean and very accurate ... be very aware of drag and drop on mobile
 * devices and desktop."
 *
 * The real editor (scripts/render-menu-drag-probe.tsx): the header's links,
 * saved as flat blocks, and a store menu, saved as a nested list. At 1280
 * with a mouse and at 390 with a touch screen it drags rows and reads back
 * what was saved:
 *
 *   - a top-level link dropped indented between two sub-links becomes the
 *     middle sub-link; the line shows it first, one 20px step in
 *   - a sub-link dragged to the bottom and left comes out to the top level
 *   - the gap between a link and its first sub-link only takes a sub-link
 *   - a link with sub-links never goes under another
 *   - nothing is saved while held, and a drop is one save
 *   - Escape puts the row back and saves nothing
 *   - the copy follows the pointer
 *   - a store menu (named by place) nests the same way
 *   - on a phone: the grip drags at once; a finger held still on the row
 *     picks it up; a quick swipe on the row only scrolls
 *   - held near the bottom of a long list, it scrolls
 *   - the keyboard: Up, Right, Left on a focused grip
 *
 *   node scripts/check-menu-drag.mjs
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
const stubs = join(root, ".menu-drag-probe")
mkdirSync(stubs, { recursive: true })

let broken = 0
let passed = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (ok) passed++
  else broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const tops = (p) => p.evaluate(() => window.__dragBlocks.filter((b) => !b.settings.parent_id).map((b) => b.id).join(","))
const kids = (p, id) => p.evaluate((id) => window.__dragBlocks.filter((b) => b.settings.parent_id === id).map((b) => b.id).join(","), id)
const saves = (p) => p.evaluate(() => ({ ...window.__dragSaves }))
const menuTree = (p) => p.evaluate(() => window.__dragLinks.map((l) => l.title + (l.links?.length ? `(${l.links.map((c) => c.title).join(",")})` : "")).join(","))

const box = (p, sel) => p.$eval(sel, (el) => {
  el.scrollIntoView({ block: "nearest" })
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom, left: r.left }
})
const grip = (scope, id) => `${scope} [data-link-row="${id}"] > div > [data-link-bar] [data-link-grip]`
const bar = (scope, id) => `${scope} [data-link-row="${id}"] > div > [data-link-bar]`
const line = (p) => p.evaluate(() => {
  const l = [...document.querySelectorAll("[data-link-drop-line]")].find((x) => getComputedStyle(x).opacity === "1")
  if (!l) return null
  const r = l.getBoundingClientRect()
  const list = l.closest("[data-link-list]").getBoundingClientRect()
  return { depth: Number(l.dataset.depth), left: Math.round(r.left - list.left), y: Math.round(r.top) }
})
const ghost = (p) => p.evaluate(() => {
  const g = document.querySelector("[data-link-ghost]")
  if (!g) return null
  const r = g.getBoundingClientRect()
  return { top: Math.round(r.top), left: Math.round(r.left) }
})

/** A pointer: down at `from`, moved in steps to `to`, a look while held, then up (or Escape). */
async function drag(p, kind, from, to, { during, escape = false, hold = 0 } = {}) {
  const steps = 16
  if (kind === "touch") await p.touchscreen.touchStart(from.x, from.y)
  else {
    await p.mouse.move(from.x, from.y)
    await p.mouse.down()
  }
  if (hold) await sleep(hold)
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps
    const y = from.y + ((to.y - from.y) * i) / steps
    if (kind === "touch") await p.touchscreen.touchMove(x, y)
    else await p.mouse.move(x, y)
    await sleep(16)
  }
  await sleep(80)
  const seen = during ? await during() : null
  if (escape) await p.keyboard.press("Escape")
  if (kind === "touch") await p.touchscreen.touchEnd()
  else await p.mouse.up()
  await sleep(260)
  return seen
}

async function run(browser, { label, width, kind }) {
  console.log(`\n${label}`)
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport({ width, height: 860, isMobile: kind === "touch", hasTouch: kind === "touch", deviceScaleFactor: 2 })
  await p.goto(`file://${join(stubs, "index.html")}`)
  await sleep(400)
  const H = "#header-links"

  /* 1. About, a top-level link, dropped indented between Ebooks and Courses. */
  {
    const from = await box(p, grip(H, "about"))
    const courses = await box(p, bar(H, "courses"))
    const before = await saves(p)
    const seen = await drag(p, kind, from, { x: from.x + 22, y: courses.top + 4 }, {
      during: async () => ({ line: await line(p), ghost: await ghost(p), saves: (await saves(p)).header }),
    })
    expect(seen.line && seen.line.depth === 1, "held indented between two sub-links, the line says: a sub-link", seen.line)
    const wantTop = Math.round(courses.top + 4 - (from.y - from.top))
    expect(seen.ghost && Math.abs(seen.ghost.top - wantTop) <= 3, "  the row's copy follows the pointer, to the pixel it was held by", { ghost: seen.ghost?.top, pointer: wantTop })
    expect(seen.saves === before.header, "  nothing is saved while it is held", { before: before.header, during: seen.saves })
    expect((await kids(p, "shop")) === "ebooks,about,courses", "let go, About is Shop's middle sub-link", await kids(p, "shop"))
    expect((await saves(p)).header === before.header + 1, "  saved once", await saves(p))
    expect(!(await p.$("[data-link-ghost]")) && (await p.$$eval("[data-link-row]", (rs) => rs.every((r) => !r.style.opacity))), "  no copy left behind, no row left dimmed")
  }

  /* 2. The line steps in by exactly one level. */
  {
    const from = await box(p, grip(H, "insta"))
    const home = await box(p, bar(H, "home"))
    const flat = await drag(p, kind, from, { x: from.x, y: home.bottom + 2 }, { during: () => line(p), escape: true })
    const from2 = await box(p, grip(H, "insta"))
    const home2 = await box(p, bar(H, "home"))
    const deep = await drag(p, kind, from2, { x: from2.x + 24, y: home2.bottom + 2 }, { during: () => line(p), escape: true })
    expect(flat && deep && flat.depth === 0 && deep.depth === 1 && deep.left - flat.left === 20, "the line moves in one 20px step for a sub-link", { flat, deep })
    expect((await tops(p)) === "home,shop,insta", "  and Escape put it back, nothing saved", await tops(p))
  }

  /* 3. Ebooks, a sub-link, dragged to the bottom and left: out to the top level. */
  {
    const from = await box(p, grip(H, "ebooks"))
    const insta = await box(p, bar(H, "insta"))
    await drag(p, kind, from, { x: from.x - 30, y: insta.bottom + 6 })
    expect((await tops(p)) === "home,shop,insta,ebooks" && (await kids(p, "shop")) === "about,courses", "a sub-link dragged down and left comes out to the top level", { tops: await tops(p), shop: await kids(p, "shop") })
  }

  /* 4. Right under a link with sub-links, only a sub-link fits. */
  {
    const from = await box(p, grip(H, "home"))
    const about = await box(p, bar(H, "about"))
    const seen = await drag(p, kind, from, { x: from.x, y: about.top + 3 }, { during: () => line(p) })
    expect(seen && seen.depth === 1, "the gap above a link's first sub-link takes only a sub-link", seen)
    expect((await kids(p, "shop")) === "home,about,courses", "  Home became Shop's first sub-link", await kids(p, "shop"))
  }

  /* 5. A link with sub-links stays at the top. */
  {
    const from = await box(p, grip(H, "shop"))
    const insta = await box(p, bar(H, "insta"))
    await drag(p, kind, from, { x: from.x + 40, y: insta.bottom + 4 })
    expect((await tops(p)) === "insta,ebooks,shop" || (await tops(p)) === "insta,shop,ebooks", "a link with sub-links moves, and stays a top-level link", await tops(p))
    expect((await kids(p, "shop")) === "home,about,courses", "  with its sub-links", await kids(p, "shop"))
  }

  /* 6. A store menu, named by place, nests the same way. */
  {
    const M = "#menu-links"
    const from = await box(p, grip(M, "2"))
    const about = await box(p, bar(M, "1"))
    await drag(p, kind, from, { x: from.x + 24, y: about.top + 3 })
    expect((await menuTree(p)) === "Shop(Ebooks,Contact),About", "a store menu: Contact dropped under Shop, after Ebooks", await menuTree(p))
  }

  if (kind === "touch") {
    /* 7. A finger held still on the row (not the grip) picks it up. */
    const before = await saves(p)
    const from = await box(p, `${bar("#menu-links", "1")} [data-link-label]`)
    const shop = await box(p, bar("#menu-links", "0"))
    const seen = await drag(p, "touch", from, { x: from.x, y: shop.top + 3 }, { hold: 520, during: () => ghost(p) })
    expect(!!seen, "a finger held on a row for a moment picks it up", seen)
    expect((await menuTree(p)).startsWith("About,Shop") && (await saves(p)).menu === before.menu + 1, "  and drops it where it was let go", await menuTree(p))
    /* 8. A quick swipe on a row is a scroll, not a drag. */
    const s2 = await saves(p)
    const f2 = await box(p, `${bar("#menu-links", "0")} [data-link-label]`)
    const swiped = await drag(p, "touch", f2, { x: f2.x, y: f2.y - 120 }, { during: () => ghost(p) })
    expect(!swiped && (await saves(p)).menu === s2.menu, "a quick swipe on a row lifts nothing and saves nothing", swiped)
  } else {
    /* 7. The keyboard. */
    await p.focus(grip(H, "insta"))
    const order0 = await tops(p)
    await p.keyboard.press("ArrowDown")
    await sleep(120)
    const order1 = await tops(p)
    expect(order0.startsWith("insta") && order1.split(",").indexOf("insta") === 1, "Arrow Down on a focused grip moves the link one place", { order0, order1 })
    await p.focus(grip(H, "insta"))
    await p.keyboard.press("ArrowRight")
    await sleep(120)
    const above = order1.split(",")[0]
    expect((await kids(p, above)).split(",").pop() === "insta", "Arrow Right puts it under the link above", await kids(p, above))
    await p.focus(grip(H, "insta"))
    await p.keyboard.press("ArrowLeft")
    await sleep(120)
    expect(!(await kids(p, above)).includes("insta"), "Arrow Left brings it back out", await tops(p))
  }
  expect((await p.evaluate(() => document.documentElement.scrollWidth)) <= width, `nothing wider than ${width}px`)
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))
  await p.close()

  /* 9. Held near the bottom edge of a long list, it scrolls. */
  const q = await browser.newPage()
  await q.setViewport({ width, height: 860, isMobile: kind === "touch", hasTouch: kind === "touch", deviceScaleFactor: 2 })
  await q.goto(`file://${join(stubs, "index.html")}?many`)
  await sleep(400)
  const from = await box(q, grip(H, "home"))
  const sc = await q.$eval("#scroller", (el) => { const r = el.getBoundingClientRect(); return { bottom: r.bottom } })
  const steps = 10
  if (kind === "touch") await q.touchscreen.touchStart(from.x, from.y)
  else {
    await q.mouse.move(from.x, from.y)
    await q.mouse.down()
  }
  for (let i = 1; i <= steps; i++) {
    const y = from.y + ((sc.bottom - 10 - from.y) * i) / steps
    if (kind === "touch") await q.touchscreen.touchMove(from.x, y)
    else await q.mouse.move(from.x, y)
    await sleep(16)
  }
  await sleep(900)
  const scrolled = await q.$eval("#scroller", (el) => el.scrollTop)
  if (kind === "touch") await q.touchscreen.touchEnd()
  else await q.mouse.up()
  await sleep(250)
  const landed = (await tops(q)).split(",").indexOf("home")
  expect(scrolled > 60, "held at the bottom edge, the list scrolls", scrolled)
  expect(landed >= 6, "  and the link lands further down than the screen showed", landed)
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
    entryPoints: [join(root, "scripts/render-menu-drag-probe.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      "next/navigation": "./.menu-drag-probe/navigation.js",
      "next/link": "./.menu-drag-probe/link.jsx",
      "next/image": "./.menu-drag-probe/image.jsx",
    },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:system-ui,sans-serif;background:#fff}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

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
