import { publicProfileByName } from "@/lib/profile/profile-by-name"
import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadCreatorForUser } from "@/lib/commerce/creator-page-data"
import { hasActiveStorefront } from "@/lib/profile/member-url"
import { withPriceIntervals } from "@/lib/memberships/intervals"
import { followCounts } from "@/lib/profile/follows"
import { excludingCommunityProducts } from "@/lib/communities/listing"
import { readPrivacy, type ProfilePrivacy } from "@/lib/profile/privacy"
import { profileSocialLinks, type ProfileSocialLink } from "@/lib/profile/social-links"

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
  /** When the account was made (ISO), the last line of their activity: "Joined Storelib". */
  joinedAt: string | null
  hasStorefront: boolean
  storefrontHandle: string
  /** The creator row behind a live store, for the products in their activity. Null otherwise. */
  creatorId: string | null
  followers: number
  following: number
  products: MemberStoreProduct[]
  productCount: number
  reviews: MemberPublicReview[]
  privacy: ProfilePrivacy
  socials: ProfileSocialLink[]
}

const memberSince = (createdAt: string | undefined) => {
  const d = new Date(createdAt || "")
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
}

async function storefrontProducts(creatorId: string): Promise<{ items: MemberStoreProduct[]; total: number }> {
  const supabase = await createClient()
  /* A product that sells a community tier is on the Communities tab, not in the grid (lib/communities/listing). */
  const { data, count, error } = await excludingCommunityProducts((exclude) => {
    let q = supabase
      .from("products")
      .select("id, title, slug, thumbnail_url, price_cents, pay_what_you_want, pwyw_min_price_cents, type", { count: "exact" })
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .neq("type", "physical")
    if (exclude) q = q.is("community_id", null)
    return q.order("created_at", { ascending: false }).limit(8)
  })
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

/**
 * Their own cover (profiles.cover_url), read with the service role so a
 * visitor sees it whether or not the column's public grant has been made
 * (lib/profile/cover.ts). Null where there is none or no column yet.
 */
export async function ownCover(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.from("profiles").select("cover_url").eq("id", userId).maybeSingle()
    if (error) return null
    const url = ((data as { cover_url?: string | null } | null)?.cover_url || "").trim()
    /* "preset:<id>" was an older idea of a cover (RUN_PROFILE_COVER_BIO.sql); only a picture is drawn. */
    return /^https:\/\//.test(url) ? url : null
  } catch {
    return null
  }
}

export const loadMemberProfile = cache(async (username: string): Promise<MemberProfileData | null> => {
  try {
  /* The exact name first, which the username index answers (lib/profile/profile-by-name.ts). */
  const profile = await publicProfileByName(await createClient(), username)
  if (!profile?.id || !profile.username) return null
  const creator = await loadCreatorForUser(profile.id)
  const storefront = hasActiveStorefront(creator) && creator?.id
  const admin = createAdminClient()
  const [counts, reviews, catalog, privacy, cover, socialRow] = await Promise.all([
    /* The follow graph is `follows`, the one the creator page and the Follow button use. */
    followCounts(admin, profile.id),
    publicReviews(profile.id),
    storefront ? storefrontProducts(creator.id) : Promise.resolve({ items: [], total: 0 }),
    readPrivacy(admin, profile.id),
    ownCover(admin, profile.id),
    (async () => {
      try {
        const { data } = await admin
          .from("profiles")
          .select("instagram_url, tiktok_url, youtube_url, twitter_url, linkedin_url, bluesky_url")
          .eq("id", profile.id)
          .maybeSingle()
        return data
      } catch {
        return null
      }
    })(),
  ])
  const handle = profile.username.toLowerCase()
  const creatorRow = creator as { cover_url?: string | null } | null
  return {
    userId: profile.id,
    name: (profile.display_name || profile.username || "").trim(),
    username: handle,
    avatarUrl: profile.avatar_url || null,
    /* Their own cover first (set in Settings), else their store's. */
    coverUrl: cover || creatorRow?.cover_url || null,
    bio: (profile.bio || "").trim() || null,
    memberSince: memberSince((profile as { created_at?: string }).created_at),
    joinedAt: (profile as { created_at?: string }).created_at || null,
    hasStorefront: !!storefront,
    storefrontHandle: handle,
    creatorId: storefront ? (creator?.id as string) : null,
    followers: counts.followers,
    following: counts.following,
    products: catalog.items,
    productCount: catalog.total,
    reviews,
    privacy,
    socials: profileSocialLinks((socialRow as Record<string, unknown> | null) ?? null),
  }
  } catch {
    return null
  }
})
