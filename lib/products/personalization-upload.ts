/**
 * A buyer's photo for a personalization field, from their browser to the
 * store's private cart uploads (lib/cart-uploads): one multipart POST to
 * /api/cart/uploads on the page's own host, which checks the bytes (a real
 * JPEG, PNG or WebP, 10 MB at most), draws the picture again without its
 * metadata and keeps it for this browser and this store. The answer's
 * `upload.value` is what the cart line keeps. On storelib.com's own product
 * page the store is the product's (`?product=`). Used by the website's
 * product section and the storelib.com product page; an imported theme's
 * page does the same in plain script (lib/storelib-theme/compat/personalization.ts).
 */
import { UPLOAD_ERRORS, isUploadValue } from "@/lib/cart-uploads/rules"
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "./personalization"

export type UploadResult = { ok: true; url: string } | { ok: false; error: string }

export async function uploadPersonalizationPhoto(file: File, where: { productId: string; fieldId: string }, opts: { signal?: AbortSignal } = {}): Promise<UploadResult> {
  const type = file.type === "image/jpg" ? "image/jpeg" : file.type
  if (!(UPLOAD_TYPES as readonly string[]).includes(type)) return { ok: false, error: UPLOAD_ERRORS.not_image }
  if (file.size <= 0) return { ok: false, error: UPLOAD_ERRORS.empty }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: UPLOAD_ERRORS.too_large }
  try {
    const form = new FormData()
    form.append("file", file, file.name || "photo")
    const res = await fetch(`/api/cart/uploads?product=${encodeURIComponent(where.productId)}`, { method: "POST", body: form, credentials: "same-origin", signal: opts.signal })
    const body = (await res.json().catch(() => null)) as { upload?: { value?: unknown }; message?: unknown } | null
    const value = body?.upload?.value
    if (res.ok && typeof value === "string" && isUploadValue(value)) return { ok: true, url: value }
    return { ok: false, error: typeof body?.message === "string" && body.message ? body.message : UPLOAD_ERRORS.failed }
  } catch {
    return { ok: false, error: UPLOAD_ERRORS.failed }
  }
}
