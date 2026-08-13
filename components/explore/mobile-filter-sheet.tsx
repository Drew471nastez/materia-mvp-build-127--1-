"use client"

import { useMemo, useState } from "react"
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react"

import {
  EMPTY_FILTERS,
  SORTS,
  applyFeedFilters,
  colourHex,
  countActiveFilters,
  facetsFrom,
  type Facet,
  type FeedFilters,
  type FeedSort,
} from "@/lib/marketplace/feed-filters"
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
  value,
  onApply,
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
  value: FeedFilters
  onApply: (next: FeedFilters) => void
}) {
  const [draft, setDraft] = useState<FeedFilters>(value)
  const [facet, setFacet] = useState<null | "group" | "brands" | "sizes" | "colours" | "conditions" | "price">(null)
  const [popped, setPopped] = useState(false)

  // Reset to whatever is actually applied each time it opens, so an abandoned
  // edit is abandoned rather than waiting there the next time.
  const [wasOpen, setWasOpen] = useState(false)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDraft(value)
      setFacet(null)
      setPopped(false)
    }
  }

  const derived = useMemo(() => facetsFrom(pool, departmentId), [pool, departmentId])
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

  if (!open) return null

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
    ...(facets.groups.length > 0
      ? [
          {
            id: "group" as const,
            label: "Categorie",
            value: draft.group ? facets.groups.find((g) => g.value === draft.group)?.label ?? "" : "",
          },
        ]
      : []),
    { id: "brands", label: "Brand", value: summarise(draft.brands, facets.brands) },
    { id: "price", label: "Preț", value: priceSummary(draft) },
    { id: "sizes", label: "Mărime", value: summarise(draft.sizes, facets.sizes) },
    { id: "colours", label: "Culoare", value: summarise(draft.colours, facets.colours) },
    { id: "conditions", label: "Stare", value: summarise(draft.conditions, facets.conditions) },
  ]

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-white" style={{ height: "100dvh" }}>
      <div
        className="flex shrink-0 items-center justify-between px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.85rem)" }}
      >
        <h2 className="text-[20px] font-bold tracking-[-0.02em] text-neutral-900">
          {facet ? rows.find((r) => r.id === facet)?.label ?? "Filtre" : "Filtre"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Închide"
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-neutral-900 active:bg-neutral-100"
        >
          <X className="h-[22px] w-[22px]" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {facet ? (
          <div className="sub-push pb-6">
            <button
              type="button"
              onClick={back}
              className="flex w-full items-center gap-2 px-4 py-3 text-[14px] font-medium text-neutral-500 active:bg-neutral-100"
            >
              <ChevronLeft className="h-[17px] w-[17px]" />
              Toate filtrele
            </button>

            {facet === "price" ? (
              <PriceLevel draft={draft} setDraft={setDraft} />
            ) : (
              <OptionLevel
                options={
                  facet === "group"
                    ? facets.groups
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
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTERS)}
            disabled={active === 0}
            className="h-12 flex-1 rounded-xl border border-neutral-300 text-[15px] font-semibold text-neutral-900 transition-opacity active:bg-neutral-50 disabled:opacity-40"
          >
            Șterge tot
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(draft)
              onClose()
            }}
            className="h-12 flex-1 rounded-xl bg-neutral-900 text-[15px] font-semibold text-white active:bg-neutral-800"
          >
            Vezi articolele
          </button>
        </div>
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

function chipsFor(f: FeedFilters, facets: ReturnType<typeof facetsFrom>): Chip[] {
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
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[95]" style={{ height: "100dvh" }}>
      <button
        type="button"
        aria-label="Închide"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 opacity-0 animate-in fade-in-0 duration-200 [animation-fill-mode:forwards]"
        style={{ opacity: 1 }}
      />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pt-2 animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
      >
        <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-neutral-200" />
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
