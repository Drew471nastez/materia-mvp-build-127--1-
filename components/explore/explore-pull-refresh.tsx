"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { PULL_REFRESH_EVENT, RouterPullToRefresh, type PullRefreshDetail } from "@/components/ui/pull-to-refresh"
import { EXPLORE_REFRESH_SCOPE } from "@/lib/explore/refresh-scope"

/** Keeps Explore's pull-to-refresh in sync: scroll home and let client lists follow router.refresh. */
function ExplorePullSync() {
  const router = useRouter()
  useEffect(() => {
    const onPull = (event: Event) => {
      const detail = (event as CustomEvent<PullRefreshDetail>).detail
      if (!detail || detail.scope !== EXPLORE_REFRESH_SCOPE) return
      const prior = detail.done
      detail.done = Promise.all([
        Promise.resolve(prior),
        new Promise<void>((resolve) => {
          if (window.scrollY > 4) window.scrollTo({ top: 0, behavior: "smooth" })
          router.refresh()
          window.setTimeout(resolve, 120)
        }),
      ])
    }
    window.addEventListener(PULL_REFRESH_EVENT, onPull)
    return () => window.removeEventListener(PULL_REFRESH_EVENT, onPull)
  }, [router])
  return null
}

/** Pull at the top refreshes Explore the same way as the community feed (router.refresh + haptics). */
export function ExplorePullRefresh({ children }: { children: ReactNode }) {
  return (
    <RouterPullToRefresh scope={EXPLORE_REFRESH_SCOPE} className="min-h-screen" spinnerYOffset={6}>
      <ExplorePullSync />
      {children}
    </RouterPullToRefresh>
  )
}
