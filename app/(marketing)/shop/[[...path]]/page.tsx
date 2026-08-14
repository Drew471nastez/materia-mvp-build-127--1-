import type { Metadata } from "next"

import { createClient } from "@/lib/supabase/server"
import { CategoryResults } from "@/components/explore/category-results"
import { DEPARTMENT_NAV, categoryPath, groupSlug, resolveCategoryPath } from "@/lib/marketplace/department-nav"
import {
  PAGE_SIZE,
  dropSuggestions,
  facetsFrom,
  facetsWithCounts,
  facetsWithVocabulary,
  filtersFromParams,
  sortFromParam,
  type DropSuggestion,
  type FeedSort,
} from "@/lib/marketplace/feed-filters"
import { categoryShortLabel, groupsForDepartment } from "@/lib/marketplace/listing-taxonomy"
import {
  matchModesFor,
  relaxedTermFor,
  safeTerm,
  searchTokens,
  textFilterGroups,
  type MatchMode,
} from "@/lib/marketplace/search-terms"

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

/**
 * The search term itself is tokenised and widened in
 * lib/marketplace/search-terms.ts — read the header there for what `q` becomes
 * and for why every value that reaches a PostgREST filter is quoted AND
 * stripped first. `safeTerm` is imported from it and used on this page for the
 * same reason: `?q=%` must be no search rather than a full catalogue scan.
 */

/** A quoted exact-but-case-insensitive match, for values chosen from a facet
 *  list — which still arrive through the URL and are still not to be trusted. */
function ilikeExact(column: string, raw: string): string {
  return `${column}.ilike."${safeTerm(raw)}"`
}

/** The three text columns a query is matched against, in weight order. */
const SEARCH_COLS = ["title", "description", "brand"]


const ATTR_COLS = "brand, size, colour, condition, category, price_cents, compare_at_cents"
// `is_on_sale` is not selected: it is a filter, never a displayed value, and
// selecting a column that may not exist yet would break the fallback below.

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
  const sp = searchParamsOf(await searchParams)
  const q = sp.get("q") || ""
  const dept = department ? DEPARTMENT_NAV.find((d) => d.id === department) : null
  const groupLabel = group && department ? groupsForDepartment(department).find((g) => g.id === group) : null
  // The leaf, when the URL names one — "Rochii · Femei" reads better as a tab
  // and as a shared link than "Haine · Femei" does for a page of dresses.
  const subLabel = groupLabel?.items.find((i) => i.id === safeTerm(sp.get("sub") || ""))?.label ?? null
  const title = q
    ? `„${q}” — Storelib`
    : subLabel && groupLabel
      ? `${subLabel} · ${dept?.label} second-hand — Storelib`
      : groupLabel
      ? `${categoryShortLabel(groupLabel)} · ${dept?.label} second-hand — Storelib`
      : dept
        ? `${dept.label} second-hand — Storelib`
        : "Toate anunțurile — Storelib"
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE THIRTY-SEVEN PAGES WORTH INDEXING, AND NOT ONE MORE
   * ═════════════════════════════════════════════════════════════════════════
   *
   * `/shop/women` and `/shop/women/shoes` are real pages about real things —
   * five departments and thirty-seven groups, each with its own title,
   * description and canonical URL. Those are what a search engine should have.
   *
   * EVERYTHING ELSE IS THE SAME CATALOGUE IN A DIFFERENT ORDER. A filter, a
   * sort, a page number or a query produces a page whose content is a subset of
   * one already indexed — and five multi-select facets times four sorts times
   * the pages is a combinatorial number of near-duplicates, which is how a
   * marketplace ends up with its own pages competing with each other.
   *
   * `follow: true` on all of them, because the LISTINGS behind a filter are
   * worth reaching even when the filtered view is not: a crawler that follows a
   * noindex page still walks its links.
   *
   * And a canonical on every one of them pointing at the clean path, so the
   * signal is not only "do not index this" but "the page this is a view of is
   * over there".
   */
  // `sp` from above, not a second await: `params` is already the route's own
  // prop name and shadowing it here is how this stopped compiling.
  const narrowed = q.length > 0 || [...sp.keys()].length > 0
  const canonical = `https://storelib.com${
    department ? (groupLabel ? `/shop/${department}/${groupSlug(groupLabel.id)}` : `/shop/${department}`) : "/shop"
  }`

  return {
    title,
    description: groupLabel
      ? `${categoryShortLabel(groupLabel)} second-hand de la vânzători reali. Cumpără și vinde ${dept?.label?.toLowerCase()} pe Storelib.`
      : dept
        ? `${dept.label} second-hand pe Storelib — mii de articole de la oameni din toată țara.`
        : "Toate anunțurile de pe Storelib: modă, sneakers, cărți, muzică și obiecte de colecție second-hand.",
    alternates: { canonical },
    robots: narrowed ? { index: false, follow: true } : undefined,
  }
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: Query }) {
  const { path } = await params
  const { department, group: pathGroup } = resolveCategoryPath(path)
  const sp = searchParamsOf(await searchParams)

  // `safeTerm` here as well as at the filter, so an all-punctuation query —
  // `?q=%` sanitises to nothing — is treated as NO search rather than as a
  // search for the empty string, which is `ilike "%%"` and matches the whole
  // catalogue. The title and the count then say "Toate anunțurile" honestly.
  const q = safeTerm(sp.get("q") || "")
  const sort: FeedSort = sortFromParam(sp.get("sort"))
  /**
   * A CEILING ON THE PAGE NUMBER, because `page` becomes an OFFSET.
   *
   * `?page=99999999` is `range(8999999910, …)` — a query Postgres will happily
   * try, reading and discarding nine billion rows to return none. It is one
   * URL, it needs no account, and it can be requested in a loop.
   *
   * 500 is far past anything a person reaches: forty-five thousand listings
   * deep, at ninety a page. Past that it is a crawler or a script, and both are
   * better served by the last real page than by a timeout.
   */
  const page = Math.min(500, Math.max(1, Number(sp.get("page")) || 1))

  const deptGroups = department ? groupsForDepartment(department).map((g) => g.id) : []
  const filters = filtersFromParams(sp, deptGroups)
  // The path wins over the query string: `/shop/women/shoes?group=women-bags` is a
  // URL that disagrees with itself, and the part somebody can read is the path.
  const group = pathGroup ?? filters.group
  const effective = { ...filters, group }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE THIRD LEVEL — Femei › Haine › Rochii
   * ═════════════════════════════════════════════════════════════════════════
   *
   * The taxonomy has always had it: every group holds the actual kinds of thing
   * (`women-clothing` → Tricouri, Rochii, Blugi…), it is what the sell form asks
   * for, and it is stored on every listing as `subcategory`. Nothing browsed it,
   * so the finest thing anybody could reach was "Femei · Haine" — three hundred
   * listings of which four are the dresses they came for.
   *
   * A QUERY PARAMETER RATHER THAN A FOURTH PATH SEGMENT, deliberately. The
   * thirty-seven group pages are the ones worth indexing (see generateMetadata);
   * three hundred leaf pages are three hundred near-duplicates of them competing
   * for the same terms. `?sub=` is `noindex, follow` like every other narrowing,
   * and it is exactly as linkable.
   *
   * VALIDATED AGAINST THE GROUP IT ARRIVED WITH, not merely sanitised. `?sub=`
   * of something that is not one of this group's items resolves to nothing at
   * all, so a stale or hand-typed URL widens to the group rather than showing an
   * empty page under a heading naming a category that does not exist.
   */
  const rawSub = safeTerm(sp.get("sub") || "")
  const subItem =
    group && department
      ? groupsForDepartment(department)
          .find((g) => g.id === group)
          ?.items.find((i) => i.id === rawSub) ?? null
      : null
  const sub = subItem?.id ?? null

  let rows: any[] = []
  let total = 0
  let facets = facetsWithVocabulary(facetsFrom([], department), null)
  /** Whether `is_on_sale` exists — see the note where it is used. */
  let withSale = true
  let saleIsExact = true
  /** Which single filter to drop when nothing matched — see dropSuggestions. */
  let escapes: DropSuggestion[] = []

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A QUERY THAT MATCHED NOTHING IS NOT AN ANSWER, IT IS A DEAD END
   * ═════════════════════════════════════════════════════════════════════════
   *
   * The words are asked for strictly first and then more loosely, one tier at a
   * time, and the page stops at the first tier that has anything in it — so a
   * good query keeps its precise answer and a misspelt or over-specified one
   * still lands somewhere. See lib/marketplace/search-terms.ts for the tiers.
   *
   * WIDENED ON THE COUNT, NOT ON THE PAGE. `rows.length === 0` is also true of
   * page 9 of an 8-page result, and relaxing the filter there would answer a
   * stale bookmark by silently searching for something else.
   */
  const tokens = searchTokens(q)
  const modes = q ? matchModesFor(tokens) : []
  let matchMode: MatchMode = modes[0] ?? "all"
  /** Set only when a WIDER tier than the first was the one that answered. */
  let relaxed: { mode: "any" | "fuzzy"; term: string } | null = null

  try {
    const supabase = await createClient()

    /** Everything both queries share: the scope, before the page. */
    const scoped = (select: string, mode: MatchMode, opts?: { count: "exact" }) => {
      let s = supabase.from("products").select(select, opts as any).eq("status", "published")
      if (group) s = s.eq("category", group)
      else if (deptGroups.length > 0) s = s.in("category", deptGroups)
      if (sub) s = s.eq("subcategory", sub)
      // One `.or()` per group, and PostgREST ANDs them — which is what makes
      // "every word appears, in any order" expressible at all. See
      // textFilterGroups.
      for (const g of textFilterGroups(SEARCH_COLS, tokens, mode)) s = s.or(g)
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
       * `ilikeExact` does the quoting AND the stripping — see `safeTerm`.
       * `JSON.stringify` was doing half of it: it quotes, but it escapes an
       * embedded quote as `\"`, which PostgREST does not read as an escape —
       * so a brand with a quote in it ended the quoting early.
       */
      if (effective.brands.length > 0) {
        s = s.or(effective.brands.map((b) => ilikeExact("brand", b)).join(","))
      }
      if (effective.sizes.length > 0) s = s.in("size", effective.sizes)
      if (effective.colours.length > 0) s = s.in("colour", effective.colours)
      if (effective.conditions.length > 0) s = s.in("condition", effective.conditions)
      if (effective.minPrice != null) s = s.gte("price_cents", effective.minPrice * 100)
      if (effective.maxPrice != null) s = s.lte("price_cents", effective.maxPrice * 100)
      /**
       * ON SALE IS A COLUMN NOW, AND IT HAD TO BECOME ONE.
       *
       * It is `compare_at_cents > price_cents` — a comparison between two
       * columns, which PostgREST cannot express — so it used to be applied to
       * the rows AFTER they came back. That quietly broke pagination: page 1
       * fetched ninety rows and filtered them to twelve, page 2 fetched the next
       * ninety and filtered those, and the total was the real count minus only
       * what this page happened to drop. The pager then offered ninety pages of
       * almost-empty results, and no two of them agreed about how many there
       * were.
       *
       * `is_on_sale` is a STORED generated column (see
       * supabase/sql/RUN_SHOP_INDEXES.sql), so the filter is one indexed
       * equality and the count is exact again.
       *
       * `withSale` is false only on the retry below, which runs when the column
       * is not there yet — the same additive-migration pattern the feed uses for
       * its resale columns, so a deploy that lands before the SQL is run is a
       * marketplace with one filter degraded rather than a page that 500s.
       */
      if (effective.onSale && withSale) s = s.eq("is_on_sale", true)
      return s
    }

    /**
     * EVERY SORT ENDS ON `id`, AND THAT IS NOT TIDINESS.
     *
     * `ORDER BY price_cents` is not a total order — a catalogue full of listings
     * at 50 lei has hundreds of rows the database may return in any order it
     * likes, and it is free to choose a DIFFERENT one for the query that fetches
     * rows 0-89 and the query that fetches rows 90-179. A row that moves across
     * that boundary is shown twice or not at all, and nothing on the page says
     * so: it looks like the catalogue has a duplicate in it.
     *
     * The same is true of `created_at` (bulk imports share a timestamp) and of
     * `sales_count` (0 for most of a young catalogue). `id` is unique, so
     * appending it makes every one of these a total order and pagination
     * correct by construction rather than by luck.
     */
    const ordered = (s: any) => {
      switch (sort) {
        case "price-asc":
          return s.order("price_cents", { ascending: true }).order("id", { ascending: true })
        case "price-desc":
          return s.order("price_cents", { ascending: false }).order("id", { ascending: true })
        case "popular":
          // `created_at`, not `reviews_count`, as the second key — because
          // idx_products_published_category_sales is (category, sales_count
          // DESC, created_at DESC) and a query whose second key is a different
          // column cannot use it past the first. The index was written for this
          // sort; the sort had drifted off it. Reviews are a ranking signal on
          // the home page, where they are weighed against a count; here they
          // were a tie-break worth less than the index they cost.
          return s
            .order("sales_count", { ascending: false })
            .order("created_at", { ascending: false })
            .order("id", { ascending: true })
        default:
          return s.order("created_at", { ascending: false }).order("id", { ascending: true })
      }
    }

    const from = (page - 1) * PAGE_SIZE
    const runPage = (mode: MatchMode) =>
      ordered(scoped(FULL_COLS, mode, { count: "exact" })).range(from, from + PAGE_SIZE - 1)

    let res = await runPage(matchMode)
    if (res.error && effective.onSale && withSale) {
      // The column is not there yet. Drop it from the query and fall back to
      // filtering the page — worse, and honest about being worse: `saleIsExact`
      // is what tells the page not to print a count it cannot stand behind.
      withSale = false
      saleIsExact = false
      res = await runPage(matchMode)
    }
    if (res.error) throw res.error

    // Widen, one tier at a time, only while the catalogue's answer is nothing
    // at all. At most two extra round trips, and only on a query that was about
    // to show an empty page — which is the one case where a second query is
    // cheaper than the visit it saves.
    for (let i = 1; i < modes.length && (res.count ?? 0) === 0; i++) {
      const next = await runPage(modes[i])
      if (next.error) break
      res = next
      matchMode = modes[i]
      if (matchMode !== modes[0] && (matchMode === "any" || matchMode === "fuzzy")) {
        relaxed = { mode: matchMode, term: relaxedTermFor(tokens, matchMode) }
      }
    }
    // A widening that found nothing either is not worth mentioning: the page
    // would say "showing results for X" above no results.
    if ((res.count ?? 0) === 0) relaxed = null

    rows = (res.data as any[]) ?? []
    total = res.count ?? rows.length
    if (effective.onSale && !withSale) {
      rows = rows.filter((r) => Number(r?.compare_at_cents ?? 0) > Number(r?.price_cents ?? 0))
    }

    /**
     * THE FACET QUERY APPLIES THE FILTERS THAT ARE NOT FACETS, and no others.
     *
     * The scope, the search, the price band and on-sale go into SQL: none of
     * them is a list this page offers, so applying them can never hide an option
     * from its own list. The four facet lists — brand, size, colour, condition —
     * are deliberately NOT applied here, because each of them has to be counted
     * with the other three applied but not itself. That cross-filtering is done
     * over the rows in `facetsWithCounts`: five passes over a thousand rows
     * rather than five round trips.
     *
     * Counting them without any cross-filter, which is what this did, meant that
     * after picking Nike the Size list still offered every size in the
     * department — including the eleven no Nike listing has. Each of those was a
     * tap that emptied the page, under a count that was the reason somebody
     * trusted it.
     */
    let fq = supabase.from("products").select(ATTR_COLS).eq("status", "published")
    if (group) fq = fq.eq("category", group)
    else if (deptGroups.length > 0) fq = fq.in("category", deptGroups)
    if (sub) fq = fq.eq("subcategory", sub)
    // The SAME tier the grid was answered with, so the facet counts describe
    // the rows on the page rather than a stricter set that returned nothing.
    for (const g of textFilterGroups(SEARCH_COLS, tokens, matchMode)) fq = fq.or(g)
    if (effective.minPrice != null) fq = fq.gte("price_cents", effective.minPrice * 100)
    if (effective.maxPrice != null) fq = fq.lte("price_cents", effective.maxPrice * 100)
    if (effective.onSale && withSale) fq = fq.eq("is_on_sale", true)
    const { data: attrs } = await fq.limit(1000)
    let attrRows = (attrs as any[]) ?? []
    if (effective.onSale && !withSale) {
      attrRows = attrRows.filter((r) => Number(r?.compare_at_cents ?? 0) > Number(r?.price_cents ?? 0))
    }
    facets = facetsWithVocabulary(facetsWithCounts(attrRows, department, effective), group)

    /**
     * ═══════════════════════════════════════════════════════════════════════
     *  THE ESCAPES NEED ROWS THE PRICE HAS NOT ALREADY REMOVED
     * ═══════════════════════════════════════════════════════════════════════
     *
     * This ran over `attrRows`, and `attrRows` comes from a query with the price
     * band and on-sale ALREADY APPLIED. So "how many if I drop the price" was
     * being asked of rows from which the price had removed everything — the
     * answer was always zero, the suggestion was never offered, and the one
     * filter most likely to be the problem was the one this feature could not
     * name. A page reading "0 rezultate" under a 4–6 RON chip offered nothing
     * but "Șterge filtrele".
     *
     * A SECOND QUERY RATHER THAN WIDENING THE FIRST. The facet counts are better
     * for having the price applied in SQL — the thousand-row cap then covers a
     * thousand rows that are actually in the band — and this runs only when the
     * page is empty, which is the one moment a third round trip is cheaper than
     * the visit it saves.
     */
    if (rows.length === 0) {
      let eq = supabase.from("products").select(ATTR_COLS).eq("status", "published")
      if (group) eq = eq.eq("category", group)
      else if (deptGroups.length > 0) eq = eq.in("category", deptGroups)
      if (sub) eq = eq.eq("subcategory", sub)
      for (const g of textFilterGroups(SEARCH_COLS, tokens, matchMode)) eq = eq.or(g)
      const { data: escapeRows } = await eq.limit(1000)
      escapes = dropSuggestions((escapeRows as any[]) ?? [], effective, facets)
    }

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

  /**
   * A PAGE NUMBER PAST THE END IS NOT AN ERROR, it is a stale link — somebody
   * bookmarked page 7 of a category that has since sold down to three pages.
   * The pager is told the real page count, so it highlights the last page that
   * exists rather than printing a 7 nothing can reach.
   */
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // The same test generateMetadata uses to decide `robots`, so the markup and
  // the meta tag can never disagree about whether this page is for a crawler.
  const indexable = !q && [...sp.keys()].length === 0
  const deptNav = department ? DEPARTMENT_NAV.find((d) => d.id === department) ?? null : null

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE TWO THINGS A SEARCH ENGINE WANTS FROM A CATEGORY PAGE
   * ═════════════════════════════════════════════════════════════════════════
   *
   * BreadcrumbList is what turns a result into "storelib.com › Femei ›
   * Încălțăminte" instead of a bare URL — it is the difference between a link
   * that says where it goes and one that says where it lives, and every
   * marketplace that ranks for category terms emits it.
   *
   * ItemList is the page's own contents, in the page's own order, with prices
   * and availability on each. It is what lets a listing appear as a product
   * rather than as a line of text, and it is the reason the numbers on the page
   * and the numbers in the markup have to be the SAME numbers — so both are
   * built from `rows`, which is what was rendered, rather than from a second
   * query that could disagree with it.
   *
   * Only on the pages that are indexed. A filtered or paged view is `noindex`
   * (see generateMetadata), and structured data on a page asking not to be
   * indexed is markup nobody will ever read.
   */
  const trail = [
    { name: "Acasă", url: "https://storelib.com/" },
    ...(deptNav ? [{ name: deptNav.label, url: `https://storelib.com${categoryPath(deptNav.id)}` }] : []),
    ...(deptNav && group
      ? [
          {
            name: deptNav.subcategories.find((x) => x.id === group)?.label ?? "",
            url: `https://storelib.com${categoryPath(deptNav.id, group)}`,
          },
        ]
      : []),
  ]

  const jsonLd = indexable
    ? {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "BreadcrumbList",
            itemListElement: trail.map((t, i) => ({
              "@type": "ListItem",
              position: i + 1,
              name: t.name,
              item: t.url,
            })),
          },
          {
            "@type": "ItemList",
            numberOfItems: total,
            itemListElement: rows.slice(0, 30).map((r, i) => ({
              "@type": "ListItem",
              position: (page - 1) * PAGE_SIZE + i + 1,
              item: {
                "@type": "Product",
                name: r.title,
                url: `https://storelib.com/products/${r.slug}`,
                ...(r.thumbnail_url ? { image: r.thumbnail_url } : null),
                ...(r.brand ? { brand: { "@type": "Brand", name: r.brand } } : null),
                offers: {
                  "@type": "Offer",
                  price: (Number(r.price_cents ?? 0) / 100).toFixed(2),
                  priceCurrency: "RON",
                  availability: "https://schema.org/InStock",
                  itemCondition: "https://schema.org/UsedCondition",
                },
              },
            })),
          },
        ],
      }
    : null

  return (
    <main className="min-h-screen bg-white" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <CategoryResults
        departmentId={department}
        groupId={group}
        sub={sub}
        subLabel={subItem?.label ?? null}
        relaxed={relaxed}
        query={q}
        products={rows}
        total={total}
        exactTotal={saleIsExact}
        escapes={escapes}
        page={Math.min(page, lastPage)}
        sort={sort}
        filters={effective}
        facets={facets}
        basePath={department ? (pathGroup ? `/shop/${department}/${groupSlug(pathGroup)}` : `/shop/${department}`) : "/shop"}
      />
    </main>
  )
}
