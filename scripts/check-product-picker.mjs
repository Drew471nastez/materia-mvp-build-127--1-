/**
 * ===========================================================================
 *  ONE PRODUCT, CHOSEN BY ITS PICTURE, IN THE SIDEBAR
 * ===========================================================================
 * The product picker (components/website-builder/editor/controls/
 * product-list-control.tsx, ProductPickerControl) drawn by its real component at the sidebar's
 * width, with the app's own stylesheet, in headless Chromium:
 *
 *   EMPTY     a "Choose a product" button, nothing typed
 *   OPEN      the shop under it: a picture, a name and a price a row, and a
 *             search box that narrows them
 *   PICK      a click stores the product's page address, as every saved
 *             section holds it, and the chosen product shows with its
 *             picture, name and price; a product with no address is stored
 *             by its id
 *   CHANGE    the list then leaves out the one already chosen; the X clears it
 *   (the editor also offers "This page's product" on the product template)
 *   FIT       nothing wider than the column
 *
 *   node scripts/check-product-picker.mjs          (SHOTS=dir keeps a picture)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import puppeteer from "puppeteer-core"
import sharp from "sharp"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS ?? ""
const root = process.cwd()
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got).slice(0, 300)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const cssPath = join(root, "app/globals.css")
const css = (await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath })).css
const out = mkdtempSync(join(tmpdir(), "storelib-product-picker-"))
execFileSync("npx", [
  "--no-install", "esbuild", join(root, "scripts/render-product-picker.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty",
], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
const colours = [[200, 120, 90], [70, 110, 160], [60, 150, 100]]
const photos = await Promise.all(colours.map(async ([r, g, b]) => `data:image/png;base64,${(await sharp({ create: { width: 96, height: 96, channels: 3, background: { r, g, b } } }).png().toBuffer()).toString("base64")}`))
writeFileSync(join(out, "index.html"),
  `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.__photos=${JSON.stringify(photos)}</script><script src="probe.js"></script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const p = await browser.newPage()
await p.setViewport({ width: 420, height: 900 })
const errors = []
p.on("pageerror", (e) => errors.push(String(e.message || e)))
await p.goto(`file://${join(out, "index.html")}`, { waitUntil: "load" })
await sleep(300)

const state = () => p.evaluate(() => {
  const box = document.querySelector('[data-probe="one"]')
  const chosen = box.querySelector("[data-product-picker] > div.rounded-lg")
  const img = chosen?.querySelector("img")
  const opts = [...document.querySelectorAll('[data-probe="one"] [role="option"], [role="listbox"][aria-label^="Product:"] [role="option"]')]
  const column = document.querySelector("[data-probe-column]").getBoundingClientRect()
  const widest = Math.max(...[...box.querySelectorAll("*")].map((el) => el.getBoundingClientRect().right))
  return {
    value: window.__value,
    button: [...box.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean),
    chosen: chosen ? { title: chosen.querySelector(".font-medium")?.textContent, price: chosen.querySelector(".tabular-nums")?.textContent, img: !!img && img.complete && img.naturalWidth > 0, imgBox: img ? Math.round(img.getBoundingClientRect().width) : 0 } : null,
    options: opts.map((o) => ({ title: o.querySelector(".truncate")?.textContent, img: !!o.querySelector("img") })),
    overflow: Math.round(widest - column.right),
  }
})

console.log("\nEMPTY")
let s = await state()
expect(s.value === "" && s.chosen === null && s.button.includes("Choose a product"), "a Choose a product button and nothing chosen", s)

console.log("\nOPEN")
await p.evaluate(() => [...document.querySelectorAll('[data-probe="one"] button')].find((b) => b.textContent.includes("Choose a product")).click())
await sleep(150)
s = await state()
expect(s.options.length === 4 && s.options.filter((o) => o.img).length === 3, "the shop opens under it, a picture a row", s.options)
if (SHOTS) await p.screenshot({ path: join(SHOTS, "product-picker-open.png") })
await p.type('[data-probe="one"] input[type="search"]', "tote")
await sleep(100)
s = await state()
expect(s.options.length === 1 && s.options[0].title === "Canvas tote", "the search box narrows them", s.options)

console.log("\nPICK")
await p.evaluate(() => document.querySelector('[data-probe="one"] [role="option"] button').click())
await sleep(150)
s = await state()
expect(s.value === "/products/canvas-tote", "a click stores the product's page address", s.value)
expect(s.chosen?.title === "Canvas tote" && s.chosen?.price === "$32.00" && s.chosen?.img && s.chosen?.imgBox === 36, "and shows it with its picture, name and price", s.chosen)
expect(s.button.includes("Change") && s.options.length === 0, "the list closes, and Change is offered", s.button)
if (SHOTS) await p.screenshot({ path: join(SHOTS, "product-picker-chosen.png") })

console.log("\nCHANGE")
await p.evaluate(() => [...document.querySelectorAll('[data-probe="one"] button')].find((b) => b.textContent.trim() === "Change").click())
await sleep(150)
s = await state()
expect(s.options.length === 3 && !s.options.some((o) => o.title === "Canvas tote"), "the list leaves out the one already chosen", s.options)
await p.evaluate(() => [...document.querySelectorAll('[data-probe="one"] [role="option"] button')].find((b) => b.textContent.includes("No address yet")).click())
await sleep(150)
s = await state()
expect(s.value === "p4" && s.chosen?.title === "No address yet", "a product with no address is stored by its id", s)
await p.evaluate(() => document.querySelector('[data-probe="one"] button[aria-label^="Clear"]').click())
await sleep(150)
s = await state()
expect(s.value === "" && s.chosen === null, "the X clears it", s)

console.log("\nFIT")
expect(s.overflow <= 0, "nothing is wider than the sidebar's column", s.overflow)
expect(errors.length === 0, "no page errors", errors)
await browser.close()
if (broken) { console.log(`\n${broken} check(s) failed`); process.exit(1) }
console.log("\nall checks passed")
