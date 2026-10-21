/**
 * ===========================================================================
 *  HOW CHECKOUT BEHAVES: ONE SMALL OBJECT A STORE KEEPS
 * ===========================================================================
 * Settings › Checkout writes it (components/app/settings/checkout-panel.tsx);
 * both checkouts read it, the digital one (app/checkout) and the physical
 * one (app/checkout/physical), through `checkoutConfig` below, so a field a
 * store turns off is gone from every checkout at once and a field it makes
 * required is required in both. Kept in `store_settings.checkout` (SQL part
 * 109). Pure: the panel, the checkouts, the server and the tests share it.
 *
 * Every value has a default that is what checkout did before this existed,
 * so a store that never opens the section, or a database without part 109,
 * sees no change at all.
 */

export type FieldRule = "off" | "optional" | "required"

export interface CheckoutConfig {
  /** Started checkouts get the reminder email with a link back to the cart. */
  abandonedRecovery: boolean
  /** A buyer signs in or creates an account before paying. */
  requireAccount: boolean
  /** That account's email is confirmed before an order goes through. Implies requireAccount. */
  requireConfirmedEmail: boolean
  /** The "Email me with news and offers" box, never ticked for them. */
  marketingOptIn: boolean
  /**
   * "Buying for a business" at checkout: the company name, tax number and
   * address on the invoice. On for a store that never chose, which is how
   * checkout already behaved.
   */
  businessInvoices: boolean
  /** "first_and_last" asks for both; "last_only" takes one full name. */
  nameFields: "first_and_last" | "last_only"
  company: FieldRule
  phone: FieldRule
  /** Apartment, suite, unit: physical orders only. */
  address2: FieldRule
  /**
   * Cancel order on the buyer's order page while nothing has shipped or been started: it asks the shop, which
   * cancels and refunds from the order or keeps it (lib/physical/buyer-cancel.ts). Physical orders only.
   */
  buyerCancel: boolean
  /**
   * Cash on delivery beside card: the buyer pays in cash when a physical
   * order is delivered or picked up (lib/physical/cash-on-delivery.ts).
   * Off until the seller turns it on. Physical carts only.
   */
  cashOnDelivery: boolean
  /**
   * Where cash on delivery is offered: the countries an order is delivered to
   * (ISO codes). Empty: everywhere the store ships. A pickup is paid where it
   * is picked up, so it is never held to this list.
   */
  codCountries: string[]
  /** A fee for paying on delivery, in the store's currency's hundredths: added to the order, shown at checkout before the order is placed. 0: none. */
  codFeeCents: number
  /** What the buyer reads under Cash on delivery at checkout and in the order email ("Have the exact amount ready"). "" for none. */
  codInstructions: string
}

/** The largest cash on delivery fee, in hundredths: a fee, not a second price. */
export const COD_FEE_MAX_CENTS = 100_000
export const COD_INSTRUCTIONS_MAX = 280

export const DEFAULT_CHECKOUT: CheckoutConfig = {
  abandonedRecovery: true,
  requireAccount: false,
  requireConfirmedEmail: false,
  marketingOptIn: true,
  businessInvoices: true,
  nameFields: "last_only",
  company: "off",
  phone: "optional",
  address2: "optional",
  buyerCancel: true,
  cashOnDelivery: false,
  codCountries: [],
  codFeeCents: 0,
  codInstructions: "",
}

const RULES: FieldRule[] = ["off", "optional", "required"]
const rule = (v: unknown, fallback: FieldRule): FieldRule => (RULES.includes(v as FieldRule) ? (v as FieldRule) : fallback)
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback)

/** Whatever is stored, read as a whole config: unknown keys dropped, missing ones defaulted. */
export function checkoutConfig(raw: unknown): CheckoutConfig {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const requireConfirmedEmail = bool(o.requireConfirmedEmail, DEFAULT_CHECKOUT.requireConfirmedEmail)
  return {
    abandonedRecovery: bool(o.abandonedRecovery, DEFAULT_CHECKOUT.abandonedRecovery),
    /* A confirmed email needs an account to be confirmed on. */
    requireAccount: requireConfirmedEmail || bool(o.requireAccount, DEFAULT_CHECKOUT.requireAccount),
    requireConfirmedEmail,
    marketingOptIn: bool(o.marketingOptIn, DEFAULT_CHECKOUT.marketingOptIn),
    businessInvoices: bool(o.businessInvoices, DEFAULT_CHECKOUT.businessInvoices),
    nameFields: o.nameFields === "first_and_last" ? "first_and_last" : "last_only",
    company: rule(o.company, DEFAULT_CHECKOUT.company),
    phone: rule(o.phone, DEFAULT_CHECKOUT.phone),
    address2: rule(o.address2, DEFAULT_CHECKOUT.address2),
    buyerCancel: bool(o.buyerCancel, DEFAULT_CHECKOUT.buyerCancel),
    cashOnDelivery: bool(o.cashOnDelivery, DEFAULT_CHECKOUT.cashOnDelivery),
    codCountries: countries(o.codCountries),
    codFeeCents: cents(o.codFeeCents, COD_FEE_MAX_CENTS),
    codInstructions: typeof o.codInstructions === "string" ? o.codInstructions.replace(/\s+/g, " ").trim().slice(0, COD_INSTRUCTIONS_MAX) : "",
  }
}

/** Two letter codes, upper case, once each, at most 250. Anything else is dropped. */
function countries(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out = new Set<string>()
  for (const c of v) if (typeof c === "string" && /^[A-Za-z]{2}$/.test(c.trim())) out.add(c.trim().toUpperCase())
  return [...out].slice(0, 250)
}

/** Whole hundredths from 0 to max; anything else is 0. */
function cents(v: unknown, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) && n > 0 ? Math.min(max, Math.round(n)) : 0
}

/** A change from the panel, merged into what is kept. */
export function mergeCheckout(current: unknown, patch: unknown): CheckoutConfig {
  const base = checkoutConfig(current)
  const p = patch && typeof patch === "object" && !Array.isArray(patch) ? (patch as Record<string, unknown>) : {}
  return checkoutConfig({ ...base, ...p })
}

/** Is what a buyer typed enough for this field? */
export function fieldSatisfied(rule: FieldRule, value: string | null | undefined): boolean {
  return rule !== "required" || !!(value && value.trim())
}
