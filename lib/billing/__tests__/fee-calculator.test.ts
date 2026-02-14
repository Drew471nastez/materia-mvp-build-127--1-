/**
 * Unit tests for fee calculator
 *
 * Run with: npx tsx lib/billing/__tests__/fee-calculator.test.ts
 *
 * Fee rule: percentage + $0.25 flat on ALL transactions.
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
// computeApplicationFee — $0.25 flat on every transaction
// ════════════════════════════════════════════════════════════════

console.log("\n=== computeApplicationFee ===\n")

// ── Free plan (6% + $0.25) ──
console.log("Free plan (6% + $0.25):")
assert(
  "$1.00 (100c) → 6%=6c + 25c → 31c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "free" }),
  31
)
assert(
  "$2.99 (299c) → 6%=18c + 25c → 43c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "free" }),
  43
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

// ── Growth plan (3% + $0.25) ──
console.log("\nGrowth plan (3% + $0.25):")
assert(
  "$1.00 (100c) → 3%=3c + 25c → 28c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "growth" }),
  28
)
assert(
  "$2.99 (299c) → 3%=9c + 25c → 34c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "growth" }),
  34
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

// ── Pro plan (1.5% + $0.25) ──
console.log("\nPro plan (1.5% + $0.25):")
assert(
  "$1.00 (100c) → 1.5%=2c + 25c → 27c",
  computeApplicationFee({ unitAmount: 100, sellerPlan: "pro" }),
  27
)
assert(
  "$2.99 (299c) → 1.5%=4c + 25c → 29c",
  computeApplicationFee({ unitAmount: 299, sellerPlan: "pro" }),
  29
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
// Edge cases
// ════════════════════════════════════════════════════════════════

console.log("\n=== Edge cases ===\n")

assert(
  "$0 → clamped to 0 (fee cannot exceed amount)",
  computeApplicationFee({ unitAmount: 0, sellerPlan: "free" }),
  0
)
assert(
  "1c free → 6%=0c + 25c = 25c, clamped to 1c",
  computeApplicationFee({ unitAmount: 1, sellerPlan: "free" }),
  1
)
assert(
  "10c free → 6%=1c + 25c = 26c, clamped to 10c",
  computeApplicationFee({ unitAmount: 10, sellerPlan: "free" }),
  10
)
assert(
  "50c free → 6%=3c + 25c = 28c",
  computeApplicationFee({ unitAmount: 50, sellerPlan: "free" }),
  28
)

// ════════════════════════════════════════════════════════════════
// calculateFeeWithPlan — uses plan ID to resolve hardcoded fee
// ════════════════════════════════════════════════════════════════

console.log("\n=== calculateFeeWithPlan ===\n")

// Even if plan.fee_percent is wrong, the function uses the ID to resolve correctly
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

// Plan ID resolution
const proPlanVariant = { id: "Pro", name: "Pro", fee_percent: 0, fee_fixed_cents: 0 }
const resultPro = calculateFeeWithPlan(300, proPlanVariant)
assert(
  "300c Pro (uppercase ID) → 1.5%=5c + 25c → 30c",
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

// Unknown plan ID defaults to free
const unknownPlan = { id: "enterprise", name: "Enterprise", fee_percent: 0, fee_fixed_cents: 0 }
const resultUnknown = calculateFeeWithPlan(300, unknownPlan)
assert(
  "300c unknown plan → defaults to free (6%) → 43c",
  resultUnknown.platformFeeCents,
  43
)

// $0.25 always applied (no threshold)
const result100 = calculateFeeWithPlan(100, { id: "free", name: "Free", fee_percent: 0.06, fee_fixed_cents: 25 })
assert(
  "100c ($1) free → 6%=6c + 25c = 31c (flat fee always applies)",
  result100.platformFeeCents,
  31
)
assert(
  "100c free → fixedFee=25 (always)",
  result100.feeFixedCents,
  25
)

// ═══════════════════════════════════════════════════════════════
// getFeePreview — all plans
// ═══════════════════════════════════════════════════════════════

console.log("\n=== getFeePreview ===\n")

const freePreview100 = getFeePreview(100, "free")
assert("getFeePreview 100c free → 31c", freePreview100.platformFeeCents, 31)

const freePreview300 = getFeePreview(300, "free")
assert("getFeePreview 300c free → 43c", freePreview300.platformFeeCents, 43)

const growthPreview300 = getFeePreview(300, "growth")
assert("getFeePreview 300c growth → 34c", growthPreview300.platformFeeCents, 34)

const proPreview300 = getFeePreview(300, "pro")
assert("getFeePreview 300c pro → 30c", proPreview300.platformFeeCents, 30)

const freePreview1000 = getFeePreview(1000, "free")
assert("getFeePreview 1000c free → 85c", freePreview1000.platformFeeCents, 85)

// ── Clamp: fee should never exceed total ──
console.log("\n=== Clamp tests ===\n")

const resultClamp = calculateFeeWithPlan(10, { id: "free", name: "Free", fee_percent: 0, fee_fixed_cents: 0 })
assert(
  "Clamp: 6% of 10c = 1c + 25c = 26c, clamped to 10c",
  resultClamp.platformFeeCents,
  10
)
assert(
  "Clamp: seller receives 0c",
  resultClamp.sellerReceivesCents,
  0
)

// ── Summary ──

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
if (failed > 0) process.exit(1)
