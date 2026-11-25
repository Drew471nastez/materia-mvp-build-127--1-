/*
  A PICTURE'S OWN SIZE, READ FROM THE FIRST BYTES OF ITS FILE (PNG, JPEG,
  GIF, WebP). A picture setting became an image object 1600 by 1600 whatever
  the file was, so a theme that writes width and height from it (Materia's
  responsive-image: a footer logo 118 wide) drew a wide logo square. Where
  the engine holds the file's bytes it reads the real size here; null when
  the format is not one of these or the header is cut short.
*/
export function imageSizeOf(bytes: Uint8Array | null | undefined): { width: number; height: number } | null {
  if (!bytes || bytes.length < 24) return null
  const b = bytes
  const u16be = (i: number) => (b[i] << 8) | b[i + 1]
  const u16le = (i: number) => b[i] | (b[i + 1] << 8)
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
  const ok = (w: number, h: number) => (w > 0 && h > 0 ? { width: w, height: h } : null)
  /* PNG: the IHDR chunk. */
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ok(u32be(16), u32be(20))
  /* GIF */
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return ok(u16le(6), u16le(8))
  /* WebP: lossy (VP8), lossless (VP8L) or extended (VP8X). */
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 && b.length >= 30) {
    const kind = String.fromCharCode(b[12], b[13], b[14], b[15])
    if (kind === "VP8 ") return ok(u16le(26) & 0x3fff, u16le(28) & 0x3fff)
    if (kind === "VP8L") return ok(1 + (((b[22] & 0x3f) << 8) | b[21]), 1 + (((b[24] & 0x0f) << 10) | (b[23] << 2) | ((b[22] & 0xc0) >> 6)))
    if (kind === "VP8X") return ok(1 + u24le(24), 1 + u24le(27))
    return null
  }
  /* JPEG: the first start-of-frame marker. */
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1]
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue }
      const len = u16be(i + 2)
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return ok(u16be(i + 7), u16be(i + 5))
      i += 2 + len
    }
  }
  return null
}
