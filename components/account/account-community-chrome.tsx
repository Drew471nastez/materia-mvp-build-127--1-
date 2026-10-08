"use client"

/**
 * When the buyer tab bar's community context is set, /account shows the same
 * CommunityTopBar as the feed — not Storelib's header with a community title.
 */
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { CommunityTopBar } from "@/components/community/member/top-bar"
import type { TopBarData } from "@/components/community/member/view-types"
import { useCommunityContextMeta } from "@/lib/nav/community-context"
import { showsProfileHeader } from "@/lib/profile/owner-pills"

let cache: { slug: string; data: TopBarData; at: number } | null = null
const CACHE_MS = 60_000

export function AccountCommunityChrome() {
  const pathname = usePathname()
  const ctx = useCommunityContextMeta()
  const active = !!ctx.slug && showsProfileHeader(pathname)
  const [topBar, setTopBar] = useState<TopBarData | null>(() => {
    if (!active || !ctx.slug || !cache || cache.slug !== ctx.slug || Date.now() - cache.at > CACHE_MS) return null
    return cache.data
  })

  useEffect(() => {
    if (!active || !ctx.slug) {
      setTopBar(null)
      return
    }
    if (cache && cache.slug === ctx.slug && Date.now() - cache.at < CACHE_MS) {
      setTopBar(cache.data)
      return
    }
    let live = true
    void fetch(`/api/community/by-slug/${encodeURIComponent(ctx.slug)}/member-chrome`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { topBar?: TopBarData } | null) => {
        if (!live || !json?.topBar) return
        cache = { slug: ctx.slug!, data: json.topBar, at: Date.now() }
        setTopBar(json.topBar)
      })
      .catch(() => {})
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

/** Hide Storelib's header when the community bar is shown instead. */
export function useAccountCommunityChromeActive(): boolean {
  const pathname = usePathname()
  const ctx = useCommunityContextMeta()
  return !!ctx.slug && showsProfileHeader(pathname)
}
