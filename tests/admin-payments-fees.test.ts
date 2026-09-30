import { calculateStorelibFeeWithConfig } from "@/lib/payments/fees/engine"
import { codeDefaultFeeConfig } from "@/lib/payments/fees/defaults"
import { simulatePayment } from "@/lib/payments/fees/simulate"
import { readFileSync } from "node:fs"

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

const cfg = codeDefaultFeeConfig()

const freeStd = calculateStorelibFeeWithConfig({ grossMinor: 1000, currency: "USD", sellerPlan: "free" }, cfg)
check("free standard 6% + 25 on $10", freeStd.totalStorelibFeeMinor === 85)

const freeMicro = calculateStorelibFeeWithConfig({ grossMinor: 100, currency: "USD", sellerPlan: "free" }, cfg)
check("free micro 12.25% on $1", freeMicro.totalStorelibFeeMinor === Math.round(100 * 0.1225))

const proStd = calculateStorelibFeeWithConfig({ grossMinor: 1000, currency: "USD", sellerPlan: "paid" }, cfg)
check("pro standard 3% + 25 on $10", proStd.totalStorelibFeeMinor === 55)

const proMicro = calculateStorelibFeeWithConfig({ grossMinor: 399, currency: "USD", sellerPlan: "paid" }, cfg)
check("pro micro under $4", proMicro.pricingTier === "micro" && proMicro.totalStorelibFeeMinor === Math.round(399 * 0.0925))

const atThreshold = calculateStorelibFeeWithConfig({ grossMinor: 400, currency: "USD", sellerPlan: "free" }, cfg)
check("at $4 threshold standard", atThreshold.pricingTier === "standard")

const below = calculateStorelibFeeWithConfig({ grossMinor: 399, currency: "USD", sellerPlan: "free" }, cfg)
check("one cent below threshold micro", below.pricingTier === "micro")

const jpy = calculateStorelibFeeWithConfig({ grossMinor: 500, currency: "JPY", sellerPlan: "free" }, cfg)
check("JPY zero-decimal works", jpy.grossMinor === 500)

let unsupported = false
try {
  calculateStorelibFeeWithConfig({ grossMinor: 100, currency: "XYZ", sellerPlan: "free" }, cfg)
} catch {
  unsupported = true
}
check("unsupported currency throws", unsupported)

const sim = simulatePayment({ sellerPlan: "free", grossMinor: 399, currency: "USD", kind: "one_time", refund: "none", config: cfg })
check("simulation flagged only", sim.simulationOnly === true)
check("simulation no stripe fee", sim.stripeProcessingFeeMinor === null)

const simSrc = readFileSync("app/api/admin/payments/simulate/route.ts", "utf8")
check("simulator route does not import stripe client", !/from \"@\/lib\/stripe\"/.test(simSrc) && !/new Stripe/.test(simSrc))

const routes = [
  "app/api/admin/payments/overview/route.ts",
  "app/api/admin/payments/simulate/route.ts",
  "app/api/admin/payments/fees/route.ts",
]
for (const f of routes) {
  const src = readFileSync(f, "utf8")
  check(`${f} requires admin`, /await requireAdmin\(\)/.test(src))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
