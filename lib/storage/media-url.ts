/**
 * ===========================================================================
 *  STORELIB'S OWN ADDRESS FOR EVERY PUBLIC FILE
 * ===========================================================================
 * A picture uploaded to Storelib used to be shown, saved and pasted as
 *
 *   https://<project>.supabase.co/storage/v1/object/public/store-builder-images/…
 *
 * which tells every visitor, every creator and every crawler which database
 * Storelib runs on and where its buckets are. Asked for plainly: "we should
 * never expose supabase urls, on the websites or in inputs".
 *
 * So a public file has Storelib's address instead:
 *
 *   https://storelib.com/media/store-builder-images/…
 *
 * next.config.mjs passes `/media/*` straight through to the storage bucket
 * (the same bytes, the same object), and proxy.ts lets `/media/` by on every
 * host, so the address works on storelib.com, a creator's subdomain and their
 * own domain alike.
 *
 * ABSOLUTE, on the main domain, because the same address is used where a
 * relative one would break: an email, a Stripe product picture, an Open
 * Graph card, the iOS app.
 *
 * WHERE IT IS APPLIED. On the way in (every upload hands back this address,
 * through getStorageImageUrl and `mediaUrl`) and on the way out (a website's
 * pages and theme settings are read through sanitize-sections.ts, which turns
 * an older stored address into this one, so a site saved before this shows
 * none either). A picker's link box never shows one of Storelib's own files
 * as an address at all (`isOwnMedia`).
 *
 * PURE and safe in the browser: it reads only the public env.
 */

const PUBLIC_PATH = "/storage/v1/object/public/"
export const MEDIA_PATH = "/media/"

const mainDomain = () => process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"

/** The storage host's public prefix: `https://<project>.supabase.co/storage/v1/object/public/`. */
function storagePrefixes(): string[] {
  const out: string[] = []
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  if (base) out.push(`${base}${PUBLIC_PATH}`)
  return out
}

/** Any Supabase project's public object address, for a value saved from another project or before the env was known. */
const ANY_SUPABASE_PUBLIC = /^https?:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\/storage\/v1\/object\/public\//i

/** The address Storelib shows for a public file: `https://storelib.com/media/<bucket>/<path>`. */
export function mediaUrl(url: string): string
export function mediaUrl(url: string | null | undefined): string | null | undefined
export function mediaUrl(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== "string") return url
  for (const prefix of storagePrefixes()) {
    if (url.startsWith(prefix)) return `https://${mainDomain()}${MEDIA_PATH}${url.slice(prefix.length)}`
  }
  const m = url.match(ANY_SUPABASE_PUBLIC)
  if (m) return `https://${mainDomain()}${MEDIA_PATH}${url.slice(m[0].length)}`
  return url
}

/** Every storage address inside a piece of text (a rich text body, a CSS value), turned into Storelib's. */
export function mediaUrlsIn(text: string): string {
  if (!text || !/supabase\.(?:co|in)\/storage\/v1\/object\/public\//i.test(text)) return text
  return text.replace(/https?:\/\/[a-z0-9-]+\.supabase\.(?:co|in)\/storage\/v1\/object\/public\/[^\s"'()<>]*/gi, (u) => mediaUrl(u))
}

/**
 * Every storage address in a value of any shape (settings, blocks, menus),
 * turned into Storelib's. The same value back when there was none, so a
 * caller can tell nothing changed by identity.
 */
export function withMediaUrls<T>(value: T): T {
  if (typeof value === "string") return mediaUrlsIn(value) as unknown as T
  if (Array.isArray(value)) {
    let changed = false
    const out = value.map((v) => {
      const next = withMediaUrls(v)
      if (next !== v) changed = true
      return next
    })
    return (changed ? out : value) as unknown as T
  }
  if (value && typeof value === "object") {
    let changed = false
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = withMediaUrls(v)
      if (next !== v) changed = true
      out[k] = next
    }
    return (changed ? out : value) as T
  }
  return value
}

/** A file Storelib holds (by either address): a picker shows its name, never its address. */
export function isOwnMedia(url: string | null | undefined): boolean {
  if (!url) return false
  if (ANY_SUPABASE_PUBLIC.test(url)) return true
  for (const prefix of storagePrefixes()) if (url.startsWith(prefix)) return true
  try {
    const u = new URL(url, `https://${mainDomain()}`)
    return u.pathname.startsWith(MEDIA_PATH) && (u.host === mainDomain() || u.host === `www.${mainDomain()}`)
  } catch {
    return false
  }
}

/**
 * The storage address behind one of Storelib's media addresses, for the
 * server checks that ask "is this a file in our bucket, in this person's
 * folder?" (an avatar, a cover, a membership picture). They were written
 * against the storage address, and the database keeps that form; an upload
 * now hands the browser the media address, so a check reads it back first.
 * Anything else comes back as it was.
 */
export function toStorageUrl(url: string): string
export function toStorageUrl(url: string | null | undefined): string | null | undefined
export function toStorageUrl(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== "string") return url
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  if (!base) return url
  try {
    const u = new URL(url)
    if ((u.host === mainDomain() || u.host === `www.${mainDomain()}`) && u.pathname.startsWith(MEDIA_PATH)) {
      return `${base}${PUBLIC_PATH}${u.pathname.slice(MEDIA_PATH.length)}${u.search}${u.hash}`
    }
  } catch {
    /* not an address: as it was */
  }
  return url
}

type StorageFileApiLike = { getPublicUrl: (path: string, options?: unknown) => { data: { publicUrl: string } } }

/**
 * Every `storage.from(bucket).getPublicUrl(path)` in the app hands back the
 * media address. Patched once on the storage file API the client shares, so
 * the fifty places that upload a picture all answer the same way without each
 * having to remember to. Idempotent; a client without storage is left alone.
 */
export function withMediaAddresses<T>(client: T): T {
  try {
    const storage = (client as unknown as { storage?: { from: (bucket: string) => StorageFileApiLike } }).storage
    if (!storage?.from) return client
    const proto = Object.getPrototypeOf(storage.from("media-address-probe")) as StorageFileApiLike & { __storelibMedia?: boolean }
    if (!proto || proto.__storelibMedia || typeof proto.getPublicUrl !== "function") return client
    const original = proto.getPublicUrl
    proto.getPublicUrl = function (this: unknown, path: string, options?: unknown) {
      const out = original.call(this, path, options)
      return { ...out, data: { ...out.data, publicUrl: mediaUrl(out.data.publicUrl) } }
    }
    proto.__storelibMedia = true
  } catch {
    /* the address stays the storage one; nothing breaks */
  }
  return client
}

/**
 * EVERY ROW READ, ON THE WAY IN. A `fetch` for the Supabase clients: a
 * database read (PostgREST, `/rest/v1/`) that carries a storage address
 * comes back with Storelib's instead, so whatever a page, the dashboard, an
 * email or the app draws from the database never shows the storage host,
 * including pictures saved long before this. Only JSON from the database is
 * read; auth, storage and everything else pass through untouched, and a
 * response without a storage address is handed back as it came.
 *
 * What is stored is not changed: a row keeps the address it was saved with,
 * and the server checks read either form (`toStorageUrl`).
 */
export function mediaFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.includes("/rest/v1/")) return globalThis.fetch(input, init)
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  const run = method === "GET" || method === "HEAD" ? readWithSchemaRetry(input, init) : globalThis.fetch(input, init)
  return run.then(async (res) => {
    if (res.status === 204 || res.status === 304 || (init?.method ?? "GET").toUpperCase() === "HEAD") return res
    if (!(res.headers.get("content-type") || "").includes("json")) return res
    const text = await res.text()
    const headers = new Headers(res.headers)
    headers.delete("content-length")
    headers.delete("content-encoding")
    const body = text.includes("/storage/v1/object/public/") ? mediaUrlsIn(text) : text
    return new Response(body, { status: res.status, statusText: res.statusText, headers })
  })
}

/**
 * PostgREST's "Could not query the database for the schema cache. Retrying."
 * (PGRST002, HTTP 503): it is reloading its schema cache, usually for a second
 * or two after a migration or a database restart, and answers every request
 * with this until it is done. A READ (GET or HEAD, which change nothing) is
 * asked again after a short wait, at most SCHEMA_RETRY_WAITS.length more
 * times (about two seconds in all), so a cart, a website or a cron does not
 * fail on a blip. Writes are never repeated here.
 */
export const SCHEMA_RETRY_WAITS = [150, 450, 1200]

async function isSchemaCacheReload(res: Response, method: string): Promise<boolean> {
  if (res.status !== 503) return false
  /* A HEAD (a count) has no body to read: PostgREST's 503 on a read is this. */
  if (method === "HEAD") return true
  try {
    return /PGRST002|schema cache/i.test(await res.clone().text())
  } catch {
    return false
  }
}

async function readWithSchemaRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  let res = await globalThis.fetch(input, init)
  for (const wait of SCHEMA_RETRY_WAITS) {
    if (!(await isSchemaCacheReload(res, method))) return res
    if (signal?.aborted) return res
    await res.body?.cancel().catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, wait))
    if (signal?.aborted) return res
    res = await globalThis.fetch(input instanceof Request ? input.clone() : input, init)
  }
  return res
}
