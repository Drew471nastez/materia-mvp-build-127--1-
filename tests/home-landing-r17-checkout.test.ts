/**
 * LANDING ROUND 17, THE CHECKOUT SCENE ("Checkout that turns a tap into a sale"), desktop and phones.
 *
 * The owner:
 *   1. the heading's words rise one after another out of their clipped rows again, as in round 15
 *   2. the phone goes from big to its normal size and is then seen WHOLE (on a computer its foot was off the
 *      screen), then goes down under the cards as they overlap it
 *   3. far less scrolling from the shown phone to the cards over it
 *   4. the phone's exit (sinking, fading, going soft behind the cards) smooth
 *   5. no jumps, no long empty stretches, no lurch on iOS: still two scroll linked transforms, compositor only
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

console.log("\n── 1. the words rise one after another, time based ──")
{
  check("each word its own box in a clipped row", (html.match(/class="cmc-w"/g) ?? []).length === CHECKOUT_HEADING.split(" ").length && /\.cmc-row\{display:block;white-space:nowrap;overflow-y:clip;/.test(css))
  check("round 15's motion: opacity .7s, transform 1s on the long ease out, 60ms after the one before", /\.cmc-w\{transition:opacity \.7s ease,transform 1s cubic-bezier\(\.16,1,\.3,1\)\}/.test(css) && /\.cmc-w\[data-w="7"\]\{transition-delay:420ms\}/.test(css))
  check("armed, the words wait 1.3em down in their rows, put there with no transition", /\.cmc\[data-cmc-armed\]:not\(\[data-cmc-words\]\) \.cmc-w\{opacity:0;transform:translate3d\(0,1\.3em,0\);transition-duration:0s;transition-delay:0s\}/.test(css))
  check("two observers: armed only wholly below the screen, played once the stage's top is 40% up it", /function useWords/.test(src) && /useWords\(rootRef\)/.test(src) && /const WORDS_AT = 40/.test(src) && /rootMargin: `\$\{FAR_ABOVE\} 0px -\$\{WORDS_AT\}% 0px`/.test(src) && /e\.boundingClientRect\.top < innerHeight\) return/.test(src))
  check("the heading has no scroll animation any more; it fades and lifts behind the cards (data-cmc-back)", !/cmc-head\b/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-copy\{opacity:0;transform:translate3d\(0,-14px,0\)\}/.test(css))
}

console.log("\n── 2. the settled phone seen whole ──")
{
  check("the stage's numbers are on the track, where the cards can read them", /\.cmc-track\{--hd:var\(--home-header-height,64px\);/.test(css) && /\.cmc-stage\{position:relative;height:calc\(100svh - var\(--at\)\);overflow:hidden\}/.test(css))
  check("computer: the phone's width capped by the room under the heading, its top under the heading", /--y1:calc\(var\(--top\) \+ var\(--tt\) \+ var\(--fs\) \* 2\.1 \+ var\(--gap\)\);\s*--pe:min\(clamp\(220px,20vw,440px\),calc\(\(100svh - var\(--y1\) - var\(--pb\)\) \/ 2\.07\)\);/.test(css) && !/max\(42svh/.test(css))
  check("the big phone grows round the settled phone's top at every width (no crossing the heading)", /--y0:var\(--y1\);/.test(css) && !/BIG_TOP/.test(src))
  check("the settled phone's foot, measured once", /--foot:calc\(var\(--at\) \+ var\(--y1\) \+ var\(--pe\) \* 2\.07\)/.test(css))
}

console.log("\n── 3. a short way from the phone to the cards ──")
{
  check("the first card meets the phone's foot at --over: 10svh on a phone, 18svh on a computer", /--over:10svh/.test(css) && /--sink:20svh;--over:18svh\}/.test(css))
  check("the cards start where that comes true, from the phone's own numbers", /\.cmc-track > \.cmc-cards\{margin-top:calc\(var\(--foot\) \+ var\(--over\) - 100svh \+ var\(--at\) - var\(--cpad\)\)\}/.test(css) && /padding:var\(--cpad\) var\(--edge\)/.test(css))
}

console.log("\n── 4. the exit: down under the cards with the scroll, soft a third of the way in ──")
{
  check("the phone's box sinks and steps back with the scroll, eased in and out, over 44svh from --over", /@keyframes cmc-sink\{from\{transform:translate3d\(0,0,0\) scale\(1\)\}to\{transform:translate3d\(0,var\(--sink\),0\) scale\(0\.9\)\}\}/.test(css) && /\.cmc-phone-wrap\{animation:cmc-sink cubic-bezier\(\.4,0,\.6,1\) both;animation-timeline:--cmc-t;animation-range:contain 10svh contain 54svh\}/.test(css) && /\.cmc-phone-wrap\{animation-range:contain 18svh contain 62svh\}/.test(css))
  check("the back mark is a third into the sink, passing the screen's middle then", /\.cmc-back-mark\{position:absolute;left:0;top:calc\(var\(--over\) \+ 15svh \+ 50svh\);/.test(css) && /<span class="cmc-back-mark" aria-hidden="true"><\/span>/.test(html) && /rootMargin: `\$\{FAR_ABOVE\} 0px -50% 0px`/.test(src))
  check("the phone's two copies cross fade over the same time, eased in and out", /\.cmc-rise > \.cmc-phone,\.cmc-phone-soft\{transition:opacity \.8s ease-in-out\}/.test(css))
  check("without scroll timelines it sinks on a transition", /@supports not \(animation-timeline:view\(\)\)\{\s*\.cmc-phone-wrap\{transition:transform 1\.2s cubic-bezier\(\.16,1,\.3,1\)\}\s*\.cmc\[data-cmc-back\] \.cmc-phone-wrap\{transform:translate3d\(0,var\(--sink\),0\) scale\(0\.9\)\}/.test(css))
}

console.log("\n── 5. light on the compositor ──")
{
  check("exactly two scroll timeline animations, both transforms: the phone's world and its box", (css.match(/animation-timeline:--cmc-t/g) ?? []).length === 2 && /\.cmc-world\{animation:cmc-settle/.test(css) && /\.cmc-phone-wrap\{animation:cmc-sink/.test(css))
  check("every keyframe in the section moves transform and opacity only", [...css.matchAll(/@keyframes (cmc-[a-z-]+)\{([\s\S]*?)\}\}/g)].every((m) => !/(top|left|height|width|margin|filter):/.test(m[2])))
  check("no scroll listener, no rAF, no layout read in script", !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offset(Top|Height)/.test(src))
  check("reduced motion: nothing observed, nothing held", (src.match(/if \(matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return/g) ?? []).length >= 3 && /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmc-cards\{margin-top:0\}/.test(css))
}

console.log("\n── kept ──")
{
  check("the ring under the phone, its black shade in the phone's box (no product over the phone's screen)", /\.cmc-ring\{position:absolute;z-index:2;/.test(css) && /\.cmc-phone-wrap\{position:absolute;z-index:3;/.test(css) && /<span class="cmc-shade" aria-hidden="true"><\/span>/.test(html))
  check("round 15: the white sheet goes on under the dark block (no black band)", /\[data-sheet="white"\]:has\(\+\[data-sheet-backdrop\] \.cmc\)\{box-shadow:0 50svh 0 #fff\}/.test(css))
  check("lazy box: the track's share of the screen's height in the measuring script, measured", /checkout: \[\{ css: "15svh", vh: 15, until: 899 \}, \{ css: "204svh", vh: 204 \}\]/.test(read("scripts/measure-home-lazy-heights.mjs")))
  check("the four cards", ["One page, then paid", "Apple Pay and Google Pay, built in", "Local in ", "Bring back the ones who almost bought"].every((t) => html.includes(t)))
  check("no banned words", !BANNED.test(text(html)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
