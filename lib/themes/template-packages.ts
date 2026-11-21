/**
 * ===========================================================================
 *  THE TEMPLATES THAT SHIP WITH STORELIB'S CODE, COMPOSED ON THE SERVER
 * ===========================================================================
 * A template is one theme's files and a small overlay of its own:
 *
 *   theme-packages/<package>/base/                   the theme, once: layout,
 *       sections, blocks, snippets, assets, locales, config/settings_schema
 *       .json, the pages every template shares (cart, search, 404 ...), a
 *       neutral config/settings_data.json and no starter content
 *   theme-packages/<package>/templates/<template>/   what makes it this
 *       starting website:
 *         templates/*.json          its home, product, collection, about,
 *                                   contact and FAQ pages
 *         sections/*-group.json     its header, footer and overlay groups
 *         config/settings_data.json { "current": { ... } }: only the theme
 *                                   settings it changes (colours, fonts),
 *                                   laid over the base's
 *         assets/*                  its own pictures, which a page names as
 *                                   shopify://shop_images/<file>
 *         menus.json                the navigation a store with none yet is
 *                                   given (not a file of the theme)
 *
 * `composeTemplateZip` lays the overlay over the base, file by file, and
 * answers the zip the import pipeline already takes (app/api/website-builder/
 * themes/import): the same parse, the same checks, the same storage of its
 * pictures under the creator's own account. Seven templates are one copy of
 * the theme and seven small folders, not seven copies.
 *
 * NOT PUBLIC. The theme is sold; its files are outside public/ and are read
 * here with fs, on the server, only when a creator adds a template. The
 * production build is told to carry the folder with the route that reads it
 * (next.config.mjs, outputFileTracingIncludes "/api/themes/**").
 *
 * No "server-only" import, so tests/theme-templates.test.ts runs it under
 * plain node; node:fs keeps it out of any browser bundle regardless.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import JSZip from "jszip"

import { CODE_TEMPLATES, CODE_THEME_PACKAGE } from "./marketplace-shared"

/** theme-packages/ in the deployed function and in the repository alike. */
export const TEMPLATE_PACKAGES_ROOT = join(process.cwd(), "theme-packages")

const ID_RE = /^([a-z0-9][a-z0-9-]{0,39})\/([a-z0-9][a-z0-9-]{0,39})$/
/** Overlay files that are Storelib's own notes about a template, never part of the theme. */
const OVERLAY_ONLY = new Set(["menus.json"])
const SETTINGS_DATA = "config/settings_data.json"

/** Every template the code lists, as "<package>/<template>". */
export const CODE_PACKAGE_IDS: readonly string[] = CODE_TEMPLATES.map((t) => `${CODE_THEME_PACKAGE}/${t.template}`)

export function isCodePackageId(id: unknown): id is string {
  return typeof id === "string" && ID_RE.test(id) && CODE_PACKAGE_IDS.includes(id)
}

function walk(dir: string, prefix = ""): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith(".")) continue
    const full = join(dir, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (statSync(full).isDirectory()) out.push(...walk(full, rel))
    else out.push(rel)
  }
  return out
}

export function templateDirs(id: string, root = TEMPLATE_PACKAGES_ROOT): { base: string; overlay: string } {
  const m = ID_RE.exec(id)
  if (!m) throw new Error(`"${id}" is not a template`)
  return { base: join(root, m[1], "base"), overlay: join(root, m[1], "templates", m[2]) }
}

/** The base's settings with the overlay's `current` over them, key by key. */
export function mergeSettingsData(baseText: string, overlayText: string): string {
  const base = JSON.parse(baseText) as { current?: unknown; presets?: unknown }
  const over = JSON.parse(overlayText) as { current?: unknown }
  const b = base.current && typeof base.current === "object" ? (base.current as Record<string, unknown>) : {}
  const o = over.current && typeof over.current === "object" ? (over.current as Record<string, unknown>) : {}
  return JSON.stringify({ ...base, current: { ...b, ...o } }, null, 2)
}

/** The theme's files for one template, by their path in the theme: the base, then the overlay over it. */
export function composeTemplateFiles(id: string, root = TEMPLATE_PACKAGES_ROOT): Map<string, Buffer> {
  if (!isCodePackageId(id)) throw new Error(`"${id}" is not a template`)
  const { base, overlay } = templateDirs(id, root)
  const files = new Map<string, Buffer>()
  for (const rel of walk(base)) files.set(rel, readFileSync(join(base, rel)))
  if (!files.has("layout/theme.liquid")) throw new Error(`The theme's files are missing (${id})`)
  const own = walk(overlay)
  if (!own.includes("templates/index.json")) throw new Error(`The template has no home page (${id})`)
  for (const rel of own) {
    if (OVERLAY_ONLY.has(rel)) continue
    const bytes = readFileSync(join(overlay, rel))
    const under = rel === SETTINGS_DATA ? files.get(rel) : undefined
    files.set(rel, under ? Buffer.from(mergeSettingsData(under.toString("utf8"), bytes.toString("utf8")), "utf8") : bytes)
  }
  return files
}

/** The zip the import takes. Stored, not deflated: it is read again in the same request and never sent anywhere. */
export async function composeTemplateZip(id: string, root = TEMPLATE_PACKAGES_ROOT): Promise<Buffer> {
  const zip = new JSZip()
  for (const [rel, bytes] of composeTemplateFiles(id, root)) zip.file(rel, bytes)
  return zip.generateAsync({ type: "nodebuffer", compression: "STORE" })
}

/** The navigation a template gives a store that has none yet, or null. The store's own menus always win (store-menus-server.ts). */
export function templateMenus(id: string, root = TEMPLATE_PACKAGES_ROOT): Record<string, unknown> | null {
  if (!isCodePackageId(id)) return null
  try {
    const parsed = JSON.parse(readFileSync(join(templateDirs(id, root).overlay, "menus.json"), "utf8")) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
