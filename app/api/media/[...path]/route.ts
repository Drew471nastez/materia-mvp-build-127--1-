/*
  A PUBLIC PICTURE AT STORELIB'S ADDRESS, KEPT BY THE CDN (round 54, Vercel cost).

  /media/<bucket>/<path> is a public storage object at Storelib's own address
  (lib/storage/media-url.ts). It was an external rewrite straight to Supabase,
  and Vercel never kept it: Supabase's Cloudflare sets a __cf_bm cookie on
  every answer, and Vercel's CDN does not hold an answer that sets a cookie.
  So every picture on every page was fetched from Supabase through Vercel each
  time (x-vercel-cache: MISS, measured live after rewrite caching was turned
  on), the likely bulk of the 131 GB of Fast Origin Transfer.

  Pictures (next.config.mjs sends only these file types here) now come through
  this route: the same bytes and the same type, without the storage host's
  cookie, held by the CDN for up to a day (less if the file says less) and
  served stale for a week while it is fetched again. A picture removed from
  storage is gone from the CDN within a day; a missing one is never held.
  The browser keeps the file's own Cache-Control, as before.

  Anything else (a video, a PDF, a download) keeps the plain rewrite, with
  range requests as before. A picture larger than LARGE_BYTES is sent back to
  the same address with ?direct=1, which next.config rewrites straight to
  storage as before, so no answer here can outgrow a function's limits.
  No session or cookie is read; the storage host never appears.
*/
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/** Pictures above this go the old way (?direct=1), well under a function's response limit. */
export const LARGE_BYTES = 4 * 1024 * 1024
/** The longest the CDN keeps a picture before asking storage again. */
export const CDN_MAX_S = 86_400

/*
  NEVER A PAGE ON STORELIB.COM (round AW). /media/ is Storelib's own origin,
  where the session cookie lives and JavaScript can read it (lib/supabase/
  server.ts), and whatever type storage holds a file under is the type it is
  served as. A picture bucket that takes only pictures keeps that safe; one
  whose type list was never set (supabase/sql/run-now/16_storage_buckets.sql
  says when the SQL editor cannot set it, and part 282 leaves a missing list
  missing) would hand back an SVG or an XML file as a document, and a script
  in it would run as storelib.com: every signed in visitor's session.

  `sandbox` makes any such answer inert as a page: no script, no form, an
  origin of its own. A picture, a video or a font drawn by a page is not
  touched (a response's own policy only governs it as a page). vercel.json
  sends the same for every /media/ address but a PDF's, which Chrome and
  Safari will not show inside a sandbox; here the route serves pictures only.
*/
export const MEDIA_DOCUMENT_POLICY = "sandbox"

/* Not content-length: fetch hands the body back decoded, so the stored length could be the compressed one. */
const KEEP = ["content-type", "cache-control", "etag", "last-modified", "content-disposition"]
const SEGMENT = /^[^/\\]+$/

/** The CDN's rule for a picture storage answered with `cacheControl`: at most a day, never longer than the file says. Pure. */
export function cdnRuleFor(cacheControl: string | null): string {
  const m = /max-age=(\d+)/i.exec(cacheControl ?? "")
  const said = m ? Number(m[1]) : CDN_MAX_S
  const keep = Math.max(60, Math.min(CDN_MAX_S, Number.isFinite(said) ? said : CDN_MAX_S))
  return `max-age=${keep}, stale-while-revalidate=604800`
}

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  if (!base || !Array.isArray(path) || path.length < 2 || !path.every((p) => SEGMENT.test(p) && p !== "." && p !== "..")) {
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store" } })
  }
  const object = path.map(encodeURIComponent).join("/")
  const forward = new Headers()
  for (const h of ["if-none-match", "if-modified-since", "accept"]) {
    const v = req.headers.get(h)
    if (v) forward.set(h, v)
  }
  let upstream: Response
  try {
    upstream = await fetch(`${base}/storage/v1/object/public/${object}`, { method: req.method === "HEAD" ? "HEAD" : "GET", headers: forward, cache: "no-store", signal: AbortSignal.timeout(20_000) })
  } catch {
    return new NextResponse("Unavailable", { status: 502, headers: { "Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", "Retry-After": "5" } })
  }
  const length = Number(upstream.headers.get("content-length") ?? "0")
  if (upstream.status === 200 && length > LARGE_BYTES) {
    await upstream.body?.cancel().catch(() => undefined)
    const to = new URL(req.url)
    to.searchParams.set("direct", "1")
    return new NextResponse(null, { status: 307, headers: { Location: `${to.pathname}${to.search}`, "Cache-Control": "public, max-age=3600", "Vercel-CDN-Cache-Control": "max-age=3600" } })
  }
  const headers = new Headers()
  for (const h of KEEP) {
    const v = upstream.headers.get(h)
    if (v) headers.set(h, v)
  }
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("Content-Security-Policy", MEDIA_DOCUMENT_POLICY)
  if (upstream.status === 200) headers.set("Vercel-CDN-Cache-Control", cdnRuleFor(upstream.headers.get("cache-control")))
  else if (upstream.status !== 304) {
    /* A missing or failing file is never held: an upload right after must show. */
    headers.set("Cache-Control", "no-store")
    headers.set("Vercel-CDN-Cache-Control", "no-store")
  }
  return new NextResponse(req.method === "HEAD" || upstream.status === 304 ? null : upstream.body, { status: upstream.status, headers })
}

export const GET = handle
export const HEAD = handle
