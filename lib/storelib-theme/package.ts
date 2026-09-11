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
import { compileSection } from "./storelib/compile"
import {
  ENGINE_VERSION,
  LIMITS,
  THEME_FOLDERS,
  THEME_FORMAT,
  THEME_FORMAT_VERSION,
  isAssetRef,
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
  blocks?: { id: string; type: string; settings?: Record<string, unknown>; [k: string]: unknown }[]
  hidden?: boolean
  [k: string]: unknown
}

/** A page's section list, as `templates/<name>.json`. Ids and unknown keys survive. */
export function templateFromSections(list: PageSection[]): Template {
  const sections: Record<string, SectionInstanceData> = {}
  const order: string[] = []
  for (const s of list) {
    const { id, blocks, ...rest } = s
    const data: SectionInstanceData = { ...rest, type: s.type }
    if (blocks) {
      data.blocks = Object.fromEntries(blocks.map((b) => { const { id: bid, ...brest } = b; return [bid, { ...brest, type: b.type }] }))
      data.block_order = blocks.map((b) => b.id)
    }
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
    if (blocks) {
      const bo = Array.isArray(block_order) ? block_order : Object.keys(blocks)
      section.blocks = bo.filter((bid) => blocks[bid]).map((bid) => ({ ...blocks[bid], id: bid, type: blocks[bid].type, settings: blocks[bid].settings ?? {} }))
    }
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
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } })
}

// ── Reading ─────────────────────────────────────────────────────────────────

export interface ReadOptions {
  /** Section types the reader may reference that are not in the package (the application's JSON-described ones). */
  knownTypes?: readonly string[]
}

const err = (message: string, file?: string, line?: number): ThemeError => ({ stage: "package", message, file, line })

export async function readPackage(bytes: Uint8Array, opts: ReadOptions = {}): Promise<Result<ReadPackage>> {
  if (bytes.byteLength > LIMITS.packageBytes) return { ok: false, errors: [err(`The package is ${Math.round(bytes.byteLength / 1024 / 1024)} MB; the limit is ${LIMITS.packageBytes / 1024 / 1024} MB`)] }
  let zip: JSZip
  try { zip = await JSZip.loadAsync(bytes) } catch { return { ok: false, errors: [err("This is not a zip file")] } }
  const entries = Object.values(zip.files).filter((f) => !f.dir)
  if (entries.length > LIMITS.filesPerPackage) return { ok: false, errors: [err(`${entries.length} files; the limit is ${LIMITS.filesPerPackage}`)] }

  if (!zip.file("theme.json") && zip.file("manifest.json")) return readLegacy(zip, opts)

  const errors: ThemeError[] = []
  for (const f of entries) if (!isSafeThemePath(f.name)) errors.push(err(`${f.name} is not a path inside a theme`, f.name))
  if (errors.length) return { ok: false, errors }

  const themeFile = zip.file("theme.json")
  if (!themeFile) return { ok: false, errors: [err("A package needs a theme.json")] }
  let theme: ThemeManifest
  try { theme = JSON.parse(await themeFile.async("string")) } catch { return { ok: false, errors: [err("theme.json is not valid JSON", "theme.json")] } }
  if (theme.format !== THEME_FORMAT) return { ok: false, errors: [err(`theme.json format is "${String(theme.format)}", not "${THEME_FORMAT}"`, "theme.json")] }
  const min = Number(theme.engine?.min ?? 1)
  if (min > ENGINE_VERSION) return { ok: false, errors: [err(`This theme needs engine ${min}; this is engine ${ENGINE_VERSION}`, "theme.json")] }
  if (typeof theme.name !== "string" || !theme.name) return { ok: false, errors: [err("theme.json needs a name", "theme.json")] }

  const manifestFile = zip.file("manifest.json")
  if (!manifestFile) return { ok: false, errors: [err("A package needs a manifest.json")] }
  let manifest: PackageManifest
  try { manifest = JSON.parse(await manifestFile.async("string")) } catch { return { ok: false, errors: [err("manifest.json is not valid JSON", "manifest.json")] } }
  if (!manifest.files || typeof manifest.files !== "object") return { ok: false, errors: [err("manifest.json has no files", "manifest.json")] }

  const files: ThemeFiles = {}
  const assets: Record<string, PackageAsset> = {}
  for (const f of entries) {
    if (f.name === "manifest.json") continue
    if (f.name.startsWith("assets/")) {
      const data = await f.async("uint8array")
      if (data.byteLength > LIMITS.assetBytes) { errors.push(err(`${f.name} is over ${LIMITS.assetBytes / 1024 / 1024} MB`, f.name)); continue }
      const hash = f.name.slice("assets/".length).split(".")[0]
      const rec = manifest.assets?.[hash]
      if (!rec) { errors.push(err(`${f.name} is not in the manifest`, f.name)); continue }
      if (sha256(data) !== hash) { errors.push(err(`${f.name}: its bytes do not hash to its name`, f.name)); continue }
      if (rec.size !== data.byteLength) { errors.push(err(`${f.name}: ${data.byteLength} bytes, the manifest says ${rec.size}`, f.name)); continue }
      assets[hash] = { bytes: data, filename: rec.filename, mime_type: rec.mime_type, width: rec.width, height: rec.height, alt_text: rec.alt_text }
      continue
    }
    const text = await f.async("string")
    if (Buffer.byteLength(text, "utf8") > LIMITS.sourceBytes) { errors.push(err(`${f.name} is over ${LIMITS.sourceBytes / 1024} KB`, f.name)); continue }
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
  for (const [path, text] of Object.entries(files)) {
    const m = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
    if (!m) { if (path.endsWith(".storelib") && path !== "layout/theme.storelib" && !path.startsWith("snippets/")) warnings.push(err(`${path} is not a section, layout or snippet`, path)); continue }
    const r = compileSection(text, { file: path, expectType: m[1] })
    if (r.ok === false) errors.push(...r.errors.map((e) => ({ ...e, file: e.file ?? path })))
    else { types.add(m[1]); if (r.warnings) warnings.push(...r.warnings) }
  }
  if (errors.length) return { ok: false, errors }

  for (const [path, text] of Object.entries(files)) {
    if (!/^templates\/[A-Za-z0-9_.\-]+\.json$/.test(path)) continue
    let t: Template
    try { t = JSON.parse(text) } catch { errors.push(err(`${path} is not valid JSON`, path)); continue }
    if (!t || typeof t !== "object" || typeof t.sections !== "object" || !Array.isArray(t.order)) { errors.push(err(`${path} needs "sections" and "order"`, path)); continue }
    if (t.order.length > LIMITS.sectionsPerTemplate) errors.push(err(`${path} has ${t.order.length} sections; the limit is ${LIMITS.sectionsPerTemplate}`, path))
    for (const id of t.order) {
      const s = t.sections[id]
      if (!s) { errors.push(err(`${path}: "${id}" is in the order but not in sections`, path)); continue }
      if (!types.has(s.type)) errors.push(err(`${path}: section "${id}" is a "${s.type}", which this theme does not have`, path))
      const n = s.block_order?.length ?? Object.keys(s.blocks ?? {}).length
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
  try { legacy = JSON.parse(await zip.file("manifest.json")!.async("string")) } catch { return { ok: false, errors: [err("manifest.json is not valid JSON", "manifest.json")] } }
  if (legacy.format !== "storelib-theme/v1" && legacy.format !== "storelib-theme/v2") return { ok: false, errors: [err(`manifest.json format "${String(legacy.format)}" is not one this engine reads`, "manifest.json")] }

  const assets: Record<string, PackageAsset> = {}
  const urlToRef: Record<string, string> = {}
  const localToHash: Record<string, string> = {}
  const images = zip.folder("images")
  if (images) {
    const list: JSZip.JSZipObject[] = []
    images.forEach((_, f) => { if (!f.dir) list.push(f) })
    for (const f of list) {
      const data = await f.async("uint8array")
      if (data.byteLength > LIMITS.assetBytes) return { ok: false, errors: [err(`${f.name} is over ${LIMITS.assetBytes / 1024 / 1024} MB`, f.name)] }
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
