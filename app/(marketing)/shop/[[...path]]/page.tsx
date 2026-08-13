import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { CategoryResults } from "@/components/explore/category-results"
import { DEPARTMENT_NAV, groupSlug, resolveCategoryPath } from "@/lib/marketplace/department-nav"
import {
  PAGE_SIZE,
  facetsFrom,
  filtersFromParams,
  sortFromParam,
  type FeedSort,
} from "@/lib/marketplace/feed-filters"
import { categoryShortLabel, groupsForDepartment } from "@/lib/marketplace/listing-taxonomy"

/**
 * ===========================================================================
 *  THE RESULTS PAGE
 * ===========================================================================
 *
 * `/shop/women/shoes`, `/shop/women`, `/shop?q=nike`. Everything that narrows the
 * catalogue lands here: a department, a group, a search, or any combination of
 * them with filters on top.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A PAGE AND NOT THE FEED WEARING A FILTER
 * ---------------------------------------------------------------------------
 * The home feed answers "what is new". It is an endless column you flick, with
 * no count, no page number and nothing that would survive being sent to
 * somebody. A shopper who has narrowed to women's shoes under 200 lei in size
 * 38 is not browsing any more — they are looking at a RESULT, and a result needs
 * a title, a total, a way back up, and a URL that still means the same thing
 * tomorrow.
 *
 * ---------------------------------------------------------------------------
 * THE COUNT AND THE PAGE COME FROM THE DATABASE, NOT FROM THE PAGE
 * ---------------------------------------------------------------------------
 * The phone feed filters an array it already has, which is right for a hundred
 * listings and wrong for a catalogue. Here the filters are SQL and the count is
 * `{ count: "exact" }` on the same query, so "1 284 rezultate" is the number of
 * rows that match rather than the number that happen to have been fetched — and
 * page 7 is a `range()`, not a slice of something already downloaded.
 *
 * ---------------------------------------------------------------------------
 * THE FACETS ARE A SECOND, CHEAPER QUERY
 * ---------------------------------------------------------------------------
 * A filter list has to offer values that exist and say how many there are of
 * each, and neither can be answered from one page of ninety rows: the brands on
 * page 1 are not the brands in the category. So the facet query asks for the
 * five attribute columns only — no titles, no galleries, no joins — across the
 * whole category scope, and the counts are tallied here.
 *
 * It is capped at 1000 rows. Past that the counts stop being exact, and the
 * honest thing is that they are ORDERING information: the list is sorted by
 * frequency so the common answers come first, and being out by a few on the
 * tail of a long list changes nothing anybody acts on. A count that is exact on
 * a small catalogue and indicative on a large one is worth more than no count.
 */

export const dynamic = "force-dynamic"

const ATTR_COLS = "brand, size, colour, condition, category, price_cents, compare_at_cents"

const BASE_COLS =
  "id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, type, category, creator_id, created_at, sales_count, reviews_count, reviews_average"
const FULL_COLS = `${BASE_COLS}, size, size_system, condition, brand, subcategory, colour, era, source_tags, style_tags, image_variants`

type Params = Promise<{ path?: string[] }>
type Query = Promise<Record<string, string | string[] | undefined>>

function searchParamsOf(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") p.set(k, v)
    else if (Array.isArray(v) && v.length > 0) p.set(k, v[0])
  }
  return p
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Query }): Promise<Metadata> {
  const { path } = await params
  const { department, group } = resolveCategoryPath(path)
  const q = searchParamsOf(await searchParams).get("q") || ""
  const dept = department ? DEPARTMENT_NAV.find((d) => d.id === department) : null
  const groupLabel = group && department ? groupsForDepartment(department).find((g) => g.id === group) : null
  const title = q
    ? `„${q}” — Storelib`
    : groupLabel
      ? `${categoryShortLabel(groupLabel)} · ${dept?.label} second-hand — Storelib`
      : dept
        ? `${dept.label} second-hand — Storelib`
        : "Toate anunțurile — Storelib"
  return {
    title,
    // A filtered or paged view is the same catalogue in a different order, and
    // indexing every combination of five filters is how a marketplace gets
    // thousands of near-duplicate pages in an index. The unfiltered department
    // and group pages are the ones worth having.
    robots: q || [...searchParamsOf(await searchParams).keys()].some((k) => k !== "q") ? { index: false, follow: true } : undefined,
  }
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: Query }) {
  const { path } = await params
  const { department, group: pathGroup } = resolveCategoryPath(path)
  const sp = searchParamsOf(await searchParams)

  const q = (sp.get("q") || "").trim()
  const sort: FeedSort = sortFromParam(sp.get("sort"))
  const page = Math.max(1, Number(sp.get("page")) || 1)

  const deptGroups = department ? groupsForDepartment(department).map((g) => g.id) : []
  const filters = filtersFromParams(sp, deptGroups)
  // The path wins over the query string: `/shop/women/shoes?group=women-bags` is a
  // URL that disagrees with itself, and the part somebody can read is the path.
  const group = pathGroup ?? filters.group
  const effective = { ...filters, group }

  let rows: any[] = []
  let total = 0
  let facets = facetsFrom([], department)

  try {
    const supabase = await createClient()

    /** Everything both queries share: the scope, before the page. */
    const scoped = (select: string, opts?: { count: "exact" }) => {
      let s = supabase.from("products").select(select, opts as any).eq("status", "published")
      if (group) s = s.eq("category", group)
      else if (deptGroups.length > 0) s = s.in("category", deptGroups)
      if (q) s = s.or(`title.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%`)
      /**
       * BRANDS MATCH CASE-INSENSITIVELY, and `.in()` does not.
       *
       * `brand` is free text somebody typed into the sell form, so a catalogue
       * reliably holds Nike, nike and NIKE. The facet list folds those into one
       * option showing the commonest spelling — so an `.in("brand", ["Nike"])`
       * would return the count's worth of rows minus every listing that spelled
       * it differently, and the page would disagree with the number printed on
       * its own filter. `ilike` with no wildcard is an exact case-insensitive
       * match, which is the same test `applyFeedFilters` runs on the client.
       *
       * `JSON.stringify` is the quoting: PostgREST's `or=()` is comma-separated,
       * and "New Balance" needs its space and any comma inside double quotes.
       */
      if (effective.brands.length > 0) {
        s = s.or(effective.brands.map((b) => `brand.ilike.${JSON.stringify(b)}`).join(","))
      }
      if (effective.sizes.length > 0) s = s.in("size", effective.sizes)
      if (effective.colours.length > 0) s = s.in("colour", effective.colours)
      if (effective.conditions.length > 0) s = s.in("condition", effective.conditions)
      if (effective.minPrice != null) s = s.gte("price_cents", effective.minPrice * 100)
      if (effective.maxPrice != null) s = s.lte("price_cents", effective.maxPrice * 100)
      return s
    }

    const ordered = (s: any) => {
      switch (sort) {
        case "price-asc":
          return s.order("price_cents", { ascending: true })
        case "price-desc":
          return s.order("price_cents", { ascending: false })
        case "popular":
          return s.order("sales_count", { ascending: false }).order("reviews_count", { ascending: false })
        default:
          return s.order("created_at", { ascending: false })
      }
    }

    const from = (page - 1) * PAGE_SIZE
    const { data, count, error } = await ordered(scoped(FULL_COLS, { count: "exact" })).range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows = (data as any[]) ?? []
    total = count ?? rows.length

    // The facet query drops every filter it is itself offering, so the options
    // do not collapse to the ones already chosen — a Brand list that only offers
    // the brand you picked is a dead end you have to undo to escape.
    let fq = supabase.from("products").select(ATTR_COLS).eq("status", "published")
    if (group) fq = fq.eq("category", group)
    else if (deptGroups.length > 0) fq = fq.in("category", deptGroups)
    if (q) fq = fq.or(`title.ilike.%${q}%,description.ilike.%${q}%,brand.ilike.%${q}%`)
    const { data: attrs } = await fq.limit(1000)
    facets = facetsFrom((attrs as any[]) ?? [], department)

    // ON SALE is applied here rather than in SQL. It is a comparison between two
    // columns — `compare_at_cents > price_cents` — which PostgREST cannot express
    // in a filter, and a stored generated column for it would be a migration for
    // one checkbox. Applied after the page is fetched it can only ever REMOVE
    // rows, so the count is corrected with it rather than left lying.
    if (effective.onSale) {
      const before = rows.length
      rows = rows.filter((r) => Number(r?.compare_at_cents ?? 0) > Number(r?.price_cents ?? 0))
      total = total - (before - rows.length)
    }

    if (rows.length > 0) {
      const creatorIds = [...new Set(rows.map((r) => r.creator_id).filter(Boolean))]
      if (creatorIds.length > 0) {
        const { data: creators } = await supabase
          .from("creators")
          .select("id, user_id, slug, niche_tags")
          .in("id", creatorIds)
        const userIds = (creators ?? []).map((c: any) => c.user_id).filter(Boolean)
        const { data: profiles } = userIds.length
          ? await supabase.from("profiles").select("id, display_name, avatar_url, username").in("id", userIds)
          : { data: [] as any[] }
        const byCreator = new Map((creators ?? []).map((c: any) => [c.id, c]))
        const byUser = new Map((profiles ?? []).map((p: any) => [p.id, p]))
        rows = rows.map((r) => {
          const c = byCreator.get(r.creator_id)
          const p = c ? byUser.get(c.user_id) : null
          return { ...r, creator: c ? { ...c, profile: p ?? null } : null }
        })
      }
    }
  } catch (e) {
    console.error("[CategoryPage]", e)
  }

  return (
    <main className="min-h-screen bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <CategoryResults
        departmentId={department}
        groupId={group}
        query={q}
        products={rows}
        total={total}
        page={page}
        sort={sort}
        filters={effective}
        facets={facets}
        basePath={department ? (pathGroup ? `/shop/${department}/${groupSlug(pathGroup)}` : `/shop/${department}`) : "/shop"}
      />
    </main>
  )
}
