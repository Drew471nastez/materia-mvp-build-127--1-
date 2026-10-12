import "server-only"

/**
 * ===========================================================================
 *  PHOTOS WITH A BUYER'S MESSAGE
 * ===========================================================================
 * A buyer writing about a parcel that came damaged sends a photo of it. The
 * photo goes through the same checks every upload to Storelib does
 * (lib/security/uploads: the bytes must be a picture whatever the name
 * says, nothing that could run, the EICAR test file refused), loses its
 * location and camera data (lib/images/metadata), and is kept in the
 * PRIVATE `order-case-photos` bucket (SQL part 164) under the case's id.
 *
 * Nobody reads the bucket directly: it has no storage policy, so only the
 * server does, and the message row keeps the path, never an address. Each
 * read of a case (the buyer's link, the store's order page, Storelib's
 * Resolution center) is handed a link to each photo that lasts an hour.
 *
 * Before part 164 runs the bucket is missing: the message is still sent and
 * the buyer is told the photos could not be kept yet.
 *
 * The storage client is passed in, so tests/buyer24.test.ts drives it with
 * a fake bucket and no network.
 */
import { randomUUID } from "node:crypto"
import { inspectHead, HEAD_BYTES } from "@/lib/security/uploads/inspect"
import { stripImageMetadata } from "@/lib/images/metadata"
import { isMissingBucket } from "@/lib/website-builder/agent/db-errors"
import { CASE_PHOTO_TYPES, MAX_CASE_PHOTOS, MAX_CASE_PHOTO_BYTES, type CasePhotoRef } from "@/lib/support/cases"

export const CASE_PHOTO_BUCKET = "order-case-photos"
const SIGNED_FOR_SECONDS = 60 * 60

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Storage = { storage: { from: (bucket: string) => any } }

/** A file as a form or a test hands it over. */
export interface IncomingPhoto {
  name: string
  type: string
  size: number
  bytes: () => Promise<Uint8Array>
}

/** The photos in a posted form (`photos`), as plain values: at most the limit, anything that is not a file left out. */
export function photosOfForm(form: FormData): IncomingPhoto[] {
  return form
    .getAll("photos")
    .filter((v): v is File => typeof v === "object" && v !== null && typeof (v as File).arrayBuffer === "function")
    .slice(0, MAX_CASE_PHOTOS + 1)
    .map((f) => ({ name: f.name || "photo", type: f.type || "", size: f.size, bytes: async () => new Uint8Array(await f.arrayBuffer()) }))
}

/** A form's text fields as the JSON routes read them. */
export function fieldsOfForm(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v
  return out
}

/** A buyer's post: a form with `photos`, or JSON without. The JSON is read as the other routes read it. */
export async function readCaseRequest(request: Request): Promise<{ body: Record<string, unknown> | null; photos: IncomingPhoto[] }> {
  if ((request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
    const form = await request.formData().catch(() => null)
    return form ? { body: fieldsOfForm(form), photos: photosOfForm(form) } : { body: null, photos: [] }
  }
  try {
    const body = await request.json()
    return { body: body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null, photos: [] }
  } catch {
    return { body: null, photos: [] }
  }
}

export type KeptPhotos = { ok: true; refs: CasePhotoRef[]; notKept: boolean } | { ok: false; error: string }

/**
 * Checks every photo first and refuses the lot if one is not a picture (the
 * buyer is told which), then keeps them. A bucket that isn't there yet keeps
 * none and says so (`notKept`), so the words still go.
 */
export async function keepCasePhotos(db: Storage, caseId: string, photos: IncomingPhoto[]): Promise<KeptPhotos> {
  if (photos.length === 0) return { ok: true, refs: [], notKept: false }
  if (photos.length > MAX_CASE_PHOTOS) return { ok: false, error: `Send up to ${MAX_CASE_PHOTOS} photos with a message.` }
  const checked: { bytes: Uint8Array; type: string; name: string }[] = []
  for (const p of photos) {
    if (p.size > MAX_CASE_PHOTO_BYTES) return { ok: false, error: `${shortName(p.name)} is too large. A photo can be up to 8 MB.` }
    if (!(CASE_PHOTO_TYPES as readonly string[]).includes(p.type)) return { ok: false, error: `${shortName(p.name)} isn't a photo Storelib can take. Use a JPEG, PNG, WebP or GIF.` }
    const raw = await p.bytes()
    if (raw.byteLength === 0 || raw.byteLength > MAX_CASE_PHOTO_BYTES) return { ok: false, error: `${shortName(p.name)} could not be read. Try another photo.` }
    /* The central check (lib/security/uploads): the bytes must be a picture, nothing behind the picture's name. */
    const verdict = inspectHead({ fileName: p.name || `photo.${EXT[p.type]}`, declaredMime: p.type, size: raw.byteLength, head: raw.subarray(0, HEAD_BYTES), context: "public_image", maxBytes: MAX_CASE_PHOTO_BYTES })
    if (!verdict.ok) return { ok: false, error: `${shortName(p.name)}: ${verdict.userMessage || "this file can't be sent."}` }
    let bytes = raw
    try {
      bytes = stripImageMetadata(raw)
    } catch {
      /* A picture whose metadata could not be read is kept as it came: the check above already passed it. */
    }
    checked.push({ bytes, type: p.type, name: shortName(p.name) })
  }
  const refs: CasePhotoRef[] = []
  for (const c of checked) {
    const path = `${caseId}/${randomUUID()}.${EXT[c.type]}`
    const { error } = await db.storage.from(CASE_PHOTO_BUCKET).upload(path, c.bytes, { contentType: c.type, upsert: false })
    if (error) {
      if (refs.length) await removeCasePhotos(db, refs)
      if (isMissingBucket(error)) return { ok: true, refs: [], notKept: true }
      console.error("[cases] photo not kept:", error.message ?? error)
      return { ok: false, error: "The photos could not be sent. Try again, or send the message without them." }
    }
    refs.push({ path, type: c.type, size: c.bytes.byteLength, name: c.name })
  }
  return { ok: true, refs, notKept: false }
}

export async function removeCasePhotos(db: Storage, refs: CasePhotoRef[]): Promise<void> {
  if (!refs.length) return
  await Promise.resolve(db.storage.from(CASE_PHOTO_BUCKET).remove(refs.map((r) => r.path))).catch(() => undefined)
}

/** The stored refs a row holds, read defensively: only paths under this case, in this bucket's shape. */
export function refsOf(raw: unknown, caseId: string): CasePhotoRef[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is CasePhotoRef => !!r && typeof r === "object" && typeof (r as CasePhotoRef).path === "string")
    .filter((r) => r.path.startsWith(`${caseId}/`) && !r.path.includes(".."))
    .slice(0, MAX_CASE_PHOTOS)
}

/** An hour's link to each photo, for this read only. A photo that can't be signed is left out. */
export async function signCasePhotos(db: Storage, refs: CasePhotoRef[]): Promise<{ url: string; name: string }[]> {
  if (!refs.length) return []
  try {
    const { data, error } = await db.storage.from(CASE_PHOTO_BUCKET).createSignedUrls(
      refs.map((r) => r.path),
      SIGNED_FOR_SECONDS,
    )
    if (error || !Array.isArray(data)) return []
    return refs.flatMap((r, i) => (data[i]?.signedUrl ? [{ url: String(data[i].signedUrl), name: r.name }] : []))
  } catch {
    return []
  }
}

function shortName(name: string): string {
  const n = (name || "photo").replace(/[\u0000-\u001f\u007f<>]/g, "").trim()
  return n.length > 40 ? `${n.slice(0, 37)}...` : n || "photo"
}
