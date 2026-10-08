"use client"

/**
 * When the buyer tab bar's community context is set, /account shows the same
 * CommunityTopBar as the feed — not Storelib's header with a community title.
 *
 * The bar is remembered while you are in the community (community-chrome-cache),
 * so landing on the profile paints it with the page. A cold start with no
 * copy yet keeps a white bar of the same height (the boot script) until the
 * read returns, instead of a blank gap or the Storelib header popping in late.
 */
import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { CommunityTopBar } from "@/components/community/member/top-bar"
import type { TopBarData } from "@/components/community/member/view-types"
import { useCommunityContextMeta } from "@/lib/nav/community-context"
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

export function AccountCommunityChrome() {
  const pathname = usePathname()
  const ctx = useCommunityContextMeta()
  const active = !!ctx.slug && showsProfileHeader(pathname)
  const [topBar, setTopBar] = useState<TopBarData | null>(null)

  useLayoutEffect(() => {
    if (!active || !ctx.slug) {
      setTopBar(null)
      publishAccountChrome(null, null)
      clearPending()
      return
    }
    const cached = readCommunityChrome(ctx.slug)
    if (!cached) return
    setTopBar(cached)
    publishAccountChrome(ctx.slug, cached)
  }, [active, ctx.slug])

  useLayoutEffect(() => {
    if (topBar) clearPending()
  }, [topBar])

  useEffect(() => {
    if (!active || !ctx.slug) return
    let live = true
    void fetch(`/api/community/by-slug/${encodeURIComponent(ctx.slug)}/member-chrome`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { topBar?: TopBarData } | null) => {
        if (!live || !json?.topBar || !ctx.slug) return
        rememberCommunityChrome(ctx.slug, json.topBar)
        setTopBar(json.topBar)
        publishAccountChrome(ctx.slug, json.topBar)
        clearPending()
      })
      .catch(() => {
        if (live) clearPending()
      })
    return () => {
      live = false
    }
  }, [active, ctx.slug])

  if (!active || !topBar) return null

  /*
    The community bar is sticky and in the document flow, same as inside a
    community (shell-frame.tsx). Do not add native-header-spacer here: that
    block is only for the fixed Storelib header in the app and would leave a
    blank band between the bar and the profile cover.
  */
  return (
    <div className="w-full" data-account-community-chrome="">
      <CommunityTopBar data={topBar} wide />
    </div>
  )
}

/** True once the community bar is actually drawn, so Storelib's header can leave without a gap. */
export function useAccountCommunityChromeActive(): boolean {
  const pathname = usePathname()
  const ctx = useCommunityContextMeta()
  const slug = !!ctx.slug && showsProfileHeader(pathname) ? ctx.slug : null
  const ready = useSyncExternalStore(subscribeAccountChrome, () => accountChromeReady(slug), () => false)
  return ready
}
