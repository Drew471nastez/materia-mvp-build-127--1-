/**
 * ===========================================================================
 *  THE WHITE BAND UNDER A SHORT PAGE
 * ===========================================================================
 * "On a page with fewer sections there is always an empty white gap at the
 * bottom."
 *
 * The canvas card is a fixed-height white box and the page is drawn inside
 * it. A page shorter than the card leaves the card showing, and the card is
 * white whatever the site's own background is — so the tail of every short
 * page is a colour the published site never shows there.
 *
 * This mounts the real ThemePage with a header, a footer and no body inside a
 * box the height of a canvas, and measures three things:
 *
 *   how far the page's own painted area falls short of the card
 *   what colour is actually under the last pixel of the card
 *   where the footer ends up
 *
 *   pnpm build && node scripts/check-short-page.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-shortpage-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-short-page.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:node:crypto=${join(root, ".wb-probe/crypto-stub.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

const DRIVE = `
<script>
setTimeout(function () {
  var card = document.getElementById("card")
  var page = document.querySelector("[data-theme-root], #card [style*='background']")
  var root = document.querySelector("#canvas > div")
  var footer = document.querySelector('[data-section="footer"], #card [id^="section-f"], #card [id$="-f"]')
  var cb = card.getBoundingClientRect()
  var rb = root ? root.getBoundingClientRect() : null
  /* The last pixel inside the card: what a person actually sees down there. */
  var atBottom = document.elementFromPoint(Math.round(cb.left + cb.width / 2), Math.round(cb.bottom - 3))
  var paint = atBottom ? getComputedStyle(atBottom).backgroundColor : null
  var chain = []
  for (var n = atBottom; n && n !== document.documentElement; n = n.parentElement) {
    var bg = getComputedStyle(n).backgroundColor
    chain.push((n.id ? "#" + n.id : n.tagName.toLowerCase()) + " " + bg)
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") break
  }
  var pre = document.createElement("pre")
  pre.id = "result"
  pre.textContent = JSON.stringify({
    cardHeight: Math.round(cb.height),
    pageHeight: rb ? Math.round(rb.height) : null,
    shortfall: rb ? Math.round(cb.bottom - rb.bottom) : null,
    footerBottom: footer ? Math.round(footer.getBoundingClientRect().bottom - cb.top) : null,
    underTheLastPixel: chain.join(" -> "),
    paint: paint,
  })
  document.body.append(pre)
}, 300)
</script>`

const page = (pageStyle, fillStyle) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#e9eaec;font-family:Inter,system-ui,sans-serif}
  #app{padding:20px}
  *,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}
</style></head><body><div id="app"></div>
<script>window.__pageStyle=${JSON.stringify(pageStyle)};window.__fillStyle=${JSON.stringify(fillStyle)}</script>
<script src="probe.js"></script>${DRIVE}</body></html>`

function measure(label, pageStyle, fillStyle) {
  const file = join(out, `${label}.html`)
  writeFileSync(file, page(pageStyle, fillStyle))
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--window-size=1000,820", "--virtual-time-budget=15000", "--run-all-compositor-stages-before-draw",
    "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail(`${label}: the page never reported.`)
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  return JSON.parse(decode(m[1]))
}

/*
 * THE RULE IS NOT "THE BOTTOM IS THE THEME'S BACKGROUND".
 *
 * On a page with nothing in it the footer grows to the bottom, so the last
 * pixel is the FOOTER's colour, and that is right. What may never be down
 * there is the CARD — the editor's own white, which no visitor ever sees
 * under a page. So the test is where the paint comes from, not what it is.
 */

const before = measure("plain", undefined, undefined)
console.log(`\nThe page, in a card taller than it is:`)
console.log(`  card ${before.cardHeight}px, page ${before.pageHeight}px, so ${before.shortfall}px of card below the page`)
console.log(`  footer ends ${before.footerBottom}px down`)
console.log(`  under the card's last pixel: ${before.underTheLastPixel}`)

/* The same page with the placeholder told to grow, which is what the editor
   does. Everything else is ThemePage's own doing. */
const after = measure("filled", undefined, { flex: "1 1 auto" })
console.log(`\nWith the placeholder growing:`)
console.log(`  card ${after.cardHeight}px, page ${after.pageHeight}px, so ${after.shortfall}px of card below the page`)
console.log(`  footer ends ${after.footerBottom}px down`)
console.log(`  under the card's last pixel: ${after.underTheLastPixel}`)

const problems = []
if (after.shortfall > 1) problems.push(`The page still stops ${after.shortfall}px short of the card, so the card shows below it.`)
if (/#card/.test(after.underTheLastPixel)) problems.push(`The last pixel inside the card is painted by the card itself (${after.underTheLastPixel}). That is the editor's own white, which the published page never shows there.`)
if (after.footerBottom === null) problems.push(`The footer was not found, so nothing below was measured.`)
else if (after.footerBottom < after.cardHeight - 1) problems.push(`The footer ends ${after.cardHeight - after.footerBottom}px above the bottom of the card. On a page with nothing in it the footer is the end of the page.`)

if (problems.length) {
  console.error(`\n${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log(`\nA page with nothing in it fills its card, and the colour under it is the site's own.\n`)
