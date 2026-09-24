import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

/**
 * ===========================================================================
 *  THE DATABASE AS THE REPOSITORY DESCRIBES IT
 * ===========================================================================
 * Every SQL file this repository has ever asked somebody to run, read for the
 * tables and columns it creates. There is no generated types file and no
 * dump of the live schema here, so this is the best picture of the database
 * that can be built without a connection: the union of every CREATE TABLE,
 * every ALTER TABLE ... ADD COLUMN and every RENAME.
 *
 * It is deliberately generous. The files are not one ordered history (there
 * are three folders of them and several were pasted by hand), so a column
 * dropped in one file and added in another is counted as present. What this
 * catches is the column nobody ever created, which is exactly the shape of
 * `orders.creator_id`: a name that sounds right and was never in any file.
 *
 * A view is recorded with the columns of its select list when they can be
 * read, and as "any column" when they cannot, so a view never produces a
 * false alarm.
 */

export type Schema = {
  tables: Map<string, Set<string>>
  /** Views whose columns could not be read. Any column is accepted. */
  openViews: Set<string>
  /** Functions callable through `.rpc()`. */
  functions: Set<string>
}

export const SQL_DIRS = ["supabase/migrations", "supabase/sql", "scripts"]

function sqlFiles(root: string): string[] {
  const out: string[] = []
  for (const dir of SQL_DIRS) {
    const full = join(root, dir)
    let entries: string[] = []
    try {
      entries = readdirSync(full)
    } catch {
      continue
    }
    for (const e of entries) {
      const p = join(full, e)
      if (e.endsWith(".sql") && statSync(p).isFile()) out.push(p)
    }
  }
  return out
}

/** Comments out, string literals blanked, so a quoted word is never read as a column. */
export function stripSql(src: string): string {
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
      /* '' inside a literal is an escaped quote, not the end of it. */
      i++
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") {
          i += 2
          continue
        }
        if (src[i] === "'") break
        i++
      }
      i++
      out += "''"
      continue
    }
    out += c
    i++
  }
  return out
}

const ident = (raw: string) => raw.replace(/"/g, "").replace(/^public\./i, "").trim().toLowerCase()

/** The text between the bracket at `open` and its partner. */
function balanced(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++
    else if (src[i] === ")") {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return src.slice(open + 1)
}

/** Split on commas that are not inside brackets. */
function topLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of body) {
    if (ch === "(") depth++
    if (ch === ")") depth--
    if (ch === "," && depth === 0) {
      parts.push(cur)
      cur = ""
    } else cur += ch
  }
  if (cur.trim()) parts.push(cur)
  return parts
}

const NOT_A_COLUMN = /^(constraint|primary|unique|foreign|check|exclude|like)\b/i

function add(schema: Schema, table: string, column: string) {
  const t = schema.tables.get(table) ?? new Set<string>()
  t.add(column)
  schema.tables.set(table, t)
}

export function parseSql(sql: string, schema: Schema) {
  const src = stripSql(sql)
  const TABLE_NAME = String.raw`((?:"?public"?\.)?"?[A-Za-z_][\w]*"?)`

  /* CREATE TABLE name ( ... ) */
  const create = new RegExp(String.raw`create\s+(?:unlogged\s+|temp(?:orary)?\s+)?table\s+(?:if\s+not\s+exists\s+)?${TABLE_NAME}\s*\(`, "gi")
  for (const m of src.matchAll(create)) {
    const table = ident(m[1])
    if (!schema.tables.has(table)) schema.tables.set(table, new Set())
    const body = balanced(src, m.index! + m[0].length - 1)
    for (const part of topLevel(body)) {
      const t = part.trim()
      if (!t || NOT_A_COLUMN.test(t)) continue
      const col = t.match(/^"?([A-Za-z_][\w]*)"?/)
      if (col) add(schema, table, col[1].toLowerCase())
    }
  }

  /* ALTER TABLE name ... up to the end of the statement */
  const alter = new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${TABLE_NAME}([^;]*)`, "gi")
  for (const m of src.matchAll(alter)) {
    const table = ident(m[1])
    const rest = m[2]
    for (const a of rest.matchAll(/\badd\s+(?:column\s+)?(?:if\s+not\s+exists\s+)?"?([A-Za-z_][\w]*)"?/gi)) {
      const col = a[1].toLowerCase()
      if (["constraint", "primary", "unique", "foreign", "check", "exclude"].includes(col)) continue
      add(schema, table, col)
    }
    for (const r of rest.matchAll(/\brename\s+(?:column\s+)?"?([A-Za-z_][\w]*)"?\s+to\s+"?([A-Za-z_][\w]*)"?/gi)) {
      if (r[1].toLowerCase() === "constraint") continue
      add(schema, table, r[2].toLowerCase())
    }
    const renamed = rest.match(/^\s*rename\s+to\s+"?([A-Za-z_][\w]*)"?/i)
    if (renamed) {
      const cols = schema.tables.get(table) ?? new Set<string>()
      const target = schema.tables.get(renamed[1].toLowerCase()) ?? new Set<string>()
      for (const c of cols) target.add(c)
      schema.tables.set(renamed[1].toLowerCase(), target)
    }
  }

  /* CREATE VIEW name [(cols)] AS SELECT ... */
  const view = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?(?:materialized\s+)?view\s+(?:if\s+not\s+exists\s+)?${TABLE_NAME}\s*(\([^)]*\))?\s+(?:with\s*\([^)]*\)\s*)?as\s+([\s\S]*?);`, "gi")
  for (const m of src.matchAll(view)) {
    const name = ident(m[1])
    const explicit = m[2]
    if (explicit) {
      for (const c of explicit.slice(1, -1).split(",")) add(schema, name, ident(c))
      continue
    }
    const select = m[3].match(/^\s*select\s+(?:distinct\s+(?:on\s*\([^)]*\)\s*)?)?([\s\S]*?)\s+from\s/i)
    if (!select || /(^|,)\s*[\w.]*\*/.test(select[1])) {
      schema.openViews.add(name)
      schema.tables.set(name, schema.tables.get(name) ?? new Set())
      continue
    }
    for (const part of topLevel(select[1])) {
      const alias = part.trim().match(/(?:\bas\s+"?([A-Za-z_]\w*)"?|(?:^|\.)"?([A-Za-z_]\w*)"?)\s*$/i)
      if (alias) add(schema, name, (alias[1] ?? alias[2]).toLowerCase())
    }
  }

  /* CREATE FUNCTION name(...) */
  for (const m of src.matchAll(/create\s+(?:or\s+replace\s+)?function\s+((?:"?public"?\.)?"?[A-Za-z_][\w]*"?)\s*\(/gi)) {
    schema.functions.add(ident(m[1]))
  }
}

let cached: Schema | null = null

export function loadSchema(root = process.cwd()): Schema {
  if (cached) return cached
  const schema: Schema = { tables: new Map(), openViews: new Set(), functions: new Set() }
  for (const file of sqlFiles(root)) parseSql(readFileSync(file, "utf8"), schema)
  cached = schema
  return schema
}

export function hasColumn(schema: Schema, table: string, column: string): boolean {
  const t = table.toLowerCase()
  if (schema.openViews.has(t)) return true
  return schema.tables.get(t)?.has(column.toLowerCase()) ?? false
}
