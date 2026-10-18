/**
 * ===========================================================================
 *  WHAT A MARKETPLACE THEME ZIP MAY HOLD
 * ===========================================================================
 * The admin uploads a theme for every creator to add, so its zip is held to
 * rules written out here, on top of the central archive check every upload
 * gets (lib/security/uploads, context "theme_package") and the import
 * pipeline's own parse. Each entry's name is read, never unpacked to a disk,
 * and nothing in it is run on the server.
 *
 *   size      the import's own ceiling (IMPORT_MAX_BYTES, 50 MB)
 *   count     at most MAX_THEME_ZIP_FILES entries
 *   names     no "..", no absolute path, no drive letter, no backslash, no
 *             control character
 *   links     no symbolic link (a zip can carry one in its Unix mode bits)
 *   kinds     only the extensions a theme is made of
 *
 * Pure, so tests/theme-marketplace.test.ts runs it without a server.
 */
import { IMPORT_MAX_BYTES, IMPORT_TOO_LARGE } from "@/lib/website-builder/theme-import"

export const MAX_THEME_ZIP_BYTES = IMPORT_MAX_BYTES
export const MAX_THEME_ZIP_FILES = 3000

/** Text a theme is written in, and the pictures, fonts and videos it ships. */
export const THEME_ZIP_EXTENSIONS: ReadonlySet<string> = new Set([
  "storelib", "liquid", "json", "css", "scss", "js", "md", "txt", "yml", "yaml", "svg",
  "png", "jpg", "jpeg", "gif", "webp", "avif", "ico",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp4", "webm", "mov",
])

export interface ZipEntryInfo {
  name: string
  dir: boolean
  /** The Unix mode bits a zip made on a Mac or Linux records, when present. */
  unixPermissions?: number | null
}

export type ZipRuleResult = { ok: true; files: number } | { ok: false; error: string }

const S_IFMT = 0o170000
const S_IFLNK = 0o120000

export function isSymlinkMode(mode: number | null | undefined): boolean {
  return typeof mode === "number" && (mode & S_IFMT) === S_IFLNK
}

/** A name that would leave the folder it is read into, or that names a place on a disk. */
export function unsafeZipPath(name: string): boolean {
  if (!name || name.length > 400) return true
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(name)) return true
  if (name.includes("\\")) return true
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return true
  return name.split("/").some((part) => part === ".." || part === ".")
}

function extensionOf(name: string): string {
  const base = name.split("/").pop() ?? ""
  const dot = base.lastIndexOf(".")
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ""
}

/** A theme's licence and notes, which have no extension. */
const PLAIN_NAMES: ReadonlySet<string> = new Set(["license", "licence", "readme", "changelog", "authors", "notice", "copying"])

/** macOS adds these to a zip made in Finder, and a repository its dot files; they are skipped, not refused. */
export function isZipJunk(name: string): boolean {
  const base = name.split("/").pop() ?? ""
  return name.startsWith("__MACOSX/") || base.startsWith(".")
}

export function checkThemeZipSize(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return "That file is empty."
  if (bytes > MAX_THEME_ZIP_BYTES) return IMPORT_TOO_LARGE
  return null
}

export function checkThemeZipEntries(entries: ZipEntryInfo[]): ZipRuleResult {
  if (entries.length > MAX_THEME_ZIP_FILES) return { ok: false, error: `The zip holds ${entries.length} files. A theme can have up to ${MAX_THEME_ZIP_FILES}.` }
  let files = 0
  for (const e of entries) {
    if (unsafeZipPath(e.name)) return { ok: false, error: `"${e.name.slice(0, 80)}" points outside the theme. Zip the theme folder itself.` }
    if (isSymlinkMode(e.unixPermissions)) return { ok: false, error: `"${e.name.slice(0, 80)}" is a link to another file. Zip the files themselves.` }
    if (e.dir || isZipJunk(e.name)) continue
    const ext = extensionOf(e.name)
    const plain = !ext && PLAIN_NAMES.has((e.name.split("/").pop() ?? "").toLowerCase())
    if (!plain && !THEME_ZIP_EXTENSIONS.has(ext)) return { ok: false, error: `"${e.name.slice(0, 80)}" is not a file a theme uses${ext ? ` (.${ext})` : ""}.` }
    files += 1
  }
  if (files === 0) return { ok: false, error: "The zip is empty." }
  return { ok: true, files }
}
