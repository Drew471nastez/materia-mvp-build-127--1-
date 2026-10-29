/**
 * ===========================================================================
 *  WHAT THE COMPARISON PAGES SAY ABOUT STORELIB, READ FROM THE CODE
 * ===========================================================================
 * Every number a comparison page prints about Storelib comes from here, and
 * everything here comes from the tables checkout and billing use: the fee
 * rules (lib/payments/fees), the plan price (lib/billing/plans), the site
 * limits (lib/sites/plan) and storage (lib/storage/plans). Change a fee and
 * every comparison page, its calculator and its FAQ change with it.
 *
 * Pure and client safe, so the calculator can import it.
 */
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { FREE_MICRO_RATE, FREE_STANDARD_RATE, PAID_MICRO_RATE, PAID_STANDARD_RATE, ratePercentLabel } from "@/lib/payments/fees/config"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"
import { PRO_PRICE_CENTS, PRO_CHECKOUT_PLAN_ID, formatPlanPrice } from "@/lib/billing/plans"
import { siteLimits } from "@/lib/sites/plan"
import { PLAN_LIMITS, formatBytes } from "@/lib/storage/plans"
import type { Rate, Source } from "./types"
import { CHECKED_ON } from "./checked"

export type StorelibPlanId = "free" | typeof PRO_CHECKOUT_PLAN_ID

const usd = CURRENCY_FEE_RULES.USD
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** The words every page uses for Storelib's plans and fees. */
export const STORELIB = {
  proPrice: formatPlanPrice(PRO_PRICE_CENTS),
  proPriceCents: PRO_PRICE_CENTS,
  freeRate: ratePercentLabel(FREE_STANDARD_RATE),
  proRate: ratePercentLabel(PAID_STANDARD_RATE),
  freeSmallRate: ratePercentLabel(FREE_MICRO_RATE),
  proSmallRate: ratePercentLabel(PAID_MICRO_RATE),
  fixed: dollars(usd.fixedFeeMinor),
  smallOrderBelow: dollars(usd.microThresholdMinor),
  /** "5% + $0.25" */
  freeFee: `${ratePercentLabel(FREE_STANDARD_RATE)} + ${dollars(usd.fixedFeeMinor)}`,
  proFee: `${ratePercentLabel(PAID_STANDARD_RATE)} + ${dollars(usd.fixedFeeMinor)}`,
  freeSites: siteLimits("free").maxSites,
  proSites: siteLimits(PRO_CHECKOUT_PLAN_ID).maxSites,
  freeStorage: formatBytes(PLAN_LIMITS.free.storageQuotaBytes),
  proStorage: formatBytes(PLAN_LIMITS[PRO_CHECKOUT_PLAN_ID].storageQuotaBytes),
  proCustomDomain: siteLimits(PRO_CHECKOUT_PLAN_ID).customDomain,
  freeCustomDomain: siteLimits("free").customDomain,
} as const

/**
 * The monthly sales at which Pro's lower rate pays for its price, rounded up
 * to the next $10, the same sum the pricing page's FAQ does (lib/billing/plans planQuestions).
 */
export function proBreakEvenDollars(): number {
  const saved = FREE_STANDARD_RATE - PAID_STANDARD_RATE
  return saved > 0 ? Math.ceil(PRO_PRICE_CENTS / 100 / saved / 10) * 10 : 0
}

/** Storelib's fee on one sale of `priceCents` in US dollars, exactly as checkout charges it. */
export function storelibFeeCents(priceCents: number, plan: StorelibPlanId): number {
  return calculateStorelibFee({ grossMinor: priceCents, currency: "USD", sellerPlan: plan === "free" ? "free" : "paid" }).totalStorelibFeeMinor
}

/**
 * Stripe's card processing, which applies on every Storelib plan
 * (lib/billing/plans PLAN_FOOTNOTE). Storelib does not set it; this is
 * Stripe's published standard rate for a domestic card in the US, sourced
 * like any competitor fact.
 */
export const STRIPE_US_RATE: Rate = { percent: 2.9, fixedCents: 30 }

export const STRIPE_PRICING_SOURCE: Source = {
  id: "stripe-pricing",
  title: "Stripe pricing and fees",
  url: "https://stripe.com/pricing",
  publisher: "Stripe",
  checkedOn: CHECKED_ON,
}

/** Where a reader checks Storelib's own numbers. */
export const STORELIB_FEE_HELP_PATH = "/orders-and-payouts/fees"
