"use client"

/**
 * When the buyer tab bar's community context is set, /account shows the same
 * CommunityTopBar as the feed — not Storelib's header with a community title.
 *
 * Mounted from the root layout, so it is already alive when the tab bar
 * opens the profile. The bar is the copy remembered in the community
 * (community-chrome-cache), read during render, not after a fetch. A cold
 * start with no copy yet keeps a white bar of the same height (the boot
 * script) until the read returns.
 */
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { CommunityTopBar } from "@/components/community/member/top-bar"
import type { TopBarData } from "@/components/community/member/view-types"
import { endCommunityContext, useCommunityContextMeta } from "@/lib/nav/community-context"
import {
  accountChromeReady,
  publishAccountChrome,
  readCommunityChrome,
  rememberCommunityChrome,
  subscribeAccountChrome,
} from "@/lib/nav/community-chrome-cache"
import { showsProfileHeader } from "@/lib/profile/owner-pills"

function clearPending() {
  document.documentElement.removeAttribute("data-account-community-pending")
}

const noop = () => () => {}

/** False while React hydrates (the server's snapshot of the community context is empty), true after. */
function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false)
}

export function AccountCommunityChrome() {
  const pathname = usePathname()
  const ctx = useCommunityContextMeta()
  const active = !!ctx.slug && showsProfileHeader(pathname)
  const cached = active && ctx.slug ? readCommunityChrome(ctx.slug) : null
  const [fresh, setFresh] = useState<TopBarData | null>(null)
  /* Only on the profile's own pages. Mounted at the root, a bar kept from an
     earlier visit drew on the feed (a second header) and on the library (an
     empty band, hidden under Storelib's fixed header but still taking room). */
  const topBar = !active ? null : fresh && ctx.slug && fresh.community.slug === ctx.slug ? fresh : cached
  const hydrated = useHydrated()

  /*
    THE WHITE BAR THAT WAITS FOR THE COMMUNITY'S, LET GO EVERY TIME IT SHOULD BE.
    - Not before hydration: the first render reads the server's empty community context, and clearing then showed
      Storelib's header for a frame on every full load of /account in a community, before the community's bar
      replaced it.
    - On every route change (pathname): Profile pressed and another tab pressed before /account arrived left the
      flag on, and the next page drew with Storelib's header hidden.
  */
  useLayoutEffect(() => {
    if (!active || !ctx.slug) {
      if (!hydrated) return
      publishAccountChrome(null, null)
      clearPending()
      return
    }
    if (topBar) {
      publishAccountChrome(ctx.slug, topBar)
      clearPending()
    }
  }, [active, ctx.slug, topBar, hydrated, pathname])

  useEffect(() => {
    if (!active || !ctx.slug) return
    let live = true
    const slug = ctx.slug
    void fetch(`/api/community/by-slug/${encodeURIComponent(slug)}/member-chrome`, { credentials: "same-origin" })
      .then((r) => {
        /* Not a member any more (left, removed, the community gone): the profile is Storelib's, and the context ends. */
        if (r.status === 404 || r.status === 403) {
          if (live) endCommunityContext()
          return null
        }
        return r.ok ? r.json() : null
      })
      .then((json: { topBar?: TopBarData } | null) => {
        if (!live) return
        /* No bar to draw: the white band waiting for one goes, or it would stay for good. */
        if (!json?.topBar) {
          if (!readCommunityChrome(slug)) clearPending()
          return
        }
        rememberCommunityChrome(slug, json.topBar)
        setFresh(json.topBar)
        publishAccountChrome(slug, json.topBar)
        clearPending()
      })
      .catch(() => {
        if (live && !readCommunityChrome(slug)) clearPending()
      })
    return () => {
      live = false
    }
  }, [active, ctx.slug])

  if (!topBar) return null

  /*
    Above the page, in normal flow, so the cover starts under it. Sticky,
    same as inside a community. No native-header-spacer: that is only for
    the fixed Storelib header and leaves a blank band here.
  */
  return (
    <div className="sticky top-0 z-40 w-full" data-account-community-chrome="">
      <CommunityTopBar data={topBar} wide />
    </div>
  )
}

/** True once the community bar is actually drawn, so Storelib's header can leave without a gap. */
export function useAccountCommunityChromeActive(): boolean {
  const pathname = usePathname()
  const ctx = useCommunityContextMeta()
  const slug = !!ctx.slug && showsProfileHeader(pathname) ? ctx.slug : null
  return useSyncExternalStore(subscribeAccountChrome, () => accountChromeReady(slug), () => false)
}
