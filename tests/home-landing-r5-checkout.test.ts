/**
 * LANDING ROUND 5, THE CHECKOUT SECTION (storelib.com home, the dark "Checkout that turns a tap into a sale")
 *
 * What the owner asked for, pinned:
 *
 *   the phone        Storelib's actual checkout, not a model of one: the instant checkout window as a phone draws it,
 *                    laid out at the iPhone's own width and scaled whole; there from the first pixel, sliding up once
 *                    as the section comes in; a little bigger on a computer
 *   smooth           no orbit, no scroll timelines, no per frame work: one observer starts a CSS transition, the stage
 *                    is held by sticky, the tab cards come up over the phone with the page; a finger's scroll never
 *                    stops the autoplay
 *   the tabs         cards again (0724a74c1), not pills, on a phone and on a computer
 *   Built to convert the desktop checkout drawn whole and scaled to its box on any screen, never cut mid element
 *   the product      not After Dark: The Loop, a field guide with a real photograph on a paper cover
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { CheckoutScene, CHECKOUT_STYLES, GUIDE } from "../components/marketing/home/checkout-scene"

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
const read = (p: string) => readFileSync(p, "utf8")
const CO = "components/marketing/home/checkout-scene.tsx"
const src = read(CO)
const co = renderToString(createElement(CheckoutScene))
const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")
const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n|\\})${sel.replace(/[.[\]()*]/g, (c) => `\\${c}`)}\\{([^}]*)\\}`))?.[1] ?? ""
const keyframes = (name: string) => css.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`))?.[1] ?? ""
const onlyCompositor = (body: string) => [...body.matchAll(/[{;]([a-z-]+):/g)].map((x) => x[1]).every((p) => p === "transform" || p === "opacity" || p === "animation-timing-function")

console.log("\nThe phone shows the real instant checkout, not a model of it")
const stage = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
const w = words(stage)
const instant = read("components/checkout/instant-checkout.tsx")
const pay = read("components/community/public/compact-pay.tsx")
const win = read("components/checkout/checkout-window.tsx")
const ui = read("components/checkout/parts/ui.tsx")
// Changed on purpose (landing round 7): the owner asked for the actual full page checkout, not the in page sheet; the phone draws checkout-client.tsx (tests/home-landing-r7-checkout.test.ts pins it word by word).
check("its words are the full page checkout's, in its order", ["Continue shopping", `Pay ${GUIDE.author}`, "Hide details", GUIDE.title, "Total due", "Contact information", "Payment method", `Pay ${GUIDE.price}`].every((t) => w.includes(t)) && w.indexOf("Hide details") < w.indexOf("Contact information") && !w.includes("Your details"))
check("  and those words are in the real components", ["Your details", "Email me news and offers", "Have a code?", "Payment method", "Your receipt and access come by email."].every((t) => instant.includes(t)) && pay.includes('"Card"') && pay.includes("with ${wallet.kind === \"apple\" ? \"Apple Pay\"") && ui.includes('ct("Powered by")'))
// Changed on purpose (landing round 7): the page's own sizes: 44px fields with 8px corners, a 48px Pay, the grey order block.
check("its sizes are the real page's classes: 44px fields with 8px corners, a 48px Pay, the grey order", /h-11 w-full/.test(ui) && /height:44px;padding:0 14px;border-radius:8px/.test(rule(".pc-in")) && /height:48px/.test(rule(".pc-pay")) && /background:#f8f9fa/.test(rule(".pc-sum")))
// Changed on purpose (landing round 7): the page has no wallet choice ring; its express Apple Pay button is black, 44px, over OR.
check("the express Apple Pay button is black and 44px, as Stripe draws it on the page", /height:44px;border-radius:8px;background:#000/.test(rule(".pc-ap")))
// Changed on purpose (landing round 9): the scale divides a registered length (computed to pixels first), which WebKit needs to get the division right.
check("laid out at the iPhone's width (393 x 852) and scaled whole in one transform, no em rewrite", /width:393px;height:852px;transform-origin:0 0;transform:scale\(var\(--k\)\)/.test(rule(".cmc-ui")) && /--cmc-len:calc\(var\(--pw\) \* \.915\);--k:tan\(atan2\(var\(--cmc-len\),393px\)\)/.test(css))
check("under Safari's status bar and its floating address bar", stage.includes('class="rc-safari"') && w.includes("storelib.com") && stage.includes('class="cmc-status"'))
// Changed on purpose (landing round 7): the label names the checkout page.
check("a picture to a screen reader, nothing in it focusable", /role="img" aria-label="Storelib&#x27;s checkout page on a phone/.test(co) && /class="cmc-screen" aria-hidden="true" inert=""/.test(co))
check("no payment is stepped through by the scroll", !/Payment complete|data-step/.test(stage))

console.log("\nSmooth: the phone is there, then the cards come up over it with the page")
// Changed on purpose (landing round 7): the products ride a ring around the phone again, at the owner's ask; still no scroll timeline and no blurred twins.
// Changed on purpose (landing round 8): the owner's recording turns the products as the page scrolls (tests/home-landing-r8-checkout.test.ts).
check("the objects turn with the page on a scroll timeline (transform only); no blurred pictures", /view-timeline:--cmc-t block/.test(src) && /cmc-orbit/.test(src) && !existsSync("public/home/commerce/float-ebook.webp") && !existsSync("public/home/commerce/float-cap-blur.webp") && !/filter:\s*blur/.test(src))
// Changed on purpose (landing round 12): a second observer (useNear) marks the section near and the stage covered; still no scroll listener, no rAF, no layout read.
/* Changed on purpose (landing round 15): useNear and useStepScene (the phone's two steps) add observers; still no scroll listener. */
// Changed on purpose (landing round 17): six: useWords adds the words' arm and play.
check("observers only (six), no scroll listener, no rAF, no layout read", (src.match(/new IntersectionObserver/g) ?? []).length === 6 && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop/.test(src))
// Changed on purpose (landing round 7): each part (headline, phone, cards) is armed on its own attribute.
// Changed on purpose (landing round 9): one part (the cards), so the attribute is named.
check("armed only while a part is wholly below the screen, so a part mounted on screen is simply there", /else if \(e\.boundingClientRect\.top > 0 \|\| e\.boundingClientRect\.height === 0\)/.test(src) && /* Changed on purpose (wave 17): only a mouse arms the cards; on a touch screen they ride in with their ground, which had come up over the phone empty (the owner's recording, a dark shade sweeping over the phone). */ /const arm = matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/.test(src) && /if \(!arm \|\| root\.hasAttribute\("data-cmc-over-armed"\)\) root\.setAttribute\("data-cmc-over", ""\)/.test(src))
// Changed on purpose (landing round 7): the phone rises from 34% low as its own box comes up the screen, so the rise is seen.
// Changed on purpose (landing round 9): the owner: the phone comes first and comes down with the scroll; a scroll timeline of transform.
// Changed on purpose (landing round 10): the track also holds the cards (the stage stays behind them), so the ranges are in svh of scroll, not percent of the track.
/* Changed on purpose (landing round 15): on a computer it starts before the hold; on a phone it is a transition after data-cmc-in (useStepScene). */
// Changed on purpose (landing round 16): at every width, from 88svh before the hold.
check("the phone's move is a transform on the scroll timeline", /\.cmc-world\{animation:cmc-settle cubic-bezier\(\.333,0,\.667,\.333\) both;animation-timeline:--cmc-t;animation-range:contain -88svh contain -8svh\}/.test(css) && !/data-cmc-in/.test(css))
// Changed on purpose (landing round 7): the words are armed by the headline's own attribute.
// Changed on purpose (landing round 9): the owner: the heading "should not be there by default", it is revealed as the page scrolls; each word on the scroll timeline.
// Changed on purpose (landing round 15): the words rise out of their rows (each row clips them), from 1.3em down.
// Changed on purpose (landing round 16): the heading fades and lifts as one box.
// Changed on purpose (landing round 17): the words rise on a timer, the heading fades and lifts behind the cards, transitions of transform and opacity.
check("  the heading fades and lifts, transform and opacity only", /\.cmc-copy\{transition:opacity \.5s ease,transform \.8s [^}]*\}/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-copy\{opacity:0;transform:translate3d\(0,-14px,0\)\}/.test(css))
// Changed on purpose (landing round 9): the owner asked for a short sticky stage here: one screen, the cards pulled up 56svh.
// Changed on purpose (landing round 10): the stage is held for a screen and then stays behind the cards: the track holds both, the cards 44svh (100svh less 56svh) under the stage's foot.
/* Changed on purpose (landing round 15): 80svh of hold before the cards. */
// Changed on purpose (landing round 16): the cards 40svh after the held stage.
// Changed on purpose (landing round 17): the cards start from the phone's foot.
check("the stage is held by sticky, the cards from the phone's foot", /\.cmc-track\.cmc-track\{view-timeline:--cmc-t block\}/.test(css) && /\.cmc-stage\{position:sticky;top:var\(--hd\)\}\s*\.cmc-track > \.cmc-cards\{margin-top:calc\(var\(--foot\) \+ var\(--over\) - 100svh \+ var\(--at\) - var\(--cpad\)\)\}\s*@media \(min-width:900px\)\{\s*\.cmc-stage\{top:0\}/.test(css) && /\.cmc-cards\{position:relative;z-index:5;/.test(css))
// Changed on purpose (landing round 7): the phone is centred under the headline; up to 390px wide on a computer.
// Changed on purpose (landing round 9): the owner: "the phone is bigger".
// Changed on purpose (landing round 11): the settled phone is up to 400px; it starts bigger.
// Changed on purpose (wave 18): --hd is the header's measured 69px at 1440 and --tt the air under it is larger: the heading was glued to the header.
// Changed on purpose (landing round 15): from 900px the stage is the whole screen again (under 900px it is held under the header).
// Changed on purpose (landing round 16): a fifth of the screen on a computer (the owner's reference).
// Changed on purpose (landing round 17): the numbers are on the track; the width also capped by the room under the heading.
check("the phone is a fifth of the screen on a computer, centred", /@media \(min-width:900px\)\{\s*\.cmc-track\{--hd:69px;[^}]*--pe:min\(clamp\(220px,20vw,440px\),/.test(css))
// Changed on purpose (landing round 7): One-tap is the page's Apple Pay, the wallet's sheet and Payment complete.
// Changed on purpose (landing round 11): the in-page checkout's moves.
check("the One-tap demo's moves are transform and opacity", ["ic-pay", "ic-sheet", "ap-sheet", "ap-done", "ic-done"].every((k) => keyframes(k) && onlyCompositor(keyframes(k))))
// Changed on purpose (landing round 8): no tabs and no autoplay: the four demos are cards, each running while it is on screen.
check("nothing plays by itself on a timer: no autoplay to hold", !/setTimeout|setInterval/.test(src))
/* Changed on purpose (landing round 9): the hold is written only under prefers-reduced-motion:no-preference (with scroll timelines), so reduced motion has no hold to undo; it still lays the cards flat and stops every motion. */
// Changed on purpose (landing round 10): the cards are inside the track now, so their selector is a plain class.
check("reduced motion: nothing held, nothing moving", /@media \(prefers-reduced-motion:no-preference\)\{[\s\S]*?@supports \(animation-timeline:view\(\)\)\{\s*\.cmc\[data-story-section\] > \.cmc-track\.cmc-track\{view-timeline/.test(css) && /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmc-cards\{margin-top:0\}/.test(css) && /\.cmc-stage \*\{transition:none!important;animation:none!important\}/.test(css))

console.log("\nThe tabs are tabs again, not pills")
// Changed on purpose (landing round 8): the tabs became a grid of cards that slides up over the phone, as in the owner's recording.
// Changed on purpose (landing round 11): stacked on a phone, not a row to swipe.
check("four cards in a grid, two across on a computer, stacked on a phone", /\.cmc-bento\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);gap:16px\}/.test(css) && /\.cmc-bento\{grid-template-columns:minmax\(0,1fr\);gap:12px\}/.test(css))
// Changed on purpose (landing round 8): cards, not tabs.
// Changed on purpose (landing round 10): the cards' ground is a little see-through, so the products behind show faintly.
// Changed on purpose (landing round 11): solid now.
check("  each a dark card with its label, its title, a line and its demo", (co.match(/class="cmc-card-l"/g) ?? []).length === 4 && (co.match(/class="cmc-vis"/g) ?? []).length === 4 && /border-radius:28px;background:#111113/.test(rule(".cmc-card")))
// Changed on purpose (landing round 8): cards, not tabs.
check("  no pill anywhere in the cards", !/999px/.test(rule(".cmc-card") + rule(".cmc-bento")))

console.log("\nBuilt to convert: the desktop checkout, whole, on any screen")
// Changed on purpose (landing round 8): on a phone the card draws the same checkout as a phone lays it out (.mcx) in place of the window.
check("the window keeps its shape and fits its box (container of size, every corner round)", /\.cdx\{position:absolute;left:3%;right:3%;top:50%;aspect-ratio:var\(--ar,880\/700\);transform:translateY\(-50%\);container-type:size\}/.test(css) && /border-radius:calc\(12\*var\(--u\)\);/.test(rule(".cdx-win")))
check("  the round 4 crop (150% wide, cut on the left) is gone", !/width:150%/.test(css) && !/@container \(max-width:560px\)/.test(css))
// Changed on purpose (landing round 13): the form grew Delivery and Shipping method, so Pay's foot is at 1284u and the scroll ends at 1330u, not 1012u.
check("  its page scrolls only as far as its own window needs to show Pay", /--vh:calc\(100cqh - calc\(38\*var\(--u\)\)\);--s1:min\(calc\(330\*var\(--u\)\),max\(0px,calc\(1330\*var\(--u\)\) - var\(--vh\)\)\);--s2:max\(0px,calc\(1330\*var\(--u\)\) - var\(--vh\)\)/.test(css))
// Changed on purpose (landing round 7): Maren Holt's shop.
// Changed on purpose (landing round 8): Mara Quinn's shop.
check("  both columns, the order and the form", ["Pay Mara Quinn", "Total due", "Contact information", "Shipping method", "Powered by Stripe"].every((t) => words(co).includes(t)))

console.log("\nThe product")
// Changed on purpose (landing round 7): the owner: not The Loop; Maren Holt's Harbor Cardigan pattern, a real photograph.
// Changed on purpose (landing round 8): the owner: the Cine Tones LUT pack with the cover from Sell what you make (ebook-cover.tsx draws it).
check("not After Dark, not The Loop: the Cine Tones LUT Pack on its cover", !/After Dark|ebook-night/.test(src + co) && GUIDE.title === "Cine Tones LUT Pack" && GUIDE.author === "Mara Quinn" && co.includes("/home/everything/lut-still.webp"))
// Changed on purpose (landing round 7): the physical product is the pattern's yarn kit.
// Changed on purpose (landing round 8): the owner: "for the physical product, just a t-shirt".
check("no cap: the physical product is a t-shirt, its picture under 60 KB", !/cap-yellow|Darkroom cap/.test(src + co) && words(co).includes("Midnight Studio Tee") && statSync("public/home/commerce/tee-thumb.webp").size < 60 * 1024)
// Changed on purpose (landing round 7): the new photograph's Unsplash id.
// Changed on purpose (landing round 8): the tee's photograph.
check("the photograph is credited to its Unsplash id in the code", /photo-1618354691373-d851c5c3a990/.test(src))

console.log("\nCopy")
const all = words(co)
check("no banned words, no em dash, no fans", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all) && !/—/.test(all) && !/\bfans?\b/i.test(all))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r5-checkout.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
