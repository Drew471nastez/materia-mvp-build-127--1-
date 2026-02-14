/**
 * Unit tests for fee calculator
 *
 * Run with: npx tsx lib/billing/__tests__/fee-calculator.test.ts
 *
 * Fee rule: percentage + $0.25 ONLY on orders >= $3.00 (300 cents).
 * Under $3.00 → percentage only, no $0.25.
 */
import { computeApplicationFee, calculateFeeWithPlan, getFeePreview } from "../fee-calculator"

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

// ════════════════════════════════════════════════════════════════
// computeApplicationFee — $0.25 only on orders >= $3.00
// ════════════════════════════════════════════════════════════════

console.log("\n=== computeApplicationFee ===\n")

// ── Free plan (6%) ──
console.log("Free plan (6%):")
assert(
  "$1.00 (100c) → 6%=6c, NO fixed → 6c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "free" }),
  6
)
assert(
  "$2.99 (299c) → 6%=18c, NO fixed → 18c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "free" }),
  18
)
assert(
  "$3.00 (300c) → 6%=18c + 25c → 43c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "free" }),
  43
)
assert(
  "$10.00 (1000c) → 6%=60c + 25c → 85c",
  computeApplicationFee({ unitAmount: 1000, sellerPlan: "free" }),
  85
)

// ── Growth plan (3%) ──
console.log("\nGrowth plan (3%):")
assert(
  "$1.00 (100c) → 3%=3c, NO fixed → 3c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "growth" }),
  3
)
assert(
  "$2.99 (299c) → 3%=9c, NO fixed → 9c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "growth" }),
  9
)
assert(
  "$3.00 (300c) → 3%=9c + 25c → 34c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "growth" }),
  34
)
assert(
  "$10.00 (1000c) → 3%=30c + 25c → 55c",
  computeApplicationFee({ unitAmount: 1000, sellerPlan: "growth" }),
  55
)

// ── Pro plan (1.5%) ──
console.log("\nPro plan (1.5%):")
assert(
  "$1.00 (100c) → 1.5%=2c, NO fixed → 2c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "pro" }),
  2
)
assert(
  "$2.99 (299c) → 1.5%=4c, NO fixed → 4c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "pro" }),
  4
)
assert(
  "$3.00 (300c) → 1.5%=5c + 25c → 30c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "pro" }),
  30
)
assert(
  "$10.00 (1000c) → 1.5%=15c + 25c → 40c",
  computeApplicationFee({ unitAmount: 1000, sellerPlan: "pro" }),
  40
)

// ════════════════════════════════════════════════════════════════
// Threshold boundary: 299c vs 300c
// ════════════════════════════════════════════════════════════════

console.log("\n=== Threshold boundary (299c NO fixed / 300c YES fixed) ===\n")

assert("299c free → 18c (no $0.25)", computeApplicationFee({ unitAmount: 299, sellerPlan: "free" }), 18)
assert("300c free → 43c (with $0.25)", computeApplicationFee({ unitAmount: 300, sellerPlan: "free" }), 43)
assert("299c growth → 9c (no $0.25)", computeApplicationFee({ unitAmount: 299, sellerPlan: "growth" }), 9)
assert("300c growth → 34c (with $0.25)", computeApplicationFee({ unitAmount: 300, sellerPlan: "growth" }), 34)
assert("299c pro → 4c (no $0.25)", computeApplicationFee({ unitAmount: 299, sellerPlan: "pro" }), 4)
assert("300c pro → 30c (with $0.25)", computeApplicationFee({ unitAmount: 300, sellerPlan: "pro" }), 30)

// ════════════════════════════════════════════════════════════════
// Edge cases
// ════════════════════════════════════════════════════════════════

console.log("\n=== Edge cases ===\n")

assert("$0 → 0c", computeApplicationFee({ unitAmount: 0, sellerPlan: "free" }), 0)
assert("1c free → 0c", computeApplicationFee({ unitAmount: 1, sellerPlan: "free" }), 0)
assert("50c free → 3c", computeApplicationFee({ unitAmount: 50, sellerPlan: "free" }), 3)

// ════════════════════════════════════════════════════════════════
// calculateFeeWithPlan — hardcoded fees override DB values
// ════════════════════════════════════════════════════════════════

console.log("\n=== calculateFeeWithPlan ===\n")

const wrongPlan = { id: "free", name: "Free", fee_percent: 0.99, fee_fixed_cents: 999 }
assert("300c wrong DB values → hardcoded 6% → 43c", calculateFeeWithPlan(300, wrongPlan).platformFeeCents, 43)
assert("100c wrong DB values → hardcoded 6%, no fixed → 6c", calculateFeeWithPlan(100, wrongPlan).platformFeeCents, 6)

assert("300c Pro uppercase → 30c", calculateFeeWithPlan(300, { id: "Pro", name: "Pro", fee_percent: 0, fee_fixed_cents: 0 }).platformFeeCents, 30)
assert("300c professional → 30c", calculateFeeWithPlan(300, { id: "professional", name: "Professional", fee_percent: 0, fee_fixed_cents: 0 }).platformFeeCents, 30)
assert("300c unknown → free 43c", calculateFeeWithPlan(300, { id: "enterprise", name: "Enterprise", fee_percent: 0, fee_fixed_cents: 0 }).platformFeeCents, 43)

// Under $3 → no fixed fee
assert("100c free → 6c (no $0.25)", calculateFeeWithPlan(100, wrongPlan).feeFixedCents, 0)
// At $3 → fixed fee
assert("300c free → fixedFee=25", calculateFeeWithPlan(300, wrongPlan).feeFixedCents, 25)

// ═══════════════════════════════════════════════════════════════
// getFeePreview
// ═══════════════════════════════════════════════════════════════

console.log("\n=== getFeePreview ===\n")

assert("100c free → 6c (no fixed)", getFeePreview(100, "free").platformFeeCents, 6)
assert("300c free → 43c", getFeePreview(300, "free").platformFeeCents, 43)
assert("300c growth → 34c", getFeePreview(300, "growth").platformFeeCents, 34)
assert("300c pro → 30c", getFeePreview(300, "pro").platformFeeCents, 30)
assert("1000c free → 85c", getFeePreview(1000, "free").platformFeeCents, 85)

// ── Clamp ──
console.log("\n=== Clamp ===\n")

assert("Clamp: 10c free → 1c (capped)", calculateFeeWithPlan(10, { id: "free", name: "Free", fee_percent: 0, fee_fixed_cents: 0 }).platformFeeCents, 1)

// ── Summary ──
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
if (failed > 0) process.exit(1)
