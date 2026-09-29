import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readPublicRow } from "@/lib/security/public-rows"
import { loadCreatorForUser } from "@/lib/commerce/creator-page-data"
import { hasActiveStorefront } from "@/lib/profile/member-url"
import { withPriceIntervals } from "@/lib/memberships/intervals"

export type MemberPublicReview = {
  id: string
  rating: number
  content: string | null
  createdAt: string
  productTitle: string
}

export type MemberStoreProduct = {
  id: string
  title: string
  slug: string
  thumbnailUrl: string | null
  priceCents: number
  payWhatYouWant?: boolean | null
  pwywMinPriceCents?: number | null
  type: string
  priceInterval?: "month" | "year" | null
}

export type MemberProfileData = {
  userId: string
  name: string
  username: string
  avatarUrl: string | null
  coverUrl: string | null
  bio: string | null
  memberSince: string
  hasStorefront: boolean
  storefrontHandle: string
  followers: number
  following: number
  products: MemberStoreProduct[]
  productCount: number
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

async function storefrontProducts(creatorId: string): Promise<{ items: MemberStoreProduct[]; total: number }> {
  const supabase = await createClient()
  const { data, count, error } = await supabase
    .from("products")
    .select("id, title, slug, thumbnail_url, price_cents, pay_what_you_want, pwyw_min_price_cents, type", { count: "exact" })
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(8)
  if (error || !data) return { items: [], total: 0 }
  const rows = await withPriceIntervals(supabase, data as Array<{ id: string; type?: string | null } & Record<string, unknown>>)
  return {
    total: count ?? data.length,
    items: rows.map((row) => ({
      id: row.id as string,
      title: (row.title as string) || "Product",
      slug: (row.slug as string) || "",
      thumbnailUrl: (row.thumbnail_url as string | null) || null,
      priceCents: (row.price_cents as number) ?? 0,
      payWhatYouWant: row.pay_what_you_want as boolean | null,
      pwywMinPriceCents: row.pwyw_min_price_cents as number | null,
      type: (row.type as string) || "digital",
      priceInterval: (row as { price_interval?: "month" | "year" | null }).price_interval ?? null,
    })),
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
  return data.map((row) => {
    const embedded = row.products as { title?: string } | { title?: string }[] | null
    const title =
      (Array.isArray(embedded) ? embedded[0]?.title : embedded?.title) || "Product"
    return {
      id: row.id as string,
      rating: Math.min(5, Math.max(1, Number(row.rating) || 5)),
      content: (row.content as string | null) || null,
      createdAt: row.created_at as string,
      productTitle: String(title).trim() || "Product",
    }
  })
}

export const loadMemberProfile = cache(async (username: string): Promise<MemberProfileData | null> => {
  try {
  const profile = await readPublicRow(await createClient(), "profiles", (q) => q.ilike("username", username))
  if (!profile?.id || !profile.username) return null
  const creator = await loadCreatorForUser(profile.id)
  const storefront = hasActiveStorefront(creator) && creator?.id
  const [counts, reviews, catalog] = await Promise.all([
    followCounts(profile.id),
    publicReviews(profile.id),
    storefront ? storefrontProducts(creator.id) : Promise.resolve({ items: [], total: 0 }),
  ])
  const handle = profile.username.toLowerCase()
  const creatorRow = creator as { cover_url?: string | null } | null
  return {
    userId: profile.id,
    name: (profile.display_name || profile.username || "").trim(),
    username: handle,
    avatarUrl: profile.avatar_url || null,
    coverUrl: creatorRow?.cover_url || null,
    bio: (profile.bio || "").trim() || null,
    memberSince: memberSince((profile as { created_at?: string }).created_at),
    hasStorefront: !!storefront,
    storefrontHandle: handle,
    followers: counts.followers,
    following: counts.following,
    products: catalog.items,
    productCount: catalog.total,
    reviews,
  }
  } catch {
    return null
  }
})
