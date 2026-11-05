/**
 * ===========================================================================
 *  THE DESKTOP BUY BAR, AND THE CHEVRON THAT REPLACED A GREY FILL
 * ===========================================================================
 * Two claims that are about geometry and colour, so they are measured here
 * rather than argued in a commit message.
 *
 *  1. THE BUY BAR. The real component is rendered at 1200px and the row is
 *     measured: the product's picture at the left, square and rounded, then
 *     its name, and at the other end the price and then the button. One row,
 *     with the rating under the title rather than beside the button.
 *
 *  2. THE CHEVRON. The classes come out of the product page's own source, so
 *     this cannot pass with classes nobody ships. What is measured is that
 *     the arrow is VISIBLE AT REST — the grey fill it replaced only existed
 *     under a pointer, which is most of the reason it was the wrong answer —
 *     and that the hover rule moves it a real distance.
 *
 * WHAT THIS CANNOT DO. Headless Chromium here has no pointer, so :hover is
 * never entered. The hover rule is found in the CSSOM and applied to the
 * element, and the movement is then measured for real; that catches a rule
 * that does not parse, a media query that never matches and a transform that
 * computes to nothing, but it is not a mouse. Said plainly rather than
 * dressed up as one.
 *
 *   pnpm build && node scripts/check-product-bars.mjs
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
/* next/font's `url(../media/…)` resolves to nothing from a temp dir; the face
   does not matter to a box measurement, but a 404 per glyph does not help. */
const css = cssFiles.map((f) => readFileSync(f, "utf8")).join("\n").replace(/url\(\.\.\/media\//g, "url(./")

/*
  THE CLASSES COME OUT OF THE PAGE. Copying them here by hand would make this
  a probe of a copy — it would keep passing after somebody edited the page.
*/
const page = readFileSync(join(root, "app/(storelib)/(marketing)/p/[slug]/page.tsx"), "utf8")
const linkClass = (page.match(/className="(creator-link inline-flex[^"]*)"/) || [])[1]
const arrowClass = (page.match(/className="(creator-link-arrow -ml-1 h-4 w-4[^"]*)"/) || [])[1]
if (!linkClass) fail("No `creator-link` row found in the product page. Either it was renamed or it is gone.")
if (!arrowClass) fail("No `creator-link-arrow` found on the product page's desktop row.")

const out = mkdtempSync(join(tmpdir(), "storelib-bars-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-product-bars.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  "--outfile=" + join(out, "probe.js"),
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  "--alias:@=" + root, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/*
  NO BACKTICKS BELOW THIS LINE. The page is built inside a template literal
  and a backtick in the driver ends it early; that has broken this harness
  three separate times, so it is asserted rather than remembered.
*/
const driver = [
  'async function run() {',
  '  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready } catch (e) {} }',
  '  await new Promise(function (r) { setTimeout(r, 500) })',
  '  function box(el) { if (!el) return null; var r = el.getBoundingClientRect();',
  '    return { x: Math.round(r.x * 100) / 100, y: Math.round(r.y * 100) / 100,',
  '             w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100,',
  '             right: Math.round(r.right * 100) / 100, bottom: Math.round(r.bottom * 100) / 100,',
  '             mid: Math.round((r.top + r.height / 2) * 100) / 100 } }',
  '',
  '  var bar = document.querySelector("#buybar [class*=\\"hidden\\"][class*=\\"sm:block\\"]") || document.querySelector("#buybar");',
  '  var img = document.querySelector("#buybar img");',
  '  var title = null, price = null;',
  '  document.querySelectorAll("#buybar p, #buybar span").forEach(function (el) {',
  '    var t = (el.textContent || "").trim();',
  '    if (t === "Geanta Guess Reptila" && !title) title = el;',
  '    if (t.indexOf("$350") === 0 && el.children.length === 0 && !price) price = el;',
  '  });',
  '  var button = document.querySelector("#buybar button");',
  '  var rating = null;',
  '  document.querySelectorAll("#buybar span").forEach(function (el) {',
  '    if (!rating && el.querySelector("svg") && (el.textContent || "").indexOf("(12)") >= 0) rating = el;',
  '  });',
  '  var buy = { bar: box(bar), img: box(img), title: box(title), price: box(price), button: box(button), rating: box(rating) };',
  '  buy.imgRadius = img ? getComputedStyle(img.parentElement).borderRadius : null;',
  '  buy.priceText = price ? price.textContent.trim() : null;',
  '  buy.buttonText = button ? button.textContent.trim() : null;',
  '  buy.stars = document.querySelectorAll("#buybar svg").length;',
  '',
  '  var link = document.getElementById("creatorlink");',
  '  var arrow = document.getElementById("creatorarrow");',
  '  var name = document.getElementById("creatorname");',
  '  var restStyle = getComputedStyle(arrow);',
  '  var chev = { rest: box(arrow), name: box(name), link: box(link),',
  '               restOpacity: Number(restStyle.opacity), restTransform: restStyle.transform,',
  '               linkBg: getComputedStyle(link).backgroundColor };',
  '',
  '  var hoverDecl = null, hoverMatches = false, fillUnderPointer = null;',
  '  for (var i = 0; i < document.styleSheets.length; i++) {',
  '    var sheet = document.styleSheets[i]; var rules;',
  '    try { rules = sheet.cssRules } catch (e) { continue }',
  '    for (var j = 0; j < rules.length; j++) {',
  '      var rule = rules[j];',
  '      if (rule.media && rule.cssRules) {',
  '        for (var k = 0; k < rule.cssRules.length; k++) {',
  '          var inner = rule.cssRules[k];',
  '          if (inner.selectorText === ".creator-link:hover .creator-link-arrow") {',
  '            hoverDecl = inner.style.cssText;',
  '            hoverMatches = window.matchMedia(rule.media.mediaText).matches;',
  '          }',
  '          if (inner.selectorText && inner.selectorText.indexOf(".creator-link:hover") === 0 && inner.style.backgroundColor) {',
  '            fillUnderPointer = inner.style.backgroundColor;',
  '          }',
  '        }',
  '      }',
  '      if (rule.selectorText && rule.selectorText.indexOf(".creator-link:hover") === 0 && rule.style && rule.style.backgroundColor) {',
  '        fillUnderPointer = rule.style.backgroundColor;',
  '      }',
  '    }',
  '  }',
  '  chev.hoverDecl = hoverDecl; chev.hoverMatches = hoverMatches; chev.fillUnderPointer = fillUnderPointer;',
  '  if (hoverDecl) { arrow.style.cssText += ";" + hoverDecl + ";transition:none" }',
  '  chev.hovered = box(arrow);',
  '  chev.hoveredOpacity = Number(getComputedStyle(arrow).opacity);',
  '',
  '  var depthProbe = document.getElementById("depth");',
  '  var depth = { shadow: getComputedStyle(depthProbe).boxShadow,',
  '                variable: getComputedStyle(document.documentElement).getPropertyValue("--bar-depth").trim() };',
  '',
  '  var pre = document.createElement("pre"); pre.id = "result";',
  '  pre.textContent = JSON.stringify({ buy: buy, chev: chev, depth: depth, errors: window.__err });',
  '  document.body.append(pre);',
  '}',
  'run()',
].join("\n")
if (driver.includes("`")) fail("The driver contains a backtick and would end the page's template literal early.")

const html = "<!doctype html><html><head><meta charset=\"utf-8\"><style>" + css + "</style></head><body style=\"margin:0\">" +
  "<script>window.__err=[];addEventListener(\"error\",function(e){window.__err.push(String(e.message))})</script>" +
  "<div id=\"buybar\" style=\"width:1200px\"></div>" +
  "<div style=\"width:1200px;padding:24px\">" +
  "<a id=\"creatorlink\" href=\"#\" class=\"" + linkClass + "\">" +
  "<span style=\"width:40px;height:40px;border-radius:9999px;background:#ddd;display:block;flex:none\"></span>" +
  "<p id=\"creatorname\" class=\"font-medium truncate\">AndrewRullz</p>" +
  "<svg id=\"creatorarrow\" class=\"" + arrowClass + "\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"m9 18 6-6-6-6\"/></svg>" +
  "</a></div>" +
  "<div id=\"depth\" class=\"subscribe-bar-border\" style=\"height:40px\"></div>" +
  "<script src=\"probe.js\"></script><script>" + driver + "</script></body></html>"

writeFileSync(join(out, "index.html"), html)

/*
  A MOUSE HAS TO EXIST FOR A HOVER RULE TO MEAN ANYTHING.

  Headless Chromium has no pointer device, so `(hover: hover)` does not match
  and the chevron's hover rule sat in a media query the harness reported as
  dead — which is true of the harness and false of every desktop browser the
  rule is written for. These four Blink settings say there is a fine pointer
  that can hover, which is the environment being asked about.
*/
const MOUSE = "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", MOUSE,
  "--window-size=1400,900", "--force-device-scale-factor=1", "--virtual-time-budget=12000", "--dump-dom",
  "file://" + join(out, "index.html")],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })

const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported. The probe threw before it could answer.")
const p = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))
if (p.errors && p.errors.length) fail("it threw: " + p.errors.join(" | "))
console.log(JSON.stringify(p, null, 2))

const problems = []
const { buy, chev, depth } = p

/* ---- 1. the desktop buy bar ------------------------------------------- */
if (!buy.img) problems.push("the product's picture is not in the bar at all.")
if (!buy.title) problems.push("the product's name is not in the bar.")
if (!buy.price) problems.push("the price is not in the bar.")
if (!buy.button) problems.push("there is no button in the bar.")

if (buy.img && buy.title && buy.price && buy.button) {
  if (!(buy.img.x < buy.title.x)) problems.push("the picture is not left of the name (" + buy.img.x + " vs " + buy.title.x + ").")
  if (!(buy.title.right < buy.price.x)) problems.push("the name is not left of the price (" + buy.title.right + " vs " + buy.price.x + ").")
  if (!(buy.price.right <= buy.button.x)) problems.push("the price is not left of the button (" + buy.price.right + " vs " + buy.button.x + ").")
  /* Square, and rounded rather than a circle or a rectangle. */
  if (Math.abs(buy.img.w - buy.img.h) > 1) problems.push("the picture is not square (" + buy.img.w + " x " + buy.img.h + ").")
  if (buy.img.w < 36 || buy.img.w > 52) problems.push("the picture is " + buy.img.w + "px, which is not the 44 it was asked for.")
  const radius = parseFloat(buy.imgRadius || "0")
  if (!(radius >= 6 && radius <= 14)) problems.push("the picture's corners are " + buy.imgRadius + ", which is not the rounded square it was asked for.")
  /* One row: everything on the same centre line. */
  const mids = [buy.img.mid, buy.title.mid, buy.price.mid, buy.button.mid]
  const spread = Math.max(...mids) - Math.min(...mids)
  if (spread > 12) problems.push("the row is not one row: the four things are " + Math.round(spread) + "px apart vertically.")
  /* And the button really is at the far end of the bar. */
  if (buy.bar && buy.bar.right - buy.button.right > 40) {
    problems.push("the button is " + Math.round(buy.bar.right - buy.button.right) + "px short of the bar's right edge.")
  }
  if (buy.priceText !== "$350.00") problems.push("the price reads " + buy.priceText + ".")
}
/* The rating went under the title, not beside the button. */
if (buy.rating && buy.title) {
  if (!(buy.rating.y >= buy.title.bottom - 2)) problems.push("the rating is not under the title.")
  if (buy.price && !(buy.rating.right < buy.price.x)) problems.push("the rating is not on the left side of the bar.")
} else if (!buy.rating) {
  problems.push("the rating did not render, so nothing was measured about where it went.")
}
/* One star and one chevron-free bar: five stars would be five more <svg>. */
if (buy.stars > 2) problems.push("the bar draws " + buy.stars + " icons; one star was the point.")

/* ---- 2. the chevron ---------------------------------------------------- */
if (!chev.rest || chev.rest.w < 4) problems.push("the chevron did not render.")
else {
  if (!(chev.restOpacity > 0.2)) problems.push("the chevron is " + chev.restOpacity + " at rest, which is invisible until somebody hovers — the thing it replaced.")
  if (!(chev.restOpacity < 0.8)) problems.push("the chevron is " + chev.restOpacity + " at rest, which is as loud as the name beside it.")
  if (chev.name && !(chev.rest.x >= chev.name.right - 2)) problems.push("the chevron is not after the name.")
  if (chev.link && !(chev.rest.right <= chev.link.right + 1)) problems.push("the chevron sits outside the link's own box.")
  if (chev.linkBg !== "rgba(0, 0, 0, 0)" && chev.linkBg !== "transparent") problems.push("the link has a background of " + chev.linkBg + " at rest.")
  if (chev.fillUnderPointer) problems.push("a fill is still painted under the pointer: " + chev.fillUnderPointer + ".")
  if (!chev.hoverDecl) problems.push("no `.creator-link:hover .creator-link-arrow` rule reached the browser.")
  else {
    if (!chev.hoverMatches) problems.push("the hover rule is behind a media query that does not match even in a hovering browser.")
    const travel = chev.hovered.x - chev.rest.x
    if (!(travel >= 2)) problems.push("the hover rule moves the chevron " + travel.toFixed(2) + "px, which nobody would see.")
    if (!(chev.hoveredOpacity > chev.restOpacity)) problems.push("the chevron does not come up under the pointer (" + chev.restOpacity + " → " + chev.hoveredOpacity + ").")
    console.log("\n  chevron: " + chev.restOpacity + " at rest → " + chev.hoveredOpacity + " hovered, travelling " + travel.toFixed(2) + "px")
  }
}

/* ---- 3. the depth resolves -------------------------------------------- */
if (!depth.variable) problems.push("--bar-depth is not defined anywhere the page can see it.")
if (!depth.shadow || depth.shadow === "none") problems.push("the creator page's bar renders no shadow, so the variable is not reaching it.")
else {
  const alphaList = [...depth.shadow.matchAll(/rgba\([^)]*?,\s*([\d.]+)\s*\)/g)].map((x) => Number(x[1]))
  if (!alphaList.length) problems.push("the shadow has no alpha to read: " + depth.shadow)
  else if (Math.max(...alphaList) >= 0.28) problems.push("the shadow is at " + Math.max(...alphaList) + ", which is not less than it was.")
  else console.log("  depth: " + depth.shadow)
}

if (problems.length) fail(problems.map((x) => "  - " + x).join("\n"))
console.log("\nThe bar leads with the product, the price sits by the button, and the chevron is visible before anybody hovers.\n")
