import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"
import { loadMemberProfile } from "@/lib/profile/member-profile-data"
import { memberProfilePublicPath } from "@/lib/profile/member-url"
import { createAdminClient } from "@/lib/supabase/admin"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { MemberProfilePage } from "@/components/profile/member-profile-page"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ username: string }> }

async function resolveHandle(params: Props["params"]) {
  const { username } = await params
  const handle = (username || "").trim().toLowerCase()
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

async function viewerFollows(viewerId: string | null, targetId: string): Promise<boolean> {
  if (!viewerId || viewerId === targetId) return false
  try {
    const db = createAdminClient()
    const { data } = await db
      .from("profile_follows")
      .select("follower_id")
      .eq("follower_id", viewerId)
      .eq("following_id", targetId)
      .maybeSingle()
    return !!data
  } catch {
    return false
  }
}

export default async function MemberProfileRoute({ params }: Props) {
  const handle = await resolveHandle(params)
  if (!handle) notFound()

  const profile = await loadMemberProfile(handle)
  if (!profile) notFound()

  const { user } = await currentUserForRequest()
  const following = await viewerFollows(user?.id ?? null, profile.userId)

  return <MemberProfilePage profile={profile} viewerId={user?.id ?? null} viewerFollowing={following} />
}
