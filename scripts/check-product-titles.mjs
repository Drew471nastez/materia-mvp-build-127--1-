/**
 * ===========================================================================
 *  THE TITLE IS SAID ONCE, AND THE PRICE IS THE LOUDEST THING ON THE CARD
 * ===========================================================================
 * A desktop product page said the product's name twice: a 30px heading under
 * the gallery and the buy card's line a column to the right, the same words
 * on one screen. The big one stops at `lg` now and the card's is the heading
 * from there up.
 *
 * Two claims, both about what a browser does at a given width:
 *
 *   ONE TITLE PER WIDTH. Below lg the gallery's heading is the one that
 *   renders and the card is not there at all; at lg and above it is the other
 *   way round. Exactly one, never two, never none — none is the failure
 *   nobody would notice in review and everybody would notice on the page.
 *
 *   AND A HIERARCHY. The price is the biggest thing in the card, the title
 *   sits under it, and neither is the size it was when they were competing.
 *
 * The class strings are read out of the page, so this cannot pass against
 * classes nobody ships.
 *
 *   pnpm build && node scripts/check-product-titles.mjs
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
const galleryTitle = (page.match(/className="(text-2xl sm:text-3xl font-semibold[^"]*)"/) || [])[1]
const cardTitleAnchor = page.indexOf('className="hidden lg:block lg:col-span-2')
const cardTitleMatch = cardTitleAnchor > 0
  ? page.slice(cardTitleAnchor).match(/className="(mb-2 [^"]*)"[\s\S]{0,160}?\{product\.title\}/)
  : null
const cardTitle = cardTitleMatch ? cardTitleMatch[1] : undefined
/*
  THE PRICE IS FOUND BY WHAT IT PRINTS, not by the size class it happens to
  carry. Anchored on `text-4xl` this probe stopped being able to find the
  element the moment somebody changed the size — so a price shrunk back to
  20px read as "no price in the card" rather than as the too-small price it
  was. Whatever size is set, it gets measured.
*/
const cardColumnAt = cardTitleAnchor
if (cardColumnAt < 0) fail("The desktop buy card's column is gone; there is nothing to measure.")
const priceAt = page.indexOf('{product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}', cardColumnAt)
/* The wrapper the price and the discount share, if they share one at all. */
const rowClass = (page.slice(cardColumnAt).match(/className="(flex flex-wrap items-baseline[^"]*)"/) || [])[1]
if (!rowClass) fail("The buy card's price is not inside a `flex flex-wrap items-baseline` row, so the old price and the badge are still a line of their own under it.")
const compareClass = (page.slice(cardColumnAt).match(/className="(text-base line-through)"/) || [])[1] || "text-base line-through"

const beforePrice = priceAt > 0 ? page.slice(Math.max(0, priceAt - 400), priceAt) : ""
const priceClasses = beforePrice.match(/className="([^"]*)"/g) || []
const cardPrice = priceClasses.length
  ? priceClasses[priceClasses.length - 1].slice('className="'.length, -1)
  : undefined
const cardColumn = (page.match(/className="(hidden lg:block lg:col-span-2[^"]*)"/) || [])[1]
if (!galleryTitle) fail("No heading under the gallery found in the page.")
if (!cardTitle) fail("No title line found in the buy card; the probe could not work out which element to measure.")
if (!cardPrice) fail("No price line found in the buy card; the probe could not work out which element to measure.")
if (!cardColumn) fail("No buy card column found.")

/* NO BACKTICKS BELOW THIS LINE — one ends the page's template literal early. */
const driver = [
  'function run() {',
  '  function seen(el) {',
  '    if (!el) return false;',
  '    var cs = getComputedStyle(el);',
  '    if (cs.display === "none" || cs.visibility === "hidden") return false;',
  '    return el.getBoundingClientRect().height > 0 && el.offsetParent !== null;',
  '  }',
  '  function size(el) { return el ? getComputedStyle(el).fontSize : null }',
  '  function weight(el) { return el ? getComputedStyle(el).fontWeight : null }',
  '  var gallery = document.getElementById("gallerytitle");',
  '  var card = document.getElementById("cardtitle");',
  '  var price = document.getElementById("cardprice");',
  '  var compare = document.getElementById("comparePrice");',
  '  var badge = document.getElementById("offBadge");',
  '  function box(el) { var r = el.getBoundingClientRect();',
  '    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } }',
  '  var out = {',
  '    width: window.innerWidth,',
  '    galleryShown: seen(gallery), cardShown: seen(card),',
  '    gallerySize: size(gallery), cardSize: size(card), priceSize: size(price),',
  '    cardWeight: weight(card), priceWeight: weight(price),',
  '    cardTag: card ? card.tagName : null, galleryTag: gallery ? gallery.tagName : null,',
  '    price: box(price), compare: box(compare), badge: box(badge),',
  '  };',
  '  var pre = document.createElement("pre"); pre.id = "result";',
  '  pre.textContent = JSON.stringify({ out: out, errors: window.__err });',
  '  document.body.append(pre);',
  '}',
  'run()',
].join("\n")
if (driver.includes("`")) fail("The driver contains a backtick and would end the page's template literal early.")

const html = "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + css + "</style></head><body style=\"margin:0\">" +
  "<script>window.__err=[];addEventListener(\"error\",function(e){window.__err.push(String(e.message))})</script>" +
  "<div class=\"grid gap-8 lg:grid-cols-5 lg:gap-12 lg:items-start w-full\">" +
  "<div class=\"lg:col-span-3 min-w-0 w-full\">" +
  "<h1 id=\"gallerytitle\" class=\"" + galleryTitle + "\">Geanta Guess Reptila</h1>" +
  "</div>" +
  "<div class=\"" + cardColumn + "\">" +
  "<div class=\"rounded-xl border p-6\">" +
  "<h1 id=\"cardtitle\" class=\"" + cardTitle + "\">Geanta Guess Reptila</h1>" +
  "<div class=\"" + rowClass + "\">" +
  "<div id=\"cardprice\" class=\"" + cardPrice + "\">$350.00</div>" +
  "<div class=\"flex items-center gap-2\">" +
  "<span id=\"comparePrice\" class=\"" + compareClass + "\">$625.00</span>" +
  "<span id=\"offBadge\" style=\"display:inline-block;padding:2px 8px;border-radius:6px;background:#dc2626;color:#fff;font-size:12px\">44% OFF</span>" +
  "</div></div>" +
  "</div></div></div>" +
  "<script>" + driver + "</script></body></html>"

const out = mkdtempSync(join(tmpdir(), "storelib-titles-"))
writeFileSync(join(out, "index.html"), html)

function measure(width) {
  const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--window-size=" + width + ",900", "--force-device-scale-factor=1", "--virtual-time-budget=6000", "--dump-dom",
    "file://" + join(out, "index.html")],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
  const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  if (!m) fail("Nothing reported at " + width + "px. The probe threw before it could answer.")
  const p = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
  if (p.errors && p.errors.length) fail("it threw at " + width + "px: " + p.errors.join(" | "))
  return p.out
}

/*
  THIS CHROMIUM REPORTS innerWidth 500 FOR A 390px WINDOW, which has made a
  correctly-placed thing read as misplaced here before. So the widths below
  are chosen well clear of the lg boundary (1024px) in both directions rather
  than right beside it, and what is asserted is which element renders, not
  what the browser thinks the window is.
*/
const phone = measure(760)
const desktop = measure(1440)
console.log(JSON.stringify({ phone, desktop }, null, 2))

const problems = []

/* ---- one title per width ---------------------------------------------- */
if (!phone.galleryShown) problems.push("below lg nothing shows the title: the heading under the gallery is not rendering.")
if (phone.cardShown) problems.push("below lg the buy card is rendering, so the title is on the screen twice.")
if (desktop.cardShown !== true) problems.push("at 1440px the card's title is not rendering, so a desktop page has no title at all.")
if (desktop.galleryShown) problems.push("at 1440px the heading under the gallery is still rendering — the title is said twice, which is what this change was for.")

/* ---- and it is a heading either way ------------------------------------ */
if (phone.galleryTag !== "H1") problems.push("below lg the title is a " + phone.galleryTag + ", not a heading.")
if (desktop.cardTag !== "H1") problems.push("at 1440px the title is a " + desktop.cardTag + ", not a heading.")

/* ---- the card's hierarchy ---------------------------------------------- */
const cardPx = parseFloat(desktop.cardSize)
const pricePx = parseFloat(desktop.priceSize)
/*
  THE NAME LEADS AND THE PRICE ANSWERS IT, and after three rounds of moving
  them past each other that is now literal: the title is the biggest line on
  the card and the price sits under it. Under a price, a title reads as a
  caption on a number, which is what 14/30, 20/36 and 24/30 all did.
*/
if (!(cardPx > pricePx)) problems.push("the title (" + desktop.cardSize + ") is not bigger than the price (" + desktop.priceSize + "); under a price a title reads as a caption on a number.")
if (cardPx < 28) problems.push("the card's title is " + desktop.cardSize + ", smaller than the 30px heading it replaced.")
if (pricePx > 26) problems.push("the price is " + desktop.priceSize + "; it was asked to come down.")
if (pricePx < 20) problems.push("the price is " + desktop.priceSize + ", which is quieter than the page's body text.")
if (cardPx === pricePx) problems.push("the title is level with the price, so the card has two headings and no hierarchy.")

/*
  ONE ROW. The old price and the badge were a second line under the price,
  which made a discount read as a footnote to it. Vertical overlap is what
  "same row" means — two boxes that share horizontal space but not vertical
  are stacked, whatever the flex classes say.
*/
const overlaps = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
if (overlaps(desktop.price, desktop.compare) <= 0) {
  problems.push("the old price does not overlap the price vertically (price " + desktop.price.top + "-" + desktop.price.bottom + ", old " + desktop.compare.top + "-" + desktop.compare.bottom + "): it is still on a line of its own.")
}
if (overlaps(desktop.price, desktop.badge) <= 0) {
  problems.push("the % OFF badge does not overlap the price vertically: it is still on a line of its own.")
}
/* And they are AFTER it, not stacked on top of it. */
if (!(desktop.compare.left >= desktop.price.right)) {
  problems.push("the old price starts at " + desktop.compare.left + ", left of where the price ends (" + desktop.price.right + ").")
}
if (!(desktop.badge.left >= desktop.compare.right)) {
  problems.push("the badge is not after the old price.")
}

if (problems.length) fail(problems.map((x) => "  - " + x).join("\n"))
console.log("\n  760px: the gallery's " + phone.gallerySize + " heading, and no card.")
console.log("  1440px: the card's " + desktop.cardSize + " heading over a " + desktop.priceSize + " price, and no heading under the gallery.")
console.log("  the price, the old price and the badge share one row: " + desktop.price.top + "-" + desktop.price.bottom + ", " + desktop.compare.top + "-" + desktop.compare.bottom + ", " + desktop.badge.top + "-" + desktop.badge.bottom + ".\n")
