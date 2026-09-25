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
  check("the order on grey at the left, the form on a white half with a shadow", /lg:bg-\[#f6f7f8\]/.test(client) && /fixed inset-y-0 right-0 hidden w-1\/2 bg-white shadow-/.test(client))
  check("the order is open on a phone as the page arrives", /useState\(true\)/.test(client) && /Hide details/.test(client))
  check("the line says Qty 1, and nothing sits on its picture", /Qty 1/.test(summary) && !/aria-label="Quantity 1"/.test(summary))
  check("the code starts as a grey Add promotion code button", /Add promotion code/.test(summary) && /data-promo="add"/.test(summary))
  check("the chosen tip is white in a grey track, never black", /bg-white text-\[#1a1a2e\] shadow-/.test(summary) && !/bg-\[#1a1a2e\] text-white/.test(summary))
  check("Pay is 48px with an 8px corner, and Stripe signs the page", /h-12 w-full[^"]*rounded-\[8px\]/.test(ui) && /<PoweredByStripe \/>/.test(client))

  console.log("\nLeaving the checkout")
  check("Back returns through history, or replaces, and never pushes", /window\.history\.back\(\)/.test(client) && /router\.replace\(path\)/.test(client) && !/router\.push\(productUrl\)/.test(client))
  check("and is answered on the press: a spinner, the page dimmed", /data-leaving=/.test(client) && /leaving \? \(\s*<Spinner/.test(client))
  const buy = read("components/checkout/buy-button.tsx")
  const smart = read("components/checkout/smart-buy-button.tsx")
  const bar = read("components/store-builder/sticky-add-to-cart.tsx")
  check("a Buy button is never left spent when the product page comes back", [buy, smart, bar].every((f) => /usePressPending\(\)/.test(f)) && !/setLoading\(true\)/.test(buy + smart))
  check("and never waits for the analytics call before going", !/await trackFunnelStep/.test(buy + smart))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
