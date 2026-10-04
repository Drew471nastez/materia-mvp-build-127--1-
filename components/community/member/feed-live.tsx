"use client"

/**
 * ===========================================================================
 *  THE FEED, LIVE (round 10)
 * ===========================================================================
 * Drawn once by the feed (feed.tsx) just above its posts, with the list on
 * screen and the way to show a new copy of it. Three things:
 *
 *   SOMEBODY ELSE POSTS. The community's live channel says a post's id
 *   (live.ts); it is read through the gated API, and when it belongs in the
 *   list on screen (All, or its own space, in Default or New) it goes to
 *   the top of the cached lists (feed-cache.ts addPost). A reader at the
 *   top sees it slide in (arrive.ts useArrivals: the posts under it slide
 *   down to make room, never a jump). A reader scrolled down is not moved:
 *   a quiet "1 new post" pill waits under the community's bar, and the
 *   posts go in when it is pressed (the page scrolls up smoothly first) or
 *   when the reader scrolls back up on their own.
 *
 *   PULL TO REFRESH. The page's pull (components/ui/pull-to-refresh.tsx)
 *   sends `storelib:pull-refresh` with detail.scope "community-feed"; the
 *   first page of the list on screen is read again, swapped in place, any
 *   post new to it slides in, and `detail.done` is the promise the pull's
 *   spinner waits for.
 *
 *   THE MEMBER'S OWN POST is put in by the composer (feed.tsx onPosted), so
 *   its broadcast coming back is skipped by id.
 */
import { ArrowUp } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { FeedPostView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { useArrivals } from "./arrive"
import { addPost, loadView, readView, type CachedView, type FeedSortValue, type FeedTarget } from "./feed-cache"
import { listenLive } from "./live"

export const PULL_EVENT = "storelib:pull-refresh"
export const PULL_SCOPE = "community-feed"

/** A reader whose first post is further above the bar than this is "scrolled down": new posts wait under the pill. */
const AWAY_PX = 80

export interface FeedLiveProps {
  communityId: string
  viewerId: string | null
  /** The list on screen (feed-cache viewKey) and what it is. */
  feedKey: string
  target: FeedTarget
  sort: FeedSortValue
  /** Shows this copy of the list on screen. */
  onView: (view: CachedView) => void
}

/** Whether a post belongs at the top of the list on screen. */
export function fitsList(target: FeedTarget, sort: FeedSortValue, spaceId: string | null | undefined): boolean {
  if (sort !== "default" && sort !== "new") return false
  if (target.kind === "all") return true
  return target.kind === "space" && !!spaceId && target.id === spaceId
}

function firstCard(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-feed-list] > [data-post]")
}

/** Whether the top of the list is in sight (or there is no list to be away from). */
function atTop(): boolean {
  const first = firstCard()
  if (!first) return true
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--community-top")) || 65
  return first.getBoundingClientRect().top > bar - AWAY_PX
}

export function FeedLive({ communityId, viewerId, feedKey, target, sort, onView }: FeedLiveProps) {
  const [waiting, setWaiting] = useState<FeedPostView[]>([])
  const now = useRef({ feedKey, target, sort, onView })
  now.current = { feedKey, target, sort, onView }
  const waitingRef = useRef(waiting)
  waitingRef.current = waiting

  const arrive = useArrivals()

  /* Another list on screen: what waited for the last one is in its cache already, and the pill goes. */
  useEffect(() => setWaiting([]), [feedKey])

  /** Puts posts at the top of the cached lists, shows the list again, and slides them in. */
  const put = (posts: FeedPostView[]) => {
    if (!posts.length) return
    /* Oldest first, so the newest ends on top. */
    for (const p of [...posts].reverse()) addPost(communityId, p)
    const view = readView(now.current.feedKey)
    if (!view) return
    arrive(posts.map((p) => p.id))
    now.current.onView(view)
  }
  const putRef = useRef(put)
  putRef.current = put

  /* SOMEBODY ELSE POSTS. */
  useEffect(() => {
    const seen = new Set<string>()
    return listenLive(communityId, null, "post", (payload) => {
      const id = typeof payload.postId === "string" ? payload.postId : ""
      /* The member's own post is the composer's to put in (with its own finish), never this one's. */
      if (!id || seen.has(id) || (viewerId && payload.authorId === viewerId)) return
      seen.add(id)
      void (async () => {
        const r = await api<{ post: FeedPostView }>(`${apiBase(communityId)}/posts/${encodeURIComponent(id)}`)
        if (!r.ok || !r.data.post) return
        const post = r.data.post
        const { feedKey: key, target: t, sort: s } = now.current
        if (readView(key)?.posts.some((p) => p.id === post.id) || waitingRef.current.some((p) => p.id === post.id)) return
        if (!fitsList(t, s, post.space?.id ?? null)) {
          /* Not this list: the lists it does belong to have it when they are opened. */
          addPost(communityId, post)
          return
        }
        if (atTop()) putRef.current([post])
        else setWaiting((w) => (w.some((p) => p.id === post.id) ? w : [post, ...w]))
      })()
    })
  }, [communityId, viewerId])

  /* Back up to the top on their own: what waited goes in. */
  useEffect(() => {
    if (!waiting.length) return
    let raf = 0
    const on = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (atTop()) {
          const list = waitingRef.current
          setWaiting([])
          putRef.current(list)
        }
      })
    }
    window.addEventListener("scroll", on, { passive: true })
    return () => {
      window.removeEventListener("scroll", on)
      cancelAnimationFrame(raf)
    }
  }, [waiting.length])

  /* PULL TO REFRESH: the first page again, in place; the pull waits for it. */
  useEffect(() => {
    const onPull = (e: Event) => {
      const detail = (e as CustomEvent<{ scope?: string; done?: Promise<unknown> }>).detail
      if (!detail || detail.scope !== PULL_SCOPE) return
      const { feedKey: key, target: t, sort: s } = now.current
      const before = new Set((readView(key)?.posts ?? []).map((p) => p.id))
      detail.done = loadView(communityId, t, s).then((fresh) => {
        if (!fresh || now.current.feedKey !== key) return
        setWaiting([])
        const added = fresh.posts.filter((p) => !before.has(p.id) && !p.pinned).map((p) => p.id)
        if (added.length && before.size) arrive(added)
        now.current.onView(fresh)
      })
    }
    window.addEventListener(PULL_EVENT, onPull)
    return () => window.removeEventListener(PULL_EVENT, onPull)
  }, [communityId])

  const show = () => {
    const list = waitingRef.current
    const first = firstCard()
    const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--community-top")) || 65
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    /* Up first, smoothly; the posts go in once the top is in sight (the scroll listener above), or after the scroll at the latest. */
    if (first) window.scrollTo({ top: Math.max(0, window.scrollY + first.getBoundingClientRect().top - bar - 72), behavior: reduced ? "auto" : "smooth" })
    window.setTimeout(() => {
      if (!waitingRef.current.length) return
      setWaiting([])
      putRef.current(list)
    }, reduced ? 0 : 900)
  }

  const n = waiting.length
  return (
    <div className="pointer-events-none sticky top-[calc(var(--community-top,65px)+12px)] z-30 flex h-0 justify-center" data-feed-live="">
      {n ? (
        <button
          type="button"
          onClick={show}
          className="pointer-events-auto mt-1 inline-flex h-10 items-center gap-1.5 rounded-full border border-[#1a1a2e] bg-[#1a1a2e] px-4 text-[14px] font-medium text-white shadow-[0_6px_18px_-6px_rgba(17,24,39,0.35),0_1px_2px_rgba(16,24,40,0.18)] outline-none transition-[scale] duration-150 animate-in fade-in-0 slide-in-from-top-2 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 motion-reduce:animate-none motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] sm:h-9"
          data-feed-new-pill={n}
        >
          <ArrowUp className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          {n === 1 ? "1 new post" : `${n} new posts`}
        </button>
      ) : null}
    </div>
  )
}
