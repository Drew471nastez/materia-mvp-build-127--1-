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
import { messageTarget, profileCommunities } from "@/lib/profile/profile-communities"
import { cameFromBrowsing, refererPath } from "@/lib/profile/back"
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

/**
 * /@handle: a person's profile (components/profile/member-profile-page.tsx).
 * Everything private is decided here, on the server: whether their activity
 * and their memberships are shown (their switches, except to themselves),
 * whether Message has anywhere to go, and whether the page was reached from
 * a community or Explore, which puts the back bar at its top.
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
  const db = createAdminClient()
  const [following, messageHref, activity, communities] = await Promise.all([
    isFollowing(db, viewerId, profile.userId),
    communitiesOn ? messageTarget(db, viewerId, profile.userId).catch(() => null) : Promise.resolve(null),
    activityFor(db, {
      userId: profile.userId,
      viewerId,
      creator: profile.creatorId ? { id: profile.creatorId, handle: profile.storefrontHandle } : null,
      showActivity: profile.privacy.showActivity,
    }).catch(() => ({ items: [], next: null, hidden: !profile.privacy.showActivity })),
    communitiesOn
      ? profileCommunities(db, profile.userId, { includeMemberships: profile.privacy.showCommunities || isSelf }).catch(() => ({ owned: [], member: [] }))
      : Promise.resolve({ owned: [], member: [] }),
  ])

  const backShown = from === "community" || from === "explore" || cameFromBrowsing(refererPath(head.get("referer"), head.get("host")))

  return (
    <main className="explore-ground min-h-screen bg-[#f8f9fa]" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <div className="mx-auto max-w-[1400px] px-4 pb-8 pt-4 sm:px-6 sm:pb-10 sm:pt-6 lg:px-8 lg:pb-12">
        <MemberProfileShell>
          <MemberProfilePage
            profile={profile}
            viewerId={viewerId}
            viewerFollowing={following}
            extras={{
              messageHref,
              activity,
              communities: { enabled: communitiesOn, owned: communities.owned, member: communities.member },
              backShown,
              now: Date.now(),
            }}
          />
        </MemberProfileShell>
      </div>
    </main>
  )
}
