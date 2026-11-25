/**
 * ===========================================================================
 *  A LARGE EDITOR READ, SENT ONLY WHEN IT CHANGED (round 27)
 * ===========================================================================
 * The owner: "clicking Edit website takes too long to open the editor".
 * Opening the editor on a Materia website asks for the theme's section
 * sources (666 files, 21 MB of text) and its Shopify files (294 files,
 * 6.4 MB), every time, past the browser's cache ({ cache: "no-store" }), so
 * a push's new code is always drawn (round 41).
 *
 * The answer now carries a tag of exactly what it holds (`ETag`, a hash of
 * the body) and `Cache-Control: private, no-cache`: the browser keeps it,
 * and must ask before using it. The editor asks with { cache: "no-cache" },
 * so every open still reaches this server and reads the files; when they are
 * the same as the copy the browser has, the answer is a 304 with no body
 * and the megabytes are not sent again. A file changed by anything (a save,
 * a push, Storelib AI) changes the body, so the tag, so the whole answer is
 * sent, exactly as before. Private: never kept by a shared cache.
 */
import { createHash } from "node:crypto"
import { NextResponse } from "next/server"

export const REVALIDATED_CACHE = "private, no-cache"

/** The tag of a body: weak, since the server may send it compressed. */
export function bodyTag(body: string): string {
  return `W/"${createHash("sha1").update(body).digest("base64url")}"`
}

/** Whether an If-None-Match header names this tag (or *). */
export function tagMatches(header: string | null, tag: string): boolean {
  if (!header) return false
  const strip = (t: string) => t.trim().replace(/^W\//, "")
  const want = strip(tag)
  return header.split(",").some((t) => t.trim() === "*" || strip(t) === want)
}

/** The value as JSON, or a 304 when the request already has exactly it. */
export function revalidatedJson(req: Request, value: unknown, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  const body = JSON.stringify(value)
  const tag = bodyTag(body)
  const headers = { ...(init.headers ?? {}), ETag: tag, "Cache-Control": REVALIDATED_CACHE, Vary: "Cookie" }
  if ((init.status ?? 200) === 200 && tagMatches(req.headers.get("if-none-match"), tag)) {
    return new NextResponse(null, { status: 304, headers })
  }
  return new NextResponse(body, { status: init.status ?? 200, headers: { ...headers, "Content-Type": "application/json" } })
}
