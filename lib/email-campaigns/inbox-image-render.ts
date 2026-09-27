/**
 * The picture itself, for /api/email/img (./inbox-image says why): resized
 * with Lanczos to `width` (never enlarged), turned upright from its EXIF,
 * then a PNG that keeps transparency when any pixel is see-through, else a
 * JPEG at quality 86 with full colour detail on small pictures. Server only
 * (sharp); tests/email-inbox-image.test.ts runs it on real pictures.
 */
import "server-only"
import sharp from "sharp"

import { INBOX_FULL_CHROMA_BELOW, INBOX_JPEG_QUALITY, inboxFormat } from "./inbox-image"

const LIMIT = 60_000_000

export async function renderInboxImage(input: Buffer, width: number): Promise<{ body: Buffer; type: "image/png" | "image/jpeg" }> {
  const base = sharp(input, { limitInputPixels: LIMIT, animated: false })
    .rotate()
    .resize({ width, withoutEnlargement: true, kernel: "lanczos3" })
  const meta = await sharp(input, { limitInputPixels: LIMIT }).metadata()
  const transparent = meta.hasAlpha ? !(await base.clone().stats()).isOpaque : false
  if (inboxFormat(transparent) === "png") {
    return { body: await base.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(), type: "image/png" }
  }
  const body = await base
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: INBOX_JPEG_QUALITY, mozjpeg: true, progressive: true, chromaSubsampling: width < INBOX_FULL_CHROMA_BELOW ? "4:4:4" : "4:2:0" })
    .toBuffer()
  return { body, type: "image/jpeg" }
}
