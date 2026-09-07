/**
 * Publish, and take down.
 *
 * Ownership is proved by reading the site through the signed-in user's client
 * first: a site somebody else owns comes back null under RLS, so there is no
 * separate check here to forget. Only after that does the publish step use the
 * admin client, which it needs because the deployment row and the storage
 * upload are platform writes a creator must not be able to make directly.
 */

import { type NextRequest, NextResponse } from "next/server"

import { getSite } from "@/lib/sites/projects"
import { publishSite, unpublishSite } from "@/lib/sites/publish"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/** A build plus an upload of every file. Generous, and still bounded. */
export const maxDuration = 120

export async function POST(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const site = await getSite(siteId)
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 })

  const result = await publishSite(site)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, details: result.details }, { status: 400 })
  }

  return NextResponse.json({
    ok: true,
    url: result.url,
    slug: result.slug,
    revision: result.revision,
  })
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const site = await getSite(siteId)
  if (!site) return NextResponse.json({ error: "Site not found." }, { status: 404 })

  await unpublishSite(siteId)
  return NextResponse.json({ ok: true })
}
