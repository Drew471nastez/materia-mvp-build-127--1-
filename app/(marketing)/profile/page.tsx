import type { Metadata } from "next"
import Link from "next/link"
import { UserRound } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readProfileRow } from "@/lib/profile/read"
import { MemberProfile, type MemberListing, type ReviewsSummary } from "@/components/member/member-profile"

/**
 * /profile — your own profile, and the destination of the Profile tab.
 *
 * That tab used to point at /settings, which redirected anyone without a
 * `creators` row straight into onboarding: every buyer who had never listed
 * anything tapped Profile and got thrown out of the app. Nothing on this page
 * requires a creator row. A buyer with none sees their profile with an empty
 * shelf, which is the truth about them, not an error.
 *
 * The screen itself is MemberProfile — the exact component /member/[username]
 * renders for everyone else — passed `isOwner`. Two profile screens would drift
 * apart within a release; one cannot.
 */

// Your own listings and follower counts must reflect the listing you published
// thirty seconds ago, so nothing here may be cached.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Profilul meu | Storelib",
  // Signed-in-only and personal — there is nothing here for a crawler.
  robots: { index: false, follow: false },
}

/** Matches /member/[username]: 96 divides evenly by 2, 3 and 4 columns, so a
 *  full page never ends on a ragged row. The header shows the exact total. */
const MAX_LISTINGS = 96

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return <SignedOut />

  // Reads go through the admin client for the same reason /member/[username]
  // does: the profile-and-listings query is written once, for public data, and
  // owner-scoped RLS policies would only make the two pages diverge.
  const admin = createAdminClient()

  // Both keyed off the same id we already hold from the session, so neither
  // waits on the other. They were in series, which on a page the account tab
  // opens meant paying two round trips before the first query even mattered.
  //
  // A creators row is what listings hang off. Its absence is the normal state
  // of a buyer, not a failure — it just means the shelf below is empty.
  const [{ row: profile }, { data: creator }] = await Promise.all([
    readProfileRow((cols) => admin.from("profiles").select(cols).eq("id", user.id).maybeSingle()),
    admin.from("creators").select("id").eq("user_id", user.id).maybeSingle(),
  ])

  const BASE_COLS =
    "id, title, slug, price_cents, compare_at_cents, thumbnail_url, gallery_urls, type, category, created_at"

  let rows: any[] = []
  let listingsCount = 0
  if (creator) {
    // Resale attributes only exist after 20260730_marketplace_physical_attributes;
    // fall back so the grid still renders (without size/brand badges) if that
    // migration hasn't run — the same retry /member/[username] performs.
    const withAttrs = await admin
      .from("products")
      .select(`${BASE_COLS}, size, size_system, brand, condition`, { count: "exact" })
      .eq("creator_id", creator.id)
      .eq("type", "physical")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(MAX_LISTINGS)
    if (withAttrs.error) {
      const base = await admin
        .from("products")
        .select(BASE_COLS, { count: "exact" })
        .eq("creator_id", creator.id)
        .eq("type", "physical")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(MAX_LISTINGS)
      rows = base.data || []
      listingsCount = base.count ?? rows.length
    } else {
      rows = withAttrs.data || []
      listingsCount = withAttrs.count ?? rows.length
    }
  }

  // Total saves per listing in one pass — there is no saves_count column, the
  // number is counted from wishlist rows exactly like the feeds do.
  const saves = new Map<string, number>()
  if (rows.length > 0) {
    try {
      const { data: saveRows } = await admin
        .from("wishlist_items")
        .select("product_id")
        .in(
          "product_id",
          rows.map((r) => r.id),
        )
        .limit(50000)
      for (const row of saveRows || []) {
        const pid = (row as any).product_id
        if (pid) saves.set(pid, (saves.get(pid) || 0) + 1)
      }
    } catch {
      // Counts are decoration; the grid renders without them.
    }
  }

  const listings: MemberListing[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    price_cents: r.price_cents ?? 0,
    compare_at_cents: r.compare_at_cents ?? null,
    thumbnail_url: r.thumbnail_url ?? null,
    gallery_urls: Array.isArray(r.gallery_urls) ? r.gallery_urls : null,
    type: r.type || "physical",
    category: r.category ?? null,
    size: r.size ?? null,
    size_system: r.size_system ?? null,
    brand: r.brand ?? null,
    condition: r.condition ?? null,
    saves_count: saves.get(r.id) || 0,
    created_at: r.created_at ?? null,
  }))

  const [followersRes, followingRes, reviews] = await Promise.all([
    admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", user.id),
    admin.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", user.id),
    // The stars used to be fetched by the client, once the header was already
    // on screen — the one thing on this page that arrived after the page did.
    // Counted here it is simply part of the first paint, and MemberProfile
    // makes no request at all.
    loadReviewsSummary(admin, creator?.id ?? null),
  ])

  // A brand-new account can reach this page before its profiles row is written,
  // so every identity field falls back to the auth user rather than blanking the
  // header or throwing.
  const emailHandle = user.email?.split("@")[0] || null

  // No entry animation here on purpose. The loading shell is what appears first
  // on this route and it is what animates; by the time this replaces it the
  // screen is already in place, and animating again would be the same arrival
  // played twice for one navigation.
  //
  // Rendered straight into <main> with no wrapper: the profile sizes itself
  // with `min-h-full`, and a plain div in between has no height of its own for
  // that percentage to resolve against — it would silently collapse to nothing
  // and the empty state would stop filling the screen.
  return (
    <MemberProfile
      isOwner
      member={{
        id: user.id,
        username: profile?.username || emailHandle || "eu",
        displayName: profile?.display_name || user.user_metadata?.display_name || null,
        avatarUrl: profile?.avatar_url || user.user_metadata?.avatar_url || null,
        joinedAt: profile?.created_at || user.created_at || null,
        bio: profile?.bio ?? null,
        coverUrl: profile?.cover_url ?? null,
        // null draws no presence dot at all. Telling you that you are online is
        // the one thing the dot can never be useful for.
        online: null,
      }}
      listingsCount={listingsCount}
      followersCount={followersRes.count ?? 0}
      followingCount={followingRes.count ?? 0}
      listings={listings}
      reviews={reviews}
    />
  )
}

/**
 * Average stars and how many, or null when there is nothing to say yet.
 *
 * Reviews hang off the creators row, not off the auth user, so a buyer who has
 * never listed anything has no creator id and therefore no reviews — that is
 * the normal case here, and it costs no query at all. Everything else is
 * best-effort: the strip is decoration, and a profile must never fail to render
 * because a ratings table did.
 */
async function loadReviewsSummary(
  admin: ReturnType<typeof createAdminClient>,
  creatorId: string | null,
): Promise<ReviewsSummary | null> {
  if (!creatorId) return null
  try {
    const { data, error } = await admin.from("reviews").select("rating").eq("creator_id", creatorId).limit(2000)
    if (error || !data?.length) return null
    const ratings = data.map((r: any) => Number(r?.rating)).filter((n) => Number.isFinite(n) && n > 0)
    if (!ratings.length) return null
    const average = ratings.reduce((a, b) => a + b, 0) / ratings.length
    return { average: Math.min(5, Math.max(0, average)), count: ratings.length }
  } catch {
    return null
  }
}

/**
 * The signed-out state, in the inbox's own empty-screen language — same circle,
 * same measure, same purple pill — because a visitor who taps Profile and a
 * visitor who taps Messages are hitting the same wall and should meet the same
 * screen. `next` carries them back here the moment they are in.
 */
function SignedOut() {
  return (
    <div className="mx-auto flex min-h-[60svh] max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
        <UserRound className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-semibold text-neutral-900">Conectează-te pentru profilul tău</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-neutral-500">
        Articolele tale, urmăritorii și setările contului apar aici după ce te conectezi.
      </p>
      <Link
        href="/login?next=/profile"
        className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[#7c3aed] px-6 text-[15px] font-semibold text-white transition-transform active:scale-[0.97]"
      >
        Conectează-te
      </Link>
    </div>
  )
}
