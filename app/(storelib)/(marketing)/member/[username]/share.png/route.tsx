/**
 * ===========================================================================
 *  THE PICTURE A SHARED PROFILE LINK SHOWS
 * ===========================================================================
 * storelib.com/member/<handle>/share.png?v=<fingerprint>, 1200 by 630, named
 * by the metadata of /@handle (lib/profile/profile-seo.ts) and, round 12,
 * of a creator's page too (app/(marketing)/u/[username], unless they chose
 * a Social image of their own). Drawn per request by next/og from the
 * person's public face (components/profile/profile-share-card.tsx): cover,
 * photo, name, @handle, where they are from, bio, followers and, when they
 * show them, how many communities they are in; for a creator, their page's
 * own cover, photo and bio and how many products they sell.
 *
 * WHY HERE: next.config rewrites `/@:handle` alone (one segment), so the
 * picture lives under the route the rewrite lands on. robots.txt does not
 * keep crawlers out of /member, and the proxy skips .png addresses, so no
 * session is read for it.
 *
 * Nothing about somebody nobody may see: an unknown handle is a 404. The
 * communities count follows their own switch, as the page does.
 *
 * CACHING: kept briefly (ten minutes at the edge, five in a browser, then
 * served while it is drawn again); the `v` fingerprint changes with an edit.
 */
import { ImageResponse } from "next/og"
import { loadMemberProfile } from "@/lib/profile/member-profile-data"
import { profileCommunities } from "@/lib/profile/profile-communities"
import { communitiesEnabled } from "@/lib/communities/flag"
import { createAdminClient } from "@/lib/supabase/admin"
import { shareFonts, sharePicture } from "@/lib/communities/server/share-image"
import { parseProfileCover } from "@/lib/profile/cover"
import { PROFILE_SHARE_HEIGHT, PROFILE_SHARE_WIDTH, ProfileShareArt, type ProfileShareModel } from "@/components/profile/profile-share-card"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { loadCreatorForUser } from "@/lib/commerce/creator-page-data"
import { getPublishedConfig } from "@/lib/store-builder/get-published-config"
import type { ShopHeaderSettings } from "@/lib/store-builder/types"
import { keptPhoto } from "@/lib/account/identity"
import { locationLine, readProfileLocation } from "@/lib/profile/location"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const BRIEF = "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
const MISSING = "public, max-age=60, s-maxage=60"

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": MISSING } })
}

async function png(element: React.ReactElement): Promise<ArrayBuffer | null> {
  try {
    const fonts = await shareFonts()
    const image = new ImageResponse(element, { width: PROFILE_SHARE_WIDTH, height: PROFILE_SHARE_HEIGHT, ...(fonts.length ? { fonts } : {}) })
    return await image.arrayBuffer()
  } catch (error) {
    console.error("Profile share image could not be drawn:", error instanceof Error ? error.message : "unknown")
    return null
  }
}

/**
 * What a creator page's header draws (app/(marketing)/u/[username]): the
 * header's cover, else the store's; the header's bio, else the store's; the
 * header's copy of the photo for a profile without one (lib/account/identity
 * keptPhoto, so a provider's picture they replaced is never the face).
 */
async function creatorPageFace(userId: string, creatorId: string): Promise<{ cover: string | null; bio: string | null; avatar: string | null }> {
  const [creator, config] = await Promise.all([loadCreatorForUser(userId).catch(() => null), getPublishedConfig(creatorId, "shop").catch(() => null)])
  const header = (config?.headerSettings ?? null) as ShopHeaderSettings | null
  const row = (creator ?? null) as { cover_url?: string | null; bio?: string | null } | null
  return {
    cover: header?.coverImageUrl || row?.cover_url || null,
    bio: ((header?.showBio ?? true) ? (header?.bio || row?.bio || "").trim() : "") || null,
    avatar: keptPhoto(header?.avatarUrl),
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  let handle = ""
  try {
    handle = decodeURIComponent(username || "").trim().replace(/^@/, "").toLowerCase()
  } catch {
    return notFound()
  }
  if (!/^[a-z0-9][a-z0-9_.-]{0,63}$/.test(handle) || isReservedRootSegment(handle)) return notFound()
  const profile = await loadMemberProfile(handle)
  if (!profile) return notFound()

  const db = createAdminClient()
  const [place, creatorFace, communities] = await Promise.all([
    readProfileLocation(db, profile.userId),
    profile.hasStorefront && profile.creatorId ? creatorPageFace(profile.userId, profile.creatorId) : Promise.resolve(null),
    profile.privacy.showCommunities && !profile.hasStorefront && (await communitiesEnabled().catch(() => false))
      ? profileCommunities(db, profile.userId, { includeMemberships: true })
          .then((c) => c.owned.length + c.member.length)
          .catch(() => null)
      : Promise.resolve(null),
  ])
  /* A creator's card is their creator page's face: its cover, photo and bio, and what it sells. */
  const model: ProfileShareModel = {
    name: profile.name,
    username: profile.username,
    bio: creatorFace ? creatorFace.bio : profile.bio,
    followers: profile.followers,
    communities,
    products: creatorFace ? profile.productCount : null,
    location: locationLine(place),
  }
  const coverUrl = creatorFace ? creatorFace.cover : parseProfileCover(profile.coverUrl).url
  const avatarUrl = profile.avatarUrl || creatorFace?.avatar || null
  const [cover, avatar] = await Promise.all([
    sharePicture(coverUrl, PROFILE_SHARE_WIDTH, 236, "jpeg"),
    sharePicture(avatarUrl, 152, 152, "jpeg"),
  ])
  const drawn = (await png(<ProfileShareArt model={model} coverSrc={cover} avatarSrc={avatar} />)) ?? (await png(<ProfileShareArt model={model} coverSrc={null} avatarSrc={null} />))
  if (!drawn) return new Response("Could not draw the image", { status: 500, headers: { "cache-control": "no-store" } })
  return new Response(drawn, { headers: { "content-type": "image/png", "cache-control": BRIEF, "x-robots-tag": "noindex" } })
}
