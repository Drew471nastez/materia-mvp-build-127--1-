/**
 * ===========================================================================
 *  THE PICTURE A SHARED COMMUNITY LINK SHOWS
 * ===========================================================================
 * storelib.com/community/<slug>/share.png?v=<fingerprint>[&invite=1], 1200
 * by 630, named by the metadata of /community/<slug>, its About and its
 * invite links (components/community/public/seo.ts). Drawn per request by
 * next/og from the community's public face (components/community/public/
 * share-card.tsx): its cover, logo, name, line, creator, member count and
 * price, with a Join at the right; `invite=1` adds "You're invited". No
 * invite token is ever sent here or read.
 *
 * WHY HERE AND NOT UNDER /api: robots.txt keeps crawlers out of /api, and
 * X's crawler honours it for the card image. The proxy skips .png
 * addresses, so no session is read for it either.
 *
 * NOTHING ABOUT A COMMUNITY NOBODY MAY SEE: with communities switched off,
 * for a draft, a suspended or a deleted community, it is a 404. An old
 * address draws the community it moved to (loadCommunity follows it).
 *
 * CACHING: made per request and kept briefly (ten minutes at the edge, five
 * in a browser, then served while it is drawn again), so a new member count
 * or cover shows within minutes; the `v` fingerprint changes with an edit,
 * which asks for a fresh one at once.
 */
import { ImageResponse } from "next/og"
import { communitiesEnabled } from "@/lib/communities/flag"
import { loadCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { sharePreviewable } from "@/lib/communities/server/public"
import { shareFonts, shareModel, sharePicture } from "@/lib/communities/server/share-image"
import { COMMUNITY_SHARE_HEIGHT, COMMUNITY_SHARE_WIDTH, CommunityShareArt } from "@/components/community/public/share-card"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BRIEF = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
const MISSING = "public, max-age=60, s-maxage=60"

/** The cover band's size in the picture (share-card.tsx), the logo's and the face's, at the size they are drawn. */
const COVER = { width: COMMUNITY_SHARE_WIDTH, height: 236 }
const LOGO = 264
const FACE = 88

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": MISSING } })
}

async function png(element: React.ReactElement): Promise<ArrayBuffer | null> {
  try {
    const fonts = await shareFonts()
    const image = new ImageResponse(element, { width: COMMUNITY_SHARE_WIDTH, height: COMMUNITY_SHARE_HEIGHT, ...(fonts.length ? { fonts } : {}) })
    /* Drawn in full here, so a picture it cannot draw is caught and the card drawn without it. */
    return await image.arrayBuffer()
  } catch (error) {
    console.error("Community share image could not be drawn:", error instanceof Error ? error.message : "unknown")
    return null
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await communitiesEnabled())) return notFound()
  const { slug } = await params
  const key = decodeURIComponent(slug || "").toLowerCase()
  if (!/^[a-z0-9-]{1,64}$/.test(key)) return notFound()
  const db = admin()
  const community = await loadCommunity(db, { slug: key })
  if (!community || !sharePreviewable(community)) return notFound()

  const invite = new URL(request.url).searchParams.get("invite") === "1"
  const { model, pictures } = await shareModel(db, community, invite)
  const [cover, logo, avatar] = await Promise.all([
    sharePicture(pictures.cover, COVER.width, COVER.height, "jpeg"),
    sharePicture(pictures.logo, LOGO, LOGO, "png"),
    model.creatorName ? sharePicture(pictures.avatar, FACE, FACE, "jpeg") : Promise.resolve(null),
  ])

  const drawn =
    (await png(<CommunityShareArt model={model} coverSrc={cover} logoSrc={logo} avatarSrc={avatar} />)) ??
    (await png(<CommunityShareArt model={model} coverSrc={null} logoSrc={null} avatarSrc={null} />))
  if (!drawn) return new Response("Could not draw the image", { status: 500, headers: { "cache-control": "no-store" } })
  return new Response(drawn, { headers: { "content-type": "image/png", "cache-control": BRIEF, "x-robots-tag": "noindex" } })
}
