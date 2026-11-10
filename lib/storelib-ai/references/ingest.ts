/**
 * ===========================================================================
 *  AN UPLOADED SCREENSHOT, CHECKED AND MADE INTO ANALYSIS PICTURES
 * ===========================================================================
 * Spec 2.5, steps 1 to 3, for one picture the admin uploads:
 *
 *   1. size (at most 4 MB: the platform's request limit is 4.5 MB), the
 *      central upload check (inspectHead, public_image: no program, script,
 *      HTML or SVG behind a picture's name), what the bytes really are (PNG,
 *      JPEG or WebP only), and its pixel size from its header;
 *   2. DRAWN AGAIN by sharp, so nothing that rode along (EXIF with GPS,
 *      comments, appended bytes) is kept, into:
 *        original  the picture re-encoded, for the admin's preview;
 *        view      the top of the page (a full page capture is cut to its
 *                  first 1.6 widths), at most 1568px on its long edge: the
 *                  picture the agent is shown at generation time;
 *        page      the whole page scaled to 1568px tall, only for a tall
 *                  capture: the second picture of the analysis;
 *   3. a SHA-256 of the ORIGINAL bytes as sent: the same file twice is the
 *      same reference (dedup).
 *
 * Nothing here fetches anything: a picture arrives as bytes from the admin's
 * own browser; a URL the admin types is a note.
 *
 * The transformer is passed in so tests run without sharp.
 */
import { createHash } from "node:crypto"

import { inspectHead, HEAD_BYTES } from "@/lib/security/uploads/inspect"
import { sniff } from "@/lib/storage/file-signature"
import { readImageSize } from "@/lib/images/metadata"

export const REFERENCE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024
export const REFERENCE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export type ReferenceImageType = (typeof REFERENCE_TYPES)[number]
/** The long edge the agent and the analysis see (Anthropic scales larger pictures down anyway). */
export const VIEW_LONG_EDGE = 1568
/** A full page capture longer than this many widths is cut to its top for the view. */
export const TALL_RATIO = 1.6
export const MIN_EDGE = 200
export const MAX_EDGE = 20_000
/** The agent-facing picture must stay under what one provider image may be. */
export const VIEW_MAX_BYTES = 1_500_000

export interface Derivatives {
  original: Uint8Array
  view: Uint8Array
  page: Uint8Array | null
  width: number
  height: number
}

/** Makes the three pictures. Throws when the picture cannot be decoded. */
export type ImageTransformer = (bytes: Uint8Array, info: { width: number; height: number; type: ReferenceImageType }) => Promise<Derivatives>

export type CheckedReference =
  | { ok: true; sha256: string; type: ReferenceImageType; width: number; height: number; derivatives: Derivatives }
  | { ok: false; status: number; error: string }

const no = (status: number, error: string): CheckedReference => ({ ok: false, status, error })

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export async function checkReferenceImage(file: { name: string; type: string; bytes: Uint8Array }, transform: ImageTransformer): Promise<CheckedReference> {
  const raw = file.bytes
  if (!raw.byteLength) return no(400, "No picture arrived.")
  if (raw.byteLength > REFERENCE_UPLOAD_MAX_BYTES) return no(413, "Pictures can be up to 4 MB. Save the screenshot as JPEG or WebP.")
  const verdict = inspectHead({ fileName: file.name || "reference", declaredMime: file.type || null, size: raw.byteLength, head: raw.subarray(0, HEAD_BYTES), context: "public_image", maxBytes: REFERENCE_UPLOAD_MAX_BYTES })
  if (!verdict.ok) return no(400, "That file is not a picture.")
  const mime = sniff(raw.subarray(0, HEAD_BYTES)).mime
  if (!mime || !(REFERENCE_TYPES as readonly string[]).includes(mime)) return no(400, "Use a PNG, JPEG or WebP screenshot.")
  const size = readImageSize(raw)
  if (!size || size.width < MIN_EDGE || size.height < MIN_EDGE) return no(400, "That picture is too small to learn from.")
  if (size.width > MAX_EDGE || size.height > MAX_EDGE) return no(400, "That picture is larger than any page. Capture at most 20,000 pixels tall.")
  let derivatives: Derivatives
  try {
    derivatives = await transform(raw, { width: size.width, height: size.height, type: mime as ReferenceImageType })
  } catch {
    return no(400, "That picture could not be read.")
  }
  /* What came out is checked as what went in: real pictures of a size that reads. */
  for (const part of [derivatives.original, derivatives.view, ...(derivatives.page ? [derivatives.page] : [])]) {
    const s = sniff(part.subarray(0, 64)).mime
    if (!s || !(REFERENCE_TYPES as readonly string[]).includes(s) || !readImageSize(part)) return no(400, "That picture could not be read.")
  }
  if (derivatives.view.byteLength > VIEW_MAX_BYTES) return no(400, "That picture is too detailed to send to the AI. Try a smaller capture.")
  return { ok: true, sha256: sha256Hex(raw), type: mime as ReferenceImageType, width: size.width, height: size.height, derivatives }
}

/** sharp on the server: re-encoded without metadata; the view cut to the top of a tall page. */
export const sharpTransformer: ImageTransformer = async (bytes, info) => {
  const sharp = ((await import("sharp")) as unknown as { default: typeof import("sharp") }).default
  const load = () => sharp(Buffer.from(bytes), { limitInputPixels: 120_000_000, failOn: "error", animated: false }).rotate()
  const original = new Uint8Array(await load().jpeg({ quality: 88, mozjpeg: true }).toBuffer())
  const tall = info.height > info.width * TALL_RATIO
  const cropH = tall ? Math.round(info.width * TALL_RATIO) : info.height
  const view = new Uint8Array(
    await load()
      .extract({ left: 0, top: 0, width: info.width, height: cropH })
      .resize({ width: VIEW_LONG_EDGE, height: VIEW_LONG_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer(),
  )
  const page = tall ? new Uint8Array(await load().resize({ height: VIEW_LONG_EDGE, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75, mozjpeg: true }).toBuffer()) : null
  return { original, view, page, width: info.width, height: info.height }
}

/** Base64 of bytes, without Buffer assumptions leaking into callers. */
export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64")
}
