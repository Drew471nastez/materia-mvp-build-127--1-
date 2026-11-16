/**
 * LANDING ROUND 13, THE CHECKOUT SECTION: "One page, then paid"
 *
 * The owner, after round 12: on larger desktop screens the checkout window in the card should be wider, filling much
 * more of the card's width, and the same on phones (360 to 430).
 *
 *   computer   the drawing is the whole picture, not the 48 x 42 box in its middle; the window fills it to
 *              clamp(12px,2.4cqw,24px), its height is what the picture leaves, and the page scrolls by what that
 *              height hides
 *   scroll     the scroll ends at 1330u, not 1012u: the form grew Delivery and Shipping method, Pay's foot is at 1284u,
 *              and with 1012u Pay never came into view on a computer
 *   notice     the seller's notice drops in under the window's address bar, not over the address
 *   phone      still 4:3; the picture runs to 8px from the card's edge, the window to 6px from the picture's
 *
 * Measured on the dev server with a scratch Playwright script (window width over card width, before and after):
 *   1280 0.668 -> 0.837   1440 0.666 -> 0.837   1920 0.589 -> 0.862   2560 0.742 -> 0.867
 *   360  0.850 -> 0.906   390  0.857 -> 0.914   430  0.865 -> 0.922
 *   and with the loop held at 5.5s, Pay's foot inside the window's view at every one of those widths.
 */
import { CHECKOUT_STYLES } from "../components/marketing/home/checkout-scene"

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
const phoneCss = css.slice(css.lastIndexOf("@media (max-width:899px){", css.indexOf(".cmc-bento{grid-template-columns:minmax(0,1fr)")), css.indexOf("@keyframes cdx-scroll"))
const deskAt = css.indexOf(".cmc-card[data-k=convert] .cmc-vis-in{left:0;width:100%;height:100%;margin-left:0}")
const desk = deskAt < 0 ? "" : css.slice(css.lastIndexOf("@media (min-width:900px){", deskAt), css.indexOf("\n}", deskAt))

console.log("\n1. On a computer the window fills the picture")
check("the drawing is the whole picture, only for Built to convert, only from 900px", deskAt > 0 && desk.startsWith("@media (min-width:900px){"))
check("  the window fills it to a thin margin, its own height, not 880:700 in the middle", /\.cmc-card\[data-k=convert\] \.cdx\{inset:clamp\(12px,2\.4cqw,24px\);aspect-ratio:auto;transform:none\}/.test(desk))
check("  the seller's notice under the address bar", /\.cmc-card\[data-k=convert\] \.cmv-sale\{top:calc\(100cqw \* 38 \/ 880 \+ \.9em\);right:1\.1em\}/.test(desk))
check("  the other three cards keep the 48 x 42 box", /\.cmc-vis-in\{position:absolute;left:50%;top:0;width:48em;height:42em;margin-left:-24em;/.test(css))

console.log("\n2. The scroll still brings Pay into view")
check("the page scrolls to 1330u less the window's view, the shipping step at most 330u", /--vh:calc\(100cqh - calc\(38\*var\(--u\)\)\);--s1:min\(calc\(330\*var\(--u\)\),max\(0px,calc\(1330\*var\(--u\)\) - var\(--vh\)\)\);--s2:max\(0px,calc\(1330\*var\(--u\)\) - var\(--vh\)\)/.test(css))
check("  and 1012u is gone", !/1012\*var\(--u\)/.test(css))

console.log("\n3. On a phone, 4:3 and wider")
/* Changed on purpose (landing round 13, the owner's phone notes: "like it's on desktop, but on mobile"): the computer's picture on a phone, scaled. */
check("the computer's 48 x 42 picture on a phone too, not 4:3", !/\.cmc-card\[data-k=convert\] \.cmc-vis\{aspect-ratio:4\/3\}/.test(phoneCss) && /\.cmc-vis\{height:auto;aspect-ratio:48\/42;/.test(phoneCss))
check("  the picture to 8px from the card's edge, the window to 6px from the picture's", /\.cmc-card\[data-k=convert\] \.cmc-vis\{margin:0 -12px;border-radius:16px\}/.test(phoneCss) && /\.cmc-card\[data-k=convert\] \.cdx\{inset:6px;/.test(phoneCss))
check("  the phone's window is the computer's (880u wide, no 380u layout)", !/--u:calc\(100cqw \/ 380\)/.test(phoneCss))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
