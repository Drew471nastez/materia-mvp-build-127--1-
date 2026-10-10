/**
 * ===========================================================================
 *  THE FEED'S CLIENT CACHE: ONE LIST PER SPACE AND SORT, KEPT FOR THE VISIT
 * ===========================================================================
 * Round 7: "switching spaces must be instant and smooth: no skeleton flash
 * for cached content, keep the previous list on screen and swap when data
 * arrives, prefetch on hover, a client side data cache per space/sort".
 *
 * A module, not React state, so a list outlives the component that drew it:
 * going into a post and back, or from Members back to the feed, finds the
 * spaces already read. Each entry is the list as the member last saw it
 * (every page loaded, every like and save), its cursor for the next page and
 * when it was read. A view read under FRESH_MS ago is shown and left alone;
 * an older one is shown at once and asked for again quietly (feed.tsx).
 *
 * One request per view at a time: a hover, a press and the click that
 * follows share the same promise. At most MAX_VIEWS lists are kept; the one
 * read longest ago goes first. Browser safe, no server code.
 */
import type { FeedPostView } from "@/lib/communities/types"
import { api, apiBase } from "./api"

/** The sort menu's four orders (lib/communities/server/feed.ts FeedOrder). */
export type FeedSortValue = "default" | "new" | "top" | "unread"
export const SORTS: readonly FeedSortValue[] = ["default", "new", "top", "unread"]

/** Which list: the whole community, one space (by its id), or the member's saved posts. */
export type FeedTarget = { kind: "all" } | { kind: "space"; id: string } | { kind: "saved" }

export interface FeedPageData {
  pinned: FeedPostView[]
  posts: FeedPostView[]
  nextCursor: string | null
}

export interface CachedView {
  /** Pinned first (Default only), then the rest, as drawn. */
  posts: FeedPostView[]
  cursor: string | null
  /** When it was read from the server (ms). */
  at: number
  /** How many pages have been read into it. */
  pages: number
}

/** Under this a cached view is fresh enough to show and leave alone. */
export const FRESH_MS = 60_000
/** Lists kept at most, across communities. */
export const MAX_VIEWS = 24

const views = new Map<string, CachedView>()
const pending = new Map<string, Promise<CachedView | null>>()
const listeners = new Set<() => void>()

/** The feed draws a space the moment it is written, without waiting for another render of its own. */
export function subscribeViews(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notifyViews() {
  for (const fn of listeners) fn()
}

export function viewKey(communityId: string, target: FeedTarget, sort: FeedSortValue): string {
  const where = target.kind === "space" ? `space:${target.id}` : target.kind
  /* Saved has one order (newest saved first): the sort is not part of its key. */
  return `${communityId}|${where}|${target.kind === "saved" ? "-" : sort}`
}

/** The address of the first (or a following) page of a view: the routes the feed already used. */
export function viewUrl(communityId: string, target: FeedTarget, sort: FeedSortValue, cursor: string | null = null): string {
  const q = new URLSearchParams()
  if (target.kind === "saved") {
    if (cursor) q.set("cursor", cursor)
    const s = q.toString()
    return `${apiBase(communityId)}/bookmarks${s ? `?${s}` : ""}`
  }
  q.set("sort", sort)
  if (cursor) q.set("cursor", cursor)
  if (target.kind === "space") q.set("space", target.id)
  return `${apiBase(communityId)}/posts?${q}`
}

export function readView(key: string): CachedView | undefined {
  return views.get(key)
}

export function writeView(key: string, view: CachedView) {
  views.delete(key)
  views.set(key, view)
  while (views.size > MAX_VIEWS) {
    const oldest = views.keys().next().value
    if (oldest === undefined) break
    views.delete(oldest)
  }
  notifyViews()
}

/** A first page as the list draws it: pinned first, each post once. */
export function firstPage(page: FeedPageData, at = Date.now()): CachedView {
  const seen = new Set<string>()
  const posts = [...(page.pinned ?? []), ...(page.posts ?? [])].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
  return { posts, cursor: page.nextCursor ?? null, at, pages: 1 }
}

/** A read that has not answered by then is given up, so a stuck request cannot hold the spinner. */
const LOAD_GIVE_UP_MS = 4_000

/**
 * The first page of a view from the server, into the cache. A view already
 * on its way is not asked for twice; the answer is null when it failed (the
 * cache keeps what it had). A request that never answers is aborted, and the
 * next ask starts a new one.
 */
export function loadView(communityId: string, target: FeedTarget, sort: FeedSortValue): Promise<CachedView | null> {
  const key = viewKey(communityId, target, sort)
  const going = pending.get(key)
  if (going) return going
  const run = (async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), LOAD_GIVE_UP_MS)
    try {
      const r = await api<FeedPageData>(viewUrl(communityId, target, sort), { signal: ctrl.signal })
      if (!r.ok) return null
      const view = firstPage({ pinned: r.data.pinned ?? [], posts: r.data.posts ?? [], nextCursor: r.data.nextCursor ?? null })
      writeView(key, view)
      return view
    } finally {
      clearTimeout(timer)
    }
  })()
  void run.finally(() => {
    if (pending.get(key) === run) pending.delete(key)
  })
  pending.set(key, run)
  return run
}

/** Read a view ahead (a pointer resting on its chip, a finger landing on it), unless it is cached and fresh or already coming. */
export function prefetchView(communityId: string, target: FeedTarget, sort: FeedSortValue, now = Date.now()) {
  const key = viewKey(communityId, target, sort)
  const have = views.get(key)
  if (pending.has(key) || (have && now - have.at < FRESH_MS)) return
  void loadView(communityId, target, sort)
}

/** Spaces read ahead at most, on one visit to a feed (a community with dozens of spaces does not ask for all of them). */
export const AHEAD_MAX = 12
/** How many of those reads run together. One at a time left the later spaces cold for many seconds. */
export const AHEAD_AT_ONCE = 4

/**
 * THE FIRST PAGE OF EVERY SPACE, READ AHEAD (round 9). A few at a time, not
 * in one long queue: a chip pressed while its space is still waiting on the
 * ones before it sat on the spinner. Each is skipped when it is cached and
 * fresh or already on its way; `stop` ends the run (the feed went away).
 * Resolves with how many were asked for.
 */
export async function prefetchViews(communityId: string, targets: FeedTarget[], sort: FeedSortValue, stopped: () => boolean = () => false): Promise<number> {
  const queue = targets.slice(0, AHEAD_MAX)
  let asked = 0
  let i = 0
  const worker = async () => {
    while (true) {
      if (stopped()) return
      const index = i++
      if (index >= queue.length) return
      const target = queue[index]
      const key = viewKey(communityId, target, sort)
      const have = views.get(key)
      if (pending.has(key) || (have && Date.now() - have.at < FRESH_MS)) continue
      asked++
      await loadView(communityId, target, sort)
    }
  }
  const n = Math.min(AHEAD_AT_ONCE, queue.length)
  await Promise.all(Array.from({ length: n }, () => worker()))
  return asked
}

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }

/** Run once the page is idle (after a moment where a browser has no idle callback); the returned function cancels it. */
export function whenIdle(run: () => void, timeout = 2000): () => void {
  const w = window as IdleWindow
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(run, { timeout })
    return () => w.cancelIdleCallback?.(id)
  }
  const t = window.setTimeout(run, 600)
  return () => window.clearTimeout(t)
}

/**
 * A change to one post (a like, a save, an edit, a delete) made in one list,
 * carried into every other cached list that holds the same post, so a
 * space switched back to never shows the old state. A save or unsave drops
 * the cached Saved list, which is read again when it is next opened.
 */
export function patchPost(communityId: string, id: string, fn: (p: FeedPostView) => FeedPostView | null, skipKey?: string) {
  for (const [key, view] of views) {
    if (!key.startsWith(`${communityId}|`) || key === skipKey) continue
    if (!view.posts.some((p) => p.id === id)) continue
    const before = view.posts.find((p) => p.id === id)
    const posts = view.posts.flatMap((p) => {
      if (p.id !== id) return [p]
      const next = fn(p)
      return next ? [next] : []
    })
    const after = posts.find((p) => p.id === id)
    if (key.endsWith("|saved|-") && after && !after.bookmarked) {
      views.set(key, { ...view, posts: posts.filter((p) => p.id !== id) })
      continue
    }
    views.set(key, { ...view, posts })
    if (before && after && before.bookmarked !== after.bookmarked) dropSaved(communityId)
  }
}

/** The cached Saved list, to be read again next time (a post was saved or unsaved somewhere else). */
export function dropSaved(communityId: string) {
  views.delete(`${communityId}|saved|-`)
}

/**
 * A post the member just wrote: at the top of the lists it belongs in (All
 * and its space) in Default and New, where the newest comes first. In Top
 * and Unread its place is the server's to say, so those lists are dropped
 * and read again when next opened.
 */
export function addPost(communityId: string, post: FeedPostView) {
  const homes = new Set([`${communityId}|all|`, post.space ? `${communityId}|space:${post.space.id}|` : ""].filter(Boolean))
  for (const [key, view] of [...views]) {
    const home = key.slice(0, key.lastIndexOf("|") + 1)
    if (!homes.has(home)) continue
    const sort = key.slice(home.length)
    if (sort === "default" || sort === "new") {
      if (view.posts.some((p) => p.id === post.id)) continue
      /* Below the pinned posts in Default, which lead the list. */
      const at = sort === "default" ? view.posts.filter((p) => p.pinned).length : 0
      views.set(key, { ...view, posts: [...view.posts.slice(0, at), post, ...view.posts.slice(at)] })
    } else views.delete(key)
  }
}

/**
 * A list read again, merged into the copy on screen (feed.tsx QUIET): the posts on screen keep their order and take the
 * fresh copy's facts; the cursor and the pages already read are kept. `added` is what the fresh copy has that the screen
 * does not (pinned posts aside), newest first, for FeedLive to bring in.
 */
export function mergeQuiet(current: CachedView, fresh: CachedView): { view: CachedView; added: FeedPostView[]; changed: number } {
  const byId = new Map(fresh.posts.map((p) => [p.id, p]))
  const have = new Set(current.posts.map((p) => p.id))
  let changed = 0
  /*
    THE SAME FACTS, THE SAME OBJECT (round 15). A post the server says nothing new about keeps the very object on screen, so its
    card (memoised on the post, post-card.tsx) is not drawn again at all and its pictures are never touched: a refresh costs
    only the cards whose counts or words moved.
  */
  const posts = current.posts.map((p) => {
    const next = byId.get(p.id)
    if (!next || samePost(p, next)) return p
    changed++
    return next
  })
  const added = fresh.posts.filter((p) => !have.has(p.id) && !p.pinned)
  return { view: { ...current, posts: changed ? posts : current.posts, at: fresh.at }, added, changed }
}

/** Whether two copies of a post say the same thing (the server's JSON, so key order is the same). */
export function samePost(a: FeedPostView, b: FeedPostView): boolean {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/** For tests and probes: forget everything. */
export function clearViews() {
  views.clear()
  pending.clear()
}
