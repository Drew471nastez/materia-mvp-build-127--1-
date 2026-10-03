import { calculateStorelibFee, UnsupportedFeeCurrencyError } from "@/lib/payments/fees/calculate"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"

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
check("free at $4 fee is 45c", at4.totalStorelibFeeMinor === 45)

const under = calculateStorelibFee({ grossMinor: 399, currency: "USD", sellerPlan: "free" })
check("under $4 is micro", under.pricingTier === "micro" && under.fixedFeeMinor === 0)
check("free micro 11.25% of 399", under.totalStorelibFeeMinor === Math.round(399 * 0.1125))

const ronMicro = calculateStorelibFee({ grossMinor: 1839, currency: "RON", sellerPlan: "free" })
check("RON under threshold is micro", ronMicro.pricingTier === "micro")

let threw = false
try {
  calculateStorelibFee({ grossMinor: 100, currency: "XYZ", sellerPlan: "free" })
} catch (e) {
  threw = e instanceof UnsupportedFeeCurrencyError
}
check("unknown currency throws", threw)

check("USD rule threshold 400", CURRENCY_FEE_RULES.USD.microThresholdMinor === 400)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
