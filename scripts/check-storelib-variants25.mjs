/**
 * ===========================================================================
 *  A STORELIB THEME'S PRODUCT SECTION AND ITS ADDRESS, IN A BROWSER
 * ===========================================================================
 * The real ProductSection (scripts/render-product-page.tsx, a shirt in
 * Black and Sand by S, M and L) at 1280 and at 390 with 4x CPU:
 *
 *   arriving with ?variant= opens on that variant: its swatch and pill
 *   pressed, "Colour: Sand" and "Size: M" in the labels, its price
 *   each choice writes ?variant= back, replaced (no new history entry)
 *   a sold out variant: its button says so and cannot be pressed
 *   arriving with no ?variant= keeps a plain address
 *
 *   node scripts/check-storelib-variants25.mjs      (SHOTS_DIR= for pictures)
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const out = mkdtempSync(join(tmpdir(), "storelib-variants25-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
execFileSync("npx", [
  "--no-install", "esbuild", join(root, "scripts/render-product-page.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
const css = await appCss(root)
writeFileSync(join(out, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style></head><body><div id="root"></div><script src="probe.js"></script></body></html>`)

let failed = 0
const check = (label, ok, detail = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const read = (page) => page.evaluate(() => {
  const section = document.querySelector("[data-variant-picker]")
  const legends = [...(section?.querySelectorAll("legend") ?? [])].map((l) => l.textContent.replace(/\s+/g, " ").trim())
  const pressed = [...(section?.querySelectorAll("[aria-pressed='true']") ?? [])].map((b) => b.getAttribute("data-swatch") ?? b.textContent.trim())
  const add = [...document.querySelectorAll("button")].find((b) => /add to cart|sold out|unavailable/i.test(b.textContent ?? ""))
  return { url: location.search, legends, pressed, add: add ? { text: add.textContent.trim(), disabled: add.disabled } : null, history: history.length }
})
const press = (page, value) => page.evaluate((v) => {
  const b = [...document.querySelectorAll("[data-variant-picker] button")].find((x) => (x.getAttribute("data-swatch") ?? x.textContent.trim()) === v)
  b?.click()
  return !!b
}, value)
const settle = (ms) => new Promise((r) => setTimeout(r, ms))

for (const [width, label] of [[1280, "desktop"], [390, "phone"]]) {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message)))
  await page.setRequestInterception(true)
  page.on("request", (r) => (/^https:\/\/img\.test\//.test(r.url()) ? r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="#d8c7a3"/></svg>' }) : r.continue()))
  await page.setViewport({ width, height: width > 800 ? 900 : 844, isMobile: width < 800, hasTouch: width < 800 })
  if (width < 800) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", { rate: 4 })
  const wait = width < 800 ? 900 : 300

  await page.goto(`file://${join(out, "index.html")}?layout=stacked&variant=v-sm`, { waitUntil: "load" })
  await page.waitForSelector("[data-variant-picker]", { timeout: 15_000 }).catch(() => {})
  await settle(wait)
  let r = await read(page)
  check(`${label}: ?variant=v-sm opens on Sand / M`, r.pressed.join() === "Sand,M" && r.legends.join("|") === "Colour: Sand|Size: M", JSON.stringify(r))
  check(`${label}:   and keeps the address it came with`, r.url.includes("variant=v-sm"), r.url)
  const before = r.history
  await press(page, "Black")
  await settle(wait)
  r = await read(page)
  check(`${label}: choosing Black moves to Black / M and writes ?variant=v-bm`, r.pressed.join() === "Black,M" && r.url.includes("variant=v-bm") && r.legends.join("|") === "Colour: Black|Size: M", JSON.stringify(r))
  await press(page, "S")
  await settle(wait)
  r = await read(page)
  check(`${label}: choosing S writes ?variant=v-bs, the label says Size: S`, r.url.includes("variant=v-bs") && r.legends[1] === "Size: S", JSON.stringify(r))
  check(`${label}:   replaced, not pushed: Back still leaves the page`, r.history === before, `${before} then ${r.history}`)
  await press(page, "L")
  await settle(wait)
  r = await read(page)
  check(`${label}: L (only Sand / L, sold out): its address, and the button says so and cannot be pressed`, r.url.includes("variant=v-sl") && r.add?.disabled === true && /sold out/i.test(r.add?.text ?? ""), JSON.stringify(r))
  await page.screenshot({ path: join(shots, `storelib-${label}.png`) })

  await page.goto(`file://${join(out, "index.html")}?layout=stacked`, { waitUntil: "load" })
  await page.waitForSelector("[data-variant-picker]", { timeout: 15_000 }).catch(() => {})
  await settle(wait)
  r = await read(page)
  check(`${label}: arriving with no ?variant= keeps a plain address, on the first that sells`, !r.url.includes("variant=") && r.pressed.join() === "Black,S", JSON.stringify(r))
  check(`${label}: no script error`, errors.length === 0, errors[0] ?? "")
  await page.close()
}
await browser.close()
console.log(failed ? `\n${failed} failed (screenshots in ${shots})` : `\nall passed (screenshots in ${shots})`)
process.exit(failed ? 1 : 0)
