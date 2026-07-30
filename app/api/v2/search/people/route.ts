import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sanitizeSearchTerm } from "@/lib/search/sanitize-term"

/**
 * GET /api/v2/search/people?q=term&limit=8
 *
 * Seller ("people") search for the marketplace search surfaces — the People
 * section of the search dropdown and the People tab on /explore.
 *
 * Matches, in one pass:
 * - profiles.username        (GIN trigram, idx_profiles_username_trgm)
 * - profiles.display_name    (GIN trigram, idx_profiles_display_name_trgm)
 * - creators.slug            (GIN trigram, idx_creators_slug_trgm)
 * - creators.niche_tags      (array containment, single-token queries only)
 *
 * Every index above already exists (20260225_search_trigram.sql), so this needs
 * no migration and no RPC. Ranking is applied in JS over a bounded candidate
 * pool rather than in SQL, because PostgREST cannot ORDER BY an expression —
 * and the pool is capped at 60 rows, so the sort is free.
 *
 * Response items are shaped for <CreatorCard> (components/explore/creator-card.tsx)
 * so they can be rendered without any mapping, plus a `rank` for debugging:
 *
 *   { people: [{ id, slug, headline, bio, niche_tags, products_count,
 *                profile: { display_name, avatar_url, username }, rank }],
 *     total, query }
 *
 * Fails soft by design: any DB error (missing column, missing index, PostgREST
 * aggregate unsupported) degrades to fewer/no results with a 200. Search must
 * never take the page down. The only non-200 is a 400 for a missing query,
 * matching /api/v2/search.
 */

/** Hard ceiling on the returned list. */
const MAX_LIMIT = 24
const DEFAULT_LIMIT = 8

/** Longer than this is a paste, not a search. */
const MAX_QUERY_LENGTH = 100

/**
 * Shorter than this and the trigram scan is a directory dump, not a search.
 * Mirrors MIN_PEOPLE_QUERY_LENGTH in components/explore/explore-page-client.tsx —
 * that one saves a round-trip, this one is the actual guarantee.
 */
const MIN_QUERY_LENGTH = 2

/** Over-fetch so the JS ranking has something to choose between. */
const MAX_CANDIDATES = 60

/** Guards the id lists interpolated into the PostgREST `in.(...)` filter. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface ProfileEmbed {
  display_name: string | null
  avatar_url: string | null
  username: string | null
}

interface CreatorRow {
  id: string
  user_id: string | null
  slug: string | null
  headline: string | null
  bio: string | null
  niche_tags: string[] | null
  profile: ProfileEmbed | ProfileEmbed[] | null
  products?: { count: number }[] | null
}

interface PersonResult {
  id: string
  slug: string
  headline: string | null
  bio: string | null
  niche_tags: string[] | null
  products_count: number
  profile: ProfileEmbed
  rank: number
}

/** Embedded to-one relations arrive as an object, but tolerate an array too. */
function firstProfile(profile: CreatorRow["profile"]): ProfileEmbed | null {
  if (!profile) return null
  return Array.isArray(profile) ? profile[0] ?? null : profile
}

/**
 * Relevance score. Ordered by how confident the match is that this is the seller
 * the shopper meant: an exact @handle beats a prefix beats a substring.
 */
function scorePerson(person: Omit<PersonResult, "rank">, term: string): number {
  const needle = term.toLowerCase()
  const username = (person.profile.username || "").toLowerCase()
  const displayName = (person.profile.display_name || "").toLowerCase()
  const slug = (person.slug || "").toLowerCase()

  let score = 0

  if (username === needle) score = 4
  else if (displayName === needle) score = 3.5
  else if (username.startsWith(needle)) score = 3
  else if (displayName.startsWith(needle)) score = 2.5
  else if (slug.startsWith(needle)) score = 2
  // Match at any word boundary in a multi-word name ("levi" in "Vintage Levi Co").
  else if (displayName.split(/\s+/).some((word) => word.startsWith(needle))) score = 1.5
  else if (username.includes(needle) || displayName.includes(needle) || slug.includes(needle)) score = 1

  // A tag hit is corroborating evidence, never the whole story.
  if (person.niche_tags?.some((tag) => tag.toLowerCase() === needle)) score += 0.75

  // Log-scaled so a 400-listing shop can't bury an exact handle match.
  score += Math.min(Math.log10(person.products_count + 1) * 0.3, 0.6)

  // Completeness nudge — a seller with a face renders better in the dropdown.
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

  // A leading "@" is how people write a handle; scorePerson() is built around exact
  // handle matching, so "@nastees" must search for "nastees" rather than matching nothing.
  const term = sanitizeSearchTerm(query.replace(/^@+/, ""), MAX_QUERY_LENGTH)

  // Everything the user typed was punctuation — nothing to match on.
  // The minimum length is enforced here and not only in the client (see
  // MIN_PEOPLE_QUERY_LENGTH in components/explore/explore-page-client.tsx): a
  // single-character `ilike '%a%'` scans the whole seller directory, and iterating
  // a..z would otherwise enumerate it 24 rows at a time.
  if (term.length < MIN_QUERY_LENGTH) {
    return NextResponse.json({ people: [], total: 0, query })
  }

  try {
    const admin = createAdminClient()
    const pattern = `%${term}%`

    // ── Step 1: candidate discovery ──────────────────────────────────────────
    // Two independent trigram lookups, in parallel. Either may fail on its own
    // (missing column on an un-migrated database) without sinking the other.
    const creatorFilters = [`slug.ilike.${pattern}`]

    // Array containment needs `{...}` syntax; a term with a space would have to be
    // quoted inside the filter, which collides with PostgREST's own quoting. Tags
    // are single words in practice ("vintage", "denim"), so restrict it to those.
    if (!term.includes(" ")) {
      creatorFilters.push(`niche_tags.cs.{${term.toLowerCase()}}`)
    }

    const [profileMatches, creatorMatches] = await Promise.all([
      admin
        .from("profiles")
        .select("id")
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(MAX_CANDIDATES),
      admin.from("creators").select("id").or(creatorFilters.join(",")).limit(MAX_CANDIDATES),
    ])

    const userIds = ((profileMatches.data as { id: string }[] | null) || [])
      .map((row) => row.id)
      .filter((id) => UUID_RE.test(id))

    const creatorIds = ((creatorMatches.data as { id: string }[] | null) || [])
      .map((row) => row.id)
      .filter((id) => UUID_RE.test(id))

    if (userIds.length === 0 && creatorIds.length === 0) {
      return NextResponse.json({ people: [], total: 0, query })
    }

    // ── Step 2: hydrate the union ────────────────────────────────────────────
    const idFilters: string[] = []
    if (creatorIds.length > 0) idFilters.push(`id.in.(${creatorIds.join(",")})`)
    if (userIds.length > 0) idFilters.push(`user_id.in.(${userIds.join(",")})`)

    const baseSelect =
      "id, user_id, slug, headline, bio, niche_tags, profile:profiles!creators_user_id_fkey(display_name, avatar_url, username)"

    // products(count) is a PostgREST aggregate; the eq() narrows the embedded rows
    // so the count only covers live listings.
    const countedSelect = `${baseSelect}, products:products(count)`

    let rows: CreatorRow[] = []
    let hasCounts = true

    const counted = await admin
      .from("creators")
      .select(countedSelect)
      .or(idFilters.join(","))
      .eq("products.status", "published")
      .limit(MAX_CANDIDATES)

    if (counted.error) {
      // Older PostgREST without embedded aggregates — retry without the count and
      // accept that the "has at least one listing" filter can't be applied.
      hasCounts = false
      const plain = await admin
        .from("creators")
        .select(baseSelect)
        .or(idFilters.join(","))
        .limit(MAX_CANDIDATES)

      if (plain.error) {
        console.error("[v2/search/people] Hydrate failed:", plain.error.message)
        return NextResponse.json({ people: [], total: 0, query })
      }
      rows = (plain.data as unknown as CreatorRow[] | null) || []
    } else {
      rows = (counted.data as unknown as CreatorRow[] | null) || []
    }

    // ── Step 3: normalise, filter, rank ──────────────────────────────────────
    const people: PersonResult[] = []

    for (const row of rows) {
      const profile = firstProfile(row.profile)

      // /u/[username] is the only seller route, so a seller with no username has
      // nowhere to link to — CreatorCard would render a dead "#".
      if (!profile?.username) continue

      const productsCount = row.products?.[0]?.count ?? 0

      // Never surface an empty store. Only enforceable when counts came back.
      if (hasCounts && productsCount < 1) continue

      const person = {
        id: row.id,
        slug: row.slug || "",
        headline: row.headline ?? null,
        bio: row.bio ?? null,
        niche_tags: row.niche_tags ?? null,
        products_count: productsCount,
        profile: {
          display_name: profile.display_name ?? null,
          avatar_url: profile.avatar_url ?? null,
          username: profile.username,
        },
      }

      people.push({ ...person, rank: scorePerson(person, term) })
    }

    people.sort((a, b) => b.rank - a.rank || b.products_count - a.products_count)

    const results = people.slice(0, limit)

    return NextResponse.json({
      people: results,
      total: results.length,
      query,
    })
  } catch (error) {
    // Deliberately a 200: a dead people search should quietly render nothing, not
    // break the dropdown the product results are also rendering into.
    console.error("[v2/search/people] Error:", error)
    return NextResponse.json({ people: [], total: 0, query })
  }
}
