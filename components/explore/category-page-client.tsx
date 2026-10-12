"use client"

/**
 * ===========================================================================
 *  A CATEGORY PAGE, BUILT FROM EXPLORE'S PARTS
 * ===========================================================================
 * /explore/design and the rest had grown their own of everything Explore had
 * already replaced: violet subcategory pills with a "Show all" that opened a
 * centred modal of chips on a computer and a sheet of chips on a phone, a
 * Layers icon for that sheet, a search behind a magnifier button, a grid or
 * compact toggle, a filters dropdown with Reset and Apply and a violet tick,
 * and an "Active:" row repeating all of it under the pills.
 *
 * Now it is Explore's frame (./category-frame, which the loading screen draws
 * too):
 *
 *   the heading, its line and a search inside the category
 *
 *   one row of pills scrolling sideways under a fade: the category's own
 *   pill ("Design", with a chevron), then All and every subcategory; the one
 *   that is on is pressed
 *
 *   the category's pill opens Explore's category list
 *   (./explore-category-picker): a panel under the pill on a computer, the
 *   shared draggable sheet on a phone, a category's subcategories as a level
 *   of their own
 *
 *   Explore's Filters (./explore-filters): the order and the price, applied
 *   as they are chosen
 *
 * THE ADDRESSES DID NOT CHANGE. A subcategory is `?sub=<id>` on the
 * category's own page, pressing it again or pressing All goes back to the
 * page without it, and a category picked from the list is that category's
 * page (lib/marketplace/categories categoryPath).
 */

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"
import { categoryPath, normalizeCategoryToId } from "@/lib/marketplace/categories"
import { matchesSubcategory, subcategoryTerms } from "@/lib/explore/subcategory-match"
import { exploreDocumentReturn, exploreReturning, useExploreScrollRestore, useExploreScrollRestoring } from "@/lib/explore/use-explore-scroll"
import { readExploreEntryState, writeExploreEntryState } from "@/lib/explore/entry-state"
import { useEntranceOnChange } from "@/lib/ui/use-entrance-on-change"
import { cn } from "@/lib/utils"
import { ProductCard } from "./product-card"
import { ExploreCategoryPicker } from "./explore-category-picker"
import { ExploreFilters, SORT_OPTIONS } from "./explore-filters"
import {
  CATEGORY_GROUPS,
  CategoryControls,
  CategoryHero,
  FILTERS_BUTTON,
  FILTERS_REST,
  PICKER_PILL,
  PILL_HOVER,
  PILL_LIVE,
  PILL_OFF,
  PILL_ON,
  PickerPillFace,
  categoryInfo,
  validSub,
} from "./category-frame"

/*
  NEWEST IS THIS PAGE'S OWN ORDER. The route reads the catalogue newest
  first and has no ranking of its own, so Explore's Recommended would be a
  second name for the same list. The other four are Explore's.
*/
const CATEGORY_SORTS = SORT_OPTIONS.filter((o) => o.id !== "recommended")
const DEFAULT_SORT = "newest"

const PRODUCTS_PER_PAGE = 15

/** What a category's list was showing, kept per visit (lib/explore/entry-state). */
const CATEGORY_LIST_STATE = "category-list"
interface CategoryListState {
  page: number
  sort: string
  price: string
  query: string
}

/** The list kept for the visit on screen, when there is one and it reads as one. */
function keptList(): CategoryListState | null {
  const v = readExploreEntryState<Partial<CategoryListState>>(CATEGORY_LIST_STATE)
  if (!v || typeof v !== "object") return null
  const page = typeof v.page === "number" && Number.isFinite(v.page) && v.page >= 1 ? Math.floor(v.page) : 1
  return {
    page,
    sort: typeof v.sort === "string" && CATEGORY_SORTS.some((o) => o.id === v.sort) ? v.sort : DEFAULT_SORT,
    price: typeof v.price === "string" ? v.price : "all",
    query: typeof v.query === "string" ? v.query : "",
  }
}

interface CategoryPageClientProps {
  initialProducts: any[]
  category: string
  categoryLabel: string
  initialSubcategory?: string
}

export function CategoryPageClient({
  initialProducts,
  category,
  categoryLabel,
  initialSubcategory,
}: CategoryPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const info = useMemo(() => {
    const i = categoryInfo(category)
    return { ...i, label: categoryLabel || i.label }
  }, [category, categoryLabel])
  const subcategories = info.subcategories

  /*
    THE LIST AS IT WAS LEFT, ON THE WAY BACK (round 25). The page, the order, the price and the words typed into this page's
    own field live in state, not in the address, so Back from a product opened on page three came to page one with the scroll
    put back over it. They are kept with the visit (lib/explore/entry-state) and read again on a Back or Forward: in the first
    render for a client navigation, so the first frame is the list as it was; from a layout effect, before the first paint,
    for a document the browser loaded again (never while hydrating, which must match the server's HTML).
  */
  const [kept] = useState<CategoryListState | null>(() => (exploreReturning() ? keptList() : null))
  const [priceFilter, setPriceFilter] = useState<string>(kept?.price ?? "all")
  const [sortBy, setSortBy] = useState<string>(kept?.sort ?? DEFAULT_SORT)
  /* The list follows a choice deferred, as Explore's does, so the tap in the
     filters is answered before the grid is rebuilt. */
  const deferredPrice = useDeferredValue(priceFilter)
  const deferredSort = useDeferredValue(sortBy)
  const [sub, setSub] = useState<string | null>(() => validSub(info, initialSubcategory))
  const [query, setQuery] = useState(kept?.query ?? "")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(kept?.page ?? 1)
  const sectionRef = useRef<HTMLElement>(null)
  /* The choices the list was last drawn for: a change to them starts the list at its first page, a list put back does not. */
  const listChoices = `${sub ?? ""}|${priceFilter}|${sortBy}|${query}`
  const drawnChoices = useRef(listChoices)

  useLayoutEffect(() => {
    if (kept || !exploreDocumentReturn()) return
    const was = keptList()
    if (!was) return
    drawnChoices.current = `${sub ?? ""}|${was.price}|${was.sort}|${was.query}`
    setPriceFilter(was.price)
    setSortBy(was.sort)
    setQuery(was.query)
    setCurrentPage(was.page)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    writeExploreEntryState(CATEGORY_LIST_STATE, { page: currentPage, sort: sortBy, price: priceFilter, query } satisfies CategoryListState)
  }, [currentPage, sortBy, priceFilter, query])

  useExploreScrollRestore()
  const restoringExploreScroll = useExploreScrollRestoring()

  // Store back-label so product pages can show "< Design" / "< Marketing" etc.
  useEffect(() => {
    try { sessionStorage.setItem("backPageName", categoryLabel) } catch { /* ignore */ }
  }, [categoryLabel])

  /* The address leads when it changes on its own (back, forward, a link).
     Keyed on the value, not the object, which is new on every render. */
  const subParam = searchParams?.get("sub") ?? null
  const firstParam = useRef(true)
  useEffect(() => {
    if (firstParam.current) { firstParam.current = false; return }
    setSub(validSub(info, subParam))
  }, [subParam, info])

  useEffect(() => {
    if (drawnChoices.current === listChoices) return
    drawnChoices.current = listChoices
    setCurrentPage(1)
  }, [listChoices])

  /* Pressing the pill that is on takes it off, as it always has. */
  const pickSub = useCallback((next: string | null) => {
    const target = next !== null && next === sub ? null : next
    setSub(target)
    router.push(categoryPath(category, target), { scroll: false })
  }, [category, router, sub])

  const pickFromList = useCallback((groupId: string, itemId: string | null) => {
    if (groupId === "all") { router.push("/explore"); return }
    if (groupId === category) {
      setSub(itemId)
      router.push(categoryPath(category, itemId), { scroll: false })
      return
    }
    router.push(categoryPath(groupId, itemId))
  }, [category, router])

  const subTerms = useMemo(() => {
    const s = subcategories.find((x) => x.id === sub)
    return s ? subcategoryTerms(s.id, s.label) : []
  }, [sub, subcategories])

  const filteredProducts = useMemo(() => {
    let products = [...initialProducts]

    if (category === "freebies") {
      products = products.filter((p) => p.price_cents === 0)
    } else {
      products = products.filter((p) => {
        if (normalizeCategoryToId(p.category || p.categoryName || "") === category) return true
        const creatorTags = p.creator?.niche_tags?.map((t: string) => normalizeCategoryToId(t)) || []
        return creatorTags.includes(category)
      })
    }

    if (subTerms.length) products = products.filter((p) => matchesSubcategory(p, subTerms))

    const q = query.trim().toLowerCase()
    if (q) {
      products = products.filter((p) => p.title?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
    }

    switch (deferredPrice) {
      case "free":
        products = products.filter((p) => p.price_cents === 0)
        break
      case "under-10":
        products = products.filter((p) => p.price_cents > 0 && p.price_cents < 1000)
        break
      case "10-50":
        products = products.filter((p) => p.price_cents >= 1000 && p.price_cents <= 5000)
        break
      case "50-plus":
        products = products.filter((p) => p.price_cents > 5000)
        break
    }

    switch (deferredSort) {
      case "popular":
        products = products.sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
        break
      case "price-low":
        products = products.sort((a, b) => (a.price_cents || 0) - (b.price_cents || 0))
        break
      case "price-high":
        products = products.sort((a, b) => (b.price_cents || 0) - (a.price_cents || 0))
        break
      case "newest":
      default:
        products = products.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        break
    }

    return products
  }, [initialProducts, category, subTerms, query, deferredPrice, deferredSort])

  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE)
  /* A page kept from before that the list no longer reaches (fewer products now) is its last page, never an empty one. */
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) setCurrentPage(totalPages)
  }, [currentPage, totalPages])
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE
    return filteredProducts.slice(start, start + PRODUCTS_PER_PAGE)
  }, [filteredProducts, currentPage])

  /* The pager takes you to the top of the new page, under the pills, as Explore's does. */
  const goToPage = useCallback((page: number) => {
    const next = Math.max(1, Math.min(totalPages, page))
    if (next === currentPage) return
    setCurrentPage(next)
    const el = sectionRef.current
    if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 96), behavior: "smooth" })
  }, [currentPage, totalPages])

  /* The grid's entrance is for a filter the visitor changed, not for arriving
     on the page, and arriving includes coming back from a product. The token
     is the same string the element already uses as its key. */
  const categoryGridToken = `products-${category}-${sub ?? ""}-${deferredPrice}-${deferredSort}-${query}-${currentPage}`
  const categoryGridEntrance = useEntranceOnChange(
    categoryGridToken,
    "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
  )

  const activeFilterCount = (priceFilter !== "all" ? 1 : 0) + (sortBy !== DEFAULT_SORT ? 1 : 0)
  const resetFilters = useCallback(() => {
    setPriceFilter("all")
    setSortBy(DEFAULT_SORT)
  }, [])

  const subLabel = subcategories.find((s) => s.id === sub)?.label ?? null
  const title = subLabel || info.label

  return (
    <div className="space-y-8">
      <CategoryHero title={title} description={info.description} query={query} onQueryChange={setQuery} />

      <section ref={sectionRef} className="mt-2">
        <CategoryControls
          info={info}
          sub={sub}
          onPick={pickSub}
          picker={
            <ExploreCategoryPicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              groups={CATEGORY_GROUPS}
              selectedGroup={category}
              selectedItem={sub}
              allRow={{ id: "all", label: "All categories" }}
              onPick={pickFromList}
              triggerClassName={cn(PICKER_PILL, PILL_LIVE, pickerOpen ? PILL_ON : cn(PILL_OFF, PILL_HOVER))}
            >
              <PickerPillFace label={info.label} />
            </ExploreCategoryPicker>
          }
          filters={
            <ExploreFilters
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
              sortOptions={CATEGORY_SORTS}
              sortBy={sortBy}
              setSortBy={setSortBy}
              priceFilter={priceFilter}
              setPriceFilter={setPriceFilter}
              activeCount={activeFilterCount}
              onClear={resetFilters}
              resultCount={filteredProducts.length}
              triggerClassName={cn(
                FILTERS_BUTTON,
                "outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 transition-[background-color,border-color,color,box-shadow] duration-150 cursor-pointer",
                filtersOpen || activeFilterCount > 0
                  ? "bg-neutral-200 text-[#1a1a2e] border-neutral-300 shadow-[inset_0_1px_1px_rgba(15,23,42,0.05)]"
                  : cn(FILTERS_REST, "hover:border-neutral-300 hover:text-neutral-800"),
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#1a1a2e] text-[11px] font-semibold tabular-nums text-white">
                  {activeFilterCount}
                </span>
              )}
            </ExploreFilters>
          }
        />

        {paginatedProducts.length > 0 ? (
          <>
            <div
              key={categoryGridToken}
              /* Fades when the visitor changes a filter, not when they arrive.
                 See lib/ui/use-entrance-on-change.ts. */
              className={`grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${categoryGridEntrance}`}
            >
              {paginatedProducts.map((product, index) => (
                <ProductCard key={product.id} product={product} srcParam="?src=platform" priority={index < 6} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page: number
                  if (totalPages <= 5) page = i + 1
                  else if (currentPage <= 3) page = i + 1
                  else if (currentPage >= totalPages - 2) page = totalPages - 4 + i
                  else page = currentPage - 2 + i
                  return (
                    <button
                      key={page}
                      onClick={() => goToPage(page)}
                      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-sm font-medium transition-colors ${
                        currentPage === page ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                      }`}
                    >
                      {page}
                    </button>
                  )
                })}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                  className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-neutral-100 text-neutral-700 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            )}

            <p className="mt-4 text-center text-sm text-neutral-500">
              Showing {(currentPage - 1) * PRODUCTS_PER_PAGE + 1}-{Math.min(currentPage * PRODUCTS_PER_PAGE, filteredProducts.length)} of {filteredProducts.length} products
            </p>
          </>
        ) : (
          /* Explore's empty state: tall enough that the footer stays below the fold. */
          <div className="flex min-h-[60svh] flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-300 p-12 text-center">
            <p className="text-neutral-500">
              {query
                ? `No products found for "${query}"`
                : priceFilter !== "all"
                  ? "No products match your filters. Try adjusting your price range."
                  : `No products found in ${title}.`}
            </p>
            {(activeFilterCount > 0 || sub || query) && (
              <button
                onClick={() => {
                  resetFilters()
                  setQuery("")
                  if (sub) pickSub(null)
                }}
                className="mt-3 cursor-pointer text-sm font-medium text-neutral-600 underline underline-offset-2 hover:text-neutral-900"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
