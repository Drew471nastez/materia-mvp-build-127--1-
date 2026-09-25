/**
 * ===========================================================================
 *  HOW BIG A PICTURE IS, READ FROM ITS OWN HEADER
 * ===========================================================================
 * A screenshot's shape says what it is before anybody looks at it: 1440 by
 * 900 is a desktop page, 390 by 844 a phone, 1440 by 9000 a whole page
 * scrolled end to end. The model is told, so it builds the phone layout from
 * a phone screenshot and knows a full page has to be split into sections.
 *
 * And it is a limit. The composer shrinks a picture to LONG_EDGE before
 * sending it (components/website-builder/theme-chat.tsx), but the route
 * takes whatever it is sent, so the server reads the size too: a picture
 * whose header claims absurd dimensions is refused rather than handed to a
 * model, and a very tall one is flagged, because shrunk to fit it becomes a
 * strip whose text nobody can read, and the honest move then is to ask.
 *
 * Pure and dependency free (no Buffer), so the browser, the route and the
 * tests all use the same reading. Only the header is decoded.
 */

export interface ImageInfo {
  width: number
  height: number
  /** What the shape suggests it is a picture of. */
  shape: "phone" | "desktop" | "square" | "tall page" | "wide strip"
}

/** Larger than any screen that exists: a header that says more is lying. */
export const MAX_IMAGE_SIDE = 16_384

/** How much of the file is decoded to find a JPEG's size, past its metadata. */
const HEAD_BYTES = 256 * 1024

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const LOOKUP = (() => {
  const t = new Int16Array(128).fill(-1)
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i
  return t
})()

/** The first `max` bytes of a base64 string. */
export function decodeHead(base64: string, max = HEAD_BYTES): Uint8Array {
  const chars = Math.min(base64.length, Math.ceil(max / 3) * 4)
  const out = new Uint8Array(Math.floor((chars * 3) / 4))
  let o = 0
  let buf = 0
  let bits = 0
  for (let i = 0; i < chars; i++) {
    const c = base64.charCodeAt(i)
    if (c === 61) break // "="
    const v = c < 128 ? LOOKUP[c] : -1
    if (v < 0) continue
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buf >> bits) & 0xff
    }
  }
  return out.subarray(0, o)
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1]
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8)
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)

function size(b: Uint8Array, mediaType: string): { width: number; height: number } | null {
  if (mediaType === "image/png") {
    if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null
    return { width: u32be(b, 16), height: u32be(b, 20) }
  }
  if (mediaType === "image/gif") {
    if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49) return null
    return { width: u16le(b, 6), height: u16le(b, 8) }
  }
  if (mediaType === "image/webp") {
    if (b.length < 30 || b[0] !== 0x52 || b[8] !== 0x57) return null
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (chunk === "VP8 ") return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff }
    if (chunk === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 }
    return null
  }
  if (mediaType === "image/jpeg") {
    if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++
        continue
      }
      const marker = b[i + 1]
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2
        continue
      }
      const length = u16be(b, i + 2)
      /* Start of frame, any kind but the three that are not frames. */
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: u16be(b, i + 7), height: u16be(b, i + 5) }
      }
      if (length < 2) return null
      i += 2 + length
    }
    return null
  }
  return null
}

function shapeOf(width: number, height: number): ImageInfo["shape"] {
  const ratio = height / width
  if (ratio >= 3) return "tall page"
  if (ratio <= 1 / 3) return "wide strip"
  if (ratio >= 1.4 && width <= 1100) return "phone"
  if (ratio > 0.8 && ratio < 1.25) return "square"
  return width >= height ? "desktop" : "phone"
}

/** The picture's size and shape, or null when its header cannot be read. */
export function imageInfo(image: { mediaType: string; data: string }): ImageInfo | null {
  try {
    const found = size(decodeHead(image.data), image.mediaType)
    if (!found || !(found.width > 0) || !(found.height > 0)) return null
    return { ...found, shape: shapeOf(found.width, found.height) }
  } catch {
    return null
  }
}
