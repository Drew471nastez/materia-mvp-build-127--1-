/**
 * ===========================================================================
 *  A TAP ON BUY, ON A PHONE: THE CHECKOUT ARRIVES SMOOTHLY
 * ===========================================================================
 * The owner, on phones and in the iOS app: "make sure the checkout that a tap turns into is a more smooth and clean
 * feeling, smoother, higher fps, not laggy". The rules behind what scripts/check-checkout-mobile.mjs measures at
 * 390 by 844 with touch and the CPU four times slower:
 *
 *   FACTS     the window draws from the facts the page already read and refreshes them behind; a read started
 *             within FACTS_FRESH_MS (the one the finger going down starts) is the window's own, not a second one
 *   SHAPE     while the facts are still on their way the placeholder is the form's own shape, so nothing moves
 *   MOTION    on a phone the window rises from the foot of the screen (transform only, the app's sheet curve, 280ms)
 *             over the page dimming, goes back down in 220ms, and is still under reduced motion
 *   PRESS     every Buy gives under the finger (a phone has no hover) and ticks once (lib/native-bridge hapticTap)
 *   EARLY     Stripe.js is asked for as the window opens; the wallet row arrives without moving Pay
 *
 *   npx tsx tests/checkout-mobile-smooth.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FACTS_FRESH_MS, loadProductFacts, peekProductFacts } from "@/components/checkout/product-facts"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`)
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

async function main() {
  console.log("FACTS")
  {
    let reads = 0
    const answer = (title: string) => ({ product: { id: "p", title, variants: [] }, seller: { name: "S", avatarUrl: null }, checkout: {}, buyer: null })
    const realFetch = globalThis.fetch
    const realNow = Date.now
    let now = 1_000_000
    Date.now = () => now
    globalThis.fetch = (async () => {
      reads++
      return new Response(JSON.stringify(answer(`read ${reads}`)), { status: 200, headers: { "Content-Type": "application/json" } })
    }) as typeof fetch
    try {
      check("nothing to draw before any read", peekProductFacts("p") === null)
      const first = await loadProductFacts("p")
      check("the first read is made", reads === 1 && first.product.title === "read 1", reads)
      check("its answer can be drawn at once afterwards", peekProductFacts("p")?.product.title === "read 1")
      await loadProductFacts("p")
      check("a plain ask shares the read", reads === 1, reads)
      now += FACTS_FRESH_MS - 1
      await loadProductFacts("p", FACTS_FRESH_MS)
      check("a read started within FACTS_FRESH_MS is fresh enough for the window", reads === 1, reads)
      now += 2
      const again = await loadProductFacts("p", FACTS_FRESH_MS)
      check("an older one is read again", reads === 2 && again.product.title === "read 2", reads)
      check("and the newer answer is the one drawn next", peekProductFacts("p")?.product.title === "read 2")
      await loadProductFacts("p", true)
      check("`true` still always reads again", reads === 3, reads)
      check("the window waits a few hundred ms at most for the finger's read: 4s is the window", FACTS_FRESH_MS === 4000)
    } finally {
      globalThis.fetch = realFetch
      Date.now = realNow
    }
  }

  const instant = read("components/checkout/instant-checkout.tsx")
  const block = read("components/onepage/product-block.tsx")
  console.log("FIRST FRAME")
  check("the window starts from the facts the page already has", /const \[seed\] = React\.useState\(\(\) => peekProductFacts\(productId\)\)/.test(instant) && /React\.useState<ProductFacts \| null>\(seed\)/.test(instant))
  check("and the buyer's email, name and option from them too", /React\.useState\(\(\) => \(seed\?\.buyer \?/.test(instant) && /seed && seed\.product\.variants\.length/.test(instant))
  check("its own read shares one started within FACTS_FRESH_MS", /loadProductFacts\(productId, FACTS_FRESH_MS\)/.test(instant) && !/loadProductFacts\(productId, true\)/.test(instant))
  check("the form takes the placeholder's place a frame into the rise, as a transition", /requestAnimationFrame\(\(\) => React\.startTransition\(\(\) => setDrawn\(true\)\)\)/.test(instant) && /!facts \|\| !product \|\| !drawn \?/.test(instant))
  check("the finger going down starts the facts and the window's file", /const warmTap = \(\) => \{[\s\S]{0,200}void import\("@\/components\/checkout\/instant-checkout"\)[\s\S]{0,120}readProductFacts\(data\.product_id, FACTS_FRESH_MS\)/.test(block) && (block.match(/onPointerDown=\{warmTap\}/g) || []).length === 2)

  console.log("SHAPE")
  {
    const skeleton = instant.slice(instant.indexOf('data-instant-skeleton=""'), instant.indexOf(") : done ?"))
    check("the placeholder is the form's sections at their heights", /space-y-5/.test(instant.slice(instant.indexOf("data-instant-skeleton") - 80, instant.indexOf("data-instant-skeleton"))) && (skeleton.match(/h-12 rounded-xl/g) || []).length >= 3 && /h-\[50px\]/.test(skeleton) && /h-\[52px\]/.test(skeleton))
    check("its headings are the real words, unseen, so their lines are as tall", /text-transparent">Your details</.test(skeleton) && /text-transparent">Payment method</.test(skeleton))
    check("the code line sits in a line of the page's size, as the real one does", /<div>\s*<span className="inline-flex items-center gap-1[^"]*text-\[13px\][^"]*">Have a code\?/.test(skeleton))
    check("free or paid, from what the block shows", /free=\{parts\.free\}/.test(block) && /\{freeHint \? \(/.test(skeleton))
    check("the four grey bars of other sizes are gone", !/h-\[92px\] rounded-xl bg-\[#f3f4f6\]/.test(instant))
  }

  console.log("MOTION")
  {
    const win = read("components/checkout/checkout-window.tsx")
    const css = read("app/globals.css")
    /* Read from the source: the window is a client component the suite does not load. */
    check("280ms in, 220ms out on a phone; a computer's 140ms close kept", /export const PHONE_OPEN_MS = 280\n/.test(win) && /export const PHONE_EXIT_MS = 220\n/.test(win) && /export const EXIT_MS = 140\n/.test(win))
    check("the phone is the width below Tailwind's sm, the same in the script and the stylesheet", /export const PHONE_WIDTH = "\(max-width: 639\.98px\)"/.test(win) && css.includes("@media (max-width: 639.98px) {\n  .checkout-sheet {"))
    check("the window rises by transform alone, on the app's sheet curve", /@keyframes checkout-sheet-in \{ from \{ transform: translate3d\(0, 100%, 0\); \} \}/.test(css) && /\.checkout-sheet \{ animation: checkout-sheet-in 280ms cubic-bezier\(0\.32, 0\.72, 0, 1\) both; \}/.test(css))
    check("and goes back down when it leaves", /\[data-leaving\] > \.checkout-sheet \{ animation: checkout-sheet-out 220ms/.test(css))
    check("the page behind dims on a phone too, under it", /"checkout-sheet-scrim absolute inset-0 bg-\[#0b0b12\]\/55/.test(win) && !/absolute inset-0 hidden bg-\[#0b0b12\]\/55/.test(win))
    check("a computer keeps its centred window's own motion", /sm:animate-in sm:fade-in sm:slide-in-from-bottom-2 sm:duration-200/.test(win) && /leaving && "sm:translate-y-2 sm:opacity-0/.test(win))
    check("still under reduced motion", /@media \(max-width: 639\.98px\) and \(prefers-reduced-motion: reduce\) \{\s*\.checkout-sheet, \.checkout-sheet-scrim[^}]*animation: none; \}/.test(css))
    check("the close waits for the phone's own exit", /useExit\(onClose, windowExitMs\)/.test(win) && /reduced \? 0 : exitMs\(\)/.test(win))
    check("the window is drawn before the first paint after the tap", /useBeforePaint\(\(\) => setMounted\(true\), \[\]\)/.test(win))
    check("its class does not take the checkout page's own .checkout-rise", !/"checkout-rise relative/.test(win) && /\.checkout-rise \{ animation: checkout-rise 180ms ease-out both; \}/.test(css))
  }

  console.log("PRESS")
  {
    const css = read("app/globals.css")
    const buy = read("components/checkout/buy-button.tsx")
    const sticky = read("components/store-builder/sticky-add-to-cart.tsx")
    const sheet = read("components/onepage/product-sheet.tsx")
    const pay = read("components/community/public/compact-pay.tsx")
    check("a OnePage button gives under a finger", /@media \(hover: none\) \{[\s\S]{0,200}:is\(\.op-btn:active, \.op-host:active \.op-btn\) \{ scale: 0\.97; transition-duration: 60ms; \}/.test(css))
    check("and dims instead under reduced motion", /:is\(\.op-btn:active, \.op-host:active \.op-btn\) \{ scale: none; opacity: 0\.85; transition-duration: 0ms; \}/.test(css))
    check("the product page's Buy gives too", /active:scale-\[0\.98\] active:duration-75 motion-reduce:active:scale-100/.test(buy))
    check("the store's sticky Buy gives too", /active:scale-\[0\.97\] active:duration-75/.test(sticky))
    check("the product sheet's Buy gives too", /transition-\[translate,opacity,scale\] duration-200 ease-out active:scale-\[0\.98\]/.test(sheet))
    check("Pay and Get it free give too", /active:scale-\[0\.985\]/.test(pay) && /active:scale-\[0\.985\]/.test(instant))
    check("one light tick on each Buy, inside the press", /hapticTap\("light"\)\s*\n\s*startLoading\(\)/.test(buy) && /hapticTap\("light"\)\s*\n\s*let checkoutUrl/.test(sticky) && /hapticTap\("light"\)\s*\n\s*step\(\{ type: "buy", variantId \}\)/.test(block))
  }

  console.log("EARLY")
  {
    const pay = read("components/community/public/compact-pay.tsx")
    check("Stripe.js asked for as the window opens, for a product that is not free", /if \(!freeHint && !isOnePagePreview\(\)\) void getStripePromise\(\)/.test(instant))
    check("the wallet row comes in the card field's place, its 12px with it, so Pay holds still", /className="mt-3 grid grid-cols-2 gap-2\.5" data-pay-methods=""/.test(pay))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

void main()
