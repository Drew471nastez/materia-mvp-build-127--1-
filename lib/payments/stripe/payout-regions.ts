/**
 * ===========================================================================
 *  WHERE STORELIB CAN PAY A CREATOR OUT (STRIPE CROSS-BORDER PAYOUTS)
 * ===========================================================================
 * From https://docs.stripe.com/connect/cross-border-payouts (checked Oct 2026):
 *
 *   "Platforms based in the US, UK, EEA, Canada, or Switzerland can transfer
 *    funds to connected accounts in any of those regions."
 *   "You can't make cross-border payouts to connected accounts under a
 *    recipient service agreement."
 *   Supported flows include "Destination charges without on_behalf_of".
 *
 * So a creator in another country than the platform needs a FULL agreement
 * account with transfers only (no card_payments, so no on_behalf_of), and
 * both countries must be in that region. Pure, no Stripe call.
 */
export const CROSS_BORDER_REGION: ReadonlySet<string> = new Set([
  // United States, United Kingdom, Canada, Switzerland
  "US", "GB", "CA", "CH",
  // EEA: the 27 EU countries, Iceland, Liechtenstein, Norway
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
])

export type PayoutRoute = "domestic" | "cross-border" | "unsupported"

/** How Stripe can pay a creator in `country` from a platform in `platform`. */
export function payoutRoute(platform: string | null | undefined, country: string | null | undefined): PayoutRoute {
  const p = String(platform ?? "").trim().toUpperCase()
  const c = String(country ?? "").trim().toUpperCase()
  if (!p || !c || p === c) return "domestic"
  return CROSS_BORDER_REGION.has(p) && CROSS_BORDER_REGION.has(c) ? "cross-border" : "unsupported"
}

/** Can Stripe pay this account out from this platform at all. */
export function payoutSupported(a: { country?: string | null; agreement?: string | null }, platform: string | null | undefined): { ok: boolean; reason: string | null } {
  const route = payoutRoute(platform, a.country)
  if (route === "unsupported") return { ok: false, reason: `Stripe has no self-serve payouts from ${String(platform).toUpperCase()} to ${String(a.country).toUpperCase()}` }
  if (route === "cross-border" && a.agreement === "recipient") return { ok: false, reason: "recipient service agreement: Stripe does not make cross-border payouts to it" }
  return { ok: true, reason: null }
}

/**
 * The sentence for a country Stripe cannot pay out to from this platform,
 * shared by the server (connect.ts) and setup's country step, so the seller
 * reads it before anything is opened and the same words if it is pressed anyway.
 */
export function cannotPayOutLine(countryName: string): string {
  return `Stripe can't send payouts from Storelib to a bank in ${countryName} yet. If you also have a bank account in the US, the UK, Canada, Switzerland or a European Economic Area country, choose that country. Otherwise write to support@storelib.com and we will tell you when ${countryName} opens.`
}
