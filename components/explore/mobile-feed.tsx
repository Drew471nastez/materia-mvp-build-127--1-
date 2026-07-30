"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, SlidersHorizontal, LayoutGrid, GalleryVerticalEnd, Heart } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { AnimatedSearchPlaceholder } from "./animated-search-placeholder"
import { IosSpinner } from "./ios-spinner"
import { MobileListingCard } from "./mobile-listing-card"
import { MobileBottomNav } from "./mobile-bottom-nav"
import { ProductCard } from "./product-card"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { CATEGORIES, normalizeCategoryToId } from "@/lib/marketplace/categories"
import { cn } from "@/lib/utils"

type Tab = "for-you" | "following" | "saved"
type View = "reels" | "grid"

/**
 * Depop/Vinted/TikTok-style mobile marketplace surface. Full-screen overlay on
 * phones (md:hidden); the desktop grid is rendered separately and untouched.
 */
export function MobileFeed({ initialProducts }: { initialProducts: any[] }) {
  const { t } = useLocale()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>("for-you")
  const [view, setView] = useState<View>("reels")
  const [cat, setCat] = useState("all")
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [seed, setSeed] = useState(0)

  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Paint the native safe-area (status-bar) zone white while the feed is up, so
  // there's no black "cutter" bar above the search on iOS/Android. Same proven
  // approach as LibraryBgFix: inline html background (beats the html.capacitor
  // #000 rule) re-applied on rotation so it can't flash black.
  useEffect(() => {
    const html = document.documentElement
    const prev = html.style.backgroundColor
    const apply = () => { html.style.backgroundColor = "#ffffff" }
    apply()
    html.classList.add("native-feed-bg")
    window.addEventListener("resize", apply, { passive: true })
    window.addEventListener("orientationchange", apply, { passive: true })
    return () => {
      html.style.backgroundColor = prev
      html.classList.remove("native-feed-bg")
      window.removeEventListener("resize", apply)
      window.removeEventListener("orientationchange", apply)
    }
  }, [])

  // Measure the feed viewport so each reels card is EXACTLY one screen tall.
  // Percentage heights on flex children are unreliable across mobile browsers —
  // this guarantees snap pages to one whole listing (no free-scroll / sliver).
  const [slotH, setSlotH] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSlotH(el.clientHeight))
    ro.observe(el)
    setSlotH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const onRefresh = useCallback(async () => {
    setSeed((s) => s + 1)
    router.refresh()
    await new Promise((r) => setTimeout(r, 650))
  }, [router])

  const { pullDistance, phase } = usePullToRefresh(scrollRef, onRefresh)
  // How far the feed content is pushed down: follows the finger while pulling,
  // holds at 52px while refreshing (so the spinner is visible), 0 at rest.
  const ptrOffset = phase === "refreshing" ? 52 : pullDistance

  const products = useMemo(() => {
    let list = (Array.isArray(initialProducts) ? initialProducts : []).filter(Boolean)
    if (cat !== "all") list = list.filter((p) => normalizeCategoryToId(p?.category || "") === cat)
    if (seed > 0 && list.length > 0) {
      const off = seed % list.length
      list = [...list.slice(off), ...list.slice(0, off)]
    }
    return list
  }, [initialProducts, cat, seed])

  const submitSearch = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      const q = query.trim()
      router.push(q ? `/?q=${encodeURIComponent(q)}` : "/")
      searchRef.current?.blur()
    },
    [query, router],
  )

  const focusSearch = useCallback(() => searchRef.current?.focus(), [])
  const toggleView = useCallback(() => setView((v) => (v === "reels" ? "grid" : "reels")), [])

  return (
    <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white" style={{ height: "100dvh" }}>
      {/* ---- Top: search (with view switcher inside) + filter ---- */}
      <div className="shrink-0 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.85rem)" }}>
        <form onSubmit={submitSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              inputMode="search"
              enterKeyHint="search"
              aria-label={t("mfeed.search_placeholder")}
              placeholder=""
              className="h-11 w-full rounded-full border border-neutral-200 bg-neutral-100 pl-10 pr-11 text-sm text-neutral-900 outline-none focus:border-neutral-300"
            />
            <AnimatedSearchPlaceholder
              active={!query && !focused}
              prefix={`${t("mfeed.search_for")} `}
              quoted
              className="absolute left-10 right-11 top-1/2 -translate-y-1/2 text-sm text-neutral-500"
            />
            {/* View switcher — lives inside the search bar */}
            <button
              type="button"
              onClick={toggleView}
              aria-label={t(view === "reels" ? "mfeed.view_grid" : "mfeed.view_reels")}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400 active:text-neutral-700 transition-colors"
            >
              {view === "reels" ? <LayoutGrid className="h-[18px] w-[18px]" /> : <GalleryVerticalEnd className="h-[18px] w-[18px]" />}
            </button>
          </div>
          <button type="button" aria-label={t("mfeed.filters")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 active:scale-95 transition-transform">
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>

      {/* ---- Tabs (full width, evenly distributed) ---- */}
      <div className="shrink-0 flex items-stretch px-3 pt-2.5">
        {([["for-you", "mfeed.for_you"], ["following", "mfeed.following"], ["saved", "mfeed.saved"]] as const).map(([id, key]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn("relative flex-1 pb-2 text-center text-[15px] transition-colors", tab === id ? "font-semibold text-neutral-900" : "font-medium text-neutral-400")}
          >
            {t(key)}
            {tab === id && <span className="absolute left-1/2 -bottom-px h-0.5 w-9 -translate-x-1/2 rounded-full bg-neutral-900" />}
          </button>
        ))}
      </div>

      {/* ---- Category pills (under the tabs) ---- */}
      <div className="shrink-0 flex gap-2 overflow-x-auto scrollbar-hide px-4 pt-1.5 pb-2.5" style={{ scrollbarWidth: "none" }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              cat === c.id ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 active:bg-neutral-200",
            )}
          >
            {t(`category.${c.id}`)}
          </button>
        ))}
      </div>
      <div className="shrink-0 h-px bg-neutral-100" />

      {/* ---- Feed body ---- */}
      <div
        ref={scrollRef}
        className={cn("relative flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide", view === "reels" ? "snap-y snap-mandatory" : "")}
        style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
      >
        {/* iOS pull-to-refresh spinner — sits BEHIND the content and is revealed
            in the gap as the content is pulled down (never overlaps the listing). */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-0 flex justify-center pt-3"
          style={{ opacity: phase === "refreshing" ? 1 : Math.min(1, pullDistance / 45) }}
        >
          <IosSpinner size={26} />
        </div>

        {/* Content wrapper — translates down for the pull gesture; `none` at rest
            so it never establishes a containing block that could disturb snap. */}
        <div
          className="relative z-10 min-h-full bg-white"
          style={{
            transform: ptrOffset > 0 ? `translateY(${ptrOffset}px)` : undefined,
            transition: phase === "pulling" || phase === "ready" ? "none" : "transform 0.4s cubic-bezier(0.23,1,0.32,1)",
          }}
        >
          {tab === "following" ? (
            <EmptyState icon={<Heart className="h-7 w-7" />} title={t("mfeed.following_empty_title")} sub={t("mfeed.following_empty_sub")} />
          ) : tab === "saved" ? (
            <EmptyState icon={<Heart className="h-7 w-7" />} title={t("mfeed.saved_empty_title")} sub={t("mfeed.saved_empty_sub")} />
          ) : products.length === 0 ? (
            <EmptyState title={t("mfeed.empty_title")} sub={t("mfeed.empty_sub")} />
          ) : view === "reels" ? (
            products.map((p, i) => (
              // Exactly one screen tall + scroll-snap-stop:always → one swipe = one
              // whole listing, never resting between two.
              <div
                key={p.id}
                className="w-full snap-start px-2"
                style={{ height: slotH || undefined, scrollSnapAlign: "start", scrollSnapStop: "always" }}
              >
                <MobileListingCard
                  product={p}
                  priority={false}
                  reason={i % 4 === 0 ? t("mfeed.picked_for_you") : i % 4 === 2 ? t("mfeed.based_on_searches") : undefined}
                />
              </div>
            ))
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 px-3 py-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} clientNav />
              ))}
            </div>
          )}
        </div>
      </div>

      <MobileBottomNav active="home" onSearch={focusSearch} />
    </div>
  )
}

function EmptyState({ icon, title, sub }: { icon?: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      {icon && <div className="mb-3 text-neutral-300">{icon}</div>}
      <p className="text-[15px] font-semibold text-neutral-800">{title}</p>
      <p className="mt-1 text-[13px] text-neutral-500">{sub}</p>
    </div>
  )
}
