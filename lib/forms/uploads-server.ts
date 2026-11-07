import "server-only"
import { createHmac, hkdfSync, randomUUID, timingSafeEqual } from "node:crypto"
import { checkCartImage, type IncomingFile, type Reencode } from "@/lib/cart-uploads/image"
import { compactId, uuidOf } from "@/lib/cart-uploads/sign"
import { inspectHead, HEAD_BYTES } from "@/lib/security/uploads/inspect"
import { sniff } from "@/lib/storage/file-signature"

/*
  A FILE A VISITOR ATTACHES TO A FORM.

  The same checks as a buyer's cart picture (lib/cart-uploads/image.ts):
  a JPEG, PNG or WebP is decided by its bytes, never its name, and drawn
  again so nothing that rode along (GPS, scripts glued to the end) is kept.
  A PDF must start with %PDF-, pass the central upload check, and carry no
  script, launch action or embedded file. Nothing else is taken. 4 MB, under the 4.5 MB a Vercel function accepts in one request.

  Kept in the private `form-uploads` bucket (no storage policy: only the
  server reads it) under the owner and the form, with a random id. The
  browser gets `<id>.<signature>`, signed for this form and this one
  submission token, so a reference copied from somewhere else cannot be
  attached to another response. The owner opens a file through a signed
  link that lasts a minute (app/api/leads/[id]/files/[upload]).
*/

export const FORM_UPLOAD_BUCKET = "form-uploads"
export const FORM_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
export const FORM_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const
export type FormUploadType = (typeof FORM_UPLOAD_TYPES)[number]
const EXT: Record<FormUploadType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }
export const OWNER_LINK_SECONDS = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any; storage: { from: (bucket: string) => any } }

function key(): Buffer {
  const own = process.env.COMMERCE_SECRETS_KEY
  const base = own || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!base) throw new Error("No key to sign form uploads with: set COMMERCE_SECRETS_KEY")
  return Buffer.from(hkdfSync("sha256", Buffer.from(base, "utf8"), Buffer.from("storelib-form-uploads"), Buffer.from(own ? "own" : "service"), 32))
}
function signature(formId: string, uploadId: string, token: string): string {
  return createHmac("sha256", key()).update(`form-upload:v1:${formId.toLowerCase()}:${uploadId.toLowerCase()}:${token.toLowerCase()}`).digest("base64url").slice(0, 22)
}
export function signUploadRef(formId: string, uploadId: string, token: string): string {
  return `${compactId(uploadId)}.${signature(formId, uploadId, token)}`
}
/** The upload's uuid when the reference was signed for this form and this submission token, else null. */
export function verifyUploadRef(ref: string, formId: string, token: string): string | null {
  const m = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{22})$/.exec(ref || "")
  if (!m) return null
  const id = uuidOf(m[1])
  const expected = Buffer.from(signature(formId, id, token))
  const given = Buffer.from(m[2])
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null
}

export function safeFileName(name: string, type: FormUploadType): string {
  const stem =
    String(name || "file")
      .replace(/\.[^.]*$/, "")
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N} _().-]/gu, "")
      .trim()
      .slice(0, 80) || "file"
  return `${stem}.${EXT[type]}`
}

const PDF_ACTIVE = /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b/

export type CheckedFile = { ok: true; bytes: Uint8Array; type: FormUploadType } | { ok: false; status: number; error: string }

export async function checkFormFile(file: IncomingFile, reencode?: Reencode): Promise<CheckedFile> {
  if (!file || file.size <= 0) return { ok: false, status: 400, error: "That file is empty." }
  if (file.size > FORM_UPLOAD_MAX_BYTES) return { ok: false, status: 413, error: "Files can be up to 4 MB." }
  let raw: Uint8Array
  try {
    raw = await file.bytes()
  } catch {
    return { ok: false, status: 400, error: "That file could not be read." }
  }
  if (raw.byteLength > FORM_UPLOAD_MAX_BYTES) return { ok: false, status: 413, error: "Files can be up to 4 MB." }
  const kind = sniff(raw.subarray(0, HEAD_BYTES)).mime
  if (kind === "application/pdf") {
    const verdict = inspectHead({ fileName: file.name || "file.pdf", declaredMime: file.type || null, size: raw.byteLength, head: raw.subarray(0, HEAD_BYTES), context: "link_page_file", maxBytes: FORM_UPLOAD_MAX_BYTES })
    if (!verdict.ok) return { ok: false, status: 400, error: "That PDF cannot be accepted." }
    /* Read as Latin-1 so every byte is one character: names in the PDF's objects are ASCII. */
    if (PDF_ACTIVE.test(Buffer.from(raw).toString("latin1"))) return { ok: false, status: 400, error: "PDFs with scripts or attachments cannot be accepted. Save it again as a plain PDF." }
    return { ok: true, bytes: raw, type: "application/pdf" }
  }
  const image = await checkCartImage(file, reencode)
  if (image.ok === false) {
    const failed = image as { error: string; code: string }
    return { ok: false, status: failed.code === "too_large" ? 413 : 400, error: failed.code === "not_image" ? "Upload a JPG, PNG, WebP or PDF." : failed.error }
  }
  return { ok: true, bytes: image.bytes, type: image.type as FormUploadType }
}

export type KeptFormUpload = { ok: true; ref: string; name: string; type: FormUploadType; size: number } | { ok: false; status: number; error: string; missing?: boolean }

export async function keepFormUpload(
  db: Db,
  input: { ownerId: string; formId: string; fieldId: string; token: string; file: IncomingFile; reencode?: Reencode },
): Promise<KeptFormUpload> {
  const checked = await checkFormFile(input.file, input.reencode)
  if (checked.ok === false) return checked as { ok: false; status: number; error: string }
  const id = randomUUID()
  const name = safeFileName(input.file.name, checked.type)
  const path = `${input.ownerId}/${input.formId}/${id}.${EXT[checked.type]}`
  const stored = await db.storage.from(FORM_UPLOAD_BUCKET).upload(path, checked.bytes, { contentType: checked.type, upsert: false })
  if (stored.error) return { ok: false, status: 503, error: "The file was not uploaded. Try again.", missing: /bucket not found/i.test(String(stored.error.message)) }
  const row = await db.from("form_uploads").insert({
    id,
    owner_id: input.ownerId,
    form_id: input.formId,
    field_id: input.fieldId,
    file_name: name,
    content_type: checked.type,
    bytes: checked.bytes.byteLength,
    path,
  })
  if (row.error) {
    await db.storage.from(FORM_UPLOAD_BUCKET).remove([path]).catch(() => null)
    return { ok: false, status: 503, error: "The file was not uploaded. Try again.", missing: true }
  }
  return { ok: true, ref: signUploadRef(input.formId, id, input.token), name, type: checked.type, size: checked.bytes.byteLength }
}

/**
 * The files a response names, each checked: signed for this form and this
 * token, uploaded to this form for this question, and not already part of
 * another response. Null with a reason when one is not.
 */
export async function filesForSubmission(
  db: Db,
  input: { formId: string; token: string; files: { field_id: string; ref: string }[] },
): Promise<{ ok: true; rows: { id: string; field_id: string; file_name: string; content_type: string; bytes: number; submission_id: string | null }[] } | { ok: false; error: string }> {
  if (!input.files.length) return { ok: true, rows: [] }
  const ids = input.files.map((f) => verifyUploadRef(f.ref, input.formId, input.token))
  if (ids.some((id) => !id)) return { ok: false, error: "Upload your file again." }
  const { data, error } = await db.from("form_uploads").select("id,field_id,file_name,content_type,bytes,submission_id,form_id").in("id", ids).eq("form_id", input.formId)
  if (error) return { ok: false, error: "Your file could not be checked. Try again." }
  const rows = (data || []) as { id: string; field_id: string; file_name: string; content_type: string; bytes: number; submission_id: string | null }[]
  for (let i = 0; i < ids.length; i++) {
    const row = rows.find((r) => r.id === ids[i])
    if (!row || row.field_id !== input.files[i].field_id) return { ok: false, error: "Upload your file again." }
  }
  return { ok: true, rows }
}

/** Removes the stored objects of these uploads, then their rows. */
export async function removeUploads(db: Db, rows: { id: string; path: string }[]): Promise<void> {
  if (!rows.length) return
  const paths = rows.map((r) => r.path).filter((p) => p && !p.includes(".."))
  if (paths.length) await db.storage.from(FORM_UPLOAD_BUCKET).remove(paths).catch(() => null)
  await db.from("form_uploads").delete().in("id", rows.map((r) => r.id))
}
