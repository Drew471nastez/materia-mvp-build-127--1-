import { NextResponse, type NextRequest } from "next/server"

import { createAdminClient } from "@/lib/supabase/admin"
import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { buildCreatorSite, previewCreatorSite } from "@/lib/admin/creator-site/build"
import type { CreatorSiteContent } from "@/lib/admin/creator-site/content"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* Composing, converting and storing a template, as Add does. */
export const maxDuration = 60

const NO_STORE = { "Cache-Control": "no-store" }

/**
 * ===========================================================================
 *  GET  /api/admin/creators/site?id=…   what a built website would hold
 *  POST /api/admin/creators/site        { creatorId }   build it
 * ===========================================================================
 * The owner (round 63): make a creator's website on the current Storelib
 * Default with all their content as they built it. GET shows what would be
 * used and what was left out as template sample text, and whether their
 * library has room. POST makes a NEW draft website in their library
 * (lib/admin/creator-site/build.ts): their current website is never
 * changed, and nothing is published. Each build is in the audit log.
 */

/** What the console shows: the content, not the rows it came from. */
function summary(c: CreatorSiteContent) {
  return {
    name: c.name,
    handle: c.handle,
    heroImage: c.hero.image,
    heroHeading: c.hero.heading,
    heroSubheading: c.hero.subheading,
    productsHeading: c.productsHeading,
    bio: c.bio,
    logo: c.logo,
    socials: Object.keys(c.socials),
    products: c.products.map((p) => p.title),
    sources: c.sources,
    leftOut: c.leftOut,
  }
}

export async function GET(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const id = new URL(req.url).searchParams.get("id") ?? ""
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "No creator has this id." }, { status: 400, headers: NO_STORE })

  try {
    const seen = await previewCreatorSite(createAdminClient(), id)
    if (seen.ok === false) return NextResponse.json({ error: seen.error }, { status: seen.status, headers: NO_STORE })
    return NextResponse.json({ content: summary(seen.content), slotsLeft: seen.slotsLeft, hasLive: seen.hasLive, built: seen.built }, { headers: NO_STORE })
  } catch (e) {
    return adminFailure("creator site preview", e, "The creator's content could not be read.")
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = (await req.json().catch(() => null)) as { creatorId?: unknown } | null
  const creatorId = typeof body?.creatorId === "string" ? body.creatorId : ""
  if (!UUID_RE.test(creatorId)) return NextResponse.json({ error: "No creator has this id." }, { status: 400, headers: NO_STORE })

  const admin = createAdminClient()
  let built: Awaited<ReturnType<typeof buildCreatorSite>>
  try {
    built = await buildCreatorSite(admin, creatorId)
  } catch (e) {
    return adminFailure("creator site build", e, "The website could not be made. Nothing was changed.")
  }
  if (built.ok === false) {
    const failed = built as { status: number; error: string; code?: string }
    return NextResponse.json(failed.code ? { error: failed.error, code: failed.code } : { error: failed.error }, { status: failed.status, headers: NO_STORE })
  }

  const recorded = await recordAdminAction(admin, {
    action: "creator_site_built",
    targetType: "creator",
    targetId: creatorId,
    targetLabel: built.content.name,
    detail: { install_id: built.installId, template: "storelib-default", release: built.release, used: built.content.sources, left_out: built.content.leftOut.length },
  })

  return NextResponse.json(
    {
      install: { id: built.installId, name: built.name, status: "draft" },
      content: summary(built.content),
      recorded,
      message: `Made "${built.name}" as a draft in their library. Their live website is unchanged.`,
    },
    { headers: NO_STORE },
  )
}
