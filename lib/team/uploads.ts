import "server-only"
import { permits, type TeamPermission } from "./permissions"
import { actingStore, type ActingStore } from "./server"

/**
 * ===========================================================================
 *  A PICTURE A TEAM MEMBER UPLOADS IS THE STORE'S (round 40)
 * ===========================================================================
 * The shared upload (app/api/v2/upload/prepare and complete) keeps a public
 * picture under the creator's folder, `<creator id>/product-images/...`, and
 * found that creator by the signed in account. A member working in a store
 * uploads a community's logo or a OnePage picture for that store, so it goes
 * in that store's folder, which also means a member with no store of their
 * own can upload at all.
 *
 *   their own account        their own creator row, as before
 *   working in a store, with an area that edits pictures (UPLOAD_AREAS):
 *                            the store's row
 *   working in a store       refused: never their own folder in its place
 *   without one
 *
 * Product files (the private bucket) stay the owner's: products are not open
 * to the team, and a file is sold, not shown.
 */

/** The areas whose editors upload public pictures through the shared upload. */
export const UPLOAD_AREAS: readonly TeamPermission[] = ["onepage", "community"]

export type UploadStore = { kind: "own" } | { kind: "store"; acting: ActingStore } | { kind: "refused" }

/** Pure: what an upload by someone acting in this store (or null, their own account) may use. */
export function uploadStoreOf(acting: ActingStore | null): UploadStore {
  if (!acting) return { kind: "own" }
  return UPLOAD_AREAS.some((a) => permits(acting.permissions, a)) ? { kind: "store", acting } : { kind: "refused" }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** For the upload routes: whose folder, read from the cookie and the database on each request. No read at all without the cookie. */
export async function uploadStore(db: Db, userId: string): Promise<UploadStore> {
  const acting = await actingStore(db, userId).catch(() => null)
  return uploadStoreOf(acting)
}

/** The creator row an upload uses: the signed in account's own, or the store's for a member. */
export async function uploadCreator(db: Db, userId: string, store: UploadStore, columns: string): Promise<Record<string, unknown> | null> {
  if (store.kind === "refused") return null
  const q = db.from("creators").select(columns)
  const { data } = store.kind === "store" ? await q.eq("id", store.acting.creatorId).maybeSingle() : await q.eq("user_id", userId).single()
  return (data as Record<string, unknown> | null) ?? null
}
