import "server-only"

/**
 * ===========================================================================
 *  THE STORE'S HANDLE, FOR A TEAM MEMBER'S PAGE (round 41)
 * ===========================================================================
 * A product's address is under the store owner's handle: their username,
 * else the store's own address (creators.slug). The owner's pages read it
 * from their own rows (lib/auth/request-scope); a team member's page reads
 * the store's, by the store's id and its owner's account, never the
 * member's own.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** The store owner's username, else the store's slug, else null. */
export async function storeHandle(db: Db, creatorId: string, ownerUserId: string | null): Promise<string | null> {
  const [{ data: creator }, profile] = await Promise.all([
    db.from("creators").select("slug").eq("id", creatorId).maybeSingle(),
    ownerUserId ? db.from("profiles").select("username").eq("id", ownerUserId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const username = (profile.data as { username?: string | null } | null)?.username
  return username || (creator as { slug?: string | null } | null)?.slug || null
}
