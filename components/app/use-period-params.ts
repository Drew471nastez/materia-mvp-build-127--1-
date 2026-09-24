"use client"

/**
 * The period a page shows, kept in its address:
 *
 *   ?range=<preset>                     last_30_days, month_to_date, ...
 *   ?range=custom&from=YYYY-MM-DD&to=   a chosen range
 *
 * So a reload, the back button and a link sent to a colleague all show the
 * same numbers. A preset is re-read against today on every load: "Last 30
 * days" bookmarked in March is the last 30 days when opened in May, and a
 * period the picker no longer offers opens on the last 30 days.
 *
 * There is no comparison here. The pages that use this compare with the
 * period just before, always, and an old ?compare= in a link is left alone.
 *
 * The address is written with history.replaceState, not the router: choosing
 * a period is not a navigation and must not re-run the page's server code.
 */
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { todayIn, type PresetId, type RangeValue, type Ymd } from "@/lib/date-range/range"
import { readPeriod, writePeriod } from "@/lib/date-range/params"

export { readPeriod, writePeriod }

export function usePeriodParams(timeZone: string, fallback: PresetId, firstDay?: Ymd) {
  const searchParams = useSearchParams()
  const today = todayIn(timeZone, Date.now())
  const [period, setPeriodState] = React.useState<RangeValue>(
    () => readPeriod(new URLSearchParams(searchParams.toString()), today, fallback, firstDay).period,
  )

  const setPeriod = React.useCallback(
    (p: RangeValue) => {
      setPeriodState(p)
      try {
        const url = new URL(window.location.href)
        writePeriod(url.searchParams, p, null, fallback)
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
      } catch {
        /* the address is a convenience; the page works without it */
      }
    },
    [fallback],
  )

  return { period, setPeriod, today }
}
