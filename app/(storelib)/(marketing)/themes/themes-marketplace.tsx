"use client"

/**
 * ===========================================================================
 *  STORELIB.COM/THEMES AND /THEMES/CATEGORY/<CATEGORY>: THE GRID AND ITS FILTERS
 * ===========================================================================
 * Round 58, after Shopify's theme store: filters down the left on a
 * computer (category, price, features), a count and an order above a grid
 * of cards, twenty at a time with Load more (marketplace round 24, the
 * owner: "show 20 by default"). On a phone and a tablet the
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
 * BACK LANDS WHERE YOU WERE (round 23, the owner: "open a template, go
 * Back, and land in the marketplace exactly where I was: the same scroll,
 * the same filters, smoothly, no reload flash"). Before a link on the page
 * is followed (a capture listener on the document, ahead of the link's own
 * click) and when the page is hidden, what is on show goes into this
 * history entry's own state: the filters, how many cards Load more had
 * opened and the scroll. Back is a traversal to that entry, so its state is
 * there again; the grid is put back in a layout effect, before the first
 * frame is drawn, and the window is scrolled to where it was in the same
 * frame. A fresh visit to the address is a new entry with no state and
 * opens at the top. The browser's own restoring is turned off for this
 * entry while the grid is on it: it would scroll the page that is still on
 * screen (the template's) to the marketplace's offset for the frames before
 * the marketplace is drawn again.
 *
 * NOTHING MOVES WHILE IT LOADS. The cards are on the page from the server,
 * each picture's box is drawn at its shape before the picture arrives, and
 * the cards after the first twenty are in the page too, hidden, so every
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

const PAGE_SIZE = 20

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

/** In this history entry's state: what the grid showed when the page was left (BACK LANDS WHERE YOU WERE). */
export const MARKET_RETURN_KEY = "storelibThemes"
interface Kept {
  path: string
  f: Filters
  limit: number
  y: number
}

function readKept(): Kept | null {
  try {
    const k = (window.history.state as Record<string, unknown> | null)?.[MARKET_RETURN_KEY] as Kept | undefined
    if (!k || k.path !== window.location.pathname || typeof k.y !== "number" || typeof k.limit !== "number" || !k.f) return null
    return k
  } catch {
    return null
  }
}

const useIsoLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect

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
  /* Where the window goes once the grid it was measured on is back. */
  const scrollTo = React.useRef<{ y: number; when: string } | null>(null)
  const latest = React.useRef({ f, limit })
  latest.current = { f, limit }

  /* A change of filters or order starts from the first twenty again. */
  const change = React.useCallback((next: React.SetStateAction<Filters>) => {
    setF(next)
    setLimit(PAGE_SIZE)
  }, [])

  /*
    Before the first frame: this entry's own state when Back brought us
    here, otherwise the address's filters or this visit's. The server's
    page is what a fresh visit sees first.
  */
  useIsoLayoutEffect(() => {
    const kept = readKept()
    if (kept) {
      const n = Math.max(PAGE_SIZE, kept.limit)
      setF(kept.f)
      setLimit(n)
      scrollTo.current = { y: kept.y, when: JSON.stringify([kept.f, n]) }
    } else {
      const next = fromQuery(window.location.search) ?? remembered
      if (next) setF(next)
    }
    ready.current = true
  }, [])

  /* The scroll, in the frame the grid is back in, after the cards it was measured on are in the page. */
  useIsoLayoutEffect(() => {
    const to = scrollTo.current
    if (!to || to.when !== JSON.stringify([f, limit])) return
    scrollTo.current = null
    window.scrollTo({ top: to.y, left: 0, behavior: "instant" as ScrollBehavior })
  }, [f, limit])

  /* What is on show, into this entry, before a link leaves it and when the page is hidden. */
  React.useEffect(() => {
    const h = window.history
    const was = h.scrollRestoration
    h.scrollRestoration = "manual"
    const keep = () => {
      try {
        const kept: Kept = { path: window.location.pathname, f: latest.current.f, limit: latest.current.limit, y: Math.round(window.scrollY) }
        h.replaceState({ ...(h.state as object | null), [MARKET_RETURN_KEY]: kept }, "")
      } catch {
        /* a browser that refuses: Back opens at the top, as it did */
      }
    }
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]")
      if (a) keep()
    }
    document.addEventListener("click", onClick, true)
    window.addEventListener("pagehide", keep)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("pagehide", keep)
      /* After the next page's entry is the current one: that entry is restored by the browser as usual. */
      window.setTimeout(() => {
        if (!document.querySelector("[data-themes-marketplace]")) h.scrollRestoration = was === "manual" ? "auto" : was
      }, 0)
    }
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
  const narrowed = f.price.length + f.features.length
  const visible = Math.min(limit, shown.length)

  const panel = (
    <FilterPanel
      cards={cards}
      allCards={allCards}
      categories={categories}
      active={active}
      f={f}
      setF={change}
      onNavigate={() => setSheet(false)}
    />
  )

  return (
    <div data-themes-marketplace="" className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 xl:gap-14">
      <aside aria-label="Filters" className="hidden lg:block">
        <div className="sticky top-6">{panel}</div>
      </aside>

      <div className="min-w-0">
        {/* ── The count, the filter button on a phone, the order ─────── */}
        <div className="flex min-h-[56px] items-center justify-between gap-3">
          <p data-market-count="" aria-live="polite" className="min-w-0 truncate text-[15px] tabular-nums text-[#6b7280] sm:text-[17px]">
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
              className="inline-flex h-11 items-center gap-2 rounded-[10px] border border-[#d4d7dd] bg-white px-3.5 text-[15px] font-medium text-[#111114] transition-colors hover:border-[#9ca3af] lg:hidden"
            >
              <SlidersHorizontal aria-hidden className="h-4 w-4" strokeWidth={2} />
              Filter
              {narrowed ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#111114] px-1.5 text-[12px] font-semibold tabular-nums text-white">{narrowed}</span> : null}
            </button>
            {/* The order: a framed box with its name above what is chosen, a native list under it for every keyboard and screen reader. */}
            <label className="relative block h-11 rounded-[10px] border border-[#d4d7dd] bg-white transition-colors focus-within:border-[#111114] hover:border-[#9ca3af] sm:h-[52px] sm:w-[200px]">
              <span aria-hidden className="pointer-events-none absolute left-3.5 top-[7px] hidden text-[12px] leading-4 text-[#6b7280] sm:block">Sort</span>
              <span className="sr-only">Sort by</span>
              <select
                value={f.sort}
                onChange={(e) => change((x) => ({ ...x, sort: e.target.value as ThemeSort }))}
                data-market-sort=""
                className="h-full w-full cursor-pointer appearance-none rounded-[10px] bg-transparent pl-3.5 pr-10 text-[15px] font-medium text-[#111114] outline-none sm:pt-4 sm:text-[16px] sm:font-normal"
              >
                {THEME_SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#111114]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m4 6 4 4 4-4" />
              </svg>
            </label>
          </div>
        </div>

        {/* ── The grid ─────────────────────────────────────────────── */}
        <h2 className="sr-only">Templates</h2>
        {shown.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[16px] text-[#4b5563]">No template has all of these.</p>
            <button
              type="button"
              onClick={() => change((x) => ({ ...x, price: [], features: [] }))}
              className="mt-3 text-[15px] font-semibold text-[#111114] underline decoration-[#111114]/30 underline-offset-2 hover:decoration-[#111114]"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div data-market-grid="" className="mt-5 grid grid-cols-1 gap-x-6 gap-y-10 min-[520px]:grid-cols-2 lg:mt-6 lg:gap-x-8 lg:gap-y-12 xl:grid-cols-3">
            {shown.map((c, i) => (
              <MarketplaceCard key={c.slug} card={c} priority={i < 2} hidden={i >= limit} />
            ))}
          </div>
        )}

        {visible < shown.length ? (
          <div className="mt-14 flex justify-center">
            <button
              type="button"
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
              data-market-more=""
              className="inline-flex h-12 items-center rounded-[10px] border border-[#d4d7dd] bg-white px-6 text-[15px] font-semibold text-[#111114] transition-colors hover:border-[#9ca3af] hover:bg-[#f8f9fa]"
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
            <p className="mb-2 text-[15px] font-semibold text-[#111114]">Sort by</p>
            <div role="radiogroup" aria-label="Sort by" className="grid grid-cols-2 gap-2">
              {THEME_SORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={f.sort === s.id}
                  onClick={() => change((x) => ({ ...x, sort: s.id }))}
                  className={cn(
                    "h-11 rounded-[10px] border text-[15px] font-medium transition-colors",
                    f.sort === s.id ? "border-[#111114] bg-[#111114] text-white" : "border-[#d4d7dd] bg-white text-[#111114]",
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
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#111114] text-[15px] font-semibold text-white"
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
  setF: (next: React.SetStateAction<Filters>) => void
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
    <div data-market-filters="">
      {prices.length ? (
        <Group title="Price">
          {prices.map((p) => (
            <CheckRow key={p.id} on={f.price.includes(p.id)} onChange={() => toggle("price", p.id)} label={p.label} count={p.count} />
          ))}
        </Group>
      ) : null}
      <Group title="Category">
        <CategoryRow href={`${MARKETPLACE_PATH}${query}`} on={active === null} label="All templates" count={allCards.length} onNavigate={onNavigate} />
        {categories.map((c) => (
          <CategoryRow key={c.slug} href={`${c.path}${query}`} on={active === c.slug} label={c.name} count={allCards.filter((x) => x.categories.includes(c.slug)).length} onNavigate={onNavigate} />
        ))}
      </Group>
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
          className="mt-5 text-[15px] font-medium text-[#4b5563] underline underline-offset-4 transition-colors hover:text-[#111114]"
        >
          Clear filters
        </button>
      ) : null}
    </div>
  )
}

/** A group of the sidebar: its name and a chevron that folds it, rows under it, a rule between groups. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true)
  const id = React.useId()
  return (
    <section className="border-t border-[#e5e7eb] py-5 first:border-t-0 first:pt-0" data-market-group={title}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md text-left text-[17px] font-medium text-[#111114] outline-none focus-visible:ring-2 focus-visible:ring-[#111114]/25"
      >
        {title}
        <svg aria-hidden viewBox="0 0 16 16" className={cn("h-4 w-4 transition-transform duration-200 ease-out motion-reduce:transition-none", open ? "rotate-180" : "rotate-0")} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>
      <div id={id} hidden={!open} className="mt-3 space-y-0.5">
        {children}
      </div>
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
        "flex h-10 items-center justify-between gap-3 rounded-md text-[16px] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#111114]/25 lg:h-9 lg:text-[15.5px]",
        on ? "font-semibold text-[#111114]" : "text-[#374151] hover:text-[#111114]",
      )}
    >
      <span className="truncate">{label}</span>
      <span className={cn("shrink-0 text-[14px] tabular-nums", on ? "text-[#111114]" : "text-[#9ca3af]")}>{count}</span>
    </Link>
  )
}

function CheckRow({ on, onChange, label, count }: { on: boolean; onChange: () => void; label: string; count: number }) {
  return (
    <label className="flex h-10 cursor-pointer items-center gap-3 text-[16px] text-[#374151] transition-colors hover:text-[#111114] lg:h-9 lg:text-[15.5px]">
      <input type="checkbox" checked={on} onChange={onChange} className="h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[5px] border-[#c4c8cf] accent-[#111114]" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[14px] tabular-nums text-[#9ca3af]">{count}</span>
    </label>
  )
}
