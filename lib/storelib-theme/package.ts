/**
 * ===========================================================================
 *  THE PACKAGE: A THEME AS ONE FILE
 * ===========================================================================
 * `<name>.storelib-theme` is a zip of the folder in docs/theme/01 plus a
 * manifest that lets the reader check it (docs/theme/11). This module
 * builds one from a theme and reads one back, and reads the builder's
 * earlier `manifest.json` + `images/` exports too, turning them into the
 * folder layout on the way in.
 *
 * DETERMINISTIC. The same theme builds to the same bytes: entries are
 * written in sorted order with a fixed timestamp, and `generated_at` is
 * only in the manifest when the caller supplies it. A round trip —
 * build, read, build — is byte-equal, and the suite says so.
 *
 * A TRANSACTION. `readPackage` returns the whole theme or a list of errors,
 * never part of one. The checks run in the order the document lists them:
 * the zip, the count, the size, the paths, theme.json, the manifest hashes,
 * the sections, the templates. Nothing is written by this module; what to
 * do with a theme that passed is the application's.
 */
import JSZip from "jszip"
import { createHash } from "node:crypto"
import { compileSection, compileThemeFile } from "./storelib/compile"
import { countBlocks } from "./blocks"
import {
  ENGINE_VERSION,
  LIMITS,
  MAX_BLOCK_DEPTH,
  THEME_FOLDERS,
  THEME_FORMAT,
  THEME_FORMAT_VERSION,
  isAssetRef,
  type BlockInstanceData,
  type Result,
  type SectionInstanceData,
  type Template,
  type ThemeError,
  type ThemeFiles,
  type ThemeManifest,
} from "./types"

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface PackageAsset {
  bytes: Uint8Array
  filename: string
  mime_type: string
  width?: number
  height?: number
  alt_text?: string
}

/** A theme, in memory: its manifest, its text files, its binary assets by hash. */
export interface ThemePackage {
  theme: ThemeManifest
  files: ThemeFiles
  assets: Record<string, PackageAsset>
}

/** `manifest.json` inside the zip. */
export interface PackageManifest {
  format: typeof THEME_FORMAT
  format_version: number
  generated_at?: string
  files: Record<string, { sha256: string; bytes: number }>
  assets: Record<string, { filename: string; mime_type: string; size: number; width?: number; height?: number; alt_text?: string }>
  [key: string]: unknown
}

export interface ReadPackage extends ThemePackage {
  manifest: PackageManifest
  /** True when the input was a `storelib-theme/v1|v2` export and was migrated. */
  legacy: boolean
  warnings: ThemeError[]
}

// ── Hashing and paths ───────────────────────────────────────────────────────

export function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif",
  "video/mp4": "mp4", "video/webm": "webm", "font/woff2": "woff2", "font/woff": "woff", "application/pdf": "pdf",
}
const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]))

export function mimeForExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream"
}

/** `assets/<hash>.<ext>` — the extension is for people; the hash is the identity. */
export function assetPath(hash: string, asset: { filename: string; mime_type: string }): string {
  const fromName = asset.filename.includes(".") ? asset.filename.split(".").pop()!.toLowerCase() : ""
  const ext = EXT_BY_MIME[asset.mime_type] ?? (fromName && /^[a-z0-9]{1,8}$/.test(fromName) ? fromName : "bin")
  return `assets/${hash}.${ext}`
}

const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.\-]*(\/[A-Za-z0-9_][A-Za-z0-9_.\-]*)*$/

export function isSafeThemePath(path: string): boolean {
  if (!SAFE_PATH.test(path) || path.includes("..")) return false
  const top = path.includes("/") ? path.split("/")[0] : ""
  return path === "theme.json" || path === "manifest.json" || (THEME_FOLDERS as readonly string[]).includes(top)
}

// ── Templates: the application's page ↔ the package's template ─────────────

interface PageSection {
  id: string
  type: string
  name?: string
  settings?: Record<string, unknown>
  blocks?: { id: string; type: string; settings?: Record<string, unknown>; static?: boolean; blocks?: unknown[]; [k: string]: unknown }[]
  hidden?: boolean
  [k: string]: unknown
}

type PageBlock = NonNullable<PageSection["blocks"]>[number]

/** A list of blocks to the keyed form, at every depth. Static blocks are kept and left out of the order. */
function keyedBlocks(blocks: PageBlock[], depth = 1): { blocks: Record<string, BlockInstanceData>; block_order: string[] } {
  const out: Record<string, BlockInstanceData> = {}
  const order: string[] = []
  if (depth > MAX_BLOCK_DEPTH) return { blocks: out, block_order: order }
  for (const b of blocks) {
    const { id: bid, blocks: inner, ...brest } = b
    const data: BlockInstanceData = { ...brest, type: b.type }
    if (Array.isArray(inner) && inner.length) {
      const k = keyedBlocks(inner as PageBlock[], depth + 1)
      data.blocks = k.blocks
      data.block_order = k.block_order
    }
    out[bid] = data
    if (!b.static) order.push(bid)
  }
  return { blocks: out, block_order: order }
}

/** The keyed form back to a list: ordered blocks, then static ones, then any the order forgot, so none is lost. */
function listBlocks(blocks: Record<string, BlockInstanceData>, blockOrder: unknown, depth = 1): PageBlock[] {
  if (depth > MAX_BLOCK_DEPTH) return []
  const order = (Array.isArray(blockOrder) ? (blockOrder as unknown[]) : []).filter((bid): bid is string => typeof bid === "string" && !!blocks[bid])
  const ids = [...new Set([...order, ...Object.keys(blocks).filter((bid) => blocks[bid]?.static), ...Object.keys(blocks)])]
  return ids.map((bid) => {
    const { blocks: inner, block_order, ...rest } = blocks[bid]
    const b: PageBlock = { ...rest, id: bid, type: blocks[bid].type, settings: blocks[bid].settings ?? {} }
    if (inner && typeof inner === "object") {
      const children = listBlocks(inner as Record<string, BlockInstanceData>, block_order, depth + 1)
      if (children.length) b.blocks = children
    }
    return b
  })
}

/** A page's section list, as `templates/<name>.json`. Ids, unknown keys and blocks inside blocks survive. */
export function templateFromSections(list: PageSection[]): Template {
  const sections: Record<string, SectionInstanceData> = {}
  const order: string[] = []
  for (const s of list) {
    const { id, blocks, ...rest } = s
    const data: SectionInstanceData = { ...rest, type: s.type }
    if (blocks) Object.assign(data, keyedBlocks(blocks))
    sections[id] = data
    order.push(id)
  }
  return { sections, order }
}

/** The inverse: a template back to the list the editor and the storefront hold. */
export function sectionsFromTemplate(t: Template): PageSection[] {
  const out: PageSection[] = []
  const order = Array.isArray(t.order) ? t.order : Object.keys(t.sections ?? {})
  for (const id of order) {
    const data = t.sections?.[id]
    if (!data) continue
    const { blocks, block_order, ...rest } = data
    const section: PageSection = { ...rest, id, type: data.type, name: typeof data.name === "string" ? data.name : data.type, settings: data.settings ?? {} }
    if (blocks) section.blocks = listBlocks(blocks, block_order ?? Object.keys(blocks).filter((bid) => !blocks[bid]?.static))
    out.push(section)
  }
  return out
}

// ── Building ────────────────────────────────────────────────────────────────

const FIXED_DATE = new Date(Date.UTC(2020, 0, 1))

export interface BuildOptions {
  /** Put a timestamp in the manifest. Left out, the build is byte-stable. */
  generated_at?: string
}

export async function buildPackage(pkg: ThemePackage, opts: BuildOptions = {}): Promise<Uint8Array> {
  const zip = new JSZip()
  const manifest: PackageManifest = { format: THEME_FORMAT, format_version: THEME_FORMAT_VERSION, files: {}, assets: {} }
  if (opts.generated_at) manifest.generated_at = opts.generated_at
  const theme: ThemeManifest = { ...pkg.theme, format: THEME_FORMAT, format_version: THEME_FORMAT_VERSION }
  const themeText = JSON.stringify(theme, null, 2) + "\n"
  const files: [string, string][] = [["theme.json", themeText], ...Object.entries(pkg.files).filter(([p]) => p !== "theme.json" && p !== "manifest.json")]
  files.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  for (const [path, text] of files) {
    if (!isSafeThemePath(path)) throw new Error(`${path} is not a path inside a theme`)
    zip.file(path, text, { date: FIXED_DATE })
    manifest.files[path] = { sha256: sha256(text), bytes: Buffer.byteLength(text, "utf8") }
  }
  for (const hash of Object.keys(pkg.assets).sort()) {
    const a = pkg.assets[hash]
    const path = assetPath(hash, a)
    zip.file(path, a.bytes, { date: FIXED_DATE })
    const rec: PackageManifest["assets"][string] = { filename: a.filename, mime_type: a.mime_type, size: a.bytes.byteLength }
    if (a.width !== undefined) rec.width = a.width
    if (a.height !== undefined) rec.height = a.height
    if (a.alt_text !== undefined) rec.alt_text = a.alt_text
    manifest.assets[hash] = rec
  }
  zip.file("manifest.json", JSON.stringify(manifest, null, 2) + "\n", { date: FIXED_DATE })
  /**
   * AND THE FOLDERS, WHICH NOBODY ADDED. Writing "sections/notice.storelib"
   * makes JSZip create an entry for "sections/" too, and that entry gets the
   * clock rather than the date the file was given — so two builds of the
   * same theme were identical except for the timestamp on a folder, and only
   * when the two happened to fall either side of a two-second tick. That is
   * a package that is byte-stable seven times out of eight, which is worse
   * than one that is not: it means an export cannot be compared with an
   * earlier export to see whether anything actually changed.
   */
  for (const entry of Object.values(zip.files)) entry.date = FIXED_DATE
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } })
}

// ── Reading ─────────────────────────────────────────────────────────────────

export interface ReadOptions {
  /** Section types the reader may reference that are not in the package (the application's JSON-described ones). */
  knownTypes?: readonly string[]
}

const err = (message: string, file?: string, line?: number): ThemeError => ({ stage: "package", message, file, line })

/**
 * WHAT AN ENTRY SAYS IT WILL BECOME, before it becomes it.
 *
 * A zip stores each entry's uncompressed size in its header, and deflate
 * compresses a megabyte of one repeated byte to about a kilobyte. So a
 * package inside every limit this module checks — 50 MB on disk, 2000
 * files — can hold gigabytes, and reading it to find out how big it is is
 * exactly the wrong order: the allocation happens first and the check
 * arrives after the server has already fallen over.
 *
 * Measured: an 82 KB zip carrying one 80 MB entry took 519ms and 80 MB of
 * heap before any limit in this file was consulted.
 *
 * So every entry is judged by its header, and the whole package by the sum
 * of those headers, before a single byte is decompressed.
 */
function declaredSize(file: JSZip.JSZipObject): number {
  const internal = (file as unknown as { _data?: { uncompressedSize?: number } })._data
  return typeof internal?.uncompressedSize === "number" ? internal.uncompressedSize : 0
}

/**
 * ===========================================================================
 *  AND THE HEADER IS THE UPLOADER'S WORD, SO UNPACKING IS COUNTED TOO
 * ===========================================================================
 * checkDeclaredSizes above reads the sizes the archive DECLARES, which is the
 * right first check because it costs nothing, and the wrong last one because
 * whoever made the archive wrote those numbers. An entry can say "4 KB" and
 * hold fifty gigabytes; the check passes, and then `async()` inflates the
 * whole of it into the function's heap and the function dies.
 *
 * So every entry is read through this instead. It counts the bytes as they
 * come and stops the moment the count passes the ceiling that entry has,
 * keeping nothing past it. What comes back is the bytes, or "over the limit",
 * and the caller treats the second as the error it already had for a file
 * that is too large.
 */
export interface CappedRead {
  /** The entry's bytes, or null when `reason` says why not. */
  bytes: Uint8Array | null
  /** "" when it was read. One flat shape, so a caller reads one field. */
  reason: "" | "too_large" | "unreadable"
}

export function readEntryCapped(file: JSZip.JSZipObject, cap: number): Promise<CappedRead> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let total = 0
    let done = false
    let stream: NodeJS.ReadableStream & { destroy?: () => void }
    const finish = (result: CappedRead) => {
      if (done) return
      done = true
      chunks.length = 0
      /* Ends the unpacking there and then, so nothing past the ceiling is
         inflated, let alone kept. */
      try {
        stream?.destroy?.()
      } catch {
        /* Already finished. */
      }
      resolve(result)
    }
    try {
      stream = file.nodeStream("nodebuffer") as NodeJS.ReadableStream & { destroy?: () => void }
    } catch {
      resolve({ bytes: null, reason: "unreadable" })
      return
    }
    stream.on("data", (chunk: Buffer) => {
      if (done) return
      total += chunk.length
      if (total > cap) {
        finish({ bytes: null, reason: "too_large" })
        return
      }
      chunks.push(chunk)
    })
    stream.on("error", () => finish({ bytes: null, reason: "unreadable" }))
    stream.on("end", () => {
      if (done) return
      const out = new Uint8Array(Buffer.concat(chunks, total))
      done = true
      resolve({ bytes: out, reason: "" })
    })
  })
}

/** The same, as text, for a source file. */
export async function readEntryTextCapped(file: JSZip.JSZipObject, cap: number): Promise<{ text: string; reason: CappedRead["reason"] }> {
  const read = await readEntryCapped(file, cap)
  if (!read.bytes) return { text: "", reason: read.reason || "unreadable" }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(read.bytes), reason: "" }
}

/** The most a package may become once unpacked. */
const MAX_UNPACKED_BYTES = LIMITS.packageBytes * 4

function checkDeclaredSizes(entries: JSZip.JSZipObject[]): ThemeError[] {
  const errors: ThemeError[] = []
  let total = 0
  for (const f of entries) {
    const size = declaredSize(f)
    total += size
    const limit = f.name.startsWith("assets/") ? LIMITS.assetBytes : LIMITS.sourceBytes
    if (size > limit) errors.push(err(`${f.name} unpacks to ${Math.round(size / 1024)} KB; the limit is ${Math.round(limit / 1024)} KB`, f.name))
  }
  if (total > MAX_UNPACKED_BYTES) {
    errors.push(err(`The package unpacks to ${Math.round(total / 1024 / 1024)} MB; the limit is ${MAX_UNPACKED_BYTES / 1024 / 1024} MB`))
  }
  return errors
}

export async function readPackage(bytes: Uint8Array, opts: ReadOptions = {}): Promise<Result<ReadPackage>> {
  if (bytes.byteLength > LIMITS.packageBytes) return { ok: false, errors: [err(`The package is ${Math.round(bytes.byteLength / 1024 / 1024)} MB; the limit is ${LIMITS.packageBytes / 1024 / 1024} MB`)] }
  let zip: JSZip
  try { zip = await JSZip.loadAsync(bytes) } catch { return { ok: false, errors: [err("This is not a zip file")] } }
  const entries = Object.values(zip.files).filter((f) => !f.dir)
  if (entries.length > LIMITS.filesPerPackage) return { ok: false, errors: [err(`${entries.length} files; the limit is ${LIMITS.filesPerPackage}`)] }

  // Before anything is decompressed. See checkDeclaredSizes.
  const tooBig = checkDeclaredSizes(entries)
  if (tooBig.length) return { ok: false, errors: tooBig }

  if (!zip.file("theme.json") && zip.file("manifest.json")) return readLegacy(zip, opts)

  const errors: ThemeError[] = []
  for (const f of entries) if (!isSafeThemePath(f.name)) errors.push(err(`${f.name} is not a path inside a theme`, f.name))
  if (errors.length) return { ok: false, errors }

  const themeFile = zip.file("theme.json")
  if (!themeFile) return { ok: false, errors: [err("A package needs a theme.json")] }
  let theme: ThemeManifest
  const themeText = await readEntryTextCapped(themeFile, LIMITS.sourceBytes)
  if (themeText.reason) return { ok: false, errors: [err(themeText.reason === "too_large" ? `theme.json is over ${Math.round(LIMITS.sourceBytes / 1024)} KB` : "theme.json could not be read", "theme.json")] }
  try { theme = JSON.parse(themeText.text) } catch { return { ok: false, errors: [err("theme.json is not valid JSON", "theme.json")] } }
  if (theme.format !== THEME_FORMAT) return { ok: false, errors: [err(`theme.json format is "${String(theme.format)}", not "${THEME_FORMAT}"`, "theme.json")] }
  const min = Number(theme.engine?.min ?? 1)
  if (min > ENGINE_VERSION) return { ok: false, errors: [err(`This theme needs engine ${min}; this is engine ${ENGINE_VERSION}`, "theme.json")] }
  if (typeof theme.name !== "string" || !theme.name) return { ok: false, errors: [err("theme.json needs a name", "theme.json")] }

  const manifestFile = zip.file("manifest.json")
  if (!manifestFile) return { ok: false, errors: [err("A package needs a manifest.json")] }
  let manifest: PackageManifest
  const manifestText = await readEntryTextCapped(manifestFile, LIMITS.sourceBytes)
  if (manifestText.reason) return { ok: false, errors: [err(manifestText.reason === "too_large" ? `manifest.json is over ${Math.round(LIMITS.sourceBytes / 1024)} KB` : "manifest.json could not be read", "manifest.json")] }
  try { manifest = JSON.parse(manifestText.text) } catch { return { ok: false, errors: [err("manifest.json is not valid JSON", "manifest.json")] } }
  if (!manifest.files || typeof manifest.files !== "object") return { ok: false, errors: [err("manifest.json has no files", "manifest.json")] }

  const files: ThemeFiles = {}
  const assets: Record<string, PackageAsset> = {}
  for (const f of entries) {
    if (f.name === "manifest.json") continue
    if (f.name.startsWith("assets/")) {
      /* Counted as it inflates, so a header that lies cannot fill the heap. */
      const read = await readEntryCapped(f, LIMITS.assetBytes)
      if (!read.bytes) { errors.push(err(read.reason === "too_large" ? `${f.name} is over ${LIMITS.assetBytes / 1024 / 1024} MB` : `${f.name} could not be read`, f.name)); continue }
      const data = read.bytes
      const hash = f.name.slice("assets/".length).split(".")[0]
      const rec = manifest.assets?.[hash]
      if (!rec) { errors.push(err(`${f.name} is not in the manifest`, f.name)); continue }
      if (sha256(data) !== hash) { errors.push(err(`${f.name}: its bytes do not hash to its name`, f.name)); continue }
      if (rec.size !== data.byteLength) { errors.push(err(`${f.name}: ${data.byteLength} bytes, the manifest says ${rec.size}`, f.name)); continue }
      assets[hash] = { bytes: data, filename: rec.filename, mime_type: rec.mime_type, width: rec.width, height: rec.height, alt_text: rec.alt_text }
      continue
    }
    const read = await readEntryTextCapped(f, LIMITS.sourceBytes)
    if (read.reason) { errors.push(err(read.reason === "too_large" ? `${f.name} is over ${LIMITS.sourceBytes / 1024} KB` : `${f.name} could not be read`, f.name)); continue }
    const text = read.text
    const rec = manifest.files[f.name]
    if (!rec) { errors.push(err(`${f.name} is not in the manifest`, f.name)); continue }
    if (rec.sha256 !== sha256(text)) { errors.push(err(`${f.name}: sha256 does not match the manifest`, f.name)); continue }
    files[f.name] = text
  }
  for (const path of Object.keys(manifest.files)) if (!(path in files) && !errors.some((e) => e.file === path)) errors.push(err(`${path} is in the manifest but not in the package`, path))
  for (const hash of Object.keys(manifest.assets ?? {})) if (!(hash in assets) && !errors.some((e) => e.file?.startsWith(`assets/${hash}`))) errors.push(err(`asset ${hash} is in the manifest but not in the package`))
  if (errors.length) return { ok: false, errors }

  const warnings: ThemeError[] = []
  const types = new Set<string>(opts.knownTypes ?? [])
  /**
   * A HEADER OR FOOTER WRITTEN AS A SECTION FILE IS KEPT, and placed.
   * The usual way it gets here is an AI that was handed the export and asked
   * to redo the header: it writes sections/site_header.storelib and puts it
   * at the top of a page. It used to be left out, which threw the creator's
   * header away. It is kept now, and the import puts it in the Header group
   * as the site's one header, with the built-in one hidden rather than drawn
   * twice (lib/storelib-theme/section-groups.ts, repairChrome).
   *
   * Only a file named exactly `header` or `footer` is left out: that is the
   * built-in section's own type, which every page's header settings are
   * stored for, and a file of that name would be read in its place. The
   * built-in header stays, and the warning says what to do instead.
   */
  for (const path of Object.keys(files)) {
    const m = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
    if (!m || (m[1] !== "header" && m[1] !== "footer")) continue
    delete files[path]
    warnings.push(err(`${path} takes the built-in ${m[1]}'s own name, so it was left out and the built-in ${m[1]} was kept. Save a ${m[1]} of your own under another name, such as sections/site_${m[1]}.storelib, with "kind": "${m[1]}".`, path))
  }
  for (const [path, text] of Object.entries(files)) {
    /* A theme block: compiled by a block's rules, and imported beside the sections that hold it. */
    if (path.startsWith("blocks/") && path.endsWith(".storelib")) {
      const r = compileThemeFile(text, { file: path })
      if (r.ok === false) errors.push(...r.errors.map((e) => ({ ...e, file: e.file ?? path })))
      continue
    }
    const m = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
    if (!m) { if (path.endsWith(".storelib") && path !== "layout/theme.storelib" && !path.startsWith("snippets/")) warnings.push(err(`${path} is not a section, block, layout or snippet`, path)); continue }
    // The file name is the type, as everywhere else. A package whose schema
    // line disagrees with its file name is imported under the file name
    // rather than refused: it is the same file that saved cleanly in the
    // editor it was exported from.
    const r = compileSection(text, { file: path })
    if (r.ok === false) errors.push(...r.errors.map((e) => ({ ...e, file: e.file ?? path })))
    else { types.add(m[1]); if (r.warnings) warnings.push(...r.warnings) }
  }
  if (errors.length) return { ok: false, errors }

  for (const [path, text] of Object.entries(files)) {
    /* A page's template, or Shopify's header and footer group files: the same shape, the same checks. */
    if (!/^templates\/[A-Za-z0-9_.\-]+\.json$/.test(path) && !/^sections\/(header|footer)-group\.json$/.test(path)) continue
    let t: Template
    try { t = JSON.parse(text) } catch { errors.push(err(`${path} is not valid JSON`, path)); continue }
    if (!t || typeof t !== "object" || typeof t.sections !== "object" || !Array.isArray(t.order)) { errors.push(err(`${path} needs "sections" and "order"`, path)); continue }
    if (t.order.length > LIMITS.sectionsPerTemplate) errors.push(err(`${path} has ${t.order.length} sections; the limit is ${LIMITS.sectionsPerTemplate}`, path))
    for (const id of t.order) {
      const s = t.sections[id]
      if (!s) { errors.push(err(`${path}: "${id}" is in the order but not in sections`, path)); continue }
      if (!types.has(s.type)) errors.push(err(`${path}: section "${id}" is a "${s.type}", which this theme does not have`, path))
      const n = countBlocks(listBlocks(s.blocks ?? {}, s.block_order ?? Object.keys(s.blocks ?? {})))
      if (n > LIMITS.blocksPerSection) errors.push(err(`${path}: "${id}" has ${n} blocks; the limit is ${LIMITS.blocksPerSection}`, path))
    }
  }
  if (errors.length) return { ok: false, errors }

  return { ok: true, value: { theme, files, assets, manifest, legacy: false, warnings }, warnings }
}

// ── The builder's earlier exports ───────────────────────────────────────────

/**
 * `manifest.json` + `images/`, as the builder exported before the package
 * format existed. Read into the folder layout: pages become templates,
 * settings become config/settings.json, images become assets and every
 * URL that pointed at one becomes its `asset://` reference. The install
 * record and the theme pack ride along in theme.json, untouched.
 */
async function readLegacy(zip: JSZip, opts: ReadOptions): Promise<Result<ReadPackage>> {
  let legacy: {
    format?: string; install?: { name?: string; [k: string]: unknown }; settings?: Record<string, unknown>
    pages?: { page_key: string; sections: unknown }[]; image_map?: Record<string, string>; theme_pack?: unknown; exported_at?: string
  }
  const legacyText = await readEntryTextCapped(zip.file("manifest.json")!, LIMITS.sourceBytes)
  if (legacyText.reason) return { ok: false, errors: [err(legacyText.reason === "too_large" ? `manifest.json is over ${Math.round(LIMITS.sourceBytes / 1024)} KB` : "manifest.json could not be read", "manifest.json")] }
  try { legacy = JSON.parse(legacyText.text) } catch { return { ok: false, errors: [err("manifest.json is not valid JSON", "manifest.json")] } }
  if (legacy.format !== "storelib-theme/v1" && legacy.format !== "storelib-theme/v2") return { ok: false, errors: [err(`manifest.json format "${String(legacy.format)}" is not one this engine reads`, "manifest.json")] }

  const assets: Record<string, PackageAsset> = {}
  const urlToRef: Record<string, string> = {}
  const localToHash: Record<string, string> = {}
  const images = zip.folder("images")
  if (images) {
    const list: JSZip.JSZipObject[] = []
    images.forEach((_, f) => { if (!f.dir) list.push(f) })
    for (const f of list) {
      const read = await readEntryCapped(f, LIMITS.assetBytes)
      if (!read.bytes) return { ok: false, errors: [err(read.reason === "too_large" ? `${f.name} is over ${LIMITS.assetBytes / 1024 / 1024} MB` : `${f.name} could not be read`, f.name)] }
      const data = read.bytes
      const ext = (f.name.split(".").pop() ?? "bin").toLowerCase()
      const hash = sha256(data)
      assets[hash] = { bytes: data, filename: f.name.slice("images/".length), mime_type: mimeForExt(ext) }
      localToHash[f.name] = hash
    }
  }
  for (const [url, local] of Object.entries(legacy.image_map ?? {})) {
    const hash = localToHash[local]
    if (hash) urlToRef[url] = `asset://${hash}`
  }
  const rewrite = (node: unknown): unknown => {
    if (typeof node === "string") return urlToRef[node] ?? node
    if (Array.isArray(node)) return node.map(rewrite)
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, rewrite(v)]))
    return node
  }

  const files: ThemeFiles = {}
  files["config/settings.json"] = JSON.stringify(rewrite(legacy.settings ?? {}), null, 2) + "\n"
  for (const page of legacy.pages ?? []) {
    if (!/^[A-Za-z0-9_.\-]+$/.test(page.page_key)) continue
    const sections = Array.isArray(page.sections) ? (rewrite(page.sections) as PageSection[]) : []
    files[`templates/${page.page_key}.json`] = JSON.stringify(templateFromSections(sections), null, 2) + "\n"
  }
  const theme: ThemeManifest = {
    format: THEME_FORMAT,
    format_version: THEME_FORMAT_VERSION,
    name: legacy.install?.name ?? "Imported theme",
    version: "1.0.0",
    engine: { min: 1 },
    migrated_from: legacy.format,
  }
  if (legacy.install) theme.install = legacy.install
  if (legacy.theme_pack) theme.theme_pack = legacy.theme_pack

  // The migrated theme goes through the same door as a native one.
  const rebuilt = await buildPackage({ theme, files, assets })
  const r = await readPackage(rebuilt, opts)
  if (r.ok === false) return r
  return { ok: true, value: { ...r.value, legacy: true }, warnings: r.warnings }
}

/** Every `asset://` reference a value tree holds. */
export function assetRefsIn(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (isAssetRef(node)) out.add(node.slice("asset://".length))
  else if (Array.isArray(node)) for (const v of node) assetRefsIn(v, out)
  else if (node && typeof node === "object") for (const v of Object.values(node as Record<string, unknown>)) assetRefsIn(v, out)
  return out
}
