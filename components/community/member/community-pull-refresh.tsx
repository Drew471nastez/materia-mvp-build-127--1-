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
import { sectionFromPath } from "./nav"

/** Router refresh scopes for tab roots; null means no pull on this path. */
export function communityPullRouterScope(pathname: string | null, slug: string): string | null {
  const base = `/community/${slug}`
  const path = (pathname || "").split(/[?#]/)[0].replace(/\/+$/, "")
  if (!path.startsWith(base)) return null
  const tail = path.slice(base.length) || "/"
  if (tail === "/members") return COMMUNITY_MEMBERS_REFRESH_SCOPE
  if (tail === "/learn") return COMMUNITY_LEARN_REFRESH_SCOPE
  if (tail === "/events") return COMMUNITY_EVENTS_REFRESH_SCOPE
  if (tail === "/leaderboard") return COMMUNITY_LEADERBOARD_REFRESH_SCOPE
  if (tail === "/about") return COMMUNITY_ABOUT_REFRESH_SCOPE
  return null
}

/** Community home only; a space's feed keeps its own wrapper (chat spaces have no feed pull). */
export function communityPullUsesFeed(pathname: string | null, slug: string): boolean {
  const path = (pathname || "").split(/[?#]/)[0]
  /* A post is its own page. A pull there translates the post and snaps, which reads as a scroll glitch. */
  if (/\/post\//.test(path)) return false
  return sectionFromPath(pathname, slug) === "home"
}

export function CommunityPullRefresh({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const feed = communityPullUsesFeed(pathname, slug)
  const scope = feed ? COMMUNITY_FEED_REFRESH_SCOPE : communityPullRouterScope(pathname, slug)

  useEffect(() => {
    cancelAllPullToRefresh()
  }, [pathname, scope])

  if (feed) {
    return <PullToRefreshEvent key={`feed-${slug}`} scope={COMMUNITY_FEED_REFRESH_SCOPE}>{children}</PullToRefreshEvent>
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
