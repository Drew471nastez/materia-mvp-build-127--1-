/**
 * ===========================================================================
 *  THE ONE CHECK EVERY UPLOAD GOES THROUGH
 * ===========================================================================
 * inspectUpload() is what every upload path in Storelib asks, whatever the
 * file is and however it arrived: product files (and so variant files and
 * bundles), link page files, pictures, videos and theme packages. It reads the
 * name, the declared type, the size and the file's own first and last bytes,
 * never the whole file, and answers with one verdict:
 *
 *   ok            accepted, with notes for the log when something was worth
 *                 writing down (an encrypted ZIP, a name that did not match
 *                 the bytes)
 *   code          why, for the security log and the admin page
 *   userMessage   the only words a creator is shown, from policy.ts
 *   detail        what exactly was found, for the log only
 *   detectedType  what the bytes say the file is
 *   safeName      the name to keep and to hand back (filename.ts)
 *
 * In order: the size; the name (its extension read the way Windows reads it,
 * trailing dots, spaces and stream names and all, and hidden direction marks
 * that turn "invoice\u202Efdp.exe" into "invoiceexe.pdf"); the declared type; the first bytes (a program, a script
 * or a web page behind a document's name, the EICAR test file); what the
 * context requires (a picture must be a picture); and, for a ZIP, its table
 * of contents (zip.ts). The checks are cheap and bounded: a ZIP's directory is
 * two Range reads, and past the time budget the file is accepted on the
 * checks already done, with a note, never left waiting.
 *
 * A malware engine, when one is switched on, runs after this and is an
 * addition to it, not a replacement (lib/security/uploads/providers.ts).
 *
 * Pure: no storage, no network, no environment. The browser runs
 * precheckUpload() before a byte is sent, and the server runs the whole of
 * inspectUpload() on what arrived.
 */
import { declaresPublicImage, isPublicImage, isPublicVideo, sniff, type Sniffed } from "@/lib/storage/file-signature"

import { extensionOf, hasHiddenFormatting, sanitizeDisplayName } from "./filename"
import {
  ARCHIVE_LIMITS,
  BINARY_MEDIA_EXTENSIONS,
  DANGEROUS_DECLARED_TYPES,
  DOCUMENT_OR_MEDIA_EXTENSIONS,
  extensionAllowed,
  MAX_UPLOAD_BYTES,
  SHEBANG_IS_A_DISGUISE,
  userMessage,
  type UploadContext,
  type UserFacingCode,
} from "./policy"
import {
  checkZipDirectory,
  shopifyScriptEntry,
  shopifyThemeRoot,
  readZipDirectory,
  verifyZipEntries,
  THEME_BLOCKED_INSIDE,
  ZIP_VERIFY_BUDGET,
  type BoundedInflate,
  type RangeReader,
  type ZipFindingCode,
  type ZipReadResult,
} from "./zip"

/** Why a file was refused. */
export type RefusalCode =
  | "empty"
  | "too_large"
  | "blocked_extension"
  | "dangerous_declared_type"
  | "executable_signature"
  | "script_in_document"
  | "disguised_file"
  | "markup_not_allowed"
  | "malware_test_signature"
  | "not_an_image"
  | "not_a_video"
  | "not_a_zip"
  | "unreadable"
  | "provider_infected"
  | ZipFindingCode

/** Something worth writing down about a file that was accepted. */
export type NoteCode =
  | "extension_mismatch"
  | "hidden_formatting_in_name"
  | "unknown_type"
  | "not_read"
  | "archive_not_inspected"
  | "zip_not_inspected"
  | "zip_encrypted"
  | "zip_nested_archive"
  | "zip_hidden_formatting"
  | "zip_directory_cut_short"
  | "zip_sizes_not_verified"
  | "zip_behind_another_format"
  | "zip_shopify_scripts_ignored"

export interface VerdictNote {
  code: NoteCode
  detail: string
}

export interface ArchiveSummary {
  inspected: boolean
  entries: number
  totalUncompressed: number
  encrypted: number
  nestedArchives: number
  /** Entries actually unpacked to check their declared size. */
  verified?: number
}

export interface UploadVerdict {
  ok: boolean
  code: "accepted" | RefusalCode
  /** Shown to the creator. Empty when accepted. */
  userMessage: string
  /** For the security log and the admin page only. */
  detail: string
  detectedType: string | null
  safeName: string
  notes: VerdictNote[]
  archive?: ArchiveSummary
}

export interface InspectInput {
  fileName: string
  declaredMime?: string | null
  size: number
  /** The first bytes. 8 KB is plenty; fewer is fine for a small file. */
  head: Uint8Array | null
  /** The last bytes and where they start, for a ZIP's directory. */
  tail?: { bytes: Uint8Array; start: number } | null
  context: UploadContext
  /** A Range read of the same file, for a ZIP directory not in `tail`. */
  readRange?: RangeReader
  /**
   * Unpacks a bounded prefix of a few of an archive's entries, so the sizes
   * it declares are tested rather than believed (zip.ts verifyZipEntries).
   * Server side only: lib/security/uploads/stored.ts passes it. Without it
   * the archive is judged on its table of contents alone, as before.
   */
  inflate?: BoundedInflate
  /** How long the archive read may take. Default 2.5 s. */
  budgetMs?: number
  /** A different size limit (an email picture is smaller than a cover). */
  maxBytes?: number
}

/** How much of the start of a file the checks read. */
export const HEAD_BYTES = 8192

/* ── helpers ─────────────────────────────────────────────────────────── */

const EICAR_START = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$"
const EICAR_END = "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

/** The EICAR antivirus test string anywhere in these bytes. */
export function containsEicar(bytes: Uint8Array | null | undefined): boolean {
  if (!bytes || bytes.length < 68) return false
  const text = new TextDecoder("latin1").decode(bytes)
  const at = text.indexOf(EICAR_START)
  return at !== -1 && text.indexOf(EICAR_END, at) !== -1
}

/** Text a browser, a shell or Windows would run, in the first bytes. */
const SCRIPT_TEXT = [
  /^\s*#!\s*\//,
  /<\?php/i,
  /<%@?\s*(?:page|import|include)/i,
  /<script[\s>]/i,
  /\bpowershell\b.*-(?:enc|exec|command)/i,
  /\bcmd\.exe\s*\/[ck]\b/i,
  /\b(?:wscript|cscript)\b/i,
  /\bInvoke-(?:Expression|WebRequest|Command)\b/i,
]

function mostlyText(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 1024)
  if (n === 0) return false
  let printable = 0
  for (let i = 0; i < n; i++) {
    const c = bytes[i]
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 0xc2) printable++
    else if (c === 0) return false
  }
  return printable / n > 0.95
}

/**
 * A real program header, not just two letters. "MZ" opens every Windows
 * program, and also the odd text file that starts with those two letters; a
 * program has binary bytes after them.
 */
function isProgram(s: Sniffed, head: Uint8Array): boolean {
  if (s.family !== "executable" || s.mime === "text/x-shellscript") return false
  if (s.mime === "application/x-msdownload") return !mostlyText(head.subarray(0, 64))
  return true
}

const FAMILY_OF_EXT: Record<string, Sniffed["family"]> = {
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image", avif: "image", bmp: "image", tif: "image", tiff: "image", heic: "image", heif: "image", dng: "image",
  mp3: "audio", wav: "audio", flac: "audio", aif: "audio", aiff: "audio", m4a: "audio", ogg: "audio", mid: "audio", midi: "audio",
  mp4: "video", mov: "video", m4v: "video", webm: "video", mkv: "video", avi: "video", mpg: "video", mpeg: "video", "3gp": "video",
  pdf: "pdf", ttf: "font", otf: "font", woff: "font", woff2: "font",
}

function refused(code: RefusalCode, userCode: UserFacingCode, detail: string, base: Pick<UploadVerdict, "safeName" | "detectedType" | "notes">, context: UploadContext, limit?: number): UploadVerdict {
  return { ok: false, code, userMessage: userMessage(userCode, context, limit), detail: detail.slice(0, 500), ...base }
}

/* ── the name, the size, the declared type ───────────────────────────── */

export interface PrecheckInput {
  fileName: string
  size: number
  declaredMime?: string | null
  context: UploadContext
  maxBytes?: number
}

/**
 * What can be decided before a byte is sent: size, name and declared type.
 * The product editor runs this on a picked file, and every route that hands
 * out an upload URL runs it on what the page declared.
 */
export function precheckUpload(input: PrecheckInput): UploadVerdict {
  const safeName = sanitizeDisplayName(input.fileName)
  const notes: VerdictNote[] = []
  const base = { safeName, detectedType: null, notes }
  const limit = input.maxBytes ?? MAX_UPLOAD_BYTES[input.context]
  const size = Number(input.size)
  const ext = extensionOf(input.fileName)
  const declared = String(input.declaredMime ?? "").split(";")[0].trim().toLowerCase()

  if (!Number.isFinite(size) || size <= 0) return refused("empty", "empty", "the file has no bytes", base, input.context)
  if (size > limit) return refused("too_large", "too_large", `${size} bytes, over ${limit}`, base, input.context, limit)
  if (!extensionAllowed(ext, input.context)) return refused("blocked_extension", "unsupported_type", `.${ext} is a program or launcher`, base, input.context)
  if (DANGEROUS_DECLARED_TYPES.has(declared)) return refused("dangerous_declared_type", "unsupported_type", `declared as ${declared}`, base, input.context)
  if (hasHiddenFormatting(input.fileName)) notes.push({ code: "hidden_formatting_in_name", detail: "direction or invisible characters removed from the name" })

  if (input.context === "public_image" && declared && !declaresPublicImage(declared)) {
    return refused("not_an_image", "not_an_image", `declared as ${declared}`, base, input.context)
  }
  if (input.context === "video" && declared && !declared.startsWith("video/")) {
    return refused("not_a_video", "not_a_video", `declared as ${declared}`, base, input.context)
  }
  if (input.context === "link_page_file" && (/^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)/.test(declared) || ["html", "htm", "xhtml", "svg", "xml", "shtml"].includes(ext))) {
    return refused("markup_not_allowed", "unsupported_type", `a web page or SVG (.${ext || declared})`, base, input.context)
  }
  if (input.context === "theme_package" && ext && ext !== "zip" && ext !== "storelibtheme" && !ext.startsWith("storelib")) {
    return refused("not_a_zip", "unsupported_type", `.${ext} is not a theme package`, base, input.context)
  }
  return { ok: true, code: "accepted", userMessage: "", detail: "", ...base }
}

/* ── the first bytes ─────────────────────────────────────────────────── */

/**
 * precheckUpload() and then the first bytes, without reading an archive's
 * contents. Synchronous, for the places that hold a file's start already.
 */
export function inspectHead(input: InspectInput): UploadVerdict {
  const pre = precheckUpload(input)
  if (!pre.ok) return pre
  const notes = [...pre.notes]
  const ext = extensionOf(input.fileName)
  const head = input.head
  const context = input.context

  if (!head || head.length === 0) {
    const base = { safeName: pre.safeName, detectedType: null, notes }
    if (context === "public_image") return refused("unreadable", "not_accepted", "the start of the file could not be read", base, context)
    if (context === "video" || context === "theme_package") return refused("unreadable", "not_accepted", "the start of the file could not be read", base, context)
    notes.push({ code: "not_read", detail: "the start of the file could not be read; checked by name and size" })
    return { ...pre, notes }
  }

  const s = sniff(head)
  const base = { safeName: pre.safeName, detectedType: s.mime, notes }

  if (containsEicar(head) || containsEicar(input.tail?.bytes)) {
    return refused("malware_test_signature", "not_accepted", "the EICAR antivirus test file", base, context)
  }
  if (isProgram(s, head)) {
    return refused("executable_signature", "not_accepted", `a program (${s.mime}) named .${ext || "(none)"}`, base, context)
  }

  const text = mostlyText(head) ? new TextDecoder("utf-8", { fatal: false }).decode(head.subarray(0, 2048)) : ""
  const shebang = s.mime === "text/x-shellscript"

  /* A script behind a document or media name. */
  if (shebang && (SHEBANG_IS_A_DISGUISE.has(ext) || context !== "product_file")) {
    return refused("script_in_document", "not_accepted", `a script named .${ext || "(none)"}`, base, context)
  }
  if (text && BINARY_MEDIA_EXTENSIONS.has(ext) && SCRIPT_TEXT.some((re) => re.test(text))) {
    return refused("script_in_document", "not_accepted", `script text named .${ext}`, base, context)
  }
  if (s.family === "markup") {
    if (BINARY_MEDIA_EXTENSIONS.has(ext)) return refused("disguised_file", "not_accepted", `${s.mime} named .${ext}`, base, context)
    if (context !== "product_file") return refused("markup_not_allowed", "unsupported_type", `${s.mime} is rendered by a browser`, base, context)
  }

  if (context === "public_image" && !isPublicImage(head)) {
    return refused("not_an_image", "not_an_image", `the bytes are ${s.mime ?? "not a known format"}`, base, context)
  }
  if (context === "video" && !isPublicVideo(head)) {
    return refused("not_a_video", "not_a_video", `the bytes are ${s.mime ?? "not a known format"}`, base, context)
  }
  if (context === "theme_package" && s.mime !== "application/zip") {
    return refused("not_a_zip", "unsupported_type", `the bytes are ${s.mime ?? "not a known format"}`, base, context)
  }

  /* Harmless, but not what the name says: written down, not refused. */
  const expected = FAMILY_OF_EXT[ext]
  if (s.mime && expected && expected !== s.family) {
    notes.push({ code: "extension_mismatch", detail: `.${ext} holds ${s.mime}` })
  } else if (!s.mime && expected) {
    notes.push({ code: "extension_mismatch", detail: `.${ext} holds a format that is not one` })
  } else if (!s.mime) {
    notes.push({ code: "unknown_type", detail: `.${ext || "(none)"} is not a format the checks recognise` })
  }
  if (s.family === "archive" && s.mime !== "application/zip") {
    notes.push({ code: "archive_not_inspected", detail: `${s.mime} contents are not listed` })
  }

  return { ok: true, code: "accepted", userMessage: "", detail: "", ...base }
}

/* ── the whole check ─────────────────────────────────────────────────── */

/**
 * Everything: inspectHead(), then a ZIP's table of contents. Never throws.
 *
 * WHETHER THIS IS AN ARCHIVE IS DECIDED BY ITS END, NOT ITS START. A ZIP is
 * defined by the end of central directory record at the end of the file, and
 * every unpacker on every platform finds it there: anything at all may sit in
 * front of it. So "%PDF-1.4" and some padding glued in front of an archive
 * opens as an archive on a double click while its first bytes read as a PDF,
 * and reading the first bytes alone was how a ZIP holding setup.exe and
 * "../../evil.exe" came through with no ZIP check made and nothing written
 * down. The end is read for EVERY file that has one, whatever the start said,
 * and only a file with no end record at all is treated as not an archive.
 *
 * Pictures and videos are the exception: those contexts already require the
 * bytes to be a real picture or a real video, and are served as one, so an
 * archive glued to the end of one is never unpacked by anything.
 */
export async function inspectUpload(input: InspectInput): Promise<UploadVerdict> {
  try {
    const first = inspectHead(input)
    if (!first.ok || input.context === "public_image" || input.context === "video") return first
    /* No end to read and no way to read one: nothing more can be known here. */
    if (!input.tail && !input.readRange) return first

    const theme = input.context === "theme_package"
    const limits = ARCHIVE_LIMITS[theme ? "theme" : "product"]
    const deadline = Date.now() + (input.budgetMs ?? 2500)
    const notes = [...first.notes]
    const read: ZipReadResult = await readZipDirectory({
      size: input.size,
      tail: input.tail,
      read: input.readRange,
      limits,
      deadline,
      looksLikeZip: first.detectedType === "application/zip",
    }).catch(
      (e: unknown): ZipReadResult => ({ ok: false, reason: "read_failed", detail: e instanceof Error ? e.message : "read failed", isZip: false }),
    )
    if (read.ok === false) {
      const failed = read as Extract<ZipReadResult, { ok: false }>
      /*
        AN ARCHIVE WHOSE LIST CANNOT BE READ IS REFUSED, NOT WAVED THROUGH.
        This used to be a note, which let the uploader choose when the checks
        did not run: a list padded past the ceiling, or one that does not
        parse, skipped every check inside and the file was kept. It is an
        archive (its end record says so) and nothing inside it is known, so it
        does not go in.
      */
      if (failed.isZip) {
        if ((failed.declaredEntries ?? 0) > limits.maxEntries) {
          return refused("zip_too_many_entries", "not_accepted", `${failed.declaredEntries} entries, over ${limits.maxEntries}`, { safeName: first.safeName, detectedType: first.detectedType, notes }, input.context)
        }
        return refused("zip_directory_unreadable", "not_accepted", `${failed.reason}: ${failed.detail}`, { safeName: first.safeName, detectedType: first.detectedType, notes }, input.context)
      }
      /* Not an archive at all: the other checks are the whole answer. */
      if (failed.reason === "not_a_zip" || failed.reason === "bad_directory" || failed.reason === "directory_too_large") {
        if (theme) return refused("not_a_zip", "unsupported_type", failed.detail, { safeName: first.safeName, detectedType: first.detectedType, notes }, input.context)
        return first
      }
      /* Storage would not answer. An outage must not lose somebody's upload,
         so it is kept and written down for the admin. */
      if (theme) return refused("not_a_zip", "unsupported_type", failed.detail, { safeName: first.safeName, detectedType: first.detectedType, notes }, input.context)
      notes.push({ code: "zip_not_inspected", detail: `${failed.reason}: ${failed.detail}` })
      return { ...first, notes, archive: { inspected: false, entries: 0, totalUncompressed: 0, encrypted: 0, nestedArchives: 0 } }
    }

    const dir = (read as Extract<ZipReadResult, { ok: true }>).dir
    /* The bytes said one thing and the end of the file said archive: kept for
       the admin, because that pairing is how a check gets skipped. */
    if (first.detectedType !== "application/zip") {
      notes.push({ code: "zip_behind_another_format", detail: `read as ${first.detectedType ?? "an unknown format"}, and an archive at its end` })
    }
    /* A Shopify theme's assets/*.js, and nothing else, may come in with it (zip.ts shopifyThemeRoot). */
    const shopifyRoot = theme ? shopifyThemeRoot(dir.entries.map((e) => e.name)) : null
    const report = checkZipDirectory(dir, input.size, limits, theme ? THEME_BLOCKED_INSIDE : undefined, shopifyRoot !== null ? shopifyScriptEntry(shopifyRoot) : undefined)
    const archive: ArchiveSummary = {
      inspected: true,
      entries: report.entries,
      totalUncompressed: report.totalUncompressed,
      encrypted: report.encrypted,
      nestedArchives: report.nestedArchives,
    }
    for (const n of report.notes) notes.push(n)
    if (report.refusal) {
      return { ...refused(report.refusal.code, "not_accepted", report.refusal.detail, { safeName: first.safeName, detectedType: first.detectedType, notes }, input.context), archive }
    }

    /* The list said nothing wrong; now a few entries are unpacked to see
       whether the sizes it gave are true. Bounded, and skipped when the time
       is gone: an archive is never left waiting on this. */
    if (input.inflate && input.readRange && dir.entries.length > 0 && Date.now() < deadline) {
      const verified = await verifyZipEntries(dir, input.readRange, input.inflate, { ...ZIP_VERIFY_BUDGET, deadline })
      archive.verified = verified.checked
      if (verified.refusal) {
        return { ...refused(verified.refusal.code, "not_accepted", verified.refusal.detail, { safeName: first.safeName, detectedType: first.detectedType, notes }, input.context), archive }
      }
      if (verified.note) notes.push({ code: "zip_sizes_not_verified", detail: verified.note })
    }
    return { ...first, notes, archive }
  } catch (e) {
    /* A bug in a check must not lose somebody's upload: accepted on name and size, and written down. */
    const pre = precheckUpload(input)
    if (!pre.ok) return pre
    return { ...pre, notes: [...pre.notes, { code: "not_read", detail: `the checks stopped: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) }] }
  }
}

/** A verdict for a malware engine's finding, in the same shape. */
export function providerRefusal(fileName: string, context: UploadContext, detail: string): UploadVerdict {
  return {
    ok: false,
    code: "provider_infected",
    userMessage: userMessage("not_accepted", context),
    detail: detail.slice(0, 500),
    detectedType: null,
    safeName: sanitizeDisplayName(fileName),
    notes: [],
  }
}
