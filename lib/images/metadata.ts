/**
 * ===========================================================================
 *  A PHOTO SHOULD NOT SAY WHERE IT WAS TAKEN
 * ===========================================================================
 * A phone writes the place a photo was taken into the file: GPS latitude and
 * longitude, to a few metres, in the EXIF block, next to the camera model,
 * the time and often the owner's name. A creator's avatar taken at home and
 * uploaded as it came off the phone publishes their home address to anyone
 * who opens the image URL.
 *
 * Re-encoding a picture drops all of that, and lib/images/compress.ts does
 * re-encode in the browser, but not always: a file that would come out bigger,
 * or a browser that cannot decode it, goes up as it was. Those are exactly the
 * files that keep their GPS. This removes the metadata from the bytes directly
 * instead, without decoding or touching a pixel, so it is lossless, fast, and
 * the same code runs in the browser and on the server (no sharp: it is not in
 * the serverless bundle, see app/api/invoice/route.ts).
 *
 * WHAT GOES
 *   JPEG  every APP1 (EXIF, XMP), APP3 to APP13 (maker notes, IPTC), APP15
 *         and comments. APP0 (JFIF), APP2 (the ICC colour profile) and APP14
 *         (Adobe colour transform) stay, because without them colours change.
 *   PNG   eXIf, tEXt, zTXt, iTXt and tIME chunks. iCCP and the rest stay.
 *   WebP  EXIF and XMP chunks, and their flags in VP8X.
 *
 * WHAT STAYS: the orientation. A portrait photo from a phone is stored
 * sideways with an EXIF tag saying "turn me"; drop the tag and the photo is
 * shown on its side. So a JPEG with an orientation other than normal gets a
 * new EXIF block with that one tag and nothing else in it.
 *
 * Anything this does not understand is returned unchanged, never truncated.
 */

export interface ImageSize {
  width: number
  height: number
}

/** Beyond this a picture is not a photo anybody means to show: 50 megapixels. */
export const MAX_IMAGE_PIXELS = 50_000_000
/** And no edge longer than this, whatever the area. */
export const MAX_IMAGE_EDGE = 20_000

function u16be(b: Uint8Array, i: number): number {
  return (b[i] << 8) | b[i + 1]
}
function u32be(b: Uint8Array, i: number): number {
  return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
}
function u16le(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8)
}
function u24le(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
}
function u32le(b: Uint8Array, i: number): number {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)) + ((b[i + 3] << 24) >>> 0)
}

const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
const isPng = (b: Uint8Array) =>
  b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
const isWebp = (b: Uint8Array) =>
  b.length > 16 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
const isGif = (b: Uint8Array) => b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46

/** SOFn markers carry the frame size; C4, C8 and CC are not frames. */
function isSof(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

/** Width and height from the header alone, or null for a format or file this cannot read. */
export function readImageSize(input: Uint8Array | ArrayBuffer): ImageSize | null {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (isPng(b)) return { width: u32be(b, 16), height: u32be(b, 20) }
  if (isGif(b)) return { width: u16le(b, 6), height: u16le(b, 8) }
  if (isWebp(b)) {
    let i = 12
    while (i + 8 <= b.length) {
      const type = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3])
      const size = u32le(b, i + 4)
      const d = i + 8
      if (type === "VP8X" && d + 10 <= b.length) return { width: u24le(b, d + 4) + 1, height: u24le(b, d + 7) + 1 }
      if (type === "VP8 " && d + 10 <= b.length) return { width: u16le(b, d + 6) & 0x3fff, height: u16le(b, d + 8) & 0x3fff }
      if (type === "VP8L" && d + 5 <= b.length && b[d] === 0x2f) {
        const bits = u32le(b, d + 1)
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
      }
      i = d + size + (size & 1)
    }
    return null
  }
  if (isJpeg(b)) {
    let i = 2
    while (i + 4 <= b.length) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]
      if (marker === 0xff) {
        i++
        continue
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2
        continue
      }
      if (marker === 0xd9 || marker === 0xda) return null
      const length = u16be(b, i + 2)
      if (isSof(marker) && i + 9 <= b.length) return { width: u16be(b, i + 7), height: u16be(b, i + 5) }
      i += 2 + length
    }
  }
  return null
}

/** Why a picture of this size is refused, or null. */
export function imageSizeProblem(size: ImageSize | null): string | null {
  if (!size) return null
  if (size.width <= 0 || size.height <= 0) return "That picture could not be read."
  if (size.width > MAX_IMAGE_EDGE || size.height > MAX_IMAGE_EDGE || size.width * size.height > MAX_IMAGE_PIXELS) {
    return "That picture is too large. Use one under 50 megapixels."
  }
  return null
}

/* ------------------------------------------------------------------------- */

/** The EXIF orientation (1 to 8) in an APP1 payload, or 1 when there is none. */
function exifOrientation(b: Uint8Array, start: number, end: number): number {
  // "Exif\0\0"
  if (end - start < 14 || b[start] !== 0x45 || b[start + 1] !== 0x78 || b[start + 2] !== 0x69 || b[start + 3] !== 0x66) return 1
  const t = start + 6
  const little = b[t] === 0x49 && b[t + 1] === 0x49
  const big = b[t] === 0x4d && b[t + 1] === 0x4d
  if (!little && !big) return 1
  const r16 = (i: number) => (little ? u16le(b, i) : u16be(b, i))
  const r32 = (i: number) => (little ? u32le(b, i) : u32be(b, i))
  const ifd = t + r32(t + 4)
  if (ifd + 2 > end) return 1
  const count = r16(ifd)
  for (let n = 0; n < count; n++) {
    const e = ifd + 2 + n * 12
    if (e + 12 > end) break
    if (r16(e) === 0x0112) {
      const value = r16(e + 8)
      return value >= 1 && value <= 8 ? value : 1
    }
  }
  return 1
}

/** An APP1 segment holding one tag, the orientation, and nothing else. */
function orientationSegment(orientation: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xe1, 0x00, 0x22,
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // Exif\0\0
    0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // big endian TIFF, IFD0 at 8
    0x00, 0x01, // one entry
    0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00, // Orientation, SHORT, 1
    0x00, 0x00, 0x00, 0x00, // no next IFD
  ])
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** Markers kept: APP0 JFIF, APP2 ICC profile, APP14 Adobe. Every other APPn and COM goes. */
function keepJpegSegment(marker: number): boolean {
  if (marker === 0xfe) return false
  if (marker >= 0xe0 && marker <= 0xef) return marker === 0xe0 || marker === 0xe2 || marker === 0xee
  return true
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 2)]
  let orientation = 1
  let removed = false
  let insertAt = 1 // after SOI, or after APP0 when there is one
  let i = 2
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return b
    const marker = b[i + 1]
    if (marker === 0xff) {
      parts.push(b.subarray(i, i + 1))
      i++
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(b.subarray(i, i + 2))
      i += 2
      continue
    }
    if (marker === 0xda || marker === 0xd9) {
      // Start of scan: the rest is image data, copied as it is.
      parts.push(b.subarray(i))
      i = b.length
      break
    }
    const length = u16be(b, i + 2)
    const end = i + 2 + length
    if (length < 2 || end > b.length) return b
    if (keepJpegSegment(marker)) {
      parts.push(b.subarray(i, end))
      if (marker === 0xe0 && parts.length === 2) insertAt = 2
    } else {
      removed = true
      if (marker === 0xe1) {
        const o = exifOrientation(b, i + 4, end)
        if (o !== 1) orientation = o
      }
    }
    i = end
  }
  if (i < b.length) parts.push(b.subarray(i))
  if (!removed) return b
  if (orientation !== 1) parts.splice(insertAt, 0, orientationSegment(orientation))
  return concat(parts)
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"])

function stripPng(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 8)]
  let removed = false
  let i = 8
  while (i + 12 <= b.length) {
    const length = u32be(b, i)
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])
    const end = i + 12 + length
    if (end > b.length) return b
    if (PNG_DROP.has(type)) removed = true
    else parts.push(b.subarray(i, end))
    i = end
    if (type === "IEND") break
  }
  if (i < b.length) parts.push(b.subarray(i))
  return removed ? concat(parts) : b
}

function stripWebp(b: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  let removed = false
  let i = 12
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3])
    const size = u32le(b, i + 4)
    const end = i + 8 + size + (size & 1)
    if (i + 8 + size > b.length) return b
    if (type === "EXIF" || type === "XMP ") {
      removed = true
    } else if (type === "VP8X") {
      const copy = b.slice(i, Math.min(end, b.length))
      copy[8] &= ~(0x08 | 0x04) // EXIF and XMP flags
      chunks.push(copy)
    } else {
      chunks.push(b.subarray(i, Math.min(end, b.length)))
    }
    i = end
  }
  if (!removed) return b
  const body = concat(chunks)
  const header = new Uint8Array(12)
  header.set(b.subarray(0, 12))
  const riffSize = body.length + 4
  header[4] = riffSize & 0xff
  header[5] = (riffSize >>> 8) & 0xff
  header[6] = (riffSize >>> 16) & 0xff
  header[7] = (riffSize >>> 24) & 0xff
  return concat([header, body])
}

/**
 * The same picture without its metadata. Returns the input itself when there
 * was nothing to remove or the format is one this does not handle.
 */
export function stripImageMetadata(input: Uint8Array | ArrayBuffer): Uint8Array {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input)
  try {
    if (isJpeg(b)) return stripJpeg(b)
    if (isPng(b)) return stripPng(b)
    if (isWebp(b)) return stripWebp(b)
  } catch {
    /* A file this cannot walk goes as it came, rather than broken. */
  }
  return b
}

/** Whether a picture still carries location or camera metadata this would remove. */
export function hasImageMetadata(input: Uint8Array | ArrayBuffer): boolean {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input)
  const stripped = stripImageMetadata(b)
  if (stripped === b) return false
  // An orientation-only block is what stripping leaves behind on purpose.
  return stripImageMetadata(stripped).length === stripped.length && stripped.length !== b.length
}
