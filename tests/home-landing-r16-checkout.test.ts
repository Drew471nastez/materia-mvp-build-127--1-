/**
 * LANDING ROUND 16, THE CHECKOUT SCENE AS THE OWNER'S REFERENCE RECORDING ("Checkout that turns a tap into a sale").
 *
 * The owner, at every width:
 *   1. the phone comes up BIG from the foot of the screen, only its top in view at first (a third of a laptop's
 *      screen wide), the products round it
 *   2. scrolling on, it gets smaller (a fifth of the screen wide) and settles while the heading fades and rises in
 *      above it
 *   3. scrolling on, the heading fades and the cards rise in over the phone
 * Smooth on iOS Safari too (a dozen scroll timelines over a held stage were placed a frame late there): two scroll
 * linked boxes only (the phone's world, the heading), compositor properties only; the cards come up with the page's
 * own scroll. Nothing per frame in script (one rAF read of scrollY was measured against the timelines and dropped).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CHECKOUT_HEADING, CHECKOUT_STYLES, CheckoutScene } from "@/components/marketing/home/checkout-scene"

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
const html = renderToStaticMarkup(createElement(CheckoutScene))

console.log("\n── the sizes: a third of the screen, then a fifth ──")
{
  check("computer: the settled phone a fifth of the screen wide, the big one five thirds of it (a third)", /--pe:clamp\(220px,20vw,440px\);/.test(css) && /--big:1\.667;--ps:0\.6;--y0:12svh;/.test(css))
  check("computer: settled low in the middle, at least 42svh down, its foot below the screen", /--y1:max\(42svh,calc\(var\(--top\) \+ var\(--tt\) \+ var\(--fs\) \* 2\.1 \+ var\(--gap\)\)\);/.test(css))
  check("phone: the big phone 1.6 times the settled one, at the settled place from the first frame (it only gets smaller round its top)", /--big:1\.6;--ps:0\.625;--pw:calc\(var\(--pe\) \* var\(--big\)\);/.test(css) && /--y0:var\(--y1\);/.test(css))
  check("the settle is a scale round the phone's top, from its big box", /\.cmc-world\{[^}]*transform-origin:50% 0;transform:translate3d\(0,var\(--y1\),0\) scale\(var\(--ps\)\)\}/.test(css) && /@keyframes cmc-settle\{from\{transform:translate3d\(0,var\(--y0\),0\) scale\(1\)\}to\{transform:translate3d\(0,var\(--y1\),0\) scale\(var\(--ps\)\)\}\}/.test(css))
}

console.log("\n── the motion: two scroll linked boxes, the cards on the page's own scroll ──")
{
  check("exactly two scroll timeline animations: the phone's world and the heading", (css.match(/animation-timeline:--cmc-t/g) ?? []).length === 2 && (css.match(/animation-range:/g) ?? []).length === 3)
  check("the phone settles over -88svh to the hold (to -8svh on a phone, held under the header), t squared", /\.cmc-world\{animation:cmc-settle cubic-bezier\(\.333,0,\.667,\.333\) both;animation-timeline:--cmc-t;animation-range:contain -88svh contain -8svh\}/.test(css) && /@media \(min-width:900px\)\{\s*\.cmc\[data-cmc-near\] \.cmc-world\{animation-range:contain -88svh contain 0svh\}/.test(css))
  check("the heading fades and rises in from -16 to 8svh, holds, fades and lifts from 44 to 68svh", /\.cmc-copy\{animation:cmc-head linear both;animation-timeline:--cmc-t;animation-range:contain -16svh contain 68svh\}/.test(css) && /@keyframes cmc-head\{0%\{opacity:0;transform:translate3d\(0,28px,0\);animation-timing-function:cubic-bezier\(\.33,1,\.68,1\)\}28\.571%,71\.429%\{opacity:1;transform:translate3d\(0,0,0\)\}100%\{opacity:0;transform:translate3d\(0,-14px,0\)\}\}/.test(css))
  check("every keyframe in the section moves transform and opacity only", [...css.matchAll(/@keyframes (cmc-[a-z-]+)\{([\s\S]*?)\}\}/g)].every((m) => !/(top|left|height|width|margin|filter):/.test(m[2])))
  check("the stage is held at every width (under the header on a phone), the cards 40svh after it", /\.cmc-stage\{position:sticky;top:var\(--hd\)\}\s*\.cmc-track > \.cmc-cards\{margin-top:40svh\}\s*@media \(min-width:900px\)\{\s*\.cmc-stage\{top:0\}/.test(css))
  check("the cards have no scroll animation of their own", !/\.cmc-card[^{]*\{[^}]*animation-timeline/.test(css))
  check("no ring turn, recede or cross fade on the scroll any more", !/cmc-spin|cmc-unspin|cmc-recede|cmc-word|SPIN_RANGE/.test(css + src))
  check("the scroll animations apply only near the section", /\.cmc\[data-cmc-near\] \.cmc-world\{animation:cmc-settle/.test(css) && /\.cmc\[data-cmc-near\] \.cmc-copy\{animation:cmc-head/.test(css))
  check("one new will-change, only near the section: the phone inside the world (one raster as it scales)", /\.cmc\[data-cmc-near\] \.cmc-rise\{will-change:transform\}/.test(css) && (css.match(/will-change:/g) ?? []).length === 2)
}

console.log("\n── the cards' arrival, at every width ──")
{
  check("one observer steps the phone and the ring back behind the cards, transitions", /function useBack/.test(src) && /useBack\(rootRef\)/.test(src) && /\.cmc\[data-cmc-back\] \.cmc-phone-wrap\{transform:translate3d\(0,var\(--sink\),0\) scale\(0\.9\)\}/.test(css) && /\.cmc-phone-wrap\{transition:transform 1\.2s/.test(css))
  check("a jump from past the cards to above the section always crosses the arrival observers: their roots reach far above the screen", /const FAR_ABOVE = "100000px"/.test(src) && /rootMargin: `\$\{FAR_ABOVE\} 0px -55% 0px`/.test(src) && /rootMargin: `\$\{FAR_ABOVE\} 0px -150% 0px`/.test(src))
  check("no step scene on a phone any more", !/useStepScene|data-cmc-armed|data-cmc-words/.test(src + css))
}

console.log("\n── nothing per frame in script ──")
{
  check("no scroll listener, no rAF, no layout read, no fallback writing styles per frame", !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offset(Top|Height)|data-cmc-js|@property --cmc-[aoy]\{/.test(src + css))
  check("without scroll timelines the stage is still held, the scene settled in it (the animations are only inside @supports)", /@supports \(animation-timeline:view\(\)\)\{\s*\.cmc\[data-story-section\] > \.cmc-track\.cmc-track\{view-timeline:--cmc-t block\}/.test(css) && css.indexOf(".cmc-stage{position:sticky;top:var(--hd)}") < css.indexOf("@supports (animation-timeline:view())"))
  check("reduced motion: nothing held, nothing observed", (src.match(/if \(matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return/g) ?? []).length >= 2 && /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmc-cards\{margin-top:0\}/.test(css))
}

console.log("\n── kept ──")
{
  check("the heading, and no small line under it (the owner took the subheadings off in wave 13)", CHECKOUT_HEADING === "Checkout that turns a tap into a sale" && html.includes("Checkout") && !/cmc-sub/.test(html))
  check("the ring under the phone, its black shade in the phone's box (no product over the phone's screen)", /\.cmc-ring\{position:absolute;z-index:2;/.test(css) && /\.cmc-phone-wrap\{position:absolute;z-index:3;/.test(css) && /<span class="cmc-shade" aria-hidden="true"><\/span>/.test(html))
  check("round 15: the white sheet goes on under the dark block (no black band)", /\[data-sheet="white"\]:has\(\+\[data-sheet-backdrop\] \.cmc\)\{box-shadow:0 50svh 0 #fff\}/.test(css))
  check("the four cards", ["One page, then paid", "Apple Pay and Google Pay, built in", "Local in ", "Bring back the ones who almost bought"].every((t) => html.includes(t)))
  check("lazy box: the track's share of the screen's height in the measuring script", /checkout: \[\{ css: "140svh \+ 9vh", vh: 149, until: 899 \}, \{ css: "237svh", vh: 237 \}\]/.test(read("scripts/measure-home-lazy-heights.mjs")))
  check("no banned words", !BANNED.test(text(html)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
