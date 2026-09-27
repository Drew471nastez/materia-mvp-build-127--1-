/**
 * ===========================================================================
 *  THE PICTURES THE SHARE IMAGE IS DRAWN WITH, FETCHED CAREFULLY
 * ===========================================================================
 * The share image (app/(marketing)/[sellername]/links/share.png) draws the
 * page's photo, its background photo or the picture the creator uploaded.
 * Those addresses are the creator's to set, so the server never fetches one
 * blindly: https only, a real host name (no IP address, no localhost), every
 * redirect checked the same way, a few seconds at most and a few megabytes at
 * most. What comes back is read for its size and kind; next/og draws PNG,
 * JPEG and GIF, and anything else is answered with null so the caller draws
 * without it (initials for a photo, the plain colour for a background).
 */
import "server-only"
import { PROFILE_IMAGE_SIZE, safeImageUrl } from "@/lib/onepage/seo"
import { fetchPublic } from "@/lib/api/public-fetch"

export interface CardImage {
  dataUrl: string
  width: number
  height: number
  mime: "image/png" | "image/jpeg" | "image/gif"
}

/** The pixel size and kind of a PNG, JPEG or GIF, from its first bytes. Null for anything else. */
export function imageInfo(buf: Uint8Array): { width: number; height: number; mime: CardImage["mime"] } | null {
  const u16be = (i: number) => (buf[i] << 8) | buf[i + 1]
  const u32be = (i: number) => ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: u32be(16), height: u32be(20), mime: "image/png" }
  }
  if (buf.length > 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: buf[6] | (buf[7] << 8), height: buf[8] | (buf[9] << 8), mime: "image/gif" }
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++
        continue
      }
      const marker = buf[i + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2
        continue
      }
      const length = u16be(i + 2)
      /* A start of frame: baseline, progressive, and the rarer kinds, never the huffman or arithmetic tables. */
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: u16be(i + 5), width: u16be(i + 7), mime: "image/jpeg" }
      }
      i += 2 + length
    }
  }
  return null
}

/**
 * The picture at `url`, ready for next/og, or null when it is not one it can
 * draw or it could not be fetched in time. Never throws.
 */
export async function fetchCardImage(url: string | null | undefined, { maxBytes = 6 * 1024 * 1024, timeoutMs = 3500 }: { maxBytes?: number; timeoutMs?: number } = {}): Promise<CardImage | null> {
  const buf = await fetchImageBytes(url, { maxBytes, timeoutMs })
  if (!buf) return null
  const info = imageInfo(buf)
  if (!info || !info.width || !info.height) return null
  return { ...info, dataUrl: `data:${info.mime};base64,${Buffer.from(buf).toString("base64")}` }
}

/**
 * The bytes at `url`, fetched the same careful way, whatever kind of picture
 * they are (the profile photo is read by sharp, which reads WebP and AVIF
 * too), or null. Never throws.
 */
export async function fetchImageBytes(url: string | null | undefined, { maxBytes = 6 * 1024 * 1024, timeoutMs = 3500 }: { maxBytes?: number; timeoutMs?: number } = {}): Promise<Uint8Array | null> {
  const first = safeImageUrl(url)
  if (!first) return null
  try {
    /*
      THROUGH THE PLATFORM'S PUBLIC FETCH (lib/api/public-fetch), not a plain
      fetch. A creator chooses this address, and the server asks it: a plain
      fetch checks the name once and connects to whatever it answers next, so
      a name that answers public to the check and private to the request
      (DNS rebinding) would reach inside the network. fetchPublic refuses a
      private address at the moment of connecting, and on every redirect,
      with the size and time caps held for the whole request.
    */
    const res = await fetchPublic(first, { maxBytes, timeoutMs, maxRedirects: 3 })
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > maxBytes) return null
    return buf
  } catch {
    return null
  }
}

/**
 * THE PROFILE PHOTO AS A SHARED LINK SHOWS IT: a square JPEG, `size` pixels
 * a side, cut from the middle as the page's round photo is, turned the way
 * the camera held it (EXIF), on white where it was transparent. Any picture
 * sharp reads (JPEG, PNG, GIF, WebP, AVIF) goes in; what comes out is small
 * enough for WhatsApp's preview and one kind every app reads. Null when it
 * cannot be read. Never throws.
 */
export async function squarePhoto(bytes: Uint8Array, size = PROFILE_IMAGE_SIZE): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import("sharp")
    return await sharp(bytes, { failOn: "none", limitInputPixels: 50_000_000 })
      .rotate()
      .resize(size, size, { fit: "cover", position: "centre" })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer()
  } catch {
    return null
  }
}
