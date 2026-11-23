/**
 * ===========================================================================
 *  A THEME AT A RELEASE: COMPOSED AND CONVERTED, WITH NO DATABASE IN SIGHT
 * ===========================================================================
 * The half of lib/themes/releases-server.ts that is files in and files out:
 * a release's zip read into paths, a template's base and overlay laid one
 * over the other, the whole converted exactly as an import converts it, and
 * the hashes an update tells a creator's edits by. The server module adds
 * the database, storage and the cache around it. No "server-only" import
 * and no Next import, so tests/theme-releases.test.ts runs it under node;
 * node:fs (through template-packages.ts) keeps it out of any browser bundle.
 */
import JSZip from "jszip"

import { convertShopifyTheme, isShopifyTheme, type ConversionReport, type ImportedTheme } from "@/lib/storelib-theme/shopify/convert"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "./marketplace-shared"
import { isZipJunk } from "./zip-rules"
import { layerOver, readTemplateLayer } from "./template-packages"
import { BASE_TARGET, compareVersions, currentLayers, isCodeTemplateSlug, releasesFor, type ReleaseLayer, type ReleaseSource, type ThemeRelease } from "./releases-shared"
import { shippedHashes } from "./release-merge"

export type ReleaseRow = {
  id: string
  target: string
  family: string
  version: string
  notes: string | null
  source: string
  published: boolean | null
  published_at: string | null
  created_at: string | null
  layer?: string | null
  package_path?: string | null
  manifest?: Record<string, string> | null
  files?: number | null
  updated_at?: string | null
}

export function rowToRelease(r: ReleaseRow): ThemeRelease {
  return {
    id: r.id,
    target: r.target,
    family: r.family,
    version: r.version,
    notes: r.notes ?? "",
    source: (r.source === "code" ? "code" : "zip") as ReleaseSource,
    published: !!r.published,
    publishedAt: r.published_at ?? null,
    createdAt: r.created_at ?? new Date(0).toISOString(),
  }
}

const asRelease = (r: ReleaseRow) => ({ ...rowToRelease(r), row: r })

/** A template's "<package>/<template>", or null for a listing that is not one. */
export function codePackageOf(slug: string): string | null {
  const t = CODE_TEMPLATES.find((c) => c.slug === slug)
  return t ? `${CODE_THEME_PACKAGE}/${t.template}` : null
}
/** The template a base release is checked with: the default one. */
export const DEFAULT_CODE_PACKAGE = `${CODE_THEME_PACKAGE}/${CODE_TEMPLATES[0].template}`

const TOP = /^(layout|sections|blocks|snippets|templates|config|assets|locales)\//

/** A zip's files by their path in the theme, one folder down when it was zipped as a folder (dawn-main/...). */
export async function unzipLayer(buf: Buffer): Promise<Map<string, Buffer>> {
  const zip = await JSZip.loadAsync(buf)
  const names = Object.values(zip.files).filter((f) => !f.dir && !isZipJunk(f.name)).map((f) => f.name)
  const first = names[0]?.split("/")[0] ?? ""
  const folder = !names.some((n) => TOP.test(n)) && names.length > 0 && names.every((n) => n.startsWith(`${first}/`)) ? `${first}/` : ""
  const out = new Map<string, Buffer>()
  for (const name of names) out.set(name.slice(folder.length), Buffer.from(await zip.file(name)!.async("uint8array")))
  return out
}

export async function zipOf(files: ReadonlyMap<string, Buffer>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [rel, bytes] of files) zip.file(rel, bytes)
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } })
}

export const layerOf = (files: ReadonlyMap<string, Buffer>): ReleaseLayer => (files.has("layout/theme.liquid") ? "theme" : "overlay")

/** Reads a release's files from wherever they are kept: storage on the server, a map in a test. */
export type LoadRelease = (row: Pick<ReleaseRow, "package_path">) => Promise<Map<string, Buffer>>

export type ConvertedTheme = { ok: true; theme: ImportedTheme; report: ConversionReport } | { ok: false; error: string }

/** The theme's files converted exactly as an import converts them. */
export async function convertFiles(files: ReadonlyMap<string, Buffer>, name = "Theme"): Promise<ConvertedTheme> {
  const zip = await JSZip.loadAsync(await zipOf(files))
  if (!isShopifyTheme(zip)) return { ok: false, error: "A release is a theme in the folders layout, sections and templates, with layout/theme.liquid and templates/index.json." }
  return convertShopifyTheme(zip, { fallbackName: name })
}

/**
 * The files a listing is at its newest published releases, and that
 * version. Null when it has none (it is what the code or its uploaded zip
 * says, as before releases).
 */
export async function releasedFiles(slug: string, rows: readonly ReleaseRow[], load: LoadRelease): Promise<{ files: Map<string, Buffer>; version: string } | null> {
  const withRows = rows.map(asRelease)
  const { base, own } = currentLayers(slug, withRows)
  if (!base && !own) return null
  const version = [base?.version, own?.version].filter((v): v is string => !!v).sort((a, b) => compareVersions(b, a))[0]
  if (!isCodeTemplateSlug(slug)) return own ? { files: await load(own.row), version } : null
  const id = codePackageOf(slug)!
  if (own && own.row.layer === "theme" && (!base || compareVersions(own.version, base.version) > 0)) return { files: await load(own.row), version }
  const under = base ? await load(base.row) : readTemplateLayer(id, "base")
  const over = own && own.row.layer !== "theme" ? await load(own.row) : readTemplateLayer(id, "overlay")
  return { files: layerOver(under, over), version }
}

/**
 * A new release's files made into a whole theme to check and hash: a base
 * under the default template's overlay, a template's overlay over the base
 * it would be laid on now, a whole theme as it is.
 */
export async function wholeThemeFor(target: string, files: Map<string, Buffer>, rows: readonly ReleaseRow[], load: LoadRelease): Promise<Map<string, Buffer>> {
  if (target === BASE_TARGET) return layerOver(files, readTemplateLayer(DEFAULT_CODE_PACKAGE, "overlay"))
  if (layerOf(files) === "theme" || !isCodeTemplateSlug(target)) return files
  const { base } = currentLayers(target, rows.map(asRelease))
  return layerOver(base ? await load(base.row) : readTemplateLayer(codePackageOf(target)!, "base"), files)
}

/** Every hash any published release that reaches this listing shipped at each path: what "not edited" looks like. */
export function shippedFor(slug: string, rows: readonly ReleaseRow[]): Record<string, string[]> {
  return shippedHashes(releasesFor(slug, rows.map(asRelease)).map((r) => (r.row.manifest ?? {}) as Record<string, string>))
}
