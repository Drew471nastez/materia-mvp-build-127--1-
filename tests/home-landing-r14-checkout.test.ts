/**
 * LANDING ROUND 14, THE CHECKOUT SECTION: "Checkout that turns a tap into a sale"
 *
 * The owner, after round 13:
 *   products   Daily Mobility (the video course the page already sells) goes round the phone in place of the
 *              Color Notes e-book: its still cut to a round cornered 4:5 tile (obj-mobility.webp, from
 *              public/home/sell-map/mobility-course.webp) and a baked blurred copy like the others
 *   phones     reaching the section showed a screen of black at the top and the products were hidden behind the
 *              phone. Under 900px the phone is drawn settled from the first frame under a headline that is simply
 *              there (no big start, no rising words), it is narrower (50vw) and the ring wider (54vw), its
 *              centre at the phone's foot and leaning more (-20deg), so the products show beside and under the
 *              phone and stay on screen. The empty hold before the cards (black under the phone) is cut: the
 *              cards follow the stage straight on, 44svh less track on a phone (3548 -> 3176px at 390 x 844)
 *   frames     on a phone the depth cross fade round the back (hidden by the phone there) is gone: each product
 *              is its sharp object and its one soft copy for behind the cards
 *
 * Kept: the round 11/12 ring fix (the ring under the phone, the phone's black shade in its own box) and round 13's
 * "One page, then paid" card.
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { CHECKOUT_STYLES, CheckoutScene, FLOATS, SOFT } from "../components/marketing/home/checkout-scene"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}
const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const stage = renderToStaticMarkup(createElement(CheckoutScene))
const text = stage.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
/** The webp's own size, from its VP8X header. */
function webp(p: string) {
  const b = readFileSync(p)
  return { vp8x: b.toString("ascii", 12, 16) === "VP8X", alpha: !!(b[20] & 0x10), w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
}

console.log("\n1. Daily Mobility in place of Color Notes")
const mob = FLOATS.find((f) => f.id === "mobility")
check("Daily Mobility is on the ring, digital, on phones too; the e-book is gone", !!mob && mob.kind === "digital" && !!mob.m && !FLOATS.some((f) => f.id === "ebook") && !text.includes("Color Notes") && !/cmt-book/.test(css + stage))
check("  the course's still, cut to a round cornered 4:5 tile with alpha", existsSync("public/home/commerce/obj-mobility.webp") && webp("public/home/commerce/obj-mobility.webp").alpha && webp("public/home/commerce/obj-mobility.webp").w * 5 === webp("public/home/commerce/obj-mobility.webp").h * 4 && mob?.ar === 5 / 4)
check("  its name and what it is on the tile", /class="cmt cmt-mob"><img src="\/home\/commerce\/obj-mobility\.webp" alt="" width="400" height="500" loading="lazy" decoding="async"\/>/.test(stage) && text.includes("Daily Mobility") && text.includes("Video course · 21 lessons"))
check("  its blurred copy baked like the others, small, with alpha; the e-book's is deleted", existsSync("public/home/commerce/soft-mobility.webp") && webp("public/home/commerce/soft-mobility.webp").alpha && statSync("public/home/commerce/soft-mobility.webp").size < 4 * 1024 && SOFT.mobility?.w === 112 && !existsSync("public/home/commerce/soft-ebook.webp") && !("ebook" in SOFT))
check("  the bake script knows it", /const IDS = \["tee", "luts", "cap", "course", "beanie", "mobility", "notion"\]/.test(readFileSync("scripts/bake-checkout-soft.mjs", "utf8")))

console.log("\n2. Phones: no black screen at the top, the products beside the phone")
// Changed on purpose (landing round 15): under 900px the stage is the screen less the header (held under it).
// Changed on purpose (landing round 17): the stage's numbers are on the track.
const phoneStage = css.slice(css.indexOf(".cmc-track{--hd:var(--home-header-height,64px)"), css.indexOf("}", css.indexOf(".cmc-track{--hd:var(--home-header-height,64px)")))
// Changed on purpose (landing round 16): on a phone the phone is at its settled place from the first frame, big there, and gets smaller round its top as the section comes up.
check("under 900px the phone is at its settled place from the first frame: nothing to come down, only smaller", /--big:1\.6;--ps:0\.625;/.test(phoneStage) && /--y0:var\(--y1\)/.test(phoneStage))
check("  narrower, 50vw (up to 230px), still as tall as the screen allows", /--pe:min\(50vw,230px,calc\(\(100svh - var\(--hd\)/.test(phoneStage))
check("  the ring 54vw, its centre at the phone's foot and leaning more, so products fill the black beside and under it", /--r:54vw;/.test(phoneStage) && /--cy:calc\(var\(--y1\) \+ var\(--pe\) \* 2\.07\);--tilt:-20deg;/.test(phoneStage))
/* Changed on purpose (landing round 15): the owner wants the moving scene back on a phone. Under 900px the stage is held again and the scene moves in two steps, transitions set off by an observer (useStepScene), never a scroll timeline; the hold before the cards on a computer is 20svh shorter and the settle runs while the section comes up the screen (tests/home-landing-r15-scenes.test.ts). */
// Changed on purpose (landing round 15): under 900px the stage is held under the header (top: --hd).
const phoneStep = css.slice(css.indexOf("@media (max-width:899px){\n    .cmc-stage{position:sticky;top:var(--hd)}"))
// Changed on purpose (landing round 16): the cards start 40svh after the held stage at every width.
// Changed on purpose (landing round 17): the cards start from the phone's foot at every width.
check("  the cards start from the phone's foot at every width", /\.cmc-track > \.cmc-cards\{margin-top:calc\(var\(--foot\) \+ var\(--over\)/.test(css))
// Changed on purpose (landing round 16): at every width the phone steps back as a transition once the cards are up.
// Changed on purpose (landing round 17): the phone's sink follows the scroll (the owner: smooth, as you scroll on); a transition only without scroll timelines.
check("  the phone sinks with the scroll as the cards come up", /\.cmc-phone-wrap\{animation:cmc-sink/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-phone-wrap\{transform:translate3d\(0,var\(--sink\),0\) scale\(0\.9\)\}/.test(css))
const settleAt = css.indexOf(".cmc-world{animation:cmc-settle")
// Changed on purpose (landing round 16): the settle and the heading run on the scroll at every width.
// Changed on purpose (landing round 17): the heading's words rise on a timer; the settle is on the scroll.
check("  the settle runs on the scroll at every width", settleAt > 0 && css.split(".cmc-world{animation:cmc-settle").length === 2 && /\.cmc-world\{animation:cmc-settle cubic-bezier\(\.333,0,\.667,\.333\) both;animation-timeline:--cmc-t;animation-range:contain -88svh contain -8svh\}/.test(css))
/* Changed on purpose (landing round 15): the big phone starts 12svh under its settled place, not 40svh down the stage (the owner: too much empty black at the top). */
// Changed on purpose (landing round 15): the owner wants the phone to rise into place behind the headline; it starts 22svh low and 1.12x, not a 1.72x zoom.
// Changed on purpose (landing round 16): on a computer the phone starts big (a third of the screen) and high on the stage, 12svh, and comes down to its settled place.
// Changed on purpose (landing round 17): it grows round the settled phone's top.
check("  the computer starts big, a third of the screen, and comes down into place", /--big:1\.667;--ps:0\.6;/.test(css))
check("  phones' spots stand higher and lower along the phone's side", FLOATS.filter((f) => f.m).length === 5 && Math.max(...FLOATS.filter((f) => f.m).map((f) => Math.abs(f.m!.y))) >= 0.4)

console.log("\n3. Frames on a phone")
check("under 900px no depth copy and no depth cross fade (the phone hides the back of the ring)", /@media \(max-width:899px\)\{\s*\.cmc-far\{display:none\}\s*\.cmc-near\{animation:none\}\s*\}/.test(css))
check("  the ring still pauses off screen and under the cards", /\.cmc-o\{animation:cmc-orbit 44s linear infinite;animation-play-state:paused\}/.test(css) && /\.cmc:not\(\[data-cmc-covered\]\) \.cmc-stage\[data-commerce-live\] \.cmc-o\{animation-play-state:running;will-change:transform\}/.test(css))
check("  transform and opacity only, no filter", !/filter:\s*blur/.test(css))

console.log("\n4. Kept from rounds 11 to 13")
check("the ring is under the phone, the phone's shade in its own box", /\.cmc-ring\{position:absolute;z-index:2;/.test(css) && /\.cmc-phone-wrap\{position:absolute;z-index:3;/.test(css) && /<div class="cmc-phone-wrap"><div class="cmc-world"><div class="cmc-rise"><span class="cmc-shade" aria-hidden="true"><\/span><div class="cmc-phone"/.test(stage))
check("  One page, then paid", text.includes("One page, then paid"))
check("  no em dash in what the section says", !/—/.test(text))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
