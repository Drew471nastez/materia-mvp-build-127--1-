"use client"

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Clock, Store, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useLocale } from "@/components/locale-provider"
import { cn } from "@/lib/utils"
import type { RecentSearch } from "@/lib/hooks/use-recent-searches"
import type { RecentlyViewedProduct } from "@/lib/hooks/use-recently-viewed"

/**
 * Search dropdown body: Recent searches, Recently viewed and People (sellers).
 *
 * Deliberately dumb — props in, callbacks out. It owns exactly one piece of
 * state (which row is highlighted), because that is presentation, not data.
 *
 * ── Integration ───────────────────────────────────────────────────────────────
 *   const panelRef = useRef<SearchSuggestionsPanelHandle>(null)
 *
 *   <div className="relative">
 *     <Input
 *       role="combobox"
 *       aria-expanded={open}
 *       aria-controls="search-suggestions"
 *       aria-autocomplete="list"
 *       onKeyDown={(e) => {
 *         if (e.key === "ArrowDown") { e.preventDefault(); panelRef.current?.moveHighlight(1) }
 *         else if (e.key === "ArrowUp") { e.preventDefault(); panelRef.current?.moveHighlight(-1) }
 *         else if (e.key === "Enter" && panelRef.current?.commitHighlight()) { e.preventDefault() }
 *         else if (e.key === "Escape") { setOpen(false) }
 *       }}
 *     />
 *     <SearchSuggestionsPanel
 *       ref={panelRef} id="search-suggestions" open={open}
 *       recentSearches={searches} recentlyViewed={products} people={people}
 *       onSelectSearch={...} onRemoveSearch={remove} onClearSearches={clear}
 *       onSelectProduct={...} onSelectPerson={...} onClose={() => setOpen(false)}
 *       className="absolute left-0 right-0 top-full mt-2 z-50"
 *     >
 *       {existingCategoriesSection}
 *     </SearchSuggestionsPanel>
 *   </div>
 *
 * Each section renders only when its array is non-empty, so the caller controls
 * what appears purely by what it passes (e.g. pass `people={[]}` while the query
 * is empty, pass `recentSearches={[]}` once the user starts typing). When every
 * section is empty and there are no children, the panel renders nothing at all —
 * so a first-time visitor sees whatever the caller showed before.
 *
 * Highlight order runs top to bottom across all sections; the caller's `children`
 * are not part of keyboard navigation (they own their own focus behaviour).
 *
 * Rows are `tabIndex={-1}` options — focus stays in the input and the highlight
 * travels through `aria-activedescendant` (subscribe with `onActiveOptionChange`).
 * A mouse press inside the panel is prevented from stealing focus; touch is left
 * alone so the Recently viewed strip still scrolls, which means a caller that
 * closes on `onBlur` must defer it (`setTimeout(close, 150)`) or the tap will
 * never reach the row.
 */

export interface PersonSuggestion {
  id: string
  slug: string
  headline?: string | null
  niche_tags?: string[] | null
  products_count?: number
  profile?: {
    display_name?: string | null
    avatar_url?: string | null
    username?: string | null
  } | null
}

export interface SearchSuggestionsPanelHandle {
  /** Move the highlight by `delta` rows, wrapping at both ends. */
  moveHighlight: (delta: number) => void
  /** Fire the highlighted row's callback. Returns false when nothing is highlighted. */
  commitHighlight: () => boolean
  /** Drop the highlight (call when the query changes). */
  clearHighlight: () => void
  /** Current `aria-activedescendant` value for the input, or null. */
  getActiveOptionId: () => string | null
}

interface SearchSuggestionsPanelProps {
  open: boolean
  /** DOM id — pair with `aria-controls` on the input. */
  id?: string
  ref?: React.Ref<SearchSuggestionsPanelHandle>
  recentSearches?: readonly RecentSearch[]
  recentlyViewed?: readonly RecentlyViewedProduct[]
  people?: readonly PersonSuggestion[]
  /** Renders a slim shimmer under the People heading while the request is in flight. */
  peopleLoading?: boolean
  onSelectSearch: (query: string, category?: string) => void
  onRemoveSearch?: (query: string) => void
  onClearSearches?: () => void
  onSelectProduct: (product: RecentlyViewedProduct) => void
  onSelectPerson: (person: PersonSuggestion) => void
  onClose: () => void
  /** Fires when the highlighted row changes — mirror it into aria-activedescendant. */
  onActiveOptionChange?: (optionId: string | null) => void
  /** Positioning; the panel supplies its own surface (border, radius, shadow). */
  className?: string
  /** Appended below People — the existing Categories block lives here. */
  children?: React.ReactNode
}

/** One keyboard-navigable row, flattened across every section. */
interface FlatItem {
  key: string
  run: () => void
}

const priceFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function formatPrice(cents: number): string {
  return cents === 0 ? "Free" : priceFormatter.format((cents || 0) / 100)
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "?"
  return (
    name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  )
}

export function SearchSuggestionsPanel({
  open,
  id,
  ref,
  recentSearches = [],
  recentlyViewed = [],
  people = [],
  peopleLoading = false,
  onSelectSearch,
  onRemoveSearch,
  onClearSearches,
  onSelectProduct,
  onSelectPerson,
  onClose,
  onActiveOptionChange,
  className,
  children,
}: SearchSuggestionsPanelProps) {
  const { t } = useLocale()
  const [activeIndex, setActiveIndex] = useState(-1)
  const rowRefs = useRef(new Map<number, HTMLElement>())

  const optionId = useCallback((index: number) => `${id || "search-suggestions"}-option-${index}`, [id])

  // Flat list in visual order — arrow keys walk this, not the sections.
  const items = useMemo<FlatItem[]>(() => {
    const flat: FlatItem[] = []

    for (const entry of recentSearches) {
      flat.push({ key: `recent:${entry.q}`, run: () => onSelectSearch(entry.q, entry.category) })
    }
    for (const product of recentlyViewed) {
      flat.push({ key: `viewed:${product.productId}`, run: () => onSelectProduct(product) })
    }
    for (const person of people) {
      flat.push({ key: `person:${person.id}`, run: () => onSelectPerson(person) })
    }

    return flat
  }, [recentSearches, recentlyViewed, people, onSelectSearch, onSelectProduct, onSelectPerson])

  // Keyed on the data, not on `items` identity — callers routinely pass inline
  // callbacks, which would otherwise rebuild `items` (and wipe the highlight) on
  // every single render.
  const itemsSignature = useMemo(() => items.map((item) => item.key).join("|"), [items])

  // A changed result set invalidates the old index — never leave a stale highlight
  // pointing at a row that has since become something else.
  useEffect(() => {
    setActiveIndex(-1)
  }, [itemsSignature])

  const lastEmittedOptionId = useRef<string | null>(null)

  useEffect(() => {
    const next = activeIndex >= 0 ? optionId(activeIndex) : null
    if (next === lastEmittedOptionId.current) return
    lastEmittedOptionId.current = next
    onActiveOptionChange?.(next)
  }, [activeIndex, optionId, onActiveOptionChange])

  // Keep the highlighted row in view when arrowing past the scroll edge.
  useEffect(() => {
    if (activeIndex < 0) return
    rowRefs.current.get(activeIndex)?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [activeIndex])

  useImperativeHandle(
    ref,
    () => ({
      moveHighlight: (delta: number) => {
        setActiveIndex((current) => {
          if (items.length === 0) return -1
          // -1 (nothing highlighted) enters at the top going down, at the bottom going up.
          const next = current < 0 ? (delta > 0 ? 0 : items.length - 1) : current + delta
          return (next + items.length) % items.length
        })
      },
      commitHighlight: () => {
        if (activeIndex < 0 || activeIndex >= items.length) return false
        items[activeIndex].run()
        return true
      },
      clearHighlight: () => setActiveIndex(-1),
      getActiveOptionId: () => (activeIndex >= 0 ? optionId(activeIndex) : null),
    }),
    [activeIndex, items, optionId],
  )

  const registerRow = useCallback((index: number, node: HTMLElement | null) => {
    if (node) rowRefs.current.set(index, node)
    else rowRefs.current.delete(index)
  }, [])

  if (!open) return null

  const hasRecent = recentSearches.length > 0
  const hasViewed = recentlyViewed.length > 0
  const hasPeople = people.length > 0 || peopleLoading

  // Nothing to say — stay out of the way rather than showing an empty shell.
  if (!hasRecent && !hasViewed && !hasPeople && !children) return null

  // Running offsets so each section's rows map onto the flat highlight index.
  const viewedOffset = recentSearches.length
  const peopleOffset = viewedOffset + recentlyViewed.length

  return (
    <div
      id={id}
      role="listbox"
      aria-label={t("marketplace.search_suggestions")}
      // The input keeps focus, so a mouse click here must not blur it first.
      // Touch is left alone — preventing default there would kill the scroll strip.
      onPointerDown={(event) => {
        if (event.pointerType === "mouse") event.preventDefault()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onClose()
        }
      }}
      className={cn(
        "max-h-[70vh] overflow-y-auto overscroll-contain rounded-2xl border border-neutral-200 bg-white py-2 shadow-lg shadow-neutral-900/5",
        "animate-in fade-in slide-in-from-top-1 duration-150",
        className,
      )}
    >
      {/* ── Recent searches ─────────────────────────────────────────────── */}
      {hasRecent && (
        <section>
          <div className="flex items-center justify-between px-4 pb-1 pt-1.5">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-neutral-400">{t("marketplace.recent")}</h3>
            {onClearSearches && (
              <button
                type="button"
                onClick={onClearSearches}
                className="text-[11px] font-medium text-neutral-400 transition-colors hover:text-neutral-700 cursor-pointer touch-manipulation"
              >
                {t("search.clear")}
              </button>
            )}
          </div>
          <div className="px-2">
            {recentSearches.map((entry, index) => (
              <div
                key={`recent-${entry.q}`}
                ref={(node) => registerRow(index, node)}
                id={optionId(index)}
                role="option"
                aria-selected={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "group flex items-center gap-3 rounded-lg pl-3 pr-1 transition-colors duration-150",
                  activeIndex === index ? "bg-neutral-100" : "hover:bg-neutral-50",
                )}
              >
                <Clock className="h-4 w-4 shrink-0 text-neutral-400" />
                <button
                  type="button"
                  // Focus stays in the input; the highlight is conveyed by aria-activedescendant.
                  tabIndex={-1}
                  onClick={() => onSelectSearch(entry.q, entry.category)}
                  className="min-w-0 flex-1 py-3 text-left text-sm text-neutral-700 cursor-pointer touch-manipulation"
                >
                  <span className="block truncate">{entry.q}</span>
                </button>
                {onRemoveSearch && (
                  <button
                    type="button"
                    aria-label={`${t("marketplace.remove_x_prefix")} ${entry.q} ${t("marketplace.remove_x_recent_suffix")}`}
                    onClick={() => onRemoveSearch(entry.q)}
                    // Always visible on touch (no hover), fades in on pointer devices.
                    className="shrink-0 rounded-full p-2 text-neutral-400 transition-colors hover:text-neutral-700 cursor-pointer touch-manipulation [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Recently viewed ─────────────────────────────────────────────── */}
      {hasViewed && (
        <section className={cn(hasRecent && "mt-1 border-t border-neutral-100 pt-2")}>
          <h3 className="px-4 pb-2 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">
            {t("search.recently_viewed")}
          </h3>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {recentlyViewed.map((product, index) => {
              const flatIndex = viewedOffset + index
              return (
                <button
                  key={product.productId}
                  ref={(node) => registerRow(flatIndex, node)}
                  id={optionId(flatIndex)}
                  role="option"
                  aria-selected={activeIndex === flatIndex}
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(flatIndex)}
                  onClick={() => onSelectProduct(product)}
                  className="w-[72px] shrink-0 snap-start text-left cursor-pointer touch-manipulation"
                >
                  <div
                    className={cn(
                      "relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-neutral-100 ring-offset-2 transition-shadow duration-150",
                      activeIndex === flatIndex && "ring-2 ring-neutral-900/80",
                    )}
                  >
                    {product.thumbnail ? (
                      <Image
                        src={product.thumbnail}
                        alt=""
                        fill
                        sizes="72px"
                        quality={60}
                        loading="lazy"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-lg">👜</div>
                    )}
                  </div>
                  <span className="mt-1.5 block truncate text-[11px] font-semibold leading-tight text-neutral-900">
                    {product.price === 0 ? t("product.free") : formatPrice(product.price)}
                  </span>
                  <span className="block truncate text-[11px] leading-tight text-neutral-500">{product.title}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* ── People ──────────────────────────────────────────────────────── */}
      {hasPeople && (
        <section className={cn((hasRecent || hasViewed) && "mt-1 border-t border-neutral-100 pt-2")}>
          <h3 className="px-4 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400">{t("marketplace.sellers")}</h3>

          {people.length === 0 && peopleLoading ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-neutral-100" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-28 animate-pulse rounded bg-neutral-100" />
                <div className="h-2.5 w-20 animate-pulse rounded bg-neutral-100" />
              </div>
            </div>
          ) : (
            <div className="px-2">
              {people.map((person, index) => {
                const flatIndex = peopleOffset + index
                const displayName = person.profile?.display_name || person.profile?.username || t("marketplace.seller")
                const username = person.profile?.username
                const productsCount = person.products_count || 0

                return (
                  <button
                    key={person.id}
                    ref={(node) => registerRow(flatIndex, node)}
                    id={optionId(flatIndex)}
                    role="option"
                    aria-selected={activeIndex === flatIndex}
                    type="button"
                    tabIndex={-1}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => onSelectPerson(person)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 cursor-pointer touch-manipulation",
                      activeIndex === flatIndex ? "bg-neutral-100" : "hover:bg-neutral-50",
                    )}
                  >
                    <Avatar className="h-8 w-8 aspect-square shrink-0">
                      {person.profile?.avatar_url ? (
                        <AvatarImage src={person.profile.avatar_url} alt="" loading="lazy" />
                      ) : null}
                      <AvatarFallback className="text-[11px]">{getInitials(displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-neutral-900">{displayName}</span>
                      <span className="block truncate text-xs text-neutral-500">
                        {username ? `@${username}` : person.slug}
                        {productsCount > 0 && ` · ${productsCount} ${productsCount === 1 ? t("marketplace.item") : t("marketplace.items")}`}
                      </span>
                    </span>
                    <Store className="h-4 w-4 shrink-0 text-neutral-300" />
                  </button>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* Caller-owned sections (Categories) — outside the roving highlight. */}
      {children && (
        <section className={cn((hasRecent || hasViewed || hasPeople) && "mt-1 border-t border-neutral-100 pt-2")}>
          {children}
        </section>
      )}
    </div>
  )
}
