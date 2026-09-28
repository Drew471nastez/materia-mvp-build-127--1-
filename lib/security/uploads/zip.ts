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
 * ZIP costs two small reads.
 *
 * THEN THE SIZES ARE TESTED RATHER THAN BELIEVED. Everything above reads the
 * sizes the archive declares, and an archive can declare whatever it likes: a
 * few kilobytes claimed for an entry that really unpacks to forty gigabytes
 * passes every check that only reads the list. verifyZipEntries() opens a few
 * entries (the largest by what they claim, and the first few) and unpacks a
 * bounded prefix of each, counting the output and throwing every byte away.
 * An entry that produces more than it declared, past a small tolerance, is a
 * bomb. The pass is capped: at most four entries, 128 KB of packed data read
 * from each, 64 MB of output in all, and a deadline it never runs past. Spent
 * budget means the file is accepted on the checks already done, with a note,
 * never left waiting.
 *
 * Pure: bytes in, findings out. The unpacking itself is a function passed in
 * (lib/security/uploads/zip-inflate.ts on the server), so nothing here needs
 * node:zlib and a browser can still import this file.
 * lib/security/uploads/stored.ts supplies the reads for a file in storage.
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
  /**
   * Bytes glued in front of the archive. Every offset inside a ZIP is counted
   * from the archive's own start, so a file that is something else followed
   * by an archive has all of them out by this much, and every unpacker works
   * the difference out the same way: from where the end record actually sits.
   */
  prefixBytes: number
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
  /** Where the end record itself sits in the file, so a glued-on prefix can be measured. */
  recordAt: number
  /**
   * The record is the last thing in the file, as the format says it must be.
   * Four bytes of a large video will now and then happen to be the same four
   * bytes an end record starts with, and this is what tells those apart from
   * a real archive: a chance match almost never also ends exactly at the end
   * of the file.
   */
  atEndOfFile: boolean
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
      /* The locator gives an absolute position, which anything glued in front
         of the archive shifts; the record itself sits right before the
         locator, so that is where to look when the position does not land. */
      let recordAt = u64(tail, loc + 8) - tailStart
      if (recordAt < 0 || recordAt + 56 > tail.length || u32(tail, recordAt) !== ZIP64_EOCD) recordAt = loc - 56
      if (recordAt < 0 || recordAt + 56 > tail.length || u32(tail, recordAt) !== ZIP64_EOCD) return null
      entries = u64(tail, recordAt + 32)
      directorySize = u64(tail, recordAt + 40)
      directoryOffset = u64(tail, recordAt + 48)
      zip64 = true
    }
    return { directoryOffset, directorySize, entries, zip64, recordAt: tailStart + i, atEndOfFile: i + 22 + commentLength === tail.length }
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
  | "zip_directory_unreadable"

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

/**
 * Why a directory could not be read, and, which is what decides the verdict,
 * WHETHER THE FILE IS A ZIP ALL THE SAME:
 *
 *   not_a_zip    no end of central directory record: this is another kind of
 *                file, and nothing about archives applies to it.
 *   read_failed  storage would not hand over the bytes. Nothing is known
 *                about the file; the caller accepts it on its other checks
 *                and writes a note, because an outage must not lose uploads.
 *   the rest     an end record IS there, so this is an archive, and its
 *                contents could not be checked. `isZip` is true and the
 *                caller REFUSES: an archive whose list cannot be read is
 *                exactly what an archive built to skip the checks looks like.
 */
export type ZipReadResult =
  | { ok: true; dir: ZipDirectory }
  | {
      ok: false
      reason: "not_a_zip" | "read_failed" | "too_slow" | "bad_directory" | "directory_too_large"
      detail: string
      declaredEntries?: number
      isZip: boolean
    }

/**
 * Reads the directory: the end record from `tail` (or a read of the last
 * bytes), then the directory from `tail` when it is already there, else one
 * more read. `deadline` is a Date.now() value, checked BEFORE a read is
 * started rather than after it finishes, so a large honest directory that
 * took its time is still read through rather than thrown away half done.
 */
export async function readZipDirectory(input: {
  size: number
  tail?: { bytes: Uint8Array; start: number } | null
  read?: RangeReader
  limits: ArchiveLimits
  deadline: number
  /** The first bytes are a ZIP's own. Settles it on its own. */
  looksLikeZip?: boolean
}): Promise<ZipReadResult> {
  let tail = input.tail ?? null
  if (!tail || (tail.start > 0 && tail.bytes.length < Math.min(ZIP_TAIL_BYTES, input.size))) {
    if (!input.read) return { ok: false, reason: "read_failed", detail: "no way to read the end of the file", isZip: false }
    if (Date.now() > input.deadline) return { ok: false, reason: "too_slow", detail: "no time left to read the end of the file", isZip: false }
    const start = Math.max(0, input.size - ZIP_TAIL_BYTES)
    const bytes = await input.read(start, input.size - 1)
    if (!bytes) return { ok: false, reason: "read_failed", detail: "the end of the file could not be read", isZip: false }
    tail = { bytes, start }
  }
  const end = findEndRecord(tail.bytes, tail.start)
  if (!end) return { ok: false, reason: "not_a_zip", detail: "no end of central directory record", isZip: false }
  /*
    IS IT AN ARCHIVE, OR FOUR BYTES THAT LOOK LIKE ONE? A large video or
    sample pack has tens of thousands of positions in its last 64 KB, and one
    of them can happen to hold the four bytes an end record starts with. A
    real archive's end record is the LAST thing in the file, and a file whose
    first bytes are an archive's is one too. Without either, this is a chance
    match: the checks below are not run on it and, more to the point, it is
    not refused for failing them.
  */
  const certain = end.atEndOfFile || input.looksLikeZip === true
  if (end.directorySize > input.limits.maxDirectoryBytes) {
    return { ok: false, reason: "directory_too_large", detail: `directory is ${end.directorySize} bytes`, declaredEntries: end.entries, isZip: certain }
  }
  /* Where the list is, and where it is if something is glued in front. */
  const glued = end.recordAt - end.directorySize - end.directoryOffset
  const places = glued > 0 ? [end.directoryOffset, end.directoryOffset + glued] : [end.directoryOffset]
  let entries: ZipEntry[] = []
  let readAnything = false
  let prefixBytes = 0
  for (const at of places) {
    if (at < 0 || at + end.directorySize > input.size) continue
    let bytes: Uint8Array | null = null
    const from = at - tail.start
    if (from >= 0 && from + end.directorySize <= tail.bytes.length) {
      bytes = tail.bytes.subarray(from, from + end.directorySize)
    } else if (input.read && end.directorySize > 0) {
      if (Date.now() > input.deadline) {
        return { ok: false, reason: "too_slow", detail: "no time left to read the list", declaredEntries: end.entries, isZip: certain }
      }
      bytes = await input.read(at, at + end.directorySize - 1)
    }
    if (!bytes) continue
    readAnything = true
    const parsed = parseCentralDirectory(bytes, input.limits.maxEntries + 1)
    if (parsed.length > 0 || end.entries === 0) {
      entries = parsed
      prefixBytes = at - end.directoryOffset
      break
    }
  }
  if (end.directorySize === 0 && end.entries === 0) {
    return { ok: true, dir: { entries: [], prefixBytes: 0, declaredEntries: 0, zip64: end.zip64, directoryOffset: end.directoryOffset, directorySize: 0 } }
  }
  if (!readAnything) {
    return { ok: false, reason: "bad_directory", detail: "the list could not be read", declaredEntries: end.entries, isZip: certain }
  }
  /* An end record with a list that holds no record at all is not a list. */
  if (entries.length === 0 && end.entries > 0) {
    return { ok: false, reason: "bad_directory", detail: `${end.entries} entries promised, none readable`, declaredEntries: end.entries, isZip: certain }
  }
  return {
    ok: true,
    dir: { entries, prefixBytes, declaredEntries: end.entries, zip64: end.zip64, directoryOffset: end.directoryOffset, directorySize: end.directorySize },
  }
}

/* ── Unpacking a little, to see whether the declared sizes are true ────── */

/**
 * Unpacks `compressed` as raw DEFLATE, counts the output and throws it away,
 * stopping at `maxOut` bytes or at `deadline`. `ended` says the stream
 * finished inside the bytes given; `cappedAt` says it stopped at `maxOut`.
 * Null when it could not run at all. Supplied by zip-inflate.ts on the
 * server; there is no such thing here, which keeps this file pure.
 */
export type BoundedInflate = (
  compressed: Uint8Array,
  maxOut: number,
  deadline: number,
) => Promise<{ out: number; ended: boolean; cappedAt: boolean } | null>

export interface ZipVerifyBudget {
  /** How many entries may be opened. */
  maxEntries: number
  /** Packed bytes read from each one. A prefix is enough: a lie shows at once. */
  maxPackedPerEntry: number
  /** Everything unpacked in this pass, added up. */
  maxTotalOutput: number
  /** A Date.now() value the pass never runs past. */
  deadline: number
}

/**
 * Four entries, 128 KB of packed data each, 64 MB of output in all. An
 * ordinary entry gives back about as much as was fed in, so a real archive
 * costs four small reads and a few milliseconds; a crafted one is caught
 * within a few kilobytes of output, because the check is "more than it said",
 * not "a lot".
 */
export const ZIP_VERIFY_BUDGET: Omit<ZipVerifyBudget, "deadline"> = {
  maxEntries: 4,
  maxPackedPerEntry: 128 * 1024,
  maxTotalOutput: 64 * 1024 * 1024,
}

/** Slack over the declared size before a difference counts as a lie. */
function toleranceFor(declared: number): number {
  return Math.max(65_536, Math.round(declared * 0.02))
}

/** The most a local file header can take before the data (30 + name + extra). */
const LOCAL_HEADER_WINDOW = 4096
const LOCAL_HEADER = 0x04034b50

export interface ZipVerifyResult {
  /** Entries actually unpacked. */
  checked: number
  /** Output bytes produced in all. */
  produced: number
  refusal: { code: ZipFindingCode; detail: string } | null
  /** Why fewer entries were checked than asked for, when that happened. */
  note: string | null
}

/**
 * Which entries are worth opening: the largest few by what they claim (where
 * a bomb hides best), then the first few in the archive's own order (where a
 * bomb that claims everything is tiny hides instead).
 */
function entriesToVerify(entries: ZipEntry[], want: number): ZipEntry[] {
  const usable = entries.filter((e) => !e.isDirectory && !e.encrypted && e.method === 8 && e.compressedSize > 0)
  const bySize = [...usable].sort((a, b) => b.uncompressedSize - a.uncompressedSize)
  const picked: ZipEntry[] = []
  const seen = new Set<number>()
  const take = (e: ZipEntry | undefined) => {
    if (!e || seen.has(e.localOffset) || picked.length >= want) return
    seen.add(e.localOffset)
    picked.push(e)
  }
  const half = Math.max(1, Math.ceil(want / 2))
  for (let i = 0; i < half; i++) take(bySize[i])
  for (let i = 0; picked.length < want && i < usable.length; i++) take(usable[i])
  return picked
}

/**
 * Opens a few of `dir`'s entries and checks that each one unpacks to about
 * what it declared. Never throws: anything it cannot do becomes a note, and
 * the file is accepted on the checks already made.
 */
export async function verifyZipEntries(
  dir: ZipDirectory,
  read: RangeReader,
  inflate: BoundedInflate,
  budget: ZipVerifyBudget,
): Promise<ZipVerifyResult> {
  const out: ZipVerifyResult = { checked: 0, produced: 0, refusal: null, note: null }
  const picked = entriesToVerify(dir.entries, Math.max(1, budget.maxEntries))
  if (picked.length === 0) return out

  for (const entry of picked) {
    if (Date.now() >= budget.deadline) {
      out.note = `time ran out after ${out.checked} entries`
      return out
    }
    const left = budget.maxTotalOutput - out.produced
    if (left <= 0) {
      out.note = `the unpacking budget was spent after ${out.checked} entries`
      return out
    }

    const want = Math.min(entry.compressedSize, budget.maxPackedPerEntry)
    const at = entry.localOffset + dir.prefixBytes
    let block: Uint8Array | null = null
    try {
      block = await read(at, at + LOCAL_HEADER_WINDOW + want - 1)
    } catch {
      block = null
    }
    if (!block || block.length < 30) {
      out.note = "an entry's packed bytes could not be read"
      continue
    }
    if (u32(block, 0) !== LOCAL_HEADER) {
      out.note = "an entry does not start where the list says"
      continue
    }
    const dataAt = 30 + u16(block, 26) + u16(block, 28)
    if (dataAt >= block.length) {
      out.note = "an entry's header is longer than the bytes read"
      continue
    }
    const packed = block.subarray(dataAt, Math.min(block.length, dataAt + want))
    if (packed.length === 0) continue

    const declared = entry.uncompressedSize
    const tolerance = toleranceFor(declared)
    /* Enough to prove a lie by one byte, and never more than the budget left. */
    const cap = Math.min(declared + tolerance + 1, left)
    const result = await inflate(packed, cap, budget.deadline)
    if (!result) {
      out.note = "an entry could not be unpacked"
      continue
    }
    out.checked++
    out.produced += result.out

    if (result.out > declared + tolerance) {
      out.refusal = {
        code: "zip_bomb_ratio",
        detail: `entry "${entry.name.slice(0, 200)}" declares ${declared} bytes and unpacks to more than ${result.out}`.slice(0, 300),
      }
      return out
    }
    /* Stopped by the budget below the size it claimed: nothing is proved either way. */
    if (result.cappedAt && cap <= declared + tolerance) {
      out.note = `an entry was larger than the unpacking budget left`
      return out
    }
  }
  return out
}
