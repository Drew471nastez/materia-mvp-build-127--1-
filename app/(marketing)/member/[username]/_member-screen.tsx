import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { MemberProfile, type MemberListing } from "@/components/member/member-profile"
import { readProfileRow } from "@/lib/profile/read"
import { readSellerListings } from "@/lib/profile/listings"
import { readSellerStats } from "@/lib/profile/seller-stats"

/**
 * ===========================================================================
 *  THE MARKETPLACE SELLER PROFILE — /member/[username] AND ITS TABS
 * ===========================================================================
 *
 * Distinct from /u/[username], which is the DIGITAL creator storefront with its
 * store-builder theming. This is the second-hand marketplace view: who the
 * seller is plus their published physical listings, wearing the site's own
 * chrome (header, topbar, bottom nav) from the marketing layout.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SCREEN IS A MODULE AND NOT A page.tsx
 * ---------------------------------------------------------------------------
 * The shelf has tabs, and a tab you cannot link to is a tab that does not exist
 * as far as the rest of the product is concerned — the bookmark in the header
 * has nowhere to point, a share of "my saved things" is a share of the profile,
 * and the back button after a switch takes you off the page instead of back to
 * the tab you were on. So Salvate has an ADDRESS: /member/<handle>/saved.
 *
 * Two routes, one screen. Every read below — the profile row, the listings, the
 * saves, the follower counts, the rename history — is identical for both, and a
 * second copy of two hundred lines of it would be two pages that drift within a
 * release. The route files are four lines each and this is the page.
 *
 * Reads go through the admin client: a profile and its published listings are
 * public data, and RLS policies written for owners would otherwise hide them
 * from an anonymous buyer.
 */

/** Seen within this many minutes counts as online — matches /api/follows/people. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000

/** 96 divides evenly by every column count (2 / 3 / 4), so a full page never
 *  ends on a ragged row. The header still shows the exact total. */
const MAX_LISTINGS = 96

/**
 * The title and description, shared by both routes.
 *
 * The canonical is always the bare profile, including from /saved. That tab is
 * signed-in-and-yours only — an anonymous crawler is redirected off it — so it
 * has no public content of its own to be the canonical FOR, and two URLs
 * claiming to be the same profile is two things for a crawler to index.
 */
export async function memberMetadata(username: string): Promise<Metadata> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from("profiles")
    .select("username, display_name")
    .ilike("username", username)
    .maybeSingle()

  if (!profile) return { title: "Membru negăsit" }

  const name = profile.display_name || profile.username || "Membru"
  return {
    title: `${name} (@${profile.username}) — Storelib`,
    description: `Vezi articolele scoase la vânzare de ${name} pe Storelib.`,
    alternates: { canonical: `https://storelib.com/member/${profile.username}` },
  }
}

export async function MemberScreen({
  username,
  /** Which tab the URL asked for. `/saved` is the only one with an address. */
  initialTab = "listings",
}: {
  username: string
  initialTab?: "listings" | "saved"
}) {
  const admin = createAdminClient()

  // profiles.last_seen_at ships with 20260731_presence.sql — retry without it
  // so the page still renders (minus the dot) on a database that hasn't been
  // migrated yet, the same fallback /api/follows/people performs.
  // `profiles` has three optional columns added by three different migrations,
  // and a select naming an absent one fails the whole query. readProfileRow
  // drops exactly the missing one and keeps the rest — see lib/profile/read.ts
  // for why that is not the same as falling back to the base columns.
  const { row: profile, present } = await readProfileRow(
    // ilike, matching /u/[username]: usernames are stored lowercase but links
    // arrive in whatever case someone typed them.
    (cols) => admin.from("profiles").select(cols).ilike("username", username).maybeSingle(),
  )
  const presenceKnown = present.has("last_seen_at")

  /**
   * NO PROFILE HERE — BUT THIS ADDRESS MAY HAVE BEEN SOMEBODY'S.
   *
   * A handle is where a seller's listings are linked from and where anybody who
   * bookmarked them comes back to, so a rename that 404s every one of those
   * links is the reason most products refuse to let people rename at all. The
   * old handle is recorded when it is released (see the PATCH route) and this
   * is the other half: an address that used to be yours still finds you.
   *
   * Checked ONLY after the live lookup fails, which is what makes it safe for a
   * released handle to be claimed by somebody else — the new owner's profile is
   * found first and this never runs.
   *
   * `redirect` rather than rendering the profile at the old address: two URLs
   * serving one profile is two things for a crawler to index and two "share"
   * buttons producing different links. Temporary rather than permanent, because
   * a 308 is cached by browsers indefinitely and the handle can be released
   * again — a permanent redirect to an address that later becomes somebody
   * else's is unfixable from the server.
   *
   * Wrapped, because the table arrives with a migration: until it has run the
   * query errors and this must degrade to the 404 it always was.
   */
  if (!profile) {
    let movedTo: string | null = null
    try {
      const { data: past } = await admin
        .from("profile_username_history")
        .select("user_id")
        .eq("username_lower", username.toLowerCase())
        .maybeSingle()
      if (past?.user_id) {
        const { data: now } = await admin
          .from("profiles")
          .select("username")
          .eq("id", past.user_id)
          .maybeSingle()
        if (now?.username && now.username.toLowerCase() !== username.toLowerCase()) {
          movedTo = now.username
        }
      }
    } catch {
      /* no history table yet — the 404 below is the behaviour that shipped */
    }
    if (movedTo) redirect(`/member/${encodeURIComponent(movedTo)}`)
    notFound()
  }

  // Every published listing this member holds, however it was created and
  // whichever creator row it hangs off. Both were assumptions this page made
  // silently, and one of them could hide a shelf entirely — see
  // lib/profile/listings.ts.
  const { rows, count: listingsCount } = await readSellerListings({
    admin,
    userId: profile.id,
    limit: MAX_LISTINGS,
  })

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

  // A stale-or-missing timestamp is simply offline; null means the column
  // itself is absent, which the client reads as "draw no dot at all".
  const seen = profile.last_seen_at ? Date.parse(profile.last_seen_at) : NaN
  const online = presenceKnown ? (Number.isFinite(seen) ? Date.now() - seen < ONLINE_WINDOW_MS : false) : null

  // The social shape of the profile — how many follow them, how many they
  // follow. head:true counts cost the database an index scan and the wire
  // nothing, and both run alongside each other.
  const [followersRes, followingRes, stats] = await Promise.all([
    admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile.id),
    admin.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile.id),
    /**
     * THE RATING AND THE SALES COUNT, ON THE SERVER.
     *
     * This page used to pass neither, so the stars were fetched by the client
     * once the header was already on screen — the one thing on the profile that
     * arrived after the profile did, and a layout shift on every visit to every
     * seller. /profile has always counted them server-side; this is the same
     * read, shared, so the two pages cannot disagree about somebody's score.
     *
     * Alongside the follower counts rather than after them: three independent
     * counts against ids already in hand.
     */
    readSellerStats({ admin, userId: profile.id }),
  ])

  /**
   * IS THIS ADDRESS YOU?
   *
   * /member/<handle> is a public page and /profile is the private one, but they
   * render the SAME component and the same person can arrive at either — from a
   * share link they sent themselves, from a search result, from their own bio.
   * Without this the screen treated that as somebody else: a Follow button
   * pointing at your own account, owner-only marks on your own listings absent,
   * and — the reason this was added — no Salvate tab, because a wishlist is only
   * ever drawn for the person it belongs to.
   *
   * The reads above stay on the admin client: a profile and its published
   * listings are public data and must render identically for an anonymous
   * visitor. This is the one question that needs the SESSION, and it is asked
   * after them so a signed-out visitor pays nothing for it beyond a cookie read.
   *
   * Wrapped, because a missing or expired session is the normal state of this
   * page rather than a failure, and it must never be able to 500 a public
   * profile.
   */
  let isOwner = false
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    isOwner = !!user && user.id === profile.id
  } catch {
    /* signed out, or no auth cookie — the public view is the correct fallback */
  }

  /**
   * /saved BELONGS TO ONE PERSON, AND THE URL IS NOT A PERMISSION.
   *
   * Anybody can type /member/zarrabianco/saved. What they must not get is a
   * page: the tab draws the READER'S wishlist (see saved-shelf.tsx), so served
   * to a visitor it would show them their own saved items under somebody else's
   * name, and served to nobody it would be a blank tab on a public profile.
   *
   * A redirect rather than a 404, because the address is not wrong — it is a
   * real profile with a tab that is not theirs to see, and the profile is what
   * they were asking for. Signed out lands here too and lands on the profile,
   * which is the honest answer to "show me somebody's saved things".
   */
  if (initialTab === "saved" && !isOwner) {
    redirect(`/member/${encodeURIComponent(profile.username || username)}`)
  }

  return (
    <MemberProfile
      isOwner={isOwner}
      initialTab={initialTab}
      member={{
        id: profile.id,
        username: profile.username || username,
        displayName: profile.display_name || null,
        avatarUrl: profile.avatar_url || null,
        joinedAt: profile.created_at || null,
        online,
        bio: profile.bio ?? null,
        coverUrl: profile.cover_url ?? null,
        verified: profile.is_verified ?? false,
        staff: profile.is_staff ?? false,
      }}
      listingsCount={listingsCount}
      followersCount={followersRes.count ?? 0}
      followingCount={followingRes.count ?? 0}
      listings={listings}
      // `null` and `undefined` mean different things to MemberProfile: undefined
      // is "nobody has counted, go and ask", null is "counted, there are none".
      // Passing null is what stops the client hook firing at all.
      reviews={stats.rating === null ? null : { average: stats.rating, count: stats.reviews }}
      soldCount={stats.sold}
    />
  )
}
