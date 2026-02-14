/**
 * Unit tests for computeApplicationFee
 *
 * Run with: npx tsx lib/billing/__tests__/fee-calculator.test.ts
 */
import { computeApplicationFee, calculateFeeWithPlan } from "../fee-calculator"

let passed = 0
let failed = 0

function assert(name: string, actual: number, expected: number) {
  if (actual === expected) {
    console.log(`  PASS: ${name} → ${actual}c`)
    passed++
  } else {
    console.error(`  FAIL: ${name} → got ${actual}c, expected ${expected}c`)
    failed++
  }
}

// ── computeApplicationFee tests ──

console.log("\n=== computeApplicationFee ===\n")

// Free plan
console.log("Free plan:")
assert(
  "$1.00 (100c) → 6%=6c, fixed=0 → fee=6c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "free" }),
  6
)
assert(
  "$2.99 (299c) → 6%=18c, fixed=0 → fee=18c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "free" }),
  18
)
assert(
  "$3.00 (300c) → 6%=18c, fixed=25c → fee=43c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "free" }),
  43
)
assert(
  "$10.00 (1000c) → 6%=60c, fixed=25c → fee=85c",
  computeApplicationFee({ unitAmount: 1000, sellerPlan: "free" }),
  85
)

// Growth plan
console.log("\nGrowth plan:")
assert(
  "$1.00 (100c) → 3%=3c, fixed=0 → fee=3c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "growth" }),
  3
)
assert(
  "$2.99 (299c) → 3%=9c, fixed=0 → fee=9c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "growth" }),
  9
)
assert(
  "$3.00 (300c) → 3%=9c, fixed=25c → fee=34c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "growth" }),
  34
)
assert(
  "$10.00 (1000c) → 3%=30c, fixed=25c → fee=55c",
  computeApplicationFee({ unitAmount: 1000, sellerPlan: "growth" }),
  55
)

// Pro plan
console.log("\nPro plan:")
assert(
  "$1.00 (100c) → 1.5%=2c, fixed=0 → fee=2c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "pro" }),
  2
)
assert(
  "$2.99 (299c) → 1.5%=4c, fixed=0 → fee=4c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "pro" }),
  4
)
assert(
  "$3.00 (300c) → 1.5%=5c, fixed=25c → fee=30c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "pro" }),
  30
)
assert(
  "$10.00 (1000c) → 1.5%=15c, fixed=25c → fee=40c",
  computeApplicationFee({ unitAmount: 1000, sellerPlan: "pro" }),
  40
)

// Edge cases
console.log("\nEdge cases:")
assert(
  "$0 → fee=0 (no negative fees)",
  computeApplicationFee({ unitAmount: 0, sellerPlan: "free" }),
  0
)
assert(
  "1c free → 6% rounds to 0c, fixed=0 → fee=0c",
  computeApplicationFee({ unitAmount: 1, sellerPlan: "free" }),
  0
)
assert(
  "50c free → 6%=3c, fixed=0 → fee=3c",
  computeApplicationFee({ unitAmount: 50, sellerPlan: "free" }),
  3
)

// ── calculateFeeWithPlan tests (with threshold) ──

console.log("\n=== calculateFeeWithPlan (fixed fee threshold) ===\n")

const freePlan = { id: "free", name: "Free", fee_percent: 0.06, fee_fixed_cents: 25 }

const result299 = calculateFeeWithPlan(299, freePlan)
assert(
  "299c free: no fixed fee → platformFee=18c",
  result299.platformFeeCents,
  18
)
assert(
  "299c free: feeFixedCents returned=0",
  result299.feeFixedCents,
  0
)

const result300 = calculateFeeWithPlan(300, freePlan)
assert(
  "300c free: fixed fee applied → platformFee=43c",
  result300.platformFeeCents,
  43
)
assert(
  "300c free: feeFixedCents returned=25",
  result300.feeFixedCents,
  25
)

const result300seller = calculateFeeWithPlan(300, freePlan)
assert(
  "300c free: seller receives 300-43=257c",
  result300seller.sellerReceivesCents,
  257
)

// Clamp test: fee should never exceed total
const tinyPlan = { id: "test", name: "Test", fee_percent: 1.0, fee_fixed_cents: 100 }
const resultClamp = calculateFeeWithPlan(50, tinyPlan)
assert(
  "Clamp: 100% + 100c fixed on 50c → capped at 50c",
  resultClamp.platformFeeCents,
  50
)
assert(
  "Clamp: seller receives 0c",
  resultClamp.sellerReceivesCents,
  0
)

// ── Summary ──

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
if (failed > 0) process.exit(1)
