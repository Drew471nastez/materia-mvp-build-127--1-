"use client"

import type { ReactNode } from "react"
import { RouterPullToRefresh } from "@/components/ui/pull-to-refresh"
import { LIBRARY_REFRESH_SCOPE } from "@/lib/library/refresh-scope"

/** Pull at the top refreshes the library tab the same way as the community feed (router.refresh + haptics). */
export function LibraryPullRefresh({ children }: { children: ReactNode }) {
  return (
    <RouterPullToRefresh scope={LIBRARY_REFRESH_SCOPE}>
      {children}
    </RouterPullToRefresh>
  )
}
