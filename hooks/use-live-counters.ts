import useSWR from "swr"

interface LiveCounters {
  totals: {
    total_views: number
    unique_views: number
    total_orders: number
    total_revenue: number
  }
  daily: Array<{
    rollup_date: string
    total_views: number
    unique_views: number
    total_orders: number
    total_revenue: number
    is_live?: boolean
  }>
  today: {
    total_views: number
    unique_views: number
    total_orders: number
    total_revenue: number
    is_live: true
  }
  range: { start: string; end: string }
}

/**
 * SWR hook for live analytics counters.
 * Merges historical rollups with today's real-time data.
 * Refreshes every 30 seconds for near-realtime dashboard updates.
 */
export function useLiveCounters(start: string, end: string, productId?: string | null) {
  const params = new URLSearchParams({ start, end })
  if (productId) params.set("product_id", productId)

  return useSWR<LiveCounters>(
    `live-counters:${params.toString()}`,
    async () => {
      const res = await fetch(`/api/analytics/live-counters?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch live counters")
      return res.json()
    },
    {
      refreshInterval: 30_000, // Refresh every 30s
      dedupingInterval: 10_000,
      revalidateOnFocus: true,
    },
  )
}
