/**
 * ===========================================================================
 *  THE BUY CARD STAYS WHERE IT IS, AND THE FADE DOES NOT UNFIX THE BARS
 * ===========================================================================
 * This card was sticky for three rounds and is not any more. The asking
 * stopped, so the machinery went with it: the stretched column, the questions
 * in a grid row of their own to bound the travel, and the creator bar
 * publishing its own measured height so the card could pin clear of it.
 *
 * What is measured here is that none of it came back. A `sticky` that nobody
 * meant is not a crash — the page renders, the tests pass, and a card quietly
 * follows the reader down again.
 *
 *   IT SCROLLS WITH THE PAGE. Its top moves by exactly what the page moved.
 *
 *   ITS COLUMN IS ITS OWN HEIGHT. A stretched column is the thing that made
 *   sticking possible; start-aligned, the column is the card.
 *
 *   AND THE QUESTIONS ARE BACK IN THE LEFT COLUMN, so the grid is one row.
 *
 * The fourth check is unrelated to any of that and is kept because it guards
 * a trap this repo has hit before: the page arrives on an opacity fade, and a
 * transform, filter or will-change on that wrapper would make it the
 * containing block for the two `position: fixed` bars on a product page.
 *
 *   pnpm build && node scripts/check-buy-card.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error("\n" + m + "\n"); process.exit(1) }
if (!existsSync(CHROMIUM)) fail("No browser at " + CHROMIUM + ".")

const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const cssFiles = [
  ...readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => join(cssDir, f)),
  ...(existsSync(join(root, ".next/static/css"))
    ? readdirSync(join(root, ".next/static/css")).filter((f) => f.endsWith(".css")).map((f) => join(root, ".next/static/css", f))
    : []),
]
if (!cssFiles.length) fail("The build produced no stylesheet, so nothing here would be styled.")
const css = cssFiles.map((f) => readFileSync(f, "utf8")).join("\n").replace(/url\(\.\.\/media\//g, "url(./")

const page = readFileSync(join(root, "app/(storelib)/(marketing)/p/[slug]/page.tsx"), "utf8")
const gridClass = (page.match(/className="(grid gap-8 lg:grid-cols-5[^"]*)"/) || [])[1]
const colClass = (page.match(/className="(hidden lg:block lg:col-span-2[^"]*)"/) || [])[1]
const cardClass = (page.match(/className="(rounded-xl border p-6 shadow-sm relative z-20)"/) || [])[1]
if (!gridClass) fail("No product grid found in the page.")
if (!colClass) fail("No `hidden lg:block lg:col-span-2` column found — the buy card's column is gone or renamed.")
if (!cardClass) fail("The buy card is no longer a plain `rounded-xl border p-6 shadow-sm relative z-20` box; if a position class came back, that is the thing this probe exists to catch.")

/* The source-level half, before a browser is involved at all. */
if (/lg:self-stretch/.test(page)) fail("`lg:self-stretch` is back on the buy card's column. That is what made sticking possible.")
if (/<div className="lg:col-span-3 min-w-0 w-full">\s*\n\s*<div data-faq-section>/.test(page)) {
  fail("The questions are a grid row of their own again. They were only ever moved there to bound a sticky card's travel.")
}
if (!/<div className="mt-8 sm:mt-10" data-faq-section>/.test(page)) {
  fail("The questions no longer carry their own top margin, so they are not back inside the left column.")
}

/* NO BACKTICKS BELOW THIS LINE — one ends the page's template literal early. */
const driver = [
  'function run() {',
  '  var card = document.getElementById("card");',
  '  var col = document.getElementById("col");',
  '  var bar = document.getElementById("fixedbar");',
  '  var out = {};',
  '  out.position = getComputedStyle(card).position;',
  '  out.colHeight = Math.round(col.getBoundingClientRect().height);',
  '  out.cardHeight = Math.round(card.getBoundingClientRect().height);',
  '  window.scrollTo(0, 0);',
  '  out.atRest = Math.round(card.getBoundingClientRect().top);',
  '  window.scrollTo(0, 600);',
  '  out.scrolledY = Math.round(window.scrollY);',
  '  out.at600 = Math.round(card.getBoundingClientRect().top);',
  '  out.fixedTopAt600 = Math.round(bar.getBoundingClientRect().top);',
  '  window.scrollTo(0, 1600);',
  '  out.fixedTopAt1600 = Math.round(bar.getBoundingClientRect().top);',
  '  out.enterAnimation = getComputedStyle(document.getElementById("enter")).animationName;',
  '  window.scrollTo(0, 0);',
  '  var pre = document.createElement("pre"); pre.id = "result";',
  '  pre.textContent = JSON.stringify({ out: out, errors: window.__err });',
  '  document.body.append(pre);',
  '}',
  'run()',
].join("\n")
if (driver.includes("`")) fail("The driver contains a backtick and would end the page's template literal early.")

/* The real ancestry: <main> clips horizontally and <html> hides its overflow,
   and the page arrives inside the enter fade. */
const html = "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + css +
  "\nhtml{overflow-x:hidden}\n</style></head><body style=\"margin:0\">" +
  "<script>window.__err=[];addEventListener(\"error\",function(e){window.__err.push(String(e.message))})</script>" +
  "<main class=\"flex-1 [overflow-x:clip]\">" +
  "<div id=\"enter\" class=\"app-page-enter min-h-screen w-full\">" +
  "<div id=\"fixedbar\" style=\"position:fixed;bottom:0;left:0;right:0;height:60px;background:#222\"></div>" +
  "<div class=\"mx-auto w-full max-w-[1200px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12\">" +
  "<div class=\"" + gridClass + "\">" +
  "<div class=\"lg:col-span-3 min-w-0 w-full\" style=\"height:2400px;background:#eef\"></div>" +
  "<div id=\"col\" class=\"" + colClass + "\">" +
  "<div id=\"card\" class=\"" + cardClass + "\" style=\"height:320px;background:#fff\">buy</div>" +
  "</div></div></div></div></main>" +
  "<div style=\"height:1200px\"></div>" +
  "<script>" + driver + "</script></body></html>"

const out = mkdtempSync(join(tmpdir(), "storelib-card-"))
writeFileSync(join(out, "index.html"), html)

/* A fine pointer that can hover, because headless has none and the stylesheet
   has rules behind `(hover: hover)`. */
const MOUSE = "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"
const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", MOUSE,
  "--window-size=1400,900", "--force-device-scale-factor=1", "--virtual-time-budget=8000", "--dump-dom",
  "file://" + join(out, "index.html")],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })

const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported. The probe threw before it could answer.")
const p = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
if (p.errors && p.errors.length) fail("it threw: " + p.errors.join(" | "))
console.log(JSON.stringify(p.out, null, 2))

const o = p.out
const problems = []

if (o.position === "sticky" || o.position === "fixed") {
  problems.push("the card computes as position: " + o.position + ". It is meant to sit still and let the page go past it.")
}
if (o.scrolledY !== 600) problems.push("the page did not scroll (scrollY " + o.scrolledY + "), so nothing below was measured.")

/* IT GOES WITH THE PAGE. Moved 600px down, its top is 600px higher. */
if (o.scrolledY === 600 && Math.abs((o.atRest - o.at600) - 600) > 2) {
  problems.push("the card moved " + (o.atRest - o.at600) + "px for a 600px scroll; it is being held somewhere.")
}

/* AND ITS COLUMN IS ITS OWN HEIGHT, which is what `lg:items-start` gives and
   what a sticky card needed taken away. */
if (Math.abs(o.colHeight - o.cardHeight) > 2) {
  problems.push("the card's column is " + o.colHeight + "px around a " + o.cardHeight + "px card — it is stretching again, which is how the card used to stick.")
}

/* THE FADE MUST NOT UNFIX THE BARS. Unrelated to the above and kept from the
   probe this replaced: a product page has two `position: fixed` bars, and a
   transform, filter or will-change on the wrapper they arrive inside makes it
   their containing block. `opacity` does not — measured, not assumed. */
if (o.enterAnimation !== "app-page-enter") {
  problems.push("the page's enter animation computes as " + o.enterAnimation + "; the fade is not reaching the wrapper.")
}
if (o.fixedTopAt600 !== o.fixedTopAt1600) {
  problems.push("a fixed bar inside the enter animation moved from " + o.fixedTopAt600 + "px to " + o.fixedTopAt1600 + "px between two scroll positions — the wrapper has become its containing block, so the buy bar would ride the page.")
}

if (problems.length) fail(problems.map((x) => "  - " + x).join("\n"))
console.log("\n  the card computes as " + o.position + ", moves the full " + (o.atRest - o.at600) + "px of a 600px scroll, and its column is its own " + o.colHeight + "px.")
console.log("  a fixed bar inside the fade stays at " + o.fixedTopAt600 + "px through both scroll positions.\n")
