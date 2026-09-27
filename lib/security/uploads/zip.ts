/**
 * ===========================================================================
 *  A ZIP'S TABLE OF CONTENTS, READ FROM ITS END
 * ===========================================================================
 * A ZIP lists every file it holds in its central directory, at the end of the
 * file. That list says each file's name, its packed and unpacked size, and
 * whether it is encrypted, so everything this needs is there without
 * unpacking a byte:
 *
 *   zip bomb         unpacked sizes far beyond anything a product is, a single
 *                    entry packed tighter than DEFLATE can pack, or many
 *                    entries pointing at the same packed data (overlapping);
 *   zip slip         a name with "..", an absolute path or a drive letter,
 *                    which unpacks outside the folder the buyer chose;
 *   launchers        a Windows program or launcher inside (policy.ts
 *                    BLOCKED_IN_ARCHIVE);
 *   nesting          archives inside the archive are counted, never opened.
 *
 * Only the last 64 KB is read first, then the directory itself if it is not
 * already in those bytes, each as a Range request against storage. A 10 GB
 * ZIP costs two small reads. The unpacked sizes are the ones the archive
 * declares: nothing here decompresses anything.
 *
 * Pure: bytes in, findings out. lib/security/uploads/stored.ts supplies the
 * reads for a file already in storage.
 */
import { extensionOf, hasHiddenFormatting, isTraversalPath } from "./filename"
import { BLOCKED_EXTENSIONS, BLOCKED_IN_ARCHIVE, type ArchiveLimits } from "./policy"

export interface ZipEntry {
  name: string
  compressedSize: number
  uncompressedSize: number
  encrypted: boolean
  method: number
  localOffset: number
  isDirectory: boolean
}

export interface ZipDirectory {
  entries: ZipEntry[]
  /** As the end record says; the list may be cut short when it is too long to read. */
  declaredEntries: number
  zip64: boolean
  directoryOffset: number
  directorySize: number
}

/** How far from the end the end record can be: 22 bytes plus a comment of up to 65535. */
export const ZIP_TAIL_BYTES = 65_557 + 20 + 56

const EOCD = 0x06054b50
const ZIP64_LOCATOR = 0x07064b50
const ZIP64_EOCD = 0x06064b50
const CENTRAL = 0x02014b50

function u16(b: Uint8Array, o: number) {
  return b[o] | (b[o + 1] << 8)
}
function u32(b: Uint8Array, o: number) {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000
}
function u64(b: Uint8Array, o: number) {
  return u32(b, o) + u32(b, o + 4) * 0x100000000
}

export interface EndRecord {
  directoryOffset: number
  directorySize: number
  entries: number
  zip64: boolean
}

/**
 * The end of central directory record, from the last bytes of the file.
 * `tailStart` is where `tail` begins in the file. Null when there is none
 * (not a ZIP, a ZIP cut short, or one split across disks).
 */
export function findEndRecord(tail: Uint8Array, tailStart: number): EndRecord | null {
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) !== EOCD) continue
    const commentLength = u16(tail, i + 20)
    if (i + 22 + commentLength > tail.length) continue
    let entries = u16(tail, i + 10)
    let directorySize = u32(tail, i + 12)
    let directoryOffset = u32(tail, i + 16)
    let zip64 = false
    if (entries === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
      const loc = i - 20
      if (loc < 0 || u32(tail, loc) !== ZIP64_LOCATOR) return null
      const recordAt = u64(tail, loc + 8) - tailStart
      if (recordAt < 0 || recordAt + 56 > tail.length || u32(tail, recordAt) !== ZIP64_EOCD) return null
      entries = u64(tail, recordAt + 32)
      directorySize = u64(tail, recordAt + 40)
      directoryOffset = u64(tail, recordAt + 48)
      zip64 = true
    }
    return { directoryOffset, directorySize, entries, zip64 }
  }
  return null
}

/** The entries in a central directory's bytes. Stops at the first record that does not parse. */
export function parseCentralDirectory(bytes: Uint8Array, limit = Infinity): ZipEntry[] {
  const out: ZipEntry[] = []
  let o = 0
  const latin1 = new TextDecoder("latin1")
  const utf8 = new TextDecoder("utf-8", { fatal: false })
  while (o + 46 <= bytes.length && out.length < limit) {
    if (u32(bytes, o) !== CENTRAL) break
    const flags = u16(bytes, o + 8)
    const method = u16(bytes, o + 10)
    let compressedSize = u32(bytes, o + 20)
    let uncompressedSize = u32(bytes, o + 24)
    const nameLength = u16(bytes, o + 28)
    const extraLength = u16(bytes, o + 30)
    const commentLength = u16(bytes, o + 32)
    let localOffset = u32(bytes, o + 42)
    const nameBytes = bytes.subarray(o + 46, o + 46 + nameLength)
    const name = (flags & 0x800 ? utf8 : latin1).decode(nameBytes)
    /* ZIP64 sizes live in the extra field when the fixed ones are all ones. */
    let e = o + 46 + nameLength
    const extraEnd = e + extraLength
    while (e + 4 <= extraEnd && e + 4 <= bytes.length) {
      const id = u16(bytes, e)
      const len = u16(bytes, e + 2)
      if (id === 0x0001) {
        let p = e + 4
        if (uncompressedSize === 0xffffffff && p + 8 <= e + 4 + len) (uncompressedSize = u64(bytes, p)), (p += 8)
        if (compressedSize === 0xffffffff && p + 8 <= e + 4 + len) (compressedSize = u64(bytes, p)), (p += 8)
        if (localOffset === 0xffffffff && p + 8 <= e + 4 + len) localOffset = u64(bytes, p)
      }
      e += 4 + len
    }
    out.push({
      name,
      compressedSize,
      uncompressedSize,
      encrypted: (flags & 1) === 1,
      method,
      localOffset,
      isDirectory: name.endsWith("/") || name.endsWith("\\"),
    })
    o += 46 + nameLength + extraLength + commentLength
  }
  return out
}

export type ZipFindingCode =
  | "zip_too_many_entries"
  | "zip_bomb_total"
  | "zip_bomb_ratio"
  | "zip_overlap"
  | "zip_traversal"
  | "zip_blocked_entry"
  | "zip_path_depth"
  | "zip_nested_archives"

export type ZipNoteCode = "zip_encrypted" | "zip_nested_archive" | "zip_hidden_formatting" | "zip_directory_cut_short"

export interface ZipReport {
  entries: number
  totalUncompressed: number
  encrypted: number
  nestedArchives: number
  /** The first finding that refuses the file, with the entry it was about. */
  refusal: { code: ZipFindingCode; detail: string } | null
  notes: { code: ZipNoteCode; detail: string }[]
}

const NESTED = new Set(["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "zipx", "cab"])

/**
 * The checks, on a directory already read. `fileSize` is the ZIP's own size.
 * `blockedInside` is the list of extensions refused as an entry.
 */
export function checkZipDirectory(
  dir: ZipDirectory,
  fileSize: number,
  limits: ArchiveLimits,
  blockedInside: ReadonlySet<string> = BLOCKED_IN_ARCHIVE,
): ZipReport {
  const report: ZipReport = { entries: dir.declaredEntries, totalUncompressed: 0, encrypted: 0, nestedArchives: 0, refusal: null, notes: [] }
  const refuse = (code: ZipFindingCode, detail: string) => {
    if (!report.refusal) report.refusal = { code, detail: detail.slice(0, 300) }
  }

  if (dir.declaredEntries > limits.maxEntries) refuse("zip_too_many_entries", `${dir.declaredEntries} entries, over ${limits.maxEntries}`)
  if (dir.entries.length < dir.declaredEntries) {
    report.notes.push({ code: "zip_directory_cut_short", detail: `${dir.entries.length} of ${dir.declaredEntries} entries read` })
  }

  const offsets = new Map<number, number>()
  let hiddenNamed = 0
  for (const entry of dir.entries) {
    const shown = entry.name.slice(0, 200)
    if (isTraversalPath(entry.name)) refuse("zip_traversal", `entry "${shown}" leaves the folder it unpacks into`)
    const depth = entry.name.replace(/\\/g, "/").split("/").filter(Boolean).length
    if (depth > limits.maxPathDepth) refuse("zip_path_depth", `entry "${shown}" is ${depth} folders deep`)
    if (hasHiddenFormatting(entry.name)) hiddenNamed++
    if (entry.encrypted) report.encrypted++
    report.totalUncompressed += entry.uncompressedSize
    if (entry.isDirectory) continue

    const ext = extensionOf(entry.name)
    if (blockedInside.has(ext)) refuse("zip_blocked_entry", `entry "${shown}" is a .${ext}`)
    if (NESTED.has(ext)) report.nestedArchives++

    if (entry.uncompressedSize > limits.ratioFloorBytes) {
      const ratio = entry.uncompressedSize / Math.max(1, entry.compressedSize)
      if (ratio > limits.maxEntryRatio) refuse("zip_bomb_ratio", `entry "${shown}" unpacks ${Math.round(ratio)} times its packed size`)
    }
    if (entry.compressedSize > 0 || entry.uncompressedSize > 0) {
      const seen = offsets.get(entry.localOffset) ?? 0
      offsets.set(entry.localOffset, seen + 1)
      if (seen >= 1) refuse("zip_overlap", `entries share packed data at offset ${entry.localOffset}`)
    }
  }

  if (report.totalUncompressed > limits.maxTotalUncompressed) {
    refuse("zip_bomb_total", `unpacks to ${report.totalUncompressed} bytes, over ${limits.maxTotalUncompressed}`)
  }
  /* A whole archive that unpacks to more than a thousand times itself, and to over a gigabyte. */
  if (report.totalUncompressed > 1024 * 1024 * 1024 && report.totalUncompressed / Math.max(1, fileSize) > 1000) {
    refuse("zip_bomb_ratio", `unpacks to ${Math.round(report.totalUncompressed / Math.max(1, fileSize))} times its size`)
  }
  if (report.nestedArchives > limits.maxNestedArchives) {
    refuse("zip_nested_archives", `${report.nestedArchives} archives inside, over ${limits.maxNestedArchives}`)
  } else if (report.nestedArchives > 0) {
    report.notes.push({ code: "zip_nested_archive", detail: `${report.nestedArchives} archives inside, not opened` })
  }
  if (report.encrypted > 0) report.notes.push({ code: "zip_encrypted", detail: `${report.encrypted} encrypted entries, contents not readable` })
  if (hiddenNamed > 0) report.notes.push({ code: "zip_hidden_formatting", detail: `${hiddenNamed} entry names carry hidden formatting` })
  return report
}

/** The full list for the whole-upload blocklist, for a theme package, where nothing runnable belongs. */
export const THEME_BLOCKED_INSIDE = BLOCKED_EXTENSIONS

export type RangeReader = (start: number, endInclusive: number) => Promise<Uint8Array | null>

export type ZipReadResult =
  | { ok: true; dir: ZipDirectory }
  | { ok: false; reason: "not_a_zip" | "too_slow" | "unreadable" | "directory_too_large"; detail: string; declaredEntries?: number }

/**
 * Reads the directory: the end record from `tail` (or a read of the last
 * bytes), then the directory from `tail` when it is already there, else one
 * more read. `deadline` is a Date.now() value; past it the read gives up and
 * says so, and the caller accepts the file on its other checks.
 */
export async function readZipDirectory(input: {
  size: number
  tail?: { bytes: Uint8Array; start: number } | null
  read?: RangeReader
  limits: ArchiveLimits
  deadline: number
}): Promise<ZipReadResult> {
  let tail = input.tail ?? null
  if (!tail || (tail.start > 0 && tail.bytes.length < Math.min(ZIP_TAIL_BYTES, input.size))) {
    if (!input.read) return { ok: false, reason: "unreadable", detail: "no way to read the end of the file" }
    const start = Math.max(0, input.size - ZIP_TAIL_BYTES)
    const bytes = await input.read(start, input.size - 1)
    if (!bytes) return { ok: false, reason: "unreadable", detail: "the end of the file could not be read" }
    tail = { bytes, start }
  }
  if (Date.now() > input.deadline) return { ok: false, reason: "too_slow", detail: "time ran out reading the end of the file" }
  const end = findEndRecord(tail.bytes, tail.start)
  if (!end) return { ok: false, reason: "not_a_zip", detail: "no end of central directory record" }
  if (end.directorySize > input.limits.maxDirectoryBytes) {
    return { ok: false, reason: "directory_too_large", detail: `directory is ${end.directorySize} bytes`, declaredEntries: end.entries }
  }
  let bytes: Uint8Array | null = null
  const from = end.directoryOffset - tail.start
  if (from >= 0 && from + end.directorySize <= tail.bytes.length) {
    bytes = tail.bytes.subarray(from, from + end.directorySize)
  } else if (input.read && end.directorySize > 0) {
    if (end.directoryOffset + end.directorySize > input.size) return { ok: false, reason: "not_a_zip", detail: "directory lies past the end of the file" }
    bytes = await input.read(end.directoryOffset, end.directoryOffset + end.directorySize - 1)
    if (Date.now() > input.deadline) return { ok: false, reason: "too_slow", detail: "time ran out reading the directory" }
  }
  if (!bytes && end.directorySize > 0) return { ok: false, reason: "unreadable", detail: "the directory could not be read" }
  const entries = parseCentralDirectory(bytes ?? new Uint8Array(0), input.limits.maxEntries + 1)
  return {
    ok: true,
    dir: { entries, declaredEntries: end.entries, zip64: end.zip64, directoryOffset: end.directoryOffset, directorySize: end.directorySize },
  }
}
