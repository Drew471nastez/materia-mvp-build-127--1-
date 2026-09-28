/**
 * ===========================================================================
 *  A FILE'S NAME, MADE SAFE TO KEEP, TO SHOW AND TO HAND BACK
 * ===========================================================================
 * The name of an upload is whatever the uploader's computer says, and it goes
 * three places: a storage key, the product editor's list, and the name a
 * buyer's browser saves the download under (Content-Disposition). Each one
 * can be abused differently:
 *
 *   - "../../other-creator/file" or "C:\Windows\x" to climb out of a folder;
 *   - control characters and line breaks to split a header;
 *   - the right to left override (U+202E) so "invoice\u202Efdp.exe" shows as
 *     "invoiceexe.pdf";
 *   - Windows reserved names (CON, NUL, COM1...) that cannot be saved at all,
 *     and trailing dots or spaces that Windows drops, so "setup.exe." saves
 *     as "setup.exe".
 *
 * Pure and dependency free: the product editor, the routes and the tests run
 * the same code.
 */

/** Bidirectional controls and other invisible formatting a name never needs. */
const BIDI_AND_INVISIBLE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|conin\$|conout\$)$/i

/** Whether a name carries a direction override or other hidden formatting. */
export function hasHiddenFormatting(name: string): boolean {
  return new RegExp(BIDI_AND_INVISIBLE.source).test(name)
}

/**
 * The last extension of a name, the way Windows would read it: trailing dots
 * and spaces dropped, hidden formatting removed, lower case. "" when there is
 * none.
 *
 * THE EXTENSION ENDS AT THE FIRST CHARACTER THAT IS NOT A LETTER OR A DIGIT,
 * it is not those characters deleted. Deleting them read "a.exe:x" as "exex",
 * which is on no blocked list, while NTFS writes that name as a.exe with a
 * second stream hanging off it: the file that runs is still setup.exe. The
 * same cut catches "a.exe " and "a.exe\u0000.txt".
 */
export function extensionOf(name: string): string {
  const cleaned = String(name ?? "")
    .replace(BIDI_AND_INVISIBLE, "")
    .replace(CONTROL, "")
    .split(/[\\/]/)
    .pop()!
    /* Everything after a colon is an NTFS stream name, not part of the file:
       "setup.exe:notes.txt" writes setup.exe and hangs notes.txt off it. */
    .split(":")[0]
    .replace(/[\s.]+$/, "")
  const dot = cleaned.lastIndexOf(".")
  if (dot <= 0 && !cleaned.startsWith(".")) return ""
  const after = cleaned.slice(dot + 1).trim().toLowerCase()
  return (/^[a-z0-9]*/.exec(after)?.[0] ?? "").slice(0, 16)
}

/**
 * Every extension in a name after the first dot: "a.tar.gz" is ["tar", "gz"],
 * and "invoice.pdf.exe" is ["pdf", "exe"]. What a name PROMISES as well as
 * what it is, which is what catches a program wearing a document's name even
 * when the last extension is not the dangerous one.
 */
export function extensionsOf(name: string): string[] {
  const base = String(name ?? "")
    .replace(BIDI_AND_INVISIBLE, "")
    .replace(CONTROL, "")
    .split(/[\\/]/)
    .pop()!
    .replace(/[\s.]+$/, "")
  return base
    .split(".")
    .slice(1)
    .map((p) => /^[a-z0-9]*/.exec(p.trim().toLowerCase())?.[0] ?? "")
    .filter(Boolean)
}

/**
 * The name to show and to save a download under. Keeps letters in any
 * language, spaces, dashes and brackets; removes folders, control characters,
 * hidden formatting and the characters Windows cannot save; never a reserved
 * device name; at most `max` characters with the extension kept.
 */
export function sanitizeDisplayName(name: string, max = 180): string {
  let base = String(name ?? "")
    .replace(BIDI_AND_INVISIBLE, "")
    .replace(CONTROL, "")
  base = base.split(/[\\/]/).filter(Boolean).pop() ?? ""
  base = base
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s.]+$/, "")
    .replace(/^\.+/, "")
    .trim()
  if (!base) return "file"
  const dot = base.lastIndexOf(".")
  let stem = dot > 0 ? base.slice(0, dot) : base
  let ext = dot > 0 ? base.slice(dot) : ""
  if (WINDOWS_RESERVED.test(stem.trim())) stem = `_${stem}`
  if (ext.length > 17) ext = ext.slice(0, 17)
  if (stem.length + ext.length > max) stem = stem.slice(0, Math.max(1, max - ext.length)).trim()
  return `${stem}${ext}` || "file"
}

/**
 * A name reduced to what is safe inside a storage key: ASCII letters,
 * digits, dot, dash and underscore. Used where a key keeps a trace of the
 * original name; keys built by Storelib use a random id and only the
 * extension (lib/storage/validation.ts generateStoragePath).
 */
export function storageSafeName(name: string, max = 120): string {
  const shown = sanitizeDisplayName(name, max)
  const ascii = shown
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._]+/, "")
  return ascii.slice(0, max) || "file"
}

/**
 * The value for `Content-Disposition: attachment`: a plain ASCII fallback
 * and the real name, percent encoded (RFC 6266 / RFC 5987), so a quote or a
 * line break in a name can never end the header.
 */
export function contentDisposition(name: string): string {
  const shown = sanitizeDisplayName(name)
  const fallback = shown.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%]/g, "_")
  const encoded = encodeURIComponent(shown).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

/**
 * Whether a storage path is one Storelib would build: relative, plain
 * segments, nothing that climbs, no backslash, no drive letter, no control
 * characters, and (when `ownerIds` is given) under one of those ids.
 */
export function isSafeStoragePath(path: unknown, ownerIds?: (string | null | undefined)[]): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false
  if (path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false
  if (new RegExp(CONTROL.source).test(path) || hasHiddenFormatting(path)) return false
  const parts = path.split("/")
  if (parts.some((p) => p === "" || p === "." || p === ".." || p.trim() !== p)) return false
  if (!ownerIds) return true
  return ownerIds.some((id) => typeof id === "string" && id.length > 0 && parts[0] === id)
}

/**
 * The looser test for a path already stored in a row (a download of a file
 * uploaded years ago): nothing that climbs, nothing absolute, no backslash,
 * no control characters. Older keys may hold spaces or an empty folder, and
 * those files must keep downloading.
 */
export function isContainedPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) return false
  if (path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false
  if (new RegExp(CONTROL.source).test(path)) return false
  return !path.split("/").some((p) => p === "..")
}

/**
 * Whether a path inside an archive would unpack outside the folder it is
 * unpacked into: "..", an absolute path, a drive letter, a UNC share. A
 * backslash is read as a folder separator first, as Windows unpackers do,
 * so "..\\..\\x" is caught and "folder\\file.wav" (written by some old
 * Windows tools) is not.
 *
 * EACH SEGMENT IS READ THE WAY THE COMPUTER THAT UNPACKS IT WILL READ IT,
 * not as the bytes in the archive. Windows drops trailing dots and spaces
 * from a name, so ".. " and ".._" with a zero width joiner in it are both
 * "..'' by the time the folder is made, and comparing the raw text let every
 * one of those through as an ordinary folder name.
 */
export function isTraversalPath(entryName: string): boolean {
  const name = String(entryName ?? "")
    .replace(BIDI_AND_INVISIBLE, "")
    .replace(CONTROL, "")
    .replace(/\\/g, "/")
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.startsWith("//")) return true
  return name.split("/").some((part) => {
    /* Windows drops the spaces at the end of a folder name, so ".. " makes
       the same folder ".." does. Dots are not dropped from a name that is
       only dots, which is why they are kept here and counted instead. */
    const seg = part.replace(/\s+$/, "")
    return seg.length >= 2 && /^\.+$/.test(seg)
  })
}
