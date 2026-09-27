/**
 * ===========================================================================
 *  THE CHECKOUT'S PAYMENT FORM LOADS IN A BROWSER
 * ===========================================================================
 * Two things kept every field of the checkout on its loading skeleton:
 *
 *   The app's Stripe guard (lib/stripe-nav-guard) ran in every browser and
 *   blocked the controller frame Stripe.js talks to Stripe through.
 *
 *   The form left the ways to pay to Stripe, which refused the account's
 *   automatic list outright. Measured on the live account: automatic and
 *   Klarna are refused, card with Link and card alone load.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { METHOD_SETS, methodsFrom } from "@/lib/checkout/payment-methods"
import { ADMIN_CODE, adminCoupon, checkCoupon, isAdminCode } from "@/lib/checkout/coupons"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  console.log("\nThe Stripe guard is the app's alone")
  const guard = read("lib/stripe-nav-guard.ts")
  check("it is applied only inside the app's shell", /\nif \(isCapacitorShell\(\)\) applyStripeNavGuard\(\)\n/.test(guard) && !/\napplyStripeNavGuard\(\)\n/.test(guard))
  const loader = read("app/checkout/parts/stripe-loader.ts")
  check("the checkout's loader no longer switches it on by importing it", !/import "@\/lib\/stripe-nav-guard"/.test(loader))

  console.log("\nThe ways to pay are named, the same on both sides")
  check("card with Link first, card alone last", JSON.stringify(METHOD_SETS) === JSON.stringify([["card", "link"], ["card"]]))
  check("a request names one of the lists, or gets card alone", JSON.stringify(methodsFrom(["card", "link"])) === '["card","link"]' && JSON.stringify(methodsFrom(["card", "klarna"])) === '["card"]' && JSON.stringify(methodsFrom(undefined)) === '["card"]' && JSON.stringify(methodsFrom(["link"])) === '["card"]')
  const route = read("app/api/checkout/stripe-session/route.ts")
  check("the PaymentIntent is made for the methods the form loaded with", /payment_method_types: methodsFrom\(body\.paymentMethods\)/.test(route) && !/automatic_payment_methods/.test(route))
  const pay = read("app/checkout/parts/stripe-pay.tsx")
  check("the form asks Stripe for them by name", /paymentMethodTypes: methods/.test(pay))
  check("and steps down to the next list when Stripe refuses one", /onLoadError=\{\(\) => \(onRefused \? onRefused\(\) : setFailed\(true\)\)\}/.test(pay) && /<Elements key=\{`\$\{attempt\}:\$\{setIndex\}`\}/.test(pay))
  check("Pay sends the list it loaded with", (pay.match(/createIntent\([^)]*, methods\)/g) ?? []).length === 2)

  console.log("\nWhen it cannot load, it says so")
  check("a form not drawn in 15 seconds, or a Stripe.js that never arrives, shows Try again", /LOAD_PATIENCE_MS = 15_000/.test(pay) && /data-pay-failed/.test(pay) && /Try again/.test(pay) && /resetStripePromise\(\)/.test(pay))
  check("offline, Pay waits and says why", /function useOnline\(\)/.test(pay) && /You are offline\. Pay waits for the connection\./.test(pay) && /disabled=\{!stripe \|\| !elements \|\| !online\}/.test(pay))

  console.log("\nStripe Checkout's layout")
  const client = read("app/checkout/checkout-client.tsx")
  const summary = read("app/checkout/parts/order-summary.tsx")
  const ui = read("app/checkout/parts/ui.tsx")
  check("the order on grey at the left, the form on a white half with a shadow", /lg:bg-\[#f8f9fa\]/.test(client) && /fixed inset-y-0 right-0 hidden w-1\/2 bg-white shadow-/.test(client))
  /*
    "Make sure the left side with gray background is just a little bit more
    lightened", "in the split there's too much depth shadow, reduce it a
    little bit", "the same for the depth of the top bar". The grey is the
    app's own #f8f9fa (was #f6f7f8), and both shadows are shorter and
    fainter, the same in the skeleton so nothing changes as the page lands.
  */
  {
    const sk = read("app/checkout/checkout-skeleton.tsx")
    const split = "shadow-[-8px_0_24px_-14px_rgba(17,24,39,0.11)]"
    const barShadow = "shadow-[0_1px_0_rgba(17,17,19,0.055),0_4px_12px_-10px_rgba(17,17,19,0.09)]"
    check("the grey half a shade lighter, #f8f9fa, on the page and its skeleton", !/#f6f7f8/.test(client) && !/#f6f7f8/.test(sk) && /bg-\[#f8f9fa\] px-5/.test(client) && /bg-\[#f8f9fa\] px-5/.test(sk))
    check("the split's shadow and the bar's are lighter than they were, the same in the skeleton", client.includes(split) && sk.includes(split) && client.includes(barShadow) && sk.includes(barShadow) && !/0\.16\)\]/.test(client) && !/0_6px_16px_-12px/.test(client))
  }
  check("the order is open on a phone as the page arrives", /useState\(true\)/.test(client) && /Hide details/.test(client))
  check("the line says Qty 1, and nothing sits on its picture", /Qty 1/.test(summary) && !/aria-label="Quantity 1"/.test(summary))
  check("the code starts as a grey Add promotion code button", /Add promotion code/.test(summary) && /data-promo="add"/.test(summary))
  check("the chosen tip is white in a grey track, never black: one thumb that slides", /data-tip-thumb=""/.test(summary) && /rounded-\[8px\] bg-white shadow-/.test(summary) && /transition-\[translate\]/.test(summary) && !/bg-\[#1a1a2e\] text-white/.test(summary))
  /* "Make the add a tip with some options a little bit more visible, not toggleable." */
  {
    const tipPicker = summary.slice(summary.indexOf("export function TipPicker"), summary.indexOf("export function Totals"))
    check("the tip is always open: Add a tip, its choices under it, nothing that folds", /Add a tip/.test(tipPicker) && /data-tip-label=""/.test(tipPicker) && /role="radiogroup"\s*aria-labelledby=\{labelId\}/.test(tipPicker) && !/aria-expanded|data-tip-toggle|data-tip-open|setOpen/.test(tipPicker) && !/<Reveal open=\{open\}/.test(tipPicker))
    check("its choices are 36px, on a track with a faint edge that holds on the grey", /relative h-9 min-w-0/.test(tipPicker) && /bg-\[#e8eaed\] p-\[3px\] shadow-\[inset_0_0_0_1px/.test(tipPicker))
    const sk = read("app/checkout/checkout-skeleton.tsx")
    check("and the skeleton draws it open too, the track at the real one's height", /data-skeleton-tip=""/.test(sk) && /mt-2\.5 h-\[42px\] rounded-\[10px\]/.test(sk))
  }
  check("Pay is 48px with an 8px corner, and Stripe signs the page", /h-12 w-full[^"]*rounded-\[8px\]/.test(ui) && /<PoweredByStripe \/>/.test(client))

  console.log("\nLeaving the checkout")
  check("Back returns through history, or replaces, and never pushes", /window\.history\.back\(\)/.test(client) && /router\.replace\(path\)/.test(client) && !/router\.push\(productUrl\)/.test(client))
  check("and is answered on the press: a spinner, the page dimmed", /data-leaving=/.test(client) && /leaving \? \(\s*<Spinner/.test(client))
  const buy = read("components/checkout/buy-button.tsx")
  const smart = read("components/checkout/smart-buy-button.tsx")
  const bar = read("components/store-builder/sticky-add-to-cart.tsx")
  check("a Buy button is never left spent when the product page comes back", [buy, smart, bar].every((f) => /usePressPending\(\)/.test(f)) && !/setLoading\(true\)/.test(buy + smart))
  check("and never waits for the analytics call before going", !/await trackFunnelStep/.test(buy + smart))

  console.log("\nThe admin's own code")
  {
    const coupons = read("lib/checkout/coupons.ts")
    check("STORELIB100 is the code, in any case", ADMIN_CODE === "STORELIB100" && isAdminCode("storelib100") && isAdminCode(" STORELIB100 ") && !isAdminCode("STORELIB10"))
    const c = checkCoupon(adminCoupon("creator-1"), { productId: "p1", priceCents: 999900 })
    check("it takes the whole price off any product", c.ok === true && c.discountCents === 999900)
    const adminFile = read("lib/checkout/admin-code.ts")
    check("it is honoured only for a signed-in admin console session, checked on the server", /import "server-only"/.test(adminFile) && /if \(!\(await adminSignedIn\(\)\)\) return null/.test(adminFile) && /isAdminAuthenticated/.test(adminFile)
      && /const checked = \(await adminCodeCheck\(ask\)\) \?\? \(await validateCoupon\(db, ask\)\)/.test(read("lib/checkout/pricing.ts")))
    check("and the coupons file, which a client component imports, never reaches for the admin cookie", !/admin-blog-auth|next\/headers/.test(coupons))
    check("and has no row, so no hold is taken and no use counted", adminCoupon("x").id === "" && adminCoupon("x").usage_limit === null)
  }
  console.log("\nThe skeleton and the way in")
  {
    const page = read("app/checkout/page.tsx")
    check("the page's reads run together, not one after another", /await Promise\.all\(\[/.test(page) && (page.match(/await Promise\.all/g) ?? []).length >= 2)
    const sk = read("app/checkout/checkout-skeleton.tsx")
    check("the skeleton draws the bar and both halves at once, and only its blocks wait", /data-checkout-skeleton/.test(sk) && /skeleton-deferred relative mx-auto grid/.test(sk) && /fallback=\{<CheckoutSkeleton \/>\}/.test(page))
    const client = read("app/checkout/checkout-client.tsx")
    check("leaving the checkout cross-fades where the browser can", /startViewTransition/.test(client) && /data-checkout-motion/.test(client))
    /*
      "I click back, nothing happens, and it takes me back abruptly after 5
      seconds." The update waited on requestAnimationFrame, which never runs
      while a view transition waits for its update, until Chrome gave up
      after 4 seconds. And the fade itself was `animation: none`.
    */
    const leave = client.slice(client.indexOf("const leaveWithFade"), client.indexOf("CONTINUE SHOPPING goes"))
    check("the way out starts on the press, before the transition, not inside it", /const leaveWithFade = \(go: \(\) => void\) => \{\s*go\(\)/.test(leave))
    check("the transition waits on a MutationObserver and a timer, never on an animation frame", /new MutationObserver/.test(leave) && /window\.setTimeout\(done, LEAVE_HOLD_MS\)/.test(leave) && /const LEAVE_HOLD_MS = 400/.test(client) && !/new Promise<void>\(\(resolve\) => \{[^]*requestAnimationFrame\(tick\)/.test(leave))
    check("the press shows in the click itself, before React renders it", /pageRef\.current\?\.setAttribute\("data-leaving", way\)/.test(client) && /window\.setTimeout\(\(\) => setGoing\(way\), GOING_STATE_MS\)/.test(client) && /if \(alreadyGoing\(\)\) return/.test(client) && /data-\[leaving\]:opacity-80/.test(client) && /group-data-\[leaving=back\]\/page:scale-\[0\.94\]/.test(client))
    const css = read("app/globals.css")
    check("and the fade is an animation in full, not a duration on none", /@keyframes checkout-arrive \{ from \{ opacity: 0; \} \}/.test(css) && /html\[data-checkout-motion\]::view-transition-new\(root\) \{\s*animation: checkout-arrive 240ms/.test(css))
    check("Back is a quiet rounded square, not a raised circle", /data-back-face=""\s*className=\{cn\(\s*"relative grid h-9 w-9 place-items-center rounded-\[10px\]/.test(client))
    check("a Back through another document is the browser's own, with no transition around it", /if \(cameFrom !== null && cameFrom === target && window\.history\.length > 1\) \{\s*window\.history\.back\(\)/.test(client))
  }

  console.log("\nFinishing: one screen from paid to the receipt")
  {
    const client = read("app/checkout/checkout-client.tsx")
    const success = read("app/checkout/parts/success.tsx")
    const css = read("app/globals.css")
    check("the receipt is asked for while the check draws", /router\.prefetch\(receiptHref\(receiptToken\), \{ kind: "full" \} as never\)/.test(client) && /window\.setTimeout\(\(\) => afterPaid\(receiptToken\), PAID_SCREEN_MS\)/.test(client))
    check("the paid screen is held over the change of page until the receipt is under it", /holdPaidScreen\(\)\s*router\.replace\(receiptHref/.test(client) && /document\.body\.appendChild\(held\)/.test(success) && /\[data-receipt\]/.test(success) && /HOLD_LIMIT_MS = 12_000/.test(success))
    check("held as it stood, and faded off, not cut", /\.checkout-paid-held \* \{ animation: none !important; \}/.test(css) && /\.checkout-paid-held\.checkout-paid-release \{ opacity: 0; \}/.test(css) && /held\.classList\.add\("checkout-paid-release"\)/.test(success))
    check("the receipt, its not-found page and its loading page say which they are", /<main data-receipt=""/.test(read("app/receipt/[token]/receipt-view.tsx")) && /<main data-receipt=""/.test(read("app/receipt/[token]/not-found.tsx")) && /<main data-receipt-loading=""/.test(read("app/receipt/[token]/loading.tsx")))
    check("back from a bank's page, the first frame is Finishing your order, not the form", /const \[arriving, setArriving\] = React\.useState\(\(\) => \{/.test(client) && /state=\{paid \? "paid" : arriving \? "finishing" : null\}/.test(client) && /Finishing your order/.test(success) && !/createPortal/.test(success))
    check("and the overlay sits beside the inert page, so its status is still read out", /<\/div>\s*\{\/\* Beside the page, not in it/.test(client))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
