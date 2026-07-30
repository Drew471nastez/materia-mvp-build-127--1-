"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, SlidersHorizontal, Heart, X } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { AnimatedSearchPlaceholder } from "./animated-search-placeholder"
import { MobileBottomNav } from "./mobile-bottom-nav"
import { MobileSearchOverlay } from "./mobile-search-overlay"
import { ProductCard } from "./product-card"
import { IosSpinner } from "./ios-spinner"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { CATEGORIES, normalizeCategoryToId } from "@/lib/marketplace/categories"
import { cn } from "@/lib/utils"

type Tab = "for-you" | "following" | "saved"

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ["for-you", "mfeed.for_you"],
  ["following", "mfeed.following"],
  ["saved", "mfeed.saved"],
]

// Module-scoped cache of the user's saved listings (full product objects). Kept
// outside React (and mirrored to sessionStorage) so the Saved tab renders
// instantly — no spinner on tab switches, and none across a same-session reload.
const SAVED_SS_KEY = "storelib_saved_items_v1"
let savedItemsCache: any[] | null = null
let savedItemsInflight: Promise<any[]> | null = null

function persistSavedCache(list: any[] | null) {
  savedItemsCache = list
  try {
    if (list) sessionStorage.setItem(SAVED_SS_KEY, JSON.stringify(list))
    else sessionStorage.removeItem(SAVED_SS_KEY)
  } catch {
    /* storage unavailable */
  }
}

/** Best-effort synchronous read so the tab can paint before any fetch resolves. */
function readSavedCache(): any[] | null {
  if (savedItemsCache) return savedItemsCache
  try {
    const raw = sessionStorage.getItem(SAVED_SS_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed)) {
      savedItemsCache = parsed
      return parsed
    }
  } catch {
    /* ignore */
  }
  return null
}

function loadSavedItems(): Promise<any[]> {
  if (savedItemsInflight) return savedItemsInflight
  savedItemsInflight = fetch("/api/wishlist", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((data) => {
      const mapped = ((data?.items ?? []) as any[]).map(mapWishlistItem).filter(Boolean)
      persistSavedCache(mapped)
      return mapped
    })
    .catch(() => savedItemsCache ?? [])
    .finally(() => {
      savedItemsInflight = null
    })
  return savedItemsInflight
}

/**
 * Depop/Vinted-style mobile marketplace surface — a clean 2-column grid.
 * Full-screen overlay on phones (md:hidden); the desktop grid is untouched.
 */
export function MobileFeed({ initialProducts, searchQuery = "" }: { initialProducts: any[]; searchQuery?: string }) {
  const { t } = useLocale()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>("for-you")
  const [cat, setCat] = useState("all")
  const [seed, setSeed] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  // Remembers each tab's scroll offset so returning to For You keeps your place.
  const tabScroll = useRef<Record<Tab, number>>({ "for-you": 0, following: 0, saved: 0 })

  // Switch tabs while saving the outgoing tab's scroll position.
  const switchTab = useCallback(
    (next: Tab) => {
      setTab((cur) => {
        if (cur !== next && scrollRef.current) tabScroll.current[cur] = scrollRef.current.scrollTop
        return next
      })
    },
    [],
  )

  // Paint the native safe-area (status-bar) zone white while the feed is up.
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

  // Bumped once per refresh to (re)trigger the staggered card reveal.
  const [revealNonce, setRevealNonce] = useState(0)
  // Bumped to ask the Saved tab to revalidate (without touching the feed).
  const [savedReload, setSavedReload] = useState(0)

  const onRefresh = useCallback(async () => {
    // Pull-to-refresh is tab-aware. On Saved/Following we must NOT router.refresh()
    // — that reloads the feed (and, with an active search, empties the pool),
    // flashing the saved list to white. Instead we revalidate just that tab.
    if (tab === "saved") {
      setSavedReload((n) => n + 1)
      await new Promise((r) => setTimeout(r, 600))
      return
    }
    if (tab === "following") {
      await new Promise((r) => setTimeout(r, 450))
      return
    }
    router.refresh()
    // Hold the current listings, untouched, while the spinner spins — no fade.
    await new Promise((r) => setTimeout(r, 600))
    // Swap in the fresh order and fire the reveal in the same tick, so the new
    // cards rise into place instead of blinking.
    setSeed((s) => s + 1)
    setRevealNonce((n) => n + 1)
  }, [tab, router])

  const { pullDistance, phase } = usePullToRefresh(scrollRef, onRefresh)
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

  // Category change → back to the top (a different set of listings).
  useEffect(() => {
    tabScroll.current["for-you"] = 0
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" })
  }, [cat])

  // Tab change → restore that tab's remembered scroll position (For You keeps
  // your place instead of reloading to the top).
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: tabScroll.current[tab] ?? 0, behavior: "auto" })
  }, [tab])

  // Warm the saved-listings cache up front so opening the Saved tab is instant.
  useEffect(() => {
    void loadSavedItems()
  }, [])

  // A search always shows results in the main feed — never leave the user on the
  // Saved/Following tab (where they'd see saved items, not what they searched).
  // Bumping the reveal makes the results settle in with the staggered animation.
  useEffect(() => {
    if (searchQuery) {
      tabScroll.current["for-you"] = 0 // fresh results start at the top
      setTab("for-you")
      setRevealNonce((n) => n + 1)
    }
  }, [searchQuery])

  // The for-you grid is memoized so a pull-to-refresh drag (which fires many
  // state updates a second) never rebuilds 30 cards — React reuses this exact
  // element and skips the whole subtree, keeping the pull at full frame rate.
  // On refresh, `revealNonce` flips the animation name so every card replays a
  // staggered rise-in from its new position — a clean settle, never a blink.
  const forYouGrid = useMemo(() => {
    if (products.length === 0) {
      return <EmptyState title={t("mfeed.empty_title")} sub={t("mfeed.empty_sub")} />
    }
    return (
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 px-3 py-3">
        {products.map((p, i) => (
          <div
            key={p.id}
            style={
              revealNonce > 0
                ? {
                    animationName: revealNonce % 2 === 0 ? "card-reveal-a" : "card-reveal-b",
                    animationDuration: "0.66s",
                    animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                    animationFillMode: "both",
                    // Cap the stagger so a long list still finishes quickly.
                    animationDelay: `${Math.min(i, 11) * 26}ms`,
                    willChange: "transform, opacity",
                  }
                : undefined
            }
          >
            <ProductCard product={p} clientNav priority={i < 4} />
          </div>
        ))}
      </div>
    )
  }, [products, revealNonce, t])

  // Tapping the search bar (or the bottom-nav search) opens the full-screen
  // search overlay — the inline field is just a trigger, never typed into.
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const focusSearch = openSearch

  return (
    <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white" style={{ height: "100dvh" }}>
      {/* ---- Search + filter ---- */}
      <div className="shrink-0 px-4" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.85rem)" }}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openSearch}
            aria-label={t("mfeed.search_placeholder")}
            className="relative flex-1 h-11 rounded-full border border-neutral-200 bg-neutral-100 pl-10 pr-10 text-left transition-transform active:scale-[0.99]"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            {searchQuery ? (
              // Active search — show what was searched, so it never looks empty.
              <span className="absolute left-10 right-10 top-1/2 -translate-y-1/2 truncate text-sm font-medium text-neutral-900">
                {searchQuery}
              </span>
            ) : (
              <AnimatedSearchPlaceholder
                active
                prefix={`${t("mfeed.search_for")} `}
                quoted
                className="absolute left-10 right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500"
              />
            )}
          </button>
          {searchQuery ? (
            <button
              type="button"
              aria-label={t("mfeed.clear_all")}
              onClick={() => router.push("/")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 transition-transform active:scale-95"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          ) : (
            <button type="button" aria-label={t("mfeed.filters")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 transition-transform active:scale-95">
              <SlidersHorizontal className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>

      {/* ---- Tabs (full-width buttons; slim underline hugs the word) ---- */}
      <div className="shrink-0 flex items-stretch px-3 pt-3.5">
        {TABS.map(([id, key]) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => switchTab(id)}
              className={cn("flex flex-1 flex-col items-center pb-2.5 text-[15px] transition-colors duration-200", active ? "font-semibold text-neutral-900" : "font-medium text-neutral-400")}
            >
              <span className="relative inline-flex flex-col items-center">
                {t(key)}
                {/* Slim, modern purple-accent underline the exact width of the word */}
                <span className={cn("mt-2 h-[2px] w-full rounded-full bg-[#7c3aed] transition-all duration-300 ease-out", active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0")} />
              </span>
            </button>
          )
        })}
      </div>

      {/* Subtle divider sits BETWEEN the tabs and the category pills. */}
      <div className="shrink-0 mt-1 h-px" style={{ backgroundColor: "rgba(0, 0, 0, 0.07)" }} />

      {/* ---- Category pills ---- */}
      <div className="shrink-0 flex gap-2 overflow-x-auto scrollbar-hide px-4 pt-3 pb-3" style={{ scrollbarWidth: "none" }}>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-[13px] font-medium transition-all duration-200 active:scale-95",
              cat === c.id ? "bg-neutral-900 text-white shadow-sm" : "bg-neutral-100 text-neutral-700 active:bg-neutral-200",
            )}
          >
            {t(`category.${c.id}`)}
          </button>
        ))}
      </div>

      {/* ---- Grid feed with iOS pull-to-refresh ---- */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto overscroll-contain scrollbar-hide"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-0 flex justify-center pt-3.5"
            style={{
              opacity: phase === "refreshing" ? 1 : Math.min(1, pullDistance / 40),
              transform: `scale(${phase === "refreshing" ? 1 : 0.7 + Math.min(1, pullDistance / 70) * 0.3})`,
              transition: phase === "pulling" ? "none" : "opacity 0.3s ease-out, transform 0.3s ease-out",
            }}
          >
            <IosSpinner size={24} />
          </div>

          <div
            className="relative z-10 min-h-full bg-white will-change-transform"
            style={{
              // translate3d forces a GPU layer so the pull + spring-back run on the
              // compositor (buttery, off the main thread) instead of triggering layout.
              transform: `translate3d(0, ${ptrOffset}px, 0)`,
              transition:
                phase === "pulling" || phase === "ready"
                  ? "none"
                  : "transform 0.62s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* key on tab+cat → a soft cross-fade when switching tabs or categories */}
            <div key={`${tab}-${cat}`} className="animate-in fade-in-0 duration-300 ease-out">
              {tab === "following" ? (
                <EmptyState icon={<Heart className="h-7 w-7" />} title={t("mfeed.following_empty_title")} sub={t("mfeed.following_empty_sub")} />
              ) : tab === "saved" ? (
                <SavedTab t={t} reloadSignal={savedReload} />
              ) : (
                forYouGrid
              )}
            </div>
          </div>
        </div>

        {/* Subtle auto-hiding scroll indicator (shows on scroll, fades when idle) */}
        <FeedScrollbar containerRef={scrollRef} />
      </div>

      <MobileBottomNav active="home" onSearch={focusSearch} />

      <MobileSearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectCategory={(id) => {
          setCat(id)
          setTab("for-you")
        }}
        onSearchSubmit={() => {
          tabScroll.current["for-you"] = 0
          setTab("for-you")
        }}
        initialQuery={searchQuery}
      />
    </div>
  )
}

/** Reshapes a /api/wishlist GET item into the ProductCard product shape. */
function mapWishlistItem(item: any) {
  const p = item?.products
  if (!p?.id) return null
  const prof = p.creator_profile
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    price_cents: p.price_cents,
    compare_at_cents: p.compare_at_cents ?? null,
    thumbnail_url: p.thumbnail_url ?? null,
    gallery_urls: p.gallery_urls ?? null,
    type: p.type,
    category: p.category ?? null,
    saves_count: p.saves_count ?? 0,
    creator: {
      id: p.creators?.id,
      slug: p.creators?.slug,
      profile: prof
        ? { display_name: prof.display_name, username: prof.username, avatar_url: prof.avatar_url }
        : null,
    },
  }
}

/**
 * The "Saved" tab. The visible list is derived from `savedIds` — the wishlist
 * store, which is the source of truth and is kept optimistically in sync — and
 * resolved against every product object we already have (the feed `pool`, plus
 * the sessionStorage-cached DB fetch). So the count is exactly right the instant
 * the tab paints; the background DB fetch only fills product data we were
 * missing, never surprises the user with an extra card popping in a second later.
 */
function SavedTab({
  t,
  reloadSignal = 0,
}: {
  t: (key: string) => string
  /** Bumped by pull-to-refresh to force a fresh DB revalidation. */
  reloadSignal?: number
}) {
  // The Saved list is a FROZEN SNAPSHOT of the DB fetch. Un-saving a card does
  // NOT remove it live — it only unfills the heart (the heart reads the live
  // wishlist store). A card leaves the list on the next rebuild: pull-to-refresh,
  // page refresh, or coming back to the tab (this component re-mounts on switch).
  const [snapshot, setSnapshot] = useState<any[] | null>(() => readSavedCache())
  // Bumped when the snapshot is rebuilt via refresh, to stagger the cards in
  // like the For You reload.
  const [revealNonce, setRevealNonce] = useState(0)

  // Build the snapshot on mount (i.e. every time the tab is opened).
  useEffect(() => {
    let cancelled = false
    loadSavedItems().then((list) => {
      if (!cancelled) setSnapshot(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Pull-to-refresh → refetch, then rebuild + rise-in animation. The current
  // list stays on screen until the fresh data arrives (no white flash).
  useEffect(() => {
    if (reloadSignal === 0) return
    let cancelled = false
    savedItemsInflight = null // force past the in-flight guard for a fresh request
    loadSavedItems().then((list) => {
      if (cancelled) return
      setSnapshot(list)
      setRevealNonce((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [reloadSignal])

  if (snapshot === null) {
    // Cold first load: a calm skeleton grid, not a jarring centered spinner.
    return (
      <div className="grid grid-cols-2 gap-x-3 gap-y-5 px-3 py-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[4/5] w-full rounded-xl bg-neutral-100" />
            <div className="mt-2.5 h-3 w-1/2 rounded bg-neutral-100" />
            <div className="mt-1.5 h-3 w-3/4 rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    )
  }

  if (snapshot.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-7 w-7" />}
        title={t("mfeed.saved_empty_title")}
        sub={t("mfeed.saved_empty_sub")}
      />
    )
  }

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-5 px-3 py-3">
      {snapshot.map((p, i) => (
        <div
          key={p.id}
          style={
            revealNonce > 0
              ? {
                  animationName: revealNonce % 2 === 0 ? "card-reveal-a" : "card-reveal-b",
                  animationDuration: "0.66s",
                  animationTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                  animationFillMode: "both",
                  animationDelay: `${Math.min(i, 11) * 26}ms`,
                  willChange: "transform, opacity",
                }
              : undefined
          }
        >
          <ProductCard product={p} clientNav />
        </div>
      ))}
    </div>
  )
}

/**
 * A slim, light-grey scroll indicator that appears while scrolling and fades out
 * after a short idle, reappearing on the next scroll — iOS-overlay-style, but ours
 * so it survives `scrollbar-hide`. Positioned via transform for 120fps.
 */
function FeedScrollbar({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const thumbRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      rafRef.current = 0
      const thumb = thumbRef.current
      if (!thumb) return
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight <= clientHeight + 4) {
        thumb.style.opacity = "0"
        return
      }
      const inset = 6
      const trackH = clientHeight - inset * 2
      const thumbH = Math.max(40, (clientHeight / scrollHeight) * trackH)
      const ratio = scrollTop / (scrollHeight - clientHeight)
      const top = inset + ratio * (trackH - thumbH)
      thumb.style.height = `${thumbH}px`
      thumb.style.transform = `translate3d(0, ${top}px, 0)`
    }

    const onScroll = () => {
      if (!rafRef.current) rafRef.current = requestAnimationFrame(update)
      setVisible(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(() => setVisible(false), 1600)
    }

    update()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      el.removeEventListener("scroll", onScroll)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [containerRef])

  return (
    <div
      ref={thumbRef}
      aria-hidden="true"
      className="pointer-events-none absolute right-[3px] top-0 z-20 w-[3px] rounded-full"
      style={{
        backgroundColor: "rgba(0,0,0,0.22)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s ease",
        willChange: "transform, opacity, height",
      }}
    />
  )
}

function EmptyState({ icon, title, sub }: { icon?: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
      {icon && <div className="mb-3 text-neutral-300">{icon}</div>}
      <p className="text-[15px] font-semibold text-neutral-800">{title}</p>
      <p className="mt-1 text-[13px] text-neutral-500">{sub}</p>
    </div>
  )
}
