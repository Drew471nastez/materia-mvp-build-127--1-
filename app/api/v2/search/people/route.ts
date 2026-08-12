import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/v2/search/people?q=term&limit=8
 *
 * ===========================================================================
 *  PEOPLE SEARCH, AND WHY IT USED TO FIND ALMOST NOBODY
 * ===========================================================================
 *
 * Typing a member's name into the Persoane tab returned an empty panel for most
 * of the people on this marketplace, and the reason was structural rather than
 * a bug in the matching: the query started from `creators`.
 *
 *   const [profileMatches, creatorMatches] = …          // find ids
 *   admin.from("creators").select(…).or(idFilters)      // ← hydrate from HERE
 *
 * A `creators` row is a SELLER record. It is written by the seller onboarding
 * and by /api/listings on somebody's first listing, so anybody who has never
 * listed anything does not have one — which on a second-hand marketplace is
 * most accounts, including every buyer, every new sign-up and everybody who
 * came to browse. They matched in step one, had no row to hydrate in step two,
 * and vanished.
 *
 * Then this, on the rows that did survive:
 *
 *   if (hasCounts && productsCount < 1) continue        // "never surface an
 *                                                       //  empty store"
 *
 * Correct for a directory of shops. Wrong for a search box whose tab is called
 * PEOPLE: somebody looking up a name is looking for a person, and answering
 * "they do not exist" because that person has not published anything this week
 * is the search lying about the database.
 *
 * ---------------------------------------------------------------------------
 * SO IT STARTS FROM `profiles`
 * ---------------------------------------------------------------------------
 * A profile is what a member IS on this product — it is what /member/<handle>
 * renders, what a username addresses, and the only row every account has. The
 * creators row is now a JOIN for decoration (how many listings, what they have
 * sold, how they were rated) rather than the thing being searched, and a member
 * without one simply has zeroes.
 *
 * `username IS NOT NULL` is the one exclusion left, and it is not a policy: a
 * member with no handle has no address to link to, and a row that navigates
 * nowhere is worse than a row that is not there.
 *
 * ---------------------------------------------------------------------------
 * AND THE ROWS CARRY A SCORE
 * ---------------------------------------------------------------------------
 * ⭐ 4,9 · 63 vândute, batched — two `in()` queries over the page that is
 * actually being returned, never one per row. It is the same pair of numbers
 * lib/profile/seller-stats.ts computes for a profile, and the same rules: null
 * for unrated, zero for never-sold, and the component draws neither.
 *
 * Fails soft by design: any database error degrades to fewer or no results with
 * a 200. Search must never take the page down. The only non-200 is a 400 for a
 * missing query, matching /api/v2/search.
 */

/** Hard ceiling on the returned list. */
const MAX_LIMIT = 24
const DEFAULT_LIMIT = 8

/** Longer than this is a paste, not a search. */
const MAX_QUERY_LENGTH = 100

/** Over-fetch so the JS ranking has something to choose between. */
const MAX_CANDIDATES = 60

/** Guards the id lists interpolated into the PostgREST `in.(...)` filter. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ProfileRow {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface PersonResult {
  /** The auth user id. Stable, and what every other endpoint keys people by. */
  id: string
  /** Kept for callers that still read it; the handle is the real address. */
  slug: string
  headline: null
  bio: null
  niche_tags: null
  products_count: number
  sold_count: number
  rating: number | null
  reviews_count: number
  profile: { display_name: string | null; avatar_url: string | null; username: string }
  rank: number
}

/**
 * Strip characters that are grammar in a PostgREST filter (`,` `.` `(` `)` `:`
 * `"` `*`) or wildcards in a LIKE pattern (`%`, and the `\` escape). Replaced
 * with a space rather than removed so "st. john" still matches "St. John".
 *
 * `_` is deliberately kept: it is a single-character LIKE wildcard, so it can
 * only ever widen the match (usernames legitimately contain it) and carries no
 * injection risk. Values are URL-encoded by supabase-js and parameterised by
 * PostgREST — this is defence against a broken filter, not against SQL.
 */
function sanitizeTerm(raw: string): string {
  return raw
    .slice(0, MAX_QUERY_LENGTH)
    .replace(/[%\\]/g, " ")
    .replace(/[,().:"*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Relevance. Ordered by how confident the match is that this is the person the
 * shopper meant: an exact @handle beats a prefix beats a substring.
 */
function scorePerson(person: Omit<PersonResult, "rank">, term: string): number {
  const needle = term.toLowerCase()
  const username = (person.profile.username || "").toLowerCase()
  const displayName = (person.profile.display_name || "").toLowerCase()

  let score = 0

  if (username === needle) score = 4
  else if (displayName === needle) score = 3.5
  else if (username.startsWith(needle)) score = 3
  else if (displayName.startsWith(needle)) score = 2.5
  // Match at any word boundary in a multi-word name ("levi" in "Vintage Levi Co").
  else if (displayName.split(/\s+/).some((word) => word.startsWith(needle))) score = 1.5
  else if (username.includes(needle) || displayName.includes(needle)) score = 1

  // Being an active seller is a TIE-BREAK, never a gate. Log-scaled so a shop
  // with four hundred listings cannot bury an exact handle match, and small
  // enough that it can only ever reorder people who matched equally well.
  score += Math.min(Math.log10(person.products_count + 1) * 0.3, 0.6)
  score += Math.min(Math.log10(person.sold_count + 1) * 0.2, 0.4)

  // Completeness nudge — a member with a face renders better in the dropdown.
  if (person.profile.avatar_url) score += 0.15

  return score
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get("q") || "").trim()
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || DEFAULT_LIMIT, 1), MAX_LIMIT)

  if (!query) {
    return NextResponse.json({ error: "Missing search query" }, { status: 400 })
  }

  const term = sanitizeTerm(query)

  // Everything the user typed was punctuation — nothing to match on.
  if (!term) {
    return NextResponse.json({ people: [], total: 0, query })
  }

  try {
    const admin = createAdminClient()
    const pattern = `%${term}%`

    // ── Step 1: the people ───────────────────────────────────────────────────
    // One table, and it is the one every account has a row in. `not.is.null` on
    // the handle rather than a filter applied afterwards, so the candidate pool
    // is 60 LINKABLE members instead of 60 rows some of which are discarded.
    const { data: profileRows, error } = await admin
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
      .not("username", "is", null)
      .limit(MAX_CANDIDATES)

    if (error) {
      console.error("[v2/search/people] profiles lookup failed:", error.message)
      return NextResponse.json({ people: [], total: 0, query })
    }

    const profiles = ((profileRows as ProfileRow[] | null) || []).filter(
      (row) => row.username && UUID_RE.test(row.id),
    )
    if (profiles.length === 0) {
      return NextResponse.json({ people: [], total: 0, query })
    }

    const userIds = profiles.map((p) => p.id)

    // ── Step 2: what each of them sells, in one pass ─────────────────────────
    // Every creator row per user — an account can hold more than one, which is
    // the trap lib/profile/listings.ts documents at length — then every product
    // for all of those creators at once. Two queries for the whole page rather
    // than two per person.
    const listed = new Map<string, number>()
    const sold = new Map<string, number>()
    const creatorToUser = new Map<string, string>()

    const { data: creatorRows } = await admin
      .from("creators")
      .select("id, user_id")
      .in("user_id", userIds)

    for (const row of (creatorRows as { id: string; user_id: string | null }[] | null) ?? []) {
      if (row.id && row.user_id) creatorToUser.set(row.id, row.user_id)
    }

    if (creatorToUser.size > 0) {
      const { data: productRows } = await admin
        .from("products")
        .select("creator_id, status")
        .in("creator_id", [...creatorToUser.keys()])
        .in("status", ["published", "sold"])
        .limit(5000)

      for (const row of (productRows as { creator_id: string; status: string }[] | null) ?? []) {
        const owner = creatorToUser.get(row.creator_id)
        if (!owner) continue
        if (row.status === "sold") sold.set(owner, (sold.get(owner) ?? 0) + 1)
        else listed.set(owner, (listed.get(owner) ?? 0) + 1)
      }
    }

    // ── Step 3: how they were rated, also in one pass ────────────────────────
    const ratingSum = new Map<string, number>()
    const ratingCount = new Map<string, number>()

    if (creatorToUser.size > 0) {
      const { data: reviewRows } = await admin
        .from("reviews")
        .select("creator_id, rating")
        .in("creator_id", [...creatorToUser.keys()])
        .limit(5000)

      for (const row of (reviewRows as { creator_id: string; rating: unknown }[] | null) ?? []) {
        const owner = creatorToUser.get(row.creator_id)
        const value = Number(row.rating)
        // A null, a zero or an unparseable value is not a review anybody left.
        if (!owner || !Number.isFinite(value) || value <= 0) continue
        ratingSum.set(owner, (ratingSum.get(owner) ?? 0) + value)
        ratingCount.set(owner, (ratingCount.get(owner) ?? 0) + 1)
      }
    }

    // ── Step 4: rank ─────────────────────────────────────────────────────────
    const people: PersonResult[] = profiles.map((row) => {
      const reviews = ratingCount.get(row.id) ?? 0
      const person = {
        id: row.id,
        slug: row.username as string,
        headline: null,
        bio: null,
        niche_tags: null,
        products_count: listed.get(row.id) ?? 0,
        sold_count: sold.get(row.id) ?? 0,
        // null rather than 0 for "nobody has rated them" — the difference the
        // whole score component is built on. See seller-score.tsx.
        rating: reviews > 0 ? Math.min(5, Math.max(0, (ratingSum.get(row.id) ?? 0) / reviews)) : null,
        reviews_count: reviews,
        profile: {
          display_name: row.display_name ?? null,
          avatar_url: row.avatar_url ?? null,
          username: row.username as string,
        },
      }
      return { ...person, rank: scorePerson(person, term) }
    })

    people.sort((a, b) => b.rank - a.rank || b.sold_count - a.sold_count || b.products_count - a.products_count)

    const results = people.slice(0, limit)

    return NextResponse.json({ people: results, total: results.length, query })
  } catch (error) {
    // Deliberately a 200: a dead people search should quietly render nothing,
    // not break the dropdown the product results are also rendering into.
    console.error("[v2/search/people] Error:", error)
    return NextResponse.json({ people: [], total: 0, query })
  }
}
