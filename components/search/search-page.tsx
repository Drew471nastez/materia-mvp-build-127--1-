"use client"

/**
 * /explore/search: the search screen at an address of its own, for a link, a
 * reload, or a computer, where the phone's tab bar (and the screen it opens
 * over the page) is not drawn. The same screen as the tab bar's
 * (components/search/search-screen.tsx), so there is one search and not two.
 *
 * On a phone it covers the header and the bar, as the tab bar's does; from
 * 768px it sits in the page under the header. The X goes back where you came
 * from on this site, or to Explore when there is nowhere of ours behind it.
 * It carries Explore's search anchor, so the header does not grow a second
 * field on a computer while this one is on screen (lib/explore/use-search-
 * handoff).
 */

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

import { SearchScreen } from "@/components/search/search-screen"
import { startNavigationLoading } from "@/components/app/navigation-loading-bar"
import { SEARCH_ANCHOR_ATTR } from "@/lib/explore/use-search-handoff"
import { canReturnInApp } from "@/lib/navigation/in-app-history"

export function SearchPage() {
  const router = useRouter()
  const params = useSearchParams()
  const q = params?.get("q") ?? ""
  const close = useCallback(() => {
    if (canReturnInApp()) router.back()
    else router.replace("/explore")
  }, [router])
  const navigate = useCallback(
    (href: string) => {
      startNavigationLoading(href)
      router.push(href)
    },
    [router],
  )
  return (
    <div
      data-search-page=""
      {...{ [SEARCH_ANCHOR_ATTR]: "" }}
      className="fixed inset-0 z-[70] bg-white md:static md:z-auto md:min-h-[70svh] md:pb-12 md:pt-4"
    >
      <SearchScreen autoFocus initialQuery={q} onClose={close} onNavigate={navigate} />
    </div>
  )
}
