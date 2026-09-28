/**
 * ===========================================================================
 *  WHAT OF A CREATOR OR A PROFILE ANYBODY MAY SEE
 * ===========================================================================
 * `creators` and `profiles` are read by visitors: a storefront needs the
 * creator's name, photo, bio and links. They also hold what nobody else may
 * see: the account's email and home address, its role and spam flags, and
 * the creator's Stripe ids, plan, payout settings and ban reason.
 *
 * Run-now part 63 lets the public key read only the columns NOT named below
 * (public.storelib_private_columns holds the same two lists, and
 * tests/private-columns.test.ts keeps them equal). So:
 *
 *   A visitor's or a signed in person's client (createClient,
 *   createPublicReadClient, the browser) names public columns only. `*` is
 *   refused by the database now, because it includes the private ones.
 *
 *   A person's OWN private columns (their plan, their Stripe customer, their
 *   email) are read on the server with the service role, filtered by the
 *   signed in user's id.
 *
 *   A row the server reads with the service role and hands to a page goes
 *   through publicCreator / publicProfile first, so a private column never
 *   reaches a browser that is not its owner's.
 */

export const PRIVATE_CREATOR_COLUMNS = [
  "stripe_account_id",
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_connected_at",
  "stripe_onboarding_status",
  "details_submitted",
  "subscription_plan_id",
  "subscription_status",
  "pending_plan_id",
  "paypal_merchant_id",
  "payout_currency",
  "payout_schedule",
  "payout_threshold",
  "instant_payouts_enabled",
  "banned_reason",
  "statement_descriptor",
  "first_sale_email_sent",
  "stripe_requirements",
  "stripe_requirements_due_at",
  "stripe_requirements_updated_at",
] as const

export const PRIVATE_PROFILE_COLUMNS = [
  "email",
  "role",
  "spam_state",
  "spam_score",
  "personalized_recommendations",
  "timezone",
  "push_messages_enabled",
  "push_preview_enabled",
  "first_name",
  "last_name",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "postal_code",
  "country",
  "phone",
  "date_of_birth",
  "tax_id",
] as const

/** The creator fields a card, a library row or a storefront header shows. Every one of them exists in every database. */
export const CREATOR_CARD = "id, user_id, slug, username, display_name, avatar_url, bio, headline, niche_tags"
/** The profile fields a card shows. */
export const PROFILE_CARD = "id, username, display_name, avatar_url"
/** A creator with their profile, embedded in another table's select. */
export const CREATOR_WITH_PROFILE = `${CREATOR_CARD}, profile:profiles!creators_user_id_fkey(${PROFILE_CARD})` as const

function without<T>(row: T, keys: readonly string[]): T {
  if (!row || typeof row !== "object") return row
  const copy = { ...(row as Record<string, unknown>) }
  for (const k of keys) delete copy[k]
  return copy as T
}

/** A creator row read with the service role, minus what only its owner and the server may see. */
export function publicCreator<T>(row: T): T {
  return without(row, PRIVATE_CREATOR_COLUMNS)
}

/** A profile row read with the service role, minus what only its owner and the server may see. */
export function publicProfile<T>(row: T): T {
  return without(row, PRIVATE_PROFILE_COLUMNS)
}
