"use client"

/**
 * Pull to refresh on the main community tabs (Community, Learn, Calendar,
 * Members, Leaderboards, About): one wrapper in the member frame so every
 * place feels the same as the feed, without nesting on pages that bring
 * their own (Membership).
 */
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"
import { PullToRefresh, PULL_REFRESH_EVENT, dispatchPullRefresh, refreshRouterScope, type PullRefreshDetail } from "@/components/ui/pull-to-refresh"
import { cancelAllPullToRefresh } from "@/hooks/use-pull-to-refresh"
import {
  COMMUNITY_ABOUT_REFRESH_SCOPE,
  COMMUNITY_EVENTS_REFRESH_SCOPE,
  COMMUNITY_FEED_REFRESH_SCOPE,
  COMMUNITY_LEADERBOARD_REFRESH_SCOPE,
  COMMUNITY_LEARN_REFRESH_SCOPE,
  COMMUNITY_MEMBERS_REFRESH_SCOPE,
} from "@/lib/communities/refresh-scope"

/** The path under /community/<slug>, or null when this address is another community. "/" is the home feed. */
function communityTail(pathname: string | null, slug: string): string | null {
  const base = `/community/${slug}`
  const path = (pathname || "").split(/[?#]/)[0].replace(/\/+$/, "")
  if (!path.startsWith(base)) return null
  const rest = path.slice(base.length)
  return rest || "/"
}

/** Router refresh scopes for the section pages; null means this path is not one of them. */
export function communityPullRouterScope(pathname: string | null, slug: string): string | null {
  const tail = communityTail(pathname, slug)
  if (!tail || tail === "/") return null
  /* A post is its own page. A pull there moves the post and snaps. A space and Membership bring their own pull. */
  if (tail.startsWith("/post/") || tail.startsWith("/space/") || tail === "/membership" || tail.startsWith("/membership/")) return null
  if (tail === "/members" || tail.startsWith("/members/")) return COMMUNITY_MEMBERS_REFRESH_SCOPE
  if (tail === "/learn" || tail.startsWith("/learn/") || tail === "/classroom" || tail.startsWith("/classroom/")) return COMMUNITY_LEARN_REFRESH_SCOPE
  if (tail === "/events" || tail.startsWith("/events/")) return COMMUNITY_EVENTS_REFRESH_SCOPE
  if (tail === "/leaderboard" || tail.startsWith("/leaderboard/")) return COMMUNITY_LEADERBOARD_REFRESH_SCOPE
  if (tail === "/about" || tail.startsWith("/about/")) return COMMUNITY_ABOUT_REFRESH_SCOPE
  if (tail === "/notifications" || tail.startsWith("/notifications/")) return "community-notifications"
  return null
}

/** The home feed and Saved. A space's page brings its own wrapper, so this does not wrap it again. */
export function communityPullUsesFeed(pathname: string | null, slug: string): boolean {
  const tail = communityTail(pathname, slug)
  return tail === "/" || tail === "/saved"
}

/*
  ONE WRAPPER, THE SAME AT EVERY ADDRESS. This used to be a different element per address: the feed's event wrapper on the
  home feed, a router wrapper (keyed by its scope) on a section, and no wrapper at all on a post or a space. A post opened over
  the feed puts its own address up (/community/<slug>/post/<id>, lightbox.tsx useHistoryLayer), and the router hears that
  address; the wrapper around the feed then went away, and React took the whole page under it down with it and drew it again:
  the feed was built again from nothing, the card the post had grown from was a new card, and the opened post, which lives in
  that card, was gone (measured in scripts/check-community-posts.mjs: the post screen vanished about 900ms after the tap at 4x
  CPU, with no close and no Back). A space chip on a computer (/space/<slug> by pushState) rebuilt the feed the same way, and so
  did every move between two sections. Now the wrapper is one element for the whole community, never keyed by address: the
  address only says what a pull does there, and where there is none (a post, a space, Membership) the pull is turned off and
  the page under it is left exactly as it is.
*/
export function CommunityPullRefresh({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const feed = communityPullUsesFeed(pathname, slug)
  const scope = feed ? COMMUNITY_FEED_REFRESH_SCOPE : communityPullRouterScope(pathname, slug)

  useEffect(() => {
    cancelAllPullToRefresh()
  }, [pathname, scope])

  /* Read when the pull is let go, so the handler stays the same function while the address moves. */
  const now = useRef({ feed, scope })
  now.current = { feed, scope }
  const onRefresh = useCallback(() => {
    const { feed: onFeed, scope: here } = now.current
    if (onFeed) return dispatchPullRefresh(COMMUNITY_FEED_REFRESH_SCOPE)
    if (here) return refreshRouterScope(router, here)
  }, [router])

  /* Round 17: on the feed the circle sits a few pixels higher in the gap (-2, was 4). A space's own page brings its own pull (space/[space]/page.tsx); this one is off there, so its ring is the only one. */
  return (
    <PullToRefresh key={slug} onRefresh={onRefresh} disabled={!scope} spinnerYOffset={feed ? -2 : 0}>
      {children}
    </PullToRefresh>
  )
}

/** A client list on a tab page: run `refresh` when that tab is pulled (after router.refresh). */
export function useCommunityPullListener(scope: string, refresh: () => Promise<void>) {
  const run = useRef(refresh)
  run.current = refresh
  const stable = useCallback(() => run.current(), [])
  useEffect(() => {
    const on = (e: Event) => {
      const detail = (e as CustomEvent<PullRefreshDetail>).detail
      if (!detail || detail.scope !== scope) return
      detail.done = stable()
    }
    window.addEventListener(PULL_REFRESH_EVENT, on)
    return () => window.removeEventListener(PULL_REFRESH_EVENT, on)
  }, [scope, stable])
}
