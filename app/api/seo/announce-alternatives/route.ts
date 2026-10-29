import { NextResponse, after } from "next/server"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { alternativesAddresses, announceAddresses } from "@/lib/seo/announce-pages"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/seo/announce-alternatives   { slugs?: string[] }
 *
 * The comparison pages (lib/alternatives) are code: they are published by a
 * deploy, not by a save, so no save route can send them to IndexNow the way
 * a product or a blog post is sent. Whatever ships a change to them (a
 * deploy hook, or by hand after a deploy) calls this, with the slugs that
 * changed or none for all of them. The hub is always sent with them.
 *
 * Protected by CRON_SECRET, answers at once, sends after (`after()`), and
 * does nothing while INDEXNOW_KEY is unset (lib/seo/indexnow.ts).
 */
export async function POST(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) return denied
  const body = (await request.json().catch(() => null)) as { slugs?: unknown } | null
  const slugs = Array.isArray(body?.slugs) ? body.slugs.filter((s): s is string => typeof s === "string").slice(0, 100) : []
  const urls = alternativesAddresses(...slugs)
  after(() => announceAddresses(urls))
  return NextResponse.json({ ok: true, urls }, { status: 202 })
}
