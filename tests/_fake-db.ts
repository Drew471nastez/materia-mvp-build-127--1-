/**
 * An in-memory stand-in for the Supabase admin client, enough of PostgREST's
 * query builder for a route handler to run against: select (with a count,
 * and one level of embedded rows such as `product:products(title)`), eq,
 * neq, in, is, gte, lte, order, limit, range, maybeSingle, single, insert,
 * update, delete. Every call is written to `log`, so a suite can say what a
 * route read and wrote, not only what it answered.
 *
 * `unique` makes an insert fail with 23505 the way a unique index would, and
 * `failWith` makes every read of a table fail, for the "database is not there
 * yet" paths.
 */

type Row = Record<string, any>

export interface FakeDbOptions {
  unique?: Record<string, string[][]>
  failWith?: Record<string, { code?: string; message: string }>
  /** Only inserts into these tables fail, with this error. */
  failInsert?: Record<string, { code?: string; message: string }>
}

export interface LogEntry {
  table: string
  op: "select" | "insert" | "update" | "delete"
  filters: Array<[string, string, unknown]>
  payload?: unknown
}

/* One `col.op.value` of a PostgREST filter expression, against a row. */
function leafMatches(row: Row, leaf: string): boolean {
  const m = /^([A-Za-z0-9_]+)\.([a-z]+)\.(.*)$/.exec(leaf.trim())
  if (!m) return false
  const [, col, op, rawValue] = m
  const value = rawValue.replace(/^"|"$/g, "")
  const v = row[col]
  switch (op) {
    case "eq":
      return String(v ?? "") === value
    case "neq":
      return String(v ?? "") !== value
    case "gt":
      return v !== null && v !== undefined && String(v) > value
    case "gte":
      return String(v ?? "") >= value
    case "lt":
      return v !== null && v !== undefined && String(v) < value
    case "lte":
      return String(v ?? "") <= value
    case "is":
      return value === "null" ? v === null || v === undefined : String(v ?? "") === value
    case "in":
      return value.replace(/^\(|\)$/g, "").split(",").map((x) => x.replace(/^"|"$/g, "")).includes(String(v ?? ""))
    default:
      return false
  }
}

/** The commas of a filter expression that are not inside brackets. */
function topLevelParts(expr: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === "(") depth++
    else if (ch === ")") depth--
    else if (ch === "," && depth === 0) {
      parts.push(expr.slice(start, i))
      start = i + 1
    }
  }
  parts.push(expr.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** PostgREST's `or=(a.eq.1,and(b.eq.2,c.lt.3))`: any branch, each `and(...)` all of its own. */
export function orMatches(row: Row, expr: string): boolean {
  return topLevelParts(expr).some((branch) => {
    if (branch.startsWith("and(")) return topLevelParts(branch.slice(4, branch.lastIndexOf(")"))).every((leaf) => (leaf.startsWith("or(") ? orMatches(row, leaf.slice(3, leaf.lastIndexOf(")"))) : leafMatches(row, leaf)))
    if (branch.startsWith("or(")) return orMatches(row, branch.slice(3, branch.lastIndexOf(")")))
    return leafMatches(row, branch)
  })
}

let serial = 0
const newId = () => {
  serial++
  return `00000000-0000-4000-8000-${String(serial).padStart(12, "0")}`
}

export function fakeDb(tables: Record<string, Row[]>, options: FakeDbOptions = {}) {
  const log: LogEntry[] = []

  function embed(row: Row, select: string): Row {
    const out = { ...row }
    const re = /(\w+):(\w+)(?:!(\w+))?\(([^)]*)\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(select))) {
      const [, alias, table, hint] = m
      const fk = hint && hint !== "inner" ? hint : `${alias}_id`
      const found = (tables[table] ?? []).find((r) => r.id === row[fk]) ?? null
      out[alias] = found ? { ...found } : null
    }
    return out
  }

  function from(table: string) {
    const state: {
      op: LogEntry["op"]
      filters: Array<[string, string, unknown]>
      select: string | null
      count: boolean
      head: boolean
      limit: number | null
      single: "one" | "maybe" | null
      payload: any
      returning: boolean
      conflict: string[] | null
      ignoreDuplicates: boolean
    } = { op: "select", filters: [], select: null, count: false, head: false, limit: null, single: null, payload: null, returning: false, conflict: null, ignoreDuplicates: true }

    const matches = (row: Row) =>
      state.filters.every(([kind, col, val]) => {
        const v = row[col]
        switch (kind) {
          case "eq":
            return v === val
          case "neq":
            return v !== val
          case "in":
            return (val as unknown[]).includes(v)
          case "is":
            return val === null ? v === null || v === undefined : v === val
          case "gte":
            return String(v ?? "") >= String(val)
          case "lte":
            return String(v ?? "") <= String(val)
          case "gt":
            return v !== null && v !== undefined && String(v) > String(val)
          case "lt":
            return v !== null && v !== undefined && String(v) < String(val)
          case "notIsNull":
            return v !== null && v !== undefined
          case "or":
            return orMatches(row, String(val))
          case "ilike": {
            /* PostgREST's ilike: case insensitive, % for any run of characters, _ for one, and a backslash makes the next one literal, as in Postgres. */
            let pattern = ""
            const raw = String(val)
            for (let i = 0; i < raw.length; i++) {
              const c = raw[i]
              if (c === "\\" && i + 1 < raw.length) pattern += raw[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
              else if (c === "%") pattern += ".*"
              else if (c === "_") pattern += "."
              else pattern += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
            }
            return typeof v === "string" && new RegExp(`^${pattern}$`, "i").test(v)
          }
          default:
            return true
        }
      })

    function run(): { data: any; error: any; count?: number | null } {
      log.push({ table, op: state.op, filters: [...state.filters], payload: state.payload ?? undefined })
      const failure = options.failWith?.[table]
      if (failure) return { data: null, error: failure, count: null }
      const rows = (tables[table] ??= [])

      if (state.op === "insert") {
        const insertFailure = options.failInsert?.[table]
        if (insertFailure) return { data: null, error: insertFailure }
        const list: Row[] = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((r: Row): Row => ({
          id: r.id ?? newId(),
          created_at: r.created_at ?? new Date().toISOString(),
          ...r,
        }))
        const written: Row[] = []
        for (const r of list) {
          /* An upsert meets the row that is there: kept as it is, or merged, and never a second row. */
          const clash = state.conflict ? rows.find((x) => state.conflict!.every((c) => x[c] === r[c])) : undefined
          if (clash) {
            if (!state.ignoreDuplicates) {
              Object.assign(clash, r)
              written.push(clash)
            }
            continue
          }
          let duplicate = false
          for (const cols of options.unique?.[table] ?? []) {
            if (rows.some((x) => cols.every((c) => x[c] === r[c]))) duplicate = true
          }
          if (duplicate) {
            if (state.conflict) continue
            return { data: null, error: { code: "23505", message: `duplicate key value violates unique constraint on ${table}` } }
          }
          rows.push(r)
          written.push(r)
        }
        const out = written.map((r: Row) => (state.select ? embed(r, state.select) : r))
        if (!state.returning) return { data: null, error: null }
        return { data: state.single ? out[0] ?? null : out, error: null }
      }
      if (state.op === "update") {
        const hit = rows.filter(matches)
        for (const r of hit) Object.assign(r, state.payload)
        if (!state.returning) return { data: null, error: null }
        /* `.select().single()` after an update answers the one row, as PostgREST does. */
        return { data: state.single ? hit.map((r) => ({ ...r }))[0] ?? null : hit, error: null }
      }
      if (state.op === "delete") {
        const keep = rows.filter((r) => !matches(r))
        const removed = rows.length - keep.length
        rows.splice(0, rows.length, ...keep)
        return { data: null, error: null, count: removed }
      }

      let hit = rows.filter(matches)
      if (state.limit !== null) hit = hit.slice(0, state.limit)
      if (state.count && state.head) return { data: null, error: null, count: rows.filter(matches).length }
      const data = hit.map((r) => (state.select ? embed(r, state.select) : { ...r }))
      if (state.single === "maybe") {
        if (data.length > 1) return { data: null, error: { code: "PGRST116", message: "more than one row" } }
        return { data: data[0] ?? null, error: null }
      }
      if (state.single === "one") {
        if (data.length !== 1) return { data: null, error: { code: "PGRST116", message: `${data.length} rows` } }
        return { data: data[0], error: null }
      }
      return { data, error: null, count: state.count ? rows.filter(matches).length : null }
    }

    const builder: any = {
      select(cols?: string, opts?: { count?: string; head?: boolean }) {
        if (state.op === "select") {
          state.select = cols ?? "*"
          state.count = !!opts?.count
          state.head = !!opts?.head
        } else {
          state.returning = true
          state.select = cols ?? "*"
        }
        return builder
      },
      insert(payload: any) {
        state.op = "insert"
        state.payload = payload
        return builder
      },
      /* PostgREST's upsert: `onConflict` names the columns, `ignoreDuplicates` keeps the row that is there. */
      upsert(payload: any, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
        state.op = "insert"
        state.payload = payload
        state.conflict = (opts?.onConflict ?? "id").split(",").map((c) => c.trim()).filter(Boolean)
        state.ignoreDuplicates = opts?.ignoreDuplicates !== false
        return builder
      },
      update(payload: any) {
        state.op = "update"
        state.payload = payload
        return builder
      },
      delete() {
        state.op = "delete"
        return builder
      },
      eq: (c: string, v: unknown) => (state.filters.push(["eq", c, v]), builder),
      neq: (c: string, v: unknown) => (state.filters.push(["neq", c, v]), builder),
      in: (c: string, v: unknown[]) => (state.filters.push(["in", c, v]), builder),
      is: (c: string, v: unknown) => (state.filters.push(["is", c, v]), builder),
      gte: (c: string, v: unknown) => (state.filters.push(["gte", c, v]), builder),
      lte: (c: string, v: unknown) => (state.filters.push(["lte", c, v]), builder),
      ilike: (c: string, v: unknown) => (state.filters.push(["ilike", c, v]), builder),
      gt: (c: string, v: unknown) => (state.filters.push(["gt", c, v]), builder),
      lt: (c: string, v: unknown) => (state.filters.push(["lt", c, v]), builder),
      /* Only the one shape this codebase uses: .not(column, "is", null). */
      not: (c: string, op: string, v: unknown) => (state.filters.push([op === "is" && v === null ? "notIsNull" : "neq", c, v]), builder),
      /* PostgREST's or=(...): comma separated branches, each `col.op.value` or `and(col.op.value,col.op.value)`. */
      or: (expr: string) => (state.filters.push(["or", "*", expr]), builder),
      order: () => builder,
      range: (a: number, b: number) => ((state.limit = b - a + 1), builder),
      limit: (n: number) => ((state.limit = n), builder),
      maybeSingle: () => ((state.single = "maybe"), builder),
      single: () => ((state.single = "one"), builder),
      then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(run()).then(resolve, reject)
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e)
        }
      },
    }
    return builder
  }

  return { from, tables, log, rpc: async () => ({ data: null, error: null }) }
}
