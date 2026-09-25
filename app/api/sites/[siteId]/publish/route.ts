/**
 * Publish, and take down.
 *
 * Ownership is proved by reading the site through the signed-in user's client
 * first: a site somebody else owns comes back null under RLS, so there is no
 * separate check here to forget. Only after that does the publish step use the
 * admin client, which it needs because the deployment row and the storage
 * upload are platform writes a creator must not be able to make directly.
 */

import { type NextRequest, NextResponse, after } from "next/server"

import { resolveSite } from "@/lib/sites/resolve"

import { } from "@/lib/sites/projects"
import { publishSite, publishedUrl, unpublishSite } from "@/lib/sites/publish"
import { announce, aiSiteAddresses } from "@/lib/seo/announce"
import { publishRateLimit } from "@/lib/sites/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
/** A build plus an upload of every file. Generous, and still bounded. */
export const maxDuration = 120

export async function POST(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const found = await resolveSite(siteId)
  if (!found.ok) return found.response
  const site = found.site

  // Before the build. Each publish is a bundle plus an upload of every file,
  // and a stuck button should cost one wasted minute rather than a bill.
  const limited = await publishRateLimit(siteId)
  if (limited) return NextResponse.json({ error: limited }, { status: 429 })

  const result = await publishSite(site)
  if (!result.ok) {
    return NextResponse.json({ error: result.error, details: result.details }, { status: 400 })
  }

  /* After the answer: the site's address, to the search engines that take
     IndexNow (lib/seo/indexnow.ts). Never in the way of the publish. */
  const published = result.url
  after(() => announce(() => aiSiteAddresses(site.creatorId, published)))

  return NextResponse.json({
    ok: true,
    url: result.url,
    slug: result.slug,
    revision: result.revision,
  })
}

export async function DELETE(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  const found = await resolveSite(siteId)
  if (!found.ok) return found.response
  const site = found.site

  await unpublishSite(siteId)
  /* And taken down: where it was, so engines look again and drop it. */
  const was = site.slug
  if (was) after(() => announce(() => aiSiteAddresses(site.creatorId, publishedUrl(was))))
  return NextResponse.json({ ok: true })
}
