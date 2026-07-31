"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, SlidersHorizontal, Heart, X, LayoutGrid, GalleryVerticalEnd, ChevronLeft } from "lucide-react"
import { useLocale } from "@/components/locale-provider"
import { AnimatedSearchPlaceholder } from "./animated-search-placeholder"
import { MobileBottomNav } from "./mobile-bottom-nav"
import { MobileSearchOverlay } from "./mobile-search-overlay"
import { WishlistToast } from "./wishlist-toast"
import { ReelsPager } from "./reels-pager"
import { ProductCard } from "./product-card"
import { IosSpinner } from "./ios-spinner"
import { useWishlistedIds } from "./wishlist-context"
import {
  FollowingPeopleList,
  usePresenceHeartbeat,
  type FollowedPerson,
} from "./following-people-list"
import { useFeedPullRefresh } from "@/hooks/use-feed-pull-refresh"
import { CATEGORIES, normalizeCategoryToId } from "@/lib/marketplace/categories"
import { signalArrival } from "@/lib/nav-blend"
import { cn } from "@/lib/utils"

type Tab = "for-you" | "following" | "saved"

/** Opening the app: a longer, calmer arrival. */
const ENTRY_MS = 700
/** Swapping one screen for the other. The motion is depth only — see
 *  `layerStyle` — and depth reads fast, so this is shorter than a slide would
 *  need to be without feeling clipped. */
const XFADE_MS = 520
/** Height of the category pill bar. It overlays the feed, so the scroll content
 *  reserves the same amount, and the pull-to-refresh spinner parks behind it. */
const CATBAR_H = 58

type Screen = "grid" | "reels"

type Curtain = {
  /** cover = opaque · lift = fading away */
  phase: "cover" | "lift" | "off"
  ms: number
}

// Module-scoped on purpose: the entry intro belongs to opening the APP, not to
// mounting this component. Navigating away and back shouldn't replay it.
let introPlayed = false

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ["for-you", "mfeed.for_you"],
  ["following", "mfeed.following"],
  ["saved", "mfeed.saved"],
]

// Module-scoped cache of the user's saved listings (full product objects). Kept
// outside React (and mirrored to sessionStorage) so the Saved tab renders
// instantly — no spinner on tab switches, and none across a same-session reload.
// The people you follow, kept across tab switches so returning to Following
// doesn't show a skeleton for something you were just looking at.
let followingCache: FollowedPerson[] | null = null

/** Where the For You grid was left, so a back navigation returns to it. */
const FEED_SCROLL_KEY = "storelib_feed_scroll_v1"

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
export function MobileFeed({
  initialProducts,
  searchQuery = "",
  initialView = "grid",
}: {
  initialProducts: any[]
  searchQuery?: string
  /** Resolved server-side from the cookie so the right view renders with no flash. */
  initialView?: "grid" | "reels"
}) {
  const { t } = useLocale()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>("for-you")
  const [cat, setCat] = useState("all")
  const [seed, setSeed] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false)
  // Browsing style for the For You feed. Seeded server-side from the cookie
  // (`initialView`) so the correct view renders on first paint with NO grid flash.
  // Remembered across navigations / app restarts (until the user switches back).
  const [view, setView] = useState<"grid" | "reels">(initialView)
  useEffect(() => {
    try {
      localStorage.setItem("storelib_feed_view", view)
      document.cookie = `storelib_feed_view=${view}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    } catch {
      /* storage unavailable */
    }
  }, [view])

  // The cookie is the fast path, but it can be missing (WKWebView drops JS
  // cookies between app launches). localStorage never is — the head script has
  // already read it onto <html> before the first pixel, so correcting from it
  // here, in a LAYOUT effect, lands before the browser paints the hydrated tree.
  // The entry curtain covers the server's guess until this has settled, so a
  // wrong cookie can no longer show up as a second of grid.
  useLayoutEffect(() => {
    try {
      const v = document.documentElement.getAttribute("data-feed-view")
      if ((v === "reels" || v === "grid") && v !== initialView) setView(v)
    } catch {
      /* SSR / no DOM */
    }
    // Intentionally mount-only: later changes are the user's own switching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scrollRef = useRef<HTMLDivElement>(null)
  const feedContentRef = useRef<HTMLDivElement>(null)
  const feedSpinnerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [reelsHeight, setReelsHeight] = useState(0)

  const reelsActive = view === "reels" && tab === "for-you"
  // Categories filter the For You feed and nothing else — on Saved and Following
  // they were dead controls sitting above the results.
  const showCats = tab === "for-you"
  const catBarH = showCats ? CATBAR_H : 0

  // The curtain now covers ONE case only: opening the app, where there is no
  // previous screen to dissolve from. Every in-app change of screen cross-fades
  // instead (see below) — a curtain there meant staring at a flat black or white
  // rectangle mid-transition, which is exactly what read as a snap.
  const [curtain, setCurtain] = useState<Curtain>(() =>
    introPlayed ? { phase: "off", ms: 0 } : { phase: "cover", ms: ENTRY_MS },
  )

  // ---- Screen cross-fade ----
  // Grid and reels are two whole screens. Rather than swapping one for the other
  // (which exposes the root background for a frame) or hiding the swap behind an
  // opaque colour, the outgoing screen STAYS MOUNTED and the incoming one
  // dissolves in on top of it. Nothing empty is ever on screen, and because the
  // backdrop is the real previous screen, any mounting cost of the incoming one
  // is hidden behind it rather than showing as a stall.
  const screen: Screen = reelsActive ? "reels" : "grid"
  const [fadeFrom, setFadeFrom] = useState<Screen | null>(null)
  const [fadedIn, setFadedIn] = useState(false)
  const prevScreen = useRef(screen)
  /** A screen swap is in flight — everything else holds still until it isn't. */
  const transitioning = fadeFrom !== null

  useLayoutEffect(() => {
    if (prevScreen.current === screen) return
    setFadeFrom(prevScreen.current)
    setFadedIn(false)
    prevScreen.current = screen
  }, [screen])

  // Hold at opacity 0 until the incoming screen actually has something to show,
  // so the dissolve reveals a finished screen rather than one still laying out.
  useEffect(() => {
    if (fadeFrom === null || fadedIn) return
    if (screen === "reels" && reelsHeight <= 0) return

    let cancelled = false
    let first = 0
    let second = 0
    const begin = () => {
      if (cancelled) return
      // TWO frames, not one. With one, the opacity:0 starting style and the
      // opacity:1 target could land in the same commit — the browser then sees no
      // change to animate and jumps straight there. That's why the switch was
      // sometimes smooth and sometimes an instant cut. Waiting a second frame
      // guarantees the starting style has been committed and painted first.
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          if (!cancelled) setFadedIn(true)
        })
      })
    }

    // Going to reels, wait for the first photo to have actually arrived.
    //
    // This is the other half of the "double" — and it was never an animation at
    // all. A reel is full-bleed, so it needs a much larger source than the grid
    // thumbnail of the same listing; the browser has to fetch and decode a new
    // file. Blend on mount and you dissolve to a black screen, and the photo
    // lands a moment later on its own. Two events, and the eye reads the second
    // as the transition happening again.
    //
    // The first slot is `priority`, so the request is already in flight by the
    // time this runs — we are only declining to start until it lands. Capped,
    // because on a bad connection a frozen screen is the worse failure.
    if (screen === "reels") {
      const img = stageRef.current?.querySelector<HTMLImageElement>(".reel-photo img")
      if (img && !img.complete) {
        let timer = 0
        const go = () => {
          window.clearTimeout(timer)
          img.removeEventListener("load", go)
          img.removeEventListener("error", go)
          begin()
        }
        img.addEventListener("load", go, { once: true })
        img.addEventListener("error", go, { once: true })
        timer = window.setTimeout(go, 400)
        return () => {
          cancelled = true
          window.clearTimeout(timer)
          img.removeEventListener("load", go)
          img.removeEventListener("error", go)
          cancelAnimationFrame(first)
          if (second) cancelAnimationFrame(second)
        }
      }
    }

    begin()
    return () => {
      cancelled = true
      cancelAnimationFrame(first)
      if (second) cancelAnimationFrame(second)
    }
  }, [fadeFrom, fadedIn, screen, reelsHeight])

  useEffect(() => {
    if (!fadedIn || fadeFrom === null) return
    const timer = setTimeout(() => {
      setFadeFrom(null)
      setFadedIn(false)
    }, XFADE_MS)
    return () => clearTimeout(timer)
  }, [fadedIn, fadeFrom])

  const layerStyle = useCallback(
    (which: Screen): React.CSSProperties | undefined => {
      if (fadeFrom === null) return undefined
      // The two screens move along Z and nothing else. No rise, no slide, no
      // drift — going in, the reel comes forward out of the page while the grid
      // carries on past you; coming back, it reverses exactly, the reel falling
      // away and the grid settling back down to size. Because the axis is depth
      // rather than the vertical, the pair reads as one screen being replaced by
      // another at a different distance instead of a sheet being dragged over
      // the top of it, and there is no direction of travel for the eye to catch
      // and call a slide.
      //
      // It also runs quicker for the same perceived smoothness: a slide has to
      // cover the height of the screen, so cutting its duration makes it snap,
      // whereas a scale of a tenth is legible in half the time.
      //
      // transform + opacity only — both composited, so nothing here can drop a
      // frame regardless of what the main thread is doing behind it.
      // The travel is deliberately small. A tenth of a scale is a gesture you
      // notice; a twentieth is one you only feel, and feeling it is the point —
      // this runs every time you change view, so anything with a flourish in it
      // becomes tiresome by the third use and starts to read as the interface
      // lurching rather than responding.
      const forward = screen === "reels"
      if (which === fadeFrom) {
        return {
          pointerEvents: "none", // inert, so it can't take a tap on its way out
          zIndex: 0,
          opacity: fadedIn ? 0 : 1,
          transform: fadedIn ? `scale(${forward ? 1.05 : 0.965})` : "scale(1)",
          // Holds full opacity for most of the run and clears late, so the
          // screen underneath is never showing through a half-transparent one.
          transition: `opacity ${Math.round(XFADE_MS * 0.5)}ms cubic-bezier(0.4, 0, 0.6, 1) ${Math.round(XFADE_MS * 0.35)}ms, transform ${XFADE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          willChange: "transform, opacity",
        }
      }
      return {
        opacity: fadedIn ? 1 : 0,
        transform: fadedIn ? "scale(1)" : `scale(${forward ? 0.965 : 1.045})`,
        // Opaque well before it stops moving, so most of what you watch is a
        // solid screen settling rather than a translucent one.
        transition: `opacity ${Math.round(XFADE_MS * 0.42)}ms cubic-bezier(0.4, 0, 0.4, 1), transform ${XFADE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        zIndex: 1, // above the outgoing screen, below the nav (z-40)
        willChange: "transform, opacity",
      }
    },
    [fadeFrom, fadedIn, screen],
  )

  // Reels has nothing to show until its height is measured — lifting before then
  // would reveal an empty black screen, which is the very flash we're removing.
  const ready = !reelsActive || reelsHeight > 0

  useEffect(() => {
    if (curtain.phase !== "cover" || !ready) return
    introPlayed = true
    const timer = setTimeout(
      () => setCurtain((c) => (c.phase === "cover" ? { phase: "lift", ms: c.ms } : c)),
      140,
    )
    return () => clearTimeout(timer)
  }, [curtain.phase, ready])

  useEffect(() => {
    if (curtain.phase !== "lift") return
    const timer = setTimeout(() => setCurtain({ phase: "off", ms: 0 }), curtain.ms)
    return () => clearTimeout(timer)
  }, [curtain])

  // Switching views: cover FIRST, swap behind the curtain, then lift. Swapping
  // in place is what made the toggle feel abrupt — a whole screen replaced in one
  // frame reads as a glitch no matter how it's eased.
  const viewRef = useRef(view)
  viewRef.current = view

  const switchView = useCallback((next: "grid" | "reels") => {
    if (viewRef.current === next) return
    try {
      // Only matters for the next cold start's entry curtain.
      document.documentElement.style.setProperty("--feed-entry-bg", next === "reels" ? "#000" : "#fff")
    } catch {
      /* no DOM */
    }
    setView(next)
    // Both views ARE the For You feed, so picking one from Saved or Following
    // means "take me to the feed like that". It used to just set the view behind
    // the scenes and appear to do nothing at all.
    setTab("for-you")
  }, [])

  // The feed settles out of a barely-there zoom as the curtain lifts, so arriving
  // reads as one continuous movement rather than a screen being swapped in. Scale
  // DOWN to 1 (never up) so the content is always at least as big as its frame —
  // no edge can ever peek through mid-animation.


  // Measure the STAGE, always — not the reels area only once reels is showing.
  // Both fill the same box, but measuring the stage means the height is already
  // known before the reels layer mounts. It used to be measured after, so
  // switching to reels meant tap → nothing → measure → only then the dissolve
  // could start. That dead beat before anything moved is most of why the switch
  // felt abrupt: it read as a stall followed by a jump.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setReelsHeight((prev) => (prev === el.clientHeight ? prev : el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Remembers each tab's scroll offset so returning to For You keeps your place.
  const tabScroll = useRef<Record<Tab, number>>({ "for-you": 0, following: 0, saved: 0 })

  // Category bar behaves like a "sticky on scroll-up" header: hides when you
  // scroll down into the feed, glides back the moment you scroll up.
  const [pillsHidden, setPillsHidden] = useState(false)
  const lastScrollY = useRef(0)
  const pillsHiddenRef = useRef(false)

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
  const [followingReload, setFollowingReload] = useState(0)

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
      setFollowingReload((n) => n + 1)
      await new Promise((r) => setTimeout(r, 600))
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

  // Imperative iOS-grade pull-to-refresh — re-attaches whenever the grid mounts
  // (enabled flips), so it never silently stops after a grid↔reels switch.
  useFeedPullRefresh({
    scrollRef,
    contentRef: feedContentRef,
    spinnerRef: feedSpinnerRef,
    onRefresh,
    enabled: !reelsActive,
    offsetTop: catBarH,
  })

  // Restore the scroll offset in a LAYOUT effect, before the browser paints — so
  // returning from a listing shows the feed already where you left it, instead
  // of showing the top and then jumping.
  useLayoutEffect(() => {
    // Returning from a listing is a blended navigation, and the blend holds the
    // old screen on screen until this says the feed is ready. Ready means AFTER
    // the offset below has landed — photograph the feed while it is still sat at
    // the top and you dissolve into the wrong place and then jump. Every path
    // out of here signals, including the ones with nothing to restore.
    if (reelsActive || tab !== "for-you") {
      signalArrival()
      return
    }
    let saved = 0
    try {
      saved = Number(sessionStorage.getItem(FEED_SCROLL_KEY)) || 0
    } catch {
      signalArrival()
      return
    }
    if (!(saved > 0)) {
      signalArrival()
      return
    }

    // Setting scrollTop before the grid has laid out silently CLAMPS to 0 — the
    // container has no scrollable height yet, so the browser accepts the write
    // and discards it. That is why back always landed at the top: the restore
    // ran, and did nothing.
    //
    // So it retries across frames until the offset actually sticks, and gives up
    // after ~1s rather than fighting a feed that genuinely is shorter now (a
    // filtered category, a refreshed list).
    let raf = 0
    const deadline = performance.now() + 1000
    const attempt = () => {
      const el = scrollRef.current
      if (el && el.scrollHeight > el.clientHeight) {
        el.scrollTop = saved
        lastScrollY.current = el.scrollTop
        // Landed close enough — images still loading can shift it by a pixel or
        // two, and chasing that would fight the user's own scrolling.
        if (Math.abs(el.scrollTop - saved) < 4) {
          signalArrival()
          return
        }
      }
      if (performance.now() < deadline) raf = requestAnimationFrame(attempt)
      else signalArrival() // gave up, but the feed is still what you're looking at
    }
    raf = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(raf)
    // Mount-only: later scrolling is the user's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // The bar's hidden/shown state belongs to the tab and view you were scrolling.
  // Arriving at a fresh one it must start visible — otherwise it stays tucked
  // away until you happen to scroll up, since nothing else re-triggers the
  // scroll handler. That stale-hidden bar over a spacer that still reserves its
  // height is the random empty white strip at the top of the feed.
  useEffect(() => {
    pillsHiddenRef.current = false
    setPillsHidden(false)
    lastScrollY.current = 0
  }, [tab, screen, cat])

  // Hide the category bar on scroll-down, reveal it on scroll-up (grid only).
  useEffect(() => {
    if (reelsActive) return
    const el = scrollRef.current
    if (!el) return
    const setHidden = (v: boolean) => {
      if (pillsHiddenRef.current === v) return
      pillsHiddenRef.current = v
      setPillsHidden(v)
    }
    const onScroll = () => {
      const y = el.scrollTop
      const dy = y - lastScrollY.current
      if (y <= 10) setHidden(false) // always show at the very top
      else if (dy > 6) setHidden(true) // scrolling down → hide
      else if (dy < -6) setHidden(false) // scrolling up → reveal
      lastScrollY.current = y
      // Remember where we are, so coming back from a listing lands here rather
      // than at the top. The feed scrolls inside its own container, not the
      // window, so neither the browser's scroll restoration nor Next's can see
      // this position — it has to be stored and put back by hand.
      try {
        sessionStorage.setItem(FEED_SCROLL_KEY, String(y))
      } catch {
        /* storage unavailable */
      }
    }
    // Sync from the element itself on attach. A remount (grid ↔ reels, category
    // change) restores scrollTop 0 without ever firing a scroll event, so state
    // alone can disagree with what's actually on screen.
    lastScrollY.current = el.scrollTop
    if (el.scrollTop <= 10) setHidden(false)

    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [reelsActive, tab, cat])

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
            <ProductCard product={p} clientNav priority={i < 4} origin={searchQuery ? "search" : cat !== "all" ? "category" : "feed"} />
          </div>
        ))}
      </div>
    )
  }, [products, revealNonce, t])

  // Warm the listings you can actually see.
  //
  // Warming on touch only buys the ~100ms between a finger landing and lifting,
  // and the product page is force-dynamic with database queries behind it — so
  // a tap still waited on a cold round trip. That is the "not under one second".
  //
  // The routes for the visible cards are prefetched during idle instead, so by
  // the time you tap, the page is already in the client cache and opening it is
  // a render rather than a request. Capped and idle-scheduled: prefetching a
  // hundred dynamic pages to open one would trade this delay for a worse one.
  useEffect(() => {
    if (reelsActive) return
    const slugs = products
      .slice(0, 12)
      .map((p: any) => p?.slug)
      .filter(Boolean)
    if (!slugs.length) return

    let cancelled = false
    const run = () => {
      if (cancelled) return
      for (const slug of slugs) router.prefetch(`/products/${encodeURIComponent(slug)}`)
    }
    const ric = (window as any).requestIdleCallback
    const handle = ric ? ric(run, { timeout: 2000 }) : window.setTimeout(run, 400)
    return () => {
      cancelled = true
      if (ric && (window as any).cancelIdleCallback) (window as any).cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
  }, [products, reelsActive, router])

  // Tapping the search bar (or the bottom-nav search) opens the full-screen
  // search overlay — the inline field is just a trigger, never typed into.
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const focusSearch = openSearch

  return (
    <div className="md:hidden fixed inset-0 z-[60] flex flex-col bg-white" style={{ height: "100dvh" }}>
      {/* Entry curtain — opaque, already the destination view's colour on the
          very first painted frame (the head script sets --feed-entry-bg from
          localStorage before anything renders). It hides the server's guess
          while the real view resolves, then lifts. Rendered above the feed but
          below the bottom nav's own layer, and never interactive. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[75]"
        style={{
          background: "var(--feed-entry-bg, #fff)",
          // Always mounted so both the fade-in and the lift are real
          // transitions — a curtain that mounts already-opaque can only ever
          // pop. `visibility` keeps it out of the compositor when idle.
          opacity: curtain.phase === "cover" ? 1 : 0,
          visibility: curtain.phase === "off" ? "hidden" : "visible",
          transition: `opacity ${curtain.ms || 1}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      />

      {/* Stage — both screens live here, in the same box, so a cross-fade swaps
          like for like and the bottom nav stays in flow underneath.

          It is painted in the INCOMING screen's own colour. The outgoing layer
          pulls back from the frame edges on the way out, and without a floor
          underneath it that would uncover the root background — a white rim
          around a black reel, which is exactly the blink you'd notice. Matching
          the arriving screen makes anything it uncovers invisible. */}
      <div
        ref={stageRef}
        className="relative flex min-h-0 flex-1 flex-col"
        data-xfade={transitioning ? "1" : undefined}
        style={{ backgroundColor: screen === "reels" ? "#000" : "#fff" }}
      >

      {(screen === "reels" || fadeFrom === "reels") && (
      <div className="absolute inset-0 flex min-h-0 flex-col" style={layerStyle("reels")}>
        {/* ---------- REELS: full-screen image with overlaid TikTok-style controls ---------- */}
        <div className="relative flex-1 min-h-0 bg-black">
          {reelsHeight > 0 && products.length > 0 ? (
            <ReelsPager products={products} height={reelsHeight} onRefresh={onRefresh} />
          ) : products.length === 0 ? (
            <div className="flex h-full items-center justify-center bg-white">
              <EmptyState title={t("mfeed.empty_title")} sub={t("mfeed.empty_sub")} />
            </div>
          ) : null}

          {/* Overlaid controls: tabs + search icon + grid toggle, then category pills */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-20"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.4rem)" }}
          >
            <div className="pointer-events-auto flex items-center gap-2 px-3">
              {/* Breadcrumb "back to grid" on the LEFT — ‹ + grid glyph */}
              <button
                type="button"
                onClick={() => switchView("grid")}
                aria-label={t("mfeed.view_grid")}
                className="flex h-9 shrink-0 items-center gap-0.5 rounded-full bg-black/30 pl-1.5 pr-2.5 text-white backdrop-blur-sm transition-transform active:scale-95"
              >
                <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.5} />
                <LayoutGrid className="h-[16px] w-[16px]" />
              </button>
              <div className="flex flex-1 items-stretch">
                {TABS.map(([id, key]) => {
                  const active = tab === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => switchTab(id)}
                      className="flex flex-1 flex-col items-center pb-2 text-[15px]"
                    >
                      <span
                        className={cn(
                          "relative inline-flex flex-col items-center [text-shadow:0_1px_6px_rgba(0,0,0,0.55)]",
                          active ? "font-semibold text-white" : "font-medium text-white/70",
                        )}
                      >
                        {t(key)}
                        <span
                          className={cn(
                            "mt-1.5 h-[2px] w-full rounded-full bg-white transition-all duration-300",
                            active ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                          )}
                        />
                      </span>
                    </button>
                  )
                })}
              </div>
              {/* Purple brand search icon on the RIGHT */}
              <button
                type="button"
                onClick={openSearch}
                aria-label={t("mfeed.search")}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-90"
                style={{ background: "linear-gradient(150deg, #8b5cf6 0%, #7c3aed 100%)" }}
              >
                <Search className="h-[19px] w-[19px]" />
              </button>
            </div>
            <div
              className="pointer-events-auto mt-2.5 flex gap-2 overflow-x-auto scrollbar-hide px-3 pb-2.5"
              style={{ scrollbarWidth: "none" }}
            >
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCat(c.id)}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium backdrop-blur-md transition-all duration-200 active:scale-95",
                    cat === c.id ? "bg-white text-neutral-900 shadow-sm" : "bg-black/30 text-white",
                  )}
                >
                  {t(`category.${c.id}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {(screen === "grid" || fadeFrom === "grid") && (
      <div className="absolute inset-0 flex min-h-0 flex-col bg-white" style={layerStyle("grid")}>
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

          {/* View switcher — LAST in the row, to the right of the filter button.
              It's the one control here that changes the whole surface, so it
              carries the brand purple and a little elevation: a raised, lit
              button reads as pressable in a way another flat grey circle does
              not. The icon shows the view you'll GET, not the one you're in. */}
          <button
            type="button"
            aria-label={view === "grid" ? t("mfeed.view_reels") : t("mfeed.view_grid")}
            aria-pressed={view === "reels"}
            onClick={() => switchView(view === "grid" ? "reels" : "grid")}
            className="no-tap-fade group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
            style={{
              // A lit top edge over a slightly deeper base, so it reads as a
              // rounded solid rather than a flat purple disc.
              background: "linear-gradient(160deg, #8b5cf6 0%, #7c3aed 52%, #6d28d9 100%)",
              // Two shadows: a tight contact shadow to seat it on the surface,
              // and a wider brand-tinted glow so it lifts off the white row.
              boxShadow:
                "0 1px 2px rgba(76, 29, 149, 0.28), 0 6px 16px -4px rgba(124, 58, 237, 0.55), inset 0 1px 0 rgba(255,255,255,0.22)",
              transition: "transform 340ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 340ms ease",
            }}
            onPointerDown={(e) => {
              // Presses in, and the glow tucks under it — the button sinks toward
              // the surface rather than just getting smaller.
              const el = e.currentTarget
              el.style.transform = "scale(0.9)"
              el.style.boxShadow =
                "0 1px 1px rgba(76, 29, 149, 0.3), 0 2px 6px -2px rgba(124, 58, 237, 0.5), inset 0 1px 0 rgba(255,255,255,0.18)"
            }}
            onPointerUp={(e) => {
              const el = e.currentTarget
              el.style.transform = ""
              el.style.boxShadow = ""
            }}
            onPointerLeave={(e) => {
              const el = e.currentTarget
              el.style.transform = ""
              el.style.boxShadow = ""
            }}
          >
            {/* The icon rotates a few degrees and cross-fades as the view flips,
                so the control acknowledges the switch without a bounce. */}
            <span
              key={view}
              className="flex items-center justify-center"
              style={{
                animation: "switcher-icon 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
              }}
            >
              {view === "grid" ? (
                <GalleryVerticalEnd className="h-[19px] w-[19px]" strokeWidth={2.2} />
              ) : (
                <LayoutGrid className="h-[19px] w-[19px]" strokeWidth={2.2} />
              )}
            </span>
          </button>
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

      {/* ---- Feed area: 2-col grid, with the category bar as a transform
             overlay (sticky-on-scroll-up) ---- */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* Category pills — hide on scroll-down / reveal on scroll-up via a GPU
            transform only. No max-height/reflow, so it never lags the scroll. */}
        {showCats && (
        <div
          className="absolute inset-x-0 top-0 z-20 bg-white"
          style={{
            transform: pillsHidden ? "translateY(-102%)" : "translateY(0)",
            opacity: pillsHidden ? 0 : 1,
            // Silent while the screens are swapping. Changing view resets this
            // bar to visible, and its half-second slide was then running INSIDE
            // a screen that was itself moving — a second, unrelated animation
            // layered over the first, which is most of what read as the switch
            // glitching twice. It still ends up in the right place; it just
            // gets there without narrating it over the top of the transition.
            transition: transitioning
              ? "none"
              : "transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.34s cubic-bezier(0.16,1,0.3,1)",
            willChange: "transform, opacity",
          }}
        >
          <div className="flex gap-2 overflow-x-auto scrollbar-hide px-4 pt-3 pb-3" style={{ scrollbarWidth: "none" }}>
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
        </div>
        )}

        {/* Pull-to-refresh indicator. It lives HERE — a sibling of the scroller,
            z-10 — and not inside it, because the category bar above is opaque
            white at z-20: anything painted inside the scroller sat behind that
            bar and was simply never seen. From here it starts tucked under the
            bar and slides out beneath it as you pull, exactly like a
            UIRefreshControl emerging from under a nav bar. */}
        <div
          ref={feedSpinnerRef}
          className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
          style={{
            // Position, opacity, scale and spin state are all written straight
            // to this node by useFeedPullRefresh — no React state per frame.
            opacity: 0,
            transform: `translate3d(0, ${catBarH - 40}px, 0) scale(0.55)`, // matches SPIN_LIFT in the hook
          }}
        >
          <IosSpinner size={24} />
        </div>

        <div
          ref={scrollRef}
          className="absolute inset-0 overflow-y-auto scrollbar-hide"
          style={{
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
            // `none`, not `contain`: contain still lets the WebView rubber-band
            // this element, which fought the pull transform and made it judder.
            // We render the overscroll ourselves, so the native one has to go.
            overscrollBehaviorY: "none",
          }}
        >
          <div
            ref={feedContentRef}
            className="relative z-10 min-h-full bg-white"
            style={{
              // translate3d forces a GPU layer so the pull + spring-back run on
              // the compositor (buttery, off the main thread). The hook writes
              // the transform, transition and will-change straight to this node;
              // will-change is toggled per gesture rather than left on, so the
              // long grid isn't stuck holding a big layer while you scroll.
              transform: "translate3d(0, 0, 0)",
            }}
          >
            {/* Spacer that reserves the category-bar overlay's height so the
                grid starts below it (the overlay is absolutely positioned). */}
            <div aria-hidden className="shrink-0" style={{ height: catBarH }} />
            {/* No wrapper key on `tab` → returning to For You does NOT re-fade the
                listings. The For You grid fades only when the CATEGORY changes. */}
            {tab === "following" ? (
              <FollowingTab t={t} reloadSignal={followingReload} />
            ) : tab === "saved" ? (
              <SavedTab t={t} reloadSignal={savedReload} />
            ) : (
              <div key={cat} className="animate-in fade-in-0 duration-300 ease-out">
                {forYouGrid}
              </div>
            )}
          </div>
        </div>

        {/* Subtle auto-hiding scroll indicator (shows on scroll, fades when idle) */}
        <FeedScrollbar containerRef={scrollRef} />
      </div>
      </div>
      )}

      </div>

      <MobileBottomNav active="home" onSearch={focusSearch} />

      {/* Reels puts it at the top (the bottom is the caption and action rail);
          the grid keeps it at the bottom, clear of the search row. */}
      <WishlistToast placement={reelsActive ? "top" : "bottom"} />

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
function FollowingTab({
  t,
  reloadSignal = 0,
}: {
  t: (key: string) => string
  /** Bumped by pull-to-refresh to force a fresh fetch. */
  reloadSignal?: number
}) {
  // The PEOPLE you follow, not their listings — following is about who you're
  // keeping up with, and their items are already in the feed. Cached at module
  // scope for the same reason the Saved tab is: coming back should show the list
  // you already had, not a skeleton.
  const [people, setPeople] = useState<FollowedPerson[] | null>(() => followingCache)

  // Keep our own dot honest while the tab is open.
  usePresenceHeartbeat()

  // Drop the person from the visible list AND the cache. Without the cache write
  // the row came straight back when you left the tab and returned, which read as
  // the unfollow not having saved even though it had.
  const onUnfollow = useCallback((id: string) => {
    setPeople((prev) => {
      const next = (prev || []).filter((p) => p.id !== id)
      followingCache = next
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch("/api/follows/people", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { people: [] }))
      .then((data) => {
        const list = Array.isArray(data?.people) ? data.people : []
        followingCache = list
        if (!cancelled) setPeople(list)
      })
      .catch(() => {
        if (!cancelled) setPeople((prev) => prev ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [reloadSignal])

  if (people === null) {
    return (
      <div className="px-3 py-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex animate-pulse items-center gap-3 py-3.5">
            <div className="h-12 w-12 shrink-0 rounded-full bg-neutral-100" />
            <div className="flex-1">
              <div className="h-3 w-1/3 rounded bg-neutral-100" />
              <div className="mt-2 h-3 w-1/4 rounded bg-neutral-100" />
            </div>
            <div className="h-8 w-20 rounded-full bg-neutral-100" />
          </div>
        ))}
      </div>
    )
  }

  if (people.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="h-7 w-7" />}
        title={t("mfeed.following_empty_title")}
        sub={t("mfeed.following_empty_sub")}
      />
    )
  }

  return <FollowingPeopleList people={people} onUnfollow={onUnfollow} />
}

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
  const savedIds = useWishlistedIds()
  const [snapshot, setSnapshot] = useState<any[] | null>(() => readSavedCache())
  // Bumped when the snapshot is rebuilt via refresh, to stagger the cards in
  // like the For You reload.
  const [revealNonce, setRevealNonce] = useState(0)
  const savedLoadedRef = useRef(false)

  // Cold load ONLY: if we already have a cached snapshot, keep it frozen for this
  // visit — nothing reorders or appears a second after you land. We still refresh
  // the persisted cache in the background so the NEXT time the tab opens it's
  // already current (that's when un-saved items drop / new saves appear).
  useEffect(() => {
    let cancelled = false
    const cold = snapshot === null
    loadSavedItems().then((list) => {
      if (!cancelled && cold) setSnapshot(list)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // When an item is un-saved, prune it from the PERSISTED cache (not the visible
  // snapshot) so the next open is already correct, while the card stays put now.
  // Guarded so an unloaded (empty) store never wipes the cache.
  useEffect(() => {
    if (savedIds.size > 0) savedLoadedRef.current = true
    if (!savedLoadedRef.current || !savedItemsCache) return
    const pruned = savedItemsCache.filter((p) => p?.id && savedIds.has(p.id))
    if (pruned.length !== savedItemsCache.length) persistSavedCache(pruned)
  }, [savedIds])

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
            <div className="aspect-[3/4] w-full rounded-xl bg-neutral-100" />
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
