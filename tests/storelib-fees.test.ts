import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { MICRO_TRANSACTION_THRESHOLD_USD_CENTS } from "@/lib/payments/fees/config"

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

const at4 = calculateStorelibFee({ grossMinor: 400, currency: "USD", sellerPlan: "free" })
check("free at $4 uses standard tier", at4.pricingTier === "standard" && at4.fixedFeeMinor === 25)
check("free at $4 fee is 49c", at4.totalStorelibFeeMinor === 49)

const under = calculateStorelibFee({ grossMinor: 399, currency: "USD", sellerPlan: "free" })
check("under $4 is micro", under.pricingTier === "micro" && under.fixedFeeMinor === 0)
check("free micro 12.25% of 399", under.totalStorelibFeeMinor === Math.round(399 * 0.1225))

check("threshold is 400 cents", MICRO_TRANSACTION_THRESHOLD_USD_CENTS === 400)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
