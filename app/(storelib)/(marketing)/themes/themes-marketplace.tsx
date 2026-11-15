"use client"

/**
 * ===========================================================================
 *  STORELIB.COM/THEMES
 * ===========================================================================
 * Every published theme as a card (components/themes/theme-card.tsx), with
 * the four ways Shopify's theme store narrows a list: a search, the price
 * (Free, Paid, Pro), a category, and an order. All of it runs on the list the
 * page arrived with, so a change is the next frame, and the address keeps it
 * (?q=, ?price=, ?category=, ?sort=) so a narrowed list can be shared.
 *
 * Add is on every free card. A Pro theme is added the same way and the
 * server says if the plan does not include it; a paid theme says it opens
 * soon.
 */
import * as React from "react"
import { Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { ThemeCard } from "@/components/themes/theme-card"
import { AddStatus } from "@/components/themes/add-status"
import { useAddTheme } from "@/components/themes/use-add-theme"
import {
  THEME_SORTS,
  categoryLabel,
  filterListings,
  listingPath,
  type ThemeListing,
  type ThemeSort,
  type ThemeTier,
} from "@/lib/themes/marketplace-shared"

const PRICES: { id: ThemeTier | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "free", label: "Free" },
  { id: "paid", label: "Paid" },
  { id: "pro", label: "Grow" },
]

export function ThemesMarketplace({ listings }: { listings: ThemeListing[] }) {
  const [q, setQ] = React.useState("")
  const [tier, setTier] = React.useState<ThemeTier | "all">("all")
  const [category, setCategory] = React.useState<string>("all")
  const [sort, setSort] = React.useState<ThemeSort>("featured")
  const { state, add, reset } = useAddTheme()

  /* The address first, once: a shared link opens on the list it named. */
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const price = p.get("price")
    if (price && PRICES.some((x) => x.id === price)) setTier(price as ThemeTier)
    const cat = p.get("category")
    if (cat) setCategory(cat)
    const s = p.get("sort")
    if (s && THEME_SORTS.some((x) => x.id === s)) setSort(s as ThemeSort)
    setQ(p.get("q")?.slice(0, 80) ?? "")
  }, [])

  React.useEffect(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (tier !== "all") p.set("price", tier)
    if (category !== "all") p.set("category", category)
    if (sort !== "featured") p.set("sort", sort)
    const next = `${window.location.pathname}${p.toString() ? `?${p}` : ""}`
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next)
  }, [q, tier, category, sort])

  /* Only the categories that have a theme in them: an empty one is a dead end. */
  const categories = React.useMemo(() => [...new Set(listings.map((l) => l.category))].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b))), [listings])
  const shown = React.useMemo(() => filterListings(listings, { q, tier, category, sort }), [listings, q, tier, category, sort])
  const narrowed = q.trim() !== "" || tier !== "all" || category !== "all"
  const addingName = state.phase === "idle" ? null : listings.find((l) => l.slug === state.slug)?.name ?? null

  return (
    <div className="bg-white" data-themes-marketplace="">
      <div className="mx-auto max-w-[1200px] px-4 pb-24 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[30px] font-bold tracking-tight text-[#1a1a2e] sm:text-[38px]">Themes</h1>
          <span className="text-[15px] tabular-nums text-[#6b7280]">{listings.length}</span>
        </div>

        <div className="lg:mt-8 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-10">
        {/* ── The sidebar, on a computer: search, price, category, order ─ */}
        <aside aria-label="Filters" className="hidden lg:block">
          <div className="sticky top-[88px] space-y-6">
            <label className="relative block">
              <span className="sr-only">Search themes</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search themes"
                className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-[14px] text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/30 focus:shadow-[0_0_0_3px_rgba(26,26,46,0.06)]"
              />
            </label>
            <FilterGroup title="Price">
              {PRICES.map((p) => (
                <FilterRow key={p.id} on={tier === p.id} onClick={() => setTier(p.id)} label={p.label} count={p.id === "all" ? listings.length : listings.filter((l) => l.tier === p.id).length} />
              ))}
            </FilterGroup>
            {categories.length > 1 ? (
              <FilterGroup title="Category">
                {["all", ...categories].map((c) => (
                  <FilterRow key={c} on={category === c} onClick={() => setCategory(c)} label={c === "all" ? "All categories" : categoryLabel(c)} count={c === "all" ? listings.length : listings.filter((l) => l.category === c).length} />
                ))}
              </FilterGroup>
            ) : null}
            <FilterGroup title="Sort by">
              {THEME_SORTS.map((x) => (
                <FilterRow key={x.id} on={sort === x.id} onClick={() => setSort(x.id as ThemeSort)} label={x.label} />
              ))}
            </FilterGroup>
            {narrowed ? (
              <button
                type="button"
                onClick={() => {
                  setQ("")
                  setTier("all")
                  setCategory("all")
                }}
                className="text-[13px] font-medium text-[#6b7280] underline-offset-2 transition-colors hover:text-[#1a1a2e] hover:underline"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </aside>
        <div className="min-w-0">
        {/* ── Search, price, order (a phone or a tablet) ───────────────── */}
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center lg:hidden">
          <label className="relative block md:w-[340px]">
            <span className="sr-only">Search themes</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search themes"
              className="h-11 w-full rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-3 text-[15px] text-[#1a1a2e] outline-none transition-colors placeholder:text-[#9ca3af] focus:border-[#1a1a2e]/40 md:h-10 md:text-[14px]"
            />
          </label>
          <div className="flex items-center justify-between gap-3 md:ml-auto md:justify-end">
            <div role="radiogroup" aria-label="Price" className="flex rounded-lg bg-[#f1f2f4] p-0.5">
              {PRICES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={tier === p.id}
                  onClick={() => setTier(p.id)}
                  className={cn(
                    "h-10 rounded-md px-3 text-[13.5px] font-medium transition-colors duration-150 sm:h-9",
                    tier === p.id ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-[13.5px] text-[#6b7280]">
              <span className="hidden sm:inline">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as ThemeSort)}
                className="h-11 rounded-lg border border-[#e5e7eb] bg-white px-2.5 text-[14px] font-medium text-[#1a1a2e] outline-none focus:border-[#1a1a2e]/40 sm:h-10"
              >
                {THEME_SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* ── Categories: words, the chosen one underlined ─────── */}
        {categories.length > 1 ? (
          <nav aria-label="Categories" className="-mx-4 mt-5 overflow-x-auto border-b border-[#eceef1] px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:hidden [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-5">
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "-mb-px h-11 shrink-0 border-b-2 text-[14px] font-medium transition-colors duration-150",
                    category === c ? "border-[#1a1a2e] text-[#1a1a2e]" : "border-transparent text-[#6b7280] hover:text-[#1a1a2e]",
                  )}
                >
                  {c === "all" ? "All" : categoryLabel(c)}
                </button>
              ))}
            </div>
          </nav>
        ) : null}

        {/* ── The grid ─────────────────────────────────────────── */}
        {shown.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-[15px] text-[#4b5563]">No theme matches that.</p>
            {narrowed ? (
              <button
                type="button"
                onClick={() => {
                  setQ("")
                  setTier("all")
                  setCategory("all")
                }}
                className="mt-3 text-[14px] font-semibold text-[#1a1a2e] underline decoration-[#1a1a2e]/30 underline-offset-2 hover:decoration-[#1a1a2e]"
              >
                Show every theme
              </button>
            ) : null}
          </div>
        ) : (
          <div data-theme-grid="" className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:mt-0 xl:grid-cols-3">
            {shown.map((l, i) => (
              <ThemeCard
                key={l.slug}
                listing={l}
                href={listingPath(l.slug)}
                priority={i < 3}
                action={
                  l.tier === "paid" ? (
                    <span className="inline-flex h-11 items-center rounded-lg bg-[#f1f2f4] px-3 text-[13px] font-medium text-[#6b7280] sm:h-9">Soon</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void add(l.slug)}
                      disabled={state.phase === "adding"}
                      className="inline-flex h-11 items-center rounded-lg bg-[#1a1a2e] px-3.5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(16,24,40,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] transition-colors duration-150 hover:bg-[#2d2d44] disabled:opacity-60 sm:h-9"
                    >
                      {state.phase === "adding" && state.slug === l.slug ? "Adding" : "Add"}
                    </button>
                  )
                }
              />
            ))}
          </div>
        )}
        </div>
        </div>
      </div>
      <AddStatus state={state} name={addingName} onClose={reset} />
    </div>
  )
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-2.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#9ca3af]">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

function FilterRow({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-[13.5px] transition-colors duration-150",
        on ? "bg-[#f1f2f4] font-medium text-[#1a1a2e] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.04)]" : "text-[#4b5563] hover:bg-[#f8f9fa] hover:text-[#1a1a2e]",
      )}
    >
      <span className="truncate">{label}</span>
      {typeof count === "number" ? <span className="shrink-0 text-[12px] tabular-nums text-[#9ca3af]">{count}</span> : null}
    </button>
  )
}
