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

/*
 * ===========================================================================
 *  EVERY OTHER COUNTRY (Nov 24 2026, round 25)
 * ===========================================================================
 * The owner: "payments setup should work for sellers anywhere in the world,
 * like Shopify, Gumroad, Etsy". What Stripe's docs say (checked Nov 2026):
 *
 *   docs.stripe.com/connect/destination-charges: "With certain exceptions,
 *   if your platform and a connected account aren't in the same region, you
 *   must specify the connected account as the settlement merchant using the
 *   on_behalf_of parameter." on_behalf_of "is supported only for connected
 *   accounts with a payments capability such as card_payments. Accounts
 *   under the recipient service agreement can't request card_payments."
 *
 *   docs.stripe.com/connect/cross-border-payouts: "Stripe doesn't support
 *   self-serve cross-border payouts to countries outside the listed
 *   regions", and "You can't make cross-border payouts to connected accounts
 *   under a recipient service agreement. For those accounts, use Global
 *   Payouts" (senders in the US and the UK only; EEA in private preview).
 *
 * So from Storelib's Romanian platform there are three working paths and
 * the recipient agreement is none of them:
 *
 *   domestic       Romania: a full account, cards and transfers.
 *   cross-border   the rest of the region above: a full agreement account,
 *                  transfers only (cards and transfers until Stripe approves
 *                  transfers only), sales without on_behalf_of.
 *   settlement     a country Stripe operates in outside the region
 *                  (Australia, Japan, Singapore...): a full agreement
 *                  account WITH card_payments, and every sale made
 *                  on_behalf_of it, so it settles in the seller's country.
 *                  Only for the countries the owner has turned on in the
 *                  Stripe Dashboard and listed in STRIPE_SETTLEMENT_COUNTRIES
 *                  (docs/stripe-connect-checklist.md): before that Stripe
 *                  refuses the account, so setup says so before Continue.
 *
 * Everything else is said plainly before anything is opened, with what the
 * seller can do instead: choose a country where they also have a bank, or
 * ask to be told when theirs opens (a request Storelib reads in /admin,
 * Integrations). Pure and free of server code: the country step in the
 * browser and the server decide from the same function.
 */

/** Where Stripe opens accounts (stripe.com/global, Nov 2026). India and Indonesia are invite only. */
export const STRIPE_ACCOUNT_COUNTRIES: ReadonlySet<string> = new Set([
  "AU", "AT", "BE", "BR", "BG", "CA", "CI", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GH", "GI", "GR", "HK", "HU",
  "IE", "IT", "JP", "KE", "LV", "LI", "LT", "LU", "MY", "MT", "MX", "NL", "NZ", "NG", "NO", "PL", "PT", "RO", "SG", "SK",
  "SI", "ZA", "ES", "SE", "CH", "TH", "AE", "GB", "US", "IN", "ID",
])

/**
 * Outside the region, where a platform abroad can open a full account and
 * charge on its behalf without a separate review from Stripe. The value to
 * put in STRIPE_SETTLEMENT_COUNTRIES once they are on in the Dashboard.
 */
export const SETTLEMENT_COUNTRIES: readonly string[] = ["AU", "NZ", "JP", "HK", "SG", "AE", "GI"]

/*
 * Stripe operates there, but a platform in another country cannot take its
 * fee on, or charge on behalf of, an account there without Stripe's own
 * approval: Brazil and Mexico need a review, India and Indonesia are invite
 * only, and the others are new to Stripe with Connect limits that differ by
 * account. Listing one in STRIPE_SETTLEMENT_COUNTRIES after Stripe approves
 * it opens it like any other.
 */
const NEEDS_STRIPE_REVIEW: ReadonlySet<string> = new Set(["BR", "MX", "IN", "ID", "MY", "TH", "CI", "GH", "KE", "NG", "ZA"])

/*
 * Stripe pays banks here only through Global Payouts (or, before it, the
 * cross-border payouts to recipients that US platforms had): no account can
 * be opened there, and Storelib's platform is not in Global Payouts. Kept
 * apart so the log says which, and the checklist can say what would open it.
 */
const GLOBAL_PAYOUTS_ONLY: ReadonlySet<string> = new Set([
  "AR", "BO", "CL", "CO", "CR", "DO", "EC", "GT", "PA", "PE", "PY", "SV", "UY", "JM", "TT",
  "PH", "VN", "KR", "TW", "IL", "TR", "EG", "MA", "SA", "QA", "BH", "KW", "OM", "JO", "LK", "BD", "PK", "KZ", "RS", "AL", "MK", "BA", "MD", "GE", "AM", "AZ", "MN", "TZ", "RW", "BW", "NA", "MU", "SN", "ET",
])

/** The currency Stripe pays a bank in this country in by default. Bulgaria joined the euro on 1 January 2026. */
export const PAYOUT_CURRENCY: Readonly<Record<string, string>> = {
  US: "USD", GB: "GBP", CA: "CAD", CH: "CHF", RO: "RON", PL: "PLN", CZ: "CZK", HU: "HUF", DK: "DKK", SE: "SEK", NO: "NOK", IS: "ISK", LI: "CHF",
  AT: "EUR", BE: "EUR", BG: "EUR", HR: "EUR", CY: "EUR", EE: "EUR", FI: "EUR", FR: "EUR", DE: "EUR", GR: "EUR", IE: "EUR", IT: "EUR", LV: "EUR",
  LT: "EUR", LU: "EUR", MT: "EUR", NL: "EUR", PT: "EUR", SK: "EUR", SI: "EUR", ES: "EUR",
  AU: "AUD", NZ: "NZD", JP: "JPY", HK: "HKD", SG: "SGD", AE: "AED", GI: "GBP", BR: "BRL", MX: "MXN", IN: "INR", ID: "IDR", MY: "MYR", TH: "THB",
  CI: "XOF", GH: "GHS", KE: "KES", NG: "NGN", ZA: "ZAR",
}

export type PayoutRoute = "domestic" | "cross-border" | "settlement" | "unsupported"

const code = (v: string | null | undefined) => String(v ?? "").trim().toUpperCase()

/** STRIPE_SETTLEMENT_COUNTRIES, read: the ISO codes the owner opened. Anything that is not a Stripe country is dropped. */
export function settlementCountriesFrom(raw: string | null | undefined): string[] {
  return [...new Set(String(raw ?? "").toUpperCase().split(/[^A-Z]+/).filter((c) => c.length === 2 && STRIPE_ACCOUNT_COUNTRIES.has(c)))]
}

/**
 * How Stripe can pay a creator in `country` from a platform in `platform`.
 * `settlement` is the list the owner opened (STRIPE_SETTLEMENT_COUNTRIES);
 * without it a country outside the region is unsupported, as before.
 */
export function payoutRoute(platform: string | null | undefined, country: string | null | undefined, settlement?: Iterable<string> | null): PayoutRoute {
  const p = code(platform)
  const c = code(country)
  if (!p || !c || p === c) return "domestic"
  if (CROSS_BORDER_REGION.has(p) && CROSS_BORDER_REGION.has(c)) return "cross-border"
  if (settlement && STRIPE_ACCOUNT_COUNTRIES.has(c) && new Set([...settlement].map(code)).has(c)) return "settlement"
  return "unsupported"
}

/** Why a country cannot be paid out yet. Null when it can. */
export type PayoutBlocker = "not_opened" | "needs_stripe_review" | "global_payouts_only" | "no_stripe"

export interface PayoutPlan {
  country: string
  route: PayoutRoute
  /** The currency payouts arrive in by default, or null when Stripe does not say. */
  currency: string | null
  /** Always the full agreement when an account is opened: never the recipient one (see above). */
  agreement: "full" | null
  /** Sales for this seller are made on_behalf_of their account (the settlement path). */
  onBehalfOf: boolean
  blocker: PayoutBlocker | null
}

/** Everything setup needs to know about one country, before anything is opened. */
export function payoutPlan(platform: string | null | undefined, country: string, settlement?: Iterable<string> | null): PayoutPlan {
  const c = code(country)
  const route = payoutRoute(platform, c, settlement)
  const currency = PAYOUT_CURRENCY[c] ?? null
  if (route !== "unsupported") return { country: c, route, currency, agreement: "full", onBehalfOf: route === "settlement", blocker: null }
  const blocker: PayoutBlocker = NEEDS_STRIPE_REVIEW.has(c)
    ? "needs_stripe_review"
    : STRIPE_ACCOUNT_COUNTRIES.has(c)
      ? "not_opened"
      : GLOBAL_PAYOUTS_ONLY.has(c)
        ? "global_payouts_only"
        : "no_stripe"
  return { country: c, route, currency, agreement: null, onBehalfOf: false, blocker }
}

/** A sale for an account in this country must be made on its behalf, or Stripe cannot move the money there. */
export function settlesInSellerCountry(platform: string | null | undefined, country: string | null | undefined, settlement: Iterable<string> | null | undefined): boolean {
  return payoutRoute(platform, country, settlement) === "settlement"
}

/** Can Stripe pay this account out from this platform at all. */
export function payoutSupported(a: { country?: string | null; agreement?: string | null }, platform: string | null | undefined, settlement?: Iterable<string> | null): { ok: boolean; reason: string | null } {
  const route = payoutRoute(platform, a.country, settlement)
  if (route === "unsupported") return { ok: false, reason: `Stripe has no self-serve payouts from ${String(platform).toUpperCase()} to ${String(a.country).toUpperCase()}` }
  if (route !== "domestic" && a.agreement === "recipient") return { ok: false, reason: "recipient service agreement: Stripe does not make cross-border payouts to it" }
  return { ok: true, reason: null }
}

const OTHER_BANK = "If you also have a bank account in the US, the UK, Canada, Switzerland or a European Economic Area country, choose that country."

/**
 * The sentence for a country Stripe cannot pay out to from this platform,
 * shared by the server (connect.ts) and setup's country step, so the seller
 * reads it before anything is opened and the same words if it is pressed anyway.
 */
export function cannotPayOutLine(countryName: string, blocker: PayoutBlocker = "no_stripe"): string {
  const first =
    blocker === "not_opened"
      ? `Stripe works in ${countryName}, but payouts to banks there aren't open on Storelib yet.`
      : blocker === "needs_stripe_review"
        ? `Payouts to banks in ${countryName} need an approval from Stripe that Storelib doesn't have yet.`
        : blocker === "global_payouts_only"
          ? `Stripe can't send payouts from Storelib to a bank in ${countryName} yet. It pays banks there only through a service Storelib isn't on.`
          : `Stripe can't send payouts from Storelib to a bank in ${countryName} yet.`
  return `${first} ${OTHER_BANK} Otherwise ask to be told when ${countryName} opens, or write to support@storelib.com.`
}

/** What the country step says under the field for a country that works: where the money lands, and in what. */
export function payoutPlanLine(plan: PayoutPlan, countryName: string): string | null {
  if (plan.route === "unsupported") return null
  const money = plan.currency ? `Payouts arrive in ${plan.currency} at a bank in ${countryName}.` : `Payouts go to a bank in ${countryName}.`
  const own = plan.onBehalfOf ? " Sales are made in your name, so buyers see your store on their card statement." : ""
  return `${money}${own} It can't be changed once setup is sent.`
}
