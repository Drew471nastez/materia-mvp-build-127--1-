import "server-only"

/**
 * ===========================================================================
 *  A MEMBER'S OWN MEMBERSHIPS, READ ON THE SERVER
 * ===========================================================================
 * Every buyer page and route asks here, with the admin client, and checks
 * ownership itself: by the account, or by the confirmed address the
 * membership was paid with before the account existed (a guest checkout).
 * A membership found by address is written onto the account the first time
 * it is seen, and the products it includes are put in the library then, so
 * paying as a guest and signing up afterwards ends in the same place as
 * paying signed in.
 *
 * Row level security says the same for the tables (part 75); this is the
 * server's own check, not a replacement for it.
 */
import { grantsAccess } from "./state"
import { grantIncluded } from "./sync"
import { MEMBERSHIP_COLUMNS, UUID, belongsTo, ownerFilter, tableMissing, type Db, type MembershipRow, type Viewer } from "./server"

export type Read<T> = { ok: true; value: T } | { ok: false; missingTables: true }

/** Every membership of this person, newest first, including ended ones (they keep their receipts). */
export async function viewerMemberships(admin: Db, viewer: Viewer): Promise<Read<MembershipRow[]>> {
  const { data, error } = await admin.from("memberships").select(MEMBERSHIP_COLUMNS).or(ownerFilter(viewer)).neq("status", "incomplete").order("created_at", { ascending: false }).limit(200)
  if (error) {
    if (tableMissing(error)) return { ok: false, missingTables: true }
    throw new Error(`${error.code ?? ""} ${error.message ?? ""}`)
  }
  const rows = ((data as MembershipRow[] | null) ?? []).filter((r) => belongsTo(r, viewer))
  await claim(admin, viewer, rows)
  return { ok: true, value: rows }
}

export async function viewerMembership(admin: Db, viewer: Viewer, id: string): Promise<Read<MembershipRow | null>> {
  if (!UUID.test(id)) return { ok: true, value: null }
  const { data, error } = await admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("id", id).maybeSingle()
  if (error) {
    if (tableMissing(error)) return { ok: false, missingTables: true }
    throw new Error(`${error.code ?? ""} ${error.message ?? ""}`)
  }
  const row = data as MembershipRow | null
  if (!row || !belongsTo(row, viewer)) return { ok: true, value: null }
  await claim(admin, viewer, [row])
  return { ok: true, value: row }
}

/** A guest's membership, now that they are signed in with its address: theirs, and its products in their library. */
async function claim(admin: Db, viewer: Viewer, rows: MembershipRow[]) {
  for (const row of rows) {
    if (row.buyer_id) continue
    const { error } = await admin.from("memberships").update({ buyer_id: viewer.id }).eq("id", row.id).is("buyer_id", null)
    if (error) continue
    row.buyer_id = viewer.id
    if (grantsAccess(row)) {
      try {
        await grantIncluded(admin, row)
      } catch (e) {
        console.error("[memberships] included products not granted on claim:", e instanceof Error ? e.message : e)
      }
    }
  }
}

/** Whether this person may read a membership product's posts and files now: a member with access, or its creator. */
export async function canReadMembership(admin: Db, viewer: Viewer, productId: string): Promise<{ allowed: boolean; creator: boolean; membership: MembershipRow | null }> {
  const { data: product } = await admin.from("products").select("creator_id, creators!inner(user_id)").eq("id", productId).maybeSingle()
  const owner = (product as { creators?: { user_id?: string } | { user_id?: string }[] } | null)?.creators
  const ownerId = Array.isArray(owner) ? owner[0]?.user_id : owner?.user_id
  if (ownerId && ownerId === viewer.id) return { allowed: true, creator: true, membership: null }
  const { data } = await admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("product_id", productId).or(ownerFilter(viewer)).order("created_at", { ascending: false }).limit(10)
  const rows = ((data as MembershipRow[] | null) ?? []).filter((r) => belongsTo(r, viewer))
  const current = rows.find((r) => grantsAccess(r)) ?? null
  return { allowed: !!current, creator: false, membership: current ?? rows[0] ?? null }
}
