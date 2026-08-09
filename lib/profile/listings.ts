import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

/**
 * What somebody has for sale, for the two pages that show a seller's shelf.
 *
 * /profile and /member/[username] each had their own copy of this query, and
 * both copies had the same two faults. One is why a listing that had definitely
 * been posted did not appear on its own owner's profile at all — no error, no
 * empty-state explanation, just the "nothing listed" screen over a shelf that
 * was not empty.
 *
 * ---------------------------------------------------------------------------
 * FAULT ONE: `.maybeSingle()` on the creators row
 * ---------------------------------------------------------------------------
 * Both pages resolved the seller with
 * `from("creators").select("id").eq("user_id", …).maybeSingle()`.
 *
 * `maybeSingle()` means "zero or one, and anything else is an error" — so an
 * account with TWO creator rows gets `{ data: null, error }` rather than a row.
 * Both pages then read only `data`, saw null, concluded the person had never
 * sold anything, and skipped the product query entirely. Nothing was logged,
 * because nothing looked at the error.
 *
 * And two rows is not exotic here. Listings hang off a creators row, and there
 * are two places that will create one for you: the seller onboarding, and
 * /api/listings, which makes one on your first listing so nobody has to "become
 * a seller" as a separate step. Any account that has been through both — anyone
 * who used the dashboard before the marketplace form existed — can hold two,
 * and the listing is attached to whichever one was current when it was written.
 *
 * So every creator row for the account is read, and the products query matches
 * ANY of them. One row behaves exactly as before; several stop being a silent
 * failure; none still means an empty shelf, which is the honest answer for a
 * buyer who has never listed anything.
 *
 * ---------------------------------------------------------------------------
 * FAULT TWO: filtering a seller's own shelf by an internal type constant
 * ---------------------------------------------------------------------------
 * Both copies also had `.eq("type", "physical")`. That is the marketplace's
 * kind, and it is right for a marketplace FEED — but a person's own shelf is
 * everything they are selling, and a listing written by any path that did not
 * set that exact string was invisible with no way to find out why. A filter
 * whose failure mode is "your item does not exist" needs a better reason than
 * tidiness, and there is not one: whatever is published under your name belongs
 * on your page.
 */

type Admin = ReturnType<typeof createAdminClient>

export type SellerListingRow = {
  id: string
  title: string
  slug: string
  price_cents: number | null
  compare_at_cents: number | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  type: string | null
  category: string | null
  created_at: string | null
  /** 'published' or 'archived'. Only your own shelf ever sees the second. */
  status?: string | null
  size?: string | null
  size_system?: string | null
  brand?: string | null
  condition?: string | null
}

const BASE_COLS =
  "id, title, slug, price_cents, compare_at_cents, thumbnail_url, gallery_urls, type, category, created_at, status"

/** Resale attributes only exist after 20260730_marketplace_physical_attributes. */
const ATTR_COLS = `${BASE_COLS}, size, size_system, brand, condition`

export async function readSellerListings({
  admin,
  userId,
  limit,
  includeArchived = false,
}: {
  admin: Admin
  /** The auth user whose shelf this is — NOT a creators id. */
  userId: string
  limit: number
  /**
   * Your OWN profile, and nowhere else.
   *
   * Archiving takes a listing off the feed, and the profile is the only place
   * left that could show it to you — so without this, archiving something is
   * losing it: no screen anywhere lists it, and the only control that could
   * put it back lives on a page you can no longer reach. A visitor still sees
   * published listings and nothing else.
   */
  includeArchived?: boolean
}): Promise<{ rows: SellerListingRow[]; count: number }> {
  // Every creator row this account holds, not "the" one. See above.
  const { data: creators } = await admin.from("creators").select("id").eq("user_id", userId)
  const creatorIds = (creators ?? []).map((c) => (c as { id: string }).id).filter(Boolean)
  if (creatorIds.length === 0) return { rows: [], count: 0 }

  const run = (cols: string) =>
    admin
      .from("products")
      .select(cols, { count: "exact" })
      .in("creator_id", creatorIds)
      .in("status", includeArchived ? ["published", "archived"] : ["published"])
      .order("created_at", { ascending: false })
      .limit(limit)

  const withAttrs = await run(ATTR_COLS)
  if (!withAttrs.error) {
    const rows = (withAttrs.data ?? []) as unknown as SellerListingRow[]
    return { rows, count: withAttrs.count ?? rows.length }
  }

  // The attribute columns are not in this database yet — the grid renders
  // without size and brand badges rather than not at all.
  const base = await run(BASE_COLS)
  if (base.error) {
    console.error("[profile/listings] products query failed:", base.error.message)
    return { rows: [], count: 0 }
  }
  const rows = (base.data ?? []) as unknown as SellerListingRow[]
  return { rows, count: base.count ?? rows.length }
}
