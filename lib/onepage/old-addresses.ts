/**
 * ===========================================================================
 *  A ONEPAGE'S OLD ADDRESSES (SQL part 472, public.onepage_old_addresses)
 * ===========================================================================
 * A creator who changes their page's address from storelib.me/old to
 * storelib.me/new has old in a bio, a QR code and a post. The save
 * (app/api/onepage PUT) keeps it here, and every public way in follows it to
 * the page's address now with a permanent redirect, the query kept
 * (lib/onepage/address-lookup renamedSlug, read by
 * lib/onepage/resolve-address for storelib.me/{name}, /l/{name}, the old
 * storelib.com links and the page route on any host).
 *
 *   one row per old address    lower case and unique, so an old address
 *                              leads to one page: the last one to leave it
 *   a page that takes it       removes the row (claimOldAddress), so an
 *                              address in use is never sent away; a page
 *                              answering at a name also wins before any
 *                              history is read
 *   is it taken?               an old address is free for the creator who
 *                              left it, and taken for anybody else for
 *                              OLD_ADDRESS_HELD_DAYS after it was left, so a
 *                              stranger cannot pick up a link the day it is
 *                              dropped (oldAddressHeld)
 *
 * BEFORE THE SQL RUNS nothing changes: a missing table is no history, every
 * write is skipped, and no answer here ever fails a save or a page.
 */
import "server-only"

export const OLD_ADDRESS_HELD_DAYS = 30
const TABLE = "onepage_old_addresses"

type Err = { code?: string; message?: string } | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** A table the database does not have yet: Postgres's own code, or PostgREST's when its schema cache has no such table. */
export function noSuchTable(error: Err): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache|could not find the table/i.test(error.message || ""))
}

const key = (slug: string) => slug.trim().toLowerCase()

/**
 * The address a page just left, kept for it. Upserted on the address, so the
 * last page to leave it is the one it leads to. Never throws.
 */
export async function rememberOldAddress(db: Db, { oldSlug, onepageId, ownerId }: { oldSlug: string | null | undefined; onepageId: string; ownerId: string | null }): Promise<void> {
  const slug = key(oldSlug || "")
  if (!slug || !onepageId) return
  try {
    const { error } = await db.from(TABLE).upsert({ old_slug: slug, onepage_id: onepageId, owner_id: ownerId, created_at: new Date().toISOString() }, { onConflict: "old_slug" })
    if (error && !noSuchTable(error)) console.error("[onepage] old address not kept:", error.code ?? "unknown")
  } catch (e) {
    console.error("[onepage] old address not kept:", (e as Error).message)
  }
}

/** A page takes this address as its own: whatever history named it is gone, so it never leads away. Never throws. */
export async function claimOldAddress(db: Db, slug: string | null | undefined): Promise<void> {
  const name = key(slug || "")
  if (!name) return
  try {
    const { error } = await db.from(TABLE).delete().eq("old_slug", name)
    if (error && !noSuchTable(error)) console.error("[onepage] old address not released:", error.code ?? "unknown")
  } catch (e) {
    console.error("[onepage] old address not released:", (e as Error).message)
  }
}

/**
 * Is this name somebody else's recently left address? "held" for another
 * creator within the hold, "free" for its own creator, after the hold, with
 * no row, or before the SQL; "unknown" when the read failed.
 */
export async function oldAddressHeld(db: Db, name: string, userId: string, now = Date.now()): Promise<"held" | "free" | "unknown"> {
  try {
    const { data, error } = await db.from(TABLE).select("owner_id, created_at").eq("old_slug", key(name)).limit(1).maybeSingle()
    if (error) return noSuchTable(error) ? "free" : "unknown"
    const row = data as { owner_id?: string | null; created_at?: string | null } | null
    if (!row) return "free"
    if (row.owner_id && row.owner_id === userId) return "free"
    const at = Date.parse(row.created_at || "")
    if (!Number.isFinite(at)) return "held"
    return now - at < OLD_ADDRESS_HELD_DAYS * 86_400_000 ? "held" : "free"
  } catch {
    return "unknown"
  }
}
