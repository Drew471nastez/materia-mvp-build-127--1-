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
  check("the stage's own height is the screen less the header, the header's own measured height", /\.cmc-stage\{position:relative;height:calc\(100svh - var\(--hd\)\);overflow:hidden;\s*--hd:var\(--home-header-height,64px\);--top:0px;--tt:clamp\(18px,3svh,30px\)/.test(css))
  check("the headline and the phone are placed from the stage's top, with no header's height at its head", /--y1:calc\(var\(--top\) \+ var\(--tt\) \+ var\(--fs\) \* 2\.1 \+ var\(--gap\)\)/.test(css) && /\.cmc-copy\{[^}]*top:calc\(var\(--top\) \+ var\(--tt\)\)/.test(css))
  check("held under the header on a phone", /\.cmc-stage\{position:sticky;top:var\(--hd\)\}/.test(phone))
  check("on a computer as before: the whole screen, the header's height at its head", /\.cmc-stage\{height:100svh;--hd:69px;--top:var\(--hd\);/.test(css) && /\.cmc-stage\{position:sticky;top:0\}/.test(desk))
  check("the header's height is the one hero.tsx measures", /--home-header-height/.test(read("components/marketing/hero.tsx")))
}

console.log("\n── the motion ──")
{
  check("each row is a slot the words rise out of: clipped above and below only", /\.cmc-row\{display:block;white-space:nowrap;overflow-y:clip;padding-block:0\.16em;margin-block:-0\.16em\}/.test(css))
  check("phone: the phone a little low and large while armed, rising into place", /\.cmc\[data-cmc-armed\]:not\(\[data-cmc-in\]\) \.cmc-world\{transform:translate3d\(0,calc\(var\(--y1\) \+ 7svh\),0\) scale\(1\.04\);transition-duration:0s\}/.test(phone) && /\.cmc-world\{transition:transform 1\.1s cubic-bezier\(\.16,1,\.3,1\)\}/.test(phone))
  check("phone: the words down in their rows until their own step, then one after another", /\.cmc\[data-cmc-armed\]:not\(\[data-cmc-words\]\) \.cmc-w\{opacity:0;transform:translate3d\(0,1\.3em,0\);transition-duration:0s;transition-delay:0s\}/.test(phone) && /\.cmc-w\[data-w="7"\]\{transition-delay:420ms\}/.test(phone))
  check("no new will-change: still the ring's alone", (css.match(/will-change:/g) ?? []).length === 1)
  check("two observers on the stage, at 3% and 22% up the screen", /const PHONE_AT = 3\n/.test(src) && /const WORDS_AT = 22\n/.test(src) && /step\("data-cmc-in", PHONE_AT, true\)/.test(src) && /step\("data-cmc-words", WORDS_AT, false\)/.test(src) && /wordsIo\.observe\(stage\)/.test(src))
  check("flung past, a step is played, never left hidden", /if \(e\.isIntersecting \|\| e\.boundingClientRect\.top < 0\) root\.setAttribute\(attr, ""\)/.test(src))
  check("nothing per frame: no scroll listener, no rAF, no layout read", !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(/.test(src))
  check("computer: the phone rises 22svh from 1.12 times, not a 1.72 times zoom", /--big:1\.12;--ps:0\.893;--y0:calc\(var\(--y1\) \+ 22svh\)/.test(css) && !/--big:1\.72/.test(css))
  check("computer: the words rise out of their rows with the scroll", /@keyframes cmc-word\{from\{opacity:0;transform:translate3d\(0,1\.3em,0\)\}to\{opacity:1;transform:translate3d\(0,0,0\)\}\}/.test(css) && /\.cmc-w\{animation:cmc-word[^}]*animation-timeline:--cmc-t\}/.test(desk))
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
