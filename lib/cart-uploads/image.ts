/**
 * ===========================================================================
 *  IS THIS A PICTURE, AND THE PICTURE ALONE
 * ===========================================================================
 * Every file a buyer attaches to a cart line goes through this before a byte
 * is kept, in this order:
 *
 *   1. its size: none, or over 10 MB, is refused;
 *   2. the central upload check (lib/security/uploads inspectHead, the
 *      `public_image` rules): a program, a script, an HTML page or an SVG
 *      behind a picture's name, the EICAR test file, refused whatever the
 *      name or the declared type says;
 *   3. what the bytes are (lib/storage/file-signature sniff): a JPEG, PNG
 *      or WebP and nothing else. HEIC is refused with its own words;
 *   4. its size in pixels from its header (lib/images/metadata): at least
 *      16 on each side, at most 12000, at most 50 megapixels;
 *   5. DRAWN AGAIN (sharp): decoded, turned upright from its EXIF, and
 *      written out new in the same format. Whatever rode along in the file
 *      (EXIF with its GPS, XMP, comments, a ZIP glued to the end, bytes a
 *      parser would read differently) is not in what comes out. A file sharp
 *      cannot decode is refused. Where sharp is not there, the metadata is
 *      cut from the bytes instead (6) and the log says so;
 *   6. the metadata cut again from the bytes (lib/images/metadata
 *      stripImageMetadata), so even the fallback keeps no location.
 *
 * The bytes decide the type and the extension: a JPEG named photo.png is
 * kept as a JPEG.
 */
import { inspectHead, HEAD_BYTES } from "@/lib/security/uploads/inspect"
import { sniff } from "@/lib/storage/file-signature"
import { readImageSize, stripImageMetadata } from "@/lib/images/metadata"

import { CART_UPLOAD_EXT, CART_UPLOAD_MAX_BYTES, CART_UPLOAD_MAX_EDGE, CART_UPLOAD_MAX_PIXELS, CART_UPLOAD_MIN_EDGE, CART_UPLOAD_TYPES, UPLOAD_ERRORS, type CartUploadType, type UploadErrorCode } from "./rules"

/** A file as a form, a theme's script or a test hands it over. */
export interface IncomingFile {
  name: string
  type: string
  size: number
  bytes: () => Promise<Uint8Array>
}

/** Draws a picture again in its own format with no metadata, or throws when it cannot be decoded. Null: no encoder here. */
export type Reencode = (bytes: Uint8Array, type: CartUploadType) => Promise<Uint8Array | null>

export type CheckedImage =
  | { ok: true; bytes: Uint8Array; type: CartUploadType; ext: string; width: number; height: number; redrawn: boolean }
  | { ok: false; code: UploadErrorCode; error: string }

const no = (code: UploadErrorCode): CheckedImage => ({ ok: false, code, error: UPLOAD_ERRORS[code] })

/** The files a posted form holds, as plain values (a File, or anything with arrayBuffer). */
export function fileOf(v: unknown): IncomingFile | null {
  if (!v || typeof v !== "object" || typeof (v as Blob).arrayBuffer !== "function") return null
  const f = v as File
  return { name: typeof f.name === "string" && f.name ? f.name : "photo", type: f.type || "", size: Number(f.size) || 0, bytes: async () => new Uint8Array(await f.arrayBuffer()) }
}

/** sharp, when the server has it: decoded, upright, the same format written new, the colour profile kept for print. */
export const sharpReencode: Reencode = async (bytes, type) => {
  let sharp: typeof import("sharp") | null = null
  try {
    sharp = ((await import("sharp")) as unknown as { default: typeof import("sharp") }).default
  } catch {
    return null
  }
  const img = sharp(Buffer.from(bytes), { limitInputPixels: CART_UPLOAD_MAX_PIXELS, failOn: "error", animated: false }).rotate()
  const kept = typeof (img as unknown as { keepIccProfile?: () => unknown }).keepIccProfile === "function" ? (img as unknown as { keepIccProfile: () => typeof img }).keepIccProfile() : img
  const out =
    type === "image/jpeg" ? kept.jpeg({ quality: 92, chromaSubsampling: "4:4:4", mozjpeg: true }) : type === "image/png" ? kept.png({ compressionLevel: 9 }) : kept.webp({ quality: 92 })
  return new Uint8Array(await out.toBuffer())
}

export async function checkCartImage(file: IncomingFile, reencode: Reencode = sharpReencode): Promise<CheckedImage> {
  if (!file || file.size <= 0) return no("empty")
  if (file.size > CART_UPLOAD_MAX_BYTES) return no("too_large")
  let raw: Uint8Array
  try {
    raw = await file.bytes()
  } catch {
    return no("unreadable")
  }
  if (raw.byteLength === 0) return no("empty")
  if (raw.byteLength > CART_UPLOAD_MAX_BYTES) return no("too_large")

  const s = sniff(raw.subarray(0, HEAD_BYTES))
  if (s.mime === "image/heic") return no("heic")
  const verdict = inspectHead({ fileName: file.name || "photo", declaredMime: file.type || null, size: raw.byteLength, head: raw.subarray(0, HEAD_BYTES), context: "public_image", maxBytes: CART_UPLOAD_MAX_BYTES })
  if (!verdict.ok) return no("not_image")
  if (!s.mime || !(CART_UPLOAD_TYPES as readonly string[]).includes(s.mime)) return no("not_image")
  const type = s.mime as CartUploadType

  const size = readImageSize(raw)
  if (!size || size.width <= 0 || size.height <= 0) return no("unreadable")
  if (size.width > CART_UPLOAD_MAX_EDGE || size.height > CART_UPLOAD_MAX_EDGE || size.width * size.height > CART_UPLOAD_MAX_PIXELS) return no("too_big_dimensions")
  if (size.width < CART_UPLOAD_MIN_EDGE || size.height < CART_UPLOAD_MIN_EDGE) return no("too_small")

  let bytes = raw
  let redrawn = false
  try {
    const again = await reencode(raw, type)
    if (again) {
      /* What came out is checked as what went in: the same kind of picture, of a size that reads. */
      if (sniff(again.subarray(0, 64)).mime !== type || !readImageSize(again)) return no("unreadable")
      bytes = again
      redrawn = true
    } else {
      console.warn("[cart-uploads] no encoder: metadata cut from the bytes instead")
    }
  } catch {
    return no("unreadable")
  }
  try {
    bytes = stripImageMetadata(bytes)
  } catch {
    if (!redrawn) return no("unreadable")
  }
  const final = readImageSize(bytes) ?? size
  return { ok: true, bytes, type, ext: CART_UPLOAD_EXT[type], width: final.width, height: final.height, redrawn }
}
