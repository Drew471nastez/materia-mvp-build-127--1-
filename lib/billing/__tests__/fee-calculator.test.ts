/**
 * Unit tests for fee calculator
 *
 * Run with: npx tsx lib/billing/__tests__/fee-calculator.test.ts
 *
 * These verify:
 *   - computeApplicationFee (pure function)
 *   - calculateFeeWithPlan (plan-based helper)
 *   - getFeePreview (UI helper)
 *   - Threshold at exactly 299c / 300c boundary
 *   - All three plans at $1, $3, $10
 *   - Edge cases (0c, 1c, clamp)
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
// computeApplicationFee — all 9 mandatory examples
// ════════════════════════════════════════════════════════════════

console.log("\n=== computeApplicationFee ===\n")

// ── Free plan (6%) ──
console.log("Free plan (6%):")
assert(
  "$1.00 (100c) → 6%=6c, fixed=0 → 6c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "free" }),
  6
)
assert(
  "$3.00 (300c) → 6%=18c, fixed=25c → 43c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "free" }),
  43
)
assert(
  "$10.00 (1000c) → 6%=60c, fixed=25c → 85c",
  computeApplicationFee({ unitAmount: 1000, sellerPlan: "free" }),
  85
)

// ── Growth plan (3%) ──
console.log("\nGrowth plan (3%):")
assert(
  "$1.00 (100c) → 3%=3c, fixed=0 → 3c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "growth" }),
  3
)
assert(
  "$3.00 (300c) → 3%=9c, fixed=25c → 34c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "growth" }),
  34
)
assert(
  "$10.00 (1000c) → 3%=30c, fixed=25c → 55c",
  computeApplicationFee({ unitAmount: 1000, sellerPlan: "growth" }),
  55
)

// ── Pro plan (1.5%) ──
console.log("\nPro plan (1.5%):")
assert(
  "$1.00 (100c) → 1.5%=2c, fixed=0 → 2c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "pro" }),
  2
)
assert(
  "$3.00 (300c) → 1.5%=5c, fixed=25c → 30c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "pro" }),
  30
)
assert(
  "$10.00 (1000c) → 1.5%=15c, fixed=25c → 40c",
  computeApplicationFee({ unitAmount: 1000, sellerPlan: "pro" }),
  40
)

// ════════════════════════════════════════════════════════════════
// Threshold boundary: 299c vs 300c (MUST NOT vs MUST add $0.25)
// ════════════════════════════════════════════════════════════════

console.log("\n=== Threshold boundary (299c / 300c) ===\n")

console.log("Free plan:")
assert(
  "299c free → 6%=18c, NO fixed → 18c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "free" }),
  18
)
assert(
  "300c free → 6%=18c, fixed=25c → 43c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "free" }),
  43
)

console.log("\nGrowth plan:")
assert(
  "299c growth → 3%=9c, NO fixed → 9c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "growth" }),
  9
)
assert(
  "300c growth → 3%=9c, fixed=25c → 34c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "growth" }),
  34
)

console.log("\nPro plan:")
assert(
  "299c pro → 1.5%=4c, NO fixed → 4c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "pro" }),
  4
)
assert(
  "300c pro → 1.5%=5c, fixed=25c → 30c",
  computeApplicationFee({ unitAmount: 300, sellerPlan: "pro" }),
  30
)

// ════════════════════════════════════════════════════════════════
// Edge cases
// ════════════════════════════════════════════════════════════════

console.log("\n=== Edge cases ===\n")

assert(
  "$0 → fee=0 (no negative fees)",
  computeApplicationFee({ unitAmount: 0, sellerPlan: "free" }),
  0
)
assert(
  "1c free → 6% rounds to 0c, fixed=0 → 0c",
  computeApplicationFee({ unitAmount: 1, sellerPlan: "free" }),
  0
)
assert(
  "50c free → 6%=3c, fixed=0 → 3c",
  computeApplicationFee({ unitAmount: 50, sellerPlan: "free" }),
  3
)

// ════════════════════════════════════════════════════════════════
// calculateFeeWithPlan — uses plan ID to resolve hardcoded fee
// ════════════════════════════════════════════════════════════════

console.log("\n=== calculateFeeWithPlan ===\n")

// Even if plan.fee_percent is wrong, the function should use the ID to resolve correctly
const planWithWrongPercent = { id: "free", name: "Free", fee_percent: 0.99, fee_fixed_cents: 999 }

const result300Wrong = calculateFeeWithPlan(300, planWithWrongPercent)
assert(
  "300c plan with wrong fee_percent=0.99 → still uses hardcoded 6% → 43c",
  result300Wrong.platformFeeCents,
  43
)
assert(
  "300c plan with wrong fee_fixed_cents=999 → still uses hardcoded 25c fixed",
  result300Wrong.feeFixedCents,
  25
)

// Test that plan ID resolution works for different capitalisations
const proPlanVariant = { id: "Pro", name: "Pro", fee_percent: 0, fee_fixed_cents: 0 }
const resultPro = calculateFeeWithPlan(300, proPlanVariant)
assert(
  "300c Pro (uppercase ID) → 1.5%=5c, fixed=25c → 30c",
  resultPro.platformFeeCents,
  30
)

const proFessionalPlan = { id: "professional", name: "Professional", fee_percent: 0, fee_fixed_cents: 0 }
const resultProfessional = calculateFeeWithPlan(300, proFessionalPlan)
assert(
  "300c professional → resolves to pro → 30c",
  resultProfessional.platformFeeCents,
  30
)

// Unknown plan ID should default to free
const unknownPlan = { id: "enterprise", name: "Enterprise", fee_percent: 0, fee_fixed_cents: 0 }
const resultUnknown = calculateFeeWithPlan(300, unknownPlan)
assert(
  "300c unknown plan → defaults to free (6%) → 43c",
  resultUnknown.platformFeeCents,
  43
)

// ── productPriceCents threshold override ──
console.log("\n--- productPriceCents threshold tests ---")

// Total is 500c ($5 product + tip) but product price is only 200c → no fixed fee
const resultTipAboveThreshold = calculateFeeWithPlan(
  500,
  { id: "free", name: "Free", fee_percent: 0.06, fee_fixed_cents: 25 },
  200 // product price < 300
)
assert(
  "500c total, 200c product → no fixed fee → 6%=30c",
  resultTipAboveThreshold.platformFeeCents,
  30
)
assert(
  "500c total, 200c product → fixedFee=0",
  resultTipAboveThreshold.feeFixedCents,
  0
)

// Total is 500c, product price is 300c → fixed fee applies
const resultTipExactThreshold = calculateFeeWithPlan(
  500,
  { id: "free", name: "Free", fee_percent: 0.06, fee_fixed_cents: 25 },
  300 // product price >= 300
)
assert(
  "500c total, 300c product → fixed fee → 6%=30c + 25c = 55c",
  resultTipExactThreshold.platformFeeCents,
  55
)
assert(
  "500c total, 300c product → fixedFee=25",
  resultTipExactThreshold.feeFixedCents,
  25
)

// ═══════════════════════════════════════════════════════════════
// getFeePreview — all plans
// ═══════════════════════════════════════════════════════════════

console.log("\n=== getFeePreview ===\n")

const freePreview300 = getFeePreview(300, "free")
assert("getFeePreview 300c free → 43c", freePreview300.platformFeeCents, 43)

const growthPreview300 = getFeePreview(300, "growth")
assert("getFeePreview 300c growth → 34c", growthPreview300.platformFeeCents, 34)

const proPreview300 = getFeePreview(300, "pro")
assert("getFeePreview 300c pro → 30c", proPreview300.platformFeeCents, 30)

const freePreview100 = getFeePreview(100, "free")
assert("getFeePreview 100c free → 6c (no fixed)", freePreview100.platformFeeCents, 6)

const freePreview1000 = getFeePreview(1000, "free")
assert("getFeePreview 1000c free → 85c", freePreview1000.platformFeeCents, 85)

// ── Clamp test: fee should never exceed total ──
console.log("\n=== Clamp tests ===\n")

const tinyPlan = { id: "free", name: "Free", fee_percent: 1.0, fee_fixed_cents: 100 }
const resultClamp = calculateFeeWithPlan(50, tinyPlan)
assert(
  "Clamp: 6% of 50c = 3c + 0c fixed (50<300) → 3c (not capped)",
  resultClamp.platformFeeCents,
  3
)

const resultClamp2 = calculateFeeWithPlan(10, { id: "free", name: "Free", fee_percent: 1.0, fee_fixed_cents: 100 })
assert(
  "Clamp: 6% of 10c = 1c → 1c (fee < total, ok)",
  resultClamp2.platformFeeCents,
  1
)

// ── Summary ──

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
if (failed > 0) process.exit(1)
