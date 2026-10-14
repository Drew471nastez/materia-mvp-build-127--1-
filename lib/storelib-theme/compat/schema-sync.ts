/**
 * ===========================================================================
 *  AN IMPORTED THEME'S SCHEMA AND ITS PANEL, ONE READING
 * ===========================================================================
 * An imported theme's section or block file carries its schema twice
 * (./theme.ts): under `"shopify"` the theme's own, which the page is drawn
 * with, and around it the builder's panel, made from it at import by
 * lib/storelib-theme/shopify/convert.ts. The theme settings the same way:
 * shopify/config/settings_schema.json draws the page, and
 * shopify/config/settings_panel.json, written at import, is the panel.
 *
 * Both panels were made once. A schema changed afterwards (a push to the
 * site's GitHub repository, the code editor, Storelib AI) was refused from
 * GitHub, and kept from anywhere else with the panel still showing the old
 * settings: a new setting drew on the page and had no control, a removed one
 * kept its control. So the panel is never edited on its own any more. It is
 * made again from the theme's own schema, by the import's own functions,
 * every time that schema (or the panel beside it) changes, and the save says
 * what it could not show. lib/website-builder/save-theme-file.ts calls this
 * for every save, whoever is saving.
 *
 * Pure: no database. The words (`t:` keys) and the theme's block types are
 * read by the caller and handed in.
 */
import { compatPanelSchema, compatSchemaWords, compatThemeSettingsPanel, parseThemeJson, type SchemaWords } from "../shopify/convert"
import { validateBlockSchema, validateSectionSchema } from "../schema/validate"
import type { ThemeError } from "../types"
import { COMPAT_PREFIX } from "./install"
import { CompatSyntaxError } from "./lexer"
import { parseCompat } from "./parser"
import { COMPAT_ATTR, isCompatSource, shopifySchemaOf, splitCompatFile } from "./theme"

export { compatSchemaWords, type SchemaWords }

/** The theme's own settings, which draw the page. */
export const SETTINGS_SCHEMA_FILE = `${COMPAT_PREFIX}config/settings_schema.json`
/** The builder's Theme settings panel, made from it. */
export const SETTINGS_PANEL_FILE = `${COMPAT_PREFIX}config/settings_panel.json`

const SECTION = /^sections\/([a-z0-9_-]+)\.storelib$/
const BLOCK = /^blocks\/(_?[a-z][a-z0-9_-]*)\.storelib$/
const END = /^\s*<\/template>\s*$/

type O = Record<string, unknown>

/** What the panel is made with, besides the schema itself. */
export interface CompatContext {
  tr: SchemaWords
  /** The theme's blocks (blocks/<type>.storelib), so a section that takes them by name keeps them. */
  blockTypes: Iterable<string>
}

/** Whether a save of this path makes the Theme settings panel again: the settings, or the words its labels are in. */
export function rebuildsSettingsPanel(path: string): boolean {
  return path === SETTINGS_SCHEMA_FILE || /^shopify\/locales\/[^/]+\.default\.schema\.json$/.test(path)
}

/** The block types a theme has, from its file paths. */
export function compatBlockTypes(paths: Iterable<string>): string[] {
  const out: string[] = []
  for (const p of paths) {
    const m = BLOCK.exec(p)
    if (m) out.push(m[1])
  }
  return out
}

/** The same value written the same way: key order and spacing are not a change. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value as O).sort().map((k) => `${JSON.stringify(k)}:${stable((value as O)[k])}`).join(",")}}`
  }
  return JSON.stringify(value ?? null)
}

function panelPartOf(schema: O): O {
  const { shopify: _theirs, ...panel } = schema
  void _theirs
  return panel
}

/**
 * Where JSON.parse gave up: the position its message names, or, for an
 * engine whose message does not say, the shortest prefix that fails for a
 * reason other than ending too soon (as lib/github-sync/layout.ts finds it).
 */
function jsonErrorOffset(text: string, error: unknown): number | null {
  const named = Number(/position (\d+)/.exec(error instanceof Error ? error.message : "")?.[1])
  if (Number.isFinite(named)) return named
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

/** The line a JSON.parse error points at, counted from `offset` lines into the file. */
function jsonErrorLine(text: string, error: unknown, offset = 0): number | undefined {
  const at = jsonErrorOffset(text, error)
  return at === null ? undefined : offset + text.slice(0, at).split("\n").length
}

/** JSON's own complaint, without the text it quotes back. */
function jsonComplaint(error: unknown): string {
  const msg = error instanceof Error ? error.message : ""
  return msg.replace(/^JSON\.parse: /, "").split(/ in JSON at position| \(line \d|, (?:\.\.\.)?"[\s\S]*" is not valid JSON| is not valid JSON/)[0].trim().slice(0, 80)
}

/** Where a compatible file's own part ends: the `</template>` line, or -1. */
function templateEnd(lines: string[]): number {
  const start = lines.findIndex((l) => COMPAT_ATTR.test(l))
  if (start < 0) return -1
  for (let i = start + 1; i < lines.length; i++) if (END.test(lines[i])) return i
  return -1
}

/** The `<schema>` block's text after the markup, and the file line its JSON starts on. */
function schemaBlock(source: string): { text: string; line: number } | null {
  const lines = source.split("\n")
  const end = templateEnd(lines)
  if (end < 0) return null
  const rest = lines.slice(end + 1).join("\n")
  const m = /<schema>([\s\S]*?)<\/schema>/.exec(rest)
  if (!m) return null
  return { text: m[1], line: end + 1 + rest.slice(0, m.index).split("\n").length }
}

/** The file with this schema in its `<schema>` block, everything else as it was. */
function withSchema(source: string, schema: O): string {
  const lines = source.split("\n")
  const end = templateEnd(lines)
  const block = `<schema>\n${JSON.stringify(schema, null, 2)}\n</schema>`
  if (end < 0) return source
  const head = lines.slice(0, end + 1).join("\n")
  const rest = lines.slice(end + 1).join("\n")
  const next = /<schema>[\s\S]*?<\/schema>/.test(rest) ? rest.replace(/<schema>[\s\S]*?<\/schema>/, () => block) : `${rest.replace(/\s+$/, "")}\n\n${block}\n`
  return `${head}\n${next}`
}

/** What is wrong with an imported theme's file: its markup, then its panel schema. Empty when nothing is. */
export function compatFileErrors(path: string, content: string): ThemeError[] {
  const { markup, schema } = splitCompatFile(content)
  try {
    parseCompat(markup)
  } catch (e) {
    /* The markup starts on the file's second line, after <template compat="shopify">. */
    return [{ stage: "template", file: path, line: e instanceof CompatSyntaxError ? e.line + 1 : undefined, message: (e as Error).message }]
  }
  const section = SECTION.exec(path)
  const block = BLOCK.exec(path)
  if (!section && !block) return []
  if (!schema) return [{ stage: "schema", file: path, message: "The <schema> block is missing or is not JSON" }]
  const panel = panelPartOf(schema)
  const r = section ? validateSectionSchema({ ...panel, type: section[1] }) : validateBlockSchema(panel, { type: block![1] })
  return r.ok === false ? r.errors.map((e) => ({ ...e, file: path })) : []
}

export type CompatSync = { ok: true; source: string; rebuilt: boolean; notes: string[] } | { ok: false; errors: ThemeError[] }

/**
 * A section or block file of an imported theme, as it is kept: its panel made
 * again from its theme schema whenever either part changed since `previous`
 * (or the file is new). A change to the markup alone keeps the file exactly
 * as it was sent. Not a section or block of an imported theme: as it is.
 */
export function syncCompatFile(path: string, source: string, previous: string | null, ctx: CompatContext): CompatSync {
  const m = SECTION.exec(path) ?? BLOCK.exec(path)
  if (!m || !isCompatSource(source)) return { ok: true, source, rebuilt: false, notes: [] }
  const block = schemaBlock(source)
  if (!block) return { ok: true, source, rebuilt: false, notes: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(block.text)
  } catch (e) {
    const what = jsonComplaint(e)
    return { ok: false, errors: [{ stage: "schema", file: path, line: jsonErrorLine(block.text, e, block.line - 1), message: `The <schema> block is not valid JSON${what ? ` (${what})` : ""}` }] }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errors: [{ stage: "schema", file: path, line: block.line, message: "The <schema> block must be one JSON object" }] }
  }
  const schema = parsed as O
  /* The theme's own schema: under "shopify", or the whole of it in a file written without the split (./theme.ts reads it the same way). */
  const theirs = shopifySchemaOf(schema)
  const before = previous && isCompatSource(previous) ? splitCompatFile(previous).schema : null
  if (before && stable(shopifySchemaOf(before)) === stable(theirs) && stable(panelPartOf(schema)) === stable(panelPartOf(before))) {
    return { ok: true, source, rebuilt: false, notes: [] }
  }
  const mode = SECTION.test(path) ? "section" : "block"
  const made = compatPanelSchema(theirs, { path, mode, type: m[1], tr: ctx.tr, blockTypes: ctx.blockTypes })
  const panel = made.schema
  /* The one thing the import knows that the theme's schema does not say: that this section is the site's header or footer. */
  if (mode === "section" && panel.kind === undefined) {
    const kind = schema.kind ?? before?.kind
    if (kind === "header" || kind === "footer") panel.kind = kind
  }
  const next = { ...panel, shopify: theirs }
  return { ok: true, source: withSchema(source, next), rebuilt: true, notes: made.notes.map((n) => `${path}: ${n}`) }
}

export type PanelBuild = { ok: true; panel: string; notes: string[] } | { ok: false; errors: ThemeError[] }

/** What is wrong with a theme's settings_schema.json, or null. */
export function settingsSchemaErrors(text: string): ThemeError[] {
  const parsed = parseThemeJson(text)
  if (parsed === undefined) {
    let line: number | undefined
    try {
      JSON.parse(text)
    } catch (e) {
      line = jsonErrorLine(text, e)
    }
    return [{ stage: "schema", file: SETTINGS_SCHEMA_FILE, line, message: "Not valid JSON" }]
  }
  if (!Array.isArray(parsed)) return [{ stage: "schema", file: SETTINGS_SCHEMA_FILE, line: 1, message: "A theme's settings_schema.json is a list of setting groups: [{ \"name\": \"Colors\", \"settings\": [...] }]" }]
  return []
}

/**
 * The Theme settings panel (shopify/config/settings_panel.json) from the
 * theme's settings_schema.json and its values, as the import writes it.
 */
export function buildSettingsPanel(schemaText: string, values: Record<string, unknown>, tr: SchemaWords): PanelBuild {
  const errors = settingsSchemaErrors(schemaText)
  if (errors.length) return { ok: false, errors }
  const { panel, notes } = compatThemeSettingsPanel(parseThemeJson(schemaText), values, tr)
  return { ok: true, panel: JSON.stringify(panel, null, 1), notes: notes.map((n) => `${SETTINGS_SCHEMA_FILE}: ${n}`) }
}
