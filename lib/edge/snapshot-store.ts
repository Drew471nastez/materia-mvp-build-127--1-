/**
 * ===========================================================================
 *  WHERE PUBLISHED PAGES ARE KEPT OUTSIDE THE DATABASE (round 49, edge)
 * ===========================================================================
 * A small object store for the stored copies of public pages
 * (./public-snapshot.ts): put, get, delete, by key, as JSON. It is
 * Supabase Storage's REST API, bucket `public-snapshots` (private, made by
 * SQL part 356), called with plain fetch so the proxy can use it too.
 *
 * WHY STORAGE AND NOT A TABLE. A copy has to be readable when Postgres is
 * not. Storage keeps the objects in S3; it does read its own object rows
 * from the same Postgres, so it is not fully independent of it (see
 * docs/reliability/EDGE_FAILOVER.md, "What Storage does and does not
 * survive"). Each server keeps what it has read in memory, which is what
 * actually answers during an outage longer than a blink.
 *
 * SNAPSHOT_STORAGE_URL points it somewhere else that speaks the same API
 * (a local stub in scripts/serve-edge-stub-r49.mjs, or a second project).
 * Unset, it is the project's own `/storage/v1`.
 *
 * Every call has a deadline and never throws: a copy that cannot be kept or
 * read is a page answered as it was before, never a page that fails.
 */

export const SNAPSHOT_BUCKET = "public-snapshots"
/** A read or write's own limit. A read is on a visitor's path (only when the database is away); a write never is. */
export const STORE_READ_MS = 1_500
export const STORE_WRITE_MS = 8_000

type Env = Record<string, string | undefined>

export interface SnapshotStore {
  get<T>(key: string): Promise<T | null | "failed">
  put(key: string, value: unknown): Promise<boolean>
  remove(keys: string[]): Promise<boolean>
  /** The keys under a folder (one level), or "failed". */
  list(folder: string): Promise<string[] | "failed">
}

/** The store's base address and key, or null when this deployment has neither. */
export function storeConfig(env: Env = process.env): { base: string; key: string } | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const own = env.SNAPSHOT_STORAGE_URL?.replace(/\/+$/, "")
  const supabase = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "")
  const base = own || (supabase ? `${supabase}/storage/v1` : "")
  if (!base || !key || /placeholder\.supabase\.co/.test(base)) return null
  return { base, key }
}

/** A key as a path in the bucket: letters, digits and a few marks only, so nothing a host or path holds can climb out. */
export function safeKey(key: string): string | null {
  return /^[a-z0-9][a-z0-9._/-]{0,400}$/.test(key) && !key.includes("..") && !key.includes("//") ? key : null
}

export function supabaseSnapshotStore(env: Env = process.env, fetcher: typeof fetch = fetch): SnapshotStore {
  const auth = () => {
    const c = storeConfig(env)
    return c ? { c, headers: { Authorization: `Bearer ${c.key}`, apikey: c.key } } : null
  }
  return {
    async get<T>(key: string): Promise<T | null | "failed"> {
      const a = auth()
      const k = safeKey(key)
      if (!a || !k) return null
      try {
        const r = await fetcher(`${a.c.base}/object/authenticated/${SNAPSHOT_BUCKET}/${k}`, { headers: a.headers, signal: AbortSignal.timeout(STORE_READ_MS), cache: "no-store" })
        /* Storage answers a missing object 400 or 404 ("Object not found"): nothing kept. */
        if (r.status === 404 || r.status === 400) {
          await r.arrayBuffer().catch(() => undefined)
          return null
        }
        if (!r.ok) {
          await r.arrayBuffer().catch(() => undefined)
          return "failed"
        }
        return (await r.json()) as T
      } catch {
        return "failed"
      }
    },
    async put(key: string, value: unknown): Promise<boolean> {
      const a = auth()
      const k = safeKey(key)
      if (!a || !k) return false
      try {
        const r = await fetcher(`${a.c.base}/object/${SNAPSHOT_BUCKET}/${k}`, {
          method: "POST",
          headers: { ...a.headers, "Content-Type": "application/json", "x-upsert": "true", "cache-control": "no-cache" },
          body: JSON.stringify(value),
          signal: AbortSignal.timeout(STORE_WRITE_MS),
          cache: "no-store",
        })
        await r.arrayBuffer().catch(() => undefined)
        return r.ok
      } catch {
        return false
      }
    },
    async remove(keys: string[]): Promise<boolean> {
      const a = auth()
      const prefixes = keys.map(safeKey).filter((k): k is string => !!k)
      if (!a || prefixes.length === 0) return false
      try {
        const r = await fetcher(`${a.c.base}/object/${SNAPSHOT_BUCKET}`, {
          method: "DELETE",
          headers: { ...a.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes }),
          signal: AbortSignal.timeout(STORE_WRITE_MS),
          cache: "no-store",
        })
        await r.arrayBuffer().catch(() => undefined)
        return r.ok
      } catch {
        return false
      }
    },
    async list(folder: string): Promise<string[] | "failed"> {
      const a = auth()
      const k = safeKey(folder)
      if (!a || !k) return "failed"
      try {
        const r = await fetcher(`${a.c.base}/object/list/${SNAPSHOT_BUCKET}`, {
          method: "POST",
          headers: { ...a.headers, "Content-Type": "application/json" },
          body: JSON.stringify({ prefix: k, limit: 1000, offset: 0 }),
          signal: AbortSignal.timeout(STORE_WRITE_MS),
          cache: "no-store",
        })
        if (!r.ok) {
          await r.arrayBuffer().catch(() => undefined)
          return "failed"
        }
        const rows = (await r.json()) as { name?: unknown }[]
        return Array.isArray(rows) ? rows.map((x) => (typeof x?.name === "string" ? `${k}/${x.name}` : "")).filter(Boolean) : "failed"
      } catch {
        return "failed"
      }
    },
  }
}

/** A store in memory, for the tests. */
export function memorySnapshotStore(): SnapshotStore & { objects: Map<string, string>; down: boolean } {
  const objects = new Map<string, string>()
  const s = {
    objects,
    down: false,
    async get<T>(key: string): Promise<T | null | "failed"> {
      if (s.down) return "failed"
      const v = objects.get(key)
      return v === undefined ? null : (JSON.parse(v) as T)
    },
    async put(key: string, value: unknown): Promise<boolean> {
      if (s.down || !safeKey(key)) return false
      objects.set(key, JSON.stringify(value))
      return true
    },
    async remove(keys: string[]): Promise<boolean> {
      if (s.down) return false
      for (const k of keys) objects.delete(k)
      return true
    },
    async list(folder: string): Promise<string[] | "failed"> {
      if (s.down) return "failed"
      return [...objects.keys()].filter((k) => k.startsWith(`${folder}/`) && !k.slice(folder.length + 1).includes("/"))
    },
  }
  return s
}
