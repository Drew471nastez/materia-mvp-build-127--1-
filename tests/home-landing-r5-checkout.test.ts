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
check("its words are the window's own, in its order", ["Your details", "Email me news and offers", GUIDE.title, "Have a code?", "Payment method", "Pay", "Card", "Pay $19.00 with Apple Pay", "By paying you agree to the Terms . Your receipt and access come by email.", "Powered by", "Terms", "Privacy"].every((t) => w.includes(t)) && w.indexOf("Your details") < w.indexOf("Have a code?") && w.indexOf("Have a code?") < w.indexOf("Payment method"))
check("  and those words are in the real components", ["Your details", "Email me news and offers", "Have a code?", "Payment method", "Your receipt and access come by email."].every((t) => instant.includes(t)) && pay.includes('"Card"') && pay.includes("with ${wallet.kind === \"apple\" ? \"Apple Pay\"") && ui.includes('ct("Powered by")'))
check("its sizes are the real classes': 48px fields with 12px corners, a 52px Pay, a 76px product picture, the grey head", /h-12 w-full rounded-xl border border-\[#e1e3e7\]/.test(instant) && /height:48px;padding:0 14px;border:1px solid #e1e3e7;border-radius:12px/.test(rule(".rc-in")) && /h-\[52px\]/.test(pay) && /height:52px/.test(rule(".rc-pay")) && /height = 76/.test(win) && /height:76px/.test(rule(".rc-mark")) && /bg-\[#f8f9fa\]/.test(win) && /background:#f8f9fa/.test(rule(".rc-head")))
check("the chosen wallet is ringed in ink as compact-pay draws it", /shadow-\[0_0_0_1px_#1a1a2e\]/.test(pay) && /border-color:#1a1a2e;box-shadow:0 0 0 1px #1a1a2e/.test(rule(".rc-m[data-on]")))
check("laid out at the iPhone's width (393 x 852) and scaled whole in one transform, no em rewrite", /width:393px;height:852px;transform-origin:0 0;transform:scale\(var\(--k\)\)/.test(rule(".cmc-ui")) && /--k:tan\(atan2\(calc\(var\(--pw\) \* \.915\),393px\)\)/.test(css))
check("under Safari's status bar and its floating address bar", stage.includes('class="rc-safari"') && w.includes("storelib.com") && stage.includes('class="cmc-status"'))
check("a picture to a screen reader, nothing in it focusable", /role="img" aria-label="A Storelib checkout on a phone/.test(co) && /class="cmc-screen" aria-hidden="true" inert=""/.test(co))
check("no payment is stepped through by the scroll", !/Payment complete|data-step/.test(stage))

console.log("\nSmooth: the phone is there, then the cards come up over it with the page")
check("no orbit, no scroll timeline, no orbit pictures left", !/cmc-orbit|cmc-lap|view-timeline|animation-timeline|timeline-scope|float-/.test(src) && !existsSync("public/home/commerce/float-ebook.webp") && !existsSync("public/home/commerce/float-cap-blur.webp"))
check("one observer, no scroll listener, no rAF, no layout read", (src.match(/new IntersectionObserver/g) ?? []).length === 1 && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop/.test(src))
check("armed only while the track is wholly below the screen, so a section mounted on screen just shows its phone", /else if \(e\.boundingClientRect\.top > 0\)/.test(src) && /if \(root\.hasAttribute\("data-cmc-armed"\)\) root\.setAttribute\("data-cmc-in", ""\)/.test(src))
check("the rise is a transform transition from a little below (22%), never from off screen", /\.cmc-rise\{transition:transform 1\.15s/.test(css) && /\.cmc\[data-cmc-armed\]:not\(\[data-cmc-in\]\) \.cmc-rise\{transform:translate3d\(0,22%,0\);transition-duration:0s\}/.test(css))
check("  the words fade and lift, transform and opacity only", /\.cmc\[data-cmc-armed\]:not\(\[data-cmc-in\]\) \.cmc-w\{opacity:0;transform:translate3d\(0,\.32em,0\);transition-duration:0s\}/.test(css) && /\.cmc-w\{transition:opacity \.6s ease,transform \.8s/.test(css))
check("the stage is held by sticky for 80svh, the cards pulled up 64svh: 16svh of phone alone, then the cards cover it", /\.cmc-track\.cmc-track\{[^}]*height:calc\(100svh \+ 80svh\)/.test(css) && /\.cmc-stage\{position:sticky;top:0;height:100svh/.test(css) && /\.cmc-cards\.cmc-cards\{[^}]*z-index:5;[^}]*margin:calc\(64svh \* -1\) 0 0/.test(css))
check("the phone is a little bigger on a computer (up to 410px wide, was 340)", /@media \(min-width:900px\)\{\s*\.cmc-stage\{--hd:68px;--pw:min\(410px,calc\(\(100svh - 104px\) \/ 2\.07\)\)\}/.test(css))
check("the One-tap demo's new moves are transform and opacity", ["cmv-cardf", "cmv-after", "cmv-lift"].every((k) => keyframes(k) && onlyCompositor(keyframes(k))))
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
check("  both columns, the order and the form", ["Pay Nadia Brooks", "Total due", "Contact information", "Shipping method", "Powered by Stripe"].every((t) => words(co).includes(t)))

console.log("\nThe product")
check("not After Dark: The Loop, by Nadia Brooks, its cover a real picture file under 60 KB", !/After Dark|ebook-night|ebook-cover/.test(src + co) && GUIDE.title === "The Loop" && co.includes("/home/commerce/guide-loop.webp") && existsSync("public/home/commerce/guide-loop.webp") && statSync("public/home/commerce/guide-loop.webp").size < 60 * 1024)
check("the photograph is credited to its Unsplash id in the code", /photo-1519501025264-65ba15a82390/.test(src))

console.log("\nCopy")
const all = words(co)
check("no banned words, no em dash, no fans", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all) && !/—/.test(all) && !/\bfans?\b/i.test(all))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r5-checkout.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
