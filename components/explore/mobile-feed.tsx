"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, SlidersHorizontal, LayoutGrid, GalleryVerticalEnd, Loader2, Heart } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { AnimatedSearchPlaceholder } from "./animated-search-placeholder"
import { MobileListingCard } from "./mobile-listing-card"
import { MobileBottomNav } from "./mobile-bottom-nav"
import { ProductCard } from "./product-card"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
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
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [seed, setSeed] = useState(0)

  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Pull-to-refresh: reshuffle the feed (cheap, offline, feels live) and pull
  // fresh server data in the background.
  const onRefresh = useCallback(async () => {
    setSeed((s) => s + 1)
    router.refresh()
    await new Promise((r) => setTimeout(r, 650))
  }, [router])

  const { pullDistance, phase } = usePullToRefresh(scrollRef, onRefresh)

  // "For You" reshuffles on each refresh; a stable rotation keeps it deterministic
  // for SSR (no Math.random) yet visibly different after a pull.
  const products = useMemo(() => {
    const list = Array.isArray(initialProducts) ? initialProducts.filter(Boolean) : []
    if (seed === 0 || list.length === 0) return list
    const offset = seed % list.length
    return [...list.slice(offset), ...list.slice(0, offset)]
  }, [initialProducts, seed])

  const submitSearch = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      const q = query.trim()
      router.push(q ? `/?q=${encodeURIComponent(q)}` : "/")
      searchRef.current?.blur()
    },
    [query, router],
  )

  const focusSearch = useCallback(() => {
    searchRef.current?.scrollIntoView({ block: "start", behavior: "smooth" })
    searchRef.current?.focus()
  }, [])

  return (
    <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white" style={{ height: "100dvh" }}>
      {/* ---- Top bar: search + filter ---- */}
      <div className="shrink-0 px-4 pt-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}>
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
              className="h-11 w-full rounded-full border border-neutral-200 bg-neutral-100 pl-10 pr-4 text-sm text-neutral-900 outline-none focus:border-neutral-300"
            />
            <AnimatedSearchPlaceholder active={!query && !focused} className="absolute left-10 right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500" />
          </div>
          <button type="button" aria-label={t("mfeed.filters")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 active:scale-95 transition-transform">
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>

      {/* ---- Tabs + view switcher ---- */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-2">
        <div className="flex items-center gap-5">
          {([["for-you", "mfeed.for_you"], ["following", "mfeed.following"], ["saved", "mfeed.saved"]] as const).map(([id, key]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "relative pb-2 text-[15px] transition-colors",
                tab === id ? "font-semibold text-neutral-900" : "font-medium text-neutral-400",
              )}
            >
              {t(key)}
              {tab === id && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-neutral-900" />}
            </button>
          ))}
        </div>
        {/* Subtle reels/grid switcher */}
        <button
          type="button"
          onClick={() => setView((v) => (v === "reels" ? "grid" : "reels"))}
          aria-label={t(view === "reels" ? "mfeed.view_grid" : "mfeed.view_reels")}
          className="mb-2 flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 active:scale-95 transition-transform"
        >
          {view === "reels" ? <LayoutGrid className="h-5 w-5" /> : <GalleryVerticalEnd className="h-5 w-5" />}
        </button>
      </div>
      <div className="shrink-0 h-px bg-neutral-100" />

      {/* ---- Feed body ---- */}
      <div
        ref={scrollRef}
        className={cn(
          "relative flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide",
          view === "reels" ? "snap-y snap-mandatory" : "",
        )}
        style={{ scrollbarWidth: "none" }}
      >
        {/* Pull-to-refresh indicator */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-center"
          style={{ height: pullDistance, opacity: pullDistance > 8 ? 1 : 0 }}
        >
          <Loader2 className={cn("h-5 w-5 text-neutral-400", phase === "refreshing" ? "animate-spin" : "")} style={{ transform: `rotate(${pullDistance * 3}deg)` }} />
        </div>

        {tab === "following" ? (
          <EmptyState icon={<Heart className="h-7 w-7" />} title={t("mfeed.following_empty_title")} sub={t("mfeed.following_empty_sub")} />
        ) : tab === "saved" ? (
          <EmptyState icon={<Heart className="h-7 w-7" />} title={t("mfeed.saved_empty_title")} sub={t("mfeed.saved_empty_sub")} />
        ) : products.length === 0 ? (
          <EmptyState title={t("mfeed.empty_title")} sub={t("mfeed.empty_sub")} />
        ) : view === "reels" ? (
          products.map((p, i) => (
            <div key={p.id} className="h-full w-full snap-start snap-always px-3 py-3">
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
