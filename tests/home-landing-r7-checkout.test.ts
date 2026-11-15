/**
 * LANDING ROUND 7, THE CHECKOUT SECTION (storelib.com home, the dark "Checkout that turns a tap into a sale")
 *
 * What the owner asked for, pinned:
 *
 *   the real checkout   "use the actual Storelib checkout, not the modal checkout": the phone draws the full
 *                       page checkout (app/(storelib)/checkout/checkout-client.tsx) as a phone lays it out
 *   a new product       "don't use The Loop": Maren Holt's Harbor Cardigan knitting pattern and its yarn kit,
 *                       real Unsplash photographs, small webp files
 *   centred, rising     the headline centred above the phone, the phone centred, rising from below as its own
 *                       box comes up the screen (an observer and a transform transition, nothing per frame)
 *   cards over it       the tab cards come over the phone, fading in; the phone dims under them
 *   the ring is back    product pictures ride a ring around the phone as in round 4 (cfd3b8cab), transform
 *                       and opacity only, paused off screen
 *   faint dots          the dot grid barely there
 *   smooth demos        One-tap payments and Checkout reminders: transform and opacity only, fewer layers
 *   width               the cards in the page's shared content box (--home-edge, --home-max)
 */
import { existsSync, readFileSync, statSync } from "node:fs"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { CheckoutScene, CHECKOUT_STYLES, FLOATS, GUIDE, PATTERN, PRINT, YARN } from "../components/marketing/home/checkout-scene"

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
const code = src.replace(/\/\*[\s\S]*?\*\//g, "")
const co = renderToString(createElement(CheckoutScene))
const css = CHECKOUT_STYLES.map((s) => s.css).join("\n")
const words = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!-- -->/g, "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ")
const rule = (sel: string) => css.match(new RegExp(`(?:^|\\n|\\}|\\s)${sel.replace(/[.[\]()*>]/g, (c) => `\\${c}`)}\\{([^}]*)\\}`))?.[1] ?? ""
const keyframes = (name: string) => css.match(new RegExp(`@keyframes ${name}\\{([\\s\\S]*?\\})\\}`))?.[1] ?? ""
const onlyCompositor = (body: string) => body.length > 0 && [...body.matchAll(/[{;]([a-z-]+):/g)].map((x) => x[1]).every((p) => p === "transform" || p === "opacity" || p === "animation-timing-function")
const small = (p: string, kb: number) => existsSync(p) && statSync(p).size < kb * 1024

console.log("\nThe phone shows Storelib's full page checkout, not the in page sheet")
const stage = co.slice(co.indexOf('class="cmc-stage"'), co.indexOf('class="cmc-cards"'))
const w = words(stage)
const page = read("app/(storelib)/checkout/checkout-client.tsx")
const pay = read("app/(storelib)/checkout/parts/stripe-pay.tsx")
const summary = read("app/(storelib)/checkout/parts/order-summary.tsx")
const ui = read("components/checkout/parts/ui.tsx")
const order = ["Continue shopping", `Pay ${PATTERN.author}`, PATTERN.price, "Hide details", PATTERN.title, "Qty 1", "Subtotal", "Add promotion code", "Total due", "OR", "Contact information", "Email me with news and offers", "Payment method", "Card number", "I agree to the Terms and Conditions and the Refund policy", `Pay ${PATTERN.price}`, "Powered by"]
check("its words are the page's, in the page's order (bar, order, form)", order.every((t) => w.includes(t)) && order.every((t, i) => i === 0 || w.indexOf(t) >= w.indexOf(order[i - 1])))
check("  and those words are in the real page and its parts", ["Continue shopping", "Hide details", "Email me with news and offers", "Terms and Conditions", "Refund policy"].every((t) => page.includes(t)) && summary.includes('ct("Add promotion code")') && summary.includes('ct("Total due")') && pay.includes('ct("Contact information")') && pay.includes('ct("Payment method")') && ui.includes("OR"))
check("  not the instant checkout sheet (no Your details, no Have a code?, no close button head)", !/Your details|Have a code\?|rc-head|rc-x/.test(stage) && !/RealCheckout/.test(src))
check("its sizes are the page's classes: a 56px white bar, the 32px total, 44px fields with 8px corners, a 48px Pay", /h-14/.test(page) && /height:56px/.test(rule(".pc-bar")) && /text-\[32px\]/.test(page) && /font-size:32px/.test(rule(".pc-total")) && /h-11 w-full/.test(ui) && /height:44px;padding:0 14px;border-radius:8px/.test(rule(".pc-in")) && /h-12 w-full/.test(ui) && /height:48px/.test(rule(".pc-pay")))
check("the order is the grey #f8f9fa block, the express Apple Pay button 44px over OR", /bg-\[#f8f9fa\]/.test(page) && /background:#f8f9fa/.test(rule(".pc-sum")) && /buttonHeight: 44/.test(pay) && /height:44px/.test(rule(".pc-ap")))
check("laid out at the iPhone's width (393 x 852) and scaled whole in one transform", /width:393px;height:852px;transform-origin:0 0;transform:scale\(var\(--k\)\)/.test(rule(".cmc-ui")))
check("under Safari's status bar and floating address bar; a picture to a screen reader", stage.includes('class="rc-safari"') && stage.includes('class="cmc-status"') && /role="img" aria-label="Storelib&#x27;s checkout page on a phone/.test(co) && /class="cmc-screen" aria-hidden="true" inert=""/.test(co))

console.log("\nA new product, with real photographs")
check("Maren Holt's Harbor Cardigan pattern ($12) and its yarn kit ($64), not The Loop or Nadia Brooks", PATTERN.title === "Harbor Cardigan pattern" && PATTERN.author === "Maren Holt" && YARN.title === "Harbor yarn kit" && !/The Loop|Nadia|LaSalle|guide-loop|print-lasalle|creator-nadia/.test(code + co))
check("the old names still export (how it works and older suites import them)", GUIDE === PATTERN && PRINT === YARN)
check("the pictures are webp files under 120 KB, credited to their Unsplash ids", ["maren-pattern", "maren-yarn-kit", "creator-maren", "float-candle", "float-rings", "float-oil", "float-prints", "float-bag"].every((f) => small(`public/home/commerce/${f}.webp`, 120)) && /photo-1584992236310-6edddc08acff/.test(src) && /photo-1438761681033-6461ffad8d80/.test(src))
check("the round 5 print is gone from public/home/commerce", !existsSync("public/home/commerce/print-lasalle.webp"))
check("no banned sample content", !/Weeknight Pasta|sourdough|Golden Hour|wheel throwing|Drawing Basics|Saturday Run Club|Dust & Tape|Elena Ruiz/i.test(words(co)))

console.log("\nCentred, and the phone rises as it comes up the screen")
check("the headline is centred at the top, on a computer too (no copy column beside the phone)", /text-align:center/.test(rule(".cmc-copy")) && !/text-align:left/.test(css.slice(css.indexOf("@media (min-width:900px)"), css.indexOf(".cmc[data-story-section] > .cmc-cards"))))
check("the phone is centred (left 50%, half its width back)", /left:50%/.test(rule(".cmc-phone-wrap")) && /margin-left:calc\(var\(--pw\) \/ -2\)/.test(rule(".cmc-phone-wrap")) && !/right:max/.test(css))
check("one observer watches the headline, the phone's box and the cards; no scroll listener, no rAF, no layout read", (src.match(/new IntersectionObserver/g) ?? []).length === 1 && /\[".cmc-phone-wrap", "data-cmc-in"\]/.test(src) && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop/.test(src))
check("armed only while wholly below the screen, so a part already on screen is simply there", /else if \(e\.boundingClientRect\.top > 0 \|\| e\.boundingClientRect\.height === 0\)/.test(src) && /if \(root\.hasAttribute\(`\$\{attr\}-armed`\)\) root\.setAttribute\(attr, ""\)/.test(src))
check("the rise is a transform transition from 34% low, no opacity flash", /\.cmc\[data-cmc-in-armed\]:not\(\[data-cmc-in\]\) \.cmc-rise\{transform:translate3d\(0,34%,0\);transition-duration:0s\}/.test(css) && /\.cmc-rise\{transition:transform 1\.1s/.test(css))
check("a jump past the section and back refreshes every part (observe again on a real arrival only, so it never loops)", /if \(was === false\)/.test(src) && /io\.unobserve\(other\)\s*io\.observe\(other\)/.test(src))
check("the phone is dimmed under a black veil, never made see-through (the ring would show through it)", !/\.cmc\[data-cmc-over\] \.cmc-rise\{opacity/.test(css))
check("no scroll timelines", !/view-timeline|animation-timeline|timeline-scope/.test(css))

console.log("\nThe tab cards come over the phone, fading in")
check("the stage holds 80svh and the cards are pulled 64svh up over it, above it (z 5)", /\.cmc-track\.cmc-track\{[^}]*height:calc\(100svh \+ 80svh\)/.test(css) && /\.cmc-stage\{position:sticky;top:0;height:100svh/.test(css) && /\.cmc-cards\.cmc-cards\{[^}]*z-index:5;[^}]*margin:calc\(64svh \* -1\) 0 0/.test(css))
check("the cards fade and lift in; the phone, the ring and the headline step back under them", /\.cmc\[data-cmc-over-armed\]:not\(\[data-cmc-over\]\) \.cmc-cards-in\{opacity:0;transform:translate3d\(0,56px,0\)/.test(css) && /\.cmc\[data-cmc-over\] \.cmc-rise\{transform:translate3d\(0,0,0\) scale\(\.97\)\}/.test(css) && /\.cmc\[data-cmc-over\] \.cmc-rise::after\{opacity:\.5\}/.test(css) && /\.cmc\[data-cmc-over\] \.cmc-orbit\{opacity:\.25\}/.test(css))
check("  as transitions of transform and opacity only", /\.cmc-cards-in\{transition:opacity \.7s ease,transform \.9s/.test(css) && /\.cmc-rise\{transition:transform 1\.1s cubic-bezier\(\.16,1,\.3,1\)\}/.test(css) && /\.cmc-rise::after\{transition:opacity \.6s ease\}/.test(css))

console.log("\nThe products ride a ring around the phone again")
const lap = keyframes("cmc-lap")
check("six real product pictures, four on a phone", FLOATS.length === 6 && FLOATS.filter((f) => f.m).length === 4 && (co.match(/class="cmc-o"/g) ?? []).length === 6 && /\.cmc-o:not\(\[data-m\]\)\{display:none\}/.test(css))
check("one baked lap, transform and opacity only, no 3D, no filter", onlyCompositor(lap) && !/perspective|rotateX|rotateY|filter/.test(lap) && (lap.match(/%\{/g) ?? []).length === 25)
check("paused until the stage is on screen in a visible tab", /animation-play-state:paused/.test(rule(".cmc-lap")) && /\.cmc-stage\[data-commerce-live\] \.cmc-lap\{animation-play-state:running\}/.test(css) && /useCommerceLive<HTMLDivElement>\("0px 0px", false\)/.test(src))
check("the ring comes up a beat behind the phone (parallax), by transform and opacity", /\.cmc\[data-cmc-in-armed\]:not\(\[data-cmc-in\]\) \.cmc-floats\{opacity:0;transform:translate3d\(0,22svh,0\)/.test(css))

console.log("\nThe dot grid, very faint")
check("1px dots at 7% white (was 13%), masked toward the edges", /rgba\(255,255,255,\.07\) 1px/.test(rule(".cmc-dots")) && /mask-image/.test(rule(".cmc-dots")) && !/rgba\(255,255,255,\.13\)/.test(css))

console.log("\nOne-tap payments and Checkout reminders: smooth and clean")
const tap = ["pc-press", "pc-touch", "ap-dim", "ap-sheet", "ap-side", "ap-done", "pc-paid", "pc-ring", "pc-paidt"]
check("One-tap: the page's Apple Pay pressed, the wallet's sheet up, Done, Payment complete, each transform and opacity", tap.every((k) => onlyCompositor(keyframes(k))) && words(co).includes("Confirm with Side Button") && words(co).includes("Payment complete") && words(co).includes(`${PATTERN.price} paid. Opening your receipt`))
check("  the round 5 ring, swapped labels and moving card field are gone", !/ck-ring|ck-w-g|rc-cardf|cmv-lift|cmv-after/.test(css))
const rec = ["cmv-rec", "cmv-fill", "cmv-st1", "cmv-st2", "cmv-st3", "cmv-mail", "cmv-btn"]
check("Reminders: a rail that fills (scaleX), the email up, the button pressed, one fade for the loop", rec.every((k) => onlyCompositor(keyframes(k))) && /scaleX/.test(keyframes("cmv-fill")))
check("a hidden panel's demo is not drawn (content-visibility), so only the open tab's demo is laid out", /\.cmc-panel:not\(\[data-on\]\) \.cmc-vis-in\{content-visibility:hidden/.test(css) && /visibility:hidden/.test(rule(".cmc-panel")))

console.log("\nThe shared content box")
check("the cards sit in --home-max and --home-edge, as the showcase does", /max-width:var\(--home-max,2020px\)/.test(rule(".cmc-cards-in")) && /var\(--edge\)/.test(rule(".cmc-cards-in")) && /--edge:var\(--home-edge,clamp\(20px,5\.15vw,84px\)\)/.test(rule(".cmc")))

console.log("\nCopy")
const all = words(co)
check("no banned words, no em dash, no fans", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all) && !/—/.test(all) && !/\bfans?\b/i.test(all))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r7-checkout.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
