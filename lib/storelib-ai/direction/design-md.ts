/**
 * ===========================================================================
 *  DESIGN.md: THE SITE'S DESIGN CONTRACT AS A FILE
 * ===========================================================================
 * Round O (O2), prompt section D. The format is Google's DESIGN.md
 * (github.com/google-labs-code/design.md, docs/spec.md, version "alpha",
 * Apache 2.0): YAML front matter with the normative tokens (name,
 * description, colors, typography, rounded, spacing, components) and a
 * Markdown body of `##` sections in the spec's order (Overview, Colors,
 * Typography, Layout, Elevation & Depth, Shapes, Components, Do's and
 * Don'ts). Sections the spec does not know (Imagery, Motion) are allowed and
 * preserved. Only the spec's schema keys are written to the YAML; anything
 * Storelib needs beyond it lives in a typed model elsewhere (contract.ts
 * `design_contract`), never as invented YAML fields.
 *
 * The YAML here is the small subset the format uses: nested maps, scalars
 * (strings, numbers, booleans), simple lists. It is parsed, never evaluated.
 * Interleaved ```yaml blocks are merged as the spec says; a top-level key
 * defined twice, or a `##` heading used twice, is an error with its line.
 *
 * Pure. Browser safe.
 */

export const DESIGN_MD_PATH = "DESIGN.md"
export const DESIGN_MD_VERSION = "alpha"

export interface TypographyToken {
  fontFamily?: string
  fontSize?: string
  fontWeight?: number
  lineHeight?: number | string
  letterSpacing?: string
  fontFeature?: string
  fontVariation?: string
}

/** The spec's token schema. Unknown keys inside a group are kept (the spec accepts them). */
export interface DesignMdTokens {
  version?: string
  name: string
  description?: string
  omitted?: unknown[]
  colors: Record<string, string>
  typography: Record<string, TypographyToken>
  rounded: Record<string, string>
  spacing: Record<string, string | number>
  components: Record<string, Record<string, string>>
}

export interface DesignMdSection {
  heading: string
  body: string
}

export interface DesignMdDoc {
  tokens: DesignMdTokens
  /** An optional `# title` line before the sections. */
  title: string | null
  sections: DesignMdSection[]
}

export interface DesignMdError {
  message: string
  line?: number
}

/** The spec's section order, with its aliases. */
export const SECTION_ORDER: { name: string; aliases: string[] }[] = [
  { name: "Overview", aliases: ["brand & style", "brand and style"] },
  { name: "Colors", aliases: ["colours"] },
  { name: "Typography", aliases: [] },
  { name: "Layout", aliases: ["layout & spacing", "layout and spacing"] },
  { name: "Elevation & Depth", aliases: ["elevation", "elevation and depth"] },
  { name: "Shapes", aliases: [] },
  { name: "Components", aliases: [] },
  { name: "Do's and Don'ts", aliases: ["dos and donts", "do's and don'ts", "dos and don'ts"] },
]

const TOP_KEYS = ["version", "name", "description", "omitted", "colors", "typography", "rounded", "spacing", "components"]

/* ── YAML, the subset ──────────────────────────────────────────────────── */

type Yaml = string | number | boolean | null | Yaml[] | { [k: string]: Yaml }

const PLAIN_SAFE = /^[A-Za-z][A-Za-z0-9 ._-]*$/

function scalar(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  if (typeof v === "boolean") return v ? "true" : "false"
  const s = String(v ?? "")
  /* Plain where it is unambiguous (a font name, a word); otherwise JSON quoting, which is valid YAML. */
  if (PLAIN_SAFE.test(s) && !/^(true|false|null|yes|no|on|off|~)$/i.test(s) && !/ $/.test(s)) return s
  return JSON.stringify(s)
}

function emit(value: Yaml | undefined, indent: number, out: string[], key?: string): void {
  const pad = "  ".repeat(indent)
  if (value === undefined) return
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    if (key !== undefined) out.push(`${pad}${key}:`)
    for (const [k, v] of Object.entries(value)) emit(v, key !== undefined ? indent + 1 : indent, out, k)
    return
  }
  if (Array.isArray(value)) {
    out.push(`${pad}${key}:`)
    for (const item of value) {
      if (item !== null && typeof item === "object" && !Array.isArray(item)) {
        const entries = Object.entries(item)
        entries.forEach(([k, v], i) => out.push(`${pad}  ${i === 0 ? "- " : "  "}${k}: ${scalar(v)}`))
      } else out.push(`${pad}  - ${scalar(item)}`)
    }
    return
  }
  out.push(`${pad}${key}: ${scalar(value)}`)
}

/** Strip a trailing ` # comment` outside quotes. */
function stripComment(s: string): string {
  let q: string | null = null
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === "\\" && q === '"') i++
      else if (c === q) q = null
    } else if (c === '"' || c === "'") q = c
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd()
  }
  return s
}

function parseScalar(raw: string, line: number, errors: DesignMdError[]): Yaml {
  const s = raw.trim()
  if (s === "" || s === "~" || s === "null") return null
  if (s.startsWith('"')) {
    try {
      return JSON.parse(s) as string
    } catch {
      errors.push({ line, message: `line ${line}: a quoted value is not closed or has a bad escape` })
      return s.slice(1)
    }
  }
  if (s.startsWith("'")) {
    if (!s.endsWith("'") || s.length < 2) {
      errors.push({ line, message: `line ${line}: a quoted value is not closed` })
      return s.slice(1)
    }
    return s.slice(1, -1).replace(/''/g, "'")
  }
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim()
    return inner ? inner.split(",").map((x) => parseScalar(x, line, errors)) : []
  }
  if (s === "true") return true
  if (s === "false") return false
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  return s
}

/** The YAML subset into a value, with every problem and its line (offset by `firstLine`). */
export function parseYaml(text: string, firstLine = 1): { value: { [k: string]: Yaml }; errors: DesignMdError[] } {
  const errors: DesignMdError[] = []
  const root: { [k: string]: Yaml } = {}
  /* A stack of open containers: the indent their children have, and the container. */
  const stack: { indent: number; node: { [k: string]: Yaml } | Yaml[]; key?: string }[] = [{ indent: 0, node: root }]
  const lines = text.split(/\r?\n/)
  let pendingKey: { parent: { [k: string]: Yaml }; key: string; indent: number; line: number } | null = null
  lines.forEach((rawLine, i) => {
    const line = firstLine + i
    if (/^\s*(#.*)?$/.test(rawLine)) return
    if (/^\t| \t/.test(rawLine.match(/^\s*/)?.[0] ?? "")) {
      errors.push({ line, message: `line ${line}: indent with spaces, not tabs` })
      return
    }
    const indent = rawLine.length - rawLine.trimStart().length
    const body = stripComment(rawLine.trim())
    /* The key that opened a block: its children decide whether it is a map or a list. */
    if (pendingKey) {
      if (indent > pendingKey.indent) {
        const container: { [k: string]: Yaml } | Yaml[] = body.startsWith("- ") || body === "-" ? [] : {}
        pendingKey.parent[pendingKey.key] = container
        stack.push({ indent, node: container })
      } else pendingKey.parent[pendingKey.key] = null
      pendingKey = null
    }
    while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop()
    const top = stack[stack.length - 1]
    if (indent !== top.indent) {
      errors.push({ line, message: `line ${line}: the indentation does not line up with the lines above` })
      return
    }
    if (Array.isArray(top.node)) {
      if (!(body.startsWith("- ") || body === "-")) {
        errors.push({ line, message: `line ${line}: expected a list item ("- ...")` })
        return
      }
      const item = body.slice(1).trim()
      const kv = /^([A-Za-z0-9_$.-][^:]*?):(\s+.*|)$/.exec(item)
      if (kv && !item.startsWith('"') && !item.startsWith("'")) {
        const obj: { [k: string]: Yaml } = { [kv[1].trim()]: parseScalar(kv[2], line, errors) }
        top.node.push(obj)
        stack.push({ indent: indent + 2, node: obj })
      } else top.node.push(parseScalar(item, line, errors))
      return
    }
    const m = /^("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_$@.-][^:]*?):(?:\s+(.*))?$/.exec(body)
    if (!m) {
      errors.push({ line, message: `line ${line}: expected "key: value"` })
      return
    }
    const key = m[1].startsWith('"') ? (JSON.parse(m[1]) as string) : m[1].startsWith("'") ? m[1].slice(1, -1) : m[1].trim()
    const map = top.node as { [k: string]: Yaml }
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      errors.push({ line, message: `line ${line}: "${key}" is defined twice` })
      return
    }
    if (m[2] === undefined || m[2].trim() === "") {
      pendingKey = { parent: map, key, indent, line }
      map[key] = null
      return
    }
    map[key] = parseScalar(m[2], line, errors)
  })
  if (pendingKey) (pendingKey as { parent: { [k: string]: Yaml }; key: string }).parent[(pendingKey as { key: string }).key] = null
  return { value: root, errors }
}

/* ── the document ──────────────────────────────────────────────────────── */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (isObj(v)) for (const [k, x] of Object.entries(v)) if (typeof x === "string" || typeof x === "number") out[k] = String(x)
  return out
}

function readTokens(tree: Record<string, unknown>, errors: DesignMdError[]): DesignMdTokens {
  const typography: Record<string, TypographyToken> = {}
  if (isObj(tree.typography)) {
    for (const [k, v] of Object.entries(tree.typography)) {
      if (!isObj(v)) {
        errors.push({ message: `typography.${k}: a group of fontFamily, fontSize, fontWeight, lineHeight, letterSpacing` })
        continue
      }
      const t: TypographyToken = {}
      if (typeof v.fontFamily === "string") t.fontFamily = v.fontFamily
      if (typeof v.fontSize === "string" || typeof v.fontSize === "number") t.fontSize = String(v.fontSize)
      if (v.fontWeight !== undefined && v.fontWeight !== null) t.fontWeight = Number(v.fontWeight)
      if (typeof v.lineHeight === "number" || typeof v.lineHeight === "string") t.lineHeight = v.lineHeight
      if (typeof v.letterSpacing === "string" || typeof v.letterSpacing === "number") t.letterSpacing = String(v.letterSpacing)
      if (typeof v.fontFeature === "string") t.fontFeature = v.fontFeature
      if (typeof v.fontVariation === "string") t.fontVariation = v.fontVariation
      typography[k] = t
    }
  }
  const spacing: Record<string, string | number> = {}
  if (isObj(tree.spacing)) for (const [k, v] of Object.entries(tree.spacing)) if (typeof v === "string" || typeof v === "number") spacing[k] = v
  const components: Record<string, Record<string, string>> = {}
  if (isObj(tree.components)) for (const [k, v] of Object.entries(tree.components)) components[k] = stringMap(v)
  if (typeof tree.name !== "string" || !tree.name.trim()) errors.push({ message: "name: the design system needs a name" })
  return {
    ...(typeof tree.version === "string" || typeof tree.version === "number" ? { version: String(tree.version) } : {}),
    name: typeof tree.name === "string" ? tree.name : "",
    ...(typeof tree.description === "string" ? { description: tree.description } : {}),
    ...(Array.isArray(tree.omitted) ? { omitted: tree.omitted } : {}),
    colors: stringMap(tree.colors),
    typography,
    rounded: stringMap(tree.rounded),
    spacing,
    components,
  }
}

/** A DESIGN.md read: its tokens, title and sections, or every problem with its line. */
export function parseDesignMd(text: string): { ok: true; doc: DesignMdDoc } | { ok: false; errors: DesignMdError[] } {
  const errors: DesignMdError[] = []
  const src = String(text ?? "").replace(/^﻿/, "")
  const lines = src.split(/\r?\n/)
  let start = 0
  while (start < lines.length && lines[start].trim() === "") start++
  const tree: Record<string, unknown> = {}
  const merge = (value: Record<string, unknown>, line: number) => {
    for (const [k, v] of Object.entries(value)) {
      if (k in tree) errors.push({ line, message: `line ${line}: "${k}" is defined in more than one YAML block` })
      else tree[k] = v
    }
  }
  let bodyFrom = start
  if (lines[start]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > start && l.trim() === "---")
    if (end < 0) return { ok: false, errors: [{ line: start + 1, message: `line ${start + 1}: the front matter starts with --- and has no closing ---` }] }
    const fm = parseYaml(lines.slice(start + 1, end).join("\n"), start + 2)
    errors.push(...fm.errors)
    merge(fm.value, start + 1)
    bodyFrom = end + 1
  }
  /* Interleaved ```yaml blocks (the spec allows both). */
  const body = lines.slice(bodyFrom)
  const kept: string[] = []
  for (let i = 0; i < body.length; i++) {
    if (/^```ya?ml\s*$/.test(body[i].trim())) {
      const close = body.findIndex((l, j) => j > i && l.trim() === "```")
      if (close < 0) {
        errors.push({ line: bodyFrom + i + 1, message: `line ${bodyFrom + i + 1}: a yaml block is not closed` })
        break
      }
      const block = parseYaml(body.slice(i + 1, close).join("\n"), bodyFrom + i + 2)
      errors.push(...block.errors)
      /* Only blocks of the schema's own keys are tokens; an example block in prose is just prose. */
      if (Object.keys(block.value).some((k) => TOP_KEYS.includes(k))) merge(block.value, bodyFrom + i + 1)
      kept.push(...body.slice(i, close + 1))
      i = close
      continue
    }
    kept.push(body[i])
  }
  if (!Object.keys(tree).length) errors.push({ line: 1, message: "line 1: no design tokens. Start the file with --- front matter (name, colors, typography, rounded, spacing) and close it with ---" })
  const tokens = readTokens(tree, errors)
  let title: string | null = null
  const sections: DesignMdSection[] = []
  const seen = new Map<string, number>()
  let current: DesignMdSection | null = null
  const pre: string[] = []
  kept.forEach((l, i) => {
    const h2 = /^##\s+(.+?)\s*#*\s*$/.exec(l)
    if (h2 && !/^###/.test(l)) {
      const heading = h2[1].trim()
      const key = canonicalSection(heading).toLowerCase()
      const line = bodyFrom + i + 1
      if (seen.has(key)) errors.push({ line, message: `line ${line}: the section "${heading}" is there twice (also line ${seen.get(key)})` })
      seen.set(key, line)
      current = { heading, body: "" }
      sections.push(current)
      return
    }
    const h1 = /^#\s+(.+)$/.exec(l)
    if (h1 && !current && title === null) {
      title = h1[1].trim()
      return
    }
    if (current) (current as DesignMdSection).body += `${(current as DesignMdSection).body ? "\n" : ""}${l}`
    else pre.push(l)
  })
  for (const s of sections) s.body = s.body.replace(/^\n+|\s+$/g, "")
  if (errors.length) return { ok: false, errors }
  return { ok: true, doc: { tokens, title, sections } }
}

/** A section heading as the spec names it ("Brand & Style" is "Overview"). */
export function canonicalSection(heading: string): string {
  const h = heading.trim().toLowerCase()
  const known = SECTION_ORDER.find((s) => s.name.toLowerCase() === h || s.aliases.includes(h))
  return known ? known.name : heading.trim()
}

/** The tokens as YAML front matter, between --- lines. Keys in the spec's order; empty groups left out. */
export function frontMatter(tokens: DesignMdTokens): string {
  const out: string[] = ["---"]
  const tree: Record<string, Yaml> = { version: tokens.version ?? DESIGN_MD_VERSION, name: tokens.name }
  if (tokens.description) tree.description = tokens.description
  if (tokens.omitted?.length) tree.omitted = tokens.omitted as Yaml[]
  for (const k of ["colors", "typography", "rounded", "spacing", "components"] as const) {
    const g = tokens[k] as Record<string, Yaml>
    if (g && Object.keys(g).length) tree[k] = JSON.parse(JSON.stringify(g)) as Yaml
  }
  for (const [k, v] of Object.entries(tree)) emit(v, 0, out, k)
  out.push("---")
  return out.join("\n")
}

/** A whole DESIGN.md: front matter, an optional title, then the sections in the spec's order (unknown ones after Components). */
export function renderDesignMd(doc: DesignMdDoc): string {
  const known = SECTION_ORDER.map((s) => s.name)
  const rank = (h: string) => {
    const i = known.indexOf(canonicalSection(h))
    /* Unknown sections sit before Do's and Don'ts, after Components. */
    return i >= 0 ? (i === known.length - 1 ? 100 : i) : 50
  }
  const ordered = doc.sections.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s.heading) - rank(b.s.heading) || a.i - b.i).map((x) => x.s)
  return [frontMatter(doc.tokens), "", ...(doc.title ? [`# ${doc.title}`, ""] : []), ...ordered.flatMap((s) => [`## ${s.heading}`, "", s.body.trim(), ""])].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n"
}

/** The same file with its front matter replaced by these tokens and everything below kept byte for byte. */
export function replaceFrontMatter(text: string, tokens: DesignMdTokens): string {
  const src = String(text ?? "")
  const lines = src.split("\n")
  let start = 0
  while (start < lines.length && lines[start].trim() === "") start++
  if (lines[start]?.trim() === "---") {
    const end = lines.findIndex((l, i) => i > start && l.trim() === "---")
    if (end > start) return `${frontMatter(tokens)}\n${lines.slice(end + 1).join("\n")}`
  }
  return `${frontMatter(tokens)}\n\n${src}`
}

/** A dimension (`24px`, `1.5rem`, `16`) in px, rem and em at 16px; null when it is not one. */
export function px(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(px|rem|em)?\s*$/.exec(String(v ?? ""))
  if (!m) return null
  const n = Number(m[1])
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n
}

/** A token reference `{colors.primary}` resolved inside the tokens (one level of indirection at a time, at most four). */
export function resolveRef(tokens: DesignMdTokens, value: string): string {
  let v = value
  for (let i = 0; i < 4; i++) {
    const m = /^\{([a-z]+)\.([A-Za-z0-9_-]+)\}$/.exec(v.trim())
    if (!m) return v
    const group = (tokens as unknown as Record<string, Record<string, unknown>>)[m[1]]
    const next = group?.[m[2]]
    if (typeof next !== "string" && typeof next !== "number") return v
    v = String(next)
  }
  return v
}
