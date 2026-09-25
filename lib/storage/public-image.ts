/**
 * ===========================================================================
 *  A PICTURE THAT IS ALLOWED TO BE PUBLIC
 * ===========================================================================
 * Every server route that puts a picture in a public bucket passes its bytes
 * through here first, so the rules are the same everywhere:
 *
 *   1. The bytes are a raster picture (lib/storage/file-signature.ts). Not the
 *      name, not the declared type: an HTML page called photo.jpg is refused,
 *      and so is every SVG.
 *   2. It is not larger than anybody means a picture to be: 25 MB on disk, 50
 *      megapixels decoded. The second limit is the one that matters for a
 *      decompression bomb, a small file that decodes to gigabytes.
 *   3. Its location, camera and owner metadata is removed
 *      (lib/images/metadata.ts), keeping only the orientation.
 *   4. It is stored under a name and a Content-Type chosen from the bytes.
 *
 * Pure: no storage, no network, so tests can run it on real files.
 */
import { imageSizeProblem, readImageSize, stripImageMetadata, type ImageSize } from "@/lib/images/metadata"
import { isPublicImage } from "./file-signature"

/** The largest picture a public bucket takes through the server. */
export const PUBLIC_IMAGE_MAX_BYTES = 25 * 1024 * 1024

export type PublicImageResult =
  | { ok: true; bytes: Uint8Array; mime: string; ext: string; size: ImageSize | null; stripped: boolean }
  | { ok: false; error: string; status: number }

export function preparePublicImage(input: Uint8Array | ArrayBuffer, maxBytes = PUBLIC_IMAGE_MAX_BYTES): PublicImageResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length === 0) return { ok: false, error: "That file is empty.", status: 400 }
  if (bytes.length > maxBytes) {
    return { ok: false, error: `That picture is over ${Math.round(maxBytes / (1024 * 1024))} MB. Choose a smaller one.`, status: 413 }
  }
  const kind = isPublicImage(bytes)
  if (!kind || !kind.mime || !kind.ext) {
    return { ok: false, error: "That file is not a picture. Use a JPEG, PNG, WebP, GIF or AVIF.", status: 415 }
  }
  const size = readImageSize(bytes)
  const tooBig = imageSizeProblem(size)
  if (tooBig) return { ok: false, error: tooBig, status: 413 }
  const clean = stripImageMetadata(bytes)
  return { ok: true, bytes: clean, mime: kind.mime, ext: kind.ext, size, stripped: clean !== bytes }
}
