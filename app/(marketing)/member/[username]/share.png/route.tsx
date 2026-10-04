/**
 * ===========================================================================
 *  THE PICTURE A SHARED PROFILE LINK SHOWS
 * ===========================================================================
 * storelib.com/member/<handle>/share.png?v=<fingerprint>, 1200 by 630, named
 * by the metadata of /@handle (lib/profile/profile-seo.ts). Drawn per
 * request by next/og from the person's public face (components/profile/
 * profile-share-card.tsx): cover, photo, name, @handle, bio, followers and,
 * when they show them, how many communities they are in.
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

  const shown = profile.privacy.showCommunities && !profile.hasStorefront
  const communities = shown && (await communitiesEnabled().catch(() => false))
    ? await profileCommunities(createAdminClient(), profile.userId, { includeMemberships: true })
        .then((c) => c.owned.length + c.member.length)
        .catch(() => null)
    : null
  const model: ProfileShareModel = { name: profile.name, username: profile.username, bio: profile.bio, followers: profile.followers, communities }
  const [cover, avatar] = await Promise.all([
    sharePicture(parseProfileCover(profile.coverUrl).url, PROFILE_SHARE_WIDTH, 236, "jpeg"),
    sharePicture(profile.avatarUrl, 152, 152, "jpeg"),
  ])
  const drawn = (await png(<ProfileShareArt model={model} coverSrc={cover} avatarSrc={avatar} />)) ?? (await png(<ProfileShareArt model={model} coverSrc={null} avatarSrc={null} />))
  if (!drawn) return new Response("Could not draw the image", { status: 500, headers: { "cache-control": "no-store" } })
  return new Response(drawn, { headers: { "content-type": "image/png", "cache-control": BRIEF, "x-robots-tag": "noindex" } })
}
