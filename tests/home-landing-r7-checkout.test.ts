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
// Changed on purpose (landing round 8): the phone sells the Cine Tones LUT Pack and the physical product is a t-shirt (the owner).
import { CheckoutScene, CHECKOUT_STYLES, FLOATS, GUIDE, LUTS, PRINT, TEE } from "../components/marketing/home/checkout-scene"

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
const order = ["Continue shopping", `Pay ${LUTS.author}`, LUTS.price, "Hide details", LUTS.title, "Qty 1", "Subtotal", "Add promotion code", "Total due", "OR", "Contact information", "Email me with news and offers", "Payment method", "Card number", "I agree to the Terms and Conditions and the Refund policy", `Pay ${LUTS.price}`, "Powered by"]
check("its words are the page's, in the page's order (bar, order, form)", order.every((t) => w.includes(t)) && order.every((t, i) => i === 0 || w.indexOf(t) >= w.indexOf(order[i - 1])))
check("  and those words are in the real page and its parts", ["Continue shopping", "Hide details", "Email me with news and offers", "Terms and Conditions", "Refund policy"].every((t) => page.includes(t)) && summary.includes('ct("Add promotion code")') && summary.includes('ct("Total due")') && pay.includes('ct("Contact information")') && pay.includes('ct("Payment method")') && ui.includes("OR"))
check("  not the instant checkout sheet (no Your details, no Have a code?, no close button head)", !/Your details|Have a code\?|rc-head|rc-x/.test(stage) && !/RealCheckout/.test(src))
check("its sizes are the page's classes: a 56px white bar, the 32px total, 44px fields with 8px corners, a 48px Pay", /h-14/.test(page) && /height:56px/.test(rule(".pc-bar")) && /text-\[32px\]/.test(page) && /font-size:32px/.test(rule(".pc-total")) && /h-11 w-full/.test(ui) && /height:44px;padding:0 14px;border-radius:8px/.test(rule(".pc-in")) && /h-12 w-full/.test(ui) && /height:48px/.test(rule(".pc-pay")))
check("the order is the grey #f8f9fa block, the express Apple Pay button 44px over OR", /bg-\[#f8f9fa\]/.test(page) && /background:#f8f9fa/.test(rule(".pc-sum")) && /buttonHeight: 44/.test(pay) && /height:44px/.test(rule(".pc-ap")))
check("laid out at the iPhone's width (393 x 852) and scaled whole in one transform", /width:393px;height:852px;transform-origin:0 0;transform:scale\(var\(--k\)\)/.test(rule(".cmc-ui")))
check("under Safari's status bar and floating address bar; a picture to a screen reader", stage.includes('class="rc-safari"') && stage.includes('class="cmc-status"') && /role="img" aria-label="Storelib&#x27;s checkout page on a phone/.test(co) && /class="cmc-screen" aria-hidden="true" inert=""/.test(co))

console.log("\nA new product, with real photographs")
// Changed on purpose (landing round 8): the owner: the Cine Tones LUT pack instead, a t-shirt for the physical product, no Nadia Brooks.
check("Mara Quinn's Cine Tones LUT Pack ($29) and a t-shirt ($32), not The Loop, not Nadia Brooks, not Maren Holt", LUTS.title === "Cine Tones LUT Pack" && LUTS.author === "Mara Quinn" && TEE.title === "Midnight Studio Tee" && !/The Loop|Nadia|LaSalle|guide-loop|print-lasalle|creator-nadia|Maren|Harbor/.test(code + co))
// Changed on purpose (landing round 8): the round 5 names point at the LUT pack and the tee.
check("the old names still export (older suites import them)", GUIDE === LUTS && PRINT === TEE)
// Changed on purpose (landing round 8): the products around the phone are 3D renders with transparent grounds (tests/home-landing-r8-checkout.test.ts).
// Changed on purpose (landing round 9): the owner: "physical products and digital products, not random things like a camera or a plant"; the scanned models are gone, the cap and the tote are cut out of photographs the page already shows.
// Changed on purpose (landing round 12): no tote on the page; the beanie in its place.
check("the pictures are webp files under 120 KB, credited in the code", ["tee-thumb", "creator-mara", "obj-tee", "obj-cap", "obj-beanie"].every((f) => small(`public/home/commerce/${f}.webp`, 120)) && ["obj-camera", "obj-hat", "obj-lamp", "obj-vase", "obj-cassette", "obj-plant"].every((f) => !existsSync(`public/home/commerce/${f}.webp`)) && /photo-1618354691373-d851c5c3a990/.test(src) && /photo-1438761681033-6461ffad8d80/.test(src) && !/Poly Haven/.test(src))
check("the round 5 print is gone from public/home/commerce", !existsSync("public/home/commerce/print-lasalle.webp"))
check("no banned sample content", !/Weeknight Pasta|sourdough|Golden Hour|wheel throwing|Drawing Basics|Saturday Run Club|Dust & Tape|Elena Ruiz/i.test(words(co)))

console.log("\nCentred, and the phone rises as it comes up the screen")
// Changed on purpose (landing round 10): the cards' rule is a plain class (they are inside the track).
check("the headline is centred at the top, on a computer too (no copy column beside the phone)", /text-align:center/.test(rule(".cmc-copy")) && !/text-align:left/.test(css.slice(css.indexOf("@media (min-width:900px)"), css.indexOf(".cmc-cards{position:relative"))))
// Changed on purpose (landing round 9): the phone's box is its big size, centred in the stage, with both margins in one declaration.
// Changed on purpose (landing round 11): the phone's box is the big phone's, at the stage's top; the world inside carries it down.
check("the phone is centred (left 50%, half its width back)", /left:50%/.test(rule(".cmc-phone-wrap")) && /margin-left:calc\(var\(--pw\) \/ -2\)/.test(rule(".cmc-phone-wrap")) && !/right:max/.test(css))
// Changed on purpose (landing round 9): the headline and the phone are revealed by the scroll timeline (the owner's choreography), so the observer watches the cards only.
// Changed on purpose (landing round 12): a second observer (useNear) marks the section near and the stage covered.
/* Changed on purpose (landing round 15): two more observers drive the phone's two steps under 900px (useStepScene). */
// Changed on purpose (landing round 17): six: useBack watches the back mark, useWords adds two.
check("one observer watches the cards, one the section and the cards' top, the rest the back mark and the words; no scroll listener, no rAF, no layout read", (src.match(/new IntersectionObserver/g) ?? []).length === 6 && /root\.querySelector\("\.cmc-cards"\)/.test(src) && !/addEventListener\("scroll"|requestAnimationFrame|getBoundingClientRect\(|offsetTop/.test(src))
// Changed on purpose (landing round 9): one part (the cards), so the attribute is named.
check("armed only while wholly below the screen, so a part already on screen is simply there", /else if \(e\.boundingClientRect\.top > 0 \|\| e\.boundingClientRect\.height === 0\)/.test(src) && /* Changed on purpose (wave 17): only a mouse arms the cards; on a touch screen they ride in with their ground, which had come up over the phone empty (the owner's recording, a dark shade sweeping over the phone). */ /const arm = matchMedia\("\(hover: hover\) and \(pointer: fine\)"\)\.matches/.test(src) && /if \(!arm \|\| root\.hasAttribute\("data-cmc-over-armed"\)\) root\.setAttribute\("data-cmc-over", ""\)/.test(src))
// Changed on purpose (landing round 9): the owner: the phone comes first, big, and comes down as the page scrolls; a scroll timeline of transform, no transition.
// Changed on purpose (landing round 11): it starts big and low and settles smaller under the headline, one transform.
check("the phone settles smaller over the hold: transform only, no opacity flash", /@keyframes cmc-settle\{from\{transform:translate3d\(0,var\(--y0\),0\) scale\(1\)\}to\{transform:translate3d\(0,var\(--y1\),0\) scale\(var\(--ps\)\)\}\}/.test(css) && !/data-cmc-in/.test(css.slice(0, css.indexOf("@media (max-width:899px){\n    .cmc-stage{position:sticky;top:var(--hd)}") /* Changed on purpose (landing round 15): held under the header on a phone */)))
// Changed on purpose (landing round 9): one watched part, so there is no other part to ask about; the observer reports the cards' box afresh on every crossing.
check("a jump past the section and back: the cards re-arm below the screen and play when they arrive", /* Changed on purpose (wave 17): only a mouse arms the cards; on a touch screen they ride in with their ground, which had come up over the phone empty (the owner's recording, a dark shade sweeping over the phone). */ /root\.removeAttribute\("data-cmc-over"\)\s*if \(arm\) root\.setAttribute\("data-cmc-over-armed", ""\)/.test(src))
check("the phone is dimmed under a black veil, never made see-through (the ring would show through it)", !/\.cmc\[data-cmc-over\] \.cmc-rise\{opacity/.test(css))
// Changed on purpose (landing round 8): the owner's recording turns the products as the page scrolls; a scroll timeline of transform is the compositor's own work.
// Changed on purpose (landing round 9): the timeline also brings the phone down and the headline in (the owner's choreography); where it is missing the ring still turns by itself, paused off screen.
check("a scroll timeline over the scene's track (transform and opacity), with the ring's own paused loop either way", /@supports \(animation-timeline:view\(\)\)\{\s*\.cmc\[data-story-section\] > \.cmc-track\.cmc-track\{[^}]*view-timeline:--cmc-t block\}/.test(css) && !/timeline-scope/.test(css) && /\.cmc-o\{animation:cmc-orbit \d+s linear infinite;animation-play-state:paused\}/.test(css))

console.log("\nThe tab cards come over the phone, fading in")
// Changed on purpose (landing round 9): the owner asked for a short sticky stage here: about one screen (100svh), only where scroll timelines exist; the cards are pulled 56svh up.
// Changed on purpose (landing round 10): the track holds the stage and the cards, so the stage stays held behind them; the cards start 44svh under the stage's foot (the same 56svh overlap).
/* Changed on purpose (landing round 15): the hold before the cards is 20svh shorter, so they are pulled 56svh up over 80svh of hold. */
// Changed on purpose (landing round 16): the cards 40svh after the held stage.
// Changed on purpose (landing round 17): the cards start from the phone's foot.
check("the stage holds one screen and the cards come up over it, above it (z 5)", /\.cmc-track\.cmc-track\{view-timeline:--cmc-t block\}/.test(css) && /\.cmc-stage\{position:sticky;top:var\(--hd\)\}\s*\.cmc-track > \.cmc-cards\{margin-top:calc\(var\(--foot\) \+ var\(--over\) - 100svh \+ var\(--at\) - var\(--cpad\)\)\}\s*@media \(min-width:900px\)\{\s*\.cmc-stage\{top:0\}/.test(css) && /\.cmc-cards\{position:relative;z-index:5;/.test(css))
// Changed on purpose (landing round 8): each card slides up on its own, staggered, as the grid in the owner's recording does.
// Changed on purpose (landing round 9): the ring cannot fade (opacity would flatten its 3D space) and the headline stays over the cards; the phone alone dims under them.
// Changed on purpose (landing round 10): the phone and the ring step back together on the scroll timeline (the wrap round the 3D space fades, the space itself is untouched); no black veil.
// Changed on purpose (landing round 11): the phone's box and the ring's step back together.
// Changed on purpose (landing round 11): the phone's box steps back without fading (cmc-back), the ring fades (cmc-recede).
// Changed on purpose (landing round 16): the phone and the ring step back as transitions once the cards are up.
check("the cards slide up one after another; the phone steps back under them", /\.cmc\[data-cmc-over-armed\]:not\(\[data-cmc-over\]\) \.cmc-card\{opacity:0;transform:translate3d\(0,96px,0\)/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-phone-wrap\{transform:translate3d\(0,var\(--sink\),0\) scale\(0\.9\)\}/.test(css) && /\.cmc\[data-cmc-back\] \.cmc-ring\{opacity:0\.4;transform:scale\(0\.92\)\}/.test(css) && !/\.cmc-orbit\{[^}]*opacity/.test(css))
// Changed on purpose (landing round 8): the transition is on each card.
// Changed on purpose (landing round 9): the phone's move is the scroll timeline's now.
// Changed on purpose (landing round 10): no veil to transition.
check("  as transitions of transform and opacity only", /\.cmc-card\{transition:opacity \.7s ease,transform 1s/.test(css) && !/\.cmc-rise::after/.test(css))

console.log("\nThe products ride a ring around the phone again")
// Changed on purpose (landing round 8): the baked 2D lap became a 3D turn over the scroll.
// Changed on purpose (landing round 9): the turn is a whole turn of the ring now.
const lap = keyframes("cmc-orbit")
// Changed on purpose (landing round 8): seven 3D objects (the owner: "3D products, not images").
// Changed on purpose (landing round 9): seven products a creator sells (three photographs, four digital), five of them on a phone.
check("seven products, five on a phone", FLOATS.length === 7 && FLOATS.filter((f) => f.m).length === 5 && (co.match(/class="cmc-o"/g) ?? []).length === 7 && /\.cmc-o:not\(\[data-m\]\)\{display:none\}/.test(css))
// Changed on purpose (landing round 8): the turn is 3D on purpose (perspective, rotateY), still transform only.
check("one turn, transform only, in 3D", onlyCompositor(lap) && /rotateY/.test(lap) && /translate3d/.test(lap) && !/filter/.test(lap))
// Changed on purpose (landing round 8): the float is what runs by itself.
// Changed on purpose (landing round 9): no float on top; the ring's turn is the loop, paused until the stage is on screen.
/* Changed on purpose (wave 17): the stage wakes a screen ahead (it popped in on an iPhone recording); still paused off screen beyond that and in a hidden tab. */
// Changed on purpose (landing round 12): half a screen ahead, and paused again once the cards cover the stage.
check("the ring's turn paused until the stage is on screen in a visible tab", /\.cmc-o\{animation:cmc-orbit [^}]*animation-play-state:paused\}/.test(css) && /\.cmc:not\(\[data-cmc-covered\]\) \.cmc-stage\[data-commerce-live\] \.cmc-o\{animation-play-state:running;will-change:transform\}/.test(css) && /useCommerceLive<HTMLDivElement>\("50% 0px", false\)/.test(src))
// Changed on purpose (landing round 9): the ring is in the phone's own 3D space and comes with it.
// Changed on purpose (landing round 11): the owner: never across the phone. The ring is its own space, drawn under the phone.
check("the ring is its own 3D space, drawn under the phone", /<div class="cmc-ring" aria-hidden="true"><div class="cmc-orbit">/.test(co) && /\.cmc-orbit\{[^}]*transform-style:preserve-3d/.test(css) && co.indexOf('class="cmc-ring"') < co.indexOf('class="cmc-phone-wrap"'))

console.log("\nThe dot grid, very faint")
check("1px dots at 7% white (was 13%), masked toward the edges", /rgba\(255,255,255,\.07\) 1px/.test(rule(".cmc-dots")) && /mask-image/.test(rule(".cmc-dots")) && !/rgba\(255,255,255,\.13\)/.test(css))

console.log("\nOne-tap payments and Checkout reminders: smooth and clean")
// Changed on purpose (landing round 11): the One-tap demo is the in-page checkout, dark.
const tap = ["ic-t1", "ic-t2", "ic-pay", "ic-buy", "ic-dim", "ic-sheet", "ic-form", "ic-done", "ap-dim", "ap-sheet", "ap-side", "ap-done"]
// Changed on purpose (landing round 11): the in-page checkout's Pay with Apple Pay, the wallet's sheet, Done, the window's Payment complete.
check("One-tap: Pay with Apple Pay pressed, the wallet's sheet up, Done, Payment complete, each transform and opacity", tap.every((k) => onlyCompositor(keyframes(k))) && words(co).includes("Confirm with Side Button") && words(co).includes("Payment complete") && words(co).includes("We sent your receipt and your access to sam.rivera@mail.com."))
check("  the round 5 ring, swapped labels and moving card field are gone", !/ck-ring|ck-w-g|rc-cardf|cmv-lift|cmv-after/.test(css))
const rec = ["cmv-rec", "cmv-fill", "cmv-st1", "cmv-st2", "cmv-st3", "cmv-mail", "cmv-btn"]
check("Reminders: a rail that fills (scaleX), the email up, the button pressed, one fade for the loop", rec.every((k) => onlyCompositor(keyframes(k))) && /scaleX/.test(keyframes("cmv-fill")))
// Changed on purpose (landing round 8): the four cards are a grid (no tabs), so no demo is drawn on a tab switch.
check("no tabs to open: each card's demo runs only while that card is on screen", !/role="tab"|cmc-panel/.test(co) && /\.cmc-card\[data-commerce-live\]/.test(css))

console.log("\nThe shared content box")
check("the cards sit in --home-max and --home-edge, as the showcase does", /max-width:var\(--home-max,2020px\)/.test(rule(".cmc-cards-in")) && /var\(--edge\)/.test(rule(".cmc-cards-in")) && /--edge:var\(--home-edge,clamp\(20px,5\.15vw,84px\)\)/.test(rule(".cmc")))

console.log("\nCopy")
const all = words(co)
check("no banned words, no em dash, no fans", !/unlock|elevate|seamless|powerful|effortless|supercharge|transform/i.test(all) && !/—/.test(all) && !/\bfans?\b/i.test(all))
check("registered in the push suite", read("scripts/run-push-tests.mjs").includes('"tests/home-landing-r7-checkout.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
