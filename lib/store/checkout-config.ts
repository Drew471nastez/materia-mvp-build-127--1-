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
  /** "first_and_last" asks for both; "last_only" takes one full name. */
  nameFields: "first_and_last" | "last_only"
  company: FieldRule
  phone: FieldRule
  /** Apartment, suite, unit: physical orders only. */
  address2: FieldRule
}

export const DEFAULT_CHECKOUT: CheckoutConfig = {
  abandonedRecovery: true,
  requireAccount: false,
  requireConfirmedEmail: false,
  marketingOptIn: true,
  nameFields: "last_only",
  company: "off",
  phone: "optional",
  address2: "optional",
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
    nameFields: o.nameFields === "first_and_last" ? "first_and_last" : "last_only",
    company: rule(o.company, DEFAULT_CHECKOUT.company),
    phone: rule(o.phone, DEFAULT_CHECKOUT.phone),
    address2: rule(o.address2, DEFAULT_CHECKOUT.address2),
  }
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
