/**
 * ===========================================================================
 *  A COUNTDOWN'S DATE CHANGED IN THE CANVAS, AND NOTHING ELSE STARTED AGAIN
 * ===========================================================================
 * The canvas bridge (lib/storelib-theme/compat/canvas-bridge.ts) in headless
 * Chromium, on a product section holding a picture and a countdown block.
 * The builder sends the section drawn with a new end date, as it does for a
 * setting edit, and this measures:
 *
 *   • the countdown's custom element is made again and shows the new date;
 *   • the product's <img> is the same element, never decoded again;
 *   • the section element itself is not swapped;
 *   • changed again and again, it shows each value and the picture stays;
 *   • a read-once value outside a custom element still swaps the section
 *     (the theme's script can only start again with the section).
 *
 *   node scripts/check-countdown-restart.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error("no browser"); process.exit(1) }
const out = mkdtempSync(join(tmpdir(), "storelib-countdown-restart-"))
execFileSync("pnpm", ["exec", "esbuild", join(root, "lib/storelib-theme/compat/canvas-bridge.ts"), "--format=esm", "--platform=neutral", `--outfile=${join(out, "bridge.mjs")}`, "--log-level=error"], { cwd: root, stdio: "inherit" })
const { CANVAS_BRIDGE } = await import(join(out, "bridge.mjs"))

const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=="
const sectionHtml = (end, plain = "x") =>
  `<div id="shopify-section-main" class="shopify-section"><div class="product"><img class="media" src="${PIXEL}" width="10" height="10">` +
  `<div class="info" data-plain="${plain}"><countdown-timer class="cd" data-end="${end}"><span class="out"></span></countdown-timer></div></div></div>`

const page = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script>
  window.made = 0;
  customElements.define("countdown-timer", class extends HTMLElement {
    constructor() { super(); window.made++; }
    connectedCallback() { var o = this.querySelector(".out"); /* parsed: its children come after it connects */ if (o) o.textContent = "ends " + this.dataset.end; }
  });
</script>
${sectionHtml("2026-11-03")}
<script>${CANVAS_BRIDGE}</script>
</body></html>`

const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(page) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`); if (!ok) broken++ }

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const p = await browser.newPage()
const errors = []
p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 600)))
await p.goto(origin, { waitUntil: "load" })
await sleep(300)
await p.evaluate(() => {
  window.img = document.querySelector("img.media")
  window.sec = document.getElementById("shopify-section-main")
  window.img.__mark = 1
})
const send = (html, prev) => p.evaluate((h, pv) => window.postMessage({ storelib: 1, type: "section", id: "main", html: h, prev: pv }, "*"), html, prev)
const state = () => p.evaluate(() => ({
  text: document.querySelector("countdown-timer .out")?.textContent,
  sameImg: document.querySelector("img.media") === window.img,
  sameSection: document.getElementById("shopify-section-main") === window.sec,
  made: window.made,
}))

console.log("\na countdown's end date changed in a product section")
const first = await state()
await send(sectionHtml("2028-02-29"), sectionHtml("2026-11-03"))
await sleep(1100)
const after = await state()
expect(after.text === "ends 2028-02-29", "the countdown shows the new date", after.text)
expect(after.made === first.made + 1, "its element was made again, once", { before: first.made, after: after.made })
expect(after.sameImg, "the product picture is the same element, not decoded again")
expect(after.sameSection, "the section was not swapped")

let prev = sectionHtml("2028-02-29")
const values = ["2026-12-24", "2027-01-01", "2026-12-24", "2030-06-30"]
for (const v of values) {
  await send(sectionHtml(v), prev)
  prev = sectionHtml(v)
  await sleep(900)
}
const many = await state()
expect(many.text === "ends 2030-06-30" && many.sameImg && many.sameSection, "changed four times: the last value shown, the picture and section kept", many)

console.log("\na read-once value outside a custom element")
await send(sectionHtml("2030-06-30", "y"), prev)
await sleep(1100)
const plain = await state()
expect(!plain.sameSection, "the section is swapped as before, so the theme's script starts with it", plain)
expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))

await browser.close()
server.close()
console.log(broken ? `\n${broken} failed` : "\nall passed")
process.exit(broken ? 1 : 0)
