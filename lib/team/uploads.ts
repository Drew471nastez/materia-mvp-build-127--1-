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
 * Round 41: Products is open. A member with Products uploads the product's
 * pictures and its files (the private bucket) into the store's folder too.
 * The file's row names the member who uploaded it (uploaded_by), and the
 * file stays readable only as before: by its buyers through the download
 * routes, never by a public address.
 */

/** The areas whose editors upload public pictures through the shared upload. */
export const UPLOAD_AREAS: readonly TeamPermission[] = ["onepage", "community", "products", "settings"]

/** The areas that may upload a product's file (the private bucket): Products only. */
export const PRODUCT_FILE_AREAS: readonly TeamPermission[] = ["products"]

/** Pure: whether this upload store may send a product file. The owner always; a member only with Products. */
export function mayUploadProductFile(store: UploadStore): boolean {
  if (store.kind === "own") return true
  if (store.kind === "refused") return false
  return PRODUCT_FILE_AREAS.some((a) => permits(store.acting.permissions, a))
}

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

/**
 * For a route about a product's files (rename, delete, bundle, scan, the
 * server upload): the creator row it acts for. The signed in owner's own row,
 * exactly as before; for a team member working in a store, that store's row
 * when they have Products, else null (refused, never their own in its place).
 */
export async function productCreator(db: Db, userId: string, columns: string): Promise<Record<string, unknown> | null> {
  const acting = await actingStore(db, userId).catch(() => null)
  return productCreatorFor(db, userId, acting, columns)
}

/** The database half of productCreator, for the suite: the acting store handed in. */
export async function productCreatorFor(db: Db, userId: string, acting: ActingStore | null, columns: string): Promise<Record<string, unknown> | null> {
  if (acting && !permits(acting.permissions, "products")) return null
  const q = db.from("creators").select(columns)
  const { data } = acting ? await q.eq("id", acting.creatorId).maybeSingle() : await q.eq("user_id", userId).maybeSingle()
  return (data as Record<string, unknown> | null) ?? null
}

/*
  ===========================================================================
   A PICTURE THE BROWSER PUTS STRAIGHT INTO A BUCKET (round 41)
  ===========================================================================
  Several editors write a picture or a video straight from the browser into
  a public bucket, under the signed in account's folder, and storage's own
  policies (SQL parts 15 and 90) let an account write only its own folder.
  A team member's write into the store's folder is refused there, so the
  browser asks /api/team/upload-url instead, which answers with a signed
  upload address for that one path when:

    the member works in the store (the cookie, read again from the database)
    their permissions hold an area that writes into that bucket (TEAM_BUCKET_AREAS)
    the path starts with the store's id or its owner's account, and nothing else

  The address cannot overwrite a file that is there. The owner never comes
  here: their own folder is theirs, as before.
*/

/** The areas whose editors write into each public bucket from the browser. A bucket not listed is never given to a member. */
export const TEAM_BUCKET_AREAS: Readonly<Record<string, readonly TeamPermission[]>> = {
  "product-images": ["products"],
  /* Videos, and the Files library's uploads, which the OnePage and Store details pickers upload through too. */
  "store-builder-images": ["products", "onepage", "settings"],
  /* The OnePage editor's pictures and videos, under the page owner's account (lib/onepage/media-upload). */
  "onepage-assets": ["onepage"],
}

/** Pure: may this member write this path in this bucket. The path's first folder must be the store's id or its owner's account. */
export function teamUploadPathOk(acting: ActingStore, bucket: unknown, path: unknown): path is string {
  if (typeof bucket !== "string" || !Object.hasOwn(TEAM_BUCKET_AREAS, bucket)) return false
  if (!TEAM_BUCKET_AREAS[bucket].some((a) => permits(acting.permissions, a))) return false
  if (typeof path !== "string" || path.length > 512 || path.startsWith("/") || path.includes("..") || path.includes("\\") || path.includes("//")) return false
  const parts = path.split("/")
  if (parts.length < 2 || parts.some((p) => !p || p === ".")) return false
  return parts[0] === acting.creatorId || (!!acting.ownerUserId && parts[0] === acting.ownerUserId)
}
