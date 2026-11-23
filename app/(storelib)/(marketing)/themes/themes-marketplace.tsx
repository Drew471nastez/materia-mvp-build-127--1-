"use client"

/**
 * ===========================================================================
 *  STORELIB.COM/THEMES AND /THEMES/CATEGORY/<CATEGORY>: THE GRID AND ITS FILTERS
 * ===========================================================================
 * Round 58, after Shopify's theme store: filters down the left on a
 * computer (category, price, features), a count and an order above a grid
 * of cards, twelve at a time with Load more. On a phone and a tablet the
 * filters and the order are one sheet (components/ui/bottom-sheet), opened
 * by a Filter button beside the count.
 *
 * A CATEGORY IS A PAGE, NOT A FILTER. Each one is a link to its own address
 * (/themes/category/<slug>), drawn on the server with its own title, intro
 * and questions, so a search engine finds "fashion website templates" as a
 * page and not as a query string. Price, features and the order are
 * narrowings of the page you are on: they run on the list the page arrived
 * with, so a change is the next frame, and the address keeps them in its
 * query (?price=, ?feature=, ?sort=) for sharing, under a canonical without
 * one. They are also remembered for the visit, so moving to another category
 * keeps them.
 *
 * NOTHING MOVES WHILE IT LOADS. The cards are on the page from the server,
 * each picture's box is drawn at its shape before the picture arrives, and
 * the cards after the first twelve are in the page too, hidden, so every
 * template is a link a crawler can follow from here.
 */
import * as React from "react"
import Link from "next/link"
import { SlidersHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { MarketplaceCard } from "@/components/themes/marketplace-card"
import { THEME_SORTS, MARKETPLACE_PATH, type ThemeSort, type ThemeTier } from "@/lib/themes/marketplace-shared"
import { THEME_FEATURES, type MarketplaceCard as Card, type MarketplaceCategoryCopy, type ThemeFeature } from "@/lib/themes/theme-seo"

const PAGE_SIZE = 12

const PRICES: { id: ThemeTier; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "pro", label: "Included with Grow" },
  { id: "paid", label: "Paid" },
]

interface Filters {
  price: ThemeTier[]
  features: ThemeFeature[]
  sort: ThemeSort
}
const EMPTY: Filters = { price: [], features: [], sort: "featured" }

/* What was chosen on this visit, so the next category opens with it. A module value, read only after the first paint. */
let remembered: Filters | null = null

function fromQuery(search: string): Filters | null {
  const p = new URLSearchParams(search)
  const price = (p.get("price") ?? "").split(",").filter((x): x is ThemeTier => PRICES.some((y) => y.id === x))
  const features = (p.get("feature") ?? "").split(",").filter((x): x is ThemeFeature => THEME_FEATURES.some((y) => y.key === x))
  const s = p.get("sort")
  const sort = THEME_SORTS.some((x) => x.id === s) ? (s as ThemeSort) : "featured"
  return price.length || features.length || sort !== "featured" ? { price, features, sort } : null
}

function narrow(cards: Card[], f: Filters): Card[] {
  const out = cards.filter((c) => (!f.price.length || f.price.includes(c.tier)) && f.features.every((x) => c.features.includes(x)))
  const rank = (c: Card) => (c.tier === "free" ? 0 : c.tier === "pro" ? 1 : 2 + c.priceCents)
  if (f.sort === "newest") out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.sortOrder - b.sortOrder)
  else if (f.sort === "name") out.sort((a, b) => a.name.localeCompare(b.name))
  else if (f.sort === "price") out.sort((a, b) => rank(a) - rank(b) || a.sortOrder - b.sortOrder)
  return out
}

export function ThemesMarketplace({
  cards,
  allCards,
  categories,
  active,
}: {
  /** The cards on this page: every template, or one category's. */
  cards: Card[]
  /** Every template, for the category counts. */
  allCards: Card[]
  categories: MarketplaceCategoryCopy[]
  /** The category this page is, or null on /themes. */
  active: string | null
}) {
  const [f, setF] = React.useState<Filters>(EMPTY)
  const [limit, setLimit] = React.useState(PAGE_SIZE)
  const [sheet, setSheet] = React.useState(false)
  const ready = React.useRef(false)

  /* After the first paint: the address's filters, or this visit's. The server's page is what everybody sees first. */
  React.useEffect(() => {
    const next = fromQuery(window.location.search) ?? remembered
    if (next) setF(next)
    ready.current = true
  }, [])

  React.useEffect(() => {
    if (!ready.current) return
    remembered = f
    const p = new URLSearchParams()
    if (f.price.length) p.set("price", f.price.join(","))
    if (f.features.length) p.set("feature", f.features.join(","))
    if (f.sort !== "featured") p.set("sort", f.sort)
    const next = `${window.location.pathname}${p.toString() ? `?${p}` : ""}`
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next)
  }, [f])

  /* The sheet is a phone's and a tablet's; a window widened past it closes it. */
  React.useEffect(() => {
    if (!sheet) return
    const mq = window.matchMedia("(min-width: 1024px)")
    const close = () => mq.matches && setSheet(false)
    mq.addEventListener("change", close)
    return () => mq.removeEventListener("change", close)
  }, [sheet])

  const shown = React.useMemo(() => narrow(cards, f), [cards, f])
  React.useEffect(() => setLimit(PAGE_SIZE), [f])
  const narrowed = f.price.length + f.features.length
  const visible = Math.min(limit, shown.length)

  const panel = (
    <FilterPanel
      cards={cards}
      allCards={allCards}
      categories={categories}
      active={active}
      f={f}
      setF={setF}
      onNavigate={() => setSheet(false)}
    />
  )

  return (
    <div data-themes-marketplace="" className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <aside aria-label="Filters" className="hidden lg:block">
        <div className="sticky top-[88px]">{panel}</div>
      </aside>

      <div className="min-w-0">
        {/* ── The count, the filter button on a phone, the order ─────── */}
        <div className="flex h-11 items-center justify-between gap-3">
          <p data-market-count="" aria-live="polite" className="min-w-0 truncate text-[14px] tabular-nums text-[#6b7280]">
            {shown.length === 0 ? (
              "No templates"
            ) : visible < shown.length ? (
              <>
                {/* A phone has room for the total beside Filter and Sort; the range is for a wider window. */}
                <span className="sm:hidden">{shown.length} templates</span>
                <span className="hidden sm:inline">{`1 to ${visible} of ${shown.length} templates`}</span>
              </>
            ) : (
              `${shown.length} ${shown.length === 1 ? "template" : "templates"}`
            )}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSheet(true)}
              data-market-filter-open=""
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 text-[14px] font-medium text-[#1a1a2e] transition-colors hover:border-[#d1d5db] lg:hidden"
            >
              <SlidersHorizontal aria-hidden className="h-4 w-4" strokeWidth={2} />
              Filter
              {narrowed ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#1a1a2e] px-1.5 text-[12px] font-semibold tabular-nums text-white">{narrowed}</span> : null}
            </button>
            <label className="relative flex items-center gap-2">
              {/* The word on a wider window; a phone keeps the room for the count. */}
              <span className="sr-only sm:not-sr-only sm:text-[14px] sm:text-[#6b7280]">Sort by</span>
              <select
                value={f.sort}
                onChange={(e) => setF((x) => ({ ...x, sort: e.target.value as ThemeSort }))}
                data-market-sort=""
                className="h-10 appearance-none rounded-lg border border-[#e5e7eb] bg-white pl-3 pr-8 text-[14px] font-medium text-[#1a1a2e] outline-none transition-colors hover:border-[#d1d5db] focus-visible:border-[#1a1a2e]/40"
              >
                {THEME_SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 h-4 w-4 text-[#6b7280]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 6 4 4 4-4" />
              </svg>
            </label>
          </div>
        </div>

        {/* ── The grid ─────────────────────────────────────────────── */}
        <h2 className="sr-only">Templates</h2>
        {shown.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[15px] text-[#4b5563]">No template has all of these.</p>
            <button
              type="button"
              onClick={() => setF((x) => ({ ...x, price: [], features: [] }))}
              className="mt-3 text-[14px] font-semibold text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-2 hover:decoration-[#1a1a2e]"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div data-market-grid="" className="mt-4 grid grid-cols-1 gap-x-6 gap-y-9 min-[520px]:grid-cols-2 lg:mt-5 xl:grid-cols-3">
            {shown.map((c, i) => (
              <MarketplaceCard key={c.slug} card={c} priority={i < 2} hidden={i >= limit} />
            ))}
          </div>
        )}

        {visible < shown.length ? (
          <div className="mt-12 flex justify-center">
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
              data-market-more=""
              className="inline-flex h-11 items-center rounded-lg border border-[#e5e7eb] bg-white px-5 text-[14px] font-semibold text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:border-[#d1d5db] hover:bg-[#f8f9fa]"
            >
              Load more
            </button>
          </div>
        ) : null}
      </div>

      <BottomSheet
        isOpen={sheet}
        onClose={() => setSheet(false)}
        title="Filter and sort"
        hideFrom={null}
        maxHeight="min(86dvh, 720px)"
      >
        <div className="px-5 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <div className="pb-5">
            <p className="mb-2 text-[13px] font-semibold text-[#1a1a2e]">Sort by</p>
            <div role="radiogroup" aria-label="Sort by" className="grid grid-cols-2 gap-2">
              {THEME_SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={f.sort === s.id}
                  onClick={() => setF((x) => ({ ...x, sort: s.id }))}
                  className={cn(
                    "h-11 rounded-lg border text-[14px] font-medium transition-colors",
                    f.sort === s.id ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#e5e7eb] bg-white text-[#1a1a2e]",
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {panel}
          <button
            type="button"
            onClick={() => setSheet(false)}
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#1a1a2e] text-[15px] font-semibold text-white"
          >
            {shown.length === 0 ? "No templates match" : `Show ${shown.length} ${shown.length === 1 ? "template" : "templates"}`}
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}

function FilterPanel({
  cards,
  allCards,
  categories,
  active,
  f,
  setF,
  onNavigate,
}: {
  cards: Card[]
  allCards: Card[]
  categories: MarketplaceCategoryCopy[]
  active: string | null
  f: Filters
  setF: React.Dispatch<React.SetStateAction<Filters>>
  onNavigate: () => void
}) {
  const prices = PRICES.map((p) => ({ ...p, count: cards.filter((c) => c.tier === p.id).length })).filter((p) => p.count > 0 || f.price.includes(p.id))
  const features = THEME_FEATURES.map((x) => ({ ...x, count: cards.filter((c) => c.features.includes(x.key)).length })).filter((x) => x.count > 0 || f.features.includes(x.key))
  const toggle = <K extends "price" | "features">(key: K, value: Filters[K][number]) =>
    setF((x) => {
      const list = x[key] as string[]
      return { ...x, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] }
    })
  const query = (() => {
    const p = new URLSearchParams()
    if (f.price.length) p.set("price", f.price.join(","))
    if (f.features.length) p.set("feature", f.features.join(","))
    if (f.sort !== "featured") p.set("sort", f.sort)
    return p.toString() ? `?${p}` : ""
  })()

  return (
    <div className="space-y-6" data-market-filters="">
      <Group title="Category">
        <CategoryRow href={`${MARKETPLACE_PATH}${query}`} on={active === null} label="All templates" count={allCards.length} onNavigate={onNavigate} />
        {categories.map((c) => (
          <CategoryRow key={c.slug} href={`${c.path}${query}`} on={active === c.slug} label={c.name} count={allCards.filter((x) => x.categories.includes(c.slug)).length} onNavigate={onNavigate} />
        ))}
      </Group>
      {prices.length ? (
        <Group title="Price">
          {prices.map((p) => (
            <CheckRow key={p.id} on={f.price.includes(p.id)} onChange={() => toggle("price", p.id)} label={p.label} count={p.count} />
          ))}
        </Group>
      ) : null}
      {features.length ? (
        <Group title="Features">
          {features.map((x) => (
            <CheckRow key={x.key} on={f.features.includes(x.key)} onChange={() => toggle("features", x.key)} label={x.label} count={x.count} />
          ))}
        </Group>
      ) : null}
      {f.price.length + f.features.length ? (
        <button
          type="button"
          onClick={() => setF((x) => ({ ...x, price: [], features: [] }))}
          className="text-[13px] font-medium text-[#6b7280] underline-offset-2 transition-colors hover:text-[#1a1a2e] hover:underline"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[#eceef1] pt-4 first:border-t-0 first:pt-0">
      <p className="mb-2 text-[13px] font-semibold text-[#1a1a2e]">{title}</p>
      <div className="space-y-px">{children}</div>
    </section>
  )
}

function CategoryRow({ href, on, label, count, onNavigate }: { href: string; on: boolean; label: string; count: number; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "-mx-2 flex h-10 items-center justify-between gap-2 rounded-lg px-2 text-[14px] transition-colors duration-150 lg:h-8 lg:text-[13.5px]",
        on ? "bg-[#f1f2f4] font-medium text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f8f9fa] hover:text-[#1a1a2e]",
      )}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{count}</span>
    </Link>
  )
}

function CheckRow({ on, onChange, label, count }: { on: boolean; onChange: () => void; label: string; count: number }) {
  return (
    <label className="-mx-2 flex h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[14px] text-[#374151] transition-colors hover:bg-[#f8f9fa] lg:h-8 lg:text-[13.5px]">
      <input type="checkbox" checked={on} onChange={onChange} className="h-4 w-4 shrink-0 cursor-pointer rounded border-[#d1d5db] accent-[#1a1a2e]" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{count}</span>
    </label>
  )
}
