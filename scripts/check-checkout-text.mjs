/**
 * ===========================================================================
 *  CHECKOUT TEXT, MEASURED IN A REAL BROWSER
 * ===========================================================================
 * Settings › Checkout › Checkout text (components/app/settings/checkout-text.tsx),
 * the real component from scripts/render-checkout-text.tsx, at 1440x900 and
 * on a 390x844 phone:
 *
 *   LAYOUT    on a wide sheet the list and the preview stand side by side;
 *             on a phone the preview comes first, nothing scrolls sideways,
 *             and every field types at 16px (iOS zooms below that)
 *   DEFAULTS  each word shows what buyers read now beside its field: in
 *             Romanian the hand written words ("Plătește {amount}")
 *   LIVE      what is typed shows in the preview at once, the page the word
 *             is on comes up when its field is focused
 *   SAVED     leaving a field saves the store's own wording (PUT, the word's
 *             key and the value); Reset sends an empty one
 *   GUARDED   a wording that drops {amount} is refused with a line under the
 *             field and nothing is sent
 *
 *   node scripts/check-checkout-text.mjs      (SHOTS_DIR=dir keeps the screenshots)
 */
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const faces = interFaces(root)
const fontDir = (faces.match(/url\(file:\/\/([^)]*\/static\/media)\//) ?? [])[1]
const inter = fontDir ? faces.split(`file://${fontDir}/`).join("/font/") : ""
const stubs = join(root, ".checkout-text-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-checkout-text-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app/settings"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
`)

let server
let browser
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-checkout-text.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": join(stubs, "navigation.js") },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`
  server = createServer((req, res) => {
    const url = new URL(req.url, "http://x")
    if (url.pathname === "/app.js") {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(js)
    }
    if (fontDir && url.pathname.startsWith("/font/")) {
      try {
        res.writeHead(200, { "content-type": "font/woff2" })
        return res.end(readFileSync(join(fontDir, decodeURIComponent(url.pathname.slice(6)))))
      } catch {
        res.writeHead(404)
        return res.end()
      }
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] })

  const open = async (vp) => {
    const page = await browser.newPage()
    page.errors = []
    page.on("pageerror", (e) => page.errors.push(String(e)))
    await page.setViewport(vp)
    await page.goto(origin, { waitUntil: "load" })
    await page.waitForSelector("[data-checkout-text]", { timeout: 10_000 })
    await sleep(200)
    return page
  }
  const PAY = "[data-checkout-word^='checkout:'] input"

  console.log("\nA wide settings sheet, 1440x900")
  const desk = await open({ width: 1440, height: 900, deviceScaleFactor: 1 })
  const layout = await desk.evaluate(() => {
    const aside = document.querySelector("[data-checkout-text] aside").getBoundingClientRect()
    const list = document.querySelector("[data-checkout-text] section").getBoundingClientRect()
    return { asideLeft: aside.left, listRight: list.right, overflow: document.scrollingElement.scrollWidth - innerWidth, groups: [...document.querySelectorAll("[data-checkout-text] section h3")].map((h) => h.textContent) }
  })
  expect(layout.asideLeft >= layout.listRight, "the list and the preview side by side", layout)
  expect(layout.groups.join(",") === "Buttons,Headings,Helper text,Messages", "grouped as Buttons, Headings, Helper text, Messages", layout.groups)
  expect(layout.overflow <= 0, "nothing scrolls sideways", layout.overflow)
  await desk.screenshot({ path: join(shots, "desktop-en.png"), fullPage: true })

  await desk.select("[data-checkout-text-language] ", "ro").catch(() => desk.select("select[data-checkout-text-language]", "ro"))
  await desk.waitForFunction(() => document.querySelector("[data-checkout-text]")?.getAttribute("data-checkout-text") === "ro", { timeout: 5000 })
  await sleep(150)
  const roDefaults = await desk.evaluate(() => [...document.querySelectorAll("[data-checkout-word] p")].slice(0, 3).map((p) => p.textContent))
  expect(roDefaults[0] === "Plătește {amount}", "in Romanian, each word shows the hand written default beside its field", roDefaults)
  const heading = await desk.evaluate(() => [...document.querySelectorAll("[data-preview-word]")].map((e) => e.textContent).find((t) => /către/.test(t)))
  expect(heading === "Plătește către AndrewRullz", "the preview draws the heading above the total with the shop's name", heading)

  const first = await desk.$(PAY)
  await first.click()
  await first.type("Cumpără · {amount}")
  const live = await desk.evaluate(() => document.querySelector("[data-checkout-preview] [data-preview-word]") && [...document.querySelectorAll("[data-checkout-preview] [data-preview-word]")].map((e) => e.textContent).find((t) => /Cumpără/.test(t)))
  expect(live === "Cumpără · amount", "what is typed shows in the preview at once, the amount as its field", live)
  const ring = await desk.evaluate(() => [...document.querySelectorAll("[data-checkout-preview] [data-preview-word]")].find((e) => /Cumpără/.test(e.textContent)).getAttribute("class"))
  expect(/shadow-\[0_0_0_2px/.test(ring), "  and the word being written is marked in it", ring)
  await desk.keyboard.press("Tab")
  await sleep(250)
  let puts = await desk.evaluate(() => window.__puts ?? [])
  expect(puts.length === 1 && puts[0].locale === "ro" && puts[0].items[0].value === "Cumpără · {amount}" && /^checkout:[0-9a-f]{8}$/.test(puts[0].items[0].key), "leaving the field saves the store's wording for that word and language", puts)
  const reset = await desk.$("[data-reset-word]")
  expect(!!reset, "  Reset appears beside a word with the store's own wording")
  await reset.click()
  await sleep(250)
  puts = await desk.evaluate(() => window.__puts ?? [])
  expect(puts.length === 2 && puts[1].items[0].value === "", "  Reset sends an empty wording, so Storelib's shows again", puts.at(-1))

  const again = await desk.$(PAY)
  await again.click({ clickCount: 3 })
  await again.type("Cumpără acum")
  await desk.keyboard.press("Tab")
  await sleep(200)
  const refused = await desk.evaluate(() => ({ alert: document.querySelector("[data-checkout-word] [role=alert]")?.textContent ?? null, puts: (window.__puts ?? []).length }))
  expect(refused.alert === "Keep {amount} in it. It shows the real value." && refused.puts === 2, "a wording that drops {amount} is refused under the field and nothing is sent", refused)

  await desk.focus("[data-checkout-word='ui:add_to_cart'] input")
  await sleep(150)
  const screen = await desk.evaluate(() => document.querySelector("[data-checkout-preview]")?.getAttribute("data-checkout-preview"))
  expect(screen === "cart", "focusing a cart word brings up the cart in the preview", screen)
  await desk.screenshot({ path: join(shots, "desktop-ro.png"), fullPage: true })
  expect(desk.errors.length === 0, "no errors in the page", desk.errors)

  console.log("\nA phone, 390x844")
  const phone = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const small = await phone.evaluate(() => {
    const aside = document.querySelector("[data-checkout-text] aside").getBoundingClientRect()
    const list = document.querySelector("[data-checkout-text] section").getBoundingClientRect()
    const inputs = [...document.querySelectorAll("[data-checkout-word] input")]
    return { previewFirst: aside.bottom <= list.top + 1, overflow: document.scrollingElement.scrollWidth - innerWidth, minFont: Math.min(...inputs.map((i) => parseFloat(getComputedStyle(i).fontSize))), widest: Math.max(...[...document.querySelectorAll("[data-checkout-text] *")].map((e) => e.getBoundingClientRect().right)) }
  })
  expect(small.previewFirst, "the preview comes first", small)
  expect(small.overflow <= 0 && small.widest <= 390.5, "nothing scrolls sideways", small)
  expect(small.minFont >= 16, "every field types at 16px or more", small.minFont)
  await phone.screenshot({ path: join(shots, "phone.png"), fullPage: true })
  expect(phone.errors.length === 0, "no errors in the page", phone.errors)

  console.log(`\nscreenshots: ${shots}`)
} finally {
  await browser?.close()
  server?.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
