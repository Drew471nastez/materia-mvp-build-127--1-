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
check("laid out at the iPhone's width (393 x 852) and scaled whole in one transform, no em rewrite", /width:393px;height:852px;transform-origin:0 0;transform:scale\(var\(--k\)\)/.test(rule(".cmc-ui")) && /--k:tan\(atan2\(calc\(var\(--pw\) \* \.915\),393px\)\)/.test(css))
check("under Safari's status bar and its floating address bar", stage.includes('class="rc-safari"') && w.includes("storelib.com") && stage.includes('class="cmc-status"'))
// Changed on purpose (landing round 7): the label names the checkout page.
check("a picture to a screen reader, nothing in it focusable", /role="img" aria-label="Storelib&#x27;s checkout page on a phone/.test(co) && /class="cmc-screen" aria-hidden="true" inert=""/.test(co))
check("no payment is stepped through by the scroll", !/Payment complete|data-step/.test(stage))

console.log("\nSmooth: the phone is there, then the cards come up over it with the page")
// Changed on purpose (landing round 7): the products ride a ring around the phone again, at the owner's ask; still no scroll timeline and no blurred twins.
check("no scroll timeline; the ring is back without blurred pictures", !/view-timeline|animation-timeline|timeline-scope/.test(src) && /cmc-orbit|cmc-lap/.test(src) && !existsSync("public/home/commerce/float-ebook.webp") && !existsSync("public/home/commerce/float-cap-blur.webp"))
check("one observer, no scroll listener, no rAF, no layout read", (src.match(/new IntersectionObserver/g) ?? []).length === 1 && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop/.test(src))
// Changed on purpose (landing round 7): each part (headline, phone, cards) is armed on its own attribute.
check("armed only while a part is wholly below the screen, so a part mounted on screen is simply there", /else if \(e\.boundingClientRect\.top > 0 \|\| e\.boundingClientRect\.height === 0\)/.test(src) && /if \(root\.hasAttribute\(`\$\{attr\}-armed`\)\) root\.setAttribute\(attr, ""\)/.test(src))
// Changed on purpose (landing round 7): the phone rises from 34% low as its own box comes up the screen, so the rise is seen.
check("the rise is a transform transition from below (34%), never from off screen", /\.cmc-rise\{transition:transform 1\.1s/.test(css) && /\.cmc\[data-cmc-in-armed\]:not\(\[data-cmc-in\]\) \.cmc-rise\{transform:translate3d\(0,34%,0\);transition-duration:0s\}/.test(css))
// Changed on purpose (landing round 7): the words are armed by the headline's own attribute.
check("  the words fade and lift, transform and opacity only", /\.cmc\[data-cmc-words-armed\]:not\(\[data-cmc-words\]\) \.cmc-w\{opacity:0;transform:translate3d\(0,\.36em,0\)/.test(css) && /\.cmc-w\{transition:opacity \.55s ease,transform \.8s/.test(css))
check("the stage is held by sticky for 80svh, the cards pulled up 64svh: 16svh of phone alone, then the cards cover it", /\.cmc-track\.cmc-track\{[^}]*height:calc\(100svh \+ 80svh\)/.test(css) && /\.cmc-stage\{position:sticky;top:0;height:100svh/.test(css) && /\.cmc-cards\.cmc-cards\{[^}]*z-index:5;[^}]*margin:calc\(64svh \* -1\) 0 0/.test(css))
// Changed on purpose (landing round 7): the phone is centred under the headline; up to 390px wide on a computer.
check("the phone is a little bigger on a computer (up to 390px wide, centred)", /@media \(min-width:900px\)\{\s*\.cmc-stage\{--hd:68px;[^}]*--pw:min\(390px,/.test(css))
// Changed on purpose (landing round 7): One-tap is the page's Apple Pay, the wallet's sheet and Payment complete.
check("the One-tap demo's moves are transform and opacity", ["pc-press", "ap-sheet", "ap-done", "pc-paid"].every((k) => keyframes(k) && onlyCompositor(keyframes(k))))
check("a finger scrolling past does not hold the autoplay; a mouse over the cards does", /if \(e\.pointerType === "mouse"\) setHeld\(on\)/.test(src))
check("reduced motion: nothing held, nothing moving", /@media \(prefers-reduced-motion:reduce\)\{\s*\.cmc\[data-story-section\] > \.cmc-track\.cmc-track\{height:auto\}\s*\.cmc\[data-story-section\] > \.cmc-cards\.cmc-cards\{margin-top:0\}/.test(css) && /\.cmc-stage \*\{transition:none!important;animation:none!important\}/.test(css))

console.log("\nThe tabs are tabs again, not pills")
check("four tab cards in a grid, four across on a computer, two by two on a phone", /\.cmc-tablist\{display:grid;grid-template-columns:repeat\(4,1fr\);gap:12px\}/.test(css) && /@media \(max-width:899px\)\{\s*\.cmc-tablist\{grid-template-columns:repeat\(2,1fr\);gap:10px\}/.test(css))
check("  each a dark card with its label, a figure and a line that fills", (co.match(/class="cmc-tab-l"/g) ?? []).length === 4 && (co.match(/class="cmc-tab-s"/g) ?? []).length === 4 && (co.match(/class="cmc-tab-bar"/g) ?? []).length === 4 && /border-radius:21px;background:rgba\(24,24,27,\.94\)/.test(rule(".cmc-tab")))
check("  no pill anywhere in the tabs", !/999px/.test(rule(".cmc-tab") + rule(".cmc-tablist")) && !/\.cmc-tab::before/.test(css))

console.log("\nBuilt to convert: the desktop checkout, whole, on any screen")
check("the window keeps its shape and fits its box (container of size, every corner round), on a phone too", /\.cdx\{position:absolute;left:3%;right:3%;top:50%;aspect-ratio:var\(--ar,880\/700\);transform:translateY\(-50%\);container-type:size\}/.test(css) && /border-radius:calc\(12\*var\(--u\)\);/.test(rule(".cdx-win")) && /\.cdx\{--ar:880\/1000\}/.test(css))
check("  the round 4 crop (150% wide, cut on the left) is gone", !/width:150%/.test(css) && !/@container \(max-width:560px\)/.test(css))
check("  its page scrolls only as far as its own window needs to show Pay", /--vh:calc\(100cqh - calc\(38\*var\(--u\)\)\);--s1:min\(calc\(330\*var\(--u\)\),max\(0px,calc\(1012\*var\(--u\)\) - var\(--vh\)\)\);--s2:max\(0px,calc\(1012\*var\(--u\)\) - var\(--vh\)\)/.test(css))
// Changed on purpose (landing round 7): Maren Holt's shop.
check("  both columns, the order and the form", ["Pay Maren Holt", "Total due", "Contact information", "Shipping method", "Powered by Stripe"].every((t) => words(co).includes(t)))

console.log("\nThe product")
// Changed on purpose (landing round 7): the owner: not The Loop; Maren Holt's Harbor Cardigan pattern, a real photograph.
check("not After Dark, not The Loop: Maren Holt's pattern, its picture a real file under 60 KB", !/After Dark|ebook-night|ebook-cover/.test(src + co) && GUIDE.author === "Maren Holt" && co.includes("/home/commerce/maren-pattern.webp") && statSync("public/home/commerce/maren-pattern.webp").size < 60 * 1024)
// Changed on purpose (landing round 7): the physical product is the pattern's yarn kit.
check("no cap: the physical product is the Harbor yarn kit, its picture under 60 KB", !/cap-yellow|Darkroom cap/.test(src + co) && words(co).includes("Harbor yarn kit") && statSync("public/home/commerce/maren-yarn-kit.webp").size < 60 * 1024)
// Changed on purpose (landing round 7): the new photograph's Unsplash id.
check("the photograph is credited to its Unsplash id in the code", /photo-1584992236310-6edddc08acff/.test(src))

console.log("\nCopy")
const all = words(co)
check("no banned words, no em dash, no fans", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all) && !/—/.test(all) && !/\bfans?\b/i.test(all))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r5-checkout.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
