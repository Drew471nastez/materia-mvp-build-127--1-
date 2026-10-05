/**
 * An in-memory stand-in for the service role client, for the classroom,
 * events and video suites: enough of PostgREST for those modules to run
 * against real rows. select, eq, neq, in, is, gt, gte, lt, lte, contains
 * (jsonb), or (the filter strings those modules write), order, limit,
 * maybeSingle, single, insert, upsert (onConflict, ignoreDuplicates),
 * update, delete; rpc by name; storage with signed URLs, list and remove.
 * Every call is logged so a test can say what was read and written.
 */

type Row = Record<string, any>

export interface MemLog {
  table: string
  op: "select" | "insert" | "upsert" | "update" | "delete"
  filters: string[]
}

export interface MemOptions {
  /** Columns that are unique together, per table: an insert that repeats them fails with 23505. */
  unique?: Record<string, string[][]>
  /** Every query on these tables fails with this error (a table not there yet). */
  failWith?: Record<string, { code?: string; message: string }>
  rpc?: Record<string, (args: Record<string, any>, db: MemDb) => { data: any; error: any } | Promise<{ data: any; error: any }>>
}

export type MemDb = ReturnType<typeof memDb>

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

function unquote(v: string): string {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === "number" && typeof b === "number") return a - b
  const da = Date.parse(String(a))
  const dbb = Date.parse(String(b))
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(a)) && Number.isFinite(da) && Number.isFinite(dbb)) return da - dbb
  return String(a) < String(b) ? -1 : 1
}

/** A row contains a jsonb value (arrays: every wanted element matched by some element). */
function jsonContains(have: unknown, want: unknown): boolean {
  if (Array.isArray(want)) return Array.isArray(have) && want.every((w) => have.some((h) => jsonContains(h, w)))
  if (want && typeof want === "object") return !!have && typeof have === "object" && Object.entries(want).every(([k, v]) => jsonContains((have as Row)[k], v))
  return have === want
}

/** Splits "a,b(c,d),e" at the top level commas. */
function topSplit(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  let quoted = false
  for (const ch of s) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === "(") depth++
    if (!quoted && ch === ")") depth--
    if (!quoted && ch === "," && depth === 0) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  if (cur) out.push(cur)
  return out
}

/** One PostgREST logic term: "col.op.value", "and(...)", "or(...)". */
function term(t: string): (row: Row) => boolean {
  const m = /^(and|or)\((.*)\)$/.exec(t)
  if (m) {
    const parts = topSplit(m[2]).map(term)
    return m[1] === "and" ? (r) => parts.every((p) => p(r)) : (r) => parts.some((p) => p(r))
  }
  const first = t.indexOf(".")
  const second = t.indexOf(".", first + 1)
  const col = t.slice(0, first)
  const op = t.slice(first + 1, second)
  const val = unquote(t.slice(second + 1))
  return (r) => {
    const v = r[col]
    switch (op) {
      case "eq":
        return String(v) === val
      case "neq":
        return String(v) !== val
      case "gt":
        return v !== null && v !== undefined && compare(v, val) > 0
      case "gte":
        return v !== null && v !== undefined && compare(v, val) >= 0
      case "lt":
        return v !== null && v !== undefined && compare(v, val) < 0
      case "lte":
        return v !== null && v !== undefined && compare(v, val) <= 0
      case "is":
        return val === "null" ? v === null || v === undefined : String(v) === val
      default:
        throw new Error(`memDb: unknown op ${op}`)
    }
  }
}

export function memDb(tables: Record<string, Row[]>, options: MemOptions = {}) {
  const log: MemLog[] = []
  const files = new Map<string, Uint8Array>()
  let serial = 0
  const newId = () => `10000000-0000-4000-8000-${String(++serial).padStart(12, "0")}`

  function from(table: string) {
    const preds: ((r: Row) => boolean)[] = []
    const described: string[] = []
    let op: MemLog["op"] = "select"
    let payload: any = null
    let returning = false
    let single: "one" | "maybe" | null = null
    let limit: number | null = null
    let refusal: { code: string; message: string } | null = null
    let countHead = false
    let count = false
    const orders: [string, boolean][] = []
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {}

    const add = (desc: string, p: (r: Row) => boolean) => {
      described.push(desc)
      preds.push(p)
      return b
    }

    function run(): { data: any; error: any; count?: number | null } {
      if (refusal) return { data: null, error: refusal }
      log.push({ table, op, filters: described })
      const fail = options.failWith?.[table]
      if (fail) return { data: null, error: fail }
      const rows = (tables[table] ??= [])
      const matches = (r: Row) => preds.every((p) => p(r))
      if (op === "insert" || op === "upsert") {
        const list: Row[] = (Array.isArray(payload) ? payload : [payload]).map((r: Row) => ({ id: newId(), created_at: new Date().toISOString(), ...clone(r) }))
        const written: Row[] = []
        for (const r of list) {
          const keys = op === "upsert" && upsertOpts.onConflict ? [upsertOpts.onConflict.split(",").map((s) => s.trim())] : (options.unique?.[table] ?? [])
          const clash = keys.map((cols) => rows.find((x) => cols.every((c) => x[c] === r[c]))).find(Boolean)
          if (clash) {
            if (op === "upsert" && upsertOpts.ignoreDuplicates) continue
            if (op === "upsert") {
              Object.assign(clash, r)
              written.push(clash)
              continue
            }
            return { data: null, error: { code: "23505", message: `duplicate key on ${table}` } }
          }
          rows.push(r)
          written.push(r)
        }
        if (!returning) return { data: null, error: null }
        return { data: single ? (clone(written[0]) ?? null) : clone(written), error: null }
      }
      if (op === "update") {
        const hit = rows.filter(matches)
        for (const r of hit) Object.assign(r, clone(payload))
        if (!returning) return { data: null, error: null }
        return { data: single ? (clone(hit[0]) ?? null) : clone(hit), error: null }
      }
      if (op === "delete") {
        const gone = rows.filter(matches)
        tables[table] = rows.filter((r) => !matches(r))
        return { data: returning ? clone(gone) : null, error: null, count: gone.length }
      }
      let hit = rows.filter(matches)
      for (const [col, asc] of [...orders].reverse()) hit = [...hit].sort((a, c) => (asc ? 1 : -1) * compare(a[col], c[col]))
      const total = hit.length
      if (limit !== null) hit = hit.slice(0, limit)
      if (countHead) return { data: null, error: null, count: total }
      if (single === "maybe") {
        if (hit.length > 1) return { data: null, error: { code: "PGRST116", message: "more than one row" } }
        return { data: clone(hit[0]) ?? null, error: null }
      }
      if (single === "one") {
        if (hit.length !== 1) return { data: null, error: { code: "PGRST116", message: `${hit.length} rows` } }
        return { data: clone(hit[0]), error: null }
      }
      return { data: clone(hit), error: null, count: count ? total : null }
    }

    const b: any = {
      select(_cols?: string, o?: { count?: string; head?: boolean }) {
        if (op === "select") {
          count = !!o?.count
          countHead = !!o?.head
        } else returning = true
        return b
      },
      insert(p: any) {
        op = "insert"
        payload = p
        return b
      },
      upsert(p: any, o: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
        op = "upsert"
        payload = p
        upsertOpts = o
        return b
      },
      update(p: any) {
        op = "update"
        payload = p
        return b
      },
      delete() {
        op = "delete"
        return b
      },
      eq: (c: string, v: unknown) => add(`${c}=eq.${v}`, (r) => r[c] === v),
      neq: (c: string, v: unknown) => add(`${c}=neq.${v}`, (r) => r[c] !== v),
      in: (c: string, v: unknown[]) => add(`${c}=in.${v.length}`, (r) => v.includes(r[c])),
      is: (c: string, v: unknown) => add(`${c}=is.${v}`, (r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)),
      gt: (c: string, v: unknown) => add(`${c}=gt`, (r) => r[c] != null && compare(r[c], v) > 0),
      gte: (c: string, v: unknown) => add(`${c}=gte`, (r) => r[c] != null && compare(r[c], v) >= 0),
      lt: (c: string, v: unknown) => add(`${c}=lt`, (r) => r[c] != null && compare(r[c], v) < 0),
      lte: (c: string, v: unknown) => add(`${c}=lte`, (r) => r[c] != null && compare(r[c], v) <= 0),
      /*
        WHAT POSTGREST IS SENT, NOT WHAT WAS PASSED (round 13). supabase-js
        writes a string as it is, an array as a Postgres array literal
        "{a,b}" and an object as JSON. A jsonb column reads that text as
        JSON, so an array of objects ("{[object Object]}") is an error there,
        and here: the fake answers what production answers.
      */
      contains: (c: string, v: unknown) => {
        const wire = typeof v === "string" ? v : Array.isArray(v) ? `{${v.join(",")}}` : JSON.stringify(v)
        let want: unknown
        try {
          want = JSON.parse(wire)
        } catch {
          refusal = { code: "22P02", message: `invalid input syntax for type json: ${wire}` }
          return b
        }
        return add(`${c}=cs`, (r) => jsonContains(r[c], want))
      },
      or: (s: string) => {
        const t = term(`or(${s})`)
        return add(`or=${s}`, t)
      },
      order: (c: string, o?: { ascending?: boolean }) => (orders.push([c, o?.ascending !== false]), b),
      limit: (n: number) => ((limit = n), b),
      maybeSingle: () => ((single = "maybe"), b),
      single: () => ((single = "one"), b),
      then(resolve: (v: any) => unknown, reject?: (e: unknown) => unknown) {
        try {
          return Promise.resolve(run()).then(resolve, reject)
        } catch (e) {
          return reject ? Promise.resolve(reject(e)) : Promise.reject(e)
        }
      },
    }
    return b
  }

  const db = {
    from,
    tables,
    log,
    files,
    async rpc(name: string, args: Record<string, any>) {
      const fn = options.rpc?.[name]
      if (!fn) return { data: null, error: { code: "PGRST202", message: `no function ${name}` } }
      return fn(args, db as MemDb)
    },
    storage: {
      from(bucket: string) {
        return {
          async createSignedUploadUrl(path: string) {
            return { data: { signedUrl: `https://storage.test/upload/${bucket}/${path}?token=t`, token: "t", path }, error: null }
          },
          async createSignedUrl(path: string, seconds: number) {
            return { data: { signedUrl: `https://storage.test/sign/${bucket}/${path}?expires=${seconds}` }, error: null }
          },
          async list(folder: string, o: { search?: string } = {}) {
            const out = [...files.keys()]
              .filter((k) => k.startsWith(`${bucket}/${folder}/`) && (!o.search || k.endsWith(`/${o.search}`)))
              .map((k) => ({ name: k.split("/").pop(), metadata: { size: files.get(k)!.length } }))
            return { data: out, error: null }
          },
          async remove(paths: string[]) {
            for (const p of paths) files.delete(`${bucket}/${p}`)
            return { data: paths, error: null }
          },
          async download(path: string) {
            const f = files.get(`${bucket}/${path}`)
            return f ? { data: new Blob([f]), error: null } : { data: null, error: { message: "not found" } }
          },
        }
      },
    },
    /** Puts a file in fake storage, as an upload from the browser would. */
    put(bucket: string, path: string, bytes: Uint8Array) {
      files.set(`${bucket}/${path}`, bytes)
    },
  }
  return db
}

/** Makes fetch answer the fake storage's signed addresses with the stored bytes (a Range read of the head). */
export function serveStorage(db: MemDb): () => void {
  const before = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    const m = /^https:\/\/storage\.test\/sign\/([^/]+)\/(.+)\?/.exec(url)
    if (!m) return new Response("", { status: 404 })
    const f = db.files.get(`${m[1]}/${m[2]}`)
    return f ? new Response(f, { status: 206 }) : new Response("", { status: 404 })
  }) as typeof fetch
  return () => {
    globalThis.fetch = before
  }
}
