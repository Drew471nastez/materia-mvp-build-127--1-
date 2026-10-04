import { toStorageUrl } from "@/lib/storage/media-url"
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
  const url = typeof install.snapshot_url === "string" ? toStorageUrl(install.snapshot_url) : ""
  const marker = `/object/public/${SNAPSHOT_BUCKET}/`
  const at = url.indexOf(marker)
  if (at === -1) return null
  const path = decodeURIComponent(url.slice(at + marker.length).split("?")[0])
  const prefix = `${userId}/theme-snapshots/${installId}/`
  if (!path.startsWith(prefix)) return null
  const rest = path.slice(prefix.length)
  if (!/^[a-z0-9]+(\.v\d+)?(\.m)?\.(webp|png|jpg)$/.test(rest)) return null
  return path
}

/**
 * ===========================================================================
 *  THE FOLDER IS THE RECORD, THE COLUMN IS A SHORTCUT TO IT
 * ===========================================================================
 * The cover was only ever found through `store_theme_installs.snapshot_url`.
 * When that column is missing from the database the route uploads the
 * picture, fails to record it, and answers 200 with `stored: false` — so
 * production logged seventeen successful snapshots in a week for one site
 * while its cover went on showing the theme's stock artwork, because nothing
 * pointed at any of them.
 *
 * Every snapshot is written under one folder per install, named for the
 * moment it was taken. So the folder can answer "which is the newest" on its
 * own, and the column becomes what it should have been: a way to skip asking.
 */
export function snapshotFolder(userId: string, installId: string): string {
  return `${userId}/theme-snapshots/${installId}`
}

/**
 * ===========================================================================
 *  WHICH PICTURES ARE WORTH SHOWING
 * ===========================================================================
 * Every cover taken before version 2 is wrong, and not occasionally: the
 * capture copied the page's stylesheets into the picture, the theme's
 * section entrance animation replayed inside it from `opacity: 0`, and
 * `animations_enabled` is on by default. So those pictures are the header
 * over a blank page. Showing one would be worse than the theme's drawn
 * stand-in, so they are never shown, and the route clears them out.
 *
 * A date would not do as the line between the two. An editor tab left open
 * across the deploy is still running the old capture, and would go on
 * uploading blank covers after any date anybody picked. So the version is
 * sent BY THE CAPTURE (`X-Snapshot-Version`), the route refuses anything
 * without the current one, and it is written into the name, so a picture
 * says which code took it.
 */
export const SNAPSHOT_VERSION = 3
/** The oldest version whose pictures are still worth showing. Version 2 was
    the in-browser capture after its blank-page fault was fixed. */
export const OLDEST_SHOWN_VERSION = 2

/**
 * Any name this code has written: a base-36 timestamp, a version, an
 * optional `.m` for the phone picture, and an extension. The captures before
 * versioning had no version and are never shown.
 *
 * VERSION 3 IS TAKEN ON THE SERVER. A real Chromium opens the saved home
 * page, as a visitor's browser would, and photographs it twice: at desktop
 * width, and at a phone's. Both land under one timestamp, so the card can
 * always pair a desktop picture with the phone picture from the same save.
 */
const SNAPSHOT_NAME = /^([a-z0-9]+)(?:\.v(\d+))?(\.m)?\.(webp|png|jpg)$/

function parseName(name: string): { at: number; version: number; mobile: boolean; stamp: string } | null {
  const m = SNAPSHOT_NAME.exec(name)
  if (!m) return null
  const at = Number.parseInt(m[1], 36)
  if (!Number.isFinite(at)) return null
  return { at, version: m[2] ? Number(m[2]) : 1, mobile: !!m[3], stamp: m[1] }
}

/** The name a picture at this version is stored under. */
export function snapshotName(stamp: string, ext: string, mobile = false): string {
  return `${stamp}.v${SNAPSHOT_VERSION}${mobile ? ".m" : ""}.${ext}`
}

/** The phone picture taken alongside a desktop one, if it is in `names`. */
export function mobilePartner(desktop: string, names: string[]): string | null {
  const d = parseName(desktop)
  if (!d || d.mobile) return null
  return names.find((n) => {
    const p = parseName(n)
    return !!p && p.mobile && p.stamp === d.stamp && p.version === d.version
  }) ?? null
}

/**
 * The CURRENT pictures in a snapshot folder, newest first — the ones that
 * may be shown. Anything this route did not write, and anything taken by a
 * capture older than SNAPSHOT_VERSION, is left out. Ordered by the time in
 * the NAME, which the code that took the picture set, rather than by the
 * listing's order.
 */
export function snapshotsNewestFirst(names: string[]): string[] {
  return names
    .map((name) => ({ name, parsed: parseName(name) }))
    .filter((f) => f.parsed !== null && !f.parsed.mobile && f.parsed.version >= OLDEST_SHOWN_VERSION)
    .sort((a, b) => b.parsed!.at - a.parsed!.at || b.parsed!.version - a.parsed!.version)
    .map((f) => f.name)
}

/**
 * What a folder can do without: every picture this code wrote except the
 * newest SNAPSHOTS_KEPT covers and their phone pictures — which includes
 * every picture from before versioning, since none of those is ever shown.
 */
export function staleSnapshots(names: string[]): string[] {
  const keep = new Set<string>()
  for (const desktop of snapshotsNewestFirst(names).slice(0, SNAPSHOTS_KEPT)) {
    keep.add(desktop)
    const phone = mobilePartner(desktop, names)
    if (phone) keep.add(phone)
  }
  return names.filter((name) => parseName(name) !== null && !keep.has(name))
}

/** Whether a stored cover URL points at a picture worth showing. */
export function isCurrentSnapshotUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const file = url.split("?")[0].split("/").pop() ?? ""
  const parsed = parseName(decodeURIComponent(file))
  return parsed !== null && !parsed.mobile && parsed.version >= OLDEST_SHOWN_VERSION
}

/**
 * When the name says the picture was taken, as an ISO date — the card's
 * "Edited 3m ago" reads it when there is no column to read instead.
 */
export function snapshotTakenAt(name: string): string | null {
  const parsed = parseName(name)
  return parsed ? new Date(parsed.at).toISOString() : null
}

/**
 * How many pictures a folder keeps. Two rather than one: two saves a few
 * seconds apart can upload out of order, and pruning to exactly one could
 * delete the picture the other request is about to point at.
 */
export const SNAPSHOTS_KEPT = 2

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
