/**
 * ===========================================================================
 *  A WHOLE THEME AS A REPOSITORY, AND BACK
 * ===========================================================================
 * The first version of GitHub sync wrote `sections/*.storelib` and nothing
 * else, so a repository had a third of a theme in it: no settings, no pages,
 * no blocks, and for an imported Shopify theme none of its own files. An
 * agent asked to change the header colour or a page's order had nothing to
 * change. Now the repository is the theme:
 *
 *   README.md, AGENTS.md, CLAUDE.md, storelib.json   written by Storelib
 *   config/settings.json        the theme's settings, every   (read back)
 *                               one of Storelib's own with
 *                               its default written out
 *   config/storelib_settings_   what Storelib adds to Theme   (reference)
 *     schema.json               settings: ids, types, labels,
 *                               options, defaults, groups
 *   config/settings_schema.json what those settings are       (read back:
 *                               the theme's own groups over
 *                               Storelib's, see lib/storelib-
 *                               theme/theme-config.ts)
 *   templates/<page>.json       each page's own sections      (read back)
 *   sections/*-group.json       the header, footer, overlay   (read back)
 *   sections/*.storelib         every section, built-in too   (read back)
 *   sections/<type>.json        a built-in drawn by Storelib  (reference)
 *   blocks/, snippets/, layout/ the theme's other files       (read back)
 *   shopify/**                  an imported theme's own files (read back,
 *                               pictures excepted)
 *
 * The page files are the package's (lib/website-builder/theme-pages.ts), so
 * a repository and a downloaded theme read the same way.
 *
 * Pure: no database, no GitHub. lib/github-sync/sync.ts does the talking and
 * tests/github-theme-sync.test.ts runs this as it is.
 */
import { createHash } from "node:crypto"
import { sectionsFromTemplate } from "@/lib/storelib-theme/package"
import { inGroup, splitGroups } from "@/lib/storelib-theme/section-groups"
import { FOOTER_GROUP_PATH, HEADER_GROUP_PATH, OVERLAY_GROUP_PATH, packageFilesFromPages } from "@/lib/website-builder/theme-pages"
import type { Template } from "@/lib/storelib-theme/types"
import {
  COMPAT_PANEL_PATH,
  LIVE_PREVIEW_EVENTS,
  PLATFORM_SETTINGS_PATH,
  compatPlatformGroup,
  declaredIds,
  platformSettingsDoc,
  readPanel,
  withPlatformValues,
  type ThemeKind,
} from "@/lib/storelib-theme/platform-settings"

/** Written into storelib.json, so a tool can tell what it is reading. */
export const REPO_FORMAT = "storelib-repo/1"

/** One file of the theme, at most. A blob over this is left out and said so. */
export const MAX_REPO_FILE_BYTES = 20 * 1024 * 1024
/** The whole export, at most. A function holds it in memory while it sends it. */
export const MAX_REPO_TOTAL_BYTES = 120 * 1024 * 1024
/** Files one export writes, at most. */
export const MAX_REPO_FILES = 3000
/** A path, at most. Windows checkouts break well before Git does. */
export const MAX_PATH_LENGTH = 240

export const SETTINGS_PATH = "config/settings.json"
export const SETTINGS_SCHEMA_PATH = "config/settings_schema.json"
/** Shopify's name for the values file: taken as config/settings.json is, with what it leaves out kept. */
export const SETTINGS_DATA_PATH = "config/settings_data.json"
export const MANIFEST_PATH = "storelib.json"
export { PLATFORM_SETTINGS_PATH }
export const GENERATED = new Set(["README.md", "AGENTS.md", "CLAUDE.md", MANIFEST_PATH])
const GROUP_FILES: Record<string, "header" | "footer" | "overlay"> = {
  [HEADER_GROUP_PATH]: "header",
  [FOOTER_GROUP_PATH]: "footer",
  [OVERLAY_GROUP_PATH]: "overlay",
}

/** Pictures and videos an imported theme shipped: in the repository to look at, uploaded in Files to change. */
const MEDIA_EXT = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|mp4|webm|mov|m4v|ogv|mp3|wav|pdf)$/i
/** Fonts, kept by Storelib as `base64:` text and sent to GitHub as their bytes. */
const FONT_EXT = /\.(woff2?|ttf|otf|eot)$/i

/**
 * What a path in the repository is to Storelib.
 *
 *   generated       README, AGENTS, CLAUDE, storelib.json: Storelib writes them
 *   settings        config/settings.json, read back into the theme's settings
 *   reference       there to read; a change to it is not taken
 *   template        templates/<page>.json, read back into that page
 *   group           the header, footer or overlay group, read back into every page
 *   source          a .storelib file: section, block, snippet, layout
 *   shopify         an imported theme's own text file under shopify/
 *   font            a font under shopify/assets
 *   media           a picture or video under shopify/assets: not taken back
 *   theme-file      another theme file Storelib keeps (assets/styles.css...)
 *   outside         not part of the theme: the repository's own
 */
export type RepoRole =
  | "generated"
  | "settings"
  | "reference"
  | "template"
  | "group"
  | "source"
  | "shopify"
  | "font"
  | "media"
  | "theme-file"
  | "outside"

const SOURCE = /^(sections|blocks|snippets|layout)\/[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}\.storelib$/
const TEMPLATE = /^templates\/([A-Za-z0-9_.-]{1,80})\.json$/
const THEME_FOLDERS = /^(assets|locales|config|snippets|layout)\/[A-Za-z0-9_][A-Za-z0-9_./-]*$/

/** A theme path that is safe to store: no climbing, no absolute, no odd bytes. */
export function safeRepoThemePath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= MAX_PATH_LENGTH &&
    !path.includes("..") &&
    !path.startsWith("/") &&
    !path.includes("\0") &&
    !path.includes("\\") &&
    !path.split("/").some((p) => p === "" || p === ".")
  )
}

export function roleOf(path: string, opts: { compat: boolean }): RepoRole {
  if (!safeRepoThemePath(path)) return "outside"
  if (GENERATED.has(path)) return "generated"
  if (path === SETTINGS_PATH) return "settings"
  /* What Storelib adds to Theme settings: its own, to read; the values are in config/settings.json. */
  if (path === PLATFORM_SETTINGS_PATH) return "reference"
  /* Shopify's name for the values file, read into the same settings (lib/storelib-theme/theme-config.ts). */
  if (path === SETTINGS_DATA_PATH && !opts.compat) return "settings"
  /* The theme's own Theme settings, over Storelib's: read back like any theme file. */
  if (path === SETTINGS_SCHEMA_PATH && !opts.compat) return "theme-file"
  if (GROUP_FILES[path]) return "group"
  if (TEMPLATE.test(path)) return "template"
  if (SOURCE.test(path)) return "source"
  if (/^sections\/[a-z0-9_-]{1,64}\.json$/.test(path)) return "reference"
  if (path.startsWith("shopify/")) {
    if (!opts.compat) return "outside"
    if (/^shopify\/(config\/assets\.json|import-report\.json|config\/settings_panel\.json)$/.test(path)) return "reference"
    const name = path.slice("shopify/".length)
    if (name.startsWith("assets/") && FONT_EXT.test(name)) return "font"
    if (name.startsWith("assets/") && MEDIA_EXT.test(name)) return "media"
    return "shopify"
  }
  if (THEME_FOLDERS.test(path) && !MEDIA_EXT.test(path)) return "theme-file"
  return "outside"
}

/** Whether a change to a file in this role is taken into the site. */
export function readsBack(role: RepoRole): boolean {
  return role === "settings" || role === "template" || role === "group" || role === "source" || role === "shopify" || role === "font" || role === "theme-file"
}

/** Git's own name for a file's bytes, so a file GitHub already has is never sent again. */
export function gitBlobSha(data: string | Uint8Array): string {
  const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data)
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex")
}

/** A font kept as `base64:` text, as its bytes; anything else as it is. */
export function fontBytes(text: string): Uint8Array | null {
  if (!text.startsWith("base64:")) return null
  try {
    return new Uint8Array(Buffer.from(text.slice(7), "base64"))
  } catch {
    return null
  }
}

/* ── what goes into the repository ─────────────────────────────────────── */

export interface ThemeSnapshot {
  name: string
  /** An imported Shopify theme (settings.compat). */
  compat: boolean
  /** The theme's settings as the builder has them: the draft where there is one. */
  settings: Record<string, unknown>
  /** Every page as the builder has it. */
  pages: { page_key: string; sections: unknown }[]
  /** Every file the install saved, draft first, empty ones left out. */
  files: Record<string, string>
  /** The built-in .storelib files every native theme stands on. Empty for an imported theme. */
  defaults: Record<string, string>
  /** Built-in sections drawn by Storelib itself (no .storelib): their schemas, to read. */
  referenceSchemas?: Record<string, unknown>
  /** Storelib's own settings_schema.json for a native theme, written when the theme has none of its own. */
  settingsSchema?: unknown
  /** An imported theme's pictures, by their name in assets/, fetched for the export. */
  media?: Record<string, Uint8Array>
  /** Pictures that could not be fetched, by name, with why. */
  mediaSkipped?: { name: string; reason: string }[]
  /** Pictures the repository already has from the same address: not fetched, not sent, left as they are. */
  mediaKept?: string[]
  /** Pictures not fetched before the time ran out: the next send takes them. */
  mediaLater?: string[]
  /** `settings.menus` are the store's (store_menus), shared by every theme: a change to them is written there too. */
  storeMenus?: boolean
}

export interface RepoFile {
  /** The path inside the theme; the repository's folder goes in front. */
  path: string
  text?: string
  bytes?: Uint8Array
  role: RepoRole
}

export interface Skipped {
  path: string
  reason: string
}

export interface Override {
  path: string
  type: string
  kind: "section" | "block"
}

/**
 * Built-in files this theme has its own copy of: a saved row at a path the
 * built-in theme also has (or, for a section Storelib draws itself, a
 * .storelib file named after it). The site draws the copy; every other site
 * keeps Storelib's.
 */
export function overridesOf(snap: Pick<ThemeSnapshot, "files" | "defaults" | "referenceSchemas" | "compat">): Override[] {
  if (snap.compat) return []
  const out: Override[] = []
  for (const path of Object.keys(snap.files).sort()) {
    const m = path.match(/^(sections|blocks)\/(_?[a-z0-9][a-z0-9_-]*)\.storelib$/)
    if (!m) continue
    const builtIn = path in snap.defaults || (m[1] === "sections" && !!snap.referenceSchemas && m[2] in snap.referenceSchemas)
    if (builtIn && snap.files[path] !== snap.defaults[path]) out.push({ path, type: m[2], kind: m[1] === "sections" ? "section" : "block" })
  }
  return out
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n"

/**
 * What Storelib's own settings are for this theme: which kind, the ids an
 * imported theme's panel declares itself (those are the theme's, and leave
 * Storelib's group), a Storelib theme's own settings_schema.json.
 */
export function platformContext(snap: Pick<ThemeSnapshot, "compat" | "files">): { kind: ThemeKind; declared: Set<string>; themeSchemaText: string | null } {
  return {
    kind: snap.compat ? "shopify" : "storelib",
    declared: snap.compat ? declaredIds(readPanel(snap.files[COMPAT_PANEL_PATH])) : new Set<string>(),
    themeSchemaText: snap.compat ? null : (snap.files[SETTINGS_SCHEMA_PATH] ?? null),
  }
}

/** The settings as config/settings.json holds them: the builder's, with Storelib's defaults written out. */
export function repoSettings(snap: Pick<ThemeSnapshot, "compat" | "files" | "settings">): Record<string, unknown> {
  const ctx = platformContext(snap)
  return withPlatformValues(snap.settings ?? {}, ctx.kind, ctx)
}

/**
 * Every file of the theme as the repository holds it, plus what was left
 * out and why. Deterministic: the same theme gives the same bytes, so an
 * export of a site that has not changed sends nothing.
 */
export function themeFiles(
  snap: ThemeSnapshot,
  guides: (info: { overrides: Override[]; skipped: Skipped[] }) => { readme: string; agents: string; claude: string },
): { files: RepoFile[]; skipped: Skipped[]; overrides: Override[] } {
  const files = new Map<string, RepoFile>()
  const skipped: Skipped[] = []
  const put = (f: RepoFile) => files.set(f.path, f)
  const compat = { compat: snap.compat }

  /* The theme's source files: the built-in ones, then the install's own over them. */
  for (const [path, text] of Object.entries(snap.defaults)) put({ path, text, role: roleOf(path, compat) })
  for (const [path, text] of Object.entries(snap.files)) {
    const role = roleOf(path, compat)
    if (role === "outside" || role === "generated" || GROUP_FILES[path] || role === "settings" || TEMPLATE.test(path)) {
      /* A saved row that would collide with what Storelib writes from the pages or settings is not the theme's truth. */
      if (role !== "outside") continue
      skipped.push({ path, reason: "Not a path a theme file can have in the repository" })
      continue
    }
    if (role === "font" || (role === "media" && text.startsWith("base64:"))) {
      const bytes = fontBytes(text)
      if (bytes) put({ path, bytes, role })
      else skipped.push({ path, reason: "Its stored bytes could not be read" })
      continue
    }
    put({ path, text, role })
  }

  /* Built-in sections Storelib draws itself: their schema to read, beside any copy of the creator's. */
  for (const [type, schema] of Object.entries(snap.referenceSchemas ?? {})) {
    if (!/^[a-z0-9_-]{1,64}$/.test(type)) continue
    put({ path: `sections/${type}.json`, text: json(schema), role: "reference" })
  }
  /* The theme's own file when it has one (put above, with its other files); Storelib's groups, to start from, when it has none. */
  if (!snap.compat && snap.settingsSchema !== undefined && !(SETTINGS_SCHEMA_PATH in snap.files)) put({ path: SETTINGS_SCHEMA_PATH, text: json(snap.settingsSchema), role: "theme-file" })

  /* The settings and the pages, as the builder has them; Storelib's own settings with their defaults, and what they are. */
  const platform = platformContext(snap)
  put({ path: SETTINGS_PATH, text: json(repoSettings(snap)), role: "settings" })
  put({ path: PLATFORM_SETTINGS_PATH, text: json(platformSettingsDoc(platform.kind, platform)), role: "reference" })
  /* An imported theme's panel as the builder lists it: the theme's groups, then Storelib's, saying whose it is. */
  if (snap.compat && typeof snap.files[COMPAT_PANEL_PATH] === "string") {
    const own = readPanel(snap.files[COMPAT_PANEL_PATH])
    const mine = compatPlatformGroup(platform.declared)
    if (own.length || mine) {
      const listed = [...own, ...(mine ? [{ name: mine.name, source: "storelib", defined_in: PLATFORM_SETTINGS_PATH, values_in: `${SETTINGS_PATH} under "shopify"`, settings: mine.settings }] : [])]
      put({ path: COMPAT_PANEL_PATH, text: json(listed), role: "reference" })
    }
  }
  for (const [path, text] of Object.entries(packageFilesFromPages(snap.pages))) put({ path, text, role: roleOf(path, compat) })

  /* An imported theme's pictures, fetched by the caller. */
  for (const [name, bytes] of Object.entries(snap.media ?? {})) {
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.@ -]{0,150}$/.test(name)) continue
    put({ path: `shopify/assets/${name}`, bytes, role: "media" })
  }
  for (const m of snap.mediaSkipped ?? []) skipped.push({ path: `shopify/assets/${m.name}`, reason: m.reason })

  /* What cannot travel: a path GitHub or a checkout would choke on, a file too large, too many files. */
  const out: RepoFile[] = []
  let total = 0
  const sorted = [...files.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  for (const f of sorted) {
    if (!safeRepoThemePath(f.path)) {
      skipped.push({ path: f.path, reason: `The path is longer than ${MAX_PATH_LENGTH} characters or not a plain path` })
      continue
    }
    const size = f.bytes ? f.bytes.byteLength : Buffer.byteLength(f.text ?? "", "utf8")
    if (size > MAX_REPO_FILE_BYTES) {
      skipped.push({ path: f.path, reason: `It is ${(size / 1048576).toFixed(1)} MB; files over ${MAX_REPO_FILE_BYTES / 1048576} MB stay in Storelib` })
      continue
    }
    if (total + size > MAX_REPO_TOTAL_BYTES) {
      skipped.push({ path: f.path, reason: `The theme is over ${MAX_REPO_TOTAL_BYTES / 1048576} MB; the rest stays in Storelib` })
      continue
    }
    if (out.length >= MAX_REPO_FILES) {
      skipped.push({ path: f.path, reason: `A repository export holds ${MAX_REPO_FILES} files` })
      continue
    }
    total += size
    out.push(f)
  }

  /* The guides and storelib.json last, so they can say what was left out. Stable: no time in them. */
  const overrides = overridesOf(snap)
  const guide = guides({ overrides, skipped })
  out.push({ path: "AGENTS.md", text: guide.agents, role: "generated" })
  out.push({ path: "CLAUDE.md", text: guide.claude, role: "generated" })
  out.push({ path: "README.md", text: guide.readme, role: "generated" })
  const manifest = {
    format: REPO_FORMAT,
    theme: snap.name,
    kind: snap.compat ? "shopify" : "storelib",
    docs: "https://storelib.com/developers",
    reads_back: snap.compat
      ? ["config/settings.json", "templates/*.json", "sections/*-group.json", "sections/*.storelib", "blocks/*.storelib", "snippets/*.storelib", "layout/*.storelib", "shopify/** (pictures excepted)"]
      : ["config/settings.json", "config/settings_data.json", "config/settings_schema.json", "templates/*.json", "sections/*-group.json", "sections/*.storelib", "blocks/*.storelib", "assets/*", "locales/*"],
    reference_only: ["README.md", "AGENTS.md", "CLAUDE.md", "storelib.json", PLATFORM_SETTINGS_PATH, ...(snap.compat ? ["shopify/assets/<pictures>", "shopify/config/assets.json", "shopify/config/settings_panel.json"] : ["sections/<type>.json"])],
    platform_settings: {
      defined_in: PLATFORM_SETTINGS_PATH,
      values_in: SETTINGS_PATH,
      values_at: snap.compat ? "shopify" : "",
      panels: (platformSettingsDoc(platform.kind, platform).panels as { name: string; shown: boolean }[]).filter((p) => p.shown).map((p) => p.name),
      theme_placement: snap.compat
        ? "A storelib_* id the theme's shopify/config/settings_schema.json declares is drawn where the theme puts it and left out of Storelib's panel."
        : "config/settings_schema.json may move, relabel or change the default of a Storelib setting; it keeps its id, type and group.",
    },
    live_preview: {
      about: "Events the builder's canvas dispatches when the creator changes something, so a script can redraw in place.",
      events: LIVE_PREVIEW_EVENTS.map((e) => ({ ...e })),
    },
    edited_built_ins: overrides.map((o) => o.path),
    left_out: skipped.map((s) => s.path).sort(),
  }
  out.push({ path: MANIFEST_PATH, text: json(manifest), role: "generated" })
  return { files: out, skipped, overrides }
}

/* ── pages, back from the repository ───────────────────────────────────── */

type Section = { id: string; type: string; settings?: Record<string, unknown>; blocks?: unknown[]; group?: string } & Record<string, unknown>

/** JSON's own error, with the line it is on, for a commit status a person reads. */
export function jsonError(path: string, text: string): string | null {
  try {
    JSON.parse(text)
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : "not valid JSON"
    const named = Number(/position (\d+)/.exec(msg)?.[1])
    const at = Number.isFinite(named) ? named : errorOffset(text)
    const line = at !== null ? text.slice(0, at).split("\n").length : null
    const what = msg.replace(/^JSON\.parse: /, "").split(/ in JSON at position| \(line \d|, (?:\.\.\.)?"[\s\S]*" is not valid JSON| is not valid JSON/)[0].trim()
    return `${path}${line ? ` line ${line}` : ""}: not valid JSON${what ? ` (${what.slice(0, 60)})` : ""}`
  }
}

/**
 * Where JSON.parse gave up, for engines whose message does not say: the
 * shortest prefix that fails for a reason other than ending too soon. About
 * twenty parses for a file of a megabyte.
 */
function errorOffset(text: string): number | null {
  const early = (n: number) => {
    try {
      JSON.parse(text.slice(0, n))
      return true
    } catch (e) {
      return /end of (json )?input|Unterminated|Expected .* after|Unexpected end/i.test(e instanceof Error ? e.message : "")
    }
  }
  let lo = 0
  let hi = text.length
  if (early(hi)) return null
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (early(mid)) lo = mid + 1
    else hi = mid
  }
  return Math.max(0, lo - 1)
}

function readTemplate(path: string, text: string): { list: Section[] } | { error: string } {
  const bad = jsonError(path, text)
  if (bad) return { error: bad }
  const t = JSON.parse(text) as Template
  if (!t || typeof t !== "object" || Array.isArray(t) || !t.sections || typeof t.sections !== "object" || Array.isArray(t.sections)) {
    return { error: `${path}: needs "sections" (an object of sections by id) and "order" (their ids in order), as Storelib wrote it` }
  }
  if (t.order !== undefined && !Array.isArray(t.order)) return { error: `${path}: "order" is a list of section ids` }
  for (const id of t.order ?? []) {
    if (typeof id !== "string" || !t.sections[id]) return { error: `${path}: "order" names "${String(id)}", which is not in "sections"` }
  }
  return { list: sectionsFromTemplate(t) as Section[] }
}

/**
 * A page's sections after a push, file by file. A page whose template
 * changed takes the repository's; a group that changed is put on every page
 * that had that group; everything else stays as the site has it. So a push
 * that changed only the footer cannot undo the creator's work on the home
 * page, and the other way round.
 */
export function mergePages(
  current: { page_key: string; sections: unknown }[],
  changed: Record<string, string>,
  opts: { knownTypes: (type: string) => boolean; maxSections: number; newPageKey: (key: string) => boolean },
): { pages: { page_key: string; sections: Section[] }[]; errors: Skipped[] } {
  const errors: Skipped[] = []
  const groups: Partial<Record<"header" | "footer" | "overlay", Section[]>> = {}
  for (const [path, kind] of Object.entries(GROUP_FILES)) {
    if (!(path in changed)) continue
    const r = readTemplate(path, changed[path])
    if ("error" in r) errors.push({ path, reason: r.error })
    else groups[kind] = r.list.map((s) => inGroup(s, kind) as Section)
  }
  const templates: Record<string, Section[]> = {}
  for (const [path, text] of Object.entries(changed)) {
    const m = TEMPLATE.exec(path)
    if (!m) continue
    const r = readTemplate(path, text)
    if ("error" in r) errors.push({ path, reason: r.error })
    else templates[m[1]] = r.list
  }

  /* Every section a changed file names must be one the theme can draw. */
  const check = (path: string, list: Section[]): boolean => {
    for (const s of list) {
      if (typeof s.type !== "string" || !/^[a-z0-9_-]{1,64}$/.test(s.type)) {
        errors.push({ path, reason: `${path}: section "${s.id}" has no valid "type"` })
        return false
      }
      if (!opts.knownTypes(s.type)) {
        errors.push({ path, reason: `${path}: section "${s.id}" is a "${s.type}", and there is no sections/${s.type}.storelib in this theme. Add the file in the same push, or use a section the theme has` })
        return false
      }
      if (s.settings !== undefined && (typeof s.settings !== "object" || s.settings === null || Array.isArray(s.settings))) {
        errors.push({ path, reason: `${path}: section "${s.id}" has "settings" that is not an object` })
        return false
      }
    }
    return true
  }
  for (const [kind, list] of Object.entries(groups) as ["header" | "footer" | "overlay", Section[]][]) {
    const path = Object.keys(GROUP_FILES).find((p) => GROUP_FILES[p] === kind)!
    if (!check(path, list)) delete groups[kind]
  }
  for (const [key, list] of Object.entries(templates)) {
    if (!check(`templates/${key}.json`, list)) delete templates[key]
  }

  const out: { page_key: string; sections: Section[] }[] = []
  const keys = new Set(current.map((p) => p.page_key))
  const touch = (key: string, before: Section[] | null) => {
    const cur = splitGroups((before ?? []) as Section[])
    const isHome = key === "home"
    const header = groups.header && (cur.header.length || isHome || before === null) ? groups.header : cur.header
    const footer = groups.footer && (cur.footer.length || isHome || before === null) ? groups.footer : cur.footer
    const overlay = groups.overlay && (cur.overlay.length || isHome || before === null) ? groups.overlay : cur.overlay
    const own = templates[key] ?? cur.template
    const list = [...header, ...own, ...footer, ...overlay]
    if (list.length > opts.maxSections) {
      errors.push({ path: `templates/${key}.json`, reason: `templates/${key}.json: a page holds ${opts.maxSections} sections, and this would make ${list.length}` })
      return
    }
    out.push({ page_key: key, sections: list })
  }
  const anyGroup = Object.keys(groups).length > 0
  for (const p of current) {
    if (!templates[p.page_key] && !anyGroup) continue
    touch(p.page_key, Array.isArray(p.sections) ? (p.sections as Section[]) : [])
  }
  for (const key of Object.keys(templates)) {
    if (keys.has(key)) continue
    if (!opts.newPageKey(key)) {
      errors.push({ path: `templates/${key}.json`, reason: `templates/${key}.json: a new page's name is lowercase letters, numbers and hyphens` })
      continue
    }
    /* A new page gets the home page's header and footer, as one made in the builder does. */
    const home = current.find((p) => p.page_key === "home")
    const chrome = splitGroups((Array.isArray(home?.sections) ? home!.sections : []) as Section[])
    out.push({ page_key: key, sections: [...(groups.header ?? chrome.header), ...templates[key], ...(groups.footer ?? chrome.footer), ...(groups.overlay ?? chrome.overlay)] })
  }
  return { pages: out, errors }
}

/* ── the README ────────────────────────────────────────────────────────── */

export function repoReadme(opts: { siteName: string; branch: string; root: string; compat: boolean; overrides: Override[]; skipped: Skipped[] }): string {
  const at = (p: string) => `\`${opts.root}${p}\``
  const rows = opts.compat
    ? [
        ["config/settings.json", "The theme's settings: colours, fonts, the values the theme editor shows. Under `shopify` are the imported theme's own settings.", "Yes"],
        ["templates/<page>.json", "Each page's own sections, their settings and blocks, in order. `home.json` is the home page.", "Yes"],
        ["sections/header-group.json, footer-group.json", "The header and footer, once, for every page.", "Yes"],
        ["sections/*.storelib", "Each section's markup and schema, converted from the theme's own code. Edit the code between the `<template compat=\"shopify\">` lines. Its settings, blocks and presets are the theme's own schema, under `shopify` in `<schema>`: change them there, and the builder's settings panel (the rest of `<schema>`) is made from it.", "Yes"],
        ["blocks/, snippets/, layout/", "The theme's blocks, snippets and page shell, the same way.", "Yes"],
        ["shopify/", "The theme's own files as they were imported: templates for account pages, config, locales, CSS, JavaScript and fonts. `shopify/config/settings_schema.json` is the theme settings; the builder's Theme settings are made from it.", "Yes, pictures excepted"],
        ["shopify/assets/<pictures>", "The theme's pictures and videos, to look at. Upload a new one in Storelib's Files.", "No"],
        ["config/storelib_settings_schema.json", "The settings Storelib adds to Theme settings (Hover and focus): ids, types, labels, options, defaults and the group each shows in. Their values are in `config/settings.json` under `shopify`.", "No, the values are"],
      ]
    : [
        ["config/settings.json", "The theme settings' values: colours, fonts, logo, menus. A `config/settings_data.json` in the usual theme shape, `{ \"current\": { ... } }`, is taken the same way, and what it leaves out stays as it is.", "Yes"],
        ["config/settings_schema.json", "What the theme settings are: a list of groups of settings. Reorder groups and settings, add your own, change a label, a default or a range, and Theme settings in the builder follow. A Storelib setting keeps its id, type and group. A section reads a setting you add as `theme.settings.<id>`.", "Yes"],
        ["templates/<page>.json", "Each page's own sections, their settings and blocks, in order. `home.json` is the home page.", "Yes"],
        ["sections/header-group.json, footer-group.json", "The header and footer, once, for every page.", "Yes"],
        ["sections/*.storelib", "Every section: Storelib's built-in ones and this site's own.", "Yes"],
        ["sections/<type>.json", "A built-in section Storelib draws itself. Its schema is here to read.", "No"],
        ["blocks/*.storelib", "Theme blocks any section can hold.", "Yes"],
        ["config/storelib_settings_schema.json", "Storelib's own Theme settings: ids, types, labels, options, defaults and the group each shows in. Their values are in `config/settings.json`.", "No, the values are"],
      ]
  const edited = opts.overrides.length
    ? `\nThis site has its own copy of ${opts.overrides.length === 1 ? "one built-in file" : `${opts.overrides.length} built-in files`}: ${opts.overrides.map((o) => `\`${o.path}\``).join(", ")}.\n`
    : ""
  const left = opts.skipped.length
    ? `\n## Left out\n\nThese stayed in Storelib, and storelib.json lists them too:\n\n${opts.skipped.slice(0, 40).map((s) => `- \`${s.path}\`: ${s.reason}`).join("\n")}${opts.skipped.length > 40 ? `\n- and ${opts.skipped.length - 40} more` : ""}\n`
    : ""
  return `# ${opts.siteName}

This repository is a Storelib website${opts.compat ? ", imported from another store's theme" : ""}. Storelib writes the whole theme here, and a push to \`${opts.branch}\` comes back into the site as a draft within seconds. Nothing is live until the creator presses Publish.

Start with AGENTS.md if you are an AI agent (Claude Code and Codex read it on their own).

## What is where${opts.root ? `\n\nEverything is under ${at("")}.` : ""}

| Path | What it is | Read back by Storelib |
| --- | --- | --- |
${rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`).join("\n")}
| README.md, AGENTS.md, CLAUDE.md, storelib.json | Written by Storelib each time it sends the theme. | No |

Anything else in this repository is yours, and Storelib leaves it alone.

## Changing a built-in section

${opts.compat
    ? "Every section here is the theme's own. Change it in place."
    : "Edit it in place, for example `sections/hero.storelib`. Storelib keeps your version as this site's own copy and draws it on this site only; every other Storelib site keeps the built-in one. In the builder it is marked Edited in GitHub, with Reset to Storelib's version. A built-in Storelib draws itself (a `sections/<type>.json` here) changes the same way: write `sections/<type>.storelib` with the same setting ids."}
${edited}
## Settings Storelib adds

${opts.compat
    ? "Theme settings in the builder show the theme's own groups and then Storelib's Hover and focus: buttons on hover (background, text, border, effect), links on hover, and fields (border, focus ring, corner radius)."
    : "Theme settings in the builder are Storelib's groups (logo, colours, type, buttons, layout, cards, cart, social links, cookies, animations, menus) with this theme's `config/settings_schema.json` laid over them."} \`config/storelib_settings_schema.json\` lists each one with its id, type, label, options, default and group. Their values are in \`config/settings.json\`${opts.compat ? " under `shopify`" : ""}, each written out, defaults included; change a value there and push.${opts.compat ? " If the theme's own `shopify/config/settings_schema.json` declares one of these ids, the builder draws it where the theme puts it instead." : ""}

## Live preview

In the builder, a change is drawn in the canvas without reloading the page. A script of the theme's hears it:

${LIVE_PREVIEW_EVENTS.map((e) => `- \`${e.event}\`: ${e.when}`).join("\n")}

## Adding a section

Add \`sections/<type>.storelib\` (lower case, digits, \`_\` and \`-\`). To put it on a page, add it to that page's \`templates/<page>.json\` in the same push, or leave that to the creator in the builder. The format is at https://storelib.com/developers/sections, and the schema settings at https://storelib.com/developers/schema.

## When a push does not work

Each push gets a commit status named Storelib, and a comment on the commit lists every file that was not taken, with the line and what to fix. The other files in the same push are still taken. The builder shows the same list on GitHub in Website settings, Connections.
${left}`
}
