/**
 * ===========================================================================
 *  THEME SETTINGS AS FILES: config/settings_schema.json AND settings_data.json
 * ===========================================================================
 * Shopify keeps a theme's global settings in two files: settings_schema.json
 * says what the settings are (groups of controls), settings_data.json holds
 * their values. A Storelib theme does the same, so Storelib AI, an agent over
 * MCP, the code editor and a GitHub push all change Theme settings the way
 * they would change a Shopify theme:
 *
 *   config/settings_schema.json   the theme's own file. A list of groups,
 *                                 `{ "name", "settings": [ ... ] }`, in
 *                                 Shopify's format (Storelib's own
 *                                 `{ "id", "label", "fields" }` is read too).
 *                                 It is laid over Storelib's built-in groups
 *                                 (lib/website-builder/theme-settings-schema.ts):
 *                                 a theme may reorder groups and settings,
 *                                 add groups and settings, and change a
 *                                 built-in setting's label, default, range,
 *                                 unit or info. A built-in setting keeps its
 *                                 type and its group, because the theme's
 *                                 stylesheet reads it, and one the file does
 *                                 not list is still there, after the ones it
 *                                 does. No file: Storelib's groups, as before.
 *
 *   config/settings_data.json     not a stored file. It is a view of the one
 *                                 copy of the values, the install's theme
 *                                 settings (store_theme_settings), as
 *                                 `{ "current": { ... } }`. Reading it reads
 *                                 the values the sidebar shows; writing it
 *                                 writes them, so the sidebar and the file
 *                                 can never disagree.
 *
 * A section reads a setting the theme added as `theme.settings.<id>`.
 *
 * Pure and browser safe: the editor reads the schema with it to draw Theme
 * settings, and the save (lib/website-builder/save-theme-file.ts) checks a
 * file with it before keeping it. Every refusal names its line.
 */
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SchemaField, SchemaFieldType, SelectOption, ThemeSettingsGroup } from "@/lib/website-builder/types"
import { resolveControlType } from "./controls/types"
import type { ThemeError } from "./types"

export const THEME_SCHEMA_FILE = "config/settings_schema.json"
export const THEME_DATA_FILE = "config/settings_data.json"

/** Draw something, hold nothing: no id needed, no value stored. */
const PRESENTATIONAL = new Set(["header", "paragraph", "divider"])
/** Types only Theme settings has, each drawn once, by its own panel. */
const THEME_ONLY = new Set(["css", "menus"])
/** Groups drawn by their own panel: what a theme may add to each. */
const CLOSED_GROUPS: Record<string, { allows: (type: string) => boolean; why: string }> = {
  color_schemes: { allows: () => false, why: "Colors holds the colour schemes, which are edited in that panel" },
  menus: { allows: () => false, why: "Menus holds the site's menus only" },
  typography: { allows: (t) => resolveControlType(t) === "font_picker", why: "Typography takes fonts only; put other settings in a group of their own" },
}
/** What a built-in setting may have changed. Its id, type and group stay. */
const OVERRIDABLE = ["label", "info", "default", "min", "max", "step", "unit", "placeholder", "visible_if", "content"] as const
const ID = /^[A-Za-z0-9_-]{1,64}$/
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

type O = Record<string, unknown>
const isObj = (v: unknown): v is O => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64)

/* ── Storelib's own groups, as the file writes them ───────────────────── */

/** One built-in setting in the file's own words: type, id and label first. */
function settingForFile(f: SchemaField): O {
  const { id, label, type, ...rest } = f
  return { type, id, label, ...rest }
}

/** Storelib's built-in groups as a settings_schema.json, in Shopify's shape. What the code editor, a repository and an agent see before a theme has its own. */
export function builtInSettingsSchema(groups: ThemeSettingsGroup[] = THEME_SETTINGS_GROUPS): O[] {
  return groups.map((g) => ({ name: g.label, id: g.id, settings: g.fields.map(settingForFile) }))
}

export function builtInSettingsSchemaText(): string {
  return JSON.stringify(builtInSettingsSchema(), null, 2) + "\n"
}

/* ── where in the file ────────────────────────────────────────────────── */

/** The line a JSON.parse error is on. */
function jsonErrorLine(text: string, e: unknown): number | undefined {
  const msg = e instanceof Error ? e.message : ""
  const line = /line (\d+) column/.exec(msg)
  if (line) return Number(line[1])
  const at = /position (\d+)/.exec(msg)
  if (at) return text.slice(0, Number(at[1])).split("\n").length
  /* An engine whose message does not say where: the shortest start of the file that fails for a reason other than ending too soon. */
  const early = (n: number) => {
    const head = text.slice(0, n)
    try {
      JSON.parse(head)
      return true
    } catch (err) {
      const m = err instanceof Error ? err.message : ""
      if (/end of (json )?input|Unterminated|Unexpected end/i.test(m)) return true
      /* "Expected a property name at position 20" where 20 is where this start of the file ends: it only ran out. */
      const p = /position (\d+)/.exec(m)
      return !!p && Number(p[1]) >= head.trimEnd().length
    }
  }
  let lo = 0
  let hi = text.length
  if (early(hi)) return undefined
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (early(mid)) lo = mid + 1
    else hi = mid
  }
  return text.slice(0, Math.max(0, lo - 1)).split("\n").length
}

/** The line of the first `"key": "value"` in the file, from `from` on. */
function lineOf(text: string, key: string, value: string, fromLine = 1): number | undefined {
  const lines = text.split("\n")
  const needle = new RegExp(`"${key}"\\s*:\\s*${JSON.stringify(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
  for (let i = Math.max(0, fromLine - 1); i < lines.length; i++) if (needle.test(lines[i])) return i + 1
  for (let i = 0; i < lines.length; i++) if (needle.test(lines[i])) return i + 1
  return undefined
}

/* ── reading the schema file ──────────────────────────────────────────── */

export type ThemeSchemaRead =
  | { ok: true; groups: ThemeSettingsGroup[]; notes: string[] }
  | { ok: false; errors: ThemeError[] }

interface BuiltIns {
  groups: ThemeSettingsGroup[]
  groupById: Map<string, ThemeSettingsGroup>
  groupByLabel: Map<string, ThemeSettingsGroup>
  fieldById: Map<string, { field: SchemaField; group: ThemeSettingsGroup }>
}

function builtInsOf(groups: ThemeSettingsGroup[]): BuiltIns {
  const fieldById = new Map<string, { field: SchemaField; group: ThemeSettingsGroup }>()
  for (const g of groups) for (const f of g.fields) fieldById.set(f.id, { field: f, group: g })
  return {
    groups,
    groupById: new Map(groups.map((g) => [g.id, g])),
    groupByLabel: new Map(groups.map((g) => [g.label.toLowerCase(), g])),
    fieldById,
  }
}

const sameType = (a: string, b: string) => a === b || (resolveControlType(a) ?? a) === (resolveControlType(b) ?? b)

/** The checks a setting's own keys pass, whoever declared it. */
function settingProblems(f: SchemaField): string[] {
  const out: string[] = []
  const kind = resolveControlType(f.type) ?? f.type
  if (kind === "range") {
    if (num(f.min) === undefined || num(f.max) === undefined) out.push(`"${f.id}" is a range and needs a "min" and a "max"`)
    else if ((f.min as number) >= (f.max as number)) out.push(`"${f.id}": "min" (${f.min}) must be below "max" (${f.max})`)
    if (f.step !== undefined && !(num(f.step) !== undefined && (f.step as number) > 0)) out.push(`"${f.id}": "step" must be a number above 0`)
    if (f.default !== undefined) {
      const d = num(f.default)
      if (d === undefined) out.push(`"${f.id}": its default must be a number`)
      else if (num(f.min) !== undefined && num(f.max) !== undefined && (d < (f.min as number) || d > (f.max as number))) out.push(`"${f.id}": its default ${d} is outside ${f.min} to ${f.max}`)
    }
  } else if (kind === "number") {
    if (f.default !== undefined && num(f.default) === undefined) out.push(`"${f.id}": its default must be a number`)
  } else if (kind === "select" || kind === "radio") {
    const opts = f.options
    if (!Array.isArray(opts) || opts.length === 0) out.push(`"${f.id}" is a ${f.type} and needs "options": [{ "value": "...", "label": "..." }]`)
    else if (opts.some((o) => !isObj(o) || typeof o.value !== "string" || typeof o.label !== "string")) out.push(`"${f.id}": every option needs a "value" and a "label", both text`)
    else if (f.default !== undefined && !opts.some((o) => o.value === f.default)) out.push(`"${f.id}": its default "${String(f.default)}" is not one of its options`)
  } else if (kind === "toggle" || kind === "checkbox") {
    if (f.default !== undefined && typeof f.default !== "boolean") out.push(`"${f.id}": its default must be true or false`)
  } else if (kind === "color") {
    if (f.default !== undefined && !(typeof f.default === "string" && (f.default === "" || HEX.test(f.default)))) out.push(`"${f.id}": its default must be a colour like #1a1a2e`)
  }
  return out
}

/** The options a built-in select may show: its own values, relabelled or reordered, never new ones the stylesheet does not know. */
function optionProblem(id: string, next: unknown, built: SelectOption[] | undefined): string | null {
  if (!Array.isArray(next)) return `"${id}": "options" must be a list`
  const known = new Set((built ?? []).map((o) => o.value))
  const unknown = next.find((o) => !isObj(o) || typeof o.value !== "string" || !known.has(o.value))
  return unknown ? `"${id}" is a Storelib setting and takes only its own values: ${[...known].join(", ")}` : null
}

/**
 * The theme's config/settings_schema.json laid over Storelib's groups. Never
 * throws: a file that cannot be read comes back with every problem, each on
 * its line, and nothing of it is used.
 */
export function readThemeSettingsSchema(text: string, builtIn: ThemeSettingsGroup[] = THEME_SETTINGS_GROUPS): ThemeSchemaRead {
  const file = THEME_SCHEMA_FILE
  const errors: ThemeError[] = []
  const err = (message: string, line?: number) => errors.push({ stage: "schema", file, message, ...(line ? { line } : {}) })
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [{ stage: "parse", file, message: "This is not valid JSON. Check for a missing comma or quote.", line: jsonErrorLine(text, e) }] }
  }
  if (!Array.isArray(parsed)) {
    return { ok: false, errors: [{ stage: "schema", file, line: 1, message: 'It must be a list of setting groups: [ { "name": "Layout", "settings": [ ... ] } ]' }] }
  }

  const b = builtInsOf(builtIn)
  const seenIds = new Map<string, string>()
  const seenGroups = new Set<string>()
  const out: ThemeSettingsGroup[] = []
  let cursor = 1

  parsed.forEach((raw, gi) => {
    if (!isObj(raw)) return err(`Group ${gi + 1} is not an object with a "name" and "settings"`)
    const name = str(raw.name) || str(raw.label)
    /* Shopify's first entry says who made the theme; it holds no settings. */
    if (name === "theme_info") return
    const groupLine = (name && lineOf(text, raw.name !== undefined ? "name" : "label", name, cursor)) || undefined
    if (groupLine) cursor = groupLine
    const list = Array.isArray(raw.settings) ? raw.settings : Array.isArray(raw.fields) ? raw.fields : null
    const ownId = str(raw.id)
    const builtInGroup = (ownId && b.groupById.get(ownId)) || (name && b.groupByLabel.get(name.toLowerCase())) || (name && b.groupById.get(slug(name))) || undefined
    if (!name && !builtInGroup) return err(`Group ${gi + 1} needs a "name"`, groupLine)
    if (ownId && !ID.test(ownId)) return err(`Group "${name}": its "id" may use letters, digits, _ and - only`, groupLine)
    if (!list) return err(`Group "${name || ownId}" needs a "settings" list`, groupLine)
    const groupId = builtInGroup?.id ?? (ownId || slug(name))
    if (!groupId) return err(`Group "${name}" needs a name with a letter or digit in it`, groupLine)
    if (seenGroups.has(groupId)) return err(`The group "${name || groupId}" is in the file twice. List it once.`, groupLine)
    seenGroups.add(groupId)

    const fields: SchemaField[] = []
    list.forEach((s: unknown, si: number) => {
      if (!isObj(s)) return err(`Setting ${si + 1} of "${name || groupId}" is not an object`, groupLine)
      const type = str(s.type)
      const given = str(s.id)
      const line = (given && lineOf(text, "id", given, cursor)) || (type && lineOf(text, "type", type, cursor)) || groupLine
      if (line) cursor = line
      if (!type) return err(`Setting ${si + 1} of "${name || groupId}" needs a "type"`, line)
      const presentational = PRESENTATIONAL.has(type)
      const id = given || (presentational ? `${groupId}_${type}_${si + 1}` : "")
      if (!id) return err(`A ${type} setting in "${name || groupId}" needs an "id": its value is stored under it`, line)
      if (!ID.test(id)) return err(`"${id}": a setting id may use letters, digits, _ and - only`, line)
      if (seenIds.has(id)) return err(`"${id}" is in the file twice (also in ${seenIds.get(id)}). A setting id is used once.`, line)
      seenIds.set(id, name || groupId)

      const own = b.fieldById.get(id)
      if (own) {
        if (own.group.id !== groupId) return err(`"${id}" is one of Storelib's ${own.group.label} settings. List it in the ${own.group.label} group.`, line)
        if (!sameType(type, own.field.type)) return err(`"${id}" is Storelib's ${own.field.type} setting, and the theme's stylesheet reads it as one. Keep its type "${own.field.type}".`, line)
        const next: SchemaField = { ...own.field }
        for (const key of OVERRIDABLE) if (s[key] !== undefined) (next as unknown as O)[key] = s[key]
        if (typeof s.label !== "string" && presentational && typeof s.content === "string") next.label = s.content
        if (s.options !== undefined) {
          const problem = optionProblem(id, s.options, own.field.options)
          if (problem) return err(problem, line)
          next.options = s.options as SelectOption[]
        }
        for (const p of settingProblems(next)) err(p, line)
        fields.push(next)
        return
      }

      const resolved = resolveControlType(type)
      if (type === "color_scheme_group") return err(`"${id}": Storelib's colour schemes are edited in Theme settings › Colors, so a color_scheme_group is not taken here`, line)
      if (!resolved && !THEME_ONLY.has(type)) return err(`"${type}" is not a setting type. Use one of: text, textarea, richtext, number, range, toggle, checkbox, select, radio, color, font_picker, image_picker, video_picker, url, product_picker, collection_picker, header, paragraph`, line)
      if (THEME_ONLY.has(type)) return err(`"${type}" belongs to Storelib's own ${type === "css" ? "Custom CSS" : "Menus"} group and is not added again`, line)
      const closed = builtInGroup ? CLOSED_GROUPS[builtInGroup.id] : undefined
      if (closed && !closed.allows(type)) return err(`"${id}": ${closed.why}.`, line)
      const label = str(s.label) || (presentational ? str(s.content) : "")
      if (!label && type !== "divider" && type !== "paragraph") return err(`"${id}" needs a "label": it is the name the sidebar shows`, line)
      const field: SchemaField = { id, label, type: type as SchemaFieldType }
      for (const key of ["default", "options", "min", "max", "step", "unit", "placeholder", "info", "visible_if", "limit", "accept"] as const) {
        if (s[key] !== undefined) (field as unknown as O)[key] = s[key]
      }
      if (type === "paragraph") field.content = str(s.content) || label
      for (const p of settingProblems(field)) err(p, line)
      fields.push(field)
    })

    /* Storelib's settings the file did not list stay in their group, after the ones it did. */
    if (builtInGroup) for (const f of builtInGroup.fields) if (!seenIds.has(f.id)) fields.push(f)
    out.push(builtInGroup ? { ...builtInGroup, label: name || builtInGroup.label, fields } : { id: groupId, label: name, icon: "settings", fields })
  })

  if (errors.length) return { ok: false, errors }
  /* Storelib's groups the file did not list: after the file's, in Storelib's order. */
  const notes: string[] = []
  for (const g of builtIn) {
    if (seenGroups.has(g.id)) continue
    out.push(g)
  }
  return { ok: true, groups: out, notes }
}

let lastText: string | null = null
let lastGroups: ThemeSettingsGroup[] = THEME_SETTINGS_GROUPS

/**
 * Theme settings as the sidebar draws them: the theme's file over Storelib's
 * groups, or Storelib's alone when there is no file, or one that does not
 * read (a save refuses those, so only an old row can be one).
 */
export function themeSettingsGroupsFor(text: string | null | undefined): ThemeSettingsGroup[] {
  if (typeof text !== "string" || text.trim() === "") return THEME_SETTINGS_GROUPS
  if (text === lastText) return lastGroups
  const read = readThemeSettingsSchema(text)
  lastText = text
  lastGroups = read.ok === true ? (read as { groups: ThemeSettingsGroup[] }).groups : THEME_SETTINGS_GROUPS
  return lastGroups
}

/* ── defaults the file gives ──────────────────────────────────────────── */

const BUILT_IN_DEFAULTS = new Map<string, unknown>(THEME_SETTINGS_GROUPS.flatMap((g) => g.fields.map((f) => [f.id, f.default] as [string, unknown])))

/**
 * The defaults the theme's file adds or changes, for a value never set: a
 * setting of the theme's own, and a built-in whose default the file moved.
 * A value already saved is never touched (Shopify the same: a new default
 * does not change a value somebody chose). Storelib's own defaults are not
 * written in, the stylesheet already has them.
 */
export function schemaDefaults(groups: ThemeSettingsGroup[], values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (groups === THEME_SETTINGS_GROUPS) return out
  for (const g of groups) {
    for (const f of g.fields) {
      if (PRESENTATIONAL.has(f.type) || f.default === undefined || values[f.id] !== undefined) continue
      const builtIn = BUILT_IN_DEFAULTS.has(f.id)
      if (builtIn && JSON.stringify(BUILT_IN_DEFAULTS.get(f.id)) === JSON.stringify(f.default)) continue
      out[f.id] = f.default
    }
  }
  return out
}

/** The values with the file's defaults under them. The same object when there are none, so a memo downstream holds. */
export function withThemeDefaults<T extends Record<string, unknown>>(values: T, groups: ThemeSettingsGroup[]): T {
  const extra = schemaDefaults(groups, values)
  return Object.keys(extra).length ? ({ ...extra, ...values } as T) : values
}

/* ── the values file ──────────────────────────────────────────────────── */

/** The values as config/settings_data.json shows them. */
export function settingsDataText(values: Record<string, unknown> | null | undefined): string {
  return JSON.stringify({ current: values ?? {} }, null, 2) + "\n"
}

export type ThemeDataRead =
  | { ok: true; values: Record<string, unknown>; cleared: string[] }
  | { ok: false; errors: ThemeError[] }

/** Whether a value fits its setting, in words when it does not. */
function valueProblem(f: SchemaField, v: unknown): string | null {
  const kind = resolveControlType(f.type) ?? f.type
  if (kind === "range" || kind === "number") {
    if (isObj(v) && f.responsive) return null
    if (num(v) === undefined) return `"${f.id}" takes a number`
    if (kind === "range" && num(f.min) !== undefined && num(f.max) !== undefined && ((v as number) < (f.min as number) || (v as number) > (f.max as number))) return `"${f.id}" takes ${f.min} to ${f.max}; ${v} is outside it`
    return null
  }
  if (kind === "toggle" || kind === "checkbox") return typeof v === "boolean" ? null : `"${f.id}" takes true or false`
  if (kind === "select" || kind === "radio") {
    const values = (f.options ?? []).map((o) => o.value)
    return typeof v === "string" && (values.length === 0 || values.includes(v)) ? null : `"${f.id}" takes one of: ${values.join(", ")}`
  }
  if (kind === "color") return typeof v === "string" && (v === "" || HEX.test(v)) ? null : `"${f.id}" takes a colour like #1a1a2e`
  if (kind === "text" || kind === "textarea" || kind === "richtext" || kind === "inline_richtext" || kind === "image_picker" || kind === "url" || kind === "font_picker") {
    return typeof v === "string" ? null : `"${f.id}" takes text`
  }
  return null
}

/**
 * A config/settings_data.json written by someone: `{ "current": { ... } }`,
 * `{ "current": "Name", "presets": { "Name": { ... } } }`, or the values on
 * their own. Each value is checked against its setting; a value of `null`
 * clears it back to its default. Keys the schema does not list (the colour
 * schemes, the type styles, the menus) are values like any other.
 */
export function readSettingsData(text: string, groups: ThemeSettingsGroup[] = THEME_SETTINGS_GROUPS): ThemeDataRead {
  const file = THEME_DATA_FILE
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: [{ stage: "parse", file, message: "This is not valid JSON. Check for a missing comma or quote.", line: jsonErrorLine(text, e) }] }
  }
  if (!isObj(parsed)) return { ok: false, errors: [{ stage: "schema", file, line: 1, message: 'It must be one object: { "current": { "setting_id": value } }' }] }
  let current: unknown = "current" in parsed ? parsed.current : parsed
  if (typeof current === "string") {
    const presets = isObj(parsed.presets) ? parsed.presets : {}
    if (!isObj(presets[current])) return { ok: false, errors: [{ stage: "schema", file, line: lineOf(text, "current", current), message: `"current" names the preset "${current}", and "presets" has no preset by that name` }] }
    current = presets[current]
  }
  if (!isObj(current)) return { ok: false, errors: [{ stage: "schema", file, line: 1, message: '"current" must be an object of setting ids and their values' }] }
  const byId = new Map<string, SchemaField>()
  for (const g of groups) for (const f of g.fields) if (!PRESENTATIONAL.has(f.type)) byId.set(f.id, f)
  const errors: ThemeError[] = []
  const values: Record<string, unknown> = {}
  const cleared: string[] = []
  for (const [key, v] of Object.entries(current)) {
    if (key === "presets" && !("current" in parsed)) continue
    /* What kind of theme this is is not a value to change. */
    if (key === "compat") continue
    if (v === null) {
      cleared.push(key)
      continue
    }
    const f = byId.get(key)
    const problem = f ? valueProblem(f, v) : null
    if (problem) {
      const line = text.split("\n").findIndex((l) => new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`).test(l))
      errors.push({ stage: "schema", file, message: problem, ...(line >= 0 ? { line: line + 1 } : {}) })
      continue
    }
    values[key] = v
  }
  return errors.length ? { ok: false, errors } : { ok: true, values, cleared }
}

/** The stored values with a read file laid over them: what it set, set; what it cleared, gone back to its default; the rest as it was. */
export function mergeSettingsData(stored: Record<string, unknown>, read: { values: Record<string, unknown>; cleared: string[] }): Record<string, unknown> {
  const next: Record<string, unknown> = { ...stored, ...read.values }
  for (const key of read.cleared) delete next[key]
  if (stored.compat !== undefined) next.compat = stored.compat
  return next
}

/* ── what a control shows ─────────────────────────────────────────────── */

/**
 * What a control shows for a stored value, after its schema changed under
 * it: nothing stored is its default, and a number outside a new range is
 * shown at the nearest end. The stored value is left as it is until somebody
 * moves the control.
 */
export function shownValue(field: Pick<SchemaField, "type" | "default" | "min" | "max">, raw: unknown): unknown {
  const v = raw === undefined || raw === null ? field.default : raw
  const kind = resolveControlType(field.type) ?? field.type
  if ((kind === "range" || kind === "number") && typeof v === "number") return clampTo(v, field.min, field.max)
  return v
}

export function clampTo(v: number, min: unknown, max: unknown): number {
  let n = v
  if (typeof min === "number" && Number.isFinite(min) && n < min) n = min
  if (typeof max === "number" && Number.isFinite(max) && n > max) n = max
  return n
}

/* ── a theme package ──────────────────────────────────────────────────── */

/**
 * A package's theme settings: config/settings.json, with a
 * config/settings_data.json laid over it when the package has one (Shopify's
 * name for the same values), and its config/settings_schema.json checked as
 * a save would check it. A schema that does not read refuses the package,
 * with its lines, rather than arriving half used.
 */
export function packageThemeConfig(files: Record<string, string>): { ok: true; settings: Record<string, unknown>; schema: string | null } | { ok: false; errors: ThemeError[] } {
  const schema = typeof files[THEME_SCHEMA_FILE] === "string" && files[THEME_SCHEMA_FILE].trim() !== "" ? files[THEME_SCHEMA_FILE] : null
  const read = schema ? readThemeSettingsSchema(schema) : null
  if (read && read.ok === false) return { ok: false, errors: (read as { errors: ThemeError[] }).errors }
  const groups = read && read.ok === true ? (read as { groups: ThemeSettingsGroup[] }).groups : THEME_SETTINGS_GROUPS
  let settings: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(files["config/settings.json"] ?? "{}")
    if (isObj(parsed)) settings = parsed
  } catch {
    settings = {}
  }
  if (typeof files[THEME_DATA_FILE] === "string") {
    const data = readSettingsData(files[THEME_DATA_FILE], groups)
    if (data.ok === false) return { ok: false, errors: (data as { errors: ThemeError[] }).errors }
    settings = mergeSettingsData(settings, data as { values: Record<string, unknown>; cleared: string[] })
  }
  return { ok: true, settings: withThemeDefaults(settings, groups), schema }
}
