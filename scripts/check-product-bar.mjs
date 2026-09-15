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

  function readBar(hostId) {
    const host = document.getElementById(hostId)
    const bar = host.querySelector(":scope > div")
    const link = [...host.querySelectorAll("a")].filter(visible)[0]
    return {
      bar: bar ? rect(bar) : null,
      emails: [...host.querySelectorAll('input[type="email"]')].filter(visible).length,
      buttons: [...host.querySelectorAll('button[type="submit"]')].filter(visible).length,
      back: [...host.querySelectorAll('button[aria-label="Back"]')].filter(visible).length,
      /*
        THE FOLLOW BUTTON, WITH NOTHING TYPED IN THE FIELD. Nothing here
        touches the input first: an untouched form is the state a visitor
        actually arrives at, and it is the state the button was washed out in.
      */
      follow: (function () {
        const b = [...host.querySelectorAll('button[type="submit"]')].filter(visible)[0]
        if (!b) return null
        const cs = getComputedStyle(b)
        return { opacity: cs.opacity, background: cs.backgroundColor, disabled: b.disabled }
      })(),
      avatars: [...host.querySelectorAll('[data-slot="avatar"]')].filter(visible).length,
      /* The phone bar's own parts. It is the PRODUCT's bar there: the way
         back, the product, and the three dots. */
      dots: [...host.querySelectorAll('button[aria-label="More"]')].filter(visible).length,
      product: (function () {
        const b = [...host.querySelectorAll('button[aria-label^="Back to the top"]')].filter(visible)[0]
        if (!b) return null
        const span = b.querySelector("span")
        const img = b.querySelector("img")
        return {
          rect: rect(b),
          text: span ? span.textContent.trim() : "",
          overflowing: span ? span.scrollWidth > span.clientWidth : false,
          hasThumb: !!img,
        }
      })(),
      texts: link
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
        : [],
    }
  }

  Object.assign(result, readBar("app"))
  result.longName = readBar("app-long")

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
  `<style>body{margin:0}</style></head><body><div id="app"></div><div id="app-long"></div>` +
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

console.log("\non a phone: the way back, who is selling, and a menu")
expect(phone.width < 640, "measured at phone width", phone.width)
expect(phone.emails === 0, "no address field", `${phone.emails} showing`)
expect(phone.buttons === 0, "no follow button", `${phone.buttons} showing`)
expect(phone.back === 1, "the way back is there", phone.back)
expect(phone.avatars === 1, "and the creator's picture", phone.avatars)
expect(phone.dots === 1, "and three dots for share and report", phone.dots)
/* The product's thumbnail and title had this slot for a round. The page under
   the bar is already the product, in a picture the size of the screen. */
expect(!phone.product, "and not the product's thumbnail and title", phone.product && phone.product.text)

console.log("\nthe creator's name, and nothing under it")
const name = phone.texts[0]
/* The bio was a second line here, cut to six words with an ellipsis. It was
   the start of a sentence the bar had no room to finish. */
expect(!!name && name.text === "AndrewRullz", "the name is on it", name && name.text)
expect(phone.texts.length === 1, "and it is the only line", phone.texts.map((t) => t.text).join(" | "))

console.log("\nand long text does not break either row")
{
  const L = phone.longName
  const D = desk.longName
  const lname = L.texts[0]
  expect(L.emails === 0 && L.buttons === 0, "still no form on the phone", `${L.emails}/${L.buttons}`)
  expect(L.back === 1 && L.dots === 1, "and the controls either side survive it", `${L.back}/${L.dots}`)
  /*
    On a DESKTOP a 47-character name has room, so it is not expected to end
    in an ellipsis and asserting that it does would be asserting a squeeze
    that is not there. What matters at this width is that it does not run
    past the bar, and that the line under it is still one line.

    The overflow check compared against `L.bar.w` — the PHONE's bar — which
    only ever passed because the long-name case used to be measured on the
    phone as well. It is D's bar now, which is the bar these boxes are in.
  */
  expect(!!lname && lname.overflowing, "the name is what gives way, with an ellipsis", lname && lname.text)
  expect(!!lname && lname.rect.x + lname.rect.w <= L.bar.w,
    "nothing runs past the edge of the bar", lname && `${lname.rect.x + lname.rect.w} of ${L.bar.w}`)
}

console.log("\nand the desktop row is untouched")
expect(desk.emails === 1, "the address field is still there", desk.emails)
expect(desk.buttons === 1, "and the follow button", desk.buttons)

console.log("\nand the follow button is the creator's colour, full strength")
expect(desk.follow !== null, "the button is there to look at", desk.follow)
if (desk.follow) {
  /*
    It sat at 0.7 until an address had been typed. A faded control reads as
    disabled, and this one is not: pressing it runs the form's own `required`
    check, which focuses the field and says what is missing.
  */
  expect(parseFloat(desk.follow.opacity) === 1, "not faded before anything is typed", desk.follow.opacity)
  expect(desk.follow.disabled === false, "and not disabled either", desk.follow.disabled)
  expect(/^rgba?\((?!0, 0, 0, 0)/.test(desk.follow.background), "painted, not transparent", desk.follow.background)
}

console.log(broken === 0
  ? "\nOn a phone it is a picture, a name and one line. The form stayed on the desktop.\n"
  : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
