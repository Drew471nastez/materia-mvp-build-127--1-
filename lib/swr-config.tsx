"use client"

import { SWRConfig } from "swr"
import type { ReactNode } from "react"

/**
 * Global SWR configuration provider.
 * Wraps the app to provide default caching behaviour:
 * - Stale-while-revalidate with 30s dedup interval
 * - Revalidate on window focus (default)
 * - No retry on 4xx errors
 */
export function SWRProvider({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        dedupingInterval: 30_000,
        revalidateOnFocus: true,
        revalidateIfStale: true,
        errorRetryCount: 2,
        shouldRetryOnError: (err: unknown) => {
          // Don't retry on 4xx client errors
          if (err && typeof err === "object" && "status" in err) {
            const status = (err as { status: number }).status
            if (status >= 400 && status < 500) return false
          }
          return true
        },
      }}
    >
      {children}
    </SWRConfig>
  )
}
