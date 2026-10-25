/**
 * ===========================================================================
 *  THE TWO REQUESTS: A PICTURE SENT, A PICTURE OPENED
 * ===========================================================================
 * Shared by every way in, so each makes exactly the same checks:
 *
 *   POST /api/cart/uploads          a Storelib theme's Personalization block,
 *                                   or any theme's script, on the store's host
 *   POST /cart/upload               the same, at a theme's own address on an
 *                                   imported theme's site
 *   POST /cart/add (multipart)      an imported theme's product form with
 *                                   `<input type="file" name="properties[..]">`
 *                                   (keepFormFiles turns each file into its value
 *                                   before the cart reads the form)
 *   GET  /api/cart/uploads/<ref>/<name>
 *                                   the picture, for the browser that sent it
 *
 * The store is always the host's (the caller decides it and passes it in),
 * never a field of the request. The browser is its `sl_cart_uid` cookie,
 * made on its first upload.
 */
import { NextResponse } from "next/server"

import type { IncomingFile, Reencode } from "./image"
import { fileOf } from "./image"
import { BUYER_LINK_SECONDS, CART_UPLOADS_PER_REQUEST, CART_UPLOADS_PER_STORE_HOUR, CART_UPLOADS_PER_VISITOR_HOUR, UPLOAD_ERRORS, readRef } from "./rules"
import { cartVisitorCookie, cartVisitorOf, newCartVisitor, visitorHash } from "./sign"
import { keepCartUpload, signedLink, uploadForVisitor, type KeptUpload } from "./store"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any; storage: { from: (bucket: string) => any } }

/** Counts a request against the browser's and the store's hourly limits: null within them, else a refusal. Tests pass their own. */
export type UploadLimiter = (request: Request, input: { creatorId: string; visitorHash: string }) => Promise<boolean>

export const rateLimitUploads: UploadLimiter = async (request, input) => {
  const { addressSubject, rateLimit } = await import("@/lib/api/rate-limit")
  const mine = await rateLimit({ bucket: "cart_upload", subjects: [addressSubject(request), `cart:${input.visitorHash}`], windows: [{ limit: 12, seconds: 60 }, { limit: CART_UPLOADS_PER_VISITOR_HOUR, seconds: 3600 }] })
  if (mine) return false
  const store = await rateLimit({ bucket: "cart_upload_store", subjects: [`store:${input.creatorId}`], windows: [{ limit: CART_UPLOADS_PER_STORE_HOUR, seconds: 3600 }] })
  return !store
}

export interface UploadDeps {
  db: Db
  limit?: UploadLimiter
  reencode?: Reencode
}

/** The browser's cart id from the request, or a new one with the cookie that gives it. */
export function visitorFor(request: Request): { visitor: string; cookie: string | null } {
  const had = cartVisitorOf(request.headers.get("cookie"))
  if (had) return { visitor: had, cookie: null }
  const visitor = newCartVisitor()
  const secure = new URL(request.url).protocol === "https:" || (request.headers.get("x-forwarded-proto") ?? "") === "https"
  return { visitor, cookie: cartVisitorCookie(visitor, secure) }
}

export type FormFilesResult = { ok: true; fields: Record<string, unknown>; kept: KeptUpload[]; cookie: string | null } | { ok: false; status: number; error: string; cookie: string | null }

/**
 * A theme's product form with files in it: each `properties[Name]` file kept
 * and its value put in its place, so the cart reads a line property like any
 * other. A form with no files comes back as it was. One file refused refuses
 * the form, with the reason (Shopify's /cart/add answers 422 the same way).
 */
export async function keepFormFiles(request: Request, deps: UploadDeps, input: { creatorId: string; entries: [string, unknown][] }): Promise<FormFilesResult> {
  const files: { key: string; file: IncomingFile }[] = []
  for (const [k, v] of input.entries) {
    if (typeof v === "string") continue
    const f = fileOf(v)
    /* An empty file input (nothing chosen) sends a nameless, empty file: no picture, nothing to say. */
    if (!f || (f.size === 0 && (!f.name || f.name === "blob" || f.name === "photo"))) continue
    files.push({ key: k, file: f })
  }
  if (files.length === 0) return { ok: true, fields: {}, kept: [], cookie: null }
  if (files.length > CART_UPLOADS_PER_REQUEST) return { ok: false, status: 400, error: UPLOAD_ERRORS.too_many, cookie: null }
  const { visitor, cookie } = visitorFor(request)
  const hash = visitorHash(visitor)
  if (!(await (deps.limit ?? rateLimitUploads)(request, { creatorId: input.creatorId, visitorHash: hash }))) return { ok: false, status: 429, error: UPLOAD_ERRORS.limited, cookie }
  const fields: Record<string, unknown> = {}
  const kept: KeptUpload[] = []
  for (const { key, file } of files) {
    const r = await keepCartUpload(deps.db, { creatorId: input.creatorId, visitorHash: hash, file, reencode: deps.reencode })
    if (r.ok === false) {
      const bad = r as { status: number; error: string }
      return { ok: false, status: bad.status, error: `${shortName(file.name)}: ${bad.error}`, cookie }
    }
    fields[key] = r.upload.value
    kept.push(r.upload)
  }
  return { ok: true, fields, kept, cookie }
}

/**
 * POST: one or more pictures (`file`, or any file fields), each answered with
 * its value for the cart line: `{ uploads: [{ value, name, width, height,
 * size, type }] }`, `upload` the first. The value is all a theme keeps.
 */
export async function uploadResponse(request: Request, deps: UploadDeps, input: { creatorId: string | null }): Promise<Response> {
  const noStore = { "Cache-Control": "private, no-store" }
  if (!input.creatorId) return NextResponse.json({ status: 403, message: UPLOAD_ERRORS.wrong_place, description: UPLOAD_ERRORS.wrong_place }, { status: 403, headers: noStore })
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ status: 415, message: "Send the picture as multipart/form-data.", description: "Send the picture as multipart/form-data." }, { status: 415, headers: noStore })
  }
  /* The body is read only up to a little over the limit for every file allowed: a bigger one is refused before it is parsed. */
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > CART_UPLOADS_PER_REQUEST * 10 * 1024 * 1024 + 64 * 1024) return NextResponse.json({ status: 413, message: UPLOAD_ERRORS.too_large, description: UPLOAD_ERRORS.too_large }, { status: 413, headers: noStore })
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ status: 400, message: UPLOAD_ERRORS.unreadable, description: UPLOAD_ERRORS.unreadable }, { status: 400, headers: noStore })
  const r = await keepFormFiles(request, deps, { creatorId: input.creatorId, entries: [...form.entries()] })
  const headers = new Headers(noStore)
  if (r.cookie) headers.append("Set-Cookie", r.cookie)
  if (r.ok === false) {
    const bad = r as { status: number; error: string }
    return NextResponse.json({ status: bad.status, message: bad.error, description: bad.error }, { status: bad.status, headers })
  }
  if (r.kept.length === 0) return NextResponse.json({ status: 400, message: UPLOAD_ERRORS.empty, description: UPLOAD_ERRORS.empty }, { status: 400, headers })
  const uploads = r.kept.map((u) => ({ value: u.value, name: u.name, type: u.type, size: u.size, width: u.width, height: u.height }))
  return NextResponse.json({ upload: uploads[0], uploads }, { status: 200, headers })
}

/**
 * GET: the picture, for the browser that uploaded it, on its store: a
 * redirect to a link that lasts ten minutes. Anybody else (another browser,
 * another store's host, a value changed by hand) is told it is not found,
 * the same answer whatever the reason.
 */
export async function openResponse(request: Request, deps: UploadDeps, input: { creatorId: string | null; ref: string }): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }
  const notFound = () => new NextResponse("Not found", { status: 404, headers })
  if (!input.creatorId || !readRef(input.ref)) return notFound()
  const visitor = cartVisitorOf(request.headers.get("cookie"))
  if (!visitor) return notFound()
  const row = await uploadForVisitor(deps.db, { creatorId: input.creatorId, visitorHash: visitorHash(visitor), ref: input.ref })
  if (!row) return notFound()
  const url = await signedLink(deps.db, row, BUYER_LINK_SECONDS)
  if (!url) return notFound()
  return new NextResponse(null, { status: 302, headers: { ...headers, Location: url } })
}

function shortName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const n = String(name || "photo").replace(/[\u0000-\u001f\u007f<>]/g, "").trim()
  return n.length > 40 ? `${n.slice(0, 37)}...` : n || "photo"
}
