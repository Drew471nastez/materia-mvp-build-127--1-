"use client"

/**
 * ===========================================================================
 *  THE FEED
 * ===========================================================================
 * The spaces as chips (with the sort button at the end of the row; Saved
 * posts is a row in its menu since round 9), the welcome (once), the
 * composer, then the posts a page at a time.
 * The next page is asked for as the end of the list comes near (an
 * IntersectionObserver 600px ahead), and a "Show more" button stays
 * underneath for whatever the observer misses: a browser without it, a
 * keyboard, a slow connection. Pages follow the server's keyset cursor, so a
 * post written while reading never shifts one into the next page twice.
 *
 * ONE FEED, MANY LISTS, SWITCHED IN PLACE (round 7). All, each feed space and
 * Saved, in each of the four sorts (Default, New, Top, Unread: sort-menu.tsx),
 * are lists of the same feed. Choosing one does not load a page: the list is
 * taken from the client cache when it is there (feed-cache.ts: on the next
 * frame, no skeleton). One that is not cached yet keeps the posts already
 * on screen until its own list arrives, then swaps. The iOS spinner is only
 * when the feed has nothing to show. A read that fails is asked once more,
 * then a retry is offered.
 * The address moves with it (history.pushState), so Back, a reload and a
 * shared link all land on the same list: /community/<slug>/space/<space>.
 * That push does not load the space's page. The list swaps here. A list
 * already read is the one on screen with the chip. One that is not read yet
 * keeps the posts already showing until its own arrive. The iOS spinner is
 * only for a feed that has nothing to show. A list is asked for ahead when
 * a pointer rests on its chip or a finger lands on it, and once the feed is
 * on screen the first page of every space is read ahead, a few at a time
 * (feed-cache.ts prefetchViews). A list read over a minute ago is shown at
 * once and read again quietly.
 *
 * A like, a save, an edit or a delete in one list is carried into every
 * other cached list holding that post; a new post goes to the top of the
 * lists it belongs in. Pinned posts lead only in Default.
 *
 * FeedView is the same list with no chips, for a caller that draws its own.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { Composer, type ComposerProps } from "./composer"
import { FeedLive, FRESH_POSTS_EVENT } from "./feed-live"
import {
  FRESH_MS,
  addPost,
  dropSaved,
  firstPage,
  loadView,
  mergeQuiet,
  patchPost,
  prefetchView,
  prefetchViews,
  readView,
  subscribeViews,
  viewKey,
  viewUrl,
  writeView,
  type CachedView,
  type FeedPageData,
  type FeedSortValue,
  type FeedTarget,
} from "./feed-cache"
import { feedListHref } from "@/lib/community/feed-space-address"
import { useCommunityNavigator, useRegisterPlaceRefresh, type Place } from "@/lib/communities/client/navigator"
import { PULL_REFRESH_EVENT, type PullRefreshDetail } from "@/components/ui/pull-to-refresh"
import { COMMUNITY_FEED_REFRESH_SCOPE } from "@/lib/communities/refresh-scope"
import { sectionFromPath } from "./nav"
import { PlaceSpinner, WAIT_MS } from "./place-spinner"
import { warmPostFaces } from "./member-avatar"
import { EditSpacesContext, FIRST_CARDS, PostCard, PostCardPlaceholder, type PostUpdate } from "./post-card"
import { SortMenu } from "./sort-menu"
import { followChosenChip, SpaceChips, type ChipPick } from "./space-chips"
import { revealMore } from "./reveal-more"
import { LIST_AFTER_MS } from "./chip-hit"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, CARD } from "./ui"
import type { SpaceView } from "./view-types"

export type { FeedPageData, FeedSortValue, FeedTarget } from "./feed-cache"

export interface OnboardingView {
  name: string
  welcome: string | null
  rules: { title: string; body: string }[]
  introHref: string | null
}

/** What the composer needs besides the spaces, which follow the list on screen. */
export interface ComposeBase {
  userId: string
  me: { name: string; avatarUrl: string | null }
  fileProductId?: string | null
  eventHref?: string | null
}

/** The spaces a post may go to from the composer (data.ts composerSpaces, browser side). */
function composerSpacesOf(spaces: SpaceView[]) {
  return spaces.filter((s) => s.canPost && s.kind !== "chat").map((s) => ({ id: s.id, name: s.name, slug: s.slug, kind: s.kind, icon: s.icon }))
}

/** No posts, for a list that is not here yet. Not the previous space's posts. */
const EMPTY_LIST: CachedView = { posts: [], cursor: null, at: 0, pages: 0 }
/** Cards drawn on the frame a switched list comes in (the rest stand in at their height and follow in a transition): a phone's screenful and a little more. */
const SWAP_CARDS = 4
/**
 * THE NEXT PAGE COMES BY ITSELF ONLY SO FAR (round 13). Past this many posts
 * the end of the list no longer asks for more as it comes near: "Load more
 * posts" stays under the list for whoever wants them, so a long session
 * never grows a page without end (and the footer can be reached).
 */
export const AUTO_POSTS = 60

export interface CommunityFeedProps {
  communityId: string
  slug: string
  viewer: ViewerView
  /** The spaces the member may see, for the chips; without them no chips are drawn and the list never switches. */
  spaces?: SpaceView[]
  /** The list the server drew, and its first page. */
  start: FeedTarget
  initial: FeedPageData
  /** When the server read `initial` (ms), so a newer cached copy (with the member's own likes since) wins. */
  servedAt?: number
  readOnly?: boolean
  /** The welcome, shown on All only. */
  onboarding?: OnboardingView | null
  /** The composer's member; null for nobody who may post. */
  compose?: ComposeBase | null
  /** A caller that draws its own composer props (FeedView). */
  composer?: Omit<ComposerProps, "onPosted"> | null
  emptyText?: string
}

/** The list an address shows: /community/<slug> All, /space/<feed space> that space, /saved Saved; anything else keeps `fallback`. */
export function targetFromPath(
  pathname: string | null | undefined,
  slug: string,
  spaces: SpaceView[] | undefined,
  fallback: FeedTarget,
  search?: string | null,
): FeedTarget {
  if (!spaces) return fallback
  const section = sectionFromPath(pathname, slug, search)
  if (section === "home") return { kind: "all" }
  if (section === "saved") return { kind: "saved" }
  if (section.startsWith("space:")) {
    const want = section.slice(6).toLowerCase()
    const space = spaces.find((s) => s.slug.toLowerCase() === want)
    if (space && space.kind !== "chat") return { kind: "space", id: space.id }
  }
  return fallback
}

/** The list a navigator place shows, or null for a place that is not one of the feed's (the feed is kept hidden meanwhile). */
export function targetFromPlace(place: Place, spaces: SpaceView[] | undefined): FeedTarget | null {
  if (place.kind === "feed") return { kind: "all" }
  if (place.kind === "saved") return { kind: "saved" }
  if (place.kind !== "space" || !spaces) return null
  const want = place.slug.toLowerCase()
  const space = spaces.find((s) => s.slug.toLowerCase() === want)
  return space && space.kind !== "chat" ? { kind: "space", id: space.id } : null
}

/** The navigator place for a chip. */
export function placeOfPick(pick: ChipPick): Place {
  return pick.kind === "all" ? { kind: "feed" } : pick.kind === "saved" ? { kind: "saved" } : { kind: "space", slug: pick.slug }
}

function sameTarget(a: FeedTarget, b: FeedTarget): boolean {
  return a.kind === b.kind && (a.kind !== "space" || a.id === (b as { id: string }).id)
}

/** A list as a string, so the chips and the list can each hold one without a new object every render: "all", "saved" or "space:<id>". */
function targetIdOf(t: FeedTarget): string {
  return t.kind === "space" ? `space:${t.id}` : t.kind
}
function targetFromId(id: string): FeedTarget {
  return id.startsWith("space:") ? { kind: "space", id: id.slice(6) } : id === "saved" ? { kind: "saved" } : { kind: "all" }
}

/**
 * The row of pills where the member can see it: left alone when it is on screen (where the finger just was), brought back to
 * just under the community's bar when it is hidden under it. Never a jump to the page's top.
 */
export function keepPillsInView(root: HTMLElement | null) {
  const row = root?.querySelector<HTMLElement>("[data-space-chips]")
  if (!row || typeof window === "undefined") return
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--community-top")) || 0
  const top = row.getBoundingClientRect().top
  if (top >= bar - 1) return
  window.scrollTo({ top: Math.max(0, window.scrollY + top - bar - 8), behavior: "instant" as ScrollBehavior })
}

/*
  THE SAME FACTS, THE SAME OBJECT (round 16). A refresh of the page (the community read again after a while away, a cover saved
  in another tab) hands the feed new arrays and objects that say exactly what the old ones said, and each new one redrew every
  post on screen (the spaces feed the post cards' context, the welcome is compared by its object): the feed looked as if it
  reloaded. A value equal to the last one keeps the last one.
*/
function useSameFacts<T>(value: T): T {
  const kept = useRef<{ key: string; value: T } | null>(null)
  const key = JSON.stringify(value ?? null)
  if (!kept.current || kept.current.key !== key) kept.current = { key, value }
  return kept.current.value
}

export function CommunityFeed({ communityId, slug, viewer: givenViewer, spaces: givenSpaces, start, initial, servedAt, readOnly = false, onboarding: givenOnboarding = null, compose: givenCompose = null, composer = null, emptyText }: CommunityFeedProps) {
  const spaces = useSameFacts(givenSpaces)
  const viewer = useSameFacts(givenViewer)
  const onboarding = useSameFacts(givenOnboarding)
  const compose = useSameFacts(givenCompose)
  const base = `/community/${slug}`
  const pathname = usePathname()
  /*
    Back and Forward between lists switched in place: the address is the truth, so read it again when it moves. In a
    transition (round 21): a Back that closes an opened post drew the whole feed again inside the popstate, before the post's
    close could be painted; the close now starts first and the feed follows in slices that leave room for its frames.
  */
  const [, setTick] = useState(0)
  useEffect(() => {
    const on = () => startTransition(() => setTick((t) => t + 1))
    window.addEventListener("popstate", on)
    return () => window.removeEventListener("popstate", on)
  }, [])
  const livePath = typeof window === "undefined" ? pathname : window.location.pathname
  const liveSearch = typeof window === "undefined" ? "" : window.location.search
  /*
    A POST OPENED OVER THE FEED IS NOT ANOTHER LIST (round 15). Its address (/community/<slug>/post/<id>) read as the community's
    home, so opening a post from a space switched the list under the sheet to All, and closing it switched it back: the post
    "glitched again on the feed and flashed". While a post's address is up, the list is the one it was opened from.
  */
  const onPost = /\/post\//.test(livePath || pathname || "")
  const lastList = useRef<FeedTarget>(start)
  /*
    IN THE COMMUNITY'S SHELL (round 15) the list is the navigator's place: All, a feed space and Saved are one slot with this one
    feed in it (lib/communities/client/places.ts slotKeyOf), so a pill is navigator.go and the list follows the place. While
    another place is on screen this feed is kept hidden and keeps the list it had. Outside a shell (a caller drawing FeedView,
    a probe) the address is read as before.
  */
  const nav = useCommunityNavigator()
  const fromNav = nav.inCommunity ? targetFromPlace(nav.place, spaces) : null
  const fromPath = fromNav ?? (onPost || nav.inCommunity ? lastList.current : targetFromPath(livePath || pathname, slug, spaces, start, liveSearch))
  if (fromNav || !onPost) lastList.current = fromPath
  /* A click marks its list at once; the address catching up clears the mark (never a post opened over it). */
  const [picked, setPicked] = useState<{ target: FeedTarget; from: string } | null>(null)
  if (picked && !onPost && picked.from !== (livePath || pathname) + (liveSearch || "")) setPicked(null)
  const [sort, setSort] = useState<FeedSortValue>("default")

  /*
    THE CHIP ON THE NEXT FRAME, THE LIST ON THE ONE AFTER (round 11). Measured at 4x CPU, a tap drew the chosen chip and the new
    list in one piece of work (eight post cards and a composer), 135 to 360ms after the finger lifted: the chip looked dead, and the
    list's fade was eaten by the same stall. Now the chips (and the address) follow `target` at once, in a render that costs a row
    of chips; the list follows `listId`, which takes the new value two animation frames later (one for the chip's frame to be
    painted, one to draw the list in), drawn in one go at the start of that frame. A second tap before then cancels the first's
    handover, so quick taps never queue lists nobody will see, and never wait behind one. Everything below the chips reads
    `listTarget` and `listSort` and is one memoised block (FeedBody), so the chip's render never touches it.
  */
  const targetId = targetIdOf(picked?.target ?? fromPath)
  const target = useMemo(() => targetFromId(targetId), [targetId])
  const [list, setList] = useState({ id: targetId, sort })
  const behind = list.id !== targetId || list.sort !== sort
  /*
    NO FADE (round 15, the owner: "still a flash, a fade in between switching, which should not be"), AND THE CHIP FIRST
    (round 16, the owner: "the pill fill is too direct, it glitches and bumps"). Drawing the chip and the new list in one
    synchronous piece of work held the chip's fill back until eight post cards were built, so the fill never eased: it
    snapped. The chip's fill is an opacity layer (space-chips.tsx), which the compositor animates by itself, so it starts on
    the frame after the tap; the list is drawn in one go two frames later, while the fill is already easing, and a list
    already here is simply there. One that is not here yet keeps the posts already on screen. A newer tap cancels an older
    one's handover. A backup timer applies the list if the frames never run (a hidden tab), so a switch cannot stay on the
    previous space's posts.
  */
  /*
    AFTER THE INK HAS MOSTLY ARRIVED (round 15). The ink glides on the compositor (chip-ink.tsx), but a phone's compositor
    still waits for the page's thread to hand it each frame, and building the new list is the longest piece of work a switch
    does (60 to 105ms at 4x CPU). Two frames after the tap was the glide's fastest part, and that is where it stuttered. The
    list now comes LIST_AFTER_MS after the tap, when the glide's curve has done most of its travel and only its slow end is
    left: the step it can lose there is a pixel or two.
  */
  useEffect(() => {
    if (!behind) return
    const next = { id: targetId, sort }
    let frame = 0
    const wait = window.setTimeout(() => {
      frame = requestAnimationFrame(() => flushSync(() => setList(next)))
    }, LIST_AFTER_MS)
    const backup = window.setTimeout(() => setList(next), LIST_AFTER_MS + 160)
    return () => {
      window.clearTimeout(wait)
      cancelAnimationFrame(frame)
      window.clearTimeout(backup)
    }
  }, [behind, targetId, sort])
  const listTarget = useMemo(() => targetFromId(list.id), [list.id])
  const listSort = list.sort
  const key = viewKey(communityId, listTarget, listSort)
  /* A list swapped in after the first (rather than the one the page came with) draws fewer cards on its first frame: a phone's screenful. */
  const firstKey = useRef(key)
  const firstCards = firstKey.current === key ? FIRST_CARDS : SWAP_CARDS

  /* The server's first page goes into the cache, unless the cache already holds a newer copy (likes and saves made since). */
  /*
    A SCREENFUL FIRST (round 9, C6: post-card.tsx A PAGE OF POSTS COSTS ONE
    SCREENFUL). A list that comes on screen (the feed again, another space,
    another sort) draws its first FIRST_CARDS cards; the rest stand in at the
    height they will have for one frame and are drawn in a transition after
    it, which a tap can interrupt.
  */
  const [wholeFor, setWholeFor] = useState<string | null>(null)
  const whole = wholeFor === key
  useEffect(() => {
    if (wholeFor === key) return
    const id = requestAnimationFrame(() => startTransition(() => setWholeFor(key)))
    return () => cancelAnimationFrame(id)
  }, [key, wholeFor])

  const [shown, setShown] = useState<{ key: string; view: CachedView }>(() => {
    const k = viewKey(communityId, start, "default")
    const have = readView(k)
    const served = firstPage(initial, servedAt ?? Date.now())
    const view = have && have.at >= served.at ? have : served
    writeView(k, view)
    return { key: k, view }
  })
  const [failedKey, setFailedKey] = useState<string | null>(null)
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle")
  const keyRef = useRef(key)
  keyRef.current = key
  /* The list on screen, for work that finishes after a render (QUIET). */
  const shownRef = useRef(shown)
  shownRef.current = shown

  /* The space asked for, when it has been read. Otherwise the posts already on screen. A switch never clears the feed into the spinner. */
  const [cacheRev, setCacheRev] = useState(0)
  useEffect(() => subscribeViews(() => setCacheRev((n) => n + 1)), [])
  void cacheRev
  /*
    The posts follow the LIST, not the chip (round 16): read by `key`, so the chip's own render hands FeedBody the same posts
    and costs a row of chips; the new posts come with the list two frames later (THE CHIP FIRST, above).
  */
  /*
    THE LIST ON SCREEN CHANGES ONLY WHEN THE FEED CHANGES IT (round 21, the owner: "the feed reloads randomly, doubles,
    big slices, posts flash"). The cache is written by more than this feed: the read ahead of every space (prefetchViews),
    a stale list read again. Read straight from the cache, any such write swapped the list under the reader in one frame.
    Now the list on screen is the feed's own copy (`shown`), changed by the feed alone: a like, a post, a pull, the next
    page, a live post, and a quiet refresh merged in place (QUIET, below). The cache is read for a list not on screen yet.
  */
  const listed = shown.key === key ? shown.view : null
  const asked = listed ?? readView(key)
  const held = shown.view.posts.length ? shown.view : null
  const cached = asked ?? held
  const view = cached ?? EMPTY_LIST
  const waiting = !asked && view.posts.length === 0 && failedKey !== key

  /* Bring the list for a new key: from the cache (and quietly again when it is over a minute old), or from the server. */
  useEffect(() => {
    setMore("idle")
    const have = readView(key)
    if (have) {
      setShown((s) => (s.key === key ? s : { key, view: have }))
      if (Date.now() - have.at > FRESH_MS && have.pages <= 1) {
        /*
          QUIET: a list read over a minute ago is read again, and the new copy is merged into the one on screen rather than
          put in its place. The posts already there keep their places and take their new counts and words; posts new to
          it go to FeedLive, which slides them in at the top for a reader there, or holds them under its "new posts" pill
          for a reader further down. Nothing moves under the reader's eyes.
        */
        void loadView(communityId, listTarget, listSort).then((fresh) => {
          if (!fresh || keyRef.current !== key) return
          const now = shownRef.current.key === key ? shownRef.current.view : have
          const merged = mergeQuiet(now, fresh)
          writeView(key, merged.view)
          if (merged.view !== now) setShown({ key, view: merged.view })
          if (merged.added.length) {
            window.setTimeout(() => {
              if (keyRef.current === key) window.dispatchEvent(new CustomEvent(FRESH_POSTS_EVENT, { detail: { key, posts: merged.added } }))
            }, 0)
          }
        })
      }
      return
    }
    setFailedKey(null)
    let live = true
    void loadView(communityId, listTarget, listSort).then((fresh) => {
      if (!live || keyRef.current !== key) return
      if (fresh) setShown({ key, view: fresh })
      else setFailedKey(key)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  /* The chosen chip in view inside its row (Back to a space far along it, say), by scrolling the row only, never the page. */
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => followChosenChip(rootRef.current), [targetId])

  /* The spinner, only when the next list is slow to come: a quick answer swaps the lists and nothing else. */
  const [slow, setSlow] = useState(false)
  /* Whether the spinner stood in for the list, so the list that follows comes in from nothing. */
  const afterSpinner = useRef(false)
  useEffect(() => {
    if (!waiting) return setSlow(false)
    const t = window.setTimeout(() => {
      afterSpinner.current = true
      setSlow(true)
    }, WAIT_MS)
    return () => window.clearTimeout(t)
  }, [waiting, key])

  /*
    THE SWAP EASES IN. The list drawn changes (another space, another sort, or the one that was waited for): it comes in by opacity
    on the compositor, from 0 after the spinner and from 35% when it replaces a list directly, so it reads as one crossfade. A list
    that only grew (the next page) or was read again quietly keeps its key and does not move.
  */
  const listRef = useRef<HTMLDivElement>(null)
  const drawnKey = cached ? key : shown.key
  const lastDrawn = useRef(drawnKey)
  /*
    THE SAME POSTS DO NOT MOVE (round 13). All and a space that hold the same posts (a community with one space, a space with all
    of the recent posts) swap lists with the same cards on screen: each card is the same element before and after (keyed by the
    post's id in one list), so only a post that was not on screen before eases in, by itself; a list whose posts are all the same
    does not move at all. `onScreen` is the ids drawn as cards on the last frame, so they are drawn as cards again at once rather
    than standing in as placeholders for a frame (A SCREENFUL FIRST is for posts new to the screen).
  */
  const onScreen = useRef<Set<string>>(new Set())
  useLayoutEffect(() => {
    const el = listRef.current
    onScreen.current = new Set(Array.from(el?.querySelectorAll<HTMLElement>(":scope > [data-post]") ?? [], (x) => x.dataset.post ?? "").filter(Boolean))
    if (lastDrawn.current === drawnKey) return
    lastDrawn.current = drawnKey
    afterSpinner.current = false
  })

  /*
    EVERY SPACE'S FIRST PAGE, READ AHEAD AT ONCE (round 9, and not one after
    another). All and each feed space, a few at a time, as soon as the feed
    is on screen. A chat space is a page of its own and is not read here.
    A chip then finds its list already here.
  */
  const aheadTargets = useMemo<FeedTarget[]>(() => (spaces ? [{ kind: "all" as const }, ...spaces.filter((s) => s.kind !== "chat").map((s) => ({ kind: "space" as const, id: s.id }))] : []), [spaces])
  useEffect(() => {
    if (!aheadTargets.length) return
    let stopped = false
    const id = requestAnimationFrame(() => {
      void prefetchViews(communityId, aheadTargets, "default", () => stopped).then(() => {
        if (stopped) return
        for (const t of aheadTargets) {
          const v = readView(viewKey(communityId, t, "default"))
          if (v) warmPostFaces(v.posts.slice(0, SWAP_CARDS + 2), 12)
        }
      })
    })
    return () => {
      stopped = true
      cancelAnimationFrame(id)
    }
  }, [communityId, aheadTargets])

  const targetOf = useCallback(
    (pick: ChipPick): FeedTarget | null => {
      if (pick.kind !== "space") return pick
      const space = spaces?.find((s) => s.slug === pick.slug)
      return space && space.kind !== "chat" ? { kind: "space", id: space.id } : null
    },
    [spaces],
  )
  const hrefOf = (pick: ChipPick) => feedListHref(base, pick)

  /*
    THE PAGE STAYS WHERE THE FINGER IS (round 15). A pill pressed: once its list is the one on screen, the page used to jump to
    its very top (snapPageTop), which moved the row of pills under the finger by however far the page had been scrolled: a
    bump with every switch. The pills are where the member just tapped, so the page stays; only when the row is under the
    community's bar (Back to a list from far down, the sort menu's Saved) is it brought back just below the bar. Not on Back.
  */
  const snapOnList = useRef(false)
  useLayoutEffect(() => {
    if (!snapOnList.current || list.id !== targetId) return
    snapOnList.current = false
    keepPillsInView(rootRef.current)
  }, [list.id, targetId])

  /* A chip: the list switches here and the address follows; a list already on screen only scrolls the feed back into view. */
  const pick = (p: ChipPick) => {
    const next = targetOf(p)
    if (!next) return
    const href = hrefOf(p)
    if (sameTarget(next, target)) return
    /* The list is asked for on the press itself, so a cache miss has already started before the chip paints. */
    prefetchView(communityId, next, next.kind === "saved" ? "default" : sort)
    snapOnList.current = true
    /*
      THE ADDRESS FOLLOWS THE LIST. On a phone it is ?space=<slug> on the home
      feed; on a computer it is /community/<slug>/space/<space> (All is the
      community, Saved is /saved). pushState lets Back, a reload and a copied
      link land on it without loading another page.
    */
    if (nav.inCommunity) {
      /* The shell moves the address (pushState) and the place; the list follows it above. The page is kept where it is. */
      nav.go(placeOfPick(p), { scroll: "keep" })
      return
    }
    setPicked({ target: next, from: href })
    if (typeof window !== "undefined") {
      const cur = window.location.pathname + window.location.search
      if (cur !== href) window.history.pushState(null, "", href)
    }
  }
  /* The sort menu: an order while on Saved goes back to All in that order; its Saved posts row toggles Saved. */
  const onSort = (next: FeedSortValue) => {
    if (target.kind === "saved") pick({ kind: "all" })
    setSort(next)
  }
  const toggleSaved = () => pick(target.kind === "saved" ? { kind: "all" } : { kind: "saved" })
  const intent = (p: ChipPick) => {
    const next = targetOf(p)
    if (next) prefetchView(communityId, next, next.kind === "saved" ? "default" : sort)
  }

  /* The posts a page just added, and whether a press asked for them: drawn in softly and, after a press, scrolled up into view (reveal-more.ts). */
  const reveal = useRef<{ key: string; ids: Set<string>; scroll: boolean } | null>(null)
  const loadMore = useCallback(async (how?: "press") => {
    const k = key
    const from = readView(k) ?? (shown.key === k ? shown.view : null)
    if (!from?.cursor || more === "loading") return
    setMore("loading")
    const r = await api<FeedPageData>(viewUrl(communityId, listTarget, listSort, from.cursor))
    if (keyRef.current !== k) return
    if (!r.ok) return setMore("failed")
    setMore("idle")
    const now = readView(k) ?? from
    const seen = new Set(now.posts.map((p) => p.id))
    const added = (r.data.posts ?? []).filter((p) => !seen.has(p.id))
    const next: CachedView = { ...now, posts: [...now.posts, ...added], cursor: r.data.nextCursor ?? null, pages: now.pages + 1 }
    reveal.current = added.length ? { key: k, ids: new Set(added.map((p) => p.id)), scroll: how === "press" } : null
    writeView(k, next)
    setShown({ key: k, view: next })
  }, [communityId, key, more, shown, listSort, listTarget])
  useLayoutEffect(() => {
    const r = reveal.current
    if (!r || r.key !== key || shown.key !== key) return
    reveal.current = null
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>(":scope > [data-post]") ?? []).filter((el) => r.ids.has(el.dataset.post ?? ""))
    revealMore(items, { scroll: r.scroll })
  }, [shown, key])

  /* The next page, as the end comes near. */
  const sentinel = useRef<HTMLDivElement>(null)
  const cursor = waiting ? null : view.cursor
  const auto = view.posts.length < AUTO_POSTS
  useEffect(() => {
    const el = sentinel.current
    if (!el || !cursor || !auto || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), { rootMargin: "600px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [cursor, auto, loadMore])

  /* A change to one post: this list, then every other cached list holding it. */
  const update: PostUpdate = useCallback(
    (id, fn) => {
      const k = keyRef.current
      const current = readView(k) ?? shown.view
      const before = current.posts.find((p) => p.id === id)
      const posts = current.posts.flatMap((p) => {
        if (p.id !== id) return [p]
        const next = fn(p)
        if (!next || (listTarget.kind === "saved" && !next.bookmarked)) return []
        return [next]
      })
      const after = posts.find((p) => p.id === id)
      const next = { ...current, posts }
      writeView(k, next)
      setShown({ key: k, view: next })
      patchPost(communityId, id, fn, k)
      if (listTarget.kind !== "saved" && before && (!after || before.bookmarked !== after.bookmarked)) dropSaved(communityId)
    },
    [communityId, shown.view, listTarget.kind],
  )

  const onPosted = useCallback(
    (p: FeedPostView) => {
      if (p.space && listTarget.kind === "space" && p.space.id !== listTarget.id) return toast(`Posted in ${p.space.name}`)
      addPost(communityId, p)
      const now = readView(key)
      if (now) setShown({ key, view: now })
    },
    [communityId, key, listTarget],
  )
  const onRetry = useCallback(() => {
    setFailedKey(null)
    void loadView(communityId, listTarget, listSort).then((fresh) => {
      if (keyRef.current !== key) return
      if (fresh) setShown({ key, view: fresh })
      else setFailedKey(key)
    })
  }, [communityId, key, listSort, listTarget])
  const onLive = useCallback((v: CachedView) => setShown({ key, view: v }), [key])

  /*
    PULL TO REFRESH, IN PLACE (round 15). The list on screen is read again and merged into itself (feed-cache.ts mergeQuiet):
    every card stays the same element, a post with nothing new keeps the very same object (so its card and its pictures are
    not drawn again at all), a post with new counts or words takes them where it is, and posts new to the list go to FeedLive,
    which slides them in at the top for a reader there. The pages already read stay. It settles once the merged list has
    been drawn, so the pull lets go the moment the data is in. The shell's navigator.refresh() calls it for the feed's slot
    (lib/communities/client/navigator-context.tsx useRegisterPlaceRefresh); the page's pull event does too, for a feed drawn
    outside the shell.
  */
  const listRefs = useRef({ target: listTarget, sort: listSort })
  listRefs.current = { target: listTarget, sort: listSort }
  const refreshList = useCallback(async () => {
    const k = keyRef.current
    const { target: t, sort: s } = listRefs.current
    const fresh = await loadView(communityId, t, s)
    if (!fresh || keyRef.current !== k) return
    const now = shownRef.current.key === k ? shownRef.current.view : (readView(k) ?? fresh)
    const merged = mergeQuiet(now, fresh)
    writeView(k, merged.view)
    if (merged.view !== now) setShown({ key: k, view: merged.view })
    if (merged.added.length) window.dispatchEvent(new CustomEvent(FRESH_POSTS_EVENT, { detail: { key: k, posts: merged.added } }))
    await new Promise<void>((done) => requestAnimationFrame(() => done()))
  }, [communityId])
  useRegisterPlaceRefresh(spaces ? "feed" : `feed-view:${communityId}`, refreshList)
  useEffect(() => {
    if (!spaces) return
    const on = (e: Event) => {
      const detail = (e as CustomEvent<PullRefreshDetail>).detail
      if (detail?.scope === COMMUNITY_FEED_REFRESH_SCOPE) detail.done = refreshList()
    }
    window.addEventListener(PULL_REFRESH_EVENT, on)
    return () => window.removeEventListener(PULL_REFRESH_EVENT, on)
  }, [spaces, refreshList])

  /* What follows the list on screen: the space's line, the composer, the empty words; all of the list's, so they change with it. */
  const space = listTarget.kind === "space" ? (spaces?.find((s) => s.id === listTarget.id) ?? null) : null
  const chipSpace = target.kind === "space" ? (spaces?.find((s) => s.id === target.id) ?? null) : null
  const composerProps: Omit<ComposerProps, "onPosted"> | null = useMemo(() => {
    if (readOnly) return null
    if (composer) return composer
    if (!compose || !spaces || listTarget.kind === "saved") return null
    if (space) return space.canPost ? { communityId, ...compose, spaces: composerSpacesOf([space]), fixedSpaceId: space.id } : null
    const all = composerSpacesOf(spaces)
    return all.length ? { communityId, ...compose, spaces: all } : null
  }, [readOnly, composer, compose, spaces, listTarget.kind, space, communityId])
  const empty =
    emptyText && sameTarget(listTarget, start)
      ? emptyText
      : listTarget.kind === "saved"
        ? "Save a post with the bookmark and it waits here."
        : listSort === "unread"
          ? "Nothing new since you were last here."
          : space
            ? space.canPost && !readOnly
              ? "Be the first to post here."
              : "Nothing here yet."
            : "Start the conversation."
  const emptyTitle = listTarget.kind === "saved" ? "Nothing saved yet." : listSort === "unread" ? "You are all caught up." : "No posts yet."
  /* The spaces Edit post may move a post to (post-card.tsx EditSpacesContext): every space this member may post in. */
  const editSpaces = useMemo(() => (spaces ? composerSpacesOf(spaces) : null), [spaces])
  const lead = listSort === "default" && listTarget.kind !== "saved"
  const posts = useMemo(() => (lead ? [...view.posts.filter((p) => p.pinned), ...view.posts.filter((p) => !p.pinned)] : view.posts), [lead, view.posts])

  useEffect(() => {
    warmPostFaces(posts)
  }, [posts])

  return (
    <EditSpacesContext.Provider value={editSpaces}>
    <div ref={rootRef} className="w-full min-w-0" data-community-feed={listTarget.kind === "space" ? `space:${space?.slug ?? ""}` : listTarget.kind} data-feed-key={key} data-feed-waiting={waiting ? "" : undefined}>
      {spaces ? (
        <SpaceChips
          slug={slug}
          spaces={spaces}
          active={chipSpace?.slug ?? null}
          savedOn={target.kind === "saved"}
          onPick={pick}
          onIntent={intent}
          sort={<SortMenu value={sort} onChange={onSort} saved={target.kind === "saved"} onSaved={toggleSaved} />}
        />
      ) : null}

      <FeedLive communityId={communityId} viewerId={viewer.userId} feedKey={key} target={listTarget} sort={listSort} onView={onLive} />
      <div data-feed-body="">
      <FeedBody
        line={spaces ? (space?.description ? { kind: "space", text: space.description } : listTarget.kind === "saved" ? { kind: "saved" } : null) : null}
        saved={listTarget.kind === "saved"}
        onboarding={onboarding && listTarget.kind === "all" ? { communityId, data: onboarding } : null}
        composerProps={composerProps}
        composerKey={listTarget.kind === "space" ? listTarget.id : listTarget.kind}
        onPosted={onPosted}
        failed={failedKey === key}
        onRetry={onRetry}
        spinner={slow && waiting}
        listRef={listRef}
        waiting={waiting}
        posts={posts}
        whole={whole}
        firstCards={firstCards}
        onScreen={onScreen}
        slug={slug}
        viewer={viewer}
        update={update}
        readOnly={readOnly}
        emptyTitle={emptyTitle}
        empty={empty}
        sentinel={sentinel}
        cursor={cursor}
        more={more}
        loadMore={loadMore}
      />
      </div>
    </div>
    </EditSpacesContext.Provider>
  )
}

interface FeedBodyProps {
  line: { kind: "space"; text: string } | { kind: "saved" } | null
  saved: boolean
  onboarding: { communityId: string; data: OnboardingView } | null
  composerProps: Omit<ComposerProps, "onPosted"> | null
  composerKey: string
  onPosted: (p: FeedPostView) => void
  failed: boolean
  onRetry: () => void
  spinner: boolean
  listRef: React.RefObject<HTMLDivElement | null>
  waiting: boolean
  posts: FeedPostView[]
  whole: boolean
  firstCards: number
  /** The ids drawn as cards on the last frame: drawn as cards again at once (THE SAME POSTS DO NOT MOVE). */
  onScreen: React.RefObject<Set<string>>
  slug: string
  viewer: ViewerView
  update: PostUpdate
  readOnly: boolean
  emptyTitle: string
  empty: string
  sentinel: React.RefObject<HTMLDivElement | null>
  cursor: string | null
  more: "idle" | "loading" | "failed"
  loadMore: (how?: "press") => void
}

/**
 * EVERYTHING UNDER THE CHIPS, drawn again only when the list's own facts change (round 11): a tap on a chip redraws the row of
 * chips alone on its first frame, and this follows when the deferred list does. `onboarding` is a fresh object when the list is
 * All, so it is compared by what is in it.
 */
const FeedBody = memo(
  function FeedBody({ line, saved, onboarding, composerProps, composerKey, onPosted, failed, onRetry, spinner, listRef, waiting, posts, whole, firstCards, onScreen, slug, viewer, update, readOnly, emptyTitle, empty, sentinel, cursor, more, loadMore }: FeedBodyProps) {
    return (
      <>
        {line?.kind === "space" ? (
          <p className="-mt-0.5 mb-3 px-1 text-[13.5px] leading-relaxed text-[#6b7280]" data-space-description="">
            {line.text}
          </p>
        ) : line?.kind === "saved" ? (
          /* Saved has no chip of its own (round 9), so it says what it is, in the space line's place. */
          <p className="-mt-0.5 mb-3 px-1 text-[13.5px] leading-relaxed text-[#6b7280]" data-saved-line="">
            <span className="font-semibold text-[#1a1a2e]">Saved posts</span> · only you see these
          </p>
        ) : null}
        <div className="space-y-3" data-feed={saved ? "saved" : "feed"}>
          {onboarding ? <Onboarding communityId={onboarding.communityId} data={onboarding.data} /> : null}
          {composerProps ? <Composer key={composerKey} {...composerProps} onPosted={onPosted} /> : null}

          {failed ? (
            <div className={`${CARD} px-6 py-10 text-center`} data-feed-failed="">
              <p className="text-[15px] font-semibold text-[#1a1a2e]">These posts did not load.</p>
              <button type="button" className={`${BTN_SECONDARY} mt-3`} onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : spinner && posts.length === 0 ? (
            <PlaceSpinner compact label="Loading posts" />
          ) : (
            <div
              ref={listRef}
              className="space-y-3"
              aria-busy={waiting || undefined}
              data-feed-list=""
            >
              {posts.map((p, i) =>
                i < firstCards || whole || onScreen.current.has(p.id) ? <PostCard key={p.id} post={p} slug={slug} viewer={viewer} update={update} readOnly={readOnly} priority={i < 2} /> : <PostCardPlaceholder key={p.id} post={p} />,
              )}
            </div>
          )}

          {posts.length === 0 && !waiting && !failed ? (
            <div className={`${CARD} px-6 py-12 text-center`} data-feed-empty="">
              <p className="text-[16px] font-semibold text-[#1a1a2e]">{emptyTitle}</p>
              <p className="mt-1 text-[14px] text-[#6b7280]">{empty}</p>
            </div>
          ) : null}

          <div ref={sentinel} aria-hidden className="h-px" />
          {cursor ? (
            <div className="flex justify-center pb-4 pt-1">
              <button type="button" onClick={() => loadMore("press")} disabled={more === "loading"} className={BTN_SECONDARY} data-feed-more="">
                {more === "loading" ? "Loading..." : more === "failed" ? "Try again" : "Load more posts"}
              </button>
            </div>
          ) : !waiting && posts.length > 4 ? (
            <p className="pb-6 pt-2 text-center text-[13px] text-[#9ca3af]">You are all caught up.</p>
          ) : null}
        </div>
      </>
    )
  },
  (a, b) => {
    for (const k of Object.keys(a) as (keyof FeedBodyProps)[]) {
      if (k === "onboarding") {
        if (a.onboarding?.data !== b.onboarding?.data || a.onboarding?.communityId !== b.onboarding?.communityId) return false
      } else if (k === "line") {
        if (a.line?.kind !== b.line?.kind || (a.line?.kind === "space" && b.line?.kind === "space" && a.line.text !== b.line.text)) return false
      } else if (a[k] !== b[k]) return false
    }
    return true
  },
)

export interface FeedViewProps {
  communityId: string
  slug: string
  viewer: ViewerView
  initial: FeedPageData
  spaceId?: string | null
  mode?: "feed" | "saved"
  composer?: Omit<ComposerProps, "onPosted"> | null
  readOnly?: boolean
  emptyText?: string
  onboarding?: OnboardingView | null
}

/** One list with no chips (and so no switching), for a caller that draws its own header. */
export function FeedView({ communityId, slug, viewer, initial, spaceId = null, mode = "feed", composer = null, readOnly = false, emptyText, onboarding = null }: FeedViewProps) {
  const start: FeedTarget = mode === "saved" ? { kind: "saved" } : spaceId ? { kind: "space", id: spaceId } : { kind: "all" }
  return <CommunityFeed communityId={communityId} slug={slug} viewer={viewer} start={start} initial={initial} composer={composer} readOnly={readOnly} emptyText={emptyText} onboarding={onboarding} />
}

/** The welcome a new member sees once: the creator's words, the rules, and a nudge to say hello. */
function Onboarding({ communityId, data }: { communityId: string; data: OnboardingView }) {
  const [gone, setGone] = useState(false)
  if (gone) return null
  const done = async () => {
    setGone(true)
    const r = await api(`${apiBase(communityId)}/me`, { method: "PATCH", body: { onboarded: true } })
    if (!r.ok) toast(r.error)
  }
  return (
    <section className={`${CARD} p-5 sm:p-6`} data-onboarding="">
      <h2 className="text-[19px] font-semibold text-[#1a1a2e]">Welcome to {data.name}</h2>
      {data.welcome ? <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#4b5563]">{data.welcome}</p> : null}
      {data.rules.length ? (
        <ol className="mt-4 space-y-2.5 border-t border-[#f0f1f3] pt-4">
          {data.rules.map((r, i) => (
            <li key={i} className="flex gap-3 text-[14px]">
              <span className="w-5 shrink-0 tabular-nums font-semibold text-[#9ca3af]">{i + 1}</span>
              <span>
                <span className="font-medium text-[#1a1a2e]">{r.title}</span>
                {r.body ? <span className="block text-[#6b7280]">{r.body}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        {data.introHref ? (
          <Link href={data.introHref} onClick={() => void done()} className={BTN_PRIMARY}>
            Introduce yourself
          </Link>
        ) : null}
        <button type="button" onClick={done} className={data.introHref ? BTN_GHOST : BTN_PRIMARY}>
          {data.rules.length ? "I agree, let's go" : "Got it"}
        </button>
      </div>
    </section>
  )
}
