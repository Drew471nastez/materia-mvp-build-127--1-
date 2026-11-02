import "server-only"
/**
 * What every route under app/api/website-builder/themes/[installId]/blog
 * does first: the install id's shape, the caller (the owner, or a team
 * member with Website, lib/team/website.ts), the per-person rate limit, and
 * how a refusal is answered. A missing table (SQL part 355 not run) is
 * `503 { error, sql: 355 }`, which the Blog screen shows as "Blog turns on
 * after the database update".
 */
import { NextResponse } from "next/server"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { websiteInstallCaller, type WebsiteInstallCaller } from "@/lib/team/website"
import { readEditorBody } from "@/lib/website-builder/request-body"
import { SQL_MISSING, SQL_PART, SiteBlogError, missingTable } from "./admin"
import type { SiteBlogApiError } from "./types"

export type BlogCaller = Extract<WebsiteInstallCaller<{ id: string; creator_id: string }>, { error: null }>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s)

const WINDOWS = { read: LIMITS.siteRead, save: LIMITS.siteSave, action: LIMITS.siteAction } as const
const MESSAGES = {
  read: "Too many requests in a short time. Wait a moment, then try again.",
  save: "Too many saves in a short time. Wait a moment, then keep writing.",
  action: "Too many changes in a short time. Wait a moment, then try again.",
} as const

export function blogError(status: number, error: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } })
}

export function blogJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export function sqlMissing(): NextResponse {
  const body: SiteBlogApiError = { error: SQL_MISSING, sql: SQL_PART }
  return NextResponse.json(body, { status: 503, headers: { "Cache-Control": "no-store" } })
}

/** The caller of a blog route, or the response that refuses them. */
export async function blogCaller(installId: string, kind: keyof typeof WINDOWS, ...ids: (string | undefined)[]): Promise<{ ok: true; c: BlogCaller } | { ok: false; response: NextResponse }> {
  if (!isUuid(installId)) return { ok: false, response: blogError(404, "Not found") }
  for (const id of ids) if (id !== undefined && !isUuid(id)) return { ok: false, response: blogError(404, "Not found") }
  const c = await websiteInstallCaller(installId)
  if (c.error !== null) return { ok: false, response: blogError(c.status, c.status === 404 ? "Not found" : c.error) }
  const limited = await rateLimit({ bucket: `site-blog-${kind}`, subjects: [`user:${c.userId}`], windows: WINDOWS[kind], message: MESSAGES[kind] })
  if (limited) return { ok: false, response: limited }
  return { ok: true, c: c as BlogCaller }
}

/** A JSON body up to `limit` bytes: the parsed object, or the 413/400 to answer. */
export async function blogBody(req: Request, limit: number): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const read = await readEditorBody(req, limit)
  if (read.ok === false) return { ok: false, response: read.response }
  if (read.invalid || !read.json || typeof read.json !== "object" || Array.isArray(read.json)) return { ok: false, response: blogError(400, "Invalid JSON") }
  return { ok: true, body: read.json as Record<string, unknown> }
}

/** Anything a blog function threw, as the route's answer. */
export function blogFailure(e: unknown): NextResponse {
  if (e instanceof SiteBlogError) {
    if (e.status === 503) return sqlMissing()
    return blogError(e.status, e.message, e.current ? { current: e.current } : {})
  }
  if (missingTable(e)) return sqlMissing()
  console.error("[site-blog] route failed", e instanceof Error ? e.message : String(e))
  return blogError(500, "Something went wrong. Try again.")
}

/** A post's 2 MB cap: the blocks of a long article with every table full. */
export const POST_BODY_LIMIT = 2 * 1024 * 1024
