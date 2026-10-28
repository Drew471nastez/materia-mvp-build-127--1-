/**
 * ===========================================================================
 *  WHAT THE CODE EDITOR KNOWS ABOUT THE FILE IN FRONT OF IT
 * ===========================================================================
 * A section's names come from its own schema, so the only list of settings
 * worth offering is the one in the file being edited. This reads that schema
 * out of the text as it is typed and answers three questions:
 *
 *   WHAT COULD GO HERE? — the completions for the caret's position, which is
 *   the file's own setting ids, its own block settings, the roots a section
 *   can read, the filters, and the tags.
 *
 *   IS THIS NAME REAL? — the undeclared names, marked while typing rather
 *   than found on save. The compiler refuses these too, but a red line under
 *   the word beats a failed save a minute later.
 *
 *   WHAT IS THIS? — one line of documentation for the token under the caret.
 *
 * It is all string work over the source text: no compiler, no postcss, no
 * network. The code editor is an authoring tool and can afford more than a
 * storefront can, but the answer arrives on a keystroke, so it has to be
 * cheap enough to run on every one of them.
 */

export interface Completion {
  /** Inserted in place of the word being typed. */
  value: string
  /** What the list shows. */
  label: string
  /** The grey half: a type, a default, or what a filter does. */
  detail: string
  kind: "setting" | "block" | "root" | "filter" | "tag" | "theme"
}

export interface Diagnostic {
  line: number
  column: number
  length: number
  message: string
}

/** The roots a template can read. Kept beside the engine's own list. */
export const ROOTS: { name: string; detail: string }[] = [
  { name: "settings", detail: "this section's settings, by the ids its schema declares" },
  { name: "blocks", detail: "this section's blocks, in order" },
  { name: "products", detail: "the creator's published products, newest first, shaped like blocks" },
  { name: "collections", detail: "the creator's published collections the page was handed, shaped like blocks" },
  { name: "section", detail: "id, type, settings and blocks" },
  { name: "theme", detail: "the theme's own settings: colours, typography, radius, spacing" },
  { name: "scheme", detail: "the colours of this section's colour scheme" },
  { name: "page", detail: "template, and in_editor while the builder draws" },
  { name: "forloop", detail: "inside a for: index, index0, first, last, length" },
  { name: "shop", detail: "name, description, url and product_count of this site" },
  { name: "creator", detail: "the creator's public name, headline, bio and avatar" },
  { name: "product", detail: "on the product page: title, price, image, images, url, description, includes" },
]

export const FILTERS: { name: string; detail: string }[] = [
  { name: "default", detail: 'default: "…" — the fallback when the value is empty' },
  { name: "url", detail: "makes a link safe; refuses javascript: and other schemes" },
  { name: "asset", detail: "asset://name.jpg into this account's real URL" },
  { name: "alpha", detail: "alpha: 0.4 — a colour with opacity" },
  { name: "embed", detail: "the only way a URL may reach an iframe" },
  { name: "raw", detail: "do NOT escape. richtext, inline_richtext and html settings only" },
  { name: "escape", detail: "escape again; output is already escaped" },
  { name: "upcase", detail: "UPPER CASE" },
  { name: "downcase", detail: "lower case" },
  { name: "capitalize", detail: "First letter upper case" },
  { name: "strip", detail: "trim the ends" },
  { name: "append", detail: 'append: "…"' },
  { name: "prepend", detail: 'prepend: "…"' },
  { name: "replace", detail: 'replace: "a", "b"' },
  { name: "truncate", detail: "truncate: 40" },
  { name: "size", detail: "how many, or how long" },
  { name: "first", detail: "the first one" },
  { name: "last", detail: "the last one" },
  { name: "join", detail: 'join: ", "' },
  { name: "plus", detail: "add" },
  { name: "minus", detail: "subtract" },
  { name: "times", detail: "multiply" },
  { name: "divided_by", detail: "divide" },
  { name: "round", detail: "round to a whole number" },
  { name: "json", detail: "the value as JSON, for a data attribute" },
  { name: "date", detail: 'date: "short", a datetime for people to read' },
  { name: "strip_html", detail: "the words of some markup, for alt text" },
  { name: "lines", detail: "a text typed one item per line, as a list" },
]

export const TAGS: { name: string; detail: string }[] = [
  { name: "if", detail: "{% if … %} … {% endif %}" },
  { name: "elsif", detail: "another branch" },
  { name: "else", detail: "when nothing above matched, or a for over an empty list" },
  { name: "endif", detail: "closes an if" },
  { name: "for", detail: "{% for block in blocks %} … {% endfor %}" },
  { name: "endfor", detail: "closes a for" },
]

/** Theme tokens a section reads most, for completing `theme.`. */
export const THEME_TOKENS: { name: string; detail: string }[] = [
  { name: "typography.heading", detail: "the heading font's family" },
  { name: "typography.body", detail: "the body font's family" },
  { name: "radius.small", detail: "the theme's small corner radius, in px" },
  { name: "radius.medium", detail: "the theme's medium corner radius, in px" },
  { name: "radius.large", detail: "the theme's large corner radius, in px" },
  { name: "schemes", detail: "every colour scheme, by name" },
  { name: "settings", detail: "the theme's raw settings" },
]

export interface FileSchema {
  settings: { id: string; type: string; label?: string; default?: unknown }[]
  blocks: { type: string; name?: string; settings: { id: string; type: string; label?: string }[] }[]
}

/**
 * The `<schema>` of the file being edited, as far as it can be read. A schema
 * half-typed is not JSON, and that is the normal state of a file somebody is
 * working in, so failing to parse gives back nothing rather than throwing:
 * the editor offers no completions for a moment instead of breaking.
 */
export function schemaOfSource(source: string): FileSchema {
  const empty: FileSchema = { settings: [], blocks: [] }
  const open = source.indexOf("<schema>")
  const close = source.indexOf("</schema>", open + 1)
  if (open === -1 || close === -1) return empty
  try {
    const raw = JSON.parse(source.slice(open + "<schema>".length, close)) as {
      settings?: FileSchema["settings"]
      blocks?: FileSchema["blocks"]
    }
    return {
      settings: Array.isArray(raw.settings) ? raw.settings.filter((s) => s && typeof s.id === "string") : [],
      blocks: Array.isArray(raw.blocks)
        ? raw.blocks.map((b) => ({ type: b.type, name: b.name, settings: Array.isArray(b.settings) ? b.settings.filter((s) => s && typeof s.id === "string") : [] }))
        : [],
    }
  } catch {
    return empty
  }
}

/** Where the caret is, as far as completing is concerned. */
type Spot =
  | { kind: "none" }
  | { kind: "expr"; word: string; start: number; afterPipe: boolean }
  | { kind: "tag"; word: string; start: number }

function spotAt(source: string, caret: number): Spot {
  // The nearest opener before the caret that has not been closed.
  const before = source.slice(0, caret)
  const openExpr = before.lastIndexOf("{{")
  const openTag = before.lastIndexOf("{%")
  const open = Math.max(openExpr, openTag)
  if (open === -1) return { kind: "none" }
  const closer = open === openExpr ? "}}" : "%}"
  if (before.indexOf(closer, open) !== -1) return { kind: "none" }

  // The word being typed: letters, digits, dots and underscores.
  let start = caret
  while (start > open + 2 && /[\w.]/.test(source[start - 1])) start--
  const word = source.slice(start, caret)
  if (open === openTag) return { kind: "tag", word, start }
  const segment = source.slice(open + 2, caret)
  return { kind: "expr", word, start, afterPipe: /\|[^|]*$/.test(segment) }
}

/**
 * What could go where the caret is. The list is already filtered by what has
 * been typed, so an empty list means nothing matches rather than nothing
 * applies, and the editor can close the popup on it.
 */
export function completionsAt(source: string, caret: number): { items: Completion[]; from: number; to: number } {
  const spot = spotAt(source, caret)
  if (spot.kind === "none") return { items: [], from: caret, to: caret }
  const schema = schemaOfSource(source)
  const items: Completion[] = []
  const word = spot.word

  if (spot.kind === "tag") {
    for (const t of TAGS) items.push({ value: t.name, label: t.name, detail: t.detail, kind: "tag" })
  } else if (spot.afterPipe) {
    for (const f of FILTERS) items.push({ value: f.name, label: f.name, detail: f.detail, kind: "filter" })
  } else {
    const dot = word.lastIndexOf(".")
    const path = dot === -1 ? "" : word.slice(0, dot + 1)
    const settingItems = (list: FileSchema["settings"], kind: Completion["kind"], prefix: string) =>
      list
        .filter((s) => s.type !== "header" && s.type !== "paragraph" && s.type !== "divider")
        .map((s) => ({
          value: `${prefix}${s.id}`,
          label: s.id,
          detail: s.default !== undefined ? `${s.type} — ${JSON.stringify(s.default)}` : s.type,
          kind,
        }))

    if (path === "settings." || path === "section.settings.") {
      items.push(...settingItems(schema.settings, "setting", path))
    } else if (/(^|\.)(block|b|item)\.settings\.$/.test(path) || path.endsWith("block.settings.")) {
      const seen = new Set<string>()
      for (const b of schema.blocks) {
        for (const s of b.settings) {
          if (seen.has(s.id)) continue
          seen.add(s.id)
          items.push({ value: `${path}${s.id}`, label: s.id, detail: `${s.type} — ${b.name ?? b.type}`, kind: "block" })
        }
      }
    } else if (path === "theme.") {
      items.push(...THEME_TOKENS.map((t) => ({ value: `theme.${t.name}`, label: t.name, detail: t.detail, kind: "theme" as const })))
    } else if (path === "section.") {
      for (const [name, detail] of [["id", "this instance's id"], ["type", "the section's type"], ["settings", "the same as settings"], ["blocks", "the same as blocks"]]) {
        items.push({ value: `section.${name}`, label: name, detail, kind: "root" })
      }
    } else if (path === "") {
      items.push(...ROOTS.map((r) => ({ value: r.name, label: r.name, detail: r.detail, kind: "root" as const })))
      // The settings themselves, spelled out, because that is what is wanted
      // nine times in ten and nobody should have to type `settings.` first.
      items.push(...settingItems(schema.settings, "setting", "settings."))
    }
  }

  const needle = word.toLowerCase()
  const match = items.filter((i) => i.value.toLowerCase().startsWith(needle) || i.label.toLowerCase().startsWith(needle.replace(/^.*\./, "")))
  return { items: match, from: spot.start, to: caret }
}

/**
 * Names the schema does not declare, with where they are. The compiler
 * refuses these on save; this is the same answer while typing, which is when
 * it is useful.
 */
export function undeclaredNames(source: string): Diagnostic[] {
  const schema = schemaOfSource(source)
  const open = source.indexOf("<template>")
  const close = source.indexOf("</template>", open + 1)
  if (open === -1 || close === -1) return []
  const declared = new Set(schema.settings.map((s) => s.id))
  const blockIds = new Set(schema.blocks.flatMap((b) => b.settings.map((s) => s.id)))
  if (declared.size === 0 && blockIds.size === 0) return []

  const out: Diagnostic[] = []
  const body = source.slice(open, close)
  const startLine = source.slice(0, open).split("\n").length
  const lines = body.split("\n")
  /**
   * The compiler's rule for a loop variable (lib/storelib-theme/storelib/
   * compile.ts checkReferences): only one over the section's blocks is held
   * against the block schema. `{% for block in products %}` hands out product
   * cards, whose `slug` or `kind` no block declares, and the compiler saves
   * that file; marking it here was a clean file lit up amber. So each
   * `{% for %}` binding is kept with the span it covers, by offset.
   */
  const loops: { name: string; blocks: boolean; from: number; to: number }[] = []
  {
    const stack: { name: string; list: string; from: number }[] = []
    for (const m of body.matchAll(/\{%-?\s*(?:for\s+([a-zA-Z_]\w*)\s+in\s+([\w.]+)|(endfor))\b/g)) {
      if (m[3]) {
        const top = stack.pop()
        if (top) loops.push({ name: top.name, blocks: top.list === "blocks" || top.list === "section.blocks", from: top.from, to: m.index ?? 0 })
      } else stack.push({ name: m[1], list: m[2], from: m.index ?? 0 })
    }
  }
  const lineStart: number[] = []
  for (let i = 0, at = 0; i < lines.length; at += lines[i].length + 1, i++) lineStart.push(at)
  /* The innermost loop that binds `name` around `at` is what the name means there. */
  const boundOutsideBlocks = (name: string, at: number) => {
    let best: (typeof loops)[number] | null = null
    for (const b of loops) if (b.name === name && b.from <= at && at < b.to && (!best || b.from > best.from)) best = b
    return best !== null && !best.blocks
  }
  for (const [i, text] of lines.entries()) {
    /**
     * `(?<![\w.])` and not `\b`: a word boundary sits happily after the dot
     * in `block.settings.question`, so every block setting was being read as
     * a section setting that does not exist. A clean file reported errors,
     * which is the one thing a checker must never do.
     */
    for (const m of text.matchAll(/(?<![\w.])(?:section\.)?settings\.([a-zA-Z_][\w]*)/g)) {
      if (declared.has(m[1])) continue
      out.push({
        line: startLine + i,
        column: (m.index ?? 0) + m[0].length - m[1].length + 1,
        length: m[1].length,
        message: `No setting is called "${m[1]}"${declared.size ? `. This section declares: ${[...declared].sort().join(", ")}.` : "."}`,
      })
    }
    if (blockIds.size === 0) continue
    for (const m of text.matchAll(/(?<![\w.])([a-zA-Z_]\w*)\.settings\.([a-zA-Z_][\w]*)/g)) {
      if (m[1] === "section") continue
      if (blockIds.has(m[2])) continue
      if (boundOutsideBlocks(m[1], lineStart[i] + (m.index ?? 0))) continue
      out.push({
        line: startLine + i,
        column: (m.index ?? 0) + m[0].length - m[2].length + 1,
        length: m[2].length,
        message: `No block setting is called "${m[2]}". This section's blocks have: ${[...blockIds].sort().join(", ")}.`,
      })
    }
  }
  return out
}

/** One line about the token under the caret, or nothing. */
export function documentationAt(source: string, caret: number): { title: string; detail: string } | null {
  let start = caret
  while (start > 0 && /[\w.]/.test(source[start - 1])) start--
  let end = caret
  while (end < source.length && /[\w.]/.test(source[end])) end++
  const token = source.slice(start, end)
  if (!token) return null

  const filter = FILTERS.find((f) => f.name === token)
  if (filter && /\|\s*[\w.]*$/.test(source.slice(Math.max(0, start - 40), start))) {
    return { title: `| ${filter.name}`, detail: filter.detail }
  }
  const tag = TAGS.find((t) => t.name === token)
  if (tag && /\{%\s*[\w.]*$/.test(source.slice(Math.max(0, start - 20), start))) {
    return { title: `{% ${tag.name} %}`, detail: tag.detail }
  }
  const root = ROOTS.find((r) => r.name === token.split(".")[0])
  if (root) {
    const schema = schemaOfSource(source)
    const id = /^(?:section\.)?settings\.([\w]+)$/.exec(token)?.[1]
    if (id) {
      const def = schema.settings.find((s) => s.id === id)
      return def
        ? { title: `settings.${id}`, detail: `${def.type}${def.label ? ` — ${def.label}` : ""}${def.default !== undefined ? `, default ${JSON.stringify(def.default)}` : ""}` }
        : { title: `settings.${id}`, detail: "not declared in this section's schema" }
    }
    return { title: root.name, detail: root.detail }
  }
  return null
}
