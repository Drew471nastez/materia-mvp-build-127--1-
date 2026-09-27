/**
 * ===========================================================================
 *  A PICTURE MADE FOR AN INBOX
 * ===========================================================================
 * Email pictures used to go through the site's Next image endpoint, which
 * answers each client with the format it asks for. Outlook on Windows asks
 * for anything, so it was handed a JPEG, and a JPEG has no transparency: a
 * see-through logo or a cutout product shot arrived on a black square. Its
 * quality was also set low (75) to keep that JPEG under the upload.
 *
 * /api/email/img answers every inbox with the same file, chosen by the
 * picture itself:
 *
 *   ANY TRANSPARENCY  a PNG that keeps it, so the logo sits on the email's
 *                     own background in every client, dark mode included
 *   OPAQUE            a JPEG at quality 86 (mozjpeg, progressive), with full
 *                     colour detail (4:4:4) below 400px so small text in a
 *                     logo or a product shot stays sharp
 *
 * The file is 3x the drawn width for small pictures (avatars, logos,
 * thumbnails up to 64px, which a phone draws at three device pixels each) and
 * 2x above that, from a fixed set of widths so the CDN keeps one copy of each,
 * never larger than the upload, resized with Lanczos. Formats every mail
 * client shows: no WebP, no AVIF, no SVG.
 *
 * Only pictures on the hosts the site's own image endpoint takes are resized
 * here (Supabase storage and the stock libraries in lib/images/optimized-url);
 * they are fetched through fetchPublic, which refuses private addresses at
 * connect time. Pure apart from the fetch and sharp, which the route does.
 */
import { isOptimizableImage } from "@/lib/images/optimized-url"

export const INBOX_IMAGE_PATH = "/api/email/img"

/** The widths the route makes. Anything else is refused, so the CDN holds a bounded set per picture. */
export const INBOX_WIDTHS = [64, 96, 128, 192, 256, 320, 400, 480, 640, 800, 1080, 1200] as const

/** Opaque pictures: JPEG quality, and full colour detail below this width. */
export const INBOX_JPEG_QUALITY = 86
export const INBOX_FULL_CHROMA_BELOW = 400

/** How many file pixels per drawn pixel: 3 for the small marks a phone draws at 3x, 2 above. */
export function inboxDensity(drawnWidth: number): number {
  return drawnWidth <= 64 ? 3 : 2
}

/** The width the file is made at for a picture drawn this wide. */
export function inboxWidthFor(drawnWidth: number): number {
  const target = Math.ceil(Math.max(1, drawnWidth) * inboxDensity(drawnWidth))
  return INBOX_WIDTHS.find((w) => w >= target) ?? INBOX_WIDTHS[INBOX_WIDTHS.length - 1]
}

/** Whether this route resizes the picture at all: an absolute https address on a host the site's resizer takes. */
export function inboxResizable(src: string): boolean {
  if (!/^https:\/\//i.test(src)) return false
  return isOptimizableImage(src)
}

/** The address of the resized picture, made absolute on `origin`. Null when this route does not take it. */
export function inboxImageUrl(origin: string, src: string, drawnWidth: number): string | null {
  if (!inboxResizable(src)) return null
  const w = inboxWidthFor(drawnWidth)
  return `${origin.replace(/\/$/, "")}${INBOX_IMAGE_PATH}?u=${encodeURIComponent(src)}&w=${w}`
}

export type InboxRequest = { ok: true; src: string; width: number } | { ok: false; status: 400; reason: string }

/** A request to the route, checked: a resizable address and one of the widths. */
export function readInboxRequest(params: URLSearchParams): InboxRequest {
  const src = params.get("u") ?? ""
  const width = Number(params.get("w"))
  if (!src || src.length > 2048) return { ok: false, status: 400, reason: "no picture address" }
  if (!inboxResizable(src)) return { ok: false, status: 400, reason: "not a picture this route resizes" }
  if (/\.svgz?(\?|#|$)/i.test(new URL(src).pathname)) return { ok: false, status: 400, reason: "an SVG is not resized" }
  if (!(INBOX_WIDTHS as readonly number[]).includes(width)) return { ok: false, status: 400, reason: "not one of the widths" }
  return { ok: true, src, width }
}

/** The format a picture is sent in: PNG when any pixel is see-through, else JPEG. */
export function inboxFormat(hasTransparency: boolean): "png" | "jpeg" {
  return hasTransparency ? "png" : "jpeg"
}
