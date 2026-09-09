/**
 * The snapshot route's rules, kept out of the route file so a test can import
 * them (a Next route module may only export handlers) and so the editor and
 * the page agree on the limits.
 */

export const SNAPSHOT_BUCKET = "store-builder-images"
export const MAX_BYTES = 2 * 1024 * 1024
export const SNAPSHOT_TYPES: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
}

/**
 * The object path of the install's current snapshot, if it was written by
 * this route — the URL must sit under this user's own snapshot folder for the
 * install. Anything else (an older layout, a hand-edited row) is left alone.
 */
export function previousSnapshotPath(
  install: { snapshot_url?: string | null },
  userId: string,
  installId: string,
): string | null {
  const url = typeof install.snapshot_url === "string" ? install.snapshot_url : ""
  const marker = `/object/public/${SNAPSHOT_BUCKET}/`
  const at = url.indexOf(marker)
  if (at === -1) return null
  const path = decodeURIComponent(url.slice(at + marker.length).split("?")[0])
  const prefix = `${userId}/theme-snapshots/${installId}/`
  if (!path.startsWith(prefix)) return null
  const rest = path.slice(prefix.length)
  if (!/^[a-z0-9]+\.(webp|png|jpg)$/.test(rest)) return null
  return path
}

/** Magic bytes, because a content-type header is a claim, not a fact. */
export function looksLikeImage(bytes: Uint8Array, contentType: string): boolean {
  if (bytes.byteLength < 12) return false
  const b = bytes
  if (contentType === "image/png") {
    return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
  }
  if (contentType === "image/jpeg") {
    return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  }
  if (contentType === "image/webp") {
    return (
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
    )
  }
  return false
}
