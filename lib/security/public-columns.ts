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
  /* Part 77 made these two private in the database and this list was never told, so the app's own
     publicCreator() would have passed them through; they are on it now, with part 79's three. */
  "payments_status",
  "last_stripe_sync_at",
  "stripe_previous_account_id",
  "stripe_account_reset_at",
  "stripe_account_reset_reason",
  /* What the last Stripe sync worked out (supabase/sql/run-now/84_seller_payment_state.sql). */
  "can_accept_payments",
  "stripe_disabled_reason",
  "stripe_account_country",
  "stripe_business_type",
  "stripe_pending_verification",
  "stripe_eventually_due",
  "stripe_requirement_errors",
  "stripe_transfers_status",
  "payout_destination",
  "stripe_requirements_cleared_at",
  "last_stripe_event_id",
  "last_stripe_event_type",
  "last_stripe_event_at",
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
  /* When the person last opened their notifications (part 85): theirs alone. */
  "notifications_seen_at",
] as const

/** The creator fields a card, a library row or a storefront header shows. Every one of them exists in every database. */
export const CREATOR_CARD = "id, user_id, slug, username, display_name, avatar_url, bio, headline, niche_tags"
/** The profile fields a card shows. */
export const PROFILE_CARD = "id, username, display_name, avatar_url"
/**
 * A creator, embedded in another table's select. It used to embed the
 * creator's profile on `profiles!creators_user_id_fkey`, but creators.user_id
 * points at auth.users, not at profiles, so PostgREST knows no relationship
 * between the two and refused every read that asked ("Could not find a
 * relationship between 'creators' and 'profiles' in the schema cache"):
 * the library's entitlements, the dashboard's purchases and the old /c/
 * address came back empty. The profile is its own read now,
 * attachCreatorProfiles below, and every reader keeps `creator.profile`.
 */
export const CREATOR_WITH_PROFILE = CREATOR_CARD

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProfileReader = { from: (table: string) => any }

/**
 * Fills `profile` (the public card fields) on each creator, in one read by
 * the creators' user ids. Mutates the creators it is given and returns them;
 * a failed read leaves `profile` null and never throws, so a page draws with
 * the creator's own name instead.
 */
export async function attachCreatorProfiles<T extends { user_id?: string | null; profile?: unknown } | null | undefined>(db: ProfileReader, creators: T[]): Promise<T[]> {
  const ids = [...new Set(creators.map((c) => c?.user_id).filter((id): id is string => typeof id === "string" && id.length > 0))]
  if (ids.length === 0) return creators
  try {
    const { data, error } = await db.from("profiles").select(PROFILE_CARD).in("id", ids)
    if (error) return creators
    const byId = new Map(((data as Array<{ id: string }> | null) ?? []).map((p) => [p.id, p]))
    for (const c of creators) if (c && c.user_id) (c as { profile?: unknown }).profile = byId.get(c.user_id) ?? null
  } catch {
    /* the page draws with the creator's own name */
  }
  return creators
}

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
