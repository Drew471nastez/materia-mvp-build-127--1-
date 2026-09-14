/**
 * ===========================================================================
 *  THE PRODUCT PAGE'S BAR, ON A PHONE
 * ===========================================================================
 * The ask was specific and it is all geometry, which is why this measures
 * rather than reads:
 *
 *   1. NO ADDRESS FIELD AND NO FOLLOW BUTTON at phone width. They are still
 *      there at desktop width, so grepping the file proves nothing: both
 *      versions exist in the markup and only the viewport decides which one
 *      a visitor gets. Only a laid-out page can say which is showing.
 *
 *   2. THE BIO IS ONE LINE. Six words is the rule, but six words is not the
 *      guarantee: the guarantee is that the line does not wrap and does not
 *      run past the edge of the bar. Both are measured against the rendered
 *      box, with a bio twice as long as the limit.
 *
 *   3. THE WAY BACK, THE PICTURE AND THE NAME ARE ALL THERE, in that order
 *      across the row.
 *
 *   pnpm build && node scripts/check-product-bar.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-prodbar-"))
const stubs = join(root, ".prodbar-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/p/a-thing"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)

const PROBE = `<script>
function rect(el) { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
function visible(el) {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
}
function shown(sel) { return [...document.querySelectorAll(sel)].filter(visible) }

async function run() {
  await new Promise(function (r) { setTimeout(r, 400) })
  const result = { width: window.innerWidth }
  const bar = document.querySelector("#app > div")
  result.bar = bar ? rect(bar) : null

  result.emails = shown('input[type="email"]').length
  result.buttons = shown('button[type="submit"]').length
  result.back = shown('button[aria-label="Back"]').length
  result.avatars = shown('#app span[data-slot="avatar"], #app [data-slot="avatar"]').length

  // The two lines of text: whatever is showing inside the bar's own link.
  const link = shown("#app a")[0]
  result.texts = link
    ? [...link.querySelectorAll("span")]
        .filter(function (s) { return s.children.length === 0 && s.textContent.trim() })
        .map(function (s) {
          const cs = getComputedStyle(s)
          return {
            text: s.textContent.trim(),
            rect: rect(s),
            lineHeight: cs.lineHeight,
            /* scrollWidth > clientWidth means the ellipsis is doing work. */
            overflowing: s.scrollWidth > s.clientWidth,
          }
        })
    : []

  const pre = document.createElement("pre"); pre.id = "out"; pre.textContent = JSON.stringify(result); document.body.append(pre)
}
if (document.readyState === "complete") run(); else addEventListener("load", run)
</script>`

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-product-bar.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", "--define:process.env.NODE_ENV=\"production\"", "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8"><style>${css}</style>` +
  `<style>body{margin:0}</style></head><body><div id="app"></div>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script>${PROBE}</body></html>`)

function measure(w, h) {
  const dom = execFileSync(CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
     `--window-size=${w},${h}`, "--virtual-time-budget=8000", "--dump-dom", `file://${file}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
  if (!m) fail("Nothing reported. The probe did not run.")
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
}

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got ?? ""}`}`)
  if (!ok) broken++
}

const phone = measure(390, 844)
const desk = measure(1280, 900)

console.log("\non a phone, the bar says who is selling and nothing else")
expect(phone.width < 640, "measured at phone width", phone.width)
expect(phone.emails === 0, "no address field", `${phone.emails} showing`)
expect(phone.buttons === 0, "no follow button", `${phone.buttons} showing`)
expect(phone.back === 1, "the way back is there", phone.back)
expect(phone.avatars === 1, "and the creator's picture", phone.avatars)

console.log("\nthe name, and one line under it")
const name = phone.texts[0]
const bio = phone.texts[1]
expect(!!name && name.text === "AndrewRullz", "the name is the first line", name && name.text)
expect(!!bio, "the bio is the second", phone.texts.map((t) => t.text).join(" | "))
if (bio) {
  const words = bio.text.replace(/…$/, "").trim().split(/\s+/)
  expect(words.length === 6, "cut to six words", `${words.length}: ${bio.text}`)
  expect(/…$/.test(bio.text), "and says it was cut", bio.text)
  /*
     One line, measured rather than assumed: the box is no taller than a
     single line of its own line-height. A wrapped bio doubles this.
  */
  const lh = parseFloat(bio.lineHeight)
  expect(bio.rect.h <= Math.ceil(lh) + 1, "on one line", `${bio.rect.h}px tall, line-height ${bio.lineHeight}`)
  expect(bio.rect.w > 0 && bio.rect.x + bio.rect.w <= phone.bar.w, "inside the bar, not past its edge",
    `ends at ${bio.rect.x + bio.rect.w} of ${phone.bar.w}`)
  expect(name.rect.y < bio.rect.y, "the bio sits under the name", `${name.rect.y} vs ${bio.rect.y}`)
}

console.log("\nand the desktop row is untouched")
expect(desk.emails === 1, "the address field is still there", desk.emails)
expect(desk.buttons === 1, "and the follow button", desk.buttons)

console.log(broken === 0
  ? "\nOn a phone it is a picture, a name and one line. The form stayed on the desktop.\n"
  : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
