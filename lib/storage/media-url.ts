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

import { backoffMs, deadlineFetch, deadlineFor, READ_RETRIES, REST_RETRY_STATUSES } from "@/lib/net/deadline"
import { supabaseRetryBudget } from "@/lib/net/retry-budget"

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
/*
  EVERY REQUEST ENDS (lib/net/deadline.ts). Each one through here, auth,
  database, storage, from the server and the browser alike, has a deadline by
  what it is, and a read that hit a network error, a 502, a 504 or a 429 is
  asked again at most twice with backoff. Before, none had a deadline, and a
  request that was accepted and never answered held its function until
  Vercel's 300 second ceiling (the HeadersTimeoutError of Oct 28).
*/
export function mediaFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  if (!url.includes("/rest/v1/")) return deadlineFetch(input, init)
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
  if (method === "GET") return wholeRead(input, init, url)
  const run = method === "HEAD" ? readWithSchemaRetry(input, init) : deadlineFetch(input, init)
  return run.then(async (res) => {
    if (res.status === 204 || res.status === 304 || (init?.method ?? "GET").toUpperCase() === "HEAD") return res
    if (!(res.headers.get("content-type") || "").includes("json")) return res
    return withBody(res, await res.text())
  })
}

/** The answer again with its body read, Storelib's own file addresses in it. */
function withBody(res: Response, text: string): Response {
  const headers = new Headers(res.headers)
  headers.delete("content-length")
  headers.delete("content-encoding")
  const json = (res.headers.get("content-type") || "").includes("json")
  const body = json && text.includes("/storage/v1/object/public/") ? mediaUrlsIn(text) : text
  return new Response(body, { status: res.status, statusText: res.statusText, headers })
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   AN ANSWER THAT IS NOT THE DATABASE'S IS NOT DATA (EVD-2)
  ═══════════════════════════════════════════════════════════════════════════
  Production logged "theme files: <!DOCTYPE html>…" about 200 times in a week
  and "Unterminated string in JSON at position 355193" 7 times. Two answers
  that never came from PostgREST:

    A GATEWAY'S ERROR PAGE. Supabase's edge (Cloudflare) answers a 5xx of its
    own (520, 522, 524, a 500 or 503 page) in HTML. supabase-js takes the
    whole page as the error's message. Only 429, 502 and 504 were asked
    again; the rest went straight to the caller, page and all.

    A BODY CUT SHORT. A 200 whose JSON stops part way (a connection dropped
    mid-answer). supabase-js's JSON.parse throws and it comes back as an
    error with status 0, never asked again.

  Both are the database being unreachable for a moment, so a READ (GET,
  which changes nothing) is asked again, like a 502, within the read's own
  deadline. Still wrong after that, the caller gets a plain 503 with a short
  message and a code of its own (SLGW1 an error page, SLGW2 cut short): an
  error, never rows. The callers that a live site stands on throw
  SiteReadError for any error (lib/website-builder/site-read.ts,
  compat-site installFiles), which is "serve the last good copy, else One
  moment", never "no such site". A write is never repeated here.
*/
export const GATEWAY_PAGE_CODE = "SLGW1"
export const CUT_SHORT_CODE = "SLGW2"

/** A server error (5xx, or 429) whose body is an HTML page, not PostgREST's JSON. A 4xx page (a block, a wrong address) is handed back as it came. */
export function isGatewayPage(status: number, contentType: string, text: string): boolean {
  if (status < 500 && status !== 429) return false
  if (contentType.includes("json")) return false
  return contentType.includes("html") || /^\s*</.test(text)
}

/** A JSON body that stops part way: an array or object without its close. Cheap: the ends, not a parse. */
export function isCutShort(text: string): boolean {
  let start = 0
  let end = text.length - 1
  while (start <= end && /\s/.test(text[start])) start++
  while (end >= start && /\s/.test(text[end])) end--
  if (start > end) return false
  if (text[start] === "[") return text[end] !== "]"
  if (text[start] === "{") return text[end] !== "}"
  return false
}

function unreadable(code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message, details: null, hint: null }), { status: 503, headers: { "content-type": "application/json" } })
}

async function wholeRead(input: RequestInfo | URL, init: RequestInit | undefined, url: string): Promise<Response> {
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  const started = Date.now()
  const budget = deadlineFor(url, "GET")
  for (let attempt = 0; ; attempt++) {
    const res = await readWithSchemaRetry(attempt > 0 && input instanceof Request ? input.clone() : input, init)
    if (res.status === 204 || res.status === 304) return res
    const type = res.headers.get("content-type") || ""
    const json = type.includes("json")
    /* An answer that is neither JSON nor an error (a CSV, a plan) is handed back as it came. */
    if (res.ok && !json) return res
    let text: string | null
    try {
      text = await res.text()
    } catch (e) {
      if (signal?.aborted) throw e
      text = null
    }
    let bad: Response | null = null
    if (text === null || (res.ok && json && isCutShort(text))) bad = unreadable(CUT_SHORT_CODE, `the database answer was cut short (HTTP ${res.status})`)
    else if (isGatewayPage(res.status, type, text)) bad = unreadable(GATEWAY_PAGE_CODE, `the database gateway answered with an error page (HTTP ${res.status})`)
    if (!bad) return withBody(res, text as string)
    const wait = backoffMs(attempt)
    if (attempt >= READ_RETRIES || signal?.aborted || (budget !== null && Date.now() - started + wait >= budget)) return bad
    /* Round 50: paid from the instance's retry budget (lib/net/retry-budget.ts), so an outage is not asked three times over. */
    if (!supabaseRetryBudget.spend()) return bad
    await new Promise((resolve) => setTimeout(resolve, wait))
    if (signal?.aborted) return bad
  }
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
  const once = (i: RequestInfo | URL) => deadlineFetch(i, init, { retryStatuses: REST_RETRY_STATUSES })
  let res = await once(input)
  for (const wait of SCHEMA_RETRY_WAITS) {
    if (!(await isSchemaCacheReload(res, method))) return res
    if (signal?.aborted) return res
    if (!supabaseRetryBudget.spend()) return res
    await res.body?.cancel().catch(() => {})
    await new Promise((resolve) => setTimeout(resolve, wait))
    if (signal?.aborted) return res
    res = await once(input instanceof Request ? input.clone() : input)
  }
  return res
}
