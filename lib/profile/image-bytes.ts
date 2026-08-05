import "server-only"

/**
 * What an upload actually IS, rather than what it says it is.
 *
 * `file.type` is a label the client wrote and a hand-built request can put
 * anything in it. The leading bytes are the part nobody can relabel, which is
 * why every platform that hosts user images reads them — and it matters most
 * for the two images here, because a profile picture and a cover are served
 * back from our own origin on pages anybody can open. A file that is not the
 * picture it claims to be is a file we would be hosting under our name.
 *
 * Written once and shared, deliberately. This routine also exists inline in
 * /api/messages/:id/image, and there is exactly one reason two copies of "is
 * this an image" is a bad idea: the day they disagree, one of them is wrong and
 * nothing says which.
 */

export function sniffImage(b: Uint8Array): string | null {
  if (b.length < 12) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png"
  const ascii = (i: number, s: string) => String.fromCharCode(...b.slice(i, i + s.length)) === s
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp"
  if (ascii(4, "ftyp")) {
    const brand = String.fromCharCode(...b.slice(8, 12))
    if (/^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand)) return "image/heic"
    if (brand === "avif") return "image/avif"
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif"
  return null
}

export function extensionForImage(type: string): string {
  if (type === "image/png") return "png"
  if (type === "image/webp") return "webp"
  if (type === "image/avif") return "avif"
  if (type === "image/gif") return "gif"
  if (type === "image/heic") return "heic"
  return "jpg"
}
