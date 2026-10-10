"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY NAVIGATOR IN REACT
 * ===========================================================================
 * useCommunityNavigator() is how anything inside a community moves the
 * member: go(place) changes the address with history.pushState and the
 * shell draws the place from data it already holds (the place host,
 * components/community/member/place-host.tsx). Never a server page.
 *
 * WHY pushState IS ENOUGH (Next 16, proved in a browser for round 15,
 * scripts/check-community-shell15.mjs): the app router patches
 * history.pushState and replaceState. A push copies the router's own tree
 * into the new history entry and tells the router the address moved, so
 * usePathname and useSearchParams follow it; Back and Forward then restore
 * that tree with no request. A reload asks the server for the address, and
 * every place's route renders the same place.
 *
 * The tab bar lives outside the community's React tree, so the navigator
 * is also published to a small store (useNavigatorOutsideCommunity), which
 * holds null whenever no community is on screen.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { feedSpaceUrlsActive, FEED_SPACE_PARAM } from "@/lib/community/feed-space-address"
import { placeFromUrl, placeHref, placeKey, type Place } from "./places"

export interface GoOptions {
  /** Replace the history entry instead of adding one (a redirect-like move, never one the member made). */
  replace?: boolean
  /** "top" (the default for a new place) puts the page at its top; "keep" leaves a kept place where it was left. */
  scroll?: "top" | "keep"
}

export interface CommunityNavigator {
  /** The place on screen. */
  place: Place
  /** Move to a place: the address follows with pushState, the shell draws it. Never a server page. */
  go(place: Place, opts?: GoOptions): void
  /** History back when the last step was inside this community, otherwise the feed. */
  back(): void
  /** Read a place's first screen ahead (a pointer resting on its link, a finger landing on it). */
  prefetch(place: Place): void
  /** Read a place again and patch it in where it is (pull to refresh). Left out, the place on screen. */
  refresh(place?: Place): Promise<void>
  /** False for the inert navigator a component gets outside any community. */
  inCommunity: boolean
}

/** What the shell plugs into the provider: the data side (place-cache) and the screen side (place-host). */
export interface NavigatorHooks {
  /** Called synchronously before the place changes, so the screen being left can keep its scroll. */
  beforeGo?: (from: Place, to: Place, opts: GoOptions) => void
  prefetch?: (place: Place) => void
  refresh?: (place: Place) => Promise<void>
}

const NavigatorContext = createContext<CommunityNavigator | null>(null)

const INERT: CommunityNavigator = {
  place: { kind: "feed" },
  go: () => {},
  back: () => {},
  prefetch: () => {},
  refresh: () => Promise.resolve(),
  inCommunity: false,
}

/* ── The store the tab bar reads from outside the community's tree ── */

let published: CommunityNavigator | null = null
const watchers = new Set<() => void>()

function publish(nav: CommunityNavigator | null) {
  if (published === nav) return
  published = nav
  for (const w of Array.from(watchers)) w()
}

function subscribe(fn: () => void) {
  watchers.add(fn)
  return () => {
    watchers.delete(fn)
  }
}

/** The navigator of the community on screen, from anywhere in the app (the tab bar), or null outside a community. */
export function useNavigatorOutsideCommunity(): CommunityNavigator | null {
  const fromTree = useContext(NavigatorContext)
  const fromStore = useSyncExternalStore(
    subscribe,
    () => published,
    () => null,
  )
  return fromTree ?? fromStore
}

/** The navigator of the community this component is in. Outside one it is inert (`inCommunity: false`). */
export function useCommunityNavigator(): CommunityNavigator {
  return useContext(NavigatorContext) ?? INERT
}

/* ── History ── */

/** Marks a history entry this navigator made, with how deep into the visit it is, so back() knows whether Back stays inside. */
const DEPTH_KEY = "__communityDepth"

function entryDepth(): number {
  try {
    const d = (window.history.state as Record<string, unknown> | null)?.[DEPTH_KEY]
    return typeof d === "number" && d > 0 ? d : 0
  } catch {
    return 0
  }
}

/**
 * The address a place is given here. The canonical one (placeHref), except a space on a phone or in the app, which keeps
 * the home address with ?space=<slug> (lib/community/feed-space-address.ts, the other session's "mobile space URLs").
 */
export function addressFor(slug: string, place: Place): string {
  if (place.kind === "space" && feedSpaceUrlsActive()) {
    const q = new URLSearchParams()
    q.set(FEED_SPACE_PARAM, place.slug.toLowerCase())
    return `/community/${slug}?${q}`
  }
  return placeHref(slug, place)
}

/** The page at its top, without a smooth glide (a new place starts at the top, it does not travel there). */
function toTop() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior })
  } catch {
    window.scrollTo(0, 0)
  }
}

/**
 * The provider, mounted once by the community's frame for the whole visit. `initial` is the place the server drew (from the
 * address the request asked for), so the first render on the server and in the browser agree.
 */
export function CommunityNavigatorProvider({ slug, initial, hooks, children }: { slug: string; initial: Place; hooks?: NavigatorHooks; children: React.ReactNode }) {
  const [place, setPlace] = useState<Place>(initial)
  const placeRef = useRef(place)
  placeRef.current = place
  const hooksRef = useRef(hooks)
  hooksRef.current = hooks

  const go = useCallback(
    (to: Place, opts: GoOptions = {}) => {
      if (typeof window === "undefined") return
      const from = placeRef.current
      const href = addressFor(slug, to)
      const here = window.location.pathname + window.location.search
      if (placeKey(from) === placeKey(to)) {
        /* The place already on screen: the address catches up if it differs (All from ?space), a second tap goes to the top. */
        if (href !== here) window.history.replaceState({ ...(window.history.state ?? {}), [DEPTH_KEY]: entryDepth() }, "", href)
        if (opts.scroll !== "keep") window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
      hooksRef.current?.beforeGo?.(from, to, opts)
      placeRef.current = to
      setPlace(to)
      if (href !== here) {
        if (opts.replace) window.history.replaceState({ [DEPTH_KEY]: entryDepth() }, "", href)
        else window.history.pushState({ [DEPTH_KEY]: entryDepth() + 1 }, "", href)
      }
      if (opts.scroll !== "keep") pendingTop.current = true
    },
    [slug],
  )

  /* A new place starts at its top once it is drawn (place-host restores a kept one's own scroll instead, before paint). */
  const pendingTop = useRef(false)
  useEffect(() => {
    if (!pendingTop.current) return
    pendingTop.current = false
    toTop()
  }, [place])

  const back = useCallback(() => {
    if (typeof window === "undefined") return
    if (entryDepth() > 0) window.history.back()
    else go({ kind: "feed" }, { replace: true })
  }, [go])

  const prefetch = useCallback((p: Place) => hooksRef.current?.prefetch?.(p), [])
  const refresh = useCallback((p?: Place) => hooksRef.current?.refresh?.(p ?? placeRef.current) ?? Promise.resolve(), [])

  /*
    THE ADDRESS IS THE TRUTH FOR EVERYTHING ELSE: Back and Forward (popstate), and a move Next made itself (a link this
    shell did not catch, a redirect). An address that is not a place (a post opened over the feed) leaves the place as it is.
  */
  const pathname = usePathname()
  const search = useSearchParams()
  const searchString = search?.toString() ?? ""
  useEffect(() => {
    const read = () => {
      const now = placeFromUrl(window.location.pathname, window.location.search)
      if (!now || placeKey(now) === placeKey(placeRef.current)) return
      hooksRef.current?.beforeGo?.(placeRef.current, now, { scroll: "keep" })
      placeRef.current = now
      setPlace(now)
    }
    read()
    window.addEventListener("popstate", read)
    return () => window.removeEventListener("popstate", read)
  }, [pathname, searchString])

  const value = useMemo<CommunityNavigator>(() => ({ place, go, back, prefetch, refresh, inCommunity: true }), [place, go, back, prefetch, refresh])
  useEffect(() => {
    publish(value)
  }, [value])
  useEffect(() => () => publish(null), [])

  return <NavigatorContext.Provider value={value}>{children}</NavigatorContext.Provider>
}
