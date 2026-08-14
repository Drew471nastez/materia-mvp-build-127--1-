"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react"

import {
  EMPTY_FILTERS,
  SORTS,
  applyFeedFilters,
  colourHex,
  countActiveFilters,
  facetsWithCounts,
  type Facet,
  type FeedFilters,
  type FeedSort,
} from "@/lib/marketplace/feed-filters"
import { DEPARTMENT_NAV } from "@/lib/marketplace/department-nav"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE FILTER SHEET
 * ===========================================================================
 *
 * A full-screen sheet with a list of facets, each opening its own level, and a
 * footer that says how many listings you would be left with.
 *
 * ---------------------------------------------------------------------------
 * THE COUNT IS ON THE BUTTON, AND IT IS EXACT
 * ---------------------------------------------------------------------------
 * The listings are already on the client, so the answer to "how many" is a
 * filter over an array rather than a request. That is the difference between a
 * sheet you tune and one you gamble with: every tap moves a real number at the
 * bottom of the screen, and "Vezi 12 articole" is a promise the next screen
 * keeps. A sheet that cannot count is a sheet you have to apply to find out,
 * and then come back and undo.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IS APPLIED UNTIL YOU SAY SO
 * ---------------------------------------------------------------------------
 * The sheet edits a DRAFT. Live-applying under an open sheet re-sorts the grid
 * you cannot see and destroys the pool the facets were counted from — press
 * "Negru", and Brand suddenly offers three brands instead of forty, because the
 * options are now being counted from the black things. Facets are counted from
 * the pool as it arrives; only the footer's number reflects the draft.
 *
 * ---------------------------------------------------------------------------
 * LEVELS, NOT ACCORDIONS
 * ---------------------------------------------------------------------------
 * Seven expandable sections on a phone is a page that changes height under your
 * thumb and a scroll position that means nothing. Each facet is a level, on the
 * same `sub-push` / `sub-pop` the sell form and the category menus use, so a
 * drill-down anywhere in this app is one gesture.
 */

export function MobileFilterSheet({
  open,
  onClose,
  pool,
  facets: givenFacets,
  departmentId,
  lockedGroup = null,
  value,
  onApply,
  sort,
  onSortChange,
}: {
  open: boolean
  onClose: () => void
  /** The listings as they arrive, before the draft is applied — see the note. */
  pool: any[]
  /**
   * Facets computed elsewhere, for the results page.
   *
   * The feed counts them from the hundred listings it already holds; the results
   * page counts them in SQL across the whole category, because the brands on
   * page one are not the brands in the category. Same sheet either way — what
   * differs is who did the counting, and a second sheet for a second source
   * would be two sheets to keep saying the same thing.
   */
  facets?: {
    groups: Facet[]
    brands: Facet[]
    sizes: Facet[]
    colours: Facet[]
    conditions: Facet[]
  }
  departmentId?: string | null
  /**
   * THE GROUP THIS SURFACE IS *ABOUT*, when it is a place rather than a filter.
   *
   * On the results page the group is the PATH — /shop/women/clothing — and it is
   * in the trail, the h1 and the URL somebody shared. "Șterge tot" clearing it
   * meant unticking two brands walked you up a level to a different page, with
   * only the heading to tell you. The feed passes nothing, because there the
   * group really is one filter among several over an array it already holds.
   *
   * The Categorie row still edits it either way — explicitly changing where you
   * are is exactly what that row is for. This governs the "clear" shortcut only.
   */
  lockedGroup?: string | null
  value: FeedFilters
  onApply: (next: FeedFilters) => void
  /** Present only where sort belongs in the sheet — see the first row. */
  sort?: FeedSort
  onSortChange?: (s: FeedSort) => void
}) {
  const [draft, setDraft] = useState<FeedFilters>(value)
  const [draftSort, setDraftSort] = useState<FeedSort>(sort ?? "new")
  const [facet, setFacet] = useState<null | "sort" | "group" | "brands" | "sizes" | "colours" | "conditions" | "price">(null)
  const [popped, setPopped] = useState(false)

  /** True while the panel is on screen and travelling — see `leaving`. */
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (open) {
      setLeaving(true)
      // Two frames, so the browser paints the closed position once before the
      // class that opens it lands. One frame is not reliably enough: React can
      // commit inside the same frame it was scheduled in, and a transition whose
      // start and end are set in one paint simply does not run.
      const a = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(a)
    }
    setShown(false)
    const t = setTimeout(() => setLeaving(false), 320)
    return () => clearTimeout(t)
  }, [open])

  // Reset to whatever is actually applied each time it opens, so an abandoned
  // edit is abandoned rather than waiting there the next time.
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(value)
      setDraftSort(sort ?? "new")
      setFacet(null)
      setPopped(false)
    }
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  AN OPTION THAT LEADS TO NOTHING IS NOT AN OPTION
   * ═════════════════════════════════════════════════════════════════════════
   *
   * This counted every facet over the WHOLE pool, ignoring the draft — so on the
   * feed, after picking Nike, the Stare level still listed all five conditions
   * including the four no Nike listing has. Every one of those is a tap that
   * empties the screen, offered by the control that is supposed to be narrowing
   * it. The results page never had this: it is handed facets that were counted
   * in SQL with the other filters applied.
   *
   * `facetsWithCounts` is that same cross-filter, and the rule it implements is
   * the one thing that stops a facet list eating itself: each list is counted
   * with the OTHER filters applied but NOT its own. Without the exception,
   * picking "Negru" would leave Culoare offering only Negru, and there would be
   * no way back to the other colours except undoing it.
   *
   * Counted from the pool as it ARRIVES, not from the filtered result, for the
   * same reason — see the note at the top of this file.
   */
  const derived = useMemo(() => facetsWithCounts(pool, departmentId, draft), [pool, departmentId, draft])
  const facets = givenFacets ?? derived
  /**
   * The count is only shown where it can be TRUE.
   *
   * On the feed the listings are on the client, so every tap moves an exact
   * number and "Vezi 12 articole" is a promise the next screen keeps. On the
   * results page the answer is a SQL count, and re-running it per keystroke to
   * put a number on a button is a request a second for a number nobody asked
   * for. A missing count is honest; a stale one is not.
   */
  const resultCount = useMemo(
    () => (pool.length > 0 ? applyFeedFilters(pool, draft).length : null),
    [pool, draft],
  )
  const active = countActiveFilters(draft)

  /**
   * THE CATEGORIES THIS SHEET CAN OFFER.
   *
   * Inside a department, the counted list the facets produced — those are real
   * numbers over the rows in scope, and a group with none of them is not shown.
   *
   * Outside one — a search, or the whole catalogue — there is nothing to count
   * against, so the TAXONOMY is offered instead, every group under its
   * department's name so thirty-seven rows read as five lists rather than one.
   * Uncounted rather than counted as zero: "we did not count this" and "there
   * are none of these" are different statements and only one of them is true.
   */
  const groupOptions = useMemo<Facet[]>(() => {
    if (facets.groups.length > 0) return facets.groups
    return DEPARTMENT_NAV.flatMap((d) =>
      d.subcategories.map((g) => ({ value: g.id, label: `${d.label} · ${g.label}`, count: 0 })),
    )
  }, [facets.groups])

  /**
   * IT SLIDES UP, AND IT STAYS MOUNTED WHILE IT SLIDES BACK DOWN.
   *
   * `if (!open) return null` on its own is a sheet that appears and vanishes:
   * there is nothing on screen to animate out of, so the close is a cut. The
   * mount is kept for the length of the travel and only then dropped, which is
   * the same two-state pattern the search overlay uses — see
   * components/explore/mobile-search-overlay.tsx.
   */
  if (!open && !leaving) return null

  const toggle = (key: "brands" | "sizes" | "colours" | "conditions", v: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(v) ? d[key].filter((x) => x !== v) : [...d[key], v],
    }))

  const open1 = (next: typeof facet) => {
    setPopped(false)
    setFacet(next)
  }
  const back = () => {
    setPopped(true)
    setFacet(null)
  }

  const rows: { id: Exclude<typeof facet, null>; label: string; value: string }[] = [
    // SORT IS THE FIRST ROW, not a separate button somewhere else on the page.
    // It is the same question as the filters — "which of these, and in what
    // order" — and splitting it into a second sheet means two trips for one
    // decision. It is `sortValue`, so it is never blank: there is always a sort.
    ...(onSortChange ? [{ id: "sort" as const, label: "Sortare după", value: SORTS.find((x) => x.id === draftSort)?.label ?? "" }] : []),
    /**
     * CATEGORIE IS ALWAYS OFFERED.
     *
     * It appeared only when `facets.groups` had something in it, and that list
     * is empty unless the surface is already inside a department — so the one
     * thing you could not narrow by category was a SEARCH, which is the first
     * filter anybody reaches for. `groupOptions` falls back to the whole
     * taxonomy, so /shop?q=nike can be taken into Bărbați · Haine from here.
     */
    {
      id: "group" as const,
      label: "Categorie",
      value: draft.group ? groupOptions.find((g) => g.value === draft.group)?.label ?? "" : "",
    },
    { id: "brands", label: "Brand", value: summarise(draft.brands, facets.brands) },
    { id: "price", label: "Preț", value: priceSummary(draft) },
    { id: "sizes", label: "Mărime", value: summarise(draft.sizes, facets.sizes) },
    { id: "colours", label: "Culoare", value: summarise(draft.colours, facets.colours) },
    { id: "conditions", label: "Stare", value: summarise(draft.conditions, facets.conditions) },
  ]

  return (
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-white"
      style={{
        height: "100dvh",
        transform: shown ? "translateY(0)" : "translateY(100%)",
        transition: "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
        willChange: "transform",
      }}
    >
      {/* THREE THINGS IN THE HEADER, and the two words are the two ways out.
          A bare × asks somebody to work out whether it discards or applies;
          "Închide" says which, and "Șterge tot" sits where the other destructive
          word would be, far from it. The title is centred between them so the
          row reads left-to-right as leave / where you are / start again. */}
      <div
        className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-neutral-100 px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.85rem)" }}
      >
        <button
          type="button"
          onClick={facet ? back : onClose}
          className="justify-self-start text-[15px] font-medium text-neutral-600 active:opacity-60"
        >
          {facet ? "Înapoi" : "Închide"}
        </button>
        <h2 className="text-[16px] font-bold tracking-[-0.01em] text-neutral-900">
          {facet ? rows.find((r) => r.id === facet)?.label ?? "Filtru" : "Filtru"}
        </h2>
        <button
          type="button"
          onClick={() => setDraft((d) => ({ ...EMPTY_FILTERS, group: lockedGroup ?? d.group }))}
          disabled={active === 0}
          className="justify-self-end text-[15px] font-medium text-[#7c3aed] transition-opacity active:opacity-60 disabled:opacity-30"
        >
          Șterge tot
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {facet ? (
          <div className="sub-push pb-6">
            {/* No second back button. The header's left word IS the back — one
                way out of a level, not two of them a scroll apart. */}
            {facet === "sort" ? (
              <div>
                {SORTS.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setDraftSort(o.id)
                      back()
                    }}
                    className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3.5 text-left active:bg-neutral-50"
                  >
                    <span className="flex-1 text-[15px] font-medium text-neutral-800">{o.label}</span>
                    {o.id === draftSort && <Check className="h-[18px] w-[18px] text-neutral-900" strokeWidth={2.6} />}
                  </button>
                ))}
              </div>
            ) : facet === "price" ? (
              <PriceLevel draft={draft} setDraft={setDraft} />
            ) : (
              <OptionLevel
                options={
                  facet === "group"
                    ? groupOptions
                    : facet === "brands"
                      ? facets.brands
                      : facet === "sizes"
                        ? facets.sizes
                        : facet === "colours"
                          ? facets.colours
                          : facets.conditions
                }
                swatches={facet === "colours"}
                selected={
                  facet === "group"
                    ? draft.group
                      ? [draft.group]
                      : []
                    : draft[facet as "brands" | "sizes" | "colours" | "conditions"]
                }
                onPick={(v) =>
                  facet === "group"
                    ? setDraft((d) => ({ ...d, group: d.group === v ? null : v }))
                    : toggle(facet as "brands" | "sizes" | "colours" | "conditions", v)
                }
              />
            )}
          </div>
        ) : (
          <div className={cn("pb-6", popped && "sub-pop")}>
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => open1(r.id)}
                className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-4 text-left active:bg-neutral-50"
              >
                <span
                  className={cn(
                    "text-[16px]",
                    r.value ? "font-semibold text-neutral-900" : "font-medium text-neutral-800",
                  )}
                >
                  {r.label}
                </span>
                <span className="ml-auto min-w-0 truncate text-[14px] text-neutral-500">{r.value}</span>
                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-neutral-300" />
              </button>
            ))}

            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, onSale: !d.onSale }))}
              className="flex w-full items-center gap-3 px-4 py-4 text-left active:bg-neutral-50"
            >
              <span
                className={cn(
                  "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border",
                  draft.onSale ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300",
                )}
              >
                {draft.onSale && <Check className="h-[15px] w-[15px]" strokeWidth={3} />}
              </span>
              <span className="text-[16px] font-medium text-neutral-800">La reducere</span>
            </button>

            {/* THE APPLIED FILTERS, AS CHIPS YOU CAN TAKE OFF ONE AT A TIME.
                The rows above tell you a facet HAS a value; these tell you which,
                and remove it where you are reading it. Without them, dropping one
                brand out of three means opening Brand, finding it in a list of
                forty, and unticking it. */}
            {active > 0 && (
              <div className="flex flex-wrap gap-2 px-4 pt-4">
                {chipsFor(draft, facets).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setDraft(c.remove)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 py-2 pl-3.5 pr-2.5 text-[13.5px] font-medium text-neutral-800 active:bg-neutral-200"
                  >
                    {c.label}
                    <X className="h-[15px] w-[15px] text-neutral-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        className="shrink-0 border-t border-neutral-100 px-4 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
      >
        {resultCount != null && (
          <p className="pb-3 text-center text-[13.5px] font-medium text-neutral-500">
            {resultCount === 1 ? "1 articol" : `${resultCount} articole`}
          </p>
        )}
        {/* ONE BUTTON, FULL WIDTH. "Șterge tot" moved to the header, where a
            destructive action belongs — beside it, at the same weight as the
            thing you actually came to press, it was a fifty-fifty choice
            between applying your work and throwing it away. */}
        <button
          type="button"
          onClick={() => {
            onApply(draft)
            onSortChange?.(draftSort)
            onClose()
          }}
          className="h-12 w-full rounded-xl bg-neutral-900 text-[15.5px] font-semibold text-white active:bg-neutral-800"
        >
          Afișare rezultate
        </button>
      </div>
    </div>
  )
}

function OptionLevel({
  options,
  selected,
  onPick,
  swatches = false,
}: {
  options: Facet[]
  selected: string[]
  onPick: (value: string) => void
  swatches?: boolean
}) {
  if (options.length === 0) {
    return <p className="px-4 py-8 text-center text-[14px] text-neutral-400">Nimic de filtrat aici.</p>
  }
  return (
    <div>
      {options.map((o) => {
        const on = selected.includes(o.value)
        const hex = swatches ? colourHex(o.value) : null
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            className="flex w-full items-center gap-3 border-b border-neutral-100 px-4 py-3.5 text-left active:bg-neutral-50"
          >
            {hex && (
              <span
                aria-hidden
                className="h-[18px] w-[18px] shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: hex }}
              />
            )}
            <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-neutral-800">{o.label}</span>
            {/* The count is the whole reason these are derived from the pool: it
                says what pressing this will cost you before you press it. */}
            <span className="shrink-0 text-[13px] text-neutral-400">{o.count}</span>
            <span
              className={cn(
                "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border",
                on ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300",
              )}
            >
              {on && <Check className="h-[15px] w-[15px]" strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function PriceLevel({
  draft,
  setDraft,
}: {
  draft: FeedFilters
  setDraft: (fn: (d: FeedFilters) => FeedFilters) => void
}) {
  const field =
    "h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-[16px] text-neutral-900 outline-none focus:border-neutral-400"
  // `inputMode="numeric"` rather than `type="number"`: the spinner is useless on
  // a phone and a number input silently discards anything it cannot parse while
  // you are still typing it.
  const read = (v: string) => {
    const n = Number(v.replace(/[^\d]/g, ""))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <input
        inputMode="numeric"
        placeholder="Min"
        defaultValue={draft.minPrice ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, minPrice: read(e.target.value) }))}
        className={field}
      />
      <span className="text-neutral-400">–</span>
      <input
        inputMode="numeric"
        placeholder="Max"
        defaultValue={draft.maxPrice ?? ""}
        onChange={(e) => setDraft((d) => ({ ...d, maxPrice: read(e.target.value) }))}
        className={field}
      />
      <span className="shrink-0 text-[14px] font-medium text-neutral-500">RON</span>
    </div>
  )
}

function summarise(selected: string[], options: Facet[]): string {
  if (selected.length === 0) return ""
  if (selected.length === 1) return options.find((o) => o.value === selected[0])?.label ?? selected[0]
  return `${selected.length} selectate`
}

function priceSummary(f: FeedFilters): string {
  if (f.minPrice != null && f.maxPrice != null) return `${f.minPrice}–${f.maxPrice} RON`
  if (f.minPrice != null) return `peste ${f.minPrice} RON`
  if (f.maxPrice != null) return `sub ${f.maxPrice} RON`
  return ""
}

type Chip = { key: string; label: string; remove: (d: FeedFilters) => FeedFilters }

function chipsFor(f: FeedFilters, facets: ReturnType<typeof facetsWithCounts>): Chip[] {
  const out: Chip[] = []
  const label = (opts: Facet[], v: string) => opts.find((o) => o.value === v)?.label ?? v
  if (f.group) {
    out.push({
      key: `g:${f.group}`,
      label: label(facets.groups, f.group),
      remove: (d) => ({ ...d, group: null }),
    })
  }
  const lists: [keyof FeedFilters & ("brands" | "sizes" | "colours" | "conditions"), Facet[]][] = [
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
        remove: (d) => ({ ...d, [key]: d[key].filter((x) => x !== v) }),
      })
    }
  }
  if (f.minPrice != null || f.maxPrice != null) {
    out.push({ key: "price", label: priceSummary(f), remove: (d) => ({ ...d, minPrice: null, maxPrice: null }) })
  }
  if (f.onSale) out.push({ key: "sale", label: "La reducere", remove: (d) => ({ ...d, onSale: false }) })
  return out
}

/**
 * The sort sheet, which is a different KIND of control and is drawn as one.
 *
 * Sort is one choice out of four and it applies the moment you make it; filters
 * are many choices you tune and then commit. Giving sort the same full-screen
 * sheet with a Șterge tot and a Vezi articolele would be asking for a decision
 * and a confirmation where there is only ever one decision.
 */
export function MobileSortSheet({
  open,
  onClose,
  value,
  onPick,
}: {
  open: boolean
  onClose: () => void
  value: FeedSort
  onPick: (s: FeedSort) => void
}) {
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  /** Live drag offset in px, written to state because it drives one transform
   *  on one element — cheap enough, and it keeps the close in React's hands. */
  const [drag, setDrag] = useState(0)
  const startY = useRef(0)
  const dragging = useRef(false)

  useEffect(() => {
    if (open) {
      setLeaving(true)
      setDrag(0)
      const a = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(a)
    }
    setShown(false)
    const t = setTimeout(() => setLeaving(false), 300)
    return () => clearTimeout(t)
  }, [open])

  if (!open && !leaving) return null

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  IT DRAGS, AND IT ONLY DRAGS DOWN
   * ═══════════════════════════════════════════════════════════════════════
   *
   * A bottom sheet you can only dismiss with a button is a bottom sheet in
   * shape only — the gesture is what everybody reaches for first, and its
   * absence is the single loudest way a sheet reads as a web page.
   *
   * `Math.max(0, …)` is the whole of "only down". Letting it go up means a
   * sheet that lifts off the bottom of the screen and shows the page beneath
   * it, which is travel past the frame for no reason.
   *
   * A THIRD OF ITS HEIGHT, or a flick. Distance alone punishes a fast flick
   * that did not travel far; velocity alone dismisses a slow, deliberate nudge.
   * Either one closes it, which is what a sheet on iOS does.
   */
  const onDown = (y: number) => {
    dragging.current = true
    startY.current = y
  }
  const onMove = (y: number) => {
    if (!dragging.current) return
    setDrag(Math.max(0, y - startY.current))
  }
  const onUp = (h: number) => {
    if (!dragging.current) return
    dragging.current = false
    if (drag > Math.max(80, h * 0.33)) onClose()
    else setDrag(0)
  }

  return (
    /* z-[95] is ABOVE the tab bar, which is z-40. A sheet that stops short of it
       leaves a strip of navigation lit over the thing it is covering, and the
       scrim ends in a hard line across the bottom of the screen. */
    <div className="fixed inset-0 z-[95]" style={{ height: "100dvh" }}>
      <button
        type="button"
        aria-label="Închide"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        style={{
          // The scrim fades with the sheet and thins as it is dragged away, so
          // the page behind is already coming back before you let go.
          opacity: shown ? Math.max(0, 1 - drag / 260) : 0,
          transition: dragging.current ? "none" : "opacity 300ms ease-out",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pt-2"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)",
          transform: shown ? `translateY(${drag}px)` : "translateY(100%)",
          transition: dragging.current ? "none" : "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)",
          willChange: "transform",
        }}
        onTouchStart={(e) => onDown(e.touches[0].clientY)}
        onTouchMove={(e) => onMove(e.touches[0].clientY)}
        onTouchEnd={(e) => onUp(e.currentTarget.getBoundingClientRect().height)}
      >
        {/* The handle is a target as well as a sign: 24px of padding around a
            4px bar, because the thing you grab must be bigger than the thing
            you see. */}
        <div className="flex justify-center py-1.5">
          <div aria-hidden className="h-1 w-10 rounded-full bg-neutral-300" />
        </div>
        <h2 className="px-4 pb-2 pt-1 text-[17px] font-bold tracking-[-0.02em] text-neutral-900">Sortează</h2>
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              onPick(s.id)
              onClose()
            }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-neutral-50"
          >
            <span
              className={cn(
                "flex-1 text-[15.5px]",
                value === s.id ? "font-semibold text-neutral-900" : "font-medium text-neutral-700",
              )}
            >
              {s.label}
            </span>
            {value === s.id && <Check className="h-[19px] w-[19px] text-neutral-900" strokeWidth={2.6} />}
          </button>
        ))}
      </div>
    </div>
  )
}
