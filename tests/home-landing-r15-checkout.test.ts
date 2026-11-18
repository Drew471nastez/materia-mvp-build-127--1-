/**
 * LANDING ROUND 15, THE CHECKOUT'S ARRIVAL ("Checkout that turns a tap into a sale").
 *
 * The owner, from an iPhone screenshot:
 *   the band   after "Use your own domain" the white sheet ended, then a plain black band, then the checkout's
 *              rounded top. The band is the page's dark ground: on an iPhone a box above the screen that changes
 *              height is held by a top margin (lazy-section.tsx holdAbove), the checkout's margin runs through its
 *              dark block and the block starts lower. The sheet's white now goes on under the dark block (the
 *              checkout's stylesheet), so any such gap is white
 *   the top    a lot of empty black above the headline: on a phone the stage is held under the site's header, not
 *              under the screen's top with the header's height left empty at its head
 *   the motion on a phone a bit of the phone right away, more as you scroll, the headline rising from behind it,
 *              smooth on iOS: two observers and time based transitions, nothing scroll driven; on a computer the
 *              headline comes in and the phone rises into place with the scroll
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CHECKOUT_HEADING, CHECKOUT_STYLES, CheckoutScene, FLOATS } from "@/components/marketing/home/checkout-scene"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const BANNED = /\b(unlock|elevate|seamless(ly)?|powerful|effortless(ly)?|supercharge|transform(s|ing)?)\b|—/i
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

const src = read("components/marketing/home/checkout-scene.tsx")
const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const desk = css.slice(css.indexOf("@media (min-width:900px){\n  @supports (animation-timeline:view()){"), css.indexOf("Round 15, phones: the scene in two steps"))
const phone = css.slice(css.indexOf("@media (max-width:899px){\n    .cmc-stage{position:sticky;top:var(--hd)}"), css.indexOf("The cards: no ground of their own"))

console.log("\n── the band: the white sheet goes on under the checkout's dark block ──")
{
  check("the sheet before the checkout draws its white on under it (a shadow with no blur)", /\[data-sheet="white"\]:has\(\+\[data-sheet-backdrop\] \.cmc\)\{box-shadow:0 50svh 0 #fff\}/.test(css))
  check("the cause is written where it is fixed", /holdAbove/.test(css.slice(0, css.indexOf("box-shadow:0 50svh"))))
  const page = read("app/(storelib)/(marketing)/page.tsx")
  check("the white sheet is right before the checkout's dark block (the selector's join)", /<LazyHowItWorks \/>\s*<\/ScrollRevealPanel>\s*\{\/\*[^*]*\*\/\}\s*<ScrollRevealBackdrop>\s*<LazyCheckoutScene \/>/.test(page))
  check("the margin it answers is still a top margin on the box (lazy-section.tsx)", /box\.style\.marginTop = `\$\{-m\}px`/.test(read("components/marketing/home/lazy-section.tsx")))
}

console.log("\n── the top: on a phone the stage is held under the header ──")
{
  // Changed on purpose (landing round 17): the stage's numbers are on the track; the stage is the screen less where it is held (--at, the header on a phone).
  check("the stage's own height is the screen less the header, the header's own measured height", /\.cmc-stage\{position:relative;height:calc\(100svh - var\(--at\)\);overflow:hidden\}/.test(css) && /\.cmc-track\{--hd:var\(--home-header-height,64px\);--top:0px;--tt:clamp\(18px,3svh,30px\)/.test(css) && /--at:var\(--hd\);/.test(css))
  check("the headline and the phone are placed from the stage's top, with no header's height at its head", /--y1:calc\(var\(--top\) \+ var\(--tt\) \+ var\(--fs\) \* 2\.1 \+ var\(--gap\)\)/.test(css) && /\.cmc-copy\{[^}]*top:calc\(var\(--top\) \+ var\(--tt\)\)/.test(css))
  // Changed on purpose (landing round 16): held at every width, under the header on a phone.
  // Changed on purpose (landing round 17): the cards start from the phone's foot.
  check("held under the header on a phone", /\.cmc-stage\{position:sticky;top:var\(--hd\)\}\s*\.cmc-track > \.cmc-cards\{margin-top:calc\(var\(--foot\)/.test(css) && /@media \(min-width:900px\)\{\s*\.cmc-stage\{top:0\}/.test(css))
  // Changed on purpose (landing round 16): held at the screen's top from 900px, at every width with or without scroll timelines.
  // Changed on purpose (landing round 17): the numbers are on the track.
  check("on a computer as before: the whole screen, the header's height at its head", /\.cmc-track\{--hd:69px;--top:var\(--hd\);--at:0px;/.test(css) && /@media \(min-width:900px\)\{\s*\.cmc-stage\{top:0\}/.test(css))
  check("the header's height is the one hero.tsx measures", /--home-header-height/.test(read("components/marketing/hero.tsx")))
}

console.log("\n── the motion ──")
{
  check("each row is a slot the words rise out of: clipped above and below only", /\.cmc-row\{display:block;white-space:nowrap;overflow-y:clip;padding-block:0\.16em;margin-block:-0\.16em\}/.test(css))
  // Changed on purpose (landing round 16): no armed step on a phone: the phone gets smaller with the scroll, as on a computer.
  // Changed on purpose (landing round 17): the words are armed again, the phone is not.
  check("phone: the phone big at its settled place, getting smaller with the scroll", !/data-cmc-armed\][^{]*\.cmc-world/.test(css) && /--y0:var\(--y1\)/.test(css) && /\.cmc-world\{animation:cmc-settle cubic-bezier\(\.333,0,\.667,\.333\) both;animation-timeline:--cmc-t;animation-range:contain -88svh contain -8svh\}/.test(css))
  // Changed on purpose (landing round 16): the heading fades and rises in as one box with the scroll at every width.
  // Changed on purpose (landing round 17): the owner: the words rise one after another again, on a timer (useWords).
  check("phone: the heading's words rise one after another", /data-cmc-words/.test(css) && /\.cmc-w\{transition:opacity \.7s ease,transform 1s/.test(css))
  // Changed on purpose (landing round 16): one more, on the phone only while the section is near.
  check("one new will-change, on the phone only while near", (css.match(/will-change:/g) ?? []).length === 2 && /\.cmc\[data-cmc-near\] \.cmc-rise\{will-change:transform\}/.test(css))
  // Changed on purpose (landing round 16): no step scene: the scroll timelines run the arrival at every width.
  // Changed on purpose (landing round 17): useWords is back for the words, WORDS_AT with it; no step for the phone.
  check("no step observers on the stage any more", !/useStepScene|PHONE_AT/.test(src))
  // Changed on purpose (landing round 16): the arrival observers' roots reach far above the screen, so a jump past them always crosses them.
  // Changed on purpose (landing round 17): useBack watches the back mark against the screen's middle.
  check("flung past, the arrival is never left stale", /rootMargin: `\$\{FAR_ABOVE\} 0px -50% 0px`/.test(src))
  check("nothing per frame: no scroll listener, no rAF, no layout read", !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(/.test(src))
  // Changed on purpose (landing round 16): the owner's reference: a third of the screen, coming down to a fifth (5/3 times).
  // Changed on purpose (landing round 17): the big phone grows round the settled phone's top (--y0 is --y1).
  check("computer: the phone comes down from a third of the screen to a fifth", /--big:1\.667;--ps:0\.6;/.test(css) && !/--big:1\.72/.test(css))
  // Changed on purpose (landing round 16): the heading rises as one box, one animation.
  // Changed on purpose (landing round 17): the words rise one after another on a timer at every width.
  check("computer: the heading's words rise one after another", !/cmc-head\b/.test(css) && /\.cmc\[data-cmc-armed\]:not\(\[data-cmc-words\]\) \.cmc-w\{opacity:0;/.test(css))
  check("transform and opacity only in the new rules", !/\.cmc[^{]*\{[^}]*transition:[^}]*(top|height|margin|filter)/.test(phone))
}

console.log("\n── kept ──")
{
  const html = renderToStaticMarkup(createElement(CheckoutScene))
  check("the heading", html.includes("Checkout") && CHECKOUT_HEADING === "Checkout that turns a tap into a sale")
  check("the ring under the phone (no product over its screen)", /\.cmc-ring\{position:absolute;z-index:2;/.test(css) && /\.cmc-phone-wrap\{position:absolute;z-index:3;/.test(css) && /<span class="cmc-shade" aria-hidden="true"><\/span>/.test(html))
  check("round 13: the One page card", /One page, then paid/.test(html))
  check("round 14: Daily Mobility on the ring", FLOATS.some((f) => f.id === "mobility") && /Daily Mobility/.test(html))
  check("no banned words", !BANNED.test(text(html)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
