import { paymentsSetupErrorMessage, shouldRetryExpressAsController } from "@/lib/payments/stripe/setup-errors"

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}

check(
  "country errors stay specific",
  paymentsSetupErrorMessage({ message: "The country RO is not supported for this account" }).includes("country"),
)
check(
  "a card payments refusal is not a closed country",
  !paymentsSetupErrorMessage({ message: "You cannot request the card_payments capability for accounts in country DE" }).includes("Choose another country"),
)
check(
  "a recipient agreement refusal is not a closed country",
  !paymentsSetupErrorMessage({ message: "recipient ToS is not supported for platforms in FR creating accounts in FR" }).includes("Choose another country"),
)
check(
  "controller refusals are retried",
  shouldRetryExpressAsController({ message: "You must specify the controller parameter instead of type" }),
)
check(
  "email errors are not retried as controller",
  !shouldRetryExpressAsController({ message: "Invalid email address" }),
)
check(
  "platform rejection is not the generic sentence",
  !paymentsSetupErrorMessage({
    message: "You cannot create new accounts because your account has been rejected",
  }).includes("Nothing was saved"),
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
