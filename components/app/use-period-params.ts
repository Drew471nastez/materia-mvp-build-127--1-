"use client"

/**
 * The period and comparison a page shows, kept in its address:
 *
 *   ?range=<preset>                     last_30_days, month_to_date, ...
 *   ?range=custom&from=YYYY-MM-DD&to=   a chosen range
 *   ?compare=none|previous_year         previous period when absent
 *   ?compare=custom&cfrom=&cto=
 *
 * So a reload, the back button and a link sent to a colleague all show the
 * same numbers. A preset is re-read against today on every load: "Last 30
 * days" bookmarked in March is the last 30 days when opened in May.
 *
 * The address is written with history.replaceState, not the router: choosing
 * a period is not a navigation and must not re-run the page's server code.
 */
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { todayIn, type CompareValue, type PresetId, type RangeValue, type Ymd } from "@/lib/date-range/range"
import { readPeriod, writePeriod } from "@/lib/date-range/params"

export { readPeriod, writePeriod }

export function usePeriodParams(timeZone: string, fallback: PresetId, firstDay?: Ymd) {
  const searchParams = useSearchParams()
  const today = todayIn(timeZone, Date.now())
  const initial = React.useMemo(
    () => readPeriod(new URLSearchParams(searchParams.toString()), today, fallback, firstDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [period, setPeriodState] = React.useState<RangeValue>(initial.period)
  const [compare, setCompareState] = React.useState<CompareValue>(initial.compare)

  const write = (p: RangeValue | null, c: CompareValue | null) => {
    try {
      const url = new URL(window.location.href)
      writePeriod(url.searchParams, p, c, fallback)
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    } catch {
      /* the address is a convenience; the page works without it */
    }
  }

  const setPeriod = React.useCallback((p: RangeValue) => {
    setPeriodState(p)
    write(p, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const setCompare = React.useCallback((c: CompareValue) => {
    setCompareState(c)
    write(null, c)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { period, setPeriod, compare, setCompare, today }
}
