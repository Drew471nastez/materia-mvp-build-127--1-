import "server-only"

/**
 * ===========================================================================
 *  TAX ON A MEMBERSHIP (round AG): AUTOMATIC, NEVER INVENTED
 * ===========================================================================
 * A community's plan, or any membership, is sold through Storelib's Stripe
 * account (a subscription with the creator's share transferred to them,
 * lib/memberships/billing.ts). Its tax comes from exactly one of:
 *
 *   stripe_tax   Stripe Tax, when Storelib has turned it on for its account
 *                (STRIPE_TAX=on, with registrations made in Stripe's Tax
 *                settings). Stripe works out the rate from the buyer's
 *                location (their IP address, so no form) and the product's
 *                tax code, and charges it on every invoice. The platform's
 *                Stripe account is the one the tax is calculated for.
 *   creator      otherwise, the creator's own rates (Settings › Taxes,
 *                lib/tax/rules.ts), when they tax digital sales and the
 *                buyer's country is one of their regions. The rate is put on
 *                the subscription as a Stripe tax rate, so every renewal
 *                charges it the same way. The creator is responsible for
 *                those rates and for paying the tax on.
 *   none         no tax: a creator who has not set any, and Stripe Tax off.
 *
 * The quote shown in the checkout is the same calculation the subscription
 * is made with. Nothing here files or pays tax to any government; Storelib
 * never says it does.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { loadTaxForCheckout } from "./server"
import { digitalTax, taxLabel } from "./rules"
import { invoiceTaxFacts } from "./invoice-tax"

type Db = any

export type TaxSource = "stripe_tax" | "creator" | "none"

export interface MembershipTaxQuote {
  taxCents: number
  included: boolean
  /** "VAT", "VAT 19%", "Sales tax": what the checkout and the invoice call it. */
  label: string
  source: Exclude<TaxSource, "none">
  rateBps?: number
}

/** Stripe's code for electronically supplied services: a membership's content and community. */
export const MEMBERSHIP_TAX_CODE = process.env.STRIPE_MEMBERSHIP_TAX_CODE || "txcd_10000000"

export function stripeTaxOn(): boolean {
  return (process.env.STRIPE_TAX || "").toLowerCase() === "on"
}

/** Whether Stripe Tax adds tax on top of a price or finds it inside, as Storelib's Stripe Tax settings say. */
function stripeTaxIncluded(): boolean {
  return (process.env.STRIPE_TAX_BEHAVIOR || "exclusive").toLowerCase() === "inclusive"
}

/** The buyer's country from the edge (Vercel's header), two letters, or null. */
export function buyerCountry(h: Headers): string | null {
  const c = (h.get("x-vercel-ip-country") || h.get("cf-ipcountry") || "").trim().toUpperCase()
  return /^[A-Z]{2}$/.test(c) && c !== "XX" ? c : null
}

/** The buyer's address on the internet, the first hop's, for Stripe Tax's location. Never stored by Storelib. */
export function buyerIp(h: Headers): string | null {
  const first = (h.get("x-forwarded-for") || h.get("x-real-ip") || "").split(",")[0]?.trim() || ""
  return /^[0-9a-f:.]{3,45}$/i.test(first) ? first : null
}

const TAX_TYPE_LABEL: Record<string, string> = { vat: "VAT", gst: "GST", hst: "HST", pst: "PST", qst: "QST", sales_tax: "Sales tax", jct: "JCT", rst: "RST", igst: "IGST", lease_tax: "Tax", amusement_tax: "Tax", communications_tax: "Tax" }

/** What the checkout shows, and what the subscription will charge, for one interval's price. Null: no tax. */
export async function membershipTaxQuote(
  db: Db,
  sale: { creatorId: string; productId: string; amountCents: number; currency: string; country: string | null; ip: string | null },
): Promise<MembershipTaxQuote | null> {
  if (sale.amountCents <= 0) return null
  if (stripeTaxOn()) {
    if (!sale.ip && !sale.country) return null
    try {
      const calc = await stripe.tax.calculations.create({
        currency: sale.currency.toLowerCase(),
        line_items: [{ amount: sale.amountCents, reference: sale.productId.slice(0, 200), tax_behavior: stripeTaxIncluded() ? "inclusive" : "exclusive", tax_code: MEMBERSHIP_TAX_CODE }],
        customer_details: sale.ip ? { ip_address: sale.ip } : { address: { country: sale.country! }, address_source: "billing" },
        expand: ["line_items"],
      })
      const tax = (calc.tax_amount_exclusive ?? 0) + (calc.tax_amount_inclusive ?? 0)
      if (tax <= 0) return null
      const type = calc.tax_breakdown?.find((b) => (b.amount ?? 0) > 0)?.tax_rate_details?.tax_type ?? ""
      return { taxCents: tax, included: stripeTaxIncluded(), label: TAX_TYPE_LABEL[type] ?? "Tax", source: "stripe_tax" }
    } catch {
      /* Not worked out: the subscription still charges what Stripe works out at payment, so the checkout says so. */
      return null
    }
  }
  const setup = await loadTaxForCheckout(db, sale.creatorId)
  if (!setup || !setup.digital || !sale.country) return null
  const t = digitalTax(setup, { taxableCents: sale.amountCents, tipCents: 0, productId: sale.productId, country: sale.country })
  if (t.taxCents <= 0) return null
  return { taxCents: t.taxCents, included: t.included, label: t.label, source: "creator", rateBps: t.rateBps }
}

/**
 * What the new subscription carries so Stripe charges that tax on every invoice: Stripe Tax switched on (the buyer's
 * location set on their customer first), or the creator's rate as a Stripe tax rate. Empty: no tax.
 */
export async function membershipTaxForSubscription(
  db: Db,
  sale: { creatorId: string; productId: string; amountCents: number; currency: string; country: string | null; ip: string | null; customerId: string },
): Promise<{ automaticTax?: true; taxRateIds?: string[]; source: TaxSource }> {
  if (stripeTaxOn()) {
    if (sale.ip) await stripe.customers.update(sale.customerId, { tax: { ip_address: sale.ip } })
    else if (sale.country) await stripe.customers.update(sale.customerId, { address: { country: sale.country } })
    else return { source: "none" }
    return { automaticTax: true, source: "stripe_tax" }
  }
  const quote = await membershipTaxQuote(db, { ...sale })
  if (!quote || !quote.rateBps || !sale.country) return { source: "none" }
  const rate = await stripe.taxRates.create(
    {
      display_name: quote.label.replace(/\s+\d+(\.\d+)?%$/, "").slice(0, 50) || "Tax",
      percentage: quote.rateBps / 100,
      inclusive: quote.included,
      country: sale.country,
      tax_type: /vat/i.test(quote.label) ? "vat" : undefined,
      metadata: { source: "storelib_creator_rate", creator_id: sale.creatorId },
    },
    { idempotencyKey: `storelib-tax-rate:${sale.creatorId}:${sale.country}:${quote.rateBps}:${quote.included ? "in" : "ex"}` },
  )
  return { taxRateIds: [rate.id], source: "creator" }
}

/**
 * A paid membership invoice's tax, for its order (lib/memberships/sync.ts):
 * the amount and whether it was inside the price from the invoice
 * (lib/tax/invoice-tax.ts), and the name, rate and country from the Stripe
 * tax rate behind it, else the buyer's billing country. Null: untaxed.
 */
export async function membershipOrderTax(invoice: Stripe.Invoice): Promise<{ taxCents: number; included: boolean; label: string; country: string | null } | null> {
  const facts = invoiceTaxFacts(invoice)
  if (!facts) return null
  let label = "Tax"
  let country: string | null = null
  if (facts.taxRateId) {
    try {
      const rate = await stripe.taxRates.retrieve(facts.taxRateId)
      label = taxLabel(rate.display_name || null, Math.round(Number(rate.percentage || 0) * 100))
      country = typeof rate.country === "string" && /^[A-Z]{2}$/i.test(rate.country) ? rate.country.toUpperCase() : null
    } catch {
      /* The amount is what matters; the name stays "Tax". */
    }
  }
  if (!country) {
    const billed = invoice.customer_address?.country
    country = typeof billed === "string" && /^[A-Z]{2}$/i.test(billed) ? billed.toUpperCase() : null
  }
  return { taxCents: facts.taxCents, included: facts.included, label, country }
}
