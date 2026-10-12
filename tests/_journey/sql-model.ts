/**
 * THE TABLES AS THE REPOSITORY'S SQL WRITES THEM, for the journey's database.
 *
 * tests/_schema.ts reads which columns exist; this reads what an in-memory
 * PostgREST also needs to behave like the real one: each column's default
 * (a row inserted without `status` reads back 'pending'), the primary key
 * (an upsert without on_conflict), the unique keys (a second line with the
 * same receipt token is 23505, which the checkout relies on) and the
 * foreign keys (an embedded select such as `orders(id, product_snapshot)`).
 *
 * The SQL is the union of every file, as _schema reads it: generous, so a
 * column added in any file counts.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { SQL_DIRS } from "../_schema"

export type DefaultValue = { kind: "value"; value: unknown } | { kind: "now" } | { kind: "uuid" } | { kind: "identity" }

export interface UniqueKey {
  columns: string[]
  /** lower(col) in the index: compared case blind. */
  lower: string[]
  /** A partial index: only rows where this column is truthy / not null count. */
  where?: { column: string; test: "truthy" | "not_null" }
}

export interface TableModel {
  name: string
  columns: Map<string, { default?: DefaultValue }>
  primaryKey: string[]
  uniques: UniqueKey[]
  /** column -> referenced table */
  references: Map<string, string>
}

function sqlFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries.sort()) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (e.endsWith(".sql")) out.push(p)
    }
  }
  for (const d of SQL_DIRS) walk(join(root, d))
  return out
}

/** Comments out, string literals kept (defaults need them). */
function stripComments(src: string): string {
  let out = ""
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === "-" && n === "-") {
      while (i < src.length && src[i] !== "\n") i++
      continue
    }
    if (c === "/" && n === "*") {
      i += 2
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++
      i += 2
      continue
    }
    if (c === "'") {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === "'" && src[j + 1] === "'") {
          j += 2
          continue
        }
        if (src[j] === "'") break
        j++
      }
      out += src.slice(i, j + 1)
      i = j + 1
      continue
    }
    out += c
    i++
  }
  return out
}

function balanced(src: string, open: number): string {
  let depth = 0
  let inStr = false
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === "'") inStr = !inStr
    if (inStr) continue
    if (ch === "(") depth++
    else if (ch === ")") {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return src.slice(open + 1)
}

function topLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ""
  let inStr = false
  for (const ch of body) {
    if (ch === "'") inStr = !inStr
    if (!inStr && ch === "(") depth++
    if (!inStr && ch === ")") depth--
    if (!inStr && ch === "," && depth === 0) {
      parts.push(cur)
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts
}

const ident = (raw: string) => raw.replace(/"/g, "").replace(/^public\./i, "").trim().toLowerCase()

function readDefault(def: string): DefaultValue | undefined {
  const m = /\bdefault\s+((?:'(?:[^']|'')*'(?:::[\w\[\]]+)?)|[^\s,]+(?:\(\))?)/i.exec(def)
  if (/\bgenerated\s+(always|by\s+default)\s+as\s+identity/i.test(def)) return { kind: "identity" }
  if (!m) return undefined
  const raw = m[1].trim()
  if (/^now\(\)|^current_timestamp/i.test(raw)) return { kind: "now" }
  if (/^(gen_random_uuid|uuid_generate_v4)\(\)/i.test(raw)) return { kind: "uuid" }
  if (/^true$/i.test(raw)) return { kind: "value", value: true }
  if (/^false$/i.test(raw)) return { kind: "value", value: false }
  if (/^null$/i.test(raw)) return { kind: "value", value: null }
  if (/^-?\d+(\.\d+)?$/.test(raw)) return { kind: "value", value: Number(raw) }
  const lit = /^'((?:[^']|'')*)'(?:::([\w\[\]]+))?$/.exec(raw)
  if (lit) {
    const text = lit[1].replace(/''/g, "'")
    if (lit[2] && /jsonb?/i.test(lit[2])) {
      try {
        return { kind: "value", value: JSON.parse(text) }
      } catch {
        return undefined
      }
    }
    if (lit[2] && /\[\]$/.test(lit[2])) return { kind: "value", value: [] }
    return { kind: "value", value: text }
  }
  if (/^array\[\]/i.test(raw) || /^'\{\}'/.test(raw)) return { kind: "value", value: [] }
  return undefined
}

function table(model: Map<string, TableModel>, name: string): TableModel {
  let t = model.get(name)
  if (!t) {
    t = { name, columns: new Map(), primaryKey: [], uniques: [], references: new Map() }
    model.set(name, t)
  }
  return t
}

function addColumn(t: TableModel, def: string) {
  const col = def.trim().match(/^"?([A-Za-z_][\w]*)"?\s+(.*)$/s)
  if (!col) return
  const name = col[1].toLowerCase()
  const rest = col[2]
  const had = t.columns.get(name)
  const d = readDefault(rest)
  t.columns.set(name, { default: d ?? had?.default })
  if (/\bprimary\s+key\b/i.test(rest)) t.primaryKey = [name]
  if (/\bunique\b/i.test(rest) && !t.uniques.some((u) => u.columns.length === 1 && u.columns[0] === name)) t.uniques.push({ columns: [name], lower: [] })
  const ref = /\breferences\s+((?:"?public"?\.)?"?[A-Za-z_]\w*"?)/i.exec(rest)
  if (ref) t.references.set(name, ident(ref[1]))
}

function colList(s: string): { columns: string[]; lower: string[] } | null {
  const columns: string[] = []
  const lower: string[] = []
  for (const p of topLevel(s)) {
    const v = p.trim()
    const plain = /^"?([A-Za-z_]\w*)"?$/.exec(v)
    if (plain) {
      columns.push(plain[1].toLowerCase())
      continue
    }
    const low = /^lower\(\s*"?([A-Za-z_]\w*)"?\s*\)$/i.exec(v)
    if (low) {
      columns.push(low[1].toLowerCase())
      lower.push(low[1].toLowerCase())
      continue
    }
    const coal = /^coalesce\(\s*(?:lower\(\s*)?"?([A-Za-z_]\w*)"?/i.exec(v)
    if (coal) {
      columns.push(coal[1].toLowerCase())
      if (/coalesce\(\s*lower/i.test(v)) lower.push(coal[1].toLowerCase())
      continue
    }
    return null
  }
  return { columns, lower }
}

export function loadModel(root = process.cwd()): Map<string, TableModel> {
  const model = new Map<string, TableModel>()
  const NAME = String.raw`((?:"?public"?\.)?"?[A-Za-z_][\w]*"?)`
  for (const file of sqlFiles(root)) {
    const src = stripComments(readFileSync(file, "utf8"))
    for (const m of src.matchAll(new RegExp(String.raw`create\s+(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${NAME}\s*\(`, "gi"))) {
      const t = table(model, ident(m[1]))
      const body = balanced(src, m.index! + m[0].length - 1)
      for (const part of topLevel(body)) {
        const p = part.trim()
        const pk = /^(?:constraint\s+\w+\s+)?primary\s+key\s*\(([^)]*)\)/i.exec(p)
        if (pk) {
          t.primaryKey = pk[1].split(",").map((c) => ident(c))
          continue
        }
        const uq = /^(?:constraint\s+\w+\s+)?unique\s*(?:nulls\s+not\s+distinct\s*)?\(([^)]*)\)/i.exec(p)
        if (uq) {
          const cols = uq[1].split(",").map((c) => ident(c))
          if (!t.uniques.some((u) => u.columns.join() === cols.join())) t.uniques.push({ columns: cols, lower: [] })
          continue
        }
        if (/^(constraint|foreign|check|exclude|like)\b/i.test(p)) continue
        addColumn(t, p)
      }
    }
    for (const m of src.matchAll(new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${NAME}([^;]*)`, "gi"))) {
      const t = table(model, ident(m[1]))
      for (const part of topLevel(m[2])) {
        const a = /^\s*add\s+column\s+(?:if\s+not\s+exists\s+)?(.*)$/is.exec(part) ?? /^\s*add\s+(?!constraint|primary|unique|foreign|check)(?:if\s+not\s+exists\s+)?(.*)$/is.exec(part)
        if (a) addColumn(t, a[1])
        const dflt = /^\s*alter\s+(?:column\s+)?"?([A-Za-z_]\w*)"?\s+set\s+default\s+(.*)$/is.exec(part)
        if (dflt && t.columns.has(dflt[1].toLowerCase())) t.columns.set(dflt[1].toLowerCase(), { default: readDefault(`default ${dflt[2]}`) })
        const uq = /^\s*add\s+constraint\s+\w+\s+unique\s*\(([^)]*)\)/i.exec(part)
        if (uq) {
          const cols = uq[1].split(",").map((c) => ident(c))
          if (!t.uniques.some((u) => u.columns.join() === cols.join())) t.uniques.push({ columns: cols, lower: [] })
        }
      }
    }
    for (const m of src.matchAll(new RegExp(String.raw`create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?\w+\s+on\s+(?:only\s+)?${NAME}\s*(?:using\s+\w+\s*)?\(`, "gi"))) {
      const t = table(model, ident(m[1]))
      const open = m.index! + m[0].length - 1
      const inner = balanced(src, open)
      const after = src.slice(open + inner.length + 2, open + inner.length + 200).split(";")[0]
      const cols = colList(inner)
      if (!cols) continue
      let where: UniqueKey["where"]
      const w = /^\s*where\s+(.*)$/is.exec(after)
      if (w) {
        const cond = w[1].trim()
        const nn = /^"?([A-Za-z_]\w*)"?\s+is\s+not\s+null$/i.exec(cond)
        const truthy = /^"?([A-Za-z_]\w*)"?$/i.exec(cond)
        if (nn) where = { column: nn[1].toLowerCase(), test: "not_null" }
        else if (truthy) where = { column: truthy[1].toLowerCase(), test: "truthy" }
        else continue
      }
      if (!t.uniques.some((u) => u.columns.join() === cols.columns.join() && JSON.stringify(u.where) === JSON.stringify(where))) t.uniques.push({ ...cols, where })
    }
  }
  for (const t of model.values()) if (t.primaryKey.length === 0 && t.columns.has("id")) t.primaryKey = ["id"]
  return model
}
