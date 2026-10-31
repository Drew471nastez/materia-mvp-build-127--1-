import "server-only"

import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

/**
 * Every answer from app/api/admin/blog: never cached, never indexed. The
 * admin is disallowed in robots.txt as well, but an answer that says noindex
 * itself does not depend on how it was reached.
 */
export const ADMIN_BLOG_HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } as const

export function blogJson(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: ADMIN_BLOG_HEADERS })
}

/** The public pages a change to these posts shows on: the index, the feed, the categories, the author pages, and each post's own address (old and new). */
export function revalidateBlogPages(...slugs: Array<string | null | undefined>) {
  revalidatePath("/blog")
  revalidatePath("/blog/rss.xml")
  revalidatePath("/blog/category", "layout")
  revalidatePath("/blog/author", "layout")
  for (const s of new Set(slugs.filter(Boolean) as string[])) revalidatePath(`/blog/${s}`)
}
