/**
 * THE FREE PLAN FEE IS 5%, AND NOTHING SAYS OTHERWISE.
 *
 * The rule comes from one place (lib/payments/fees/defaults.ts, and run-now
 * part 80 for the database), and checkout, the fee previews, the
 * memberships fee and the plan copy all read it from there. This file holds
 * the numbers, the continuity across the small-order line in every
 * currency, the paid plan staying exactly as it was, the database part
 * agreeing with the code, and the copy no longer naming 6%.
 *
 * Replaces lib/billing/__tests__/fee-calculator.test.ts, which nothing ran
 * and which still described a $3.00 line and a 1.5% Pro rate.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { codeDefaultFeeConfig, CODE_FEE_RULE_VERSION } from "@/lib/payments/fees/defaults"
import { FREE_MICRO_RATE, FREE_STANDARD_RATE, PAID_MICRO_RATE, PAID_STANDARD_RATE, ratePercentLabel } from "@/lib/payments/fees/config"
import { calculateStorelibFeeWithConfig } from "@/lib/payments/fees/engine"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"
import { computeApplicationFee, calculateFeeWithPlan, getFeePreview, getFeeDescription } from "@/lib/billing/fee-calculator"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
  }
}
/* The push harness runs the compiled suite as an ES module, where __dirname does not exist; the repo root is the working directory. */
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const cfg = codeDefaultFeeConfig()
const usd = (gross: number, plan: "free" | "paid") => calculateStorelibFeeWithConfig({ grossMinor: gross, currency: "USD", sellerPlan: plan }, cfg).totalStorelibFeeMinor

console.log("\nOne rule")
check("the code rule is 5% on Free and 11.25% under the small-order line", cfg.freeStandardRate === 0.05 && cfg.freeMicroRate === 0.1125)
check("the exported constants are the same numbers", FREE_STANDARD_RATE === cfg.freeStandardRate && FREE_MICRO_RATE === cfg.freeMicroRate && PAID_STANDARD_RATE === cfg.paidStandardRate && PAID_MICRO_RATE === cfg.paidMicroRate)
check("the rule has a new version key, so orders show which rule charged them", CODE_FEE_RULE_VERSION === "2026-10-storelib-v3-free-5pct" && cfg.versionKey === CODE_FEE_RULE_VERSION)
check("rates read the way people read them", ratePercentLabel(0.05) === "5%" && ratePercentLabel(0.1125) === "11.25%" && ratePercentLabel(0.0925) === "9.25%" && ratePercentLabel(0.03) === "3%")

console.log("\nFree plan, USD")
const free: [number, number][] = [[100, 11], [299, 34], [399, 45], [400, 45], [900, 70], [1000, 75], [5000, 275], [10000, 525]]
for (const [gross, fee] of free) check(`$${(gross / 100).toFixed(2)} pays ${fee}c`, usd(gross, "free") === fee, usd(gross, "free"))
const at4 = calculateStorelibFeeWithConfig({ grossMinor: 400, currency: "USD", sellerPlan: "free" }, cfg)
check("$4.00 is the standard tier with the 25c", at4.pricingTier === "standard" && at4.fixedFeeMinor === 25 && at4.percentageRate === 0.05)
const at399 = calculateStorelibFeeWithConfig({ grossMinor: 399, currency: "USD", sellerPlan: "free" }, cfg)
check("$3.99 is the small-order tier with no fixed part", at399.pricingTier === "micro" && at399.fixedFeeMinor === 0 && at399.percentageRate === 0.1125)

console.log("\nPro, USD, unchanged")
const pro: [number, number][] = [[100, 9], [399, 37], [400, 37], [900, 52], [1000, 55], [5000, 175]]
for (const [gross, fee] of pro) check(`$${(gross / 100).toFixed(2)} pays ${fee}c`, usd(gross, "paid") === fee, usd(gross, "paid"))

console.log("\nThe fee never drops as a price goes up, in any currency")
for (const rule of Object.values(CURRENCY_FEE_RULES)) {
  for (const plan of ["free", "paid"] as const) {
    let ok = true
    let at = 0
    const top = rule.microThresholdMinor * 3
    for (let g = 1; g <= top; g += Math.max(1, Math.floor(rule.microThresholdMinor / 400))) {
      const a = calculateStorelibFeeWithConfig({ grossMinor: g, currency: rule.currency, sellerPlan: plan }, cfg).totalStorelibFeeMinor
      const b = calculateStorelibFeeWithConfig({ grossMinor: g + 1, currency: rule.currency, sellerPlan: plan }, cfg).totalStorelibFeeMinor
      if (b < a) { ok = false; at = g; break }
    }
    check(`${rule.currency} ${plan}`, ok, ok ? undefined : { at })
  }
}

console.log("\nEvery caller reads the same rule")
check("computeApplicationFee", computeApplicationFee({ unitAmount: 1000, sellerPlan: "free", currency: "USD" }) === 75 && computeApplicationFee({ unitAmount: 1000, sellerPlan: "pro", currency: "USD" }) === 55)
check("an old Growth plan id is charged as Pro", computeApplicationFee({ unitAmount: 1000, sellerPlan: "growth", currency: "USD" }) === 55)
check("calculateFeeWithPlan ignores a stale fee_percent on the plan row", calculateFeeWithPlan(1000, { id: "free", name: "Free", fee_percent: 0.06, fee_fixed_cents: 30 }, "USD").platformFeeCents === 75)
check("an unknown plan is Free", calculateFeeWithPlan(1000, { id: "enterprise", name: "?", fee_percent: 0, fee_fixed_cents: 0 }, "USD").platformFeeCents === 75)
check("the preview matches", getFeePreview(100, "free", "USD").platformFeeCents === 11 && getFeePreview(1000, "free", "USD").platformFeeCents === 75)
/* Changed on purpose: a plan card says the rate and the $0.25 only; the under $4 rule lives in the help article and the terms. */
check("the plan description says 5% and 3%, with no under $4 tier", getFeeDescription("free") === "5% + $0.25 per sale" && getFeeDescription("pro") === "3% + $0.25 per sale")
check("checkout keeps the fee and rule it charged on the order", /fee_percent: String\(fee\.feePercent\)/.test(read("app/api/checkout/stripe-session/route.ts")) && /fee_percent: String\(fee\.feePercent\)/.test(read("app/api/checkout/cart/route.ts")))

console.log("\nThe database says the same")
const part80 = read("supabase/sql/run-now/80_free_plan_fee_5pct.sql")
check("part 80 writes this version", part80.includes(`'${CODE_FEE_RULE_VERSION}'`))
check("part 80 sets the two Free rates and nothing else", /'freeStandardRate', 0\.05, 'freeMicroRate', 0\.1125\)/.test(part80) && !/'paidStandardRate', /.test(part80.split("\n")[1].replace(/'\{[^']*\}'::jsonb/, "")))
check("part 80 retires the old version before making this one active", part80.indexOf("SET status = 'retired' WHERE status = 'active'") > 0 && part80.indexOf("SET status = 'retired'") < part80.indexOf("INSERT INTO public.storelib_fee_rule_versions"))
check("part 80 never writes over a version once it exists", /IF EXISTS \(SELECT 1 FROM public\.storelib_fee_rule_versions WHERE version_key = '2026-10-storelib-v3-free-5pct'\) THEN .*RETURN; END IF;/.test(part80))
const embedded = /COALESCE\(v_old_cfg, '(\{.*?\})'::jsonb\)/.exec(part80)?.[1]
check("the defaults part 80 falls back on are the code's", !!embedded && JSON.stringify(JSON.parse(embedded)) === JSON.stringify(cfg))
check("its migration mirror is the same file", read("supabase/migrations/20261024_free_plan_fee_5pct.sql") === part80)
check("the check after confirms the active rates", /as p80_free_plan_fee_5pct/.test(read("supabase/sql/run-now/99_check_after.sql")))

console.log("\nNo copy still says 6%")
const copy = [
  "lib/billing/overview.ts", "app/(storelib)/app/settings/billing/upgrade/page.tsx", "app/api/billing/subscription/route.ts", "lib/billing/fee-calculator.ts",
  "lib/help/articles.ts", "lib/home/announcements.ts", "components/marketing/pricing-section.tsx", "components/marketing/faq-page-client.tsx",
  "app/(storelib)/(marketing)/blog/[slug]/page.tsx", /* r40: the terms text */ "components/legal/terms-body.tsx", "lib/billing/plans.ts",
  "lib/i18n/dict/settings.ts", "lib/i18n/dict/dashboard.ts", "lib/i18n/dict/de.ts", "lib/i18n/dict/es.ts", "lib/i18n/dict/fr.ts",
  /* Round 12: the Romanian halves moved to their own files. */
  "lib/i18n/dict/ro/settings.ts", "lib/i18n/dict/ro/dashboard.ts",
]
for (const f of copy) {
  const s = read(f)
  const bad = s.match(/(?<![\d.])6 ?%|12\.25 ?%|fee_percent: 0\.06|\$3\.00 or more|orders \$3\+/g)
  check(f, !bad, bad ?? undefined)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
