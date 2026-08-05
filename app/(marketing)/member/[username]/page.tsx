import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { createAdminClient } from "@/lib/supabase/admin"
import { MemberProfile, type MemberListing } from "@/components/member/member-profile"
import { readProfileRow } from "@/lib/profile/read"

/**
 * /member/[username] — the marketplace seller profile a buyer lands on.
 *
 * Distinct from /u/[username], which is the DIGITAL creator storefront with its
 * store-builder theming. This page is the second-hand marketplace view: who the
 * seller is plus their published physical listings, wearing the site's own
 * chrome (header, topbar, bottom nav) from the marketing layout.
 *
 * Reads go through the admin client: a profile and its published listings are
 * public data, and RLS policies written for owners would otherwise hide them
 * from an anonymous buyer.
 */

// Presence and listings must reflect right now, not a cached render.
export const dynamic = "force-dynamic"

/** Seen within this many minutes counts as online — matches /api/follows/people. */
const ONLINE_WINDOW_MS = 5 * 60 * 1000

/** 96 divides evenly by every column count (2 / 3 / 4), so a full page never
 *  ends on a ragged row. The header still shows the exact total. */
const MAX_LISTINGS = 96

interface MemberPageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: MemberPageProps): Promise<Metadata> {
  const { username } = await params
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

export default async function MemberPage({ params }: MemberPageProps) {
  const { username } = await params
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

  if (!profile) notFound()

  // A follow points at a person; listings hang off their creator row. A member
  // without one simply has nothing for sale yet — that renders, not 404s.
  const { data: creator } = await admin
    .from("creators")
    .select("id")
    .eq("user_id", profile.id)
    .maybeSingle()

  const BASE_COLS =
    "id, title, slug, price_cents, compare_at_cents, thumbnail_url, gallery_urls, type, category, created_at"

  let rows: any[] = []
  let listingsCount = 0
  if (creator) {
    // Resale attributes only exist after 20260730_marketplace_physical_attributes;
    // fall back so the grid still renders (without size/brand badges) if that
    // migration hasn't run. `count: "exact"` rides along on the same request so
    // the header total is right even when the grid itself is capped.
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

  // A stale-or-missing timestamp is simply offline; null means the column
  // itself is absent, which the client reads as "draw no dot at all".
  const seen = profile.last_seen_at ? Date.parse(profile.last_seen_at) : NaN
  const online = presenceKnown ? (Number.isFinite(seen) ? Date.now() - seen < ONLINE_WINDOW_MS : false) : null

  // The social shape of the profile — how many follow them, how many they
  // follow. head:true counts cost the database an index scan and the wire
  // nothing, and both run alongside each other.
  const [followersRes, followingRes] = await Promise.all([
    admin.from("follows").select("follower_id", { count: "exact", head: true }).eq("following_id", profile.id),
    admin.from("follows").select("following_id", { count: "exact", head: true }).eq("follower_id", profile.id),
  ])

  return (
    <MemberProfile
      member={{
        id: profile.id,
        username: profile.username || username,
        displayName: profile.display_name || null,
        avatarUrl: profile.avatar_url || null,
        joinedAt: profile.created_at || null,
        online,
        bio: profile.bio ?? null,
        coverUrl: profile.cover_url ?? null,
      }}
      listingsCount={listingsCount}
      followersCount={followersRes.count ?? 0}
      followingCount={followingRes.count ?? 0}
      listings={listings}
    />
  )
}
