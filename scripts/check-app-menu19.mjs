/**
 * ===========================================================================
 *  THE MENU OPENS ON TOP OF EVERY LAYER THE PILL SITS WITH
 * ===========================================================================
 * "While Settings is open, tapping the menu button in the bottom bar does
 * not show the menu": the button turned into an X and nothing appeared,
 * because the menu was drawn under the Settings page.
 *
 * scripts/render-menu19.tsx draws the phone header, the real menu and the
 * real pill over each layer the pill can sit with. For each, at 390x844 with
 * touch, this taps the menu button and asks the screen (elementFromPoint)
 * what is under the middle of the menu's first row and under the header's
 * corner, then taps it again and asks the same. Screenshots go to OUT.
 *
 *   node scripts/check-app-menu19.mjs
 *   OUT=/some/dir node scripts/check-app-menu19.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || process.env.CHROMIUM || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-menu19-"))
const shots = process.env.OUT || join(out, "shots")
mkdirSync(shots, { recursive: true })
writeFileSync(join(out, "navigation.js"), `
const router = { back() {}, push() {}, replace() {}, prefetch() {}, refresh() {}, forward() {} }
export function useRouter() { return router }
export function usePathname() { return window.__path || "/app" }
export function useSearchParams() { return new URLSearchParams() }
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) {
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children)
})
`)

const { build } = await import("esbuild")
const compiled = (p) => join(root, "node_modules/next/dist/compiled", p)
await build({
  entryPoints: [join(root, "scripts/render-menu19.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: {
    "@": ".",
    react: compiled("react"),
    "react-dom": compiled("react-dom"),
    "next/navigation": join(out, "navigation.js"),
    "next/link": join(out, "link.jsx"),
  },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
  loader: { ".css": "empty" },
  outfile: join(out, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(out, "app.js"), "utf8")
const css = await appCss(root)

const SCENES = [
  { name: "home", path: "/app" },
  { name: "settings", path: "/app/settings" },
  { name: "settings-over", path: "/app/settings" },
  { name: "editor", path: "/app/products/p1" },
]
/* The order sidebar.tsx renders the menu and the phone header in, read off the source. */
const sidebar = readFileSync(join(root, "components/app/sidebar.tsx"), "utf8")
const menuFirst = sidebar.indexOf("<MobileMenuPage") < sidebar.indexOf('className="fixed top-0 left-0 right-0 z-50 md:hidden')

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

/** What the screen shows at a point, by the attribute that names the layer. */
const probe = (page) => page.evaluate(() => {
  const at = (x, y) => {
    const el = document.elementFromPoint(x, y)
    if (!el) return "nothing"
    if (el.closest("[data-app-nav-pill]")) return "pill"
    if (el.closest("#app-mobile-menu")) return "menu"
    if (el.closest("[data-app-top-corners]")) return "corner"
    if (el.closest("[data-shell-chrome]")) return "header"
    if (el.closest("[data-settings-sheet-root]")) return "settings"
    if (el.closest("[data-page-layer]")) return "editor"
    return "page"
  }
  const menu = document.getElementById("app-mobile-menu")
  const row = menu.querySelector("nav a, nav button")
  const r = row.getBoundingClientRect()
  const btn = document.querySelector("[data-app-nav-pill] [aria-expanded]")
  const top = menu.getBoundingClientRect().top
  return {
    row: at(r.left + r.width / 2, r.top + r.height / 2),
    middle: at(195, 420),
    expanded: btn.getAttribute("aria-expanded"),
    state: menu.getAttribute("data-mobile-menu"),
    z: getComputedStyle(menu).zIndex,
    top: Math.round(top),
  }
})

for (const scene of SCENES) {
  console.log(`\n${scene.name}`)
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await page.evaluateOnNewDocument((s, p, m) => { window.__scene = s; window.__path = p; window.__menuFirst = m }, scene.name, scene.path, menuFirst)
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  await page.setRequestInterception(true)
  page.on("request", (r) => (r.url().startsWith("http://probe.test/") ? r.respond({ status: 200, contentType: "text/html", body: html }) : r.abort()))
  await page.goto(`http://probe.test${scene.path}`)
  await sleep(900)
  if (errors.length) fail(`The page threw: ${errors[0]}`)
  /* Found again for each tap: with the menu open the group slides right to make room for the settings circle. */
  const tap = async () => {
    const box = await (await page.$("[data-app-nav-pill] [aria-expanded]")).boundingBox()
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  }
  /* The corners take no presses, so the screen's own pixels say whether one is drawn: the header's #111 at the menu's top left. */
  const cornerDrawn = async (top) => {
    const png = await page.screenshot({ clip: { x: 1, y: top + 1, width: 1, height: 1 }, encoding: "base64" })
    const rgb = await page.evaluate((src) => new Promise((done) => {
      const img = new Image()
      img.onload = () => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); done([...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]) }
      img.src = "data:image/png;base64," + src
    }), png)
    return { dark: rgb.every((v) => v < 40), rgb }
  }

  const before = await probe(page)
  expect(before.state === "closed" && before.middle !== "menu", "at rest the menu is shut and not on the screen", before)
  await page.screenshot({ path: join(shots, `${scene.name}-0-rest.png`) })

  await tap()
  await sleep(120)
  await page.screenshot({ path: join(shots, `${scene.name}-1-opening.png`) })
  await sleep(500)
  const opened = await probe(page)
  await page.screenshot({ path: join(shots, `${scene.name}-2-open.png`) })
  expect(opened.expanded === "true" && opened.state === "open", "one tap: the button says open", opened.expanded)
  expect(opened.row === "menu" && opened.middle === "menu", "and the menu is what the screen shows, its first row too", opened)
  if (scene.name !== "editor") {
    const c = await cornerDrawn(opened.top)
    expect(c.dark, "the header's rounded corner is drawn over the menu's top", c.rgb)
  } else {
    expect(opened.top === 0, "over the editor, which hides the header, the menu starts at the top of the screen", opened.top)
  }

  await tap()
  await sleep(450)
  const shut = await probe(page)
  await page.screenshot({ path: join(shots, `${scene.name}-3-shut.png`) })
  expect(shut.expanded === "false" && shut.state === "closed" && shut.middle !== "menu", "a second tap: shut, and the layer under it shows again", shut)
  await page.close()
}

await browser.close()
console.log(`\nScreenshots: ${shots}`)
if (broken) fail(`${broken} check(s) failed.`)
console.log("\nAll good.")
