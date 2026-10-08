"use client"

/**
 * Pull to refresh on the main community tabs (Community, Learn, Calendar,
 * Members, Leaderboards, About): one wrapper in the member frame so every
 * place feels the same as the feed, without nesting on pages that bring
 * their own (Membership).
 */
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"
import { PullToRefreshEvent, PULL_REFRESH_EVENT, RouterPullToRefresh, type PullRefreshDetail } from "@/components/ui/pull-to-refresh"
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

export function CommunityPullRefresh({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const feed = communityPullUsesFeed(pathname, slug)
  const scope = feed ? COMMUNITY_FEED_REFRESH_SCOPE : communityPullRouterScope(pathname, slug)

  useEffect(() => {
    cancelAllPullToRefresh()
  }, [pathname, scope])

  if (feed) {
    /* One spinner: nested feed pages must not wrap again (space/[space]/page.tsx). Round 17: its circle a few pixels higher in the gap (-2, was 4). */
    return (
      <PullToRefreshEvent key={`feed-${slug}`} scope={COMMUNITY_FEED_REFRESH_SCOPE} spinnerYOffset={-2}>
        {children}
      </PullToRefreshEvent>
    )
  }
  if (!scope) return children
  return <RouterPullToRefresh key={`${scope}-${slug}`} scope={scope}>{children}</RouterPullToRefresh>
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
