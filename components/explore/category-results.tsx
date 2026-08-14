"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpDown, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Search, SlidersHorizontal, X } from "lucide-react"

import { ProductCard } from "@/components/explore/product-card"
import { WishlistProvider } from "@/components/explore/wishlist-context"
import { MobileFilterSheet, MobileSortSheet } from "@/components/explore/mobile-filter-sheet"
import { SmartLink } from "@/components/smart-link"
import { DEPARTMENT_NAV, categoryPath, type DepartmentNavItem } from "@/lib/marketplace/department-nav"
import { departmentForGroup, groupsForDepartment } from "@/lib/marketplace/listing-taxonomy"
import {
  EMPTY_FILTERS,
  FACET_SEARCH_MIN,
  PAGE_SIZE,
  SORTS,
  colourHex,
  countActiveFilters,
  orderFacetOptions,
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
 * A trail, a title, a count, the subcategories of wherever you are, a row of
 * filters, the filters you have applied, the grid, and a page number — which is
 * Depop's order and Vinted's, and is what it settled into after two rails above
 * the title were removed for saying what the filter row already says.
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

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THE TICK APPEARS WHEN YOU PRESS IT, NOT WHEN THE SERVER AGREES
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Every control here writes the URL and the server answers, which is what
   * makes the back button, a reload and a shared link all mean the same thing —
   * and it also meant NOTHING happened for the length of a round trip. Press
   * "Nike": the box stays empty, the pill still says Brand, the chip does not
   * appear. On anything but a fast connection that is a control that ignored
   * you, so it gets pressed again, and the second press is a toggle back off.
   *
   * So the filters the UI DRAWS are the ones just asked for, and the server's
   * answer replaces them when it lands. The URL is still the only source of
   * truth — this is a photograph of the request in flight, cleared the moment
   * real props arrive, so a failed or abandoned navigation self-heals rather
   * than leaving the page lying.
   *
   * It also makes rapid multi-select CORRECT rather than merely fast: three
   * brands ticked in a second used to build all three URLs from the same stale
   * props, so the third navigation dropped the first two. Each one now starts
   * from what the one before it asked for.
   *
   * `filters` is a fresh object per SERVER render — a client re-render keeps the
   * same reference — so this effect fires exactly once per navigation.
   */
  const [draft, setDraft] = useState<{ f: FeedFilters; sub: string | null; sort: FeedSort } | null>(null)
  useEffect(() => {
    setDraft(null)
  }, [filters, sub, sort])
  const view = draft?.f ?? filters
  const viewSub = draft ? draft.sub : sub
  const viewSort = draft?.sort ?? sort

  const dept = departmentId ? DEPARTMENT_NAV.find((d) => d.id === departmentId) ?? null : null
  const group = dept && groupId ? dept.subcategories.find((s) => s.id === groupId) ?? null : null
  const active = countActiveFilters({ ...view, group: null })
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  /**
   * THE GRID ONLY DIMS IF THE WAIT IS LONG ENOUGH TO NOTICE.
   *
   * `pending` is true from the frame the transition starts, so a filter the
   * server answers in 80ms flashed the entire grid to half opacity and back —
   * a blink on every single press, which reads as the page glitching rather
   * than as the page working. Below this threshold nothing moves at all except
   * the tick you just pressed, which is exactly what "instant" should look
   * like; past it the dim is honest about a real wait.
   */
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    if (!pending) {
      setWaiting(false)
      return
    }
    const t = setTimeout(() => setWaiting(true), 140)
    return () => clearTimeout(t)
  }, [pending])

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
      // AND THE DEPARTMENT IS DERIVED FROM THE GROUP, not assumed to be the one
      // the page is already in. The sheet can now offer every group in the
      // taxonomy — that is what makes a SEARCH narrowable by category — so
      // picking "Bărbați · Haine" from /shop?q=nike used to build
      // `categoryPath(null, "men-clothing")`, which is "/shop": the filter
      // silently did nothing. A group belongs to exactly one department, so
      // there is nothing to guess.
      const nextDept = next.group ? departmentForGroup(next.group) ?? departmentId : departmentId
      const path =
        next.group !== groupId || nextDept !== departmentId
          ? categoryPath(nextDept, next.group)
          : basePath
      // THE LEAF SURVIVES EVERY OTHER CONTROL, and is dropped by the one thing
      // that invalidates it: changing the group. Rochii is a kind of Haine, so
      // carrying `?sub=dresses` onto Încălțăminte would be a page scoped to a
      // category that group does not have — which is an empty page with a chip
      // on it saying why.
      const nextSub: string | null = opts && "sub" in opts ? opts.sub ?? null : next.group !== groupId ? null : sub
      const nextSort = opts?.sort ?? sort
      const params = paramsFromFilters({ ...next, group: null }, {
        sort: nextSort,
        page: opts?.page,
        q: query || undefined,
        sub: nextSub,
      })
      const qs = params.toString()
      // Drawn as done before it IS done — see the note on `draft`.
      setDraft({ f: next, sub: nextSub, sort: nextSort })
      startTransition(() => router.push(qs ? `${path}?${qs}` : path, { scroll: true }))
      setOpenPill(null)
    },
    [basePath, departmentId, groupId, query, router, sort, startTransition, sub],
  )

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  "ȘTERGE TOT" CLEARS THE FILTERS. IT DOES NOT MOVE YOU TO ANOTHER PAGE.
   * ═════════════════════════════════════════════════════════════════════════
   *
   * It was `go(EMPTY_FILTERS)`, and `EMPTY_FILTERS.group` is null — so pressing
   * it on /shop/women/clothing walked you UP to /shop/women and dropped the leaf
   * with it. Somebody who is looking at dresses and unticks two brands has not
   * asked to stop looking at dresses; they end up a level out, with three
   * hundred listings, and the only clue is the heading changing.
   *
   * THE SCOPE IS NOT A FILTER. The department, the group and the leaf are in the
   * path and the trail and the h1 — they are WHERE YOU ARE. The chips this
   * button sits beside are brands, sizes, colours, condition and price, and
   * `buildChips` never emits one for the group, so the button has never had
   * anything on screen suggesting it would navigate.
   *
   * Keeping `group` also keeps `sub`, because `go` only drops the leaf when the
   * group changes underneath it.
   */
  const clearFilters = useCallback(() => go({ ...EMPTY_FILTERS, group: view.group }), [go, view.group])

  const toggle = useCallback(
    (key: "brands" | "sizes" | "colours" | "conditions", v: string) =>
      go({
        ...view,
        [key]: filters[key].some((x) => x.toLowerCase() === v.toLowerCase())
          ? filters[key].filter((x) => x.toLowerCase() !== v.toLowerCase())
          : [...filters[key], v],
      }),
    [view, go],
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

  const chips = useMemo(() => buildChips(view, facets), [view, facets])

  /**
   * The rungs after Acasă. The last one has no href — it is where you are, and
   * a link to the page you are on is a link that does nothing.
   */
  const trail = useMemo(() => {
    const out: { label: string; href?: string }[] = []
    if (query) {
      out.push({ label: "Rezultate" })
      return out
    }
    if (!dept) {
      out.push({ label: "Toate anunțurile" })
      return out
    }
    out.push({ label: dept.label, href: group ? categoryPath(dept.id) : undefined })
    if (group) out.push({ label: group.label, href: subLabel ? categoryPath(dept.id, group.id) : undefined })
    if (subLabel) out.push({ label: subLabel })
    return out
  }, [query, dept, group, subLabel])

  return (
    <WishlistProvider>
      <div className="mx-auto w-full max-w-[1400px] px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        {/* ═══════════════════════════════════════════════════════════════
            THE TRAIL — ON EVERY VIEW, AND ON THE WEB ONLY
            ═══════════════════════════════════════════════════════════════

            It was drawn only inside a department, so `/shop` and every search
            began with a bare heading and no way up that was not the browser's
            own Back — which on a phone browser is a chevron in a bar that may be
            hidden, and on a desktop is off in the corner of the window rather
            than on the page. Every marketplace puts one here for that reason.

            A SEARCH GETS ONE TOO. The old note said "Acasă › „nike”" pretends a
            search is a place in a hierarchy, and it was right about the shape
            and wrong about the fix: the trail says "Rezultate" — the kind of
            page this is — and the query stays in the h1 underneath, where it is
            the subject rather than a rung.

            `web-only`, so the app never draws it. Inside the shell there is a
            back gesture, a back arrow and a tab bar; a second, textual way back
            is a row of small grey type above every results page that nobody
            presses. See the rule in app/globals.css — it is CSS rather than a
            check here because the class is on <html> before the first pixel, and
            an effect would paint the trail and then take it away. */}
        <nav
          aria-label="Breadcrumb"
          className="web-only flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-hide"
        >
          <Crumb href="/" label="Acasă" />
          {trail.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex shrink-0 items-center gap-1.5">
              <ChevronRight className="h-[14px] w-[14px] shrink-0 text-neutral-300" />
              {c.href ? (
                <Crumb href={c.href} label={c.label} />
              ) : (
                <span className="shrink-0 whitespace-nowrap text-[13.5px] font-semibold text-neutral-900">
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* NO DEPARTMENT RAIL HERE, AND THERE WAS ONE.
               It was added to answer a real problem — the site's category bar is
               not drawn on /shop, so arriving from it meant losing the row you
               pressed — and then the Categorie pill in the refine bar below grew
               into the whole taxonomy and answered the same problem properly:
               every department, its groups AND its leaves, from one control that
               is always there.
               Six pills above the title that reach a strict subset of what a
               pill below the title reaches is the same navigation twice, and the
               copy of it that costs a full row is the one to lose. Depop does not
               carry one either. What Depop DOES have under the title is the
               subcategory row, which is the `leaves` rail further down. */}

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
          {waiting && <Loader2 className="h-[15px] w-[15px] animate-spin text-neutral-400" />}
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
              onClick={() => go(view, { sub: null })}
              aria-pressed={!viewSub}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-[color,border-color,background-color,transform] duration-150 ease-out active:scale-[0.96]",
                !sub
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400",
              )}
            >
              Toate
            </button>
            {leaves.map((leaf) => {
              const on = leaf.id === viewSub
              return (
                <button
                  key={leaf.id}
                  type="button"
                  onClick={() => go(view, { sub: on ? null : leaf.id })}
                  aria-pressed={on}
                  className={cn(
                    "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-[color,border-color,background-color,transform] duration-150 ease-out active:scale-[0.96]",
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
        {/* AND NO POPULAR-BRANDS RAIL EITHER, for the same reason.
               Six brands as a shortcut past Filtre → Brand → scroll was a fair
               trade while that list was an unsearchable forty-row scroller. It
               is a searchable list now with what you have already picked at the
               top, so the rail is a second, worse copy of the Brand pill sitting
               a row above it — and it was the last of three stacked rows of
               chrome between the count and the first listing.
               Neither Depop nor Vinted puts one here. Both go straight from the
               count to the filter bar to the grid, which is what this page does
               now. */}

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
              className="flex flex-1 items-center justify-center gap-2 py-2 text-[15px] font-semibold text-neutral-900 transition-transform duration-150 ease-out active:scale-[0.97]"
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
              className="flex flex-1 items-center justify-center gap-2 py-2 text-[15px] font-semibold text-neutral-900 transition-transform duration-150 ease-out active:scale-[0.97]"
            >
              <ArrowUpDown className="h-[17px] w-[17px]" />
              Sortează
            </button>
          </div>

          <div className="hidden flex-wrap items-center gap-3 md:flex">
            {/* ── CATEGORY IS ALWAYS HERE, AND IT GOES ALL THE WAY DOWN.
                   It only appeared once you were already inside a department,
                   and then it listed that department's groups and nothing else.
                   So the one thing you could not narrow by category was a
                   SEARCH — `/shop?q=nike` had no department, so no pill, so
                   "nike in Bărbați" was not a thing this site could express,
                   which is the first filter anybody reaches for on Depop or
                   Vinted.
                   Three levels, in place, on the same push/pop as everywhere
                   else. See CategoryMenu. */}
            <Pill
              id="group"
              label="Categorie"
              value={subLabel ?? group?.label ?? dept?.label ?? ""}
              open={openPill === "group"}
              onOpen={setOpenPill}
            >
              <CategoryMenu
                departmentId={departmentId}
                groupId={groupId}
                sub={viewSub}
                query={query}
                sort={viewSort}
                counts={facets.groups}
              />
            </Pill>

            <FacetPill id="brands" label="Brand" options={facets.brands} selected={view.brands} openPill={openPill} setOpenPill={setOpenPill} onPick={(v) => toggle("brands", v)} />
            <PricePill
              key={`${view.minPrice ?? ""}-${view.maxPrice ?? ""}`}
              filters={view}
              openPill={openPill}
              setOpenPill={setOpenPill}
              onApply={(min, max) => go({ ...view, minPrice: min, maxPrice: max })}
            />
            <FacetPill id="sizes" label="Mărime" options={facets.sizes} selected={view.sizes} openPill={openPill} setOpenPill={setOpenPill} onPick={(v) => toggle("sizes", v)} />
            <FacetPill id="colours" label="Culoare" options={facets.colours} selected={view.colours} openPill={openPill} setOpenPill={setOpenPill} onPick={(v) => toggle("colours", v)} swatches />
            <FacetPill id="conditions" label="Stare" options={facets.conditions} selected={view.conditions} openPill={openPill} setOpenPill={setOpenPill} onPick={(v) => toggle("conditions", v)} />

            <button
              type="button"
              onClick={() => go({ ...view, onSale: !view.onSale })}
              aria-pressed={view.onSale}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-lg border px-3.5 text-[14px] font-medium transition-[color,border-color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
                view.onSale ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-neutral-900 hover:border-neutral-400",
              )}
            >
              <span
                className={cn(
                  "flex h-[17px] w-[17px] items-center justify-center rounded-[4px] border transition-colors duration-150",
                  view.onSale ? "border-white bg-white text-neutral-900" : "border-neutral-400",
                )}
              >
                {view.onSale && <Check className="h-[12px] w-[12px]" strokeWidth={3.4} />}
              </span>
              La reducere
            </button>

            <Pill
              id="sort"
              label="Sortează"
              icon={<ArrowUpDown className="h-4 w-4 text-neutral-500" />}
              value={SORTS.find((s) => s.id === viewSort)?.label ?? ""}
              // Lit only once you have CHOSEN an order, not because there is one.
              active={viewSort !== "new"}
              open={openPill === "sort"}
              onOpen={setOpenPill}
              className="ml-auto"
            >
              <div className="py-1">
                {SORTS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => go(view, { sort: s.id })}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] transition-colors duration-150 hover:bg-neutral-50 active:bg-neutral-100",
                      s.id === viewSort ? "font-semibold text-neutral-900" : "text-neutral-700",
                    )}
                  >
                    <span className="flex-1">{s.label}</span>
                    {s.id === viewSort && <Check className="h-[15px] w-[15px]" strokeWidth={2.6} />}
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
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 py-1.5 pl-3.5 pr-2.5 text-[13.5px] font-medium text-neutral-800 transition-[background-color,transform] duration-150 ease-out hover:bg-neutral-200 active:scale-[0.96]"
                >
                  {c.label}
                  <X className="h-[14px] w-[14px] text-neutral-500" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearFilters}
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
        <div className={cn("transition-opacity duration-200", waiting && "pointer-events-none opacity-[0.55]")}>
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
                      onClick={() => go(withoutFilter(view, e.key))}
                      className="inline-flex h-11 items-center gap-2 rounded-lg border border-neutral-300 px-4 text-[14.5px] font-medium text-neutral-900 hover:border-neutral-400"
                    >
                      Fără {e.label}
                      <span className="text-[13px] font-semibold text-neutral-500">{e.count}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : viewSub ? (
              /* THE LEAF IS THE MOST LIKELY REASON, AND IT IS NOT A FILTER.
                 `dropSuggestions` only ever offers brands, sizes, colours,
                 condition and price, so an empty Femei › Haine › Salopete with
                 nothing else applied got "try another term or category" — a
                 sentence, on a page whose one useful action is one level up.
                 The rail above has Toate highlighted, but the rail is six
                 screens away by the time you have read this. */
              <p className="mt-1.5 text-[14.5px] text-neutral-500">
                Nu există anunțuri în {subLabel?.toLowerCase()} deocamdată.
              </p>
            ) : (
              <p className="mt-1.5 text-[14.5px] text-neutral-500">
                {active > 0 ? "Încearcă să elimini câteva filtre." : "Încearcă alt termen sau altă categorie."}
              </p>
            )}

            {/* ONE ROW, WITH AIR IN IT. These were two siblings each carrying
                its own `mt-5` and nothing between them, so on the one page that
                draws both — an empty leaf that also has filters on it — they met
                edge to edge and read as a single black slab split by a hairline.
                A flex row with a gap is the fix; `justify-center` because the
                whole block is centred and `flex-wrap` because two 200px buttons
                do not fit side by side on a phone. */}
            {(viewSub || active > 0) && (
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                {viewSub && (
                  <button
                    type="button"
                    onClick={() => go(view, { sub: null })}
                    className="inline-flex h-11 items-center rounded-lg bg-neutral-900 px-6 text-[15px] font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]"
                  >
                    Vezi tot din {group?.label ?? dept?.label ?? "categorie"}
                  </button>
                )}
                {active > 0 && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className={cn(
                      "inline-flex h-11 items-center rounded-lg px-6 text-[15px] font-semibold transition-[background-color,border-color,transform] duration-150 ease-out active:scale-[0.97]",
                      // TWO BLACK BUTTONS SIDE BY SIDE IS TWO PRIMARY ACTIONS,
                      // which is none. Widening to the whole group is the one
                      // more likely to be what somebody wants, so it keeps the
                      // fill and this becomes the quiet one — but only when both
                      // are drawn. On its own it is still the primary thing.
                      viewSub
                        ? "border border-neutral-300 bg-white text-neutral-900 hover:border-neutral-400"
                        : "bg-neutral-900 text-white",
                    )}
                  >
                    Șterge filtrele
                  </button>
                )}
              </div>
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

        {pages > 1 && <Pager page={page} pages={pages} onGo={(n) => go(view, { page: n })} />}
      </div>

      <MobileFilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        pool={[]}
        facets={facets}
        departmentId={departmentId}
        // The group is the PATH here, so "Șterge tot" clears the filters rather
        // than walking you up a level — see the note on the prop.
        lockedGroup={groupId}
        value={view}
        onApply={(next) => go(next)}
        // Sort lives inside the sheet on a phone — one trip for one decision.
        // The separate bottom sheet stays for the Sortează button beside Filtre,
        // which is the shortcut for somebody who only wants that.
        sort={viewSort}
        onSortChange={(s) => go(view, { sort: s })}
      />
      <MobileSortSheet open={sortOpen} onClose={() => setSortOpen(false)} value={viewSort} onPick={(s) => go(view, { sort: s })} />
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

/** Wide enough for the longest option list, and the number the flip below
 *  measures against. `min-w-[240px]` plus the border. */
const PANEL_W = 244

/**
 * ===========================================================================
 *  A DROPDOWN PILL
 * ===========================================================================
 *
 * ONE OPEN AT A TIME, held by the parent rather than by each pill: seven pills
 * each owning a boolean is seven panels that can all be open at once, stacked
 * over the first row of listings.
 *
 * ---------------------------------------------------------------------------
 * IT MOVES, AND BEFORE THIS IT DID NOT
 * ---------------------------------------------------------------------------
 * `{open && <panel/>}` is a panel that EXISTS or does not. There is no state
 * between the two, so a filter menu appeared as a hard rectangle and vanished
 * the same way — the one control on this page you press most often was the only
 * surface in the app that cut rather than moved. Everything else here already
 * travels: the sheet slides, the search panel fades, the drill-downs push.
 *
 * So the mount is HELD for the length of the close, the same two-state pattern
 * the search overlay and the filter sheet use, and the panel fades and rises
 * 6px on the way in. 170/200ms — a menu that takes 300ms to answer a click on
 * the thing under your cursor reads as slow, and the pair being a fraction
 * apart is what stops it arriving as a flat sheet.
 *
 * `transform-origin` is the corner it is anchored to, so it grows OUT OF the
 * pill rather than floating up beside it, and `pointer-events: none` from the
 * frame the close starts means a leaving panel never swallows the click meant
 * for what is behind it.
 *
 * ---------------------------------------------------------------------------
 * AND IT FLIPS RATHER THAN LEAVING THE WINDOW
 * ---------------------------------------------------------------------------
 * `left-0` on a 244px panel hanging off a pill that is itself against the right
 * edge — Sortează is `ml-auto`, so it always is — puts a third of the menu past
 * the viewport, with the page's horizontal scrollbar as the only clue. Measured
 * on open rather than hard-coded per pill: the row WRAPS at narrow widths, so
 * which pill ends up against the edge is a function of the window, not of the
 * markup.
 */
function Pill({
  id,
  label,
  value,
  open,
  onOpen,
  children,
  className,
  active,
  icon,
}: {
  id: string
  label: string
  value?: string
  open: boolean
  onOpen: (id: string | null) => void
  children: React.ReactNode
  className?: string
  /**
   * WHETHER THIS PILL IS *APPLIED*, which is not the same question as whether
   * it has a value to show.
   *
   * Sort always has one — there is always an order — so it drew itself with the
   * black outline every other pill uses to mean "you have narrowed by this", on
   * every page, forever. A permanent emphasis is not emphasis: it made the one
   * control nobody had touched the loudest thing in the row, and it made the
   * row's own language a lie about the other six.
   */
  active?: boolean
  icon?: React.ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [align, setAlign] = useState<"left" | "right">("left")

  /** Kept mounted while it closes; `shown` is the class that opens it. */
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)

  useLayoutEffect(() => {
    if (!open) return
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAlign(r.left + PANEL_W + 16 > window.innerWidth ? "right" : "left")
  }, [open])

  useEffect(() => {
    if (open) {
      setMounted(true)
      // TWO FRAMES. React can commit inside the frame it was scheduled in, and a
      // transition whose start and end land in one paint simply does not run —
      // the same reason the filter sheet takes two.
      const a = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(a)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 210)
    return () => clearTimeout(t)
  }, [open])

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => onOpen(open ? null : id)}
        aria-expanded={open}
        className={cn(
          // `active:scale-[0.97]` is the whole of "snappy" on a control that
          // otherwise gives nothing back until a round trip finishes.
          "inline-flex h-10 items-center gap-1.5 rounded-lg border px-3.5 text-[14px] font-medium transition-[color,border-color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
          (active ?? !!value) || open
            ? "border-neutral-900 text-neutral-900"
            : "border-neutral-300 text-neutral-900 hover:border-neutral-400",
        )}
      >
        {icon}
        {label}
        {value && <span className="max-w-[140px] truncate text-neutral-500">· {value}</span>}
        <ChevronDown className={cn("h-4 w-4 text-neutral-400 transition-transform duration-200 ease-out", open && "rotate-180")} />
      </button>
      {/* Clicking anywhere else closes it. A pill that only closes on its own
          button is one you have to go back to, which is why the page ends up
          with a panel over it while you scroll. Only while it is OPEN — a scrim
          that outlived the close would eat the first click after it. */}
      {open && (
        <button aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => onOpen(null)} />
      )}
      {mounted && (
        <div
          className={cn(
            "absolute top-[calc(100%+6px)] z-40 min-w-[240px] rounded-xl border border-neutral-200 bg-white py-1 shadow-[0_16px_40px_-12px_rgba(15,15,15,0.24)]",
            align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left",
          )}
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0) scale(1)" : "translateY(-6px) scale(0.97)",
            transition: "opacity 170ms cubic-bezier(0.16,1,0.3,1), transform 200ms cubic-bezier(0.16,1,0.3,1)",
            pointerEvents: shown ? "auto" : "none",
            willChange: "opacity, transform",
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * ===========================================================================
 *  THE WHOLE TAXONOMY, INSIDE ONE PILL
 * ===========================================================================
 *
 * Departments → their groups → their leaves, replacing each other in place with
 * a back row at the top, which is the same object the search panel's browse and
 * the sell form's picker are — and the same `sub-push` / `sub-pop` movement, so
 * the app has one grammar for going a level deeper rather than three.
 *
 * ---------------------------------------------------------------------------
 * IT OPENS WHERE YOU ARE, NOT AT THE TOP
 * ---------------------------------------------------------------------------
 * On /shop/women/clothing it opens on Femei's groups with Haine marked, because
 * the reason somebody opens this pill on that page is to go SIDEWAYS — to
 * Pantofi, to Genți — and making them walk down from the top to do it is two
 * presses of ceremony before the one that means something.
 *
 * ---------------------------------------------------------------------------
 * LINKS, AND THEY CARRY THE SEARCH
 * ---------------------------------------------------------------------------
 * `go()` cannot express this: it builds a path from the department the page is
 * ALREADY in, so it can move you between groups and never between departments.
 * These are real hrefs — middle-clickable, copyable — and they keep `q` and the
 * sort while dropping the attribute filters, which is correct rather than lazy:
 * a size 38 and a brand chosen inside Femei · Încălțăminte mean nothing in
 * Divertisment, and carrying them across is how somebody lands on an empty page
 * with three chips they never applied to this category.
 */
function CategoryMenu({
  departmentId,
  groupId,
  sub,
  query,
  sort,
  counts,
}: {
  departmentId: string | null
  groupId: string | null
  sub: string | null
  query: string
  sort: FeedSort
  /** Real counts, but only for the groups of the department the page is in —
   *  the facet query is scoped to it. Shown where known, omitted where not,
   *  rather than printing a 0 that means "not counted". */
  counts: Facet[]
}) {
  const [dept, setDept] = useState<DepartmentNavItem | null>(
    () => DEPARTMENT_NAV.find((d) => d.id === departmentId) ?? null,
  )
  const [grp, setGrp] = useState<{ id: string; label: string } | null>(() => {
    const d = DEPARTMENT_NAV.find((x) => x.id === departmentId)
    const g = d?.subcategories.find((s) => s.id === groupId)
    return g ? { id: g.id, label: g.label } : null
  })
  const [dir, setDir] = useState<"push" | "pop">("push")

  const href = (d: string | null, g: string | null, s: string | null) => {
    const p = new URLSearchParams()
    if (query) p.set("q", query)
    if (s) p.set("sub", s)
    if (sort !== "new") p.set("sort", sort)
    const qs = p.toString()
    return `${categoryPath(d, g)}${qs ? `?${qs}` : ""}`
  }

  const leaves = dept && grp ? groupsForDepartment(dept.id).find((g: { id: string }) => g.id === grp.id)?.items ?? [] : []
  const level = dept ? (grp ? 2 : 1) : 0
  const countOf = (id: string) => counts.find((c) => c.value === id)?.count

  return (
    <div className="max-h-[340px] overflow-y-auto overflow-x-hidden">
      {level > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-1 border-b border-neutral-100 bg-white px-1.5 py-1.5">
          <button
            type="button"
            onClick={() => {
              setDir("pop")
              if (grp) setGrp(null)
              else setDept(null)
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-700 transition-colors hover:bg-neutral-100"
            aria-label="Înapoi"
          >
            <ChevronLeft className="h-[17px] w-[17px]" />
          </button>
          <span className="truncate text-[13.5px] font-semibold text-neutral-900">
            {level === 2 ? grp?.label : dept?.label}
          </span>
        </div>
      )}

      <div key={`${dept?.id ?? "root"}-${grp?.id ?? ""}`} className={cn(dir === "push" ? "sub-push" : "sub-pop", "py-1")}>
        {level === 0 && (
          <>
            <MenuLink href={href(null, null, null)} label="Toate categoriile" strong={!departmentId} />
            {DEPARTMENT_NAV.map((d) => (
              <MenuRow
                key={d.id}
                label={d.label}
                on={d.id === departmentId}
                onClick={() => {
                  setDir("push")
                  setDept(d)
                }}
              />
            ))}
          </>
        )}

        {level === 1 && dept && (
          <>
            <MenuLink href={href(dept.id, null, null)} label={`Toate · ${dept.label}`} strong={!groupId} />
            {dept.subcategories.map((g) => (
              <MenuRow
                key={g.id}
                label={g.label}
                count={countOf(g.id)}
                on={g.id === groupId}
                onClick={() => {
                  setDir("push")
                  setGrp({ id: g.id, label: g.label })
                }}
              />
            ))}
          </>
        )}

        {level === 2 && dept && grp && (
          <>
            <MenuLink href={href(dept.id, grp.id, null)} label={`Toate · ${grp.label}`} strong={!sub} />
            {leaves.map((leaf) => (
              <MenuLink
                key={leaf.id}
                href={href(dept.id, grp.id, leaf.id)}
                label={leaf.label}
                strong={leaf.id === sub}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

/** A level that goes deeper. */
function MenuRow({
  label,
  count,
  on,
  onClick,
}: {
  label: string
  count?: number
  on?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] transition-colors duration-150 hover:bg-neutral-50 active:bg-neutral-100",
        on ? "font-semibold text-neutral-900" : "text-neutral-700",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="shrink-0 text-[12.5px] text-neutral-400">{count}</span>}
      <ChevronRight className="h-[16px] w-[16px] shrink-0 text-neutral-300" />
    </button>
  )
}

/** A level that IS a page. */
function MenuLink({ href, label, strong }: { href: string; label: string; strong?: boolean }) {
  return (
    <SmartLink
      href={href}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-[14px] transition-colors duration-150 hover:bg-neutral-50 active:bg-neutral-100",
        strong ? "font-semibold text-neutral-900" : "text-neutral-700",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </SmartLink>
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
      {/* Mounted with the panel, which is what lets it capture the selection at
          OPEN time — see FacetList. */}
      <FacetList options={options} selected={selected} onPick={onPick} swatches={swatches} label={label} />
    </Pill>
  )
}

/**
 * The body of a facet dropdown: a field when the list is long enough to need
 * one, then the options with whatever was already ticked at the top.
 *
 * A COMPONENT RATHER THAN MARKUP INSIDE FacetPill, because it has to MOUNT with
 * the panel. `pinned` is captured once, on mount, so ticking a row does not make
 * it leap to the top from under the cursor — and the panel is only rendered
 * while it is open, so "on mount" and "when it opened" are the same moment.
 */
function FacetList({
  options,
  selected,
  onPick,
  swatches,
  label,
}: {
  options: Facet[]
  selected: string[]
  onPick: (value: string) => void
  swatches?: boolean
  label: string
}) {
  const [term, setTerm] = useState("")
  const [pinned] = useState(selected)
  const searchable = options.length >= FACET_SEARCH_MIN
  const shown = useMemo(() => orderFacetOptions(options, pinned, term), [options, pinned, term])

  return (
    <div className="min-w-[240px]">
      {searchable && (
        <div className="border-b border-neutral-100 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-neutral-400" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={`Caută ${label.toLowerCase()}`}
              className="h-9 w-full rounded-lg border border-neutral-200 bg-neutral-50 pl-8 pr-2.5 text-[13.5px] text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white"
            />
          </div>
        </div>
      )}
      <div className="max-h-[300px] overflow-y-auto py-1">
        {shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-neutral-400">Niciun rezultat</p>
        ) : (
          shown.map((o) => {
            const on = selected.some((x) => x.toLowerCase() === o.value.toLowerCase())
            const hex = swatches ? colourHex(o.value) : null
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => onPick(o.value)}
                // A ZERO IS SHOWN AND CANNOT BE PRESSED. The options are a
                // vocabulary now, so hiding the empty ones would make a category
                // with twelve sizes look like one with three — see
                // `facetsWithVocabulary`. Ticked ones stay live whatever their
                // count, or you could apply a filter and not be able to undo it.
                disabled={o.count === 0 && !on}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] transition-colors duration-150",
                  o.count === 0 && !on
                    ? "cursor-not-allowed text-neutral-300"
                    : "text-neutral-700 hover:bg-neutral-50 active:bg-neutral-100",
                )}
              >
                <span
                  className={cn(
                    "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] border transition-colors duration-150",
                    on ? "border-neutral-900 bg-neutral-900 text-white" : o.count === 0 ? "border-neutral-200" : "border-neutral-300",
                  )}
                >
                  {on && <Check className="h-[12px] w-[12px]" strokeWidth={3.4} />}
                </span>
                {hex && <span aria-hidden className="h-[16px] w-[16px] shrink-0 rounded-full ring-1 ring-black/10" style={{ backgroundColor: hex }} />}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <span className="shrink-0 text-[12.5px] text-neutral-400">{o.count}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
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

  const btn =
    "flex h-10 min-w-[40px] items-center justify-center rounded-lg px-3 text-[14.5px] font-medium transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.94]"
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
