/**
 * ===========================================================================
 *  WHOSE COUNTRY A CONNECTED ACCOUNT IS IN
 * ===========================================================================
 * Nov 23 2026, the owner: "why does it say all the time 'are you a citizen of
 * Romania'?". Stripe's form asks about citizenship of the ACCOUNT's country,
 * and Stripe never changes an account's country once it is made.
 *
 * Until commit 18e9d17ce setup never asked the country. A seller with no
 * country on their profile got an account in the platform's own country,
 * Romania (the old resolveCountryForStart fell back to platformCountry()).
 * The country picker fixed new sellers only: every account opened before it
 * stayed on the seller's row, setup skipped the country step for any seller
 * who already had an account (payments-setup-flow SetupEmbed `existed`), and
 * the server's wrong-country swap only ran when a country was sent, which
 * that path never did. So those sellers met the Romanian form on every open.
 *
 * Now an account records that the seller chose its country (metadata
 * `storelib_country_chosen`). An account nobody has sent anything on, without
 * that mark, opens no Stripe form until the seller has said where their bank
 * is; choosing another country replaces it, choosing the same one marks it.
 * Pure, so tests/stripe-connect-onboarding.test.ts pins it.
 */
import type Stripe from "stripe"

/** Set on every account opened from the seller's own choice of country. */
export const COUNTRY_CHOSEN_KEY = "storelib_country_chosen"

type AccountLike = Pick<Stripe.Account, "country" | "details_submitted" | "charges_enabled" | "payouts_enabled"> & {
  metadata?: Stripe.Metadata | null
}

/** Nothing has been sent on it and it cannot take or pay out money: replacing it loses nothing. */
export function accountUntouched(account: Pick<AccountLike, "details_submitted" | "charges_enabled" | "payouts_enabled"> | null | undefined): boolean {
  return !!account && !account.details_submitted && !account.charges_enabled && !account.payouts_enabled
}

/** The seller picked this account's country themselves. */
export function countryChosen(account: Pick<AccountLike, "metadata"> | null | undefined): boolean {
  return account?.metadata?.[COUNTRY_CHOSEN_KEY] === "1"
}

/**
 * Stripe's form must not open on this account until the seller has said
 * where their bank is: it is untouched and nobody chose its country (an
 * account from before the country picker, most of them in Romania).
 */
export function countryNeedsChoice(account: AccountLike | null | undefined): boolean {
  return accountUntouched(account) && !countryChosen(account)
}

/** What setup's country step needs to know about the account already there. */
export interface SetupCountry {
  /** The account's country (ISO), or null when there is no account. */
  country: string | null
  /** The country can still be changed: there is an account and nothing was sent on it. */
  changeable: boolean
  /** The seller chose it. Null when only the cached row was read. */
  chosen: boolean | null
}

export function setupCountryOf(account: AccountLike | null | undefined): SetupCountry {
  if (!account) return { country: null, changeable: false, chosen: null }
  return { country: account.country ? account.country.toUpperCase() : null, changeable: accountUntouched(account), chosen: countryChosen(account) }
}
