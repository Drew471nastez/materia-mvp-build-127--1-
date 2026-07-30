"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, SlidersHorizontal, Heart } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { AnimatedSearchPlaceholder } from "./animated-search-placeholder"
import { MobileBottomNav } from "./mobile-bottom-nav"
import { ProductCard } from "./product-card"
import { IosSpinner } from "./ios-spinner"
import { useWishlistedIds } from "./wishlist-context"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { CATEGORIES, normalizeCategoryToId } from "@/lib/marketplace/categories"
import { cn } from "@/lib/utils"

type Tab = "for-you" | "following" | "saved"

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ["for-you", "mfeed.for_you"],
  ["following", "mfeed.following"],
  ["saved", "mfeed.saved"],
]

/**
 * Depop/Vinted-style mobile marketplace surface — a clean 2-column grid.
 * Full-screen overlay on phones (md:hidden); the desktop grid is untouched.
 */
export function MobileFeed({ initialProducts }: { initialProducts: any[] }) {
  const { t } = useLocale()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>("for-you")
  const [cat, setCat] = useState("all")
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [seed, setSeed] = useState(0)

  const searchRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  const onRefresh = useCallback(async () => {
    router.refresh()
    // Hold the current listings, untouched, while the spinner spins — no fade.
    await new Promise((r) => setTimeout(r, 600))
    // Swap in the fresh order and fire the reveal in the same tick, so the new
    // cards rise into place instead of blinking.
    setSeed((s) => s + 1)
    setRevealNonce((n) => n + 1)
  }, [router])

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

  // Switching tab or category should start from the top — never leave the user
  // scrolled halfway into a shorter list.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" })
  }, [tab, cat])

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

  return (
    <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white" style={{ height: "100dvh" }}>
      {/* ---- Search + filter ---- */}
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
              className="h-11 w-full rounded-full border border-neutral-200 bg-neutral-100 pl-10 pr-4 text-sm text-neutral-900 outline-none focus:border-neutral-300"
            />
            <AnimatedSearchPlaceholder
              active={!query && !focused}
              prefix={`${t("mfeed.search_for")} `}
              quoted
              className="absolute left-10 right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-500"
            />
          </div>
          <button type="button" aria-label={t("mfeed.filters")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-neutral-100 text-neutral-700 transition-transform active:scale-95">
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </button>
        </form>
      </div>

      {/* ---- Tabs (full-width buttons; slim underline hugs the word) ---- */}
      <div className="shrink-0 flex items-stretch px-3 pt-3.5">
        {TABS.map(([id, key]) => {
          const active = tab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn("flex flex-1 flex-col items-center pb-2.5 text-[15px] transition-colors duration-200", active ? "font-semibold text-neutral-900" : "font-medium text-neutral-400")}
            >
              <span className="relative inline-flex flex-col items-center">
                {t(key)}
                {/* Slim, modern underline the exact width of the word */}
                <span className={cn("mt-2 h-[2px] w-full rounded-full bg-neutral-900 transition-all duration-300 ease-out", active ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0")} />
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
      <div
        ref={scrollRef}
        className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide"
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
              <SavedTab t={t} />
            ) : (
              forYouGrid
            )}
          </div>
        </div>
      </div>

      <MobileBottomNav active="home" onSearch={focusSearch} />
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
 * The "Saved" tab. Reads the user's saved listings straight from the database
 * (independent of what the feed loaded), so every heart the user tapped shows
 * here. Un-saving animates the card out cleanly before it leaves the grid.
 */
function SavedTab({ t }: { t: (key: string) => string }) {
  const savedIds = useWishlistedIds()
  const [items, setItems] = useState<any[] | null>(null) // null = still loading
  const [removing, setRemoving] = useState<Set<string>>(() => new Set())
  // Snapshot of the previous saved set so we only animate a card out when an id
  // goes present → absent (never on the initial empty → loaded fill).
  const prevSaved = useRef<ReadonlySet<string>>(savedIds)

  useEffect(() => {
    let cancelled = false
    fetch("/api/wishlist", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => {
        if (cancelled) return
        setItems(((data?.items ?? []) as any[]).map(mapWishlistItem).filter(Boolean))
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const prev = prevSaved.current
    prevSaved.current = savedIds
    if (!items) return
    const gone = items.filter((p) => prev.has(p.id) && !savedIds.has(p.id) && !removing.has(p.id))
    if (gone.length === 0) return

    setRemoving((cur) => {
      const next = new Set(cur)
      gone.forEach((p) => next.add(p.id))
      return next
    })
    const timer = setTimeout(() => {
      setItems((cur) => (cur ? cur.filter((p) => savedIds.has(p.id)) : cur))
      setRemoving((cur) => {
        const next = new Set(cur)
        gone.forEach((p) => next.delete(p.id))
        return next
      })
    }, 560)
    return () => clearTimeout(timer)
  }, [savedIds, items, removing])

  if (items === null) {
    return (
      <div className="flex min-h-[45vh] items-center justify-center">
        <IosSpinner size={26} />
      </div>
    )
  }

  if (items.length === 0) {
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
      {items.map((p) => {
        const leaving = removing.has(p.id)
        return (
          <div
            key={p.id}
            className="transition-all duration-[560ms] will-change-transform"
            style={{
              // easeOutQuint — the card glides away and settles into nothing,
              // rather than blinking out.
              transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              opacity: leaving ? 0 : 1,
              transform: leaving ? "scale(0.84) translateY(-6px)" : "scale(1) translateY(0)",
              filter: leaving ? "blur(2px)" : "blur(0px)",
            }}
          >
            <ProductCard product={p} clientNav />
          </div>
        )
      })}
    </div>
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
