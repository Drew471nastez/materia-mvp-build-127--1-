import "server-only"

/**
 * ===========================================================================
 *  WHOSE STORE A ONEPAGE IS: ITS OWNER'S, NEVER WHAT THE ROW SAYS
 * ===========================================================================
 * Every public route that acts for a creator (a signup's list and welcome
 * flow, a product given for an email, a tip, Paid access, the products,
 * stats, pixels and click counts on the live page) took the store from the
 * row's own seller_id or creator_id. The page's owner can write those two
 * columns themselves (the table's policy checks only that the row is theirs,
 * and the app writes them with the owner's own session), so a page could name
 * ANOTHER creator's store: hand out that creator's paid files for an email,
 * fill their subscriber list and their Mailchimp, draw their private counts.
 * Rows made by the old onboarding also named the owner's user id there, which
 * is no store at all, and their signups went nowhere.
 *
 * owner_id is the one column the row cannot lie about: the policy pins it to
 * the signed in account. So the store is read from it, creators.user_id =
 * owner_id, and put on the row in place of what it carried. A read that
 * fails leaves the row with no store, which every caller already treats as
 * "nothing to act for", never as somebody else's.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type StoreRow = { owner_id?: unknown; seller_id?: unknown; creator_id?: unknown }

/** creators.id of the account that owns the page, or null (no store, or the read failed). */
export async function ownerStoreId(db: Db, ownerId: unknown): Promise<string | null> {
  if (typeof ownerId !== "string" || !ownerId) return null
  try {
    const { data, error } = await db.from("creators").select("id").eq("user_id", ownerId).limit(1).maybeSingle()
    if (error) return null
    const id = (data as { id?: unknown } | null)?.id
    return typeof id === "string" && id ? id : null
  } catch {
    return null
  }
}

/** The row with seller_id and creator_id set to its owner's store. A copy; null stays null. */
export async function withOwnerStore<T extends StoreRow>(db: Db, row: T | null | undefined): Promise<T | null> {
  if (!row || typeof row !== "object") return null
  const store = await ownerStoreId(db, row.owner_id)
  return { ...row, seller_id: store, creator_id: store }
}
