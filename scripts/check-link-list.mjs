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
    const bars = [...document.querySelectorAll("#header-links [data-link-row] > div > div:first-child")].map((b) => Math.round(b.getBoundingClientRect().height))
    const gaps = rows.slice(1).map((r, i) => Math.round(r.getBoundingClientRect().top - rows[i].getBoundingClientRect().bottom))
    const label = document.querySelector('#header-links [data-link-row="home"] [data-link-label]')
    const add = document.querySelector('#header-links [data-link-add="top"]')
    const kid = document.querySelector('#header-links [data-link-row="ebooks"] [data-link-grip]').getBoundingClientRect().left
    const parent = document.querySelector('#header-links [data-link-row="shop"] [data-link-grip]').getBoundingClientRect().left
    const subAdd = document.querySelector('#header-links [data-link-add="shop"]')
    return {
      bars, gaps,
      font: parseFloat(getComputedStyle(label).fontSize),
      add: add ? Math.round(add.getBoundingClientRect().height) : 0,
      addBorder: add ? getComputedStyle(add).borderTopStyle : "",
      where: document.querySelectorAll("#header-links [data-link-where]").length,
      indent: Math.round(kid - parent),
      subAdd: subAdd ? subAdd.textContent.trim() : null,
      wide: document.documentElement.scrollWidth, text: document.querySelector("#header-links").innerText,
    }
  })
  expect(layout.bars.every((h) => h === 44), "every link row is 44px under a thumb", layout.bars)
  expect(layout.gaps.every((g) => g === 0), "rows sit in one box, a hairline apart", layout.gaps)
  expect(layout.font === 15, "a row's name is 15px on a phone", layout.font)
  expect(layout.add === 44 && layout.addBorder === "solid", "Add link is the box's last row", { h: layout.add, border: layout.addBorder })
  expect(layout.where === 0, "where a link goes is not printed again on its row", layout.where)
  expect(layout.indent > 0 && layout.indent <= 24, "a sub-link sits one modest step in", layout.indent)
  expect(layout.subAdd === "Add link to Shop", "the sub-links end with Add link to Shop", layout.subAdd)
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

  /* ── a tap opens two fields, by the panel's own height ── */
  await p.tap('[data-link-row="about"] [aria-expanded]')
  /* Mid-way: the rows under it are on their way down, not already there. */
  await sleep(90)
  const half = await p.evaluate(() => {
    const r = document.querySelector('[data-link-row="about"] [data-link-reveal]')
    return r ? { h: Math.round(r.getBoundingClientRect().height), o: Number(getComputedStyle(r).opacity) } : null
  })
  await sleep(260)
  const done = await p.evaluate(() => {
    const r = document.querySelector('[data-link-row="about"] [data-link-reveal]')
    return r ? { h: Math.round(r.getBoundingClientRect().height), o: Number(getComputedStyle(r).opacity) } : null
  })
  expect(half && done && half.h > 0 && half.h < done.h && done.o === 1, "the panel opens by its height, part way at 90ms", { half, done })
  const panel = await p.evaluate(() => {
    const el = document.querySelector('[data-link-row="about"] [data-link-panel]')
    if (!el) return null
    const labels = [...el.querySelectorAll("span.mb-1\\.5")].map((s) => s.textContent)
    const remove = [...el.querySelectorAll("button")].find((b) => b.textContent.trim() === "Remove link")
    return {
      labels, remove: !!remove,
      sub: [...el.querySelectorAll("button")].some((b) => b.textContent.trim() === "Add link to About"),
      nest: [...el.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => t.startsWith("Move")),
      inputs: el.querySelectorAll("input").length,
    }
  })
  expect(panel && panel.labels.join("|") === "Label|Link" && panel.inputs === 2, "an opened link asks for Label and Link, nothing else", panel)
  const rest = await rgbOf(p, '[data-link-row="about"] [data-link-panel] button', "Remove link")
  expect(panel && panel.remove && rest && rest[0] - rest[2] < 30, "Remove link is grey at rest, not red", rest)
  expect(panel && panel.sub, "Add link to About is a text action in the opened row")
  expect(panel && panel.nest === "Move under Shop", "and so is Move under Shop", panel && panel.nest)
  await p.screenshot({ path: join(shots, `${label}-open.png`), fullPage: true })

  await p.$$eval('[data-link-row="about"] [data-link-panel] button', (bs) => bs.find((b) => b.textContent.trim() === "Add link to About").click())
  await sleep(150)
  const added = await p.evaluate(() => {
    const kid = window.__blocks.find((b) => b.settings.parent_id === "about")
    const open = kid && document.querySelector(`[data-link-row="${kid.id}"] [data-link-panel] input`)
    return { kid: kid?.settings.label, open: open ? open.value : null }
  })
  expect(added.kid === "New link" && added.open === "New link", "Add sub-link adds one under About, opened", added)

  await sleep(200)
  await p.$$eval("[data-link-reveal]:not([inert]) [data-link-panel] button", (bs) => bs.find((b) => b.textContent.trim() === "Remove link").click())
  await sleep(120)
  expect((await kidsOf(p, "about")) === "", "Remove link removes it", await kidsOf(p, "about"))

  /* ── a finger drags Instagram right: it goes under Home, the link above it ── */
  await sleep(250)
  const flat = () => p.evaluate(() => window.__blocks.filter((b) => b.type === "nav_link").map((b) => b.id).join(","))
  const instaGrip = await centre(p, gripOf("insta"))
  const sideways = async (from, dx) => {
    await p.touchscreen.touchStart(from.x, from.y)
    for (let i = 1; i <= 10; i++) {
      await p.touchscreen.touchMove(from.x + (dx * i) / 10, from.y)
      await sleep(16)
    }
    const seen = await p.evaluate(() => ({
      transform: document.querySelector('[data-link-row="insta"]').style.transform,
      intent: document.querySelector('[data-link-nesting]')?.getAttribute("data-link-nesting") ?? null,
    }))
    await p.touchscreen.touchEnd()
    await sleep(150)
    return seen
  }
  const held = await sideways(instaGrip, 34)
  expect(/translate3d\(20px, 0px/.test(held.transform) && held.intent === "in", "held right, the row moves one step in and says it will nest", held)
  const nested = await p.evaluate(() => window.__blocks.find((b) => b.id === "insta").settings.parent_id)
  expect(nested === "home", "let go, Instagram is a sub-link of Home", nested)
  expect((await flat()).endsWith("home,insta"), "and it follows Home in the saved list", await flat())

  /* ── the opened sub-link says Move out of Home ── */
  await p.tap('[data-link-row="insta"] [aria-expanded]')
  await sleep(300)
  const outLabel = await p.$eval('[data-link-row="insta"] [data-link-unnest]', (b) => b.textContent.trim()).catch(() => null)
  expect(outLabel === "Move out of Home", "an opened sub-link offers Move out of Home", outLabel)
  await p.tap('[data-link-row="insta"] [data-link-unnest]')
  await sleep(150)
  const out = await p.evaluate(() => ({ has: "parent_id" in window.__blocks.find((b) => b.id === "insta").settings }))
  expect(!out.has && (await topOrder(p)).endsWith("home,insta"), "and it comes back out, right after Home", { ...out, order: await topOrder(p) })

  /* ── Shop has sub-links, so it cannot go under About: three levels are not drawn ── */
  await sleep(250)
  const shopGrip = await centre(p, gripOf("shop"))
  await p.evaluate(() => { window.__before = window.__saves.header })
  const refused = await sideways(shopGrip, 40)
  void refused
  expect(await p.evaluate(() => !window.__blocks.find((b) => b.id === "shop").settings.parent_id && window.__saves.header === window.__before), "a link with sub-links does not nest", await p.evaluate(() => window.__saves.header - window.__before))

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
  const font = await p.$eval('[data-link-row="home"] [data-link-label]', (el) => parseFloat(getComputedStyle(el).fontSize))
  expect(bar === 36 && font === 13, "a row is 36px with 13px type on a computer", { bar, font })
  const insta = await centre(p, gripOf("insta"))
  const home = await centre(p, '[data-link-row="home"]')
  await mouseDrag(p, insta, home.top + 4)
  expect((await topOrder(p)) === "insta,home,shop,about", "a mouse drags Instagram to the top", await topOrder(p))
  /* The grip, focused, moves with the arrow keys. */
  await p.focus(gripOf("insta"))
  await p.keyboard.press("ArrowDown")
  await sleep(80)
  expect((await topOrder(p)) === "home,insta,shop,about", "Arrow Down on a focused grip moves it one place", await topOrder(p))
  /* Right puts it under the link above, Left takes it back out. */
  await p.focus(gripOf("insta"))
  await p.keyboard.press("ArrowRight")
  await sleep(80)
  expect((await kidsOf(p, "home")) === "insta", "Arrow Right nests Instagram under Home", await kidsOf(p, "home"))
  await p.focus(gripOf("insta"))
  await p.keyboard.press("ArrowLeft")
  await sleep(80)
  expect((await kidsOf(p, "home")) === "" && (await topOrder(p)) === "home,insta,shop,about", "Arrow Left brings it back out where it was", await topOrder(p))
  await p.click('[data-link-row="shop"] [aria-expanded]')
  /* Past the 200ms the panel takes to open: mid-way it is still clipped. */
  await sleep(320)
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
