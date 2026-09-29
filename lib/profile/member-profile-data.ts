import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readPublicRow } from "@/lib/security/public-rows"
import { loadCreatorForUser } from "@/lib/commerce/creator-page-data"
import { hasActiveStorefront } from "@/lib/profile/member-url"

export type MemberPublicReview = {
  id: string
  rating: number
  content: string | null
  createdAt: string
  productTitle: string
}

export type MemberProfileData = {
  userId: string
  name: string
  username: string
  avatarUrl: string | null
  bio: string | null
  memberSince: string
  hasStorefront: boolean
  storefrontHandle: string
  followers: number
  following: number
  reviews: MemberPublicReview[]
}

const memberSince = (createdAt: string | undefined) => {
  const d = new Date(createdAt || "")
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

async function followCounts(userId: string): Promise<{ followers: number; following: number }> {
  try {
    const db = createAdminClient()
    const [followers, following] = await Promise.all([
      db.from("profile_follows").select("follower_id", { count: "exact", head: true }).eq("following_id", userId),
      db.from("profile_follows").select("following_id", { count: "exact", head: true }).eq("follower_id", userId),
    ])
    if (followers.error || following.error) return { followers: 0, following: 0 }
    return { followers: followers.count ?? 0, following: following.count ?? 0 }
  } catch {
    return { followers: 0, following: 0 }
  }
}

async function publicReviews(userId: string): Promise<MemberPublicReview[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, content, created_at, products(title)")
    .eq("buyer_id", userId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(12)
  if (error || !data) return []
  return data.map((row) => ({
    id: row.id as string,
    rating: row.rating as number,
    content: (row.content as string | null) || null,
    createdAt: row.created_at as string,
    productTitle: ((row.products as { title?: string } | null)?.title || "Product").trim(),
  }))
}

export const loadMemberProfile = cache(async (username: string): Promise<MemberProfileData | null> => {
  const profile = await readPublicRow(await createClient(), "profiles", (q) => q.ilike("username", username))
  if (!profile?.id || !profile.username) return null
  const creator = await loadCreatorForUser(profile.id)
  const [counts, reviews] = await Promise.all([followCounts(profile.id), publicReviews(profile.id)])
  const handle = profile.username.toLowerCase()
  return {
    userId: profile.id,
    name: (profile.display_name || profile.username || "").trim(),
    username: handle,
    avatarUrl: profile.avatar_url || null,
    bio: (profile.bio || "").trim() || null,
    memberSince: memberSince((profile as { created_at?: string }).created_at),
    hasStorefront: hasActiveStorefront(creator),
    storefrontHandle: handle,
    followers: counts.followers,
    following: counts.following,
    reviews,
  }
})
