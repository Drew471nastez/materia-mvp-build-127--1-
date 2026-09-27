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
import { safeImageUrl } from "@/lib/onepage/seo"

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
export async function fetchCardImage(url: string | null | undefined, { maxBytes = 6 * 1024 * 1024, timeoutMs = 3500 } = {}): Promise<CardImage | null> {
  let next = safeImageUrl(url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    for (let hop = 0; hop < 3 && next; hop++) {
      const res = await fetch(next, { redirect: "manual", signal: controller.signal, headers: { accept: "image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5" } })
      if (res.status >= 300 && res.status < 400) {
        const to = res.headers.get("location")
        next = to ? safeImageUrl(new URL(to, next).toString()) : null
        continue
      }
      if (!res.ok || !res.body) return null
      const declared = Number(res.headers.get("content-length") || 0)
      if (declared > maxBytes) return null
      const reader = res.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel().catch(() => {})
          return null
        }
        chunks.push(value)
      }
      const buf = new Uint8Array(total)
      let at = 0
      for (const c of chunks) {
        buf.set(c, at)
        at += c.byteLength
      }
      const info = imageInfo(buf)
      if (!info || !info.width || !info.height) return null
      return { ...info, dataUrl: `data:${info.mime};base64,${Buffer.from(buf).toString("base64")}` }
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
