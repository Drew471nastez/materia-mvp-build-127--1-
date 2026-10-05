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
 * frame, no skeleton). One that is not cached keeps the list on screen for a
 * moment (WAIT_MS) and then, still waiting, gives its place to a small
 * spinner (round 9, place-spinner.tsx), never a skeleton; whatever list
 * arrives eases in (opacity), so a swap reads as a crossfade, not a cut.
 * The address moves with it (history.pushState, which Next's router follows),
 * so Back, a reload and a shared link all land on the same list. A list is
 * asked for ahead when a pointer rests on its chip or a finger lands on it,
 * and once the feed is idle the first page of every space is read ahead,
 * one after another (feed-cache.ts prefetchViews), so a chip usually finds
 * its list already here. A list read over a minute ago is shown at once and
 * read again quietly.
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
import { FeedLive } from "./feed-live"
import {
  FRESH_MS,
  addPost,
  dropSaved,
  firstPage,
  loadView,
  patchPost,
  prefetchView,
  prefetchViews,
  readView,
  viewKey,
  viewUrl,
  whenIdle,
  writeView,
  type CachedView,
  type FeedPageData,
  type FeedSortValue,
  type FeedTarget,
} from "./feed-cache"
import { sectionFromPath } from "./nav"
import { PlaceSpinner, Spinner, WAIT_MS } from "./place-spinner"
import { EditSpacesContext, FIRST_CARDS, PostCard, PostCardPlaceholder, type PostUpdate } from "./post-card"
import { SortMenu } from "./sort-menu"
import { followChosenChip, SpaceChips, type ChipPick } from "./space-chips"
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
  return spaces.filter((s) => s.canPost && s.kind !== "chat").map((s) => ({ id: s.id, name: s.name, kind: s.kind, icon: s.icon }))
}

/** How an arriving list eases in: from a little under full when it replaces another list, from nothing after the spinner. */
const ARRIVE_MS = 200
const ARRIVE_EASE = "cubic-bezier(0.22, 1, 0.36, 1)"
/** How long to wait before marking a list swap as slow when posts are still on screen (stale list stays visible). */
const LIST_SPIN_MS = 320
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
export function targetFromPath(pathname: string | null | undefined, slug: string, spaces: SpaceView[] | undefined, fallback: FeedTarget): FeedTarget {
  if (!spaces) return fallback
  const section = sectionFromPath(pathname, slug)
  if (section === "home") return { kind: "all" }
  if (section === "saved") return { kind: "saved" }
  if (section.startsWith("space:")) {
    const want = section.slice(6).toLowerCase()
    const space = spaces.find((s) => s.slug.toLowerCase() === want)
    if (space && space.kind !== "chat") return { kind: "space", id: space.id }
  }
  return fallback
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

export function CommunityFeed({ communityId, slug, viewer, spaces, start, initial, servedAt, readOnly = false, onboarding = null, compose = null, composer = null, emptyText }: CommunityFeedProps) {
  const base = `/community/${slug}`
  const pathname = usePathname()
  /* Back and Forward between lists switched in place: the address is the truth, so read it again when it moves. */
  const [, setTick] = useState(0)
  useEffect(() => {
    const on = () => setTick((t) => t + 1)
    window.addEventListener("popstate", on)
    return () => window.removeEventListener("popstate", on)
  }, [])
  const livePath = typeof window === "undefined" ? pathname : window.location.pathname
  const fromPath = targetFromPath(livePath || pathname, slug, spaces, start)
  /* A click marks its list at once; the address catching up clears the mark. */
  const [picked, setPicked] = useState<{ target: FeedTarget; from: string } | null>(null)
  if (picked && picked.from !== (livePath || pathname)) setPicked(null)
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
  /* A layout effect, so the first frame callback is asked for before the chip's frame is painted: the list lands on the frame after it, never two. */
  useLayoutEffect(() => {
    if (!behind) return
    const next = { id: targetId, sort }
    if (typeof requestAnimationFrame !== "function" || document.visibilityState !== "visible") return setList(next)
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => flushSync(() => setList(next)))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
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

  /* The list for this key: the one in state, else the cache (on this very frame), else the one still on screen while it comes. */
  const cached = shown.key === key ? shown.view : (readView(key) ?? null)
  const view = cached ?? shown.view
  const waiting = !cached && failedKey !== key

  /* Bring the list for a new key: from the cache (and quietly again when it is over a minute old), or from the server. */
  useEffect(() => {
    setMore("idle")
    const have = readView(key)
    if (have) {
      setShown((s) => (s.key === key && s.view === have ? s : { key, view: have }))
      if (Date.now() - have.at > FRESH_MS && have.pages <= 1) {
        void loadView(communityId, listTarget, listSort).then((fresh) => {
          if (fresh && keyRef.current === key) setShown({ key, view: fresh })
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
  /* Whether the spinner stood in for the list, so the list that follows comes in from nothing rather than from 35%. */
  const afterSpinner = useRef(false)
  useEffect(() => {
    if (!waiting) return setSlow(false)
    const empty = view.posts.length === 0
    const t = window.setTimeout(() => {
      afterSpinner.current = empty
      setSlow(true)
    }, empty ? WAIT_MS : LIST_SPIN_MS)
    return () => window.clearTimeout(t)
  }, [waiting, key, view.posts.length])

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
    const before = onScreen.current
    onScreen.current = new Set(Array.from(el?.querySelectorAll<HTMLElement>(":scope > [data-post]") ?? [], (x) => x.dataset.post ?? "").filter(Boolean))
    if (lastDrawn.current === drawnKey) return
    lastDrawn.current = drawnKey
    const from = afterSpinner.current ? 0 : 0.35
    const whole = afterSpinner.current || before.size === 0
    afterSpinner.current = false
    if (!el || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    if (whole) {
      el.animate([{ opacity: from }, { opacity: 1 }], { duration: ARRIVE_MS, easing: ARRIVE_EASE })
      return
    }
    const bottom = window.innerHeight
    for (const card of el.querySelectorAll<HTMLElement>(":scope > [data-post], :scope > [data-post-placeholder]")) {
      const id = card.dataset.post ?? card.dataset.postPlaceholder ?? ""
      if (before.has(id)) continue
      if (card.getBoundingClientRect().top > bottom) break
      card.animate([{ opacity: from }, { opacity: 1 }], { duration: ARRIVE_MS, easing: ARRIVE_EASE })
    }
  })

  /*
    EVERY SPACE'S FIRST PAGE, READ AHEAD ONCE THE FEED IS IDLE (round 9). All and each feed space in the order on screen (the one
    shown already is cached), one at a time, in the sort in force; a chat space is a page of its own and is not read here.
  */
  const aheadTargets = useMemo<FeedTarget[]>(() => (spaces ? [{ kind: "all" as const }, ...spaces.filter((s) => s.kind !== "chat").map((s) => ({ kind: "space" as const, id: s.id }))] : []), [spaces])
  useEffect(() => {
    if (!aheadTargets.length) return
    let stopped = false
    const cancel = whenIdle(() => void prefetchViews(communityId, aheadTargets, "default", () => stopped))
    return () => {
      stopped = true
      cancel()
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
  const hrefOf = (pick: ChipPick) => (pick.kind === "all" ? base : pick.kind === "saved" ? `${base}/saved` : `${base}/space/${encodeURIComponent(pick.slug)}`)

  /* A chip: the list switches here and the address follows; a list already on screen only scrolls the feed back into view. */
  const pick = (p: ChipPick) => {
    const next = targetOf(p)
    if (!next) return
    const href = hrefOf(p)
    if (sameTarget(next, target)) return
    setPicked({ target: next, from: href })
    if (typeof window !== "undefined" && window.location.pathname !== href) window.history.pushState(null, "", href)
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

  const loadMore = useCallback(async () => {
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
    const next: CachedView = { ...now, posts: [...now.posts, ...(r.data.posts ?? []).filter((p) => !seen.has(p.id))], cursor: r.data.nextCursor ?? null, pages: now.pages + 1 }
    writeView(k, next)
    setShown({ key: k, view: next })
  }, [communityId, key, more, shown, listSort, listTarget])

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
  loadMore: () => void
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
            <div className="relative">
              {waiting && spinner ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-0.5" aria-hidden data-feed-loading="">
                  <Spinner size={20} label="Loading posts" />
                </div>
              ) : null}
              <div
                ref={listRef}
                className="space-y-3 transition-opacity duration-200 motion-reduce:transition-none"
                style={waiting && spinner && posts.length > 0 ? { opacity: 0.88 } : undefined}
                aria-busy={waiting || undefined}
                data-feed-list=""
                data-feed-list-stale={waiting && posts.length > 0 ? "" : undefined}
              >
                {posts.map((p, i) =>
                  i < firstCards || whole || onScreen.current.has(p.id) ? <PostCard key={p.id} post={p} slug={slug} viewer={viewer} update={update} readOnly={readOnly} /> : <PostCardPlaceholder key={p.id} post={p} />,
                )}
              </div>
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
              <button type="button" onClick={loadMore} disabled={more === "loading"} className={BTN_SECONDARY} data-feed-more="">
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
