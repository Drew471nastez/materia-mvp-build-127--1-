"use client"

/**
 * ===========================================================================
 *  THE PLACE HOST: THE MIDDLE OF THE COMMUNITY, DRAWN FROM DATA (round 15)
 * ===========================================================================
 * The community's layout owns the screen; a place's route page only seeds it.
 * Moving between places (lib/communities/client/navigator.ts go) changes the
 * address with history.pushState, which Next follows without asking the
 * server for anything, and this host draws the place from data already in
 * hand (lib/communities/client/place-cache.ts).
 *
 * TWO KINDS OF SCREEN, ONE MIDDLE COLUMN.
 *   THE ROUTED SLOT holds whatever the router drew for the address it last
 *   loaded (`children`): a place's PlaceSeed, or a page that is not a place
 *   (a post opened by its link). It sits at one fixed spot in the tree, so
 *   the router changing it never moves anything else. Which place it holds
 *   is read from its DOM (data-place-seed), because Back can restore an
 *   older router tree than the address says (proved in a browser for this
 *   round: after a Link, Back to a pushed address restores the tree that
 *   entry held).
 *   KEPT SCREENS are the places the member moved to, drawn here from data.
 *   Each sits under React's <Activity>: hidden ones stay mounted, so going
 *   back to one restores its state and its decoded pictures with no render
 *   and no network. The four most recent are kept (KEEP_ALIVE); the rest are
 *   let go (the routed page does not count: it is the router's and is
 *   never let go). A place's scroll is kept with it and put back before
 *   paint.
 *
 * NEVER A BLANK FRAME. A place in hand is shown on the frame of the tap. One
 * that is not keeps the place being left on screen (its tab is already
 * marked) until its data comes; only past WAIT_SCREEN_MS does the place's
 * own waiting screen (title and the app's spinner) take the middle, inside
 * the frame. A read that fails is tried once more, then says so with a
 * retry; nothing reloads the page.
 *
 * ARRIVING. A place the member moved to rises 6px and fades in from 35%
 * over 180ms (opacity and translate, on the compositor; from 35% so its
 * first frame is never an empty middle); Back and Forward put the place
 * back as it was, with no motion. None for reduced motion.
 *
 * READ AHEAD. Once the first screen has painted and the phone is idle, every
 * place's first screen (and its code) is read, two at a time, never on
 * Save-Data or 2G. A finger landing on a place's link reads that one at once.
 */
import * as ReactRuntime from "react"
import { Component, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { addressFor, useCommunityNavigator, type GoOptions } from "@/lib/communities/client/navigator-context"
import { atPlaceFor, isPostAddress, placeFromUrl, placeKey, screenKey, type Place } from "@/lib/communities/client/places"
import type { PlaceData } from "@/lib/communities/client/place-data"
import type { PlaceData as HeldData } from "@/lib/communities/client/place-cache"
import { keepAlive, loadPlaceData, placeMissing, placeStale, readPlace, readPlacesAhead, seedPlace, subscribePlaces, WAIT_SCREEN_MS } from "@/lib/communities/client/place-cache"
import { feedSpaceUrlsActive } from "@/lib/community/feed-space-address"
import { dispatchPullRefresh } from "@/components/ui/pull-to-refresh"
import { COMMUNITY_FEED_REFRESH_SCOPE, COMMUNITY_LEADERBOARD_REFRESH_SCOPE, COMMUNITY_MEMBERS_REFRESH_SCOPE } from "@/lib/communities/refresh-scope"
import { preloadPlaceView, preloadPlaceViews, PlaceView, PlaceWaiting } from "./place-views"
import { BTN_SECONDARY } from "./ui"
import { PostOpener } from "./post-opener"
import type { ViewerView } from "@/lib/communities/types"
import { hardNavigationAllowed, loadingFailure } from "@/lib/communities/client/resume"

/*
  React 19.2's <Activity> (react 19.2.0 is installed). This repo's @types/react is 19.0.0, which does not know it yet, so it
  is typed here: "hidden" keeps the tree and its DOM mounted (display: none), unmounts its effects, and draws its updates at
  the lowest priority; "visible" puts it back as it was.
*/
const Activity = (ReactRuntime as unknown as { Activity: React.ComponentType<{ mode: "visible" | "hidden"; children: React.ReactNode }> }).Activity

/** The arrival: a few px up and in, on the compositor. */
export const ARRIVE_MS = 180
const ARRIVE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"

/* ── The seed a place's route page renders ── */

/**
 * What a place's server page renders, and all it renders: its place and the data the one loader read
 * (lib/communities/server/places.ts). The data goes into the browser's place cache, so leaving and coming back never asks
 * again; the place is drawn here, inside the routed slot, the same way the host draws it.
 */
export function PlaceSeed({ communityId, slug, place, data, at }: { communityId: string; slug: string; place: Place; data: PlaceData; at?: number }) {
  const facts = useContext(HostFacts)
  const chat = facts?.chatSpaces ?? null
  /* Into the cache before anything reads it (the browser only: the server's module is shared by every request). */
  useState(() => {
    if (typeof window !== "undefined") seedPlace(communityId, place, data, at)
    return 0
  })
  useEffect(() => {
    seedPlace(communityId, place, data, at)
  }, [communityId, place, data, at])
  /*
    A SPACE OPENED BY ITS /space/<x> LINK ON A PHONE takes the phone's own address (?space=<x>) in place, with replaceState.
    It used to be window.location.replace: a whole page load, a white screen, for every space link opened on a phone.
  */
  useEffect(() => {
    if (place.kind !== "space" || !feedSpaceUrlsActive()) return
    const href = addressFor(slug, place)
    if (window.location.pathname + window.location.search !== href && placeKey(placeFromUrl(window.location.pathname, window.location.search) ?? { kind: "feed" }) === placeKey(place)) {
      window.history.replaceState(window.history.state, "", href)
    }
  }, [slug, place])
  return (
    <div data-place-seed={screenKey(place, chat)} data-place-key={placeKey(place)} style={{ display: "contents" }}>
      <PlaceView data={data} place={place} slug={slug} communityId={communityId} renderProfile={facts?.renderProfile} />
    </div>
  )
}

/* ── The host ── */

interface HostFactsValue {
  communityId: string
  slug: string
  chatSpaces: ReadonlySet<string>
  renderProfile?: (ref: string, data: unknown) => React.ReactNode
}
const HostFacts = createContext<HostFactsValue | null>(null)

interface Kept {
  place: Place
  data: PlaceData | null
  /** Bumped by a pull to refresh of a screen that holds its first data in state, so it is drawn again from the new data. */
  version: number
  failed: boolean
}

/** What the frame needs from the host: the place in the middle now (the columns follow it), and the middle itself. */
export interface PlaceScreens {
  shown: Place
  middle: React.ReactNode
}

/** The cache holds a place's data as it arrived; it is what the place's loader returned (lib/communities/server/places.ts). */
const asPlace = (d: HeldData | null | undefined): PlaceData | null => (d ?? null) as PlaceData | null

function readNow(communityId: string, place: Place, chat: ReadonlySet<string>): PlaceData | null {
  const own = asPlace(readPlace(communityId, place)?.data)
  if (own) return own
  /* The feed's lists are one screen: any of them draws it, and the feed switches to the list the address says. */
  if (screenKey(place, chat) === "feed") return asPlace(readPlace(communityId, { kind: "feed" })?.data ?? readPlace(communityId, { kind: "saved" })?.data)
  return null
}

/**
 * The places read ahead once the community is on screen: every place in the row, and Membership. Not the member's own
 * profile (round 16): ?profile=me is the account page again (/account, outside the community), so reading it here was one
 * wasted read per visit.
 */
export function aheadPlaces(entries: { key: string }[]): Place[] {
  const out: Place[] = []
  /* The places a member opens most come first (round 24): the Leaderboard, then Members, then the row in its order. */
  const rank = (k: string) => (k === "leaderboard" ? 0 : k === "members" ? 1 : 2)
  for (const e of [...entries].sort((a, b) => rank(a.key) - rank(b.key))) {
    if (e.key === "home") out.push({ kind: "feed" })
    else if (e.key === "classroom") out.push({ kind: "learn" })
    else if (e.key === "events") out.push({ kind: "calendar" })
    else if (e.key === "members") out.push({ kind: "members" })
    else if (e.key === "leaderboard") out.push({ kind: "leaderboard" })
    else if (e.key === "about") out.push({ kind: "about" })
  }
  /* The member's own Membership page, from the "..." menu, is read ahead with the places (round 13). */
  out.push({ kind: "membership" })
  return out
}

/**
 * The host as a hook, so the frame around it can lay its columns out for the place actually in the middle (About and a
 * lesson are wider) on the same frame the middle changes.
 */
export function usePlaceScreens({ communityId, slug, chatSpaces, entries, renderProfile, viewer = null, readOnly = false, children }: { communityId: string; slug: string; chatSpaces: readonly string[]; entries: { key: string }[]; renderProfile?: (ref: string, data: unknown) => React.ReactNode; /** Who is looking: with it, a post no card on screen holds opens over the place (post-opener.tsx). */ viewer?: ViewerView | null; readOnly?: boolean; children: React.ReactNode }): PlaceScreens & { hooks: { beforeGo: (from: Place, to: Place, opts: GoOptions & { history?: boolean }) => void; prefetch: (p: Place) => void; refresh: (p: Place) => Promise<void> } } {
  const nav = useCommunityNavigator()
  const chat = useMemo(() => new Set(chatSpaces.map((s) => s.toLowerCase())), [chatSpaces])
  const active = nav.place
  const activeKey = screenKey(active, chat)
  const pathname = usePathname()
  const search = useSearchParams()
  /*
    A POST OPEN OVER A PLACE KEEPS THE PLACE (round 16, ARCH16 finding B). The opened post's address is not a place, and
    everything below (which slot is visible, whether a kept screen shows) was decided from whether the address is one: open
    a post and the place under it could be hidden, or swapped for the routed slot, until it closed. Whatever the host was at
    when the post's address came, it stays at, on the open, while it is open and on every kind of close.
  */
  const heldAtPlace = useRef<boolean | null>(null)
  const atPlace = atPlaceFor(pathname || "", search?.toString() ?? "", heldAtPlace.current ?? false)
  if (!isPostAddress(pathname)) heldAtPlace.current = atPlace

  /* Re-drawn when a place arrives in the cache. */
  const [, arrived] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribePlaces(arrived), [])

  /* The routed slot's place, read from its DOM after every commit (THE ROUTED SLOT). Before the first commit: the address's. */
  const [routedKey, setRoutedKey] = useState<string | null>(() => (atPlace ? activeKey : null))
  const routedRef = useRef<HTMLDivElement>(null)
  /* A routed place drawn again by a pull to refresh is taken over by a kept screen with the fresh data. */
  const [detached, setDetached] = useState<string | null>(null)
  useLayoutEffect(() => {
    const slot = routedRef.current
    if (!slot) return
    const seed = slot.querySelector<HTMLElement>("[data-place-seed]")
    /*
      NOT YET IS NOT "NOT A PLACE". While the router's page is still streaming (its Suspense not resolved, the server's
      HTML still a template) the slot holds nothing of its own; reading that as a page that is not a place made the host
      draw a second feed beside the one on its way (caught in a real Next build, round 15). Only a slot that holds
      something, and no seed, is a page that is not a place.
    */
    if (!seed && !Array.from(slot.querySelectorAll("*")).some((el) => !/^(TEMPLATE|SCRIPT|STYLE|LINK|META|NOSCRIPT)$/.test(el.tagName))) return
    const k = seed?.dataset.placeSeed ?? null
    if (k !== routedKey) setRoutedKey(k)
  })
  const routedOwns = (key: string) => key === routedKey && detached !== key

  /* The kept screens, most recent last, and what each holds. */
  const kept = useRef(new Map<string, Kept>())
  const [shown, setShown] = useState<{ key: string; place: Place }>({ key: activeKey, place: active })
  const [order, setOrder] = useState<string[]>(() => (atPlace ? [] : [activeKey]))
  const [waitedFor, setWaitedFor] = useState<string | null>(null)
  /* Places whose last read failed twice (no connection): their screen says so, with a retry. */
  const failedKeys = useRef(new Set<string>())

  const inHand = (key: string, place: Place) => routedOwns(key) || (kept.current.get(key)?.data ?? null) !== null || readNow(communityId, place, chat) !== null
  const failedNow = activeKey !== shown.key && placeMissing(communityId, active)
  const ready = inHand(activeKey, active) || waitedFor === activeKey || failedNow
  if (activeKey !== shown.key && ready) {
    setShown({ key: activeKey, place: active })
    /* The routed page is never let go (it is the router's), so it does not take one of the kept slots. */
    if (!routedOwns(activeKey)) setOrder((o) => keepAlive(o.filter((k) => !routedOwns(k)), activeKey))
  } else if (activeKey === shown.key && placeKey(active) !== placeKey(shown.place)) {
    setShown({ key: activeKey, place: active })
  }

  /* The place in the middle always has a slot: one the router held until now (it moved on, or a pull detached it) takes one here. */
  if (!routedOwns(shown.key) && !order.includes(shown.key)) setOrder((o) => keepAlive(o, shown.key))

  /* A place not in hand: read it, and give it the middle (its waiting screen) only once WAIT_SCREEN_MS have passed. */
  const lesson = search?.get("lesson") ?? null
  useEffect(() => {
    if (activeKey === shown.key || inHand(activeKey, active)) return
    const key = activeKey
    failedKeys.current.delete(key)
    void loadPlaceData(communityId, active, { lesson: active.kind === "program" ? lesson : null }).then((got) => {
      if (got) return
      failedKeys.current.add(key)
      arrived()
    })
    const t = window.setTimeout(() => setWaitedFor(activeKey), WAIT_SCREEN_MS)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, shown.key, communityId])

  /* Every kept key has an entry; data fills in as it arrives; the ones let go are forgotten. */
  for (const key of order) {
    if (routedOwns(key)) continue
    const place = key === shown.key ? shown.place : (kept.current.get(key)?.place ?? shown.place)
    let k = kept.current.get(key)
    if (!k) {
      k = { place, data: null, version: 0, failed: false }
      kept.current.set(key, k)
    }
    if (!k.data) k.data = readNow(communityId, k.place, chat)
    k.failed = !k.data && failedKeys.current.has(key)
  }
  for (const key of Array.from(kept.current.keys())) if (!order.includes(key) || routedOwns(key)) kept.current.delete(key)

  /* A screen shown with data read over a minute ago is read again quietly; its new data is handed to it in place. */
  useEffect(() => {
    if (routedOwns(shown.key)) return
    const held = readPlace(communityId, shown.place)
    if (!held || !placeStale(held.at, Date.now())) return
    void loadPlaceData(communityId, shown.place).then((got) => {
      const k = kept.current.get(shown.key)
      if (got && k) {
        k.data = asPlace(got.data)
        arrived()
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.key, communityId])

  /* ── Scroll and the arrival ── */
  const scrolls = useRef(new Map<string, number>())
  const shownRef = useRef(shown.key)
  const intent = useRef<{ scroll: "top" | "keep" | "auto"; history: boolean } | null>(null)
  const painted = useRef(false)
  const screenEls = useRef(new Map<string, HTMLElement>())
  /*
    THE SHELL PUTS SCROLL BACK, NOT THE BROWSER. With the browser's own restoration on, Back and Forward moved the window to
    the entry's old place before the host had noted where the place being left was, so that place came back at the other's
    scroll (caught in a real Next build: the feed returned 900px down, where Members had been). Manual while the community
    is on screen, the browser's own again when it goes.
  */
  useEffect(() => {
    const h = window.history
    const was = h.scrollRestoration
    h.scrollRestoration = "manual"
    return () => {
      h.scrollRestoration = was
    }
  }, [])
  useEffect(() => {
    const onScroll = () => scrolls.current.set(shownRef.current, window.scrollY)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  useLayoutEffect(() => {
    if (!painted.current) {
      painted.current = true
      shownRef.current = shown.key
      return
    }
    if (shownRef.current === shown.key) return
    const wasKept = scrolls.current.has(shown.key)
    shownRef.current = shown.key
    const how = intent.current ?? { scroll: "auto", history: false }
    intent.current = null
    const y = how.scroll === "top" ? 0 : wasKept ? (scrolls.current.get(shown.key) ?? 0) : 0
    window.scrollTo(0, y)
    scrolls.current.set(shown.key, y)
    if (how.history) return
    const el = routedOwns(shown.key) ? routedRef.current : screenEls.current.get(shown.key)
    if (!el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    /* From 35%, not from nothing: the first frame after the tap already shows the place (a fade from 0 is a blank frame). */
    el.animate([{ opacity: 0.35, translate: "0 6px" }, { opacity: 1, translate: "0 0" }], { duration: ARRIVE_MS, easing: ARRIVE_EASE })
  }, [shown.key])

  /*
    FROM ITS WAITING SCREEN TO THE PLACE (round 24's rule, kept): the title the waiting screen already drew stays put, and only
    what is under it fades in, so nothing jumps and nothing fades twice.
  */
  const hadData = useRef(new Map<string, boolean>())
  useLayoutEffect(() => {
    for (const [key, k] of kept.current) {
      const before = hadData.current.get(key)
      hadData.current.set(key, !!k.data)
      if (before !== false || !k.data || key !== shown.key) continue
      const el = screenEls.current.get(key)
      const page = el?.querySelector<HTMLElement>(":scope > *")
      if (!page || typeof page.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) continue
      for (const child of Array.from(page.children)) {
        if (child.matches("[data-page-title]")) continue
        ;(child as HTMLElement).animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: ARRIVE_EASE })
      }
    }
  })

  /* ── What the navigator plugs in ── */
  const beforeGo = useCallback(
    (_from: Place, to: Place, opts: GoOptions & { history?: boolean }) => {
      scrolls.current.set(shownRef.current, window.scrollY)
      intent.current = { scroll: opts.scroll ?? "auto", history: !!opts.history }
      setWaitedFor(null)
      /* On the tap itself, before React draws anything: the place's code and, when it is not in hand, its data. */
      preloadPlaceView(to)
      if (!readNow(communityId, to, chat)) void loadPlaceData(communityId, to, { lesson: to.kind === "program" ? new URLSearchParams(window.location.search).get("lesson") : null })
    },
    [communityId, chat],
  )
  const prefetch = useCallback(
    (p: Place) => {
      preloadPlaceView(p)
      const held = readPlace(communityId, p)
      if (held && !placeStale(held.at, Date.now())) return
      void loadPlaceData(communityId, p)
    },
    [communityId],
  )
  const refresh = useCallback(
    async (p: Place) => {
      const key = screenKey(p, chat)
      if (key === "feed") return void (await dispatchPullRefresh(COMMUNITY_FEED_REFRESH_SCOPE))
      if (p.kind === "members") return void (await dispatchPullRefresh(COMMUNITY_MEMBERS_REFRESH_SCOPE))
      if (p.kind === "leaderboard") return void (await dispatchPullRefresh(COMMUNITY_LEADERBOARD_REFRESH_SCOPE))
      const got = await loadPlaceData(communityId, p, { lesson: p.kind === "program" ? lesson : null })
      if (!got) return
      /* Learn and About draw straight from their props; the rest hold their first data in state and are drawn again. */
      const inPlace = p.kind === "learn" || p.kind === "about"
      if (routedOwns(key)) {
        kept.current.set(key, { place: p, data: asPlace(got.data), version: 1, failed: false })
        setDetached(key)
        return
      }
      const k = kept.current.get(key)
      if (k) {
        k.data = asPlace(got.data)
        if (!inPlace) k.version++
      }
      arrived()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [communityId, chat, lesson, routedKey, detached],
  )

  /* ── Reading ahead, once the first screen has painted and the phone is idle ── */
  const aheadList = useMemo(() => aheadPlaces(entries), [entries])
  useEffect(() => {
    let stopped = false
    const idle = (run: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
      if (w.requestIdleCallback) {
        const id = w.requestIdleCallback(run, { timeout: 4000 })
        return () => w.cancelIdleCallback?.(id)
      }
      const t = window.setTimeout(run, 1200)
      return () => window.clearTimeout(t)
    }
    /* Two frames: the first screen is painted before anything else is asked for. */
    let cancel = () => {}
    const raf = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        cancel = idle(() => {
          if (stopped) return
          preloadPlaceViews()
          void readPlacesAhead(communityId, aheadList, () => stopped)
        })
      })
      cancel = () => cancelAnimationFrame(raf2)
    })
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      cancel()
    }
    /* AND AGAIN ON EVERY MOVE (round 24): a place read over four minutes ago is read again, so none goes stale behind the member. */
  }, [communityId, aheadList, shown.key])

  /* ── The middle ── */
  const routedVisible = routedKey === null ? !atPlace : routedOwns(shown.key)
  const facts = useMemo<HostFactsValue>(() => ({ communityId, slug, chatSpaces: chat, renderProfile }), [communityId, slug, chat, renderProfile])
  const retry = useCallback(() => {
    const key = shown.key
    failedKeys.current.delete(key)
    void loadPlaceData(communityId, shown.place).then((got) => {
      if (!got) failedKeys.current.add(key)
      arrived()
    })
    arrived()
  }, [communityId, shown.key, shown.place])
  const middle = (
    <HostFacts.Provider value={facts}>
      <div data-place-host="">
        <Activity mode={routedVisible ? "visible" : "hidden"}>
          <div ref={routedRef} data-place-routed="">
            {children}
          </div>
        </Activity>
        {order
          .filter((key) => !routedOwns(key))
          .map((key) => {
            const k = kept.current.get(key)
            if (!k) return null
            const visible = key === shown.key && (routedKey !== null || atPlace)
            const missing = !k.data && placeMissing(communityId, k.place)
            return (
              <Activity key={key} mode={visible ? "visible" : "hidden"}>
                <div
                  data-place-screen={key}
                  ref={(el) => {
                    if (el) screenEls.current.set(key, el)
                    else screenEls.current.delete(key)
                  }}
                >
                  <PlaceBoundary>{k.data ? <PlaceView key={k.version} data={k.data} place={k.place} slug={slug} communityId={communityId} renderProfile={renderProfile} /> : missing ? <PlaceGone /> : k.failed ? <PlaceFailed onRetry={retry} /> : <PlaceWaiting place={k.place} />}</PlaceBoundary>
                </div>
              </Activity>
            )
          })}
        {/* A post that no card on screen holds (a profile's row, a notification) opens over the place, which stays (round 16). */}
        {viewer ? <PostOpener communityId={communityId} slug={slug} viewer={viewer} readOnly={readOnly} /> : null}
      </div>
    </HostFacts.Provider>
  )
  const hooks = useMemo(() => ({ beforeGo, prefetch, refresh }), [beforeGo, prefetch, refresh])
  return { shown: shown.place, middle, hooks }
}

/**
 * A SCREEN THAT THROWS STAYS IN ITS PLACE. The host's screens are part of the community's layout, so without this a throw in
 * one went up to the app's root boundary, which takes the whole page (the bar, the columns, the tab bar) and, for code
 * that failed to load, shows an empty page while it decides to reload. Here the frame stays and only the middle says so,
 * with Try again; code that failed to load (a deploy in between) is fetched again by loading this address once in full.
 */
class PlaceBoundary extends Component<{ children: React.ReactNode }, { error: unknown }> {
  state = { error: null as unknown }
  static getDerivedStateFromError(error: unknown) {
    return { error }
  }
  componentDidCatch(error: unknown) {
    if (!loadingFailure(error) || typeof window === "undefined") return
    let store: Storage | null = null
    try {
      store = window.sessionStorage
    } catch {
      store = null
    }
    if (hardNavigationAllowed(store)) window.location.assign(window.location.href)
  }
  render() {
    if (this.state.error === null) return this.props.children
    return <PlaceFailed onRetry={() => this.setState({ error: null })} />
  }
}

/** A place the server says is not there (a program removed, Learn switched off): said plainly, in the frame. */
function PlaceGone() {
  return (
    <div className="py-16 text-center" data-place-gone="">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">This is not here any more</p>
      <p className="mt-1 text-[14px] text-[#6b7280]">It may have been moved or switched off.</p>
    </div>
  )
}

/** A place that could not be read twice (no connection): what is wrong, and the one thing to do. */
function PlaceFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-16 text-center" data-place-failed="">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">Could not load this</p>
      <p className="mt-1 text-[14px] text-[#6b7280]">Check your connection and try again.</p>
      <button type="button" onClick={onRetry} className={`${BTN_SECONDARY} mt-4`}>
        Try again
      </button>
    </div>
  )
}
