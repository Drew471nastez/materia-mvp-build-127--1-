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
import { placeKey, type Place } from "@/lib/communities/client/places"
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
export function CommunityPullRefresh(props: { slug: string; children: React.ReactNode } | { slug: string; /** A chat space: its list scrolls the other way and has no pull. */ off?: boolean; /** The place in the middle (round 15: places are drawn by the shell, not by the router). */ place: Place; /** navigator.refresh: patches the place in where it is. */ onRefresh: (place: Place) => Promise<void>; children: React.ReactNode }) {
  /* A visitor's frame (public-frame.tsx) has no navigator: its pages are still the router's. */
  if (!("place" in props)) return <RouterPullRefresh slug={props.slug}>{props.children}</RouterPullRefresh>
  return <PlacePullRefresh {...props} />
}

function PlacePullRefresh({ slug, place, off = false, onRefresh: refreshPlace, children }: { slug: string; off?: boolean; place: Place; onRefresh: (place: Place) => Promise<void>; children: React.ReactNode }) {
  /*
    ROUND 15: THE PULL PATCHES THE PLACE, IT DOES NOT ASK THE ROUTER. A place is drawn from data by the shell now, so a pull
    calls navigator.refresh(place): the feed's own refresh (it merges its lists in place), the members' and the leaderboard's
    lists (their own listeners), or the place read again from its loader. router.refresh() is gone from here: it drew the
    page the router last loaded, not the place on screen, and a failed one is a whole page load (lib/communities/client/
    resume.ts). Off where the place brings its own pull or has none: a chat space, Membership, a lesson.
  */
  const disabled = off || place.kind === "membership" || place.kind === "program"
  const key = placeKey(place)
  useEffect(() => {
    cancelAllPullToRefresh()
  }, [key])
  const now = useRef({ place, refreshPlace })
  now.current = { place, refreshPlace }
  const onRefresh = useCallback(() => now.current.refreshPlace(now.current.place), [])
  return (
    <PullToRefresh key={slug} onRefresh={onRefresh} disabled={disabled} spinnerYOffset={place.kind === "feed" || place.kind === "space" || place.kind === "saved" ? -2 : 0}>
      {children}
    </PullToRefresh>
  )
}

/** The pull as it was before round 15, for the visitor's frame: the address says what a pull does there. */
function RouterPullRefresh({ slug, children }: { slug: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const feed = communityPullUsesFeed(pathname, slug)
  const scope = feed ? COMMUNITY_FEED_REFRESH_SCOPE : communityPullRouterScope(pathname, slug)
  useEffect(() => {
    cancelAllPullToRefresh()
  }, [pathname, scope])
  const now = useRef({ feed, scope })
  now.current = { feed, scope }
  const onRefresh = useCallback(() => {
    const { feed: onFeed, scope: here } = now.current
    if (onFeed) return dispatchPullRefresh(COMMUNITY_FEED_REFRESH_SCOPE)
    if (here) return refreshRouterScope(router, here)
  }, [router])
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
