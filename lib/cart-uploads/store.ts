/**
 * ===========================================================================
 *  WHERE A BUYER'S PICTURE IS KEPT, AND WHO MAY SEE IT
 * ===========================================================================
 * The private `cart-uploads` bucket (SQL part 308) has no storage policy at
 * all: nobody lists or reads it but the server. Each picture is kept twice
 * over its life:
 *
 *   cart/<store>/<visitor hash>/<id>.<ext>      from the upload, for the cart
 *   orders/<store>/<checkout>/<id>.<ext>        copied when the order is paid
 *
 * and its row in `cart_uploads` (service role only) says whose it is: the
 * store (creator_id), the browser (visitor_hash, lib/cart-uploads/sign.ts),
 * the checkout that took it and when it became part of an order.
 *
 *   the buyer     their own browser on that store: a ten minute link
 *                 (GET /api/cart/uploads/<ref>/<name>), only when the value's
 *                 signature checks against their cookie and the row agrees.
 *   the store     its own orders only: loadOrder signs an hour's link for
 *                 each picture a line of THAT order names, of THAT store.
 *   a partner     the print file of an order sent to Printful, Printify or
 *                 Gelato: a link that lasts seven days.
 *
 * A checkout takes only the pictures its own browser uploaded to its own
 * store (checkLineFiles); a value from another cart or another store stops
 * the checkout with a plain message. Once paid, the files are copied to the
 * order's own path, so they stay when the cart is long gone. Nothing an
 * order holds is ever removed: the daily sweep removes only uploads no paid
 * order took, after 14 days.
 *
 * The database client is passed in, so tests/cart-uploads.test.ts drives all
 * of it with a fake bucket and table and no network.
 */
import { randomUUID } from "node:crypto"

import { checkCartImage, type IncomingFile, type Reencode } from "./image"
import { CART_UPLOAD_KEEP_DAYS, CART_UPLOAD_TYPES, UPLOAD_ERRORS, readUploadValue, uploadFileName, uploadValue, uploadsOf, type CartUploadType, type UploadErrorCode } from "./rules"
import { compactId, signRef, uuidOf, verifyRef } from "./sign"
import { lineProperties } from "@/lib/physical/cart-link"

export const CART_UPLOAD_BUCKET = "cart-uploads"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any; storage: { from: (bucket: string) => any } }

const ROW = "id, creator_id, visitor_hash, file_name, content_type, bytes, width, height, cart_path, order_path, checkout_id, created_at, attached_at"

export interface UploadRow {
  id: string
  creator_id: string
  visitor_hash: string
  file_name: string
  content_type: string
  bytes: number
  width: number | null
  height: number | null
  cart_path: string | null
  order_path: string | null
  checkout_id: string | null
  created_at: string
  attached_at: string | null
}

export interface KeptUpload {
  id: string
  /** `<id>.<sig>`. */
  ref: string
  /** The line property's value (lib/cart-uploads/rules uploadValue). */
  value: string
  name: string
  type: CartUploadType
  size: number
  width: number
  height: number
}

export type KeepResult = { ok: true; upload: KeptUpload } | { ok: false; status: number; code: UploadErrorCode; error: string }

/** Before SQL part 308: the table or the bucket is not there. */
export function isMissing(error: { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  const message = String(error.message ?? "")
  return code === "42P01" || code === "PGRST205" || /bucket not found|could not find the table|does not exist/i.test(message)
}

const fail = (status: number, code: UploadErrorCode): KeepResult => ({ ok: false, status, code, error: UPLOAD_ERRORS[code] })

/**
 * One picture from one browser for one store: checked and drawn again
 * (lib/cart-uploads/image.ts), kept under the store and the browser with a
 * random id, its row written. The answer's `value` is what the cart line
 * holds.
 */
export async function keepCartUpload(db: Db, input: { creatorId: string; visitorHash: string; file: IncomingFile; reencode?: Reencode }): Promise<KeepResult> {
  if (!/^[0-9a-f]{64}$/.test(input.visitorHash)) return fail(400, "wrong_place")
  const checked = await checkCartImage(input.file, input.reencode)
  if (checked.ok === false) {
    const c = checked as { code: UploadErrorCode }
    return fail(c.code === "too_large" ? 413 : 400, c.code)
  }
  const id = randomUUID()
  const path = `cart/${input.creatorId}/${input.visitorHash.slice(0, 32)}/${compactId(id)}.${checked.ext}`
  const name = uploadFileName(input.file.name, checked.type)
  const bucket = db.storage.from(CART_UPLOAD_BUCKET)
  const put = await Promise.resolve(bucket.upload(path, checked.bytes, { contentType: checked.type, upsert: false, cacheControl: "private, max-age=0" })).catch((e: unknown) => ({ error: e as { message?: string } }))
  if (put?.error) {
    if (isMissing(put.error)) return fail(503, "not_ready")
    console.error("[cart-uploads] not kept:", put.error.message ?? put.error)
    return fail(500, "failed")
  }
  const { error } = await db.from("cart_uploads").insert({
    id,
    creator_id: input.creatorId,
    visitor_hash: input.visitorHash,
    file_name: name,
    content_type: checked.type,
    bytes: checked.bytes.byteLength,
    width: checked.width,
    height: checked.height,
    cart_path: path,
  })
  if (error) {
    await Promise.resolve(bucket.remove([path])).catch(() => undefined)
    if (isMissing(error)) return fail(503, "not_ready")
    console.error("[cart-uploads] row not written:", error.code ?? error.message)
    return fail(500, "failed")
  }
  const ref = signRef(input.creatorId, id, input.visitorHash)
  return { ok: true, upload: { id, ref, value: uploadValue(ref, name), name, type: checked.type, size: checked.bytes.byteLength, width: checked.width, height: checked.height } }
}

/** The row of a value's upload when it is this browser's on this store, else null: the signature first, then the row says the same. */
export async function uploadForVisitor(db: Db, input: { creatorId: string; visitorHash: string | null; ref: string }): Promise<UploadRow | null> {
  const id = verifyRef(input.ref, input.creatorId, input.visitorHash)
  if (!id) return null
  const { data, error } = await db.from("cart_uploads").select(ROW).eq("id", id).eq("creator_id", input.creatorId).eq("visitor_hash", input.visitorHash).maybeSingle()
  if (error || !data) return null
  return data as UploadRow
}

/** A link to the picture that lasts `seconds`, from its order's copy once it has one. Null when it cannot be signed. */
export async function signedLink(db: Db, row: Pick<UploadRow, "cart_path" | "order_path">, seconds: number, download?: string): Promise<string | null> {
  const path = row.order_path || row.cart_path
  if (!path || path.includes("..")) return null
  try {
    const { data, error } = await db.storage.from(CART_UPLOAD_BUCKET).createSignedUrl(path, seconds, download ? { download } : undefined)
    return error || !data?.signedUrl ? null : String(data.signedUrl)
  } catch {
    return null
  }
}

/**
 * THE CHECKOUT'S QUESTION: every picture the cart's lines name must be this
 * browser's upload to this store. The upload ids when they all are; the
 * buyer's words when one is not (copied from another cart, another store, a
 * value changed by hand), and the checkout stops there.
 */
export function checkLineFiles(items: unknown, input: { creatorId: string | null; visitorHash: string | null }): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids: string[] = []
  for (const raw of Array.isArray(items) ? items.slice(0, 50) : []) {
    const props = lineProperties((raw as { properties?: unknown } | null)?.properties)
    for (const { upload } of uploadsOf(props)) {
      const id = verifyRef(upload.ref, input.creatorId, input.visitorHash)
      if (!id) return { ok: false, error: UPLOAD_ERRORS.stale }
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return { ok: true, ids }
}

/** The checkout took these pictures: said on their rows, so the sweep knows to ask how it ended. Best effort. */
export async function claimUploads(db: Db, input: { creatorId: string; visitorHash: string; checkoutId: string; ids: string[] }): Promise<void> {
  if (!input.ids.length) return
  const { error } = await db.from("cart_uploads").update({ checkout_id: input.checkoutId, claimed_at: new Date().toISOString() }).in("id", input.ids).eq("creator_id", input.creatorId).eq("visitor_hash", input.visitorHash).is("attached_at", null)
  if (error && !isMissing(error)) console.error("[cart-uploads] not claimed:", error.code ?? error.message)
}

/** The upload ids an order's lines name (their snapshot properties). */
export function idsOfLines(lines: unknown): string[] {
  const ids: string[] = []
  for (const l of Array.isArray(lines) ? lines : []) {
    const props = lineProperties((l as { properties?: unknown } | null)?.properties ?? (l as { product_snapshot?: { properties?: unknown } } | null)?.product_snapshot?.properties)
    for (const { upload } of uploadsOf(props)) {
      const id = uuidOf(upload.id)
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

/**
 * PAID: each picture the order's lines name, of this store, copied to the
 * order's own path and marked as the order's, so it outlives the cart. Run
 * again (the webhook and the page both completing, the sweep catching up),
 * a picture already the order's is left as it is.
 */
export async function attachOrderFiles(db: Db, input: { creatorId: string; checkoutId: string; ids: string[] }): Promise<{ attached: number; failed: number }> {
  if (!input.ids.length) return { attached: 0, failed: 0 }
  const { data, error } = await db.from("cart_uploads").select(ROW).in("id", input.ids).eq("creator_id", input.creatorId)
  if (error) {
    if (!isMissing(error)) console.error("[cart-uploads] order files not read:", error.code ?? error.message)
    return { attached: 0, failed: input.ids.length }
  }
  let attached = 0
  let failed = 0
  const bucket = db.storage.from(CART_UPLOAD_BUCKET)
  for (const row of (Array.isArray(data) ? data : []) as UploadRow[]) {
    if (row.attached_at && row.order_path) continue
    if (!row.cart_path) {
      failed++
      continue
    }
    const ext = row.cart_path.split(".").pop() ?? "jpg"
    const to = `orders/${input.creatorId}/${input.checkoutId}/${compactId(row.id)}.${ext}`
    const copied = await Promise.resolve(bucket.copy(row.cart_path, to)).catch((e: unknown) => ({ error: e as { message?: string } }))
    if (copied?.error && !/exists|duplicate/i.test(String(copied.error.message ?? ""))) {
      console.error("[cart-uploads] not copied to the order:", copied.error.message ?? copied.error)
      failed++
      continue
    }
    const { error: upd } = await db.from("cart_uploads").update({ order_path: to, attached_at: new Date().toISOString(), checkout_id: input.checkoutId }).eq("id", row.id).eq("creator_id", input.creatorId)
    if (upd) failed++
    else attached++
  }
  return { attached, failed }
}

export interface OrderFile {
  /** The 32 hex the value names. */
  id: string
  name: string
  type: string
  bytes: number
  width: number | null
  height: number | null
  /** A link that lasts as long as asked, or null when it could not be signed. */
  url: string | null
  /** The same, saved as a file by its name. */
  downloadUrl: string | null
}

/**
 * THE STORE'S OWN PICTURES: the uploads these ids name that belong to this
 * store, each with a link that lasts `seconds`. An id of another store's
 * upload is simply not found.
 */
export async function orderFiles(db: Db, input: { creatorId: string; ids: string[]; seconds: number }): Promise<Map<string, OrderFile>> {
  const out = new Map<string, OrderFile>()
  if (!input.ids.length) return out
  try {
    const { data, error } = await db.from("cart_uploads").select(ROW).in("id", input.ids.slice(0, 100)).eq("creator_id", input.creatorId)
    if (error || !Array.isArray(data)) return out
    for (const row of data as UploadRow[]) {
      if (row.creator_id !== input.creatorId) continue
      out.set(compactId(row.id), { id: compactId(row.id), name: row.file_name, type: (CART_UPLOAD_TYPES as readonly string[]).includes(row.content_type) ? row.content_type : "image/jpeg", bytes: row.bytes, width: row.width, height: row.height, url: await signedLink(db, row, input.seconds), downloadUrl: await signedLink(db, row, input.seconds, row.file_name) })
    }
  } catch {
    /* No pictures read: the order is shown without them. */
  }
  return out
}

/** A line's pictures, by property, from what orderFiles read. */
export function filesOfLine(props: Record<string, string> | null | undefined, files: Map<string, OrderFile>): ({ property: string } & OrderFile)[] {
  return uploadsOf(props).flatMap(({ property, upload }) => {
    const f = files.get(upload.id)
    return f ? [{ property, ...f }] : []
  })
}

/**
 * THE DAILY SWEEP (app/api/cron/storage-cleanup). First the pictures a paid
 * order took but never got copied (a copy that failed): copied now. Then the
 * uploads older than 14 days that no order took (never at a checkout, or at
 * one that was never paid): their files and rows removed. A row an order
 * holds is never removed, and neither is its file.
 */
export async function sweepCartUploads(db: Db, input: { now?: number; dryRun?: boolean; limit?: number } = {}): Promise<{ attached: number; removed: number; kept: number; errors: string[] }> {
  const now = input.now ?? Date.now()
  const limit = Math.max(1, Math.min(1000, input.limit ?? 300))
  const before = new Date(now - CART_UPLOAD_KEEP_DAYS * 86_400_000).toISOString()
  const errors: string[] = []
  const { data, error } = await db.from("cart_uploads").select(ROW).is("attached_at", null).lt("created_at", before).order("created_at", { ascending: true }).limit(limit)
  if (error) return { attached: 0, removed: 0, kept: 0, errors: isMissing(error) ? [] : [`cart uploads not read: ${error.code ?? error.message}`] }
  const rows = (Array.isArray(data) ? data : []) as UploadRow[]
  const checkoutIds = [...new Set(rows.map((r) => r.checkout_id).filter((x): x is string => !!x))]
  const status = new Map<string, string>()
  if (checkoutIds.length) {
    const { data: cos, error: coError } = await db.from("commerce_checkouts").select("id, status, creator_id").in("id", checkoutIds)
    if (coError) return { attached: 0, removed: 0, kept: rows.length, errors: [`checkouts not read: ${coError.code ?? coError.message}`] }
    for (const c of (cos ?? []) as { id: string; status: string; creator_id: string }[]) status.set(c.id, c.status)
  }
  /* Only these say no order was made: a checkout never paid. Anything else (paid, completed, refunded, unknown) keeps the picture. */
  const unpaid = new Set(["pending", "expired", "failed"])
  let attached = 0
  let kept = 0
  const gone: UploadRow[] = []
  for (const r of rows) {
    const s = r.checkout_id ? status.get(r.checkout_id) : undefined
    if (!r.checkout_id || (s !== undefined && unpaid.has(s))) gone.push(r)
    else if (s === undefined) kept++
    else if (!input.dryRun) {
      const a = await attachOrderFiles(db, { creatorId: r.creator_id, checkoutId: r.checkout_id, ids: [r.id] })
      attached += a.attached
      if (a.failed) kept++
    } else kept++
  }
  if (input.dryRun || gone.length === 0) return { attached, removed: input.dryRun ? gone.length : 0, kept, errors }
  const paths = gone.map((r) => r.cart_path).filter((p): p is string => !!p && p.startsWith("cart/") && !p.includes(".."))
  const removed = paths.length ? await Promise.resolve(db.storage.from(CART_UPLOAD_BUCKET).remove(paths)).catch((e: unknown) => ({ error: e as { message?: string } })) : { error: null }
  if (removed?.error) {
    errors.push(`cart upload files not removed: ${removed.error.message ?? removed.error}`)
    return { attached, removed: 0, kept: kept + gone.length, errors }
  }
  const { error: delError } = await db.from("cart_uploads").delete().in("id", gone.map((r) => r.id)).is("attached_at", null)
  if (delError) errors.push(`cart upload rows not removed: ${delError.code ?? delError.message}`)
  return { attached, removed: delError ? 0 : gone.length, kept, errors }
}

/** For the value read alone (an email, a slip): the picture's file name. */
export function uploadNameOf(value: string): string | null {
  return readUploadValue(value)?.name ?? null
}
