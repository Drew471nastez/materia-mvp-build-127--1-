/**
 * ===========================================================================
 *  WHERE THE PRODUCT PAGE'S TOP BAR GOES WHEN A MODAL OPENS
 * ===========================================================================
 * "When I open the share modal there, it closes the top bar up there, instead
 *  of leaving it there."
 *
 * It was not closed. A modal locks the page through react-remove-scroll, and
 * what that does was measured on the live site with the share sheet open:
 *
 *   body[data-scroll-locked]   present
 *   body { overflow: hidden; position: relative }
 *
 * A `position: sticky` element sticks to its nearest SCROLLING ancestor. Give
 * the body `overflow: hidden` and there is no longer one, so the element
 * drops to its static place in the document — which on a page scrolled 480px
 * down is 480px above the top of the window. Measured on the real page:
 *
 *   before   top 0      bottom 53
 *   open     top -480   bottom -427
 *
 * This reproduces that with the classes the component actually ships, read
 * out of components/store-builder/discover-sticky-wrapper, and checks that
 * the locked branch stays put where the unlocked one does not.
 *
 *   pnpm build && node scripts/check-sticky-under-modal.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir)
  .filter((f) => f.endsWith(".css"))
  .map((f) => readFileSync(join(cssDir, f), "utf8"))
  .join("\n")

const src = readFileSync(join(root, "components/store-builder/discover-sticky-wrapper.tsx"), "utf8")
const base = src.match(/"(z-30 transition-transform[^"]*)"/)?.[1]
const branch = src.match(/pinned \? "([^"]+)" : "([^"]+)"/)
if (!base || !branch) fail("Could not read the wrapper's classes.")
const [, whenLocked, whenFree] = branch

console.log(`\n  free:   "${whenFree}"`)
console.log(`  locked: "${whenLocked}"\n`)

const SCROLL_Y = 480
const out = mkdtempSync(join(tmpdir(), "storelib-sticky-"))
writeFileSync(
  join(out, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style>
<style>html,body{margin:0;background:#fff;font-family:system-ui}
 .page{height:3000px}
 .bar{height:53px;background:#111;color:#fff}</style></head>
<body><div id="r"></div>
<!-- The bar's parent has to be the tall one: a sticky element only sticks
     inside its own containing block, and a 53px wrapper would scroll away
     with it whether or not anything was locked. -->
<div class="page">
  <div id="barA" class="bar"></div>
  <div style="height:2900px"></div>
</div><script>
var BASE = ${JSON.stringify(base)}
var FREE = ${JSON.stringify(whenFree)}
var LOCKED = ${JSON.stringify(whenLocked)}
var bar = document.getElementById("barA")
var rows = []

function apply(extra) { bar.className = "bar " + BASE + " " + extra; bar.style.top = "0px" }
function lock(on) {
  if (on) {
    document.body.setAttribute("data-scroll-locked", "")
    document.body.style.overflow = "hidden"
    document.body.style.position = "relative"
  } else {
    document.body.removeAttribute("data-scroll-locked")
    document.body.style.overflow = ""
    document.body.style.position = ""
  }
}
function read(name) { rows.push({ name: name, top: Math.round(bar.getBoundingClientRect().top) }) }

window.scrollTo(0, ${SCROLL_Y})
apply(FREE); lock(false); read("sticky, page free")
apply(FREE); lock(true);  read("sticky, page locked")
apply(LOCKED); read("shipped branch, locked")
lock(false)

document.getElementById("r").setAttribute("data-m", JSON.stringify(rows))
</script></body></html>`,
)

const raw = execFileSync(
  CHROMIUM,
  ["--headless", "--disable-gpu", "--no-sandbox", "--window-size=390,844",
   "--virtual-time-budget=4000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
)
const m = raw.match(/data-m="([^"]+)"/)
if (!m) fail("The probe page did not lay out, so nothing was measured.")
const rows = JSON.parse(m[1].replace(/&quot;/g, '"'))
for (const r of rows) console.log(`  ${r.name.padEnd(26)} bar top ${r.top}`)

const free = rows.find((r) => r.name === "sticky, page free")
const broken = rows.find((r) => r.name === "sticky, page locked")
const shipped = rows.find((r) => r.name === "shipped branch, locked")

const problems = []
/**
 * THE CONTROL IS THE SECOND LINE. If a locked page does NOT push the sticky
 * bar off the top here, this probe is not reproducing the thing it exists to
 * catch and the third line proves nothing.
 */
if (!(broken.top < -100)) {
  problems.push(`a locked page left the sticky bar at ${broken.top}; the bug is not being reproduced, so nothing below is measured.`)
}
if (Math.abs(shipped.top - free.top) > 2) {
  problems.push(`with the page locked the bar sits at ${shipped.top}, not ${free.top} where it was. It moves when a modal opens.`)
}

if (problems.length > 0) {
  console.error("")
  for (const p of problems) console.error(`  ${p}`)
  console.error("")
  process.exit(1)
}
console.log("\n  The bar stays where it was while a modal holds the page.\n")
