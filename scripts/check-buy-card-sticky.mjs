/**
 * ===========================================================================
 *  THE BUY CARD FOLLOWS THE PAGE DOWN, AND THEN STOPS
 * ===========================================================================
 * The card on the right of a product page carries `sticky top-…`, and it did
 * not stick. This measures both halves of what it is supposed to do:
 *
 *   IT FOLLOWS. Scrolled 600px down a long page, the card's top is pinned at
 *   its offset instead of having scrolled away with the page.
 *
 *   AND IT STOPS. A sticky box cannot leave its own containing block, so at
 *   the bottom of the column it parks and the page keeps going. That is the
 *   "until a point" half, and it is the half a `fixed` position would get
 *   wrong.
 *
 * The classes are read out of the product page's own source rather than typed
 * here, so this cannot keep passing after somebody edits the page.
 *
 *   pnpm build && node scripts/check-buy-card-sticky.mjs
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

const page = readFileSync(join(root, "app/(marketing)/p/[slug]/page.tsx"), "utf8")
const gridClass = (page.match(/className="(grid gap-8 lg:grid-cols-5[^"]*)"/) || [])[1]
const colClass = (page.match(/className="(hidden lg:block lg:col-span-2[^"]*)"/) || [])[1]
const cardClass = (page.match(/className="(sticky top-[^"]*rounded-xl border p-6[^"]*)"/) || [])[1]
if (!gridClass) fail("No product grid found in the page.")
if (!colClass) fail("No `hidden lg:block lg:col-span-2` column found — the buy card's column is gone or renamed.")
if (!cardClass) fail("No `sticky top-… rounded-xl border p-6` card found — the buy card is gone or no longer sticky.")
/*
  The questions are a grid item of their own now, which is what bounds the
  card's travel. If they go back inside the left column the grid is one row
  again and the card rides the whole page, so their being a sibling is part
  of what this measures.
*/
const faqIsOwnRow = /<div className="lg:col-span-3 min-w-0 w-full">\s*\n\s*<div data-faq-section>/.test(page)
if (!faqIsOwnRow) fail("The FAQ is not its own grid row any more, so the buy card's travel is unbounded again.")

/*
  NO BACKTICKS BELOW THIS LINE. The page is assembled in a template literal
  and a backtick in the driver ends it early.
*/
const driver = [
  'function run() {',
  '  var card = document.getElementById("card");',
  '  var col = document.getElementById("col");',
  '  var left = document.getElementById("left");',
  '  var faq = document.getElementById("faq");',
  '  var out = {};',
  '  out.leftHeight = Math.round(left.getBoundingClientRect().height);',
  '  out.leftWidth = Math.round(left.getBoundingClientRect().width);',
  '  out.faqWidth = Math.round(faq.getBoundingClientRect().width);',
  '  out.topOffset = getComputedStyle(card).top;',
  '  out.position = getComputedStyle(card).position;',
  '  out.colHeight = Math.round(col.getBoundingClientRect().height);',
  '  out.cardHeight = Math.round(card.getBoundingClientRect().height);',
  '  window.scrollTo(0, 0);',
  '  out.atRest = Math.round(card.getBoundingClientRect().top);',
  '  window.scrollTo(0, 600);',
  '  out.scrolledY = Math.round(window.scrollY);',
  '  out.at600 = Math.round(card.getBoundingClientRect().top);',
  '  window.scrollTo(0, 0);',
  '  out.faqTopDoc = Math.round(faq.getBoundingClientRect().top + window.scrollY);',
  '  out.colBottomDoc = Math.round(col.getBoundingClientRect().bottom + window.scrollY);',
  '  var colTopDoc = col.getBoundingClientRect().top + window.scrollY;',
  '  var colBottomDoc = colTopDoc + col.getBoundingClientRect().height;',
  '  out.pastTheEnd = Math.round(colBottomDoc - out.cardHeight - parseFloat(out.topOffset) + 300);',
  '  window.scrollTo(0, out.pastTheEnd);',
  '  out.atTheEnd = Math.round(card.getBoundingClientRect().top);',
  '  var colRect = col.getBoundingClientRect();',
  '  var cardRect = card.getBoundingClientRect();',
  '  out.parked = Math.round(colRect.bottom - cardRect.bottom);',
  '  /* And the offset is the variable, not a number baked into the class. */',
  '  window.scrollTo(0, 600);',
  '  document.documentElement.style.setProperty("--product-topbar-h", "60px");',
  '  out.topWithBar = getComputedStyle(card).top;',
  '  out.pinnedUnderBar = Math.round(card.getBoundingClientRect().top);',
  '  document.documentElement.style.removeProperty("--product-topbar-h");',
  '  window.scrollTo(0, 0);',
  '  var pre = document.createElement("pre"); pre.id = "result";',
  '  pre.textContent = JSON.stringify({ out: out, errors: window.__err });',
  '  document.body.append(pre);',
  '}',
  'run()',
].join("\n")
if (driver.includes("`")) fail("The driver contains a backtick and would end the page's template literal early.")

/*
  THE REAL ANCESTRY. `<main>` carries overflow-x: clip and <html> carries
  overflow-x: hidden, and one of those two is the usual reason a sticky box
  silently stops being sticky. They are here so the answer is about the page
  rather than about a clean room.
*/
const html = "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + css +
  "\nhtml{overflow-x:hidden}\n</style></head><body style=\"margin:0\">" +
  "<script>window.__err=[];addEventListener(\"error\",function(e){window.__err.push(String(e.message))})</script>" +
  "<main class=\"flex-1 [overflow-x:clip]\">" +
  "<div class=\"mx-auto w-full max-w-[1200px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12\">" +
  "<div class=\"" + gridClass + "\">" +
  "<div id=\"left\" class=\"lg:col-span-3 min-w-0 w-full\" style=\"height:2400px;background:#eef\"></div>" +
  "<div id=\"col\" class=\"" + colClass + "\">" +
  "<div id=\"card\" class=\"" + cardClass + "\" style=\"height:320px;background:#fff\">buy</div>" +
  "</div>" +
  "<div id=\"faq\" class=\"lg:col-span-3 min-w-0 w-full\" style=\"height:900px;background:#efe\"></div>" +
  "</div></div></main>" +
  "<div style=\"height:1200px\"></div>" +
  "<script>" + driver + "</script></body></html>"

const out = mkdtempSync(join(tmpdir(), "storelib-card-"))
writeFileSync(join(out, "index.html"), html)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
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
const offset = parseFloat(o.topOffset)

if (o.position !== "sticky") problems.push("the card computes as position: " + o.position + ", not sticky. `relative` on the same element is winning.")
if (!Number.isFinite(offset)) problems.push("the card's `top` computes to " + o.topOffset + ", so it has nothing to stick to.")
if (o.scrolledY !== 600) problems.push("the page did not scroll (scrollY " + o.scrolledY + "), so nothing below was measured.")

/*
  THE COLUMN HAS TO BE TALLER THAN THE CARD or there is nowhere to travel.
  This is what `align-items: start` on the grid took away: the column
  collapsed to the card's own height and a sticky box in a box its own size
  cannot move.
*/
if (o.colHeight <= o.cardHeight + 50) {
  problems.push("the column is " + o.colHeight + "px around a " + o.cardHeight + "px card, so the card has nowhere to travel — this is the bug, and it is the grid's alignment, not the card.")
}

/* IT FOLLOWS. */
if (o.scrolledY === 600 && Math.abs(o.at600 - offset) > 2) {
  problems.push("at 600px down the card's top is " + o.at600 + "px, not the " + offset + "px it is pinned to — it scrolled away with the page.")
}

/* AND IT STOPS. Scrolled past the end of its own column it must be parked
   there rather than still riding the viewport. */
if (o.colHeight > o.cardHeight + 50) {
  if (o.atTheEnd >= offset - 2) {
    problems.push("scrolled to " + o.pastTheEnd + "px the card is still pinned at " + o.atTheEnd + "px; a card that never stops is a fixed panel, not a sticky one.")
  }
  if (Math.abs(o.parked) > 2) {
    problems.push("parked, the card's bottom is " + o.parked + "px from its column's bottom; it should come to rest flush with it.")
  }
}

/*
  IT LETS GO AT THE QUESTIONS. The card's column must be as tall as the row
  it is in and NO taller — if the FAQ is back inside the left column the grid
  is one row, the column is 3300px rather than 2400px, and the card rides the
  whole thing.
*/
if (o.colHeight !== o.leftHeight) {
  problems.push("the card's column is " + o.colHeight + "px against a " + o.leftHeight + "px row; it is stretching past its own row.")
}
if (o.colBottomDoc > o.faqTopDoc + 2) {
  problems.push("the card's column runs " + (o.colBottomDoc - o.faqTopDoc) + "px into the questions; it is meant to end before them.")
}
/* And the questions keep the width and the place they had. */
if (Math.abs(o.faqWidth - o.leftWidth) > 2) {
  problems.push("the questions are " + o.faqWidth + "px wide against the column's " + o.leftWidth + "px; they changed width when they moved rows.")
}

/*
  THE OFFSET IS THE BAR'S MEASURED HEIGHT, not a number written into the
  class. The bar publishes --product-topbar-h; with it set the card has to
  pin that much lower, or the bar lands on top of it on a scroll up.
*/
if (o.topWithBar !== "84px") {
  problems.push("with the bar reporting 60px the card's `top` is " + o.topWithBar + ", not 84px — the offset is not reading --product-topbar-h.")
}
if (Math.abs(o.pinnedUnderBar - 84) > 2) {
  problems.push("with the bar reporting 60px the card pins at " + o.pinnedUnderBar + "px, not 84px.")
}

if (problems.length) fail(problems.map((x) => "  - " + x).join("\n"))
console.log("\n  pinned at " + offset + "px from 600px down (" + o.topWithBar + " with a 60px bar), parked flush at " + o.colBottomDoc + "px, which is where the questions start (" + o.faqTopDoc + "px).\n")
