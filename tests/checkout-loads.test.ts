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
  check("and steps down to the next list when Stripe refuses one", /onLoadError=\{\(\) => onRefused\?\.\(\)\}/.test(pay) && /<Elements key=\{setIndex\}/.test(pay))
  check("Pay sends the list it loaded with", (pay.match(/createIntent\([^)]*, methods\)/g) ?? []).length === 2)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
