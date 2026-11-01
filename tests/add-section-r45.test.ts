/**
 * ===========================================================================
 *  ROUND 45: NOTHING IN A CARD PAINTS OUTSIDE IT
 * ===========================================================================
 * The owner (desktop, Add a section, Hero and banners): a Before / After
 * section's labels, halves and curved arrow drawn over the cards above and
 * below it, a hero ("Headline goes here", its "Pause gallery" button) drawn
 * over another card, and a hero product card cut and out of line.
 *
 *   AN IMPORTED THEME'S CARD FRAME WAS THE THEME'S OWN ELEMENT. Each section
 *   sat in a copy of the theme's <main>, and that copy was the frame. A
 *   theme's `#MainContent { position: static !important }` (or relative),
 *   `* { overflow: visible !important }`, or a section's own rule for its
 *   <main> beat the frame's rules: the copies fell into the page's flow, a
 *   card lower each, uncut. The frame is now <sl-card>, the library's own
 *   element, with its rules in the first cascade layer of the document.
 *   ANYTHING THAT MOVED A CARD WITHOUT RENDERING IT left its section where
 *   the card had been: every card is watched for its size now.
 *   A PREVIEW'S WINDOW WAS THE EDITOR'S: `100vw` was 1280 in an 800px page.
 *   A REMEMBERED HEIGHT WAS TRUSTED: it is checked, kept per version of an
 *   imported theme, and never allowed to move the list.
 *
 * The browser half, with the numbers: scripts/check-add-section-contain.mjs.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { freezeViewport, freezeViewportInStyles, rememberedHeightOk, rememberedHeightsFrom, textTag } from "@/lib/website-builder/preview-markup"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const lib = read("components/website-builder/editor/section-library.tsx")
const compat = read("components/website-builder/compat/compat-section-preview.tsx")

console.log("\nAn imported theme's card is a box of the library's own")
{
  const rules = compat.slice(compat.indexOf("function sheetRules("), compat.indexOf("/** The cards' document: the theme's head"))
  check("the frame is <sl-card>, not the theme's <main>", /export const CARD_TAG = "sl-card"/.test(compat) && /const box = doc\.createElement\(CARD_TAG\)/.test(compat) && /box\.appendChild\(w\)\s*\n\s*doc\.body\.appendChild\(box\)/.test(compat))
  check("  its rules are in a cascade layer named before any of the theme's sheets", /`@layer \$\{CARD_LAYER\}\{`/.test(rules) && /<style data-storelib-layer>@layer \$\{CARD_LAYER\};<\/style>/.test(compat) && /html\.replace\(\/<head\\b\[\^>\]\*>\/i/.test(compat))
  check("  a hard box: absolute, its own size, cut, its own stacking context, nothing moving it", ["position:absolute!important", "overflow:clip!important", "contain:strict!important", "isolation:isolate!important", "z-index:0!important", "transform:none!important", "margin:0!important"].every((r) => rules.includes(r)))
  check("  placed by variables its layer reads, which nothing in the theme can beat", /top:var\(--sl-top,0px\)!important;left:var\(--sl-left,0px\)!important/.test(rules) && /height:var\(--sl-h,auto\)!important/.test(rules) && /w\.style\.setProperty\("--sl-top", `\$\{top\}px`\)/.test(compat) && !/w\.style\.maxHeight = /.test(compat))
  check("  hidden until placed and shown, with !important, so a theme's `* { opacity: 1 !important }` cannot show it early", /opacity:0!important;visibility:hidden!important/.test(rules) && /\[data-placed\]\{visibility:visible!important\}/.test(rules) && /\[data-on\]\{opacity:1!important/.test(rules))
  check("  the theme's <main> sits at its top left, as tall as what it holds", /\$\{card\}>\[data-sl-pv\]\{position:relative!important;top:0!important;left:0!important/.test(rules) && /max-height:none!important/.test(rules))
  check("a card not laid out (or with no width) is put away, never left where its card was", /if \(!box \|\| !r \|\| !\(r\.width > 0\) \|\| !\(r\.height > 0\)\) \{\s*\n\s*w\.hidden = true/.test(compat))
  check("every card is watched for its size, and any change puts every section over its card", /new ResizeObserver\(\(\) => this\.sync\(\)\)/.test(compat) && /this\.watch\(entry\.box, true\)\s*\n\s*this\.watch\(card, true\)/.test(compat) && /this\.watcher\?\.disconnect\(\)/.test(compat))
  check("the card in the library is a hard box too", /style=\{\{ height, contain: "strict", overflow: "clip", isolation: "isolate" \}\}/.test(compat))
}

console.log("\nA Storelib card is a hard box, with the page's own window")
{
  const box = lib.slice(lib.indexOf("const PreviewBox = memo("), lib.indexOf("const LibraryCard = memo("))
  check("the box: its own size, cut, its own stacking context", /contain: "strict",\s*\n\s*overflow: "clip",\s*\n\s*isolation: "isolate",/.test(box) && /className=\{cn\("relative w-full overflow-hidden/.test(box))
  check("  the section in it: absolute at 0,0, cut at the page's edges, the box fixed elements are placed against", /className="wb-pv absolute left-0 top-0 origin-top-left bg-white"/.test(box) && /contain: "layout paint style",\s*\n\s*overflow: "clip",\s*\n\s*isolation: "isolate",\s*\n\s*\.\.\.windowVars\(renderWidth\)/.test(box) && /transform: `scale\(\$\{scale\}\)`/.test(box))
  check("  and its window is the page's: --sl-vh, on the card and on the ruler", /"--sl-vh": `\$\{previewWindowHeight\(renderWidth\) \/ 100\}px`/.test(lib) && /--sl-vh:\$\{previewWindowHeight\(item\.width\) \/ 100\}px/.test(lib))
  check("a section's viewport lengths are the page's, in its styles and its inline ones", /freezeViewport\(css, job\.width, winH\)/.test(lib) && /freezeViewportInStyles\(withoutSticky\(split\.html\), job\.width, winH\)/.test(lib))
}

console.log("\nViewport lengths, read against the card's window")
{
  check("vw is the page's width, vh its window", freezeViewport(".a { width: 100vw; height: 100vh; }", 800, 800) === ".a { width: 800px; height: 800px; }")
  check("  the full bleed trick lines up with the page", freezeViewport(".hp{width:100vw;margin-left:calc(50% - 50vw)}", 800, 800) === ".hp{width:800px;margin-left:calc(50% - 400px)}")
  check("  dvh, svh, lvh, vmin, vmax, negative and decimal", freezeViewport("min-height:100dvh;top:-10svh;x:50lvh;y:10vmin;z:10vmax;w:.5vw", 390, 844) === "min-height:844px;top:-84.4px;x:422px;y:39px;z:84.4px;w:1.95px")
  check("  a class name with the unit in it is left alone", freezeViewport(".w-100vw{width:100vw}", 800, 800) === ".w-100vw{width:800px}")
  check("  in markup, only style attributes", freezeViewportInStyles('<img sizes="100vw" style="width:50vw"><p>100vw</p>', 800, 800) === '<img sizes="100vw" style="width:400px"><p>100vw</p>')
  check("  text with nothing to do comes back as it was", freezeViewport("a{color:red}", 800, 800) === "a{color:red}")
}

console.log("\nA remembered height is checked, and kept per version")
{
  const shape = /^[\w-]+:\d{1,3}:\d{3}:[a-z0-9]*$/
  const got = rememberedHeightsFrom({ "hero:0:800:abc": 412.4, "hero:1:800:abc": 0, "hero:2:800:abc": 3, "hero:3:800:abc": 1e7, "x:0:800:abc": "300", "nonsense": 300, "hero:4:123:abc": 300, "faq:0:390:": Number.NaN }, shape, (k) => ["800", "390"].includes(k.split(":")[2]))
  check("only a preview's key with a height a section can be is taken", JSON.stringify(got) === JSON.stringify({ "hero:0:800:abc": 413 }), got)
  check("  anything that is not a map of heights is nothing", Object.keys(rememberedHeightsFrom([1, 2], shape)).length === 0 && Object.keys(rememberedHeightsFrom("x", shape)).length === 0 && Object.keys(rememberedHeightsFrom(null, shape)).length === 0)
  check("  and a height is between 8px and 20,000px", rememberedHeightOk(8) && rememberedHeightOk(20_000) && !rememberedHeightOk(7) && !rememberedHeightOk(20_001) && !rememberedHeightOk(Infinity) && !rememberedHeightOk("40"))
  check("the Storelib store is new, the old one let go, what is read is checked", /const HEIGHTS_STORE = "wb-preview-h:r45"/.test(lib) && /for \(const old of OLD_HEIGHTS_STORES\) window\.localStorage\.removeItem\(old\)/.test(lib) && /rememberedHeightsFrom\(raw \? \(JSON\.parse\(raw\) as unknown\) : null, PREVIEW_HEIGHT_KEY, \(key\) => widths\.has\(key\.split\(":"\)\[2\]\)\)/.test(lib))
  check("  a height only remembered is marked so until it is measured", /REMEMBERED\.add\(key\)/.test(lib) && /REMEMBERED\.delete\(next\.key\)/.test(lib))
  check("an imported theme's are kept per version of its files and settings", /const heightsId = useMemo\(\(\) => `\$\{installId\}:\$\{rows \? filesTag\(rows, settings\) : "none"\}`/.test(compat) && /new PreviewSheet\(ctx\.theme, ctx\.page, ctx\.rows, ctx\.heightsId, renderWidth\)/.test(compat) && /hit = rememberedHeightsFrom\(/.test(compat) && /if \(!rememberedHeightOk\(h\)\) return/.test(compat))
  check("  a tag changes with any change in what it tags", textTag(["a", "bc"]) !== textTag(["ab", "c"]) && textTag(["x"]) === textTag(["x"]))
  check("a card sized by a remembered height is not made taller in front of somebody either", /* Changed on purpose (AH1: an imported section, once measured, grows its card, so nothing is cut) */ /if \(\(wanted > kept\.height && !kept\.mem\) \|\| !box \|\| !inSight\(box\)\)/.test(lib) && /if \(\(wanted > kept\.h && \(!kept\.mem \|\| !fromMemory\)\) \|\| \(wanted < kept\.h && live && !kept\.live\) \|\| !inSight\(box\.current\)\)/.test(compat))
}

console.log("\nThe probe and its fixture")
{
  check("an imported theme fixture that tries every way out of a card", ["ba-banner", "hero-slideshow", "hero-product", "fixed-banner", "page-breaker"].every((s) => existsSync(join(process.cwd(), `tests/fixtures/shopify-escape/sections/${s}.liquid`))) && /position: static !important/.test(read("tests/fixtures/shopify-escape/assets/escape.css")))
  const probe = read("scripts/check-add-section-contain.mjs")
  check("the probe visits every category at 1280 and 390, on Storelib and imported themes, with spoiled heights too", /SIZES \?\? "1280,390"/.test(probe) && /native,native-escape,tests\/fixtures\/shopify-escape/.test(probe) && /window\.__contain\.pills\(\)/.test(probe) && /STALE/.test(probe))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
