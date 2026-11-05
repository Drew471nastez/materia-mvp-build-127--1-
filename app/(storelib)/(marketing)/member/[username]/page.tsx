import type { Metadata } from "next"
import { cache } from "react"
import { headers } from "next/headers"
import { notFound, permanentRedirect } from "next/navigation"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { loadMemberProfile } from "@/lib/profile/member-profile-data"
import { memberProfilePublicPath } from "@/lib/profile/member-url"
import { personJsonLd, profileMetadata } from "@/lib/profile/profile-seo"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { deservesIndexing } from "@/lib/security/spam-signals"
import { spamStateOf } from "@/lib/seo/bans"
import { createAdminClient } from "@/lib/supabase/admin"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { isFollowing } from "@/lib/profile/follows"
import { activityFor } from "@/lib/profile/activity-page"
import { profileCommunities } from "@/lib/profile/profile-communities"
import { cameFromElsewhere, communityBackTarget, refererPath } from "@/lib/profile/back"
import { contributionsFor } from "@/lib/profile/contributions"
import { locationLine, readProfileLocation } from "@/lib/profile/location"
import { MemberProfilePage } from "@/components/profile/member-profile-page"

export const dynamic = "force-dynamic"

/* Where they are from, read once per request for the metadata and the page both. */
const placeOf = cache((userId: string) => readProfileLocation(createAdminClient(), userId))

/*
  IN SEARCH OR NOT, read once per request for the metadata and the page.
  Round 44: an operator's spam verdict (profiles.spam_state, lib/seo/bans.ts)
  wins both ways, as on the creator page and the OnePage; only the handle
  score was read here, so an account an operator confirmed as spam kept an
  indexed profile with structured data.
*/
const inSearch = cache(async (userId: string, username: string) => deservesIndexing({ handle: username, spamState: await spamStateOf(userId) }))

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ from?: string; back?: string }> }

async function resolveHandle(params: Props["params"]) {
  const { username } = await params
  const handle = decodeURIComponent(username || "").trim().replace(/^@/, "").toLowerCase()
  if (!handle || isReservedRootSegment(handle)) return null
  return handle
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const handle = await resolveHandle(params)
  if (!handle) return { title: "Profile not found" }
  const profile = await loadMemberProfile(handle)
  if (!profile) return { title: "Profile not found" }
  const place = await placeOf(profile.userId)
  /* Their own words in search and a picture drawn from their page in a shared link (lib/profile/profile-seo.ts). */
  return profileMetadata({
    location: locationLine(place),
    name: profile.name,
    username: profile.username,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    coverUrl: profile.coverUrl,
    followers: profile.followers,
    indexable: await inSearch(profile.userId, profile.username),
  })
}

/** A handle somebody changed away from still finds them (the row app/api/profile/username writes). */
async function renamedTo(handle: string): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from("username_history")
      .select("new_username")
      .ilike("old_username", handle)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as { new_username?: string | null } | null)?.new_username || null
  } catch {
    return null
  }
}

/**
 * Their contributions per community (round 13, ask 30): the communities the viewer shares with them, or their own when it is
 * them, each with what they gave it and the first page of their posts there (lib/profile/contributions.ts). A failed read is
 * no section, never an error page.
 */
async function sharedSections(db: ReturnType<typeof createAdminClient>, viewerId: string, targetId: string) {
  try {
    return await contributionsFor(db, { viewerId, targetId })
  } catch {
    return []
  }
}

/**
 * /@handle: a person's profile, the creator page's template without the
 * products (components/profile/member-profile-page.tsx, round 12).
 * Somebody without a store: a creator's /@handle never gets here, its
 * layout answers a 308 to their creator page (lib/profile/profile-redirect).
 * Everything private is decided here, on the server: whether their activity
 * and their memberships are shown (their switches, except to themselves),
 * which communities the viewer shares
 * with them (their posts there open the Activity tab, only from spaces the
 * viewer may read), and whether the page was reached from a community,
 * Explore or search, which puts the way back in a bar at its top.
 */
export default async function MemberProfileRoute({ params, searchParams }: Props) {
  const handle = await resolveHandle(params)
  if (!handle) notFound()

  const profile = await loadMemberProfile(handle)
  if (!profile) {
    const moved = await renamedTo(handle)
    if (moved && moved.toLowerCase() !== handle) permanentRedirect(memberProfilePublicPath(moved))
    notFound()
  }

  const [{ user }, { from, back }, head, communitiesOn] = await Promise.all([
    currentUserForRequest(),
    searchParams,
    headers(),
    communitiesEnabled().catch(() => false),
  ])
  const viewerId = user?.id ?? null
  const isSelf = viewerId === profile.userId
  /* A person with a store has no activity on any of their pages, and lists only the communities they made (components/profile/member-profile-page.tsx). Nothing of it is read. */
  const creator = profile.hasStorefront
  const db = createAdminClient()
  const [following, activity, communities, shared, place] = await Promise.all([
    isFollowing(db, viewerId, profile.userId),
    creator
      ? Promise.resolve({ items: [], next: null, hidden: false })
      : activityFor(db, {
          userId: profile.userId,
          viewerId,
          creator: null,
          showActivity: profile.privacy.showActivity,
        }).catch(() => ({ items: [], next: null, hidden: !profile.privacy.showActivity })),
    communitiesOn
      ? profileCommunities(db, profile.userId, { includeMemberships: !creator && (profile.privacy.showCommunities || isSelf) }).catch(() => ({ owned: [], member: [] }))
      : Promise.resolve({ owned: [], member: [] }),
    communitiesOn && viewerId && !creator ? sharedSections(db, viewerId, profile.userId) : Promise.resolve([]),
    /* Where they are from, under their name (run-now part 98; nothing before it runs). */
    placeOf(profile.userId),
  ])

  /* Arrived from any other page of ours (not a reload of this one): the way back in the top bar. */
  const ownPaths = [`/@${handle}`, `/member/${handle}`, ...(profile.username ? [`/@${profile.username}`, `/member/${profile.username}`] : [])]
  /* Opened from their profile inside a community: the way back lands there even with nothing behind (lib/profile/back communityBackTarget). */
  const backTarget = communityBackTarget(back)
  const backShown = !!backTarget || from === "community" || from === "explore" || cameFromElsewhere(refererPath(head.get("referer"), head.get("host")), ownPaths)

  /* Who the page is about, for search, when it is in search at all (as generateMetadata decides); then the creator page's template without the products. */
  const indexable = await inSearch(profile.userId, profile.username)
  return (
    <>
      {indexable ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(personJsonLd(profile)) }} /> : null}
      <MemberProfilePage
        profile={profile}
        viewerId={viewerId}
        viewerFollowing={following}
        extras={{
          activity,
          communities: { enabled: communitiesOn, owned: communities.owned, member: communities.member },
          shared,
          backShown,
          backTarget,
          now: Date.now(),
          location: locationLine(place),
        }}
      />
    </>
  )
}
