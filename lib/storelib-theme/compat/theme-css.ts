/**
 * ===========================================================================
 *  A THEME VALUE THAT ONLY CSS READS
 * ===========================================================================
 * The owner, round 36: "Use CSS variables for instant color, typography,
 * spacing, and styling adjustments ... changes appear immediately". A
 * Shopify theme prints most of its theme settings once, as custom
 * properties in a {% style %} block of its layout (Dawn's theme.liquid: the
 * section spacing, the button radius, every colour scheme as a
 * .color-scheme-N rule). Each value a slider passed drew the whole page
 * through Liquid in the builder and compared it with the page on screen:
 * Dawn's spacing at 160 to 200ms a value, 700 to 850ms with the CPU slowed
 * 4x (scripts/check-compat-live-edit.ts, round 35), because the layout
 * branches on the value (`{% if settings.spacing_sections < 24 %}`) and no
 * template of the page could be learned for it.
 *
 * A setting every use of which lies inside the layout's own <style> blocks
 * changes nothing else on the page. For it, each value draws the layout
 * alone (page.ts drawLayoutStyles: no section, no content, a few
 * milliseconds) and the <style> texts that changed go to the frame, which
 * writes them into the rules on the page, declaration by declaration
 * (canvas-bridge.ts "edits", setText). Branches in the CSS are Liquid's, so
 * what is shown is what the release draws.
 *
 * WHICH SETTINGS. Read from the theme's files first (settingUses, below):
 * every place the Liquid reads `settings.<id>`, and whether it is inside a
 * <style> or a {% style %} of the page's layout, or of a snippet only ever
 * rendered inside one. A theme that reads its settings in a way that cannot
 * be followed (`settings[key]`, the object handed whole) has none known
 * this way. A setting read elsewhere too (Dawn prints its first colour
 * scheme's id in a few classes) is tried with values it could take
 * (probeValues): the page drawn whole with each, its layout's styles set
 * aside, must be the page drawn with the value it has. Any other setting is
 * drawn as before.
 */

export type SettingUse = { file: string; css: boolean }
export type SettingUses = {
  /** The theme reads its settings somewhere in a way that names no one setting: nothing is known from the files alone. */
  opaque: boolean
  /** Each setting's uses, by its id. */
  by: Map<string, SettingUse[]>
}

const BLOCKS = /\{%-?\s*(comment|schema|raw|javascript|stylesheet|doc)\s*-?%\}[\s\S]*?\{%-?\s*end\1\s*-?%\}/g
const INLINE_COMMENT = /\{%-?\s*#[\s\S]*?-?%\}/g
const STYLE_REGION = /\{%-?\s*style\s*-?%\}[\s\S]*?\{%-?\s*endstyle\s*-?%\}|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi
const LIQUID = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g
/** A read of the global `settings` (not `section.settings`, `block.settings`, `scheme.settings`). */
const REF = /(^|[^\w.$\]-])settings\b(?:\s*\.\s*([A-Za-z_][\w-]*)|\s*\[\s*(['"])([^'"]+)\3\s*\])?/g
const RENDERS = /\{%-?\s*(?:render|include)\s+(['"])([^'"]+)\1/g
const RENDERS_IN_LIQUID = /(?:^|\n)\s*(?:render|include)\s+(['"])([^'"]+)\1/g

/** A file's Liquid, without its schema and comments. */
function liquidOf(source: string, markupOf: (s: string) => string): string {
  return markupOf(source).replace(BLOCKS, "").replace(INLINE_COMMENT, "")
}

function regionsOf(text: string): [number, number][] {
  const out: [number, number][] = []
  for (const m of text.matchAll(STYLE_REGION)) out.push([m.index!, m.index! + m[0].length])
  return out
}
const inside = (regions: [number, number][], at: number) => regions.some(([a, b]) => at >= a && at < b)

/** Each Liquid file the theme draws pages with: its layouts, sections, blocks and snippets. */
const DRAWN = /^(layout|sections|blocks|snippets)\/[^/]+\.(liquid|storelib)$/

/**
 * Every read of a theme setting in the theme's files, and whether it lies in
 * CSS of the page's layout (`layoutPath`) that drawLayoutStyles draws: inside
 * one of its <style> blocks, or in a snippet that is only ever rendered from
 * inside those.
 */
export function settingUses(files: Record<string, string>, layoutPath: string, markupOf: (s: string) => string, templatePath?: string): SettingUses {
  const texts = new Map<string, { text: string; regions: [number, number][] }>()
  for (const [path, source] of Object.entries(files)) {
    /* A template written in Liquid draws only its own page: read when it is this one. */
    if (!DRAWN.test(path) && path !== templatePath) continue
    /* Another layout is not this page's. */
    if (path.startsWith("layout/") && path !== layoutPath) continue
    const text = liquidOf(source, markupOf)
    texts.set(path, { text, regions: regionsOf(text) })
  }
  /* Snippets rendered from inside the layout's CSS, and those rendered anywhere else. */
  const inCss = new Set<string>(), elsewhere = new Set<string>()
  for (const [path, { text, regions }] of texts) {
    for (const re of [RENDERS, RENDERS_IN_LIQUID]) {
      for (const m of text.matchAll(re)) {
        const name = m[2]
        if (path === layoutPath && inside(regions, m.index!)) inCss.add(name)
        else elsewhere.add(name)
      }
    }
  }
  const cssSnippet = (path: string) => {
    const name = path.match(/^snippets\/([^/]+)\.(liquid|storelib)$/)?.[1]
    return !!name && inCss.has(name) && !elsewhere.has(name)
  }
  let opaque = false
  const by = new Map<string, SettingUse[]>()
  for (const [path, { text, regions }] of texts) {
    const wholeCss = cssSnippet(path)
    for (const tag of text.matchAll(LIQUID)) {
      const body = tag[0]
      if (!/settings/.test(body)) continue
      const output = body.startsWith("{{")
      for (const m of body.matchAll(REF)) {
        const id = m[2] ?? m[4]
        const after = body.slice(m.index! + m[0].length)
        if (!id) {
          /* `settings: section.settings`, a render's named argument, reads nothing. */
          if (/^\s*:/.test(after)) continue
          opaque = true
          continue
        }
        /* An assignment or a capture carries the value out of the CSS, where it can be printed anywhere. */
        const before = body.slice(0, m.index! + m[1].length)
        const statement = before.slice(before.lastIndexOf("\n") + 1).replace(/^\s*\{%-?\s*/, "").replace(/^liquid\s+/, "").trim()
        const carried = !output && /^(assign|capture)\b/.test(statement)
        const css = !carried && (wholeCss || (path === layoutPath && inside(regions, tag.index!)))
        const list = by.get(id) ?? []
        list.push({ file: path, css })
        by.set(id, list)
      }
    }
  }
  return { opaque, by }
}

/** The file a layout is drawn from ("theme" when unnamed), as CompatTheme finds it. */
export function layoutPathIn(files: Record<string, string>, name?: string): string | null {
  for (const n of name && name !== "theme" ? [name, "theme"] : ["theme"]) {
    for (const ext of [".storelib", ".liquid"]) if (files[`layout/${n}${ext}`] !== undefined) return `layout/${n}${ext}`
  }
  return null
}

/** Whether the theme's files say this setting is read only in its layout's CSS. */
export function onlyInCss(uses: SettingUses, id: string): boolean {
  if (uses.opaque) return false
  const list = uses.by.get(id)
  return !!list && list.length > 0 && list.every((u) => u.css)
}

/* ── Values to try a setting with ─────────────────────────────────────── */

type O = Record<string, unknown>
const COLOUR = /^#[0-9a-f]{3,8}$/i
/** A dark and a light colour nobody would pick, for a colour's tries. */
export const CSS_COLOUR_PROBES = ["#0b1a29", "#e3d2c1"] as const

/**
 * The setting a path in the install's settings names (["shopify", id], or
 * a colour scheme's colour: ["shopify", schemes, "scheme-1", "settings",
 * "background"]), from the theme's settings_schema.json.
 */
export function settingAt(schema: O[], path: (string | number)[]): O | null {
  if (path[0] !== "shopify" || typeof path[1] !== "string") return null
  const all = schema.flatMap((g) => (Array.isArray(g.settings) ? (g.settings as O[]) : []))
  const s = all.find((x) => x.id === path[1])
  if (!s) return null
  if (path.length === 2) return s
  if (s.type === "color_scheme_group" && path.length === 5 && path[3] === "settings") {
    const defs = Array.isArray(s.definition) ? (s.definition as O[]) : []
    return defs.find((d) => d.id === path[4]) ?? null
  }
  return null
}

/** Values the setting could take besides the one it has, at most three: a range's ends, two colours, a choice's other options. Null for one that is not tried. */
export function probeValues(setting: O | null, value: unknown): unknown[] | null {
  if (!setting) return null
  const type = String(setting.type ?? "")
  const others = (list: unknown[]) => [...new Set(list.map((v) => JSON.stringify(v)))].map((v) => JSON.parse(v) as unknown).filter((v) => v !== value).slice(0, 3)
  if (type === "range" || type === "number") {
    if (typeof value !== "number") return null
    const min = typeof setting.min === "number" ? setting.min : null
    const max = typeof setting.max === "number" ? setting.max : null
    const step = typeof setting.step === "number" && setting.step > 0 ? setting.step : 1
    const list = min !== null && max !== null ? [min, max] : [value + step, Math.max(0, value - step)]
    return others(list)
  }
  if (type === "color") return typeof value === "string" && COLOUR.test(value) ? others([...CSS_COLOUR_PROBES]) : null
  if (type === "checkbox") return typeof value === "boolean" ? [!value] : null
  if (type === "select" || type === "radio") {
    const opts = Array.isArray(setting.options) ? (setting.options as O[]).map((o) => o.value) : []
    return opts.length ? others(opts) : null
  }
  return null
}

/* ── What changed ─────────────────────────────────────────────────────── */

/** The <style> texts that changed between two drawings of the layout, as the frame writes them; null when the layout drew another number of them. */
export function styleEdits(from: readonly string[], to: readonly string[]): { style: true; from: string; to: string }[] | null {
  if (from.length !== to.length) return null
  const out: { style: true; from: string; to: string }[] = []
  for (let i = 0; i < from.length; i++) if (from[i] !== to[i]) out.push({ style: true, from: from[i], to: to[i] })
  return out
}

/**
 * Whether two drawings of the whole page are the same once the layout's
 * styles that changed between them are set aside: a setting that changed
 * nothing but those.
 */
export function sameButStyles(a: { html: string; styles: readonly string[] }, b: { html: string; styles: readonly string[] }): boolean {
  if (a.styles.length !== b.styles.length) return false
  let x = a.html, y = b.html
  for (let i = 0; i < a.styles.length; i++) {
    if (a.styles[i] === b.styles[i]) continue
    if (!a.styles[i] || !b.styles[i]) return false
    x = x.split(a.styles[i]).join("\u0000")
    y = y.split(b.styles[i]).join("\u0000")
  }
  return x === y
}
