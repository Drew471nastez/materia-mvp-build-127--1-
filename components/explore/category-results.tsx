"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, SlidersHorizontal, X } from "lucide-react"

import { ProductCard } from "@/components/explore/product-card"
import { WishlistProvider } from "@/components/explore/wishlist-context"
import { MobileFilterSheet, MobileSortSheet } from "@/components/explore/mobile-filter-sheet"
import { SmartLink } from "@/components/smart-link"
import { DEPARTMENT_NAV, categoryPath } from "@/lib/marketplace/department-nav"
import { groupsForDepartment } from "@/lib/marketplace/listing-taxonomy"
import {
  EMPTY_FILTERS,
  PAGE_SIZE,
  SORTS,
  colourHex,
  countActiveFilters,
  paramsFromFilters,
  type DropSuggestion,
  type Facet,
  type FeedFilters,
  type FeedSort,
} from "@/lib/marketplace/feed-filters"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE RESULTS PAGE'S CHROME
 * ===========================================================================
 *
 * A trail, a title, a count, the brands actually present, a row of filters, the
 * filters you have applied, the grid, and a page number.
 *
 * ---------------------------------------------------------------------------
 * EVERY CONTROL WRITES THE URL, AND NOTHING ELSE
 * ---------------------------------------------------------------------------
 * There is no local copy of the filters here. Pressing a brand builds the next
 * URL and navigates; the server reads it and returns the page. That is one
 * source of truth instead of two, and it is what makes the back button, a
 * reload and a shared link all behave the way somebody expects rather than the
 * way the component happens to remember.
 *
 * It also means the count, the grid and the page number can never disagree with
 * the chips above them — they are all rendered from the same request.
 *
 * ---------------------------------------------------------------------------
 * TWO SHAPES, ONE STATE
 * ---------------------------------------------------------------------------
 * A row of dropdown pills has room on a desktop and none on a phone, where
 * seven of them wrap to three lines above the first listing. So the phone gets
 * the sheet it already has — the same component the feed opens — and the
 * desktop gets the pills. Both write the same URL, so neither is a second
 * implementation of anything.
 */

type Facets = {
  groups: Facet[]
  brands: Facet[]
  sizes: Facet[]
  colours: Facet[]
  conditions: Facet[]
}

export function CategoryResults({
  departmentId,
  groupId,
  sub = null,
  subLabel = null,
  relaxed = null,
  query,
  products,
  total,
  exactTotal = true,
  escapes = [],
  page,
  sort,
  filters,
  facets,
  basePath,
}: {
  departmentId: string | null
  groupId: string | null
  /** The taxonomy's third level, when the URL names one — see the note on the
   *  page. Part of the scope rather than of `filters`. */
  sub?: string | null
  subLabel?: string | null
  /**
   * Set when the strict reading of the query matched nothing and a wider one
   * did. The page says so out loud — "results for jor…" over a grid of Jordans
   * is information; the same grid with no explanation is a search engine that
   * ignored what was typed.
   */
  relaxed?: { mode: "any" | "fuzzy"; term: string } | null
  query: string
  products: any[]
  total: number
  /** False when the on-sale filter had to be applied after the fetch — see the
   *  fallback in the page. A number that is only nearly right is not printed. */
  exactTotal?: boolean
  /** Which single filter to drop when nothing matched — see dropSuggestions. */
  escapes?: DropSuggestion[]
  page: number
  sort: FeedSort
  filters: FeedFilters
  facets: Facets
  basePath: string
}) {
  const router = useRouter()
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE PAGE TELLS YOU IT IS THINKING
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Every control here navigates, and a navigation to a server component is a
   * round trip with no feedback of its own: the pill closes, and then nothing
   * happens for as long as the query takes. On a slow connection that is a page
   * that looks like it ignored the tap — so the tap comes again, and the second
   * one lands on a page that is about to be replaced.
   *
   * `useTransition` is what makes the wait visible without blocking it. The old
   * results stay on screen and dim rather than being replaced by a skeleton:
   * the grid you were reading is still the closest thing to the grid you are
   * about to get, and a skeleton throws away information to show a placeholder.
   * `pointer-events-none` for the same reason the search panel has it — a
   * surface that is leaving must not swallow the taps meant for the one
   * arriving.
   */
  const [pending, startTransition] = useTransition()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [openPill, setOpenPill] = useState<string | null>(null)

  /**
   * ESCAPE CLOSES THE OPEN ONE.
   *
   * A panel that can only be dismissed by clicking away from it is a panel
   * somebody using a keyboard cannot dismiss at all — and Escape is what every
   * hand reaches for first, mouse or not. One listener for all seven pills,
   * because only one is ever open: seven listeners would be seven handlers
   * racing to close the same thing.
   */
  useEffect(() => {
    if (!openPill) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenPill(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [openPill])

  const dept = departmentId ? DEPARTMENT_NAV.find((d) => d.id === departmentId) ?? null : null
  const group = dept && groupId ? dept.subcategories.find((s) => s.id === groupId) ?? null : null
  const active = countActiveFilters({ ...filters, group: null })
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  /**
   * The next URL, and always from page 1.
   *
   * Changing a filter while on page 7 and staying on page 7 is how somebody
   * lands on an empty screen that has results — the narrower set simply does not
   * reach that far. Only the pager itself keeps the page.
   */
  const go = useCallback(
    (next: FeedFilters, opts?: { sort?: FeedSort; page?: number; sub?: string | null }) => {
      // THE GROUP IS THE PATH, not a parameter. The sheet edits it as a filter
      // like any other, so a change to it has to become a different URL rather
      // than a `?group=` alongside a path that says something else. Everything
      // else rides the query string.
      const path =
        departmentId && next.group !== groupId
          ? categoryPath(departmentId, next.group)
          : basePath
      // THE LEAF SURVIVES EVERY OTHER CONTROL, and is dropped by the one thing
      // that invalidates it: changing the group. Rochii is a kind of Haine, so
      // carrying `?sub=dresses` onto Încălțăminte would be a page scoped to a
      // category that group does not have — which is an empty page with a chip
      // on it saying why.
      const nextSub = opts && "sub" in opts ? opts.sub : next.group !== groupId ? null : sub
      const params = paramsFromFilters({ ...next, group: null }, {
        sort: opts?.sort ?? sort,
        page: opts?.page,
        q: query || undefined,
        sub: nextSub,
      })
      const qs = params.toString()
      startTransition(() => router.push(qs ? `${path}?${qs}` : path, { scroll: true }))
      setOpenPill(null)
    },
    [basePath, departmentId, groupId, query, router, sort, startTransition, sub],
  )

  const toggle = useCallback(
    (key: "brands" | "sizes" | "colours" | "conditions", v: string) =>
      go({
        ...filters,
        [key]: filters[key].some((x) => x.toLowerCase() === v.toLowerCase())
          ? filters[key].filter((x) => x.toLowerCase() !== v.toLowerCase())
          : [...filters[key], v],
      }),
    [filters, go],
  )

  const title = query ? `„${query}”` : subLabel ?? group?.label ?? dept?.label ?? "Toate anunțurile"

  /** The taxonomy's leaves under this group, for the rail below the trail. */
  const leaves = useMemo(
    () =>
      departmentId && groupId
        ? groupsForDepartment(departmentId).find((g) => g.id === groupId)?.items ?? []
        : [],
    [departmentId, groupId],
  )

  const chips = useMemo(() => buildChips(filters, facets), [filters, facets])

  return (
    <WishlistProvider>
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        {/* ── The trail. A filtered page needs a way OUT that is not the back
               button: widening by one level is one tap rather than a return
               trip through the menu. Not drawn for a bare query, because
               "Acasă › „nike”" pretends a search is a place in a hierarchy. */}
        {dept && (
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-hide">
            <Crumb href="/" label="Acasă" />
            <ChevronRight className="h-[14px] w-[14px] shrink-0 text-neutral-300" />
            {group ? (
              <>
                <Crumb href={categoryPath(dept.id)} label={dept.label} />
                <ChevronRight className="h-[14px] w-[14px] shrink-0 text-neutral-300" />
                {subLabel ? (
                  <>
                    <Crumb href={categoryPath(dept.id, group.id)} label={group.label} />
                    <ChevronRight className="h-[14px] w-[14px] shrink-0 text-neutral-300" />
                    <span className="shrink-0 whitespace-nowrap text-[13.5px] font-semibold text-neutral-900">
                      {subLabel}
                    </span>
                  </>
                ) : (
                  <span className="shrink-0 whitespace-nowrap text-[13.5px] font-semibold text-neutral-900">{group.label}</span>
                )}
              </>
            ) : (
              <span className="shrink-0 whitespace-nowrap text-[13.5px] font-semibold text-neutral-900">{dept.label}</span>
            )}
          </nav>
        )}

        <h1 className="text-[26px] font-bold tracking-[-0.025em] text-neutral-900 sm:text-[32px]">{title}</h1>
        {/* `aria-live="polite"` is what makes a faceted search usable without
            sight. Everything here changes the RESULTS, and the only thing that
            reports that is a number in the corner — press three filters with a
            screen reader and nothing at all is spoken, so there is no way to
            tell a filter that narrowed the page from one that did nothing.
            Polite rather than assertive: it waits for the current sentence to
            finish instead of interrupting whatever was being read. */}
        <p
          aria-live="polite"
          className="mt-1 flex items-center gap-2 text-[14px] font-medium text-neutral-500"
        >
          {/* `exactTotal` is false only on a database that has not run the
              is_on_sale migration, where the filter is applied to the page
              rather than to the query. A number that is only nearly right is
              worse than none: it is the one thing on this page somebody would
              quote back. */}
          {exactTotal
            ? total === 1
              ? "1 rezultat"
              : `${total.toLocaleString("ro-RO")} rezultate`
            : `${products.length} pe această pagină`}
          {pending && <Loader2 className="h-[15px] w-[15px] animate-spin text-neutral-400" />}
        </p>

        {/* ── WHEN THE SEARCH WAS WIDENED, THE PAGE SAYS SO.
               A grid of Jordans under the word "jordn" is either a very good
               search or a broken one, and the only difference is whether the
               page admits which of the two it is doing. Depop, Vinted, eBay and
               Google all print this line; it is what turns "it ignored me" into
               "it understood me". */}
        {relaxed && (
          <p className="mt-2 rounded-xl bg-neutral-50 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-neutral-600">
            Niciun rezultat exact pentru <span className="font-semibold text-neutral-900">„{query}”</span>.{" "}
            {relaxed.mode === "fuzzy" ? (
              <>
                Afișăm rezultate apropiate pentru{" "}
                <span className="font-semibold text-neutral-900">„{relaxed.term}”</span>.
              </>
            ) : (
              <>Afișăm articolele care conțin cel puțin unul dintre cuvintele căutate.</>
            )}
          </p>
        )}

        {/* ── THE THIRD LEVEL, AS A RAIL RATHER THAN AS ANOTHER DROPDOWN.
               "Femei · Haine" is three hundred listings of which four are the
               dresses somebody came for, and until now the taxonomy's leaves —
               which every listing carries and the sell form insists on — were
               reachable from nowhere at all.

               A rail, because these are SIBLINGS you flick through rather than
               a list you open, decide in and close; and because on a phone it is
               the same gesture as the department rail directly above it. Toate
               is first and is the way back out, so the rail is never a state you
               can enter and not leave. */}
        {leaves.length > 1 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:px-0">
            <button
              type="button"
              onClick={() => go(filters, { sub: null })}
              aria-pressed={!sub}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200",
                !sub
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400",
              )}
            >
              Toate
            </button>
            {leaves.map((leaf) => {
              const on = leaf.id === sub
              return (
                <button
                  key={leaf.id}
                  type="button"
                  onClick={() => go(filters, { sub: on ? null : leaf.id })}
                  aria-pressed={on}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200",
                    on
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400",
                  )}
                >
                  {leaf.label}
                </button>
              )
            })}
          </div>
        )}

        {/* ── Popular brands. On a resale marketplace the brand IS the query most
               of the time, and these are one tap instead of Filtre → Brand →
               scroll. Six, not sixty: a rail long enough to scroll is the filter
               list escaping into the page. */}
        {facets.brands.length > 1 && (
          <div className="mt-4 flex items-center gap-3">
            <span className="hidden shrink-0 text-[14px] font-semibold text-neutral-900 sm:block">Branduri populare</span>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-hide sm:mx-0 sm:px-0">
              {facets.brands.slice(0, 6).map((b) => {
                const on = filters.brands.some((x) => x.toLowerCase() === b.value.toLowerCase())
                return (
                  <button
                    key={b.value}
                    type="button"
                    onClick={() => toggle("brands", b.value)}
                    aria-pressed={on}
                    className={cn(
                      "shrink-0 rounded-full border px-4 py-2 text-[13.5px] font-medium transition-colors",
                      on
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white text-neutral-900 hover:border-neutral-400",
                    )}
                  >
                    {b.value}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            THE REFINE BAR FOLLOWS YOU DOWN THE PAGE
            ═══════════════════════════════════════════════════════════

            Ninety listings is about six screenfuls. With the controls at the
            top, deciding at listing sixty that these are all too expensive
            means scrolling six screens back, changing one number, and being
            returned to the top anyway — so the cheap move is to give up rather
            than to refine, which is the opposite of what a filter is for.

            Pinned under whatever header this platform is showing.
            `--web-header-h` and `--platform-header-h` are mutually exclusive —
            each is zero while the other's header is on screen — so their SUM is
            the right offset on every one of them without anybody coordinating.
            The same arithmetic `.profile-pinned` uses.

            z-30, under the header's z-40: it slides UNDER the chrome rather
            than over it, which is the rule this app applies to every sticky
            surface. And an opaque background, because a bar you can read the
            listings through is a bar that reads as a rendering fault. */}
        <div
          className="sticky z-30 -mx-4 mt-4 border-t border-neutral-200 bg-white px-4 pt-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
          style={{ top: "calc(var(--web-header-h, 0px) + var(--platform-header-h, 0px))" }}
        >
          {/* ── The phone's two buttons. Seven dropdown pills wrap to three lines
                 above the first listing at 375px, so the phone gets the sheet it
                 already has and the desktop gets the pills. Both write the same
                 URL. */}
          <div className="flex items-stretch md:hidden">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 py-2 text-[15px] font-semibold text-neutral-900"
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" />
              Filtre
              {active > 0 && (
                <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-neutral-900 px-1.5 text-[11.5px] font-bold text-white">
                  {active}
                </span>
              )}
            </button>
            <span aria-hidden className="my-1.5 w-px bg-neutral-200" />
            <button
              type="button"
              onClick={() => setSortOpen(true)}
              className="flex flex-1 items-center justify-center gap-2 py-2 text-[15px] font-semibold text-neutral-900"
            >
              <ArrowUpDown className="h-[17px] w-[17px]" />
              Sortează
            </button>
          </div>

          <div className="hidden flex-wrap items-center gap-2 md:flex">
            {dept && facets.groups.length > 0 && (
              <Pill
                id="group"
                label="Categorie"
                value={group?.label ?? ""}
                open={openPill === "group"}
                onOpen={setOpenPill}
              >
                <div className="max-h-[320px] overflow-y-auto py-1">
                  {facets.groups.map((g) => (
                    <SmartLink
                      key={g.value}
                      href={categoryPath(dept.id, g.value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-[14px] hover:bg-neutral-50",
                        g.value === groupId ? "font-semibold text-neutral-900" : "text-neutral-700",
                      )}
                    >
                      <span className="flex-1 truncate">{g.label}</span>
                      <span className="text-[12.5px] text-neutral-400">{g.count}</span>
                    </SmartLink>
                  ))}
                </div>
              </Pill>
            )}

            <FacetPill id="brands" label="Brand" options={facets.brands} selected={filters.brands} openPill={openPill} setOpenPill={setOpenPill} onPick={(v) => toggle("brands", v)} />
            <PricePill
              key={`${filters.minPrice ?? ""}-${filters.maxPrice ?? ""}`}
              filters={filters}
              openPill={openPill}
              setOpenPill={setOpenPill}
              onApply={(min, max) => go({ ...filters, minPrice: min, maxPrice: max })}
            />
            <FacetPill id="sizes" label="Mărime" options={facets.sizes} selected={filters.sizes} openPill={openPill} setOpenPill={setOpenPill} onPick={(v) => toggle("sizes", v)} />
            <FacetPill id="colours" label="Culoare" options={facets.colours} selected={filters.colours} openPill={openPill} setOpenPill={setOpenPill} onPick={(v) => toggle("colours", v)} swatches />
            <FacetPill id="conditions" label="Stare" options={facets.conditions} selected={filters.conditions} openPill={openPill} setOpenPill={setOpenPill} onPick={(v) => toggle("conditions", v)} />

            <button
              type="button"
              onClick={() => go({ ...filters, onSale: !filters.onSale })}
              aria-pressed={filters.onSale}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[14px] font-medium transition-colors",
                filters.onSale ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-900 hover:border-neutral-400",
              )}
            >
              <span
                className={cn(
                  "flex h-[17px] w-[17px] items-center justify-center rounded-[4px] border",
                  filters.onSale ? "border-white bg-white text-neutral-900" : "border-neutral-400",
                )}
              >
                {filters.onSale && <Check className="h-[12px] w-[12px]" strokeWidth={3.4} />}
              </span>
              La reducere
            </button>

            <Pill id="sort" label="Sortează" value={SORTS.find((s) => s.id === sort)?.label ?? ""} open={openPill === "sort"} onOpen={setOpenPill} className="ml-auto">
              <div className="py-1">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => go(filters, { sort: s.id })}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] hover:bg-neutral-50",
                      s.id === sort ? "font-semibold text-neutral-900" : "text-neutral-700",
                    )}
                  >
                    <span className="flex-1">{s.label}</span>
                    {s.id === sort && <Check className="h-[15px] w-[15px]" strokeWidth={2.6} />}
                  </button>
                ))}
              </div>
            </Pill>
          </div>

          {/* ── What is applied, removable where you are reading it. Without
                 these, dropping one brand out of three means opening the pill,
                 finding it in a list of forty and unticking it. */}
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => go(c.remove(filters))}
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 py-1.5 pl-3.5 pr-2.5 text-[13.5px] font-medium text-neutral-800 hover:bg-neutral-200"
                >
                  {c.label}
                  <X className="h-[14px] w-[14px] text-neutral-500" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => go(EMPTY_FILTERS)}
                className="px-2 text-[13.5px] font-semibold text-neutral-600 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-900"
              >
                Șterge tot
              </button>
            </div>
          )}
          {/* The bar's own bottom edge. Inside the sticky box, so the listings
              scroll under a bar that has a floor rather than under one whose
              contents simply stop. */}
          <div className="h-3" />
        </div>

        {/* ── THE GRID. Five across at its widest, which is the width the card was
               drawn for — see the note in components/explore/home/listing-row. */}
        {/* The grid dims and stops taking taps while the next one is on its way.
            Not a skeleton: what you are reading is the closest thing there is to
            what you are about to get, and replacing it with grey boxes throws
            that away to show a placeholder. */}
        <div className={cn("transition-opacity duration-200", pending && "pointer-events-none opacity-50")}>
        {products.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[17px] font-semibold text-neutral-900">Niciun rezultat</p>

            {/* ONE FILTER TO DROP, AND WHAT IT GIVES BACK.
                "Try removing some filters" offers to undo everything, when the
                person has usually got four things right and one thing wrong.
                The arithmetic behind these numbers is done on the rows already
                fetched for the facet counts, so it costs nothing and it is
                exact — and a filter whose removal still leaves zero is not
                offered at all, because that is a second dead end. */}
            {escapes.length > 0 ? (
              <>
                <p className="mt-1.5 text-[14.5px] text-neutral-500">
                  Încearcă fără unul dintre filtre:
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {escapes.slice(0, 3).map((e) => (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => go(withoutFilter(filters, e.key))}
                      className="inline-flex h-11 items-center gap-2 rounded-lg border border-neutral-300 px-4 text-[14.5px] font-medium text-neutral-900 hover:border-neutral-400"
                    >
                      Fără {e.label}
                      <span className="text-[13px] font-semibold text-neutral-500">{e.count}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-1.5 text-[14.5px] text-neutral-500">
                {active > 0 ? "Încearcă să elimini câteva filtre." : "Încearcă alt termen sau altă categorie."}
              </p>
            )}

            {active > 0 && (
              <button
                type="button"
                onClick={() => go(EMPTY_FILTERS)}
                className="mt-5 inline-flex h-11 items-center rounded-lg bg-neutral-900 px-6 text-[15px] font-semibold text-white"
              >
                Șterge filtrele
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p, i) => (
              <ProductCard key={p.id} product={p} origin="search" priority={i < 5} />
            ))}
          </div>
        )}

        </div>

        {pages > 1 && <Pager page={page} pages={pages} onGo={(n) => go(filters, { page: n })} />}
      </div>

      <MobileFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        pool={[]}
        facets={facets}
        departmentId={departmentId}
        value={filters}
        onApply={(next) => go(next)}
        // Sort lives inside the sheet on a phone — one trip for one decision.
        // The separate bottom sheet stays for the Sortează button beside Filtre,
        // which is the shortcut for somebody who only wants that.
        sort={sort}
        onSortChange={(s) => go(filters, { sort: s })}
      />
      <MobileSortSheet open={sortOpen} onClose={() => setSortOpen(false)} value={sort} onPick={(s) => go(filters, { sort: s })} />
    </WishlistProvider>
  )
}

function Crumb({ href, label }: { href: string; label: string }) {
  return (
    <SmartLink
      href={href}
      className="shrink-0 whitespace-nowrap text-[13.5px] font-medium text-neutral-500 underline decoration-neutral-300 underline-offset-[3px] hover:text-neutral-900"
    >
      {label}
    </SmartLink>
  )
}

/**
 * A dropdown pill.
 *
 * ONE OPEN AT A TIME, held by the parent rather than by each pill: seven pills
 * each owning a boolean is seven panels that can all be open at once, stacked
 * over the first row of listings.
 */
function Pill({
  id,
  label,
  value,
  open,
  onOpen,
  children,
  className,
}: {
  id: string
  label: string
  value?: string
  open: boolean
  onOpen: (id: string | null) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => onOpen(open ? null : id)}
        aria-expanded={open}
        className={cn(
          "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3.5 text-[14px] font-medium transition-colors",
          value || open ? "border-neutral-900 text-neutral-900" : "border-neutral-300 text-neutral-900 hover:border-neutral-400",
        )}
      >
        {label}
        {value && <span className="max-w-[140px] truncate text-neutral-500">· {value}</span>}
        <ChevronDown className={cn("h-4 w-4 text-neutral-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          {/* Clicking anywhere else closes it. A pill that only closes on its own
              button is one you have to go back to, which is why the page ends up
              with a panel over it while you scroll. */}
          <button aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => onOpen(null)} />
          <div className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[240px] rounded-xl border border-neutral-200 bg-white py-1 shadow-[0_16px_40px_-12px_rgba(15,15,15,0.24)]">
            {children}
          </div>
        </>
      )}
    </div>
  )
}

function FacetPill({
  id,
  label,
  options,
  selected,
  openPill,
  setOpenPill,
  onPick,
  swatches = false,
}: {
  id: string
  label: string
  options: Facet[]
  selected: string[]
  openPill: string | null
  setOpenPill: (v: string | null) => void
  onPick: (value: string) => void
  swatches?: boolean
}) {
  // A pill for a facet nothing on this page has is a control that can only
  // disappoint. It is not drawn at all rather than drawn empty.
  if (options.length === 0) return null
  const value = selected.length === 0 ? "" : selected.length === 1 ? (options.find((o) => o.value === selected[0])?.label ?? selected[0]) : `${selected.length}`
  return (
    <Pill id={id} label={label} value={value} open={openPill === id} onOpen={setOpenPill}>
      <div className="max-h-[320px] min-w-[240px] overflow-y-auto py-1">
        {options.map((o) => {
          const on = selected.some((x) => x.toLowerCase() === o.value.toLowerCase())
          const hex = swatches ? colourHex(o.value) : null
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onPick(o.value)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] text-neutral-700 hover:bg-neutral-50"
            >
              <span
                className={cn(
                  "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border",
                  on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300",
                )}
              >
                {on && <Check className="h-[12px] w-[12px]" strokeWidth={3.4} />}
              </span>
              {hex && <span aria-hidden className="h-[16px] w-[16px] shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: hex }} />}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              <span className="shrink-0 text-[12.5px] text-neutral-400">{o.count}</span>
            </button>
          )
        })}
      </div>
    </Pill>
  )
}

function PricePill({
  filters,
  openPill,
  setOpenPill,
  onApply,
}: {
  filters: FeedFilters
  openPill: string | null
  setOpenPill: (v: string | null) => void
  onApply: (min: number | null, max: number | null) => void
}) {
  /**
   * KEYED ON WHAT IS APPLIED, so "Șterge tot" empties these boxes.
   *
   * `useState(initial)` reads its argument once, ever. Press Șterge tot and the
   * page returns with no price filter, the chip is gone, the results are
   * unfiltered — and these two inputs still hold 50 and 300, because nothing
   * told them. The next person to open the pill sees a range that is not
   * applied and presses Aplică on it, which is the filter coming back from the
   * dead.
   *
   * A `key` on the component is the React way to say "this is a different
   * instance now" without an effect that syncs two copies of one value.
   */
  const [min, setMin] = useState(filters.minPrice != null ? String(filters.minPrice) : "")
  const [max, setMax] = useState(filters.maxPrice != null ? String(filters.maxPrice) : "")
  const read = (v: string) => {
    const n = Number(v.replace(/[^\d]/g, ""))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const value =
    filters.minPrice != null && filters.maxPrice != null
      ? `${filters.minPrice}–${filters.maxPrice}`
      : filters.minPrice != null
        ? `≥ ${filters.minPrice}`
        : filters.maxPrice != null
          ? `≤ ${filters.maxPrice}`
          : ""
  return (
    <Pill id="price" label="Preț" value={value} open={openPill === "price"} onOpen={setOpenPill}>
      <div className="w-[260px] p-3">
        <div className="flex items-center gap-2">
          <input inputMode="numeric" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-[14px] outline-none focus:border-neutral-400" />
          <span className="text-neutral-400">–</span>
          <input inputMode="numeric" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-[14px] outline-none focus:border-neutral-400" />
        </div>
        <button
          type="button"
          onClick={() => onApply(read(min), read(max))}
          className="mt-3 h-10 w-full rounded-lg bg-neutral-900 text-[14px] font-semibold text-white"
        >
          Aplică
        </button>
      </div>
    </Pill>
  )
}

/**
 * THE PAGER SHOWS THE EDGES AND WHERE YOU ARE, and never more than seven slots.
 *
 * A pager that prints every page is a row that wraps at 40 pages and a line of
 * numbers nobody reads. First, last, the three around the current one, and an
 * ellipsis where the run breaks: that is enough to jump to the start, the end,
 * or one step either way, which is every navigation anybody actually performs.
 */
function Pager({ page, pages, onGo }: { page: number; pages: number; onGo: (n: number) => void }) {
  const slots: (number | "gap")[] = []
  const push = (n: number) => {
    if (n >= 1 && n <= pages && !slots.includes(n)) slots.push(n)
  }
  push(1)
  if (page - 1 > 2) slots.push("gap")
  for (let n = page - 1; n <= page + 1; n++) push(n)
  if (page + 1 < pages - 1) slots.push("gap")
  push(pages)

  const btn = "flex h-10 min-w-[40px] items-center justify-center rounded-lg px-3 text-[14.5px] font-medium transition-colors"
  return (
    <nav aria-label="Paginare" className="mt-12 flex items-center justify-center gap-1">
      <button
        type="button"
        onClick={() => onGo(page - 1)}
        disabled={page <= 1}
        aria-label="Pagina anterioară"
        className={cn(btn, "text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent")}
      >
        <ChevronLeft className="h-[18px] w-[18px]" />
      </button>
      {slots.map((s, i) =>
        s === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-neutral-400">
            …
          </span>
        ) : (
          <button
            key={s}
            type="button"
            onClick={() => onGo(s)}
            aria-current={s === page ? "page" : undefined}
            className={cn(btn, s === page ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-100")}
          >
            {s}
          </button>
        ),
      )}
      <button
        type="button"
        onClick={() => onGo(page + 1)}
        disabled={page >= pages}
        aria-label="Pagina următoare"
        className={cn(btn, "text-neutral-700 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent")}
      >
        <ChevronRight className="h-[18px] w-[18px]" />
      </button>
    </nav>
  )
}

/** The inverse of one drop suggestion — see `escapes`. */
function withoutFilter(f: FeedFilters, key: DropSuggestion["key"]): FeedFilters {
  if (key === "price") return { ...f, minPrice: null, maxPrice: null }
  if (key === "onSale") return { ...f, onSale: false }
  if (key === "brands" || key === "sizes" || key === "colours" || key === "conditions") {
    return { ...f, [key]: [] }
  }
  return f
}

type Chip = { key: string; label: string; remove: (f: FeedFilters) => FeedFilters }

function buildChips(f: FeedFilters, facets: Facets): Chip[] {
  const out: Chip[] = []
  const label = (opts: Facet[], v: string) => opts.find((o) => o.value.toLowerCase() === v.toLowerCase())?.label ?? v
  const lists: ["brands" | "sizes" | "colours" | "conditions", Facet[]][] = [
    ["brands", facets.brands],
    ["sizes", facets.sizes],
    ["colours", facets.colours],
    ["conditions", facets.conditions],
  ]
  for (const [key, opts] of lists) {
    for (const v of f[key]) {
      out.push({
        key: `${key}:${v}`,
        label: label(opts, v),
        remove: (cur) => ({ ...cur, [key]: cur[key].filter((x) => x !== v) }),
      })
    }
  }
  if (f.minPrice != null || f.maxPrice != null) {
    const l =
      f.minPrice != null && f.maxPrice != null
        ? `${f.minPrice}–${f.maxPrice} RON`
        : f.minPrice != null
          ? `peste ${f.minPrice} RON`
          : `sub ${f.maxPrice} RON`
    out.push({ key: "price", label: l, remove: (cur) => ({ ...cur, minPrice: null, maxPrice: null }) })
  }
  if (f.onSale) out.push({ key: "sale", label: "La reducere", remove: (cur) => ({ ...cur, onSale: false }) })
  return out
}
