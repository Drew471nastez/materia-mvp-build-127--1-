import type { Metadata } from "next"
import { headers } from "next/headers"
import { notFound, permanentRedirect } from "next/navigation"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { loadMemberProfile } from "@/lib/profile/member-profile-data"
import { memberProfilePublicPath } from "@/lib/profile/member-url"
import { createAdminClient } from "@/lib/supabase/admin"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { isFollowing } from "@/lib/profile/follows"
import { activityFor } from "@/lib/profile/activity-page"
import { profileCommunities } from "@/lib/profile/profile-communities"
import { cameFromElsewhere, refererPath } from "@/lib/profile/back"
import { sharedCommunities, sharedPostsPage } from "@/lib/profile/shared-posts"
import { MemberProfilePage } from "@/components/profile/member-profile-page"
import { MemberProfileShell } from "@/components/profile/member-profile-shell"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ from?: string }> }

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
  return {
    title: `${profile.name} (@${profile.username})`,
    description: profile.bio || `${profile.name} on Storelib`,
    alternates: { canonical: memberProfilePublicPath(profile.username) },
  }
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

/** The communities the viewer shares with them, each with the first page of their posts there. A failed read is no section, never an error page. */
async function sharedSections(db: ReturnType<typeof createAdminClient>, viewerId: string, targetId: string) {
  try {
    const list = await sharedCommunities(db, viewerId, targetId)
    const pages = await Promise.all(list.map((community) => sharedPostsPage(db, { communityId: community.id, viewerId, targetId }).catch(() => null)))
    return list.flatMap((community, i) => (pages[i] ? [{ community, page: pages[i]! }] : []))
  } catch {
    return []
  }
}

/**
 * /@handle: a person's profile (components/profile/member-profile-page.tsx).
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

  const [{ user }, { from }, head, communitiesOn] = await Promise.all([
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
  const [following, activity, communities, shared] = await Promise.all([
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
    communitiesOn && viewerId && !isSelf && !creator ? sharedSections(db, viewerId, profile.userId) : Promise.resolve([]),
  ])

  /* Arrived from any other page of ours (not a reload of this one): the way back in the top bar. */
  const ownPaths = [`/@${handle}`, `/member/${handle}`, ...(profile.username ? [`/@${profile.username}`, `/member/${profile.username}`] : [])]
  const backShown = from === "community" || from === "explore" || cameFromElsewhere(refererPath(head.get("referer"), head.get("host")), ownPaths)

  return (
    <main className="explore-ground min-h-screen bg-[#f8f9fa]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <MemberProfileShell>
        <MemberProfilePage
          profile={profile}
          viewerId={viewerId}
          viewerFollowing={following}
          extras={{
            activity,
            communities: { enabled: communitiesOn, owned: communities.owned, member: communities.member },
            shared,
            backShown,
            now: Date.now(),
          }}
        />
      </MemberProfileShell>
    </main>
  )
}
