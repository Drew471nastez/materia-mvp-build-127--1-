"use client"

import type { ReactNode } from "react"
import { RouterPullToRefresh } from "@/components/ui/pull-to-refresh"
import { EXPLORE_REFRESH_SCOPE } from "@/lib/explore/refresh-scope"

/** Pull at the top refreshes Explore the same way as the community feed (router.refresh + haptics). */
export function ExplorePullRefresh({ children }: { children: ReactNode }) {
  return (
    <RouterPullToRefresh scope={EXPLORE_REFRESH_SCOPE}>
      {children}
    </RouterPullToRefresh>
  )
}
