"use client"

/**
 * ===========================================================================
 *  THE FEED
 * ===========================================================================
 * The composer, then Latest or Popular, pinned posts first, then posts a page
 * at a time. The next page is asked for as the end of the list comes near
 * (an IntersectionObserver 600px ahead), and a "Show more" button stays
 * underneath for whatever the observer misses: a browser without it, a
 * keyboard, a slow connection. Pages follow the server's keyset cursor, so a
 * post written while reading never shifts one into the next page twice.
 *
 * The same list draws a space's feed (one space) and Saved (the member's
 * bookmarks, where unsaving takes the post off the list).
 */
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import type { FeedPostView, ViewerView } from "@/lib/communities/types"
import { api, apiBase } from "./api"
import { Composer, type ComposerProps } from "./composer"
import { PostCard, type PostUpdate } from "./post-card"
import { toast } from "./toast"
import { BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, CARD } from "./ui"

export type FeedSortValue = "latest" | "popular"

export interface FeedPageData {
  pinned: FeedPostView[]
  posts: FeedPostView[]
  nextCursor: string | null
}

export interface OnboardingView {
  name: string
  welcome: string | null
  rules: { title: string; body: string }[]
  introHref: string | null
}

export interface FeedViewProps {
  communityId: string
  slug: string
  viewer: ViewerView
  initial: FeedPageData
  initialSort?: FeedSortValue
  spaceId?: string | null
  mode?: "feed" | "saved"
  composer?: Omit<ComposerProps, "onPosted"> | null
  readOnly?: boolean
  emptyText?: string
  onboarding?: OnboardingView | null
}

export function FeedView({ communityId, slug, viewer, initial, initialSort = "latest", spaceId = null, mode = "feed", composer = null, readOnly = false, emptyText, onboarding = null }: FeedViewProps) {
  const [sort, setSort] = useState<FeedSortValue>(initialSort)
  /* One list; pinned posts are drawn first from it, so pinning or unpinning only changes a flag. */
  const [posts, setPosts] = useState<FeedPostView[]>(() => [...initial.pinned, ...initial.posts])
  const [cursor, setCursor] = useState(initial.nextCursor)
  const [loading, setLoading] = useState<"more" | "sort" | null>(null)
  const [failed, setFailed] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const busy = useRef(false)

  const url = useCallback(
    (s: FeedSortValue, c: string | null) => {
      const q = new URLSearchParams()
      if (mode === "saved") {
        if (c) q.set("cursor", c)
        return `${apiBase(communityId)}/bookmarks?${q}`
      }
      q.set("sort", s)
      if (c) q.set("cursor", c)
      if (spaceId) q.set("space", spaceId)
      return `${apiBase(communityId)}/posts?${q}`
    },
    [communityId, mode, spaceId],
  )

  const loadMore = useCallback(async () => {
    if (!cursor || busy.current) return
    busy.current = true
    setLoading("more")
    setFailed(false)
    const r = await api<FeedPageData>(url(sort, cursor))
    busy.current = false
    setLoading(null)
    if (!r.ok) {
      setFailed(true)
      return
    }
    setPosts((list) => {
      const seen = new Set(list.map((p) => p.id))
      return [...list, ...r.data.posts.filter((p) => !seen.has(p.id))]
    })
    setCursor(r.data.nextCursor)
  }, [cursor, sort, url])

  const changeSort = async (next: FeedSortValue) => {
    if (next === sort || loading === "sort") return
    setSort(next)
    setLoading("sort")
    const r = await api<FeedPageData>(url(next, null))
    setLoading(null)
    if (!r.ok) {
      setSort(sort)
      return toast(r.error)
    }
    setPosts([...r.data.pinned, ...r.data.posts])
    setCursor(r.data.nextCursor)
  }

  /* The next page, as the end comes near. */
  useEffect(() => {
    const el = sentinel.current
    if (!el || !cursor || typeof IntersectionObserver === "undefined") return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && void loadMore(), { rootMargin: "600px 0px" })
    io.observe(el)
    return () => io.disconnect()
  }, [cursor, loadMore])

  const update: PostUpdate = useCallback(
    (id, fn) =>
      setPosts((list) =>
        list.flatMap((p) => {
          if (p.id !== id) return [p]
          const next = fn(p)
          if (!next || (mode === "saved" && !next.bookmarked)) return []
          return [next]
        }),
      ),
    [mode],
  )

  const all = [...posts.filter((p) => p.pinned && mode === "feed"), ...posts.filter((p) => !p.pinned || mode !== "feed")]

  return (
    <div className="space-y-3" data-feed={mode}>
      {onboarding ? <Onboarding communityId={communityId} data={onboarding} /> : null}
      {composer && !readOnly ? <Composer {...composer} onPosted={(p) => (p.space && spaceId && p.space.id !== spaceId ? toast(`Posted in ${p.space.name}`) : setPosts((list) => [p, ...list]))} /> : null}

      {mode === "feed" ? (
        <div className="flex items-center gap-1 pt-1" role="tablist" aria-label="Sort posts" data-feed-sort="">
          {(["latest", "popular"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={sort === s}
              onClick={() => changeSort(s)}
              className={`h-10 rounded-full px-3.5 text-[14px] font-medium transition-colors sm:h-9 ${sort === s ? "bg-[#e9ebee] text-[#1a1a2e]" : "text-[#6b7280] hover:text-[#1a1a2e]"}`}
            >
              {s === "latest" ? "Latest" : "Popular"}
            </button>
          ))}
        </div>
      ) : null}

      <div className={`space-y-3 transition-opacity ${loading === "sort" ? "opacity-50" : ""}`} data-feed-list="">
        {all.map((p) => (
          <PostCard key={p.id} post={p} slug={slug} viewer={viewer} update={update} readOnly={readOnly} />
        ))}
      </div>

      {all.length === 0 && loading !== "sort" ? (
        <div className={`${CARD} px-6 py-12 text-center`} data-feed-empty="">
          <p className="text-[16px] font-semibold text-[#1a1a2e]">{mode === "saved" ? "Nothing saved yet." : "No posts yet."}</p>
          <p className="mt-1 text-[14px] text-[#6b7280]">{emptyText ?? (mode === "saved" ? "Save a post with the bookmark and it waits here." : "Start the conversation.")}</p>
        </div>
      ) : null}

      <div ref={sentinel} aria-hidden className="h-px" />
      {cursor ? (
        <div className="flex justify-center pb-4 pt-1">
          <button type="button" onClick={loadMore} disabled={loading === "more"} className={BTN_SECONDARY} data-feed-more="">
            {loading === "more" ? "Loading..." : failed ? "Try again" : "Show more posts"}
          </button>
        </div>
      ) : all.length > 4 ? (
        <p className="pb-6 pt-2 text-center text-[13px] text-[#9ca3af]">You are all caught up.</p>
      ) : null}
    </div>
  )
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
