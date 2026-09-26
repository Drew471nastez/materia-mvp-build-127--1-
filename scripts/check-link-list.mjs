/**
 * ===========================================================================
 *  THE SIDEBAR'S LINK LISTS, DRAGGED WITH A FINGER
 * ===========================================================================
 * The header's navigation links and Theme settings › Menus, mounted by
 * scripts/render-link-list.tsx, at 360 and 320 wide with touch, and at 1280
 * with a mouse.
 *
 *   Each link is one row, 44px or taller on a phone, 8px apart.
 *   Opened, a row asks for two things, Label and Link. Remove link is grey
 *   until hovered. No Handle, no Links to, no Submenu links.
 *   A finger on the grip lifts the row (and not the sheet), the others slide
 *   aside, nothing is saved until it lifts, and then the new order is saved
 *   once. The same inside a link's sub-links, and in a menu.
 *   Held near the bottom edge of the scroller, the list scrolls and the row
 *   lands further down.
 *   Nothing is wider than a 320px screen.
 *
 *   node scripts/check-link-list.mjs      (PROBE_CSS=source without a build)
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
const stubs = join(root, ".link-list-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-link-list-")), "shots")
mkdirSync(shots, { recursive: true })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const topOrder = (p) => p.evaluate(() => window.__blocks.filter((b) => !b.settings.parent_id).map((b) => b.id).join(","))
const kidsOf = (p, id) => p.evaluate((id) => window.__blocks.filter((b) => b.settings.parent_id === id).map((b) => b.id).join(","), id)
const saves = (p) => p.evaluate(() => ({ ...window.__saves }))

/** The centre of an element, in the viewport. */
const centre = (p, sel) => p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, bottom: r.bottom } })
/** A computed colour as [r, g, b], whatever space the browser reports it in. */
const rgbOf = (p, sel, pick) => p.evaluate((sel, pick) => {
  const el = pick ? [...document.querySelectorAll(sel)].find((b) => b.textContent.trim() === pick) : document.querySelector(sel)
  if (!el) return null
  const c = document.createElement("canvas")
  c.width = c.height = 1
  const x = c.getContext("2d")
  x.fillStyle = getComputedStyle(el).color
  x.fillRect(0, 0, 1, 1)
  return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3)
}, sel, pick)
const gripOf = (id) => `[data-link-row="${id}"] > div > div > [data-link-grip]`

/** A finger: down on the grip, a slow drag in steps, a look mid-drag, up. */
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
  await sleep(120)
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
  await sleep(120)
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
    const rows = [...document.querySelectorAll('#header-links [data-link-level="top"] > [data-reorder-row]')]
    const bars = rows.map((r) => r.firstElementChild.firstElementChild.getBoundingClientRect().height)
    const gaps = rows.slice(1).map((r, i) => Math.round(r.getBoundingClientRect().top - rows[i].getBoundingClientRect().bottom))
    const add = [...document.querySelectorAll("#header-links button")].find((b) => b.textContent.trim() === "Add link")
    const where = [...document.querySelectorAll("#header-links [data-link-where]")].map((e) => e.textContent)
    return { bars, gaps, add: add ? Math.round(add.getBoundingClientRect().height) : 0, addBorder: add ? getComputedStyle(add).borderTopStyle : "", where, wide: document.documentElement.scrollWidth, text: document.querySelector("#header-links").innerText }
  })
  expect(layout.bars.every((h) => h >= 44), "every link row is 44px or taller", layout.bars)
  expect(layout.gaps.every((g) => g === 8), "rows are 8px apart", layout.gaps)
  expect(layout.add >= 44 && layout.addBorder === "dashed", "Add link is one dashed row at the bottom", { h: layout.add, border: layout.addBorder })
  expect(layout.where.join("|") === "Home|Shop|/products?type=ebook|/products?type=course|About|instagram.com", "each row says where it goes in a few words", layout.where)
  expect(!/Handle|Links to|Submenu|Delete link/.test(layout.text), "no Handle, Links to or Submenu block", layout.text.slice(0, 120))
  expect(layout.wide <= width, `nothing is wider than ${width}px`, layout.wide)
  await p.screenshot({ path: join(shots, `${label}-list.png`), fullPage: true })

  /* ── a finger drags Home below About ── */
  const before = await saves(p)
  const home = await centre(p, gripOf("home"))
  const about = await centre(p, '[data-link-row="about"]')
  const mid = await touchDrag(p, home, about.bottom - 4, {
    during: () => p.evaluate(() => {
      const row = document.querySelector('[data-link-row="home"]')
      return { transform: row.style.transform, z: row.style.zIndex, saves: window.__saves.header, sheetScroll: document.getElementById("scroller").scrollTop }
    }),
  })
  expect(/translate3d\(0px, [1-9]/.test(mid.transform) && mid.z === "20", "the row lifts and follows the finger", mid)
  expect(mid.saves === before.header, "nothing is saved while the finger is down", { before: before.header, during: mid.saves })
  expect((await topOrder(p)) === "shop,about,home,insta", "on release Home lands below About", await topOrder(p))
  expect((await saves(p)).header === before.header + 1, "and the new order is saved once", await saves(p))
  expect((await kidsOf(p, "shop")) === "ebooks,courses", "Shop keeps its sub-links", await kidsOf(p, "shop"))
  expect(await p.evaluate(() => [...document.querySelectorAll("[data-reorder-row]")].every((r) => !r.style.transform)), "no row is left displaced")

  /* ── a sub-link, within its parent ── */
  const courses = await centre(p, gripOf("courses"))
  const ebooks = await centre(p, '[data-link-row="ebooks"]')
  await touchDrag(p, courses, ebooks.top + 4)
  expect((await kidsOf(p, "shop")) === "courses,ebooks", "a sub-link moves above its sibling", await kidsOf(p, "shop"))
  expect((await topOrder(p)) === "shop,about,home,insta", "and the top level does not move", await topOrder(p))

  /* ── a tap opens two fields ── */
  await p.tap('[data-link-row="about"] [aria-expanded]')
  await sleep(150)
  const panel = await p.evaluate(() => {
    const el = document.querySelector('[data-link-row="about"] [data-link-panel]')
    if (!el) return null
    const labels = [...el.querySelectorAll("span.mb-1\\.5")].map((s) => s.textContent)
    const remove = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Remove link")
    return { labels, remove: !!remove, sub: [...el.querySelectorAll("button")].some((b) => b.textContent.trim() === "Add sub-link"), inputs: el.querySelectorAll("input").length }
  })
  expect(panel && panel.labels.join("|") === "Label|Link" && panel.inputs === 2, "an opened link asks for Label and Link, nothing else", panel)
  const rest = await rgbOf(p, '[data-link-row="about"] [data-link-panel] button', "Remove link")
  expect(panel && panel.remove && rest && rest[0] - rest[2] < 30, "Remove link is grey at rest, not red", rest)
  expect(panel && panel.sub, "Add sub-link is a text action in the opened row")
  await p.screenshot({ path: join(shots, `${label}-open.png`), fullPage: true })

  await p.$$eval('[data-link-row="about"] [data-link-panel] button', (bs) => bs.find((b) => b.textContent.trim() === "Add sub-link").click())
  await sleep(150)
  const added = await p.evaluate(() => {
    const kid = window.__blocks.find((b) => b.settings.parent_id === "about")
    const open = kid && document.querySelector(`[data-link-row="${kid.id}"] [data-link-panel] input`)
    return { kid: kid?.settings.label, open: open ? open.value : null }
  })
  expect(added.kid === "New link" && added.open === "New link", "Add sub-link adds one under About, opened", added)

  await p.$$eval("[data-link-panel] button", (bs) => bs.find((b) => b.textContent.trim() === "Remove link").click())
  await sleep(120)
  expect((await kidsOf(p, "about")) === "", "Remove link removes it", await kidsOf(p, "about"))

  /* ── a menu, by finger ── */
  await p.$$eval("#menus button", (bs) => bs.find((b) => b.getAttribute("aria-expanded") !== null && /Footer/.test(b.textContent)).click())
  await sleep(150)
  await p.$eval("#menus", (el) => el.scrollIntoView({ block: "start" }))
  await sleep(150)
  const menuText = await p.$eval("#menus", (el) => el.innerText)
  expect(!/footer ·/.test(menuText), "a menu's handle is not shown", menuText.slice(0, 80))
  const contact = await centre(p, '#menus [data-link-row="2"] [data-link-grip]')
  const shop = await centre(p, '#menus [data-link-row="0"]')
  await touchDrag(p, contact, shop.top + 4)
  const menuOrder = await p.evaluate(() => window.__menus.footer.links.map((l) => l.title).join(","))
  expect(menuOrder === "Contact,Shop,About", "a menu's links reorder by finger and save", menuOrder)
  expect(await p.evaluate(() => document.documentElement.scrollWidth) <= width, `still nothing wider than ${width}px`)
  await p.screenshot({ path: join(shots, `${label}-menu.png`), fullPage: true })

  /* ── near the edge, the scroller scrolls ── */
  await p.goto(`file://${join(stubs, "index.html")}?many`)
  await sleep(400)
  const box = await p.$eval("#scroller", (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom } })
  const g = await centre(p, gripOf("home"))
  await touchDrag(p, g, box.bottom - 12, { hold: 1500 })
  const scrolled = await p.evaluate(() => ({ top: document.getElementById("scroller").scrollTop, order: window.__blocks.filter((b) => !b.settings.parent_id).map((b) => b.id) }))
  expect(scrolled.top > 60, "held at the bottom edge, the list scrolls", scrolled.top)
  expect(scrolled.order.indexOf("home") >= 6, "and the row lands further down than the screen showed", scrolled.order.indexOf("home"))

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
  const bar = await p.$eval('[data-link-row="home"] > div > div', (el) => el.getBoundingClientRect().height)
  expect(bar >= 40, "a row is 40px on a computer", bar)
  const insta = await centre(p, gripOf("insta"))
  const home = await centre(p, '[data-link-row="home"]')
  await mouseDrag(p, insta, home.top + 4)
  expect((await topOrder(p)) === "insta,home,shop,about", "a mouse drags Instagram to the top", await topOrder(p))
  /* The grip, focused, moves with the arrow keys. */
  await p.focus(gripOf("insta"))
  await p.keyboard.press("ArrowDown")
  await sleep(80)
  expect((await topOrder(p)) === "home,insta,shop,about", "Arrow Down on a focused grip moves it one place", await topOrder(p))
  await p.click('[data-link-row="shop"] [aria-expanded]')
  await sleep(120)
  await p.hover("[data-link-panel] [data-link-remove]")
  await sleep(250)
  const red = await rgbOf(p, "[data-link-panel] [data-link-remove]")
  expect(red[0] > 150 && red[2] < 80, "Remove link turns red on hover", red)
  await p.screenshot({ path: join(shots, "desktop-open.png") })
  if (errors.length) expect(false, "no errors on the page", errors)
  await p.close()
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
    entryPoints: [join(root, "scripts/render-link-list.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@": ".",
      "next/navigation": "./.link-list-probe/navigation.js",
      "next/link": "./.link-list-probe/link.jsx",
      "next/image": "./.link-list-probe/image.jsx",
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
